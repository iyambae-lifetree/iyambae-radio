/*
  Mikeschs Schnurrpost — doppelte Bestaetigung.

  Die drei Dinge, auf die es ankommt: Ohne Klick ist niemand dabei; von
  aussen ist nicht zu erkennen, ob eine Adresse auf der Liste steht; und
  wer sich abmeldet, ist ganz weg.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TABELLE_RUNDBRIEF, speicherImArbeitsspeicher } from '../src/speicher.mjs';
import {
    saeubereAnmeldung, meldeAn, bestaetige, meldeAb, raeumeAuf, bestaetigteLeser,
    abmeldeVerweis, rundbriefAbdruck, OFFEN_TAGE, BESTAETIGEN_STUNDEN,
} from '../src/rundbrief.mjs';
import { starteTestdienst, fangeProtokoll } from './hilfe.mjs';

const ANMELDUNG = { mail: 'Leser@Example.org', sprache: 'fr', einwilligung: true };

async function alle(speicher) {
    const raus = [];
    for await (const z of speicher.listeAlle(TABELLE_RUNDBRIEF)) raus.push(z);
    return raus;
}

test('Anmeldung: ohne Haekchen, ohne Adresse oder mit Unsinn — nichts', () => {
    assert.equal(saeubereAnmeldung({ ...ANMELDUNG, einwilligung: 'true' }), null);
    assert.equal(saeubereAnmeldung({ ...ANMELDUNG, einwilligung: undefined }), null);
    assert.equal(saeubereAnmeldung({ ...ANMELDUNG, mail: 'hallo' }), null);
    assert.deepEqual(saeubereAnmeldung(ANMELDUNG), { mail: 'leser@example.org', sprache: 'fr' });
    assert.equal(saeubereAnmeldung({ ...ANMELDUNG, sprache: 'xx' }).sprache, 'de');
});

test('Ablauf: anmelden, bestaetigen, abmelden', async () => {
    const s = speicherImArbeitsspeicher();
    const a = saeubereAnmeldung(ANMELDUNG);
    const marke = await meldeAn(s, a, 1000);
    assert.match(marke, /^[0-9a-f]{32}\.[A-Za-z0-9_-]{32}$/);

    const [offen] = await alle(s);
    assert.equal(offen.zustand, 'offen');
    assert.ok(!JSON.stringify(offen).includes(marke.split('.')[1]), 'nur der Abdruck der Marke liegt in der Tabelle');
    assert.equal((await bestaetigteLeser(s)).length, 0);

    assert.equal(await bestaetige(s, marke.slice(0, -1) + 'x', 2000), 'ungueltig');
    assert.equal(await bestaetige(s, marke, 2000), 'ok');
    assert.equal(await bestaetige(s, marke, 3000), 'schon');
    // Kein Orakel: Der Abdruck allein laesst sich aus der Adresse rechnen.
    assert.equal(await bestaetige(s, rundbriefAbdruck('leser@example.org') + '.' + 'A'.repeat(32), 3000), 'ungueltig');

    const [leser] = await bestaetigteLeser(s);
    assert.equal(leser.mail, 'leser@example.org');
    assert.equal(leser.bestaetigt_am, 2000);
    assert.ok(leser.fassung);

    // Schon dabei: keine zweite Mail.
    assert.equal(await meldeAn(s, a, 10_000_000), null);

    const ab = abmeldeVerweis('https://iyambae.fm', leser);
    assert.match(ab, /^https:\/\/iyambae\.fm\/fr\/#schnurrpost-ab=/);
    const abMarke = ab.split('=')[1];
    assert.equal(await meldeAb(s, abMarke.slice(0, 33) + 'A'.repeat(32)), 'ungueltig');
    assert.equal(await meldeAb(s, abMarke), 'ok');
    assert.equal((await alle(s)).length, 0);
});

test('Ablauf: Link abgelaufen, Ruhezeit, Aufraeumen nach sieben Tagen', async () => {
    const s = speicherImArbeitsspeicher();
    const a = saeubereAnmeldung(ANMELDUNG);
    const marke = await meldeAn(s, a, 0);
    assert.equal(await meldeAn(s, a, 60_000), null, 'innerhalb der Ruhezeit keine zweite Mail');
    assert.equal(await bestaetige(s, marke, BESTAETIGEN_STUNDEN * 3_600_000 + 1), 'abgelaufen');

    assert.equal(await raeumeAuf(s, OFFEN_TAGE * 86_400_000 - 1), 0);
    assert.equal(await raeumeAuf(s, OFFEN_TAGE * 86_400_000 + 1), 1);
    assert.equal((await alle(s)).length, 0);
});

test('HTTP: immer 204, eine Mail mit Link im Fragment, nichts im Protokoll', async () => {
    const protokoll = fangeProtokoll();
    const dienst = await starteTestdienst();
    try {
        const r = await dienst.rufe('POST', '/api/rundbrief/anmelden', ANMELDUNG);
        assert.equal(r.status, 204);
        assert.equal(dienst.mails.length, 1);
        const mail = dienst.mails[0];
        assert.equal(mail.art, 'rundbrief');
        assert.equal(mail.sprache, 'fr');
        assert.match(mail.verweis, /^https:\/\/iyambae\.fm\/fr\/#schnurrpost=[0-9a-f]{32}\./);

        // Bestaetigt: eine zweite Anmeldung antwortet gleich, schickt aber nichts.
        const marke = mail.verweis.split('#schnurrpost=')[1];
        assert.equal((await dienst.rufe('POST', '/api/rundbrief/bestaetigen', { marke })).status, 204);
        assert.equal((await dienst.rufe('POST', '/api/rundbrief/anmelden', ANMELDUNG)).status, 204);
        assert.equal(dienst.mails.length, 1);

        assert.equal((await dienst.rufe('POST', '/api/rundbrief/bestaetigen', { marke: 'x' })).status, 404);
        assert.equal((await dienst.rufe('POST', '/api/rundbrief/abmelden', { marke: 'x' })).status, 404);
        assert.equal((await dienst.rufe('POST', '/api/rundbrief/anmelden', { mail: 'a@b.de' })).status, 400);

        const text = JSON.stringify(protokoll.zeilen);
        assert.ok(!text.toLowerCase().includes('leser@example.org'));
        assert.ok(!text.includes(rundbriefAbdruck('leser@example.org')));
    } finally {
        protokoll.zurueck();
        await dienst.schliesse();
    }
});

test('HTTP: hoechstens drei Anmeldungen je Adresse am Tag', async () => {
    const dienst = await starteTestdienst();
    try {
        const kopf = (i) => ({ kopf: { 'X-Forwarded-For': '10.0.' + i + '.1' } });
        const status = [];
        for (let i = 0; i < 4; i++) status.push((await dienst.rufe('POST', '/api/rundbrief/anmelden', ANMELDUNG, kopf(i))).status);
        assert.deepEqual(status, [204, 204, 204, 429]);
    } finally {
        await dienst.schliesse();
    }
});
