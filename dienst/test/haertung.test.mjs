/*
  Kleine Haertungen aus der Pruefung vom 01.10.2026 (432hz-radio#46).

  Jede steht fuer sich und hat ihren eigenen Test hier, statt verstreut in
  den Dateien der Module, die sie beruehren: So sieht man an einer Stelle,
  was der Befund war und dass er gilt.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeVersender } from '../src/mail.mjs';
import { saeubereFreitext } from '../src/umfrage.mjs';
import { adresseSiehtEchtAus, erzeugeSpeicher } from '../src/speicher.mjs';

// ── Punkt 1: Sprachwahl in Mails ────────────────────────────────────

test('eine Sprache wie __proto__ ergibt die englische Mail, keinen TypeError', async () => {
    for (const sprache of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
        const gesendet = new Promise((fertig) => {
            const versender = erzeugeVersender({ versendeRoh: async (mail) => { fertig(mail); } });
            versender.reiheEin({ art: 'code', an: 'a@example.org', code: '123456', minuten: 15, sprache });
        });
        // Mit Zeitgrenze: Vor der Berichtigung warf `texte()` und die Mail
        // kam nie an — der Test soll dann scheitern, nicht haengen.
        const mail = await Promise.race([gesendet, new Promise((_, nein) =>
            setTimeout(() => nein(new Error('keine Mail fuer ' + sprache)), 2000).unref())]);
        assert.match(mail.subject, /code/i, sprache);
        assert.match(mail.plainText, /123456/, sprache);
    }
});

// ── Punkt 2: Freitext in linearer Zeit ──────────────────────────────

test('langer Freitext ohne Leerraum blockiert den Event-Loop nicht', () => {
    for (const text of ['a'.repeat(4000), 'a'.repeat(3990) + '@', 'a@'.repeat(2000), 'a1'.repeat(2000)]) {
        // Das Kleinste aus fuenf Laeufen: Unter der Last der uebrigen Tests
        // schwankt ein einzelner Lauf, das Minimum misst den Code.
        let ms = Infinity;
        for (let i = 0; i < 5; i++) {
            const beginn = process.hrtime.bigint();
            saeubereFreitext(text);
            ms = Math.min(ms, Number(process.hrtime.bigint() - beginn) / 1e6);
        }
        assert.ok(ms < 20, `${ms.toFixed(1)} ms fuer ${text.slice(0, 6)}…`);
    }
});

test('der Freitext entfernt weiter Adressen und Geheimnisse, und nur sie', () => {
    assert.equal(saeubereFreitext('schreib an hallo@example.org bitte'),
        'schreib an entfernt:adresse bitte');
    assert.equal(saeubereFreitext('mein schluessel ist zufall7Hq2Lw9Xa4Mb8Rt3Yp6'),
        'mein schluessel ist entfernt:geheimnis');
    assert.equal(saeubereFreitext('Fuenfundzwanzigbuchstabenwort ohne Ziffer'),
        'Fuenfundzwanzigbuchstabenwort ohne Ziffer');
    assert.equal(saeubereFreitext('432 Hz klingt waermer'), '432 Hz klingt waermer');
});

// ── Punkt 6: Speicherwahl scheitert geschlossen ─────────────────────

test('im Container ohne Tabellenendpunkt bricht der Speicher ab, statt still im Arbeitsspeicher zu laufen', async () => {
    await assert.rejects(erzeugeSpeicher({ CONTAINER_APP_NAME: 'ca-iyambae-web' }), /TABELLEN_ENDPUNKT/);
    await assert.rejects(erzeugeSpeicher({ NODE_ENV: 'production' }), /TABELLEN_ENDPUNKT/);
    const oertlich = await erzeugeSpeicher({});
    assert.equal(oertlich.art, 'arbeitsspeicher');
});

// ── Punkt 7: Adressmuster ───────────────────────────────────────────

test('Trenn- und Klammerzeichen im lokalen Teil sind keine Adresse', () => {
    for (const mail of ['a,b@x.de', 'a;b@x.de', '"a"@x.de', 'a<b@x.de', 'a>b@x.de',
        'a(b)@x.de', 'a\b@x.de', 'a:b@x.de', 'a@b,c.de', 'a@b;c.de', 'a@b>c.de']) {
        assert.equal(adresseSiehtEchtAus(mail), false, mail);
    }
    for (const mail of ['vor.name+tag@example.org', "o'brien@example.ie", 'a_b-c@sub.example.co.uk',
        'name@münchen.de']) {
        assert.equal(adresseSiehtEchtAus(mail), true, mail);
    }
});
