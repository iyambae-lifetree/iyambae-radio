import { test } from 'node:test';
import assert from 'node:assert/strict';

import { speicherImArbeitsspeicher, TABELLE_KONTEN } from '../src/speicher.mjs';
import {
    erzeugeSitzung, pruefeSitzung, widerrufe, widerrufeAlle, raeumeKonto,
    baueSitzungsPlaetzchen, baueLoeschPlaetzchen, liesPlaetzchen,
    stosseAufraeumenAn, vergissAufraeumen, SITZUNGSDAUER_MS, abdruckVon,
    LEERLAUF_MS, FRISCH_MS, istFrisch,
} from '../src/sitzung.mjs';
import { starteTestdienst, meldeAn, fangeProtokoll } from './hilfe.mjs';

const KONTO = 'b'.repeat(32);

// ── Das Plaetzchen ──────────────────────────────────────────────────

test('das Plaetzchen traegt alle vier Schutzangaben', () => {
    const zeile = baueSitzungsPlaetzchen('abc', { unsicher: false });

    assert.match(zeile, /(^|; )HttpOnly(;|$)/, 'sonst kaeme JavaScript daran');
    assert.match(zeile, /(^|; )Secure(;|$)/, 'sonst ginge es auch ueber http');
    assert.match(zeile, /(^|; )SameSite=Lax(;|$)/);
    assert.match(zeile, /(^|; )Path=\/(;|$)/);
    assert.match(zeile, new RegExp('Max-Age=' + Math.floor(SITZUNGSDAUER_MS / 1000)));
});

test('SameSite ist Lax und NICHT Strict', () => {
    // Mit Strict schickt der Browser das Plaetzchen bei der Rueckkehr von
    // Google oder Apple nicht mit, und der Dienst sieht niemanden.
    assert.equal(baueSitzungsPlaetzchen('abc').includes('SameSite=Strict'), false);
});

test('das Loesch-Plaetzchen trifft dasselbe Plaetzchen', () => {
    const loeschen = baueLoeschPlaetzchen({ unsicher: false });
    assert.match(loeschen, /^hz_sitzung=;/);
    assert.match(loeschen, /Max-Age=0/);
    // Ein anderer Pfad loeschte ein anderes Plaetzchen, naemlich keines.
    assert.match(loeschen, /Path=\//);
});

test('aus vielen Plaetzchen wird das richtige gelesen', () => {
    assert.equal(liesPlaetzchen('hz_sprache=de; hz_sitzung=wert123; anderes=x'), 'wert123');
    assert.equal(liesPlaetzchen('hz_sprache=de'), null);
    assert.equal(liesPlaetzchen(''), null);
    assert.equal(liesPlaetzchen(undefined), null);
});

// ── Erzeugen, Pruefen, Widerrufen ───────────────────────────────────

test('nur der Abdruck steht in der Tabelle, nie der Wert', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { wert, abdruck } = await erzeugeSitzung(speicher, KONTO);

    const geheimnis = wert.split('.')[1];
    const zeile = await speicher.hole(TABELLE_KONTEN, KONTO, 'sitzung:' + abdruck);

    assert.equal(JSON.stringify(zeile).includes(geheimnis), false);
    assert.equal(zeile.abdruck, abdruckVon(geheimnis));
    assert.ok(geheimnis.length >= 43, '32 Bytes in base64url sind 43 Zeichen');
});

test('eine abgelaufene Sitzung gilt nicht und wird im Vorbeigehen geloescht', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        const jetzt = 1_800_000_000_000;
        const bleibt = await erzeugeSitzung(speicher, KONTO, jetzt);
        const { wert, abdruck } = await erzeugeSitzung(speicher, KONTO, jetzt);

        // Zwei Sitzungen, weil schon das Pruefen den Ablauf verschiebt
        // (gleitendes Fenster) — dieselbe zweimal zu pruefen, maesse das
        // Verschieben und nicht den Ablauf.
        assert.ok(await pruefeSitzung(speicher, bleibt.wert, jetzt + LEERLAUF_MS - 1));
        assert.equal(await pruefeSitzung(speicher, wert, jetzt + LEERLAUF_MS + 1), null);

        // Weg ist sie auch: Ein gueltiges Geheimnis, das niemand mehr
        // beobachtet, ist genau das, was nicht liegen bleiben soll.
        await assert.rejects(() => speicher.hole(TABELLE_KONTEN, KONTO, 'sitzung:' + abdruck));
    } finally {
        p.zurueck();
    }
});

