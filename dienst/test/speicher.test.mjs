/*
  Nebenlaeufigkeit und Ausfall.

  Beides laesst sich schlecht beobachten und gut testen, und beides ist der
  Grund, warum eine Merkliste eines Tages leer ist, ohne dass jemand etwas
  geloescht hat.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    speicherImArbeitsspeicher, mitEtag, SpeicherFehler,
    TABELLE_KONTEN, TABELLE_VERWEISE,
    normalisiereAdresse, adresseSiehtEchtAus, holeOderLegeKontoAn, loescheKonto,
} from '../src/speicher.mjs';
import { starteTestdienst, meldeAn, fangeProtokoll } from './hilfe.mjs';

const KONTO = 'c'.repeat(32);

test('zwei gleichzeitige Schreiber verlieren einander nicht', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        // Beide zaehlen dieselbe Zeile hoch. Ohne If-Match stuende am Ende
        // eine Eins statt einer Zwei — der zweite haette den ersten
        // ueberbuegelt.
        await Promise.all([
            mitEtag(speicher, TABELLE_KONTEN, KONTO, 'zaehler', (z) => ({ ...z, n: (z.n ?? 0) + 1 })),
            mitEtag(speicher, TABELLE_KONTEN, KONTO, 'zaehler', (z) => ({ ...z, n: (z.n ?? 0) + 1 })),
        ]);
        assert.equal((await speicher.hole(TABELLE_KONTEN, KONTO, 'zaehler')).n, 2);
    } finally {
        p.zurueck();
    }
});

test('nach drei Kollisionen kommt konflikt, keine Endlosschleife', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        // Ein Verschmelzer, der bei jedem Durchgang einen fremden Schreiber
        // dazwischenschiebt. So kollidiert es garantiert immer.
        const stoerend = async (zeile) => {
            await speicher.setze(TABELLE_KONTEN,
                { partitionKey: KONTO, rowKey: 'umkaempft', n: Math.random() });
            return { ...zeile, n: 1 };
        };

        await assert.rejects(
            () => mitEtag(speicher, TABELLE_KONTEN, KONTO, 'umkaempft', stoerend),
            (fehler) => {
                assert.ok(fehler instanceof SpeicherFehler);
                assert.equal(fehler.art, 'konflikt');
                return true;
            });

        assert.ok(p.zeilen.some((z) => z.art === 'tabellen.konflikt'));
    } finally {
        p.zurueck();
    }
});

test('gibt der Verschmelzer null zurueck, wird nichts geschrieben', async () => {
    const speicher = speicherImArbeitsspeicher();
    const ergebnis = await mitEtag(speicher, TABELLE_KONTEN, KONTO, 'nix', () => null);

    assert.equal(ergebnis.geschrieben, false);
    await assert.rejects(() => speicher.hole(TABELLE_KONTEN, KONTO, 'nix'));
});

test('ein Wettlauf beim Anlegen erzeugt EIN Konto, nicht zwei', async () => {
    const p = fangeProtokoll();
    const speicher = speicherImArbeitsspeicher();
    try {
        const ergebnisse = await Promise.all(
            Array.from({ length: 5 }, () => holeOderLegeKontoAn(speicher, 'gleichzeitig@example.org')));

        const kennungen = new Set(ergebnisse.map((e) => e.kontoId));
        assert.equal(kennungen.size, 1, 'es sind ' + kennungen.size + ' Partitionen entstanden');
        assert.equal(ergebnisse.filter((e) => e.neu).length, 1, 'genau einer darf "neu" sein');
    } finally {
        p.zurueck();
    }
});

test('Adressen werden normalisiert, bevor sie ein Konto finden', async () => {
    assert.equal(normalisiereAdresse('  Anna@Example.ORG '), 'anna@example.org');

    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        const eins = await holeOderLegeKontoAn(speicher, 'Anna@Example.ORG');
        const zwei = await holeOderLegeKontoAn(speicher, 'anna@example.org');
        assert.equal(eins.kontoId, zwei.kontoId, 'sonst haette jemand zwei Konten');
        assert.equal(zwei.neu, false);
    } finally {
        p.zurueck();
    }
});

test('offensichtlicher Unsinn ist keine Adresse', () => {
    for (const gut of ['a@b.de', 'lange.adresse+markierung@sub.example.org']) {
        assert.equal(adresseSiehtEchtAus(gut), true, gut);
    }
    for (const schlecht of ['hallo', 'a@b', '@b.de', 'a b@c.de', '', 'a@'.repeat(50) + 'b.de']) {
        assert.equal(adresseSiehtEchtAus(schlecht), false, schlecht);
    }
});

// ── Wenn Table Storage nicht antwortet ──────────────────────────────

test('faellt der Tabellendienst aus, kommt 503 mit Retry-After — nicht 200 mit leer', async () => {
    /*
      DIE SCHLIMMSTE ALLER ANTWORTEN waere hier eine leere Merkliste mit
      Status 200: Der Browser hielte sie fuer die Wahrheit und schriebe sie
      beim naechsten Abgleich zurueck. Aus einem Ausfall von zwei Minuten
      wuerde ein dauerhafter Datenverlust.
    */
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        await meldeAn(d, 'jemand@example.org');
        d.speicher.stoere(new Error('Tabellendienst weg'));

        for (const [verfahren, pfad] of [['GET', '/api/platten'], ['POST', '/api/platten/abgleich']]) {
            const antwort = await d.rufe(verfahren, pfad, verfahren === 'GET' ? undefined : { stand: 0, eintraege: {} });
            assert.equal(antwort.status, 503, verfahren + ' ' + pfad);
            assert.equal(antwort.daten.fehler, 'speicher_nicht_erreichbar');
            assert.equal(antwort.kopf.get('retry-after'), '5');
        }

        // Und eine Sitzung wird bei einem Ausfall nicht als ungueltig
        // ausgelegt: Wer abgemeldet wuerde, weil eine Tabelle klemmt,
        // verlaere seine Sitzung fuer einen Fehler, den er nicht gemacht hat.
        const konto = await d.rufe('GET', '/api/konto');
        assert.equal(konto.status, 503);

        d.speicher.stoere(null);
        assert.equal((await d.rufe('GET', '/api/konto')).daten.angemeldet, true);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('das Lebenszeichen antwortet auch, wenn der Tabellendienst weg ist', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        d.speicher.stoere(new Error('weg'));
        const antwort = await d.rufe('GET', '/api/leben');
        assert.equal(antwort.status, 204);
        // Und es hinterlaesst keine Protokollzeile.
        assert.equal(p.zeilen.length, 0);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

// ── Grenzen der Anfrage ─────────────────────────────────────────────

test('ein zu grosser Rumpf wird abgebrochen, nicht verarbeitet', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const riesig = {};
        for (let i = 0; i < 5000; i++) riesig['sender-nummer-' + i] = { a: 1_700_000_000_000, e: null };

        const antwort = await d.rufe('POST', '/api/platten/abgleich', { stand: 0, eintraege: riesig });
        assert.equal(antwort.status, 413);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('kaputtes JSON gibt 400, keinen Absturz', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const antwort = await fetch(d.basis + '/api/anmelden', {
            method: 'POST',
            headers: { Origin: 'https://iyambae.fm', 'Content-Type': 'application/json' },
            body: '{kein json',
        });
        assert.equal(antwort.status, 400);
        assert.equal((await antwort.json()).fehler, 'kein_json');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('unbekannte Pfade bleiben fuer andere frei', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        // Diese Pfade baut jemand anders. Ein 404 beansprucht nichts.
        for (const pfad of ['/api/passkey/anfang', '/api/google/rueckkehr', '/api/gibtsnicht']) {
            const antwort = await d.rufe('GET', pfad);
            assert.equal(antwort.status, 404);
            assert.equal(antwort.daten.fehler, 'unbekannter_pfad');
        }
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('jede Antwort traegt no-store und nosniff', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const antwort = await d.rufe('GET', '/api/konto');
        assert.equal(antwort.kopf.get('cache-control'), 'no-store');
        assert.equal(antwort.kopf.get('x-content-type-options'), 'nosniff');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});
