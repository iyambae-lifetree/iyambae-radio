/*
  Kann ein Angreifer herausfinden, ob eine Adresse ein Konto hat?

  Das ist die Frage, an der ein Anmeldedienst am haeufigsten scheitert, und
  sie hat zwei Haelften. Die erste — sagt die Antwort es? — prueft man
  leicht. Die zweite — sagt es die DAUER? — prueft fast niemand, und genau
  dort steckt der Fehler dann.

  Beide Haelften stehen hier.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { starteTestdienst, meldeAn, median, fangeProtokoll } from './hilfe.mjs';

const OHNE_DROSSEL = { pruefe: () => ({ ok: true }), groesse: () => 0 };

test('/api/anmelden antwortet fuer bekannt und unbekannt gleich', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst({ drossel: OHNE_DROSSEL });
    try {
        await meldeAn(d, 'bekannt@example.org');
        await d.rufe('POST', '/api/abmelden');
        d.mails.length = 0;

        const bekannt = await d.rufe('POST', '/api/anmelden', { mail: 'bekannt@example.org' });
        const unbekannt = await d.rufe('POST', '/api/anmelden', { mail: 'niemals@example.org' });

        assert.equal(bekannt.status, 204);
        assert.equal(unbekannt.status, 204);
        assert.equal(bekannt.daten, null);
        assert.equal(unbekannt.daten, null);

        // Und beide Male geht wirklich eine Mail hinaus. Bliebe sie im einen
        // Fall aus, waere das Ausbleiben die Antwort.
        assert.equal(d.mails.length, 2);
        assert.equal(d.mails[0].art, 'code');
        assert.equal(d.mails[1].art, 'code');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('eine unbekannte Adresse legt KEIN Konto an', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst({ drossel: OHNE_DROSSEL });
    try {
        for (let i = 0; i < 20; i++) {
            await d.rufe('POST', '/api/anmelden', { mail: 'probe' + i + '@example.org' });
        }
        assert.equal(p.zeilen.filter((z) => z.art === 'konto.angelegt').length, 0);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('/api/passwort/vergessen antwortet fuer bekannt und unbekannt gleich', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst({ drossel: OHNE_DROSSEL });
    try {
        await meldeAn(d, 'bekannt@example.org');
        await d.rufe('POST', '/api/abmelden');
        d.mails.length = 0;

        const bekannt = await d.rufe('POST', '/api/passwort/vergessen', { mail: 'bekannt@example.org' });
        const unbekannt = await d.rufe('POST', '/api/passwort/vergessen', { mail: 'niemals@example.org' });

        assert.equal(bekannt.status, 204);
        assert.equal(unbekannt.status, 204);
        assert.equal(d.mails.length, 2, 'auch an eine Adresse ohne Konto geht eine Mail');
        assert.equal(d.mails[0].art, 'marke');
        assert.equal(d.mails[1].art, 'unbekannt');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('eine echte Marke ohne Konto endet in 410, nicht in einem Konto', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst({ drossel: OHNE_DROSSEL });
    try {
        await d.rufe('POST', '/api/passwort/vergessen', { mail: 'niemals@example.org' });
        const marke = decodeURIComponent(d.mails.at(-1).verweis.split('marke=')[1]);

        const antwort = await d.rufe('POST', '/api/passwort/neu',
            { marke, passwort: 'ein ganz neues passwort' });

        assert.equal(antwort.status, 410);
        assert.equal(antwort.daten.grund, 'kein_konto');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('/api/anmelden/passwort: bekannt und unbekannt sind auch zeitlich nicht zu trennen', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst({ drossel: OHNE_DROSSEL });
    try {
        await meldeAn(d, 'bekannt@example.org');
        await d.rufe('POST', '/api/passwort/setzen', { passwort: 'ein hinreichend langes passwort' });
        await d.rufe('POST', '/api/abmelden');

        const messe = async (mail) => {
            const antwort = await d.rufe('POST', '/api/anmelden/passwort',
                { mail, passwort: 'falsches passwort aber lang genug' }, { merkePlaetzchen: false });
            assert.equal(antwort.status, 401);
            assert.deepEqual(antwort.daten, { fehler: 'anmeldung_fehlgeschlagen' });
            return antwort.dauerMs;
        };

        // Einmal warmlaufen: Der erste Aufruf zahlt Verbindungsaufbau und
        // die erste Uebersetzung des Codes. Wer den mitmisst, misst Node.
        await messe('bekannt@example.org');
        await messe('gibtesnicht@example.org');

        const mitKonto = [];
        const ohneKonto = [];
        for (let i = 0; i < 8; i++) {
            mitKonto.push(await messe('bekannt@example.org'));
            ohneKonto.push(await messe('gibtesnicht' + i + '@example.org'));
        }

        const unterschied = Math.abs(median(mitKonto) - median(ohneKonto));
        /*
          Der Zeitboden quantisiert auf Vielfache von 250 ms. Ein
          Unterschied, der ueberhaupt etwas verriete, muesste eine ganze
          Stufe betragen. 40 ms Toleranz decken das Rauschen einer
          Testmaschine ab und liegen weit unter einer Stufe.
        */
        assert.ok(unterschied < 40,
            'Unterschied ' + unterschied.toFixed(1) + ' ms: mit Konto '
            + median(mitKonto).toFixed(1) + ', ohne ' + median(ohneKonto).toFixed(1));
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('ein falscher Code sieht aus wie ein fehlender', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst({ drossel: OHNE_DROSSEL });
    try {
        await d.rufe('POST', '/api/anmelden', { mail: 'jemand@example.org' });

        const falsch = await d.rufe('POST', '/api/anmelden/code',
            { mail: 'jemand@example.org', code: '000000' });
        const garkeiner = await d.rufe('POST', '/api/anmelden/code',
            { mail: 'niemand@example.org', code: '000000' });

        assert.equal(falsch.status, 401);
        assert.equal(garkeiner.status, 401);
        assert.equal(falsch.daten.fehler, 'anmeldung' in falsch.daten ? undefined : 'code_ungueltig');
        assert.equal(garkeiner.daten.fehler, 'code_ungueltig');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('das Protokoll einer gescheiterten Anmeldung enthaelt keine Adresse', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst({ drossel: OHNE_DROSSEL });
    try {
        await d.rufe('POST', '/api/anmelden', { mail: 'verraeterisch@example.org' });
        await d.rufe('POST', '/api/anmelden/code', { mail: 'verraeterisch@example.org', code: '000000' });
        await d.rufe('POST', '/api/anmelden/passwort',
            { mail: 'verraeterisch@example.org', passwort: 'geheimes langes passwort' });

        const alsText = JSON.stringify(p.zeilen);
        for (const verboten of ['verraeterisch', 'example.org', '@', 'geheimes langes passwort']) {
            assert.equal(alsText.includes(verboten), false, 'im Protokoll steht: ' + verboten);
        }
        assert.ok(p.zeilen.some((z) => z.art === 'anmeldung.code' && z.ergebnis === 'abgelehnt'));
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});