// ── Leerlauf und Hoechstdauer (432hz-radio#40) ──────────────────────

const TAG = 24 * 60 * 60 * 1000;

test('die Fristen stehen im Rahmen aus #40', () => {
    // 30 bis 90 Tage gleitend, frisch heisst 10 bis 15 Minuten.
    assert.ok(LEERLAUF_MS >= 30 * TAG && LEERLAUF_MS <= 90 * TAG, 'Leerlauf ' + LEERLAUF_MS / TAG);
    assert.ok(LEERLAUF_MS < SITZUNGSDAUER_MS, 'sonst gleitet nichts');
    assert.ok(FRISCH_MS >= 10 * 60_000 && FRISCH_MS <= 15 * 60_000, 'frisch ' + FRISCH_MS / 60_000);
});

test('Leerlauf: wer nicht wiederkommt, ist nach LEERLAUF_MS abgemeldet, nicht erst nach einem Jahr', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        const jetzt = 1_800_000_000_000;
        const { wert, abdruck } = await erzeugeSitzung(speicher, KONTO, jetzt);
        const zeile = await speicher.hole(TABELLE_KONTEN, KONTO, 'sitzung:' + abdruck);
        assert.equal(zeile.ablauf, jetzt + LEERLAUF_MS, 'der Ablauf steht in der Zeile — darauf filtert das Aufraeumen');

        assert.equal(await pruefeSitzung(speicher, wert, jetzt + LEERLAUF_MS + TAG), null);
    } finally {
        p.zurueck();
    }
});

test('das Fenster gleitet: wer regelmaessig kommt, bleibt bis zur Hoechstdauer', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        const jetzt = 1_800_000_000_000;
        const { wert, abdruck } = await erzeugeSitzung(speicher, KONTO, jetzt);

        // Alle 30 Tage einmal vorbeischauen — jedes Mal weit ueber den
        // ersten Leerlauf hinaus, aber nie laenger als LEERLAUF_MS am Stueck.
        let t = jetzt;
        while (t + 30 * TAG < jetzt + SITZUNGSDAUER_MS) {
            t += 30 * TAG;
            assert.ok(await pruefeSitzung(speicher, wert, t), 'nach ' + (t - jetzt) / TAG + ' Tagen schon weg');
            await new Promise((f) => setImmediate(f));
        }

        // Die Hoechstdauer gilt trotzdem: Der Ablauf schiebt sich nie ueber
        // `angelegt + SITZUNGSDAUER_MS` hinaus — so lange lebt auch das
        // Plaetzchen im Browser.
        const zeile = await speicher.hole(TABELLE_KONTEN, KONTO, 'sitzung:' + abdruck);
        assert.ok(zeile.ablauf <= jetzt + SITZUNGSDAUER_MS);
        assert.equal(await pruefeSitzung(speicher, wert, jetzt + SITZUNGSDAUER_MS + 1), null);
    } finally {
        p.zurueck();
    }
});

test('eine Zeile von vor #40 (Ablauf nach einem Jahr) faellt nach dem Leerlauf trotzdem', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        const jetzt = 1_800_000_000_000;
        const { wert, abdruck } = await erzeugeSitzung(speicher, KONTO, jetzt);
        // So sah eine Zeile vorher aus: fester Ablauf nach 365 Tagen.
        const zeile = await speicher.hole(TABELLE_KONTEN, KONTO, 'sitzung:' + abdruck);
        const { etag: _weg, ...ohneEtag } = zeile;
        await speicher.setze(TABELLE_KONTEN, { ...ohneEtag, ablauf: jetzt + 365 * TAG });

        assert.equal(await pruefeSitzung(speicher, wert, jetzt + LEERLAUF_MS + 2 * TAG), null);
    } finally {
        p.zurueck();
    }
});

test('frisch ist eine Sitzung nur in den ersten FRISCH_MS nach der Anmeldung', async () => {
    const speicher = speicherImArbeitsspeicher();
    const jetzt = 1_800_000_000_000;
    const { wert } = await erzeugeSitzung(speicher, KONTO, jetzt);

    const stand = await pruefeSitzung(speicher, wert, jetzt + 60_000);
    assert.equal(stand.angemeldetAm, jetzt);
    assert.equal(istFrisch(stand, jetzt + FRISCH_MS - 1), true);
    assert.equal(istFrisch(stand, jetzt + FRISCH_MS + 1), false);
    // Weiterbenutzen macht nicht frisch — nur eine neue Anmeldung.
    const spaeter = await pruefeSitzung(speicher, wert, jetzt + 2 * TAG);
    assert.equal(istFrisch(spaeter, jetzt + 2 * TAG), false);
    assert.equal(istFrisch(null, jetzt), false);
});

test('erfundene und verstuemmelte Plaetzchen fallen durch', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { wert } = await erzeugeSitzung(speicher, KONTO);

    for (const unsinn of [null, '', 'ohnepunkt', '.nurpunkt', KONTO + '.zukurz',
        KONTO + '.' + 'x'.repeat(43), 'GROSS'.repeat(7) + '.abc']) {
        assert.equal(await pruefeSitzung(speicher, unsinn), null, 'durchgelassen: ' + unsinn);
    }
    assert.ok(await pruefeSitzung(speicher, wert));
});

test('widerrufeAlle laesst genau eine Sitzung stehen', async () => {
    const speicher = speicherImArbeitsspeicher();
    const eine = await erzeugeSitzung(speicher, KONTO);
    const zwei = await erzeugeSitzung(speicher, KONTO);
    await erzeugeSitzung(speicher, KONTO);

    assert.equal(await widerrufeAlle(speicher, KONTO, { ausser: eine.abdruck }), 2);

    assert.ok(await pruefeSitzung(speicher, eine.wert));
    assert.equal(await pruefeSitzung(speicher, zwei.wert), null);
});

test('Aufraeumen nimmt Abgelaufenes und laesst Gueltiges liegen', async () => {
    const speicher = speicherImArbeitsspeicher();
    const jetzt = 1_800_000_000_000;

    const alt = await erzeugeSitzung(speicher, KONTO, jetzt - SITZUNGSDAUER_MS - 1000);
    const neu = await erzeugeSitzung(speicher, KONTO, jetzt);
    await speicher.setze(TABELLE_KONTEN,
        { partitionKey: KONTO, rowKey: 'code:anmeldung', ablauf: jetzt - 1, abdruck: 'x' });

    assert.equal(await raeumeKonto(speicher, KONTO, jetzt), 2);

    await assert.rejects(() => speicher.hole(TABELLE_KONTEN, KONTO, 'sitzung:' + alt.abdruck));
    assert.ok(await speicher.hole(TABELLE_KONTEN, KONTO, 'sitzung:' + neu.abdruck));
});

test('der grosse Durchgang laeuft hoechstens einmal in 24 Stunden', async () => {
    const speicher = speicherImArbeitsspeicher();
    vergissAufraeumen();

    // Zwischen den Anstoessen muss die Schleife drankommen: Solange der
    // vorige Durchgang noch laeuft, lehnt `stosseAufraeumenAn` ohnehin ab —
    // auch das ist eine Zusicherung, nur eine andere.
    const atemzug = () => new Promise((f) => setTimeout(f, 5));

    // Der erste Durchgang faellt sofort an: `letzterDurchgang` steht auf 0,
    // und alles ist laenger her als 24 Stunden.
    const start = 200 * 3600_000;
    assert.equal(stosseAufraeumenAn(speicher, start), true);
    assert.equal(stosseAufraeumenAn(speicher, start + 1), false, 'zwei Durchgaenge gleichzeitig');
    await atemzug();

    assert.equal(stosseAufraeumenAn(speicher, start + 1), false, 'ein zweiter Durchgang gleich danach');
    assert.equal(stosseAufraeumenAn(speicher, start + 23 * 3600_000), false);
    assert.equal(stosseAufraeumenAn(speicher, start + 25 * 3600_000), true);
    await atemzug();

    vergissAufraeumen();
});

// ── Am Endpunkt ─────────────────────────────────────────────────────

test('Abmelden loescht die ZEILE, nicht nur das Plaetzchen', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        await meldeAn(d, 'jemand@example.org');
        const geklaut = d.holePlaetzchen();

        await d.rufe('POST', '/api/abmelden');

        // Der Angreifer hat den Wert kopiert, bevor abgemeldet wurde.
        d.setzePlaetzchen(geklaut);
        const antwort = await d.rufe('GET', '/api/konto');
        assert.deepEqual(antwort.daten, { angemeldet: false },
            'ein kopiertes Plaetzchen darf nach dem Abmelden nichts mehr wert sein');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('Passwort setzen beendet die anderen Sitzungen, nicht die eigene', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        await meldeAn(d, 'jemand@example.org');
        const erste = d.holePlaetzchen();

        // Zweites Geraet.
        await meldeAn(d, 'jemand@example.org');
        const zweite = d.holePlaetzchen();

        const antwort = await d.rufe('POST', '/api/passwort/setzen',
            { passwort: 'ein ausreichend langes passwort' });
        assert.equal(antwort.status, 204);

        // Die eigene gilt weiter.
        d.setzePlaetzchen(zweite);
        assert.equal((await d.rufe('GET', '/api/konto')).daten.angemeldet, true);

        // Die andere nicht.
        d.setzePlaetzchen(erste);
        assert.equal((await d.rufe('GET', '/api/konto')).daten.angemeldet, false);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('ohne Sitzung gibt es keine Merkliste', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        for (const [verfahren, pfad] of [
            ['GET', '/api/platten'],
            ['POST', '/api/platten/abgleich'],
            ['POST', '/api/verlauf/abgleich'],
            ['GET', '/api/konto/ausfuhr'],
            ['DELETE', '/api/konto'],
            ['POST', '/api/passwort/setzen'],
        ]) {
            const antwort = await d.rufe(verfahren, pfad, verfahren === 'GET' ? undefined : {});
            assert.equal(antwort.status, 401, verfahren + ' ' + pfad + ' war offen');
        }
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('ein fremder Origin kommt an keinen schreibenden Endpunkt', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        await meldeAn(d, 'jemand@example.org');
        const antwort = await d.rufe('POST', '/api/abmelden', {},
            { kopf: { Origin: 'https://boeser-nachbar.example' } });
        assert.equal(antwort.status, 403);
        assert.equal(antwort.daten.fehler, 'herkunft_fremd');

        const ohne = await d.rufe('POST', '/api/abmelden', {}, { kopf: { Origin: undefined } });
        assert.equal(ohne.status, 403);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('Konto loeschen nimmt alles mit, auch den Verweis', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        await meldeAn(d, 'weg@example.org');
        await d.rufe('POST', '/api/platten/abgleich', { stand: 0, eintraege: { 'nts-1': { a: 5, e: null } } });

        assert.equal((await d.rufe('DELETE', '/api/konto', {})).status, 400, 'ohne Bestaetigung');
        assert.equal((await d.rufe('DELETE', '/api/konto', { bestaetigung: 'loeschen' })).status, 204);

        let zeilen = 0;
        for await (const _ of d.speicher.listeAlle('konten')) zeilen++;
        for await (const _ of d.speicher.listeAlle('verweise')) zeilen++;
        assert.equal(zeilen, 0, 'es ist etwas liegengeblieben');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('die Ausfuhr enthaelt die Daten, aber keine Geheimnisse', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        await meldeAn(d, 'auskunft@example.org');
        await d.rufe('POST', '/api/passwort/setzen', { passwort: 'ein ausreichend langes passwort' });
        await d.rufe('POST', '/api/platten/abgleich', { stand: 0, eintraege: { 'nts-1': { a: 5, e: null } } });

        const antwort = await d.rufe('GET', '/api/konto/ausfuhr');
        assert.equal(antwort.status, 200);
        assert.match(antwort.kopf.get('content-disposition'), /attachment/);

        const alsText = JSON.stringify(antwort.daten);
        assert.ok(alsText.includes('auskunft@example.org'), 'die eigene Adresse gehoert in die Auskunft');
        assert.ok(alsText.includes('nts-1'), 'die Merkliste auch');
        assert.equal(alsText.includes('$argon2'), false, 'der Passwort-Hash nicht');
        assert.equal(alsText.includes('abdruck'), false, 'Sitzungsabdruecke auch nicht');

        // Die Merkliste als Struktur, nicht als Zeichenkette in einer Zeichenkette.
        const platten = antwort.daten.zeilen.find((z) => z.rowKey === 'platten');
        assert.equal(typeof platten.eintraege, 'object');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});
