/*
  Inaktive Konten: Warnung nach 702 Tagen, Loeschung nach 730
  (Entscheidung Micha, 03.11.2026; 432hz-radio#49).

  Die Zeit wird hineingegeben, nicht abgewartet. Angemeldet wird ueber den
  echten Weg (`meldeAn` gegen den laufenden Dienst), damit der Test auch
  prueft, dass eine Anmeldung `letzteAnmeldung` wirklich setzt — und nicht
  nur, dass die Rechnung stimmt, wenn jemand das Feld von Hand eintraegt.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    speicherImArbeitsspeicher, TABELLE_KONTEN, TABELLE_VERWEISE,
    findeKonto, holeOderNichts, kennungAbdruck, legeKontoAn,
} from '../src/speicher.mjs';
import { erzeugeSitzung, stosseAufraeumenAn, vergissAufraeumen } from '../src/sitzung.mjs';
import { pruefeInaktiveKonten, INAKTIV_MS, WARNUNG_MS, STICHTAG } from '../src/inaktiv.mjs';
import { erzeugeVersender } from '../src/mail.mjs';
import { starteTestdienst, meldeAn, fangeProtokoll } from './hilfe.mjs';

const TAG = 24 * 60 * 60 * 1000;
const SEITE = 'https://iyambae.fm';
const ADRESSE = 'lange-still@example.org';

function sammler() {
    const mails = [];
    return { mails, reiheEin: (auftrag) => { mails.push(auftrag); return true; } };
}

/** Meldet sich ueber HTTP an und gibt kontoId und den Anmeldezeitpunkt zurueck. */
async function angemeldet(d, adresse = ADRESSE) {
    const vorher = Date.now();
    const kontoId = await meldeAn(d, adresse);
    return { kontoId, t: vorher };
}

async function partitionLeer(speicher, kontoId) {
    for await (const _ of speicher.liste(TABELLE_KONTEN, kontoId)) return false;
    return true;
}

test('die Vorgaben sind die entschiedenen: 730 Tage, Warnung 28 Tage vorher', () => {
    assert.equal(INAKTIV_MS, 730 * TAG);
    assert.equal(WARNUNG_MS, 28 * TAG);
});

test('die Anmeldung schreibt das Datum der letzten Anmeldung ins Konto', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const { kontoId } = await angemeldet(d);
        const konto = await d.speicher.hole(TABELLE_KONTEN, kontoId, 'konto');
        // Nur das Datum. Eine Uhrzeit waere ein Bewegungsprofil.
        assert.equal(konto.letzteAnmeldung, new Date().toISOString().slice(0, 10));
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('Warnung nach 702 Tagen — nicht vorher, und nur einmal', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const { kontoId, t } = await angemeldet(d);
        const post = sammler();
        const lauf = (tage) => pruefeInaktiveKonten(d.speicher, { versender: post, seite: SEITE, jetzt: t + tage * TAG });

        await lauf(1);
        await lauf(400);
        await lauf(701);
        assert.equal(post.mails.length, 0, 'vor Tag 702 darf keine Warnung gehen');

        await lauf(702);
        assert.equal(post.mails.length, 1);
        const mail = post.mails[0];
        assert.equal(mail.art, 'inaktiv');
        assert.equal(mail.an, ADRESSE);
        assert.match(mail.verweis, /^https:\/\/iyambae\.fm\/.*\?anmeldung=bitte$/);
        // Der angekuendigte Tag ist der 730. — kein Tag frueher.
        assert.ok(Date.parse(mail.am) >= t + 729 * TAG && Date.parse(mail.am) <= t + 730 * TAG,
            'angekuendigt: ' + mail.am);

        await lauf(703);
        await lauf(720);
        await lauf(729);
        assert.equal(post.mails.length, 1, 'genau einmal je Frist');

        const konto = await d.speicher.hole(TABELLE_KONTEN, kontoId, 'konto');
        assert.equal(konto.loeschungAm, mail.am, 'am Konto gemerkt, was angekuendigt wurde');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('Loeschung nach 730 Tagen — ganz, ueber die vorhandene Kontoloeschung', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const { kontoId, t } = await angemeldet(d);
        const post = sammler();
        const lauf = (tage) => pruefeInaktiveKonten(d.speicher, { versender: post, seite: SEITE, jetzt: t + tage * TAG });

        await lauf(702);
        await lauf(729);
        assert.equal(await partitionLeer(d.speicher, kontoId), false, 'Tag 729 ist zu frueh');

        const ergebnis = await lauf(730);
        assert.equal(ergebnis.geloescht, 1);
        assert.equal(await partitionLeer(d.speicher, kontoId), true, 'die ganze Partition, auch Sitzungen');
        assert.equal(await findeKonto(d.speicher, 'mail', ADRESSE), null, 'auch der Verweis');
        assert.equal(await holeOderNichts(d.speicher, TABELLE_VERWEISE, kennungAbdruck('mail', ADRESSE), 'v'), null);
        assert.ok(p.zeilen.some((z) => z.art === 'konto.geloescht' && z.konto === kontoId.slice(0, 12)),
            'dieselbe Protokollzeile wie beim Loeschen von Hand — also derselbe Weg');
        assert.ok(p.zeilen.some((z) => z.art === 'konto.inaktiv_geloescht'));
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('ohne vorherige Warnung wird nicht geloescht — die Frist beginnt mit der Mail', async () => {
    // Faellt der Durchgang wochenlang aus (niemand kommt vorbei), darf das
    // Konto am Tag 730 nicht ungewarnt verschwinden.
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const { kontoId, t } = await angemeldet(d);
        const post = sammler();
        const jetzt = t + 800 * TAG;
        await pruefeInaktiveKonten(d.speicher, { versender: post, seite: SEITE, jetzt });

        assert.equal(post.mails.length, 1);
        assert.equal(await partitionLeer(d.speicher, kontoId), false);
        assert.ok(Date.parse(post.mails[0].am) >= jetzt + WARNUNG_MS - TAG,
            'volle vier Wochen ab der Mail, nicht ab Tag 702');

        await pruefeInaktiveKonten(d.speicher, { versender: post, seite: SEITE, jetzt: jetzt + 27 * TAG });
        assert.equal(await partitionLeer(d.speicher, kontoId), false);
        await pruefeInaktiveKonten(d.speicher, { versender: post, seite: SEITE, jetzt: jetzt + 29 * TAG });
        assert.equal(await partitionLeer(d.speicher, kontoId), true);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('Anmelden setzt Warnung und Loeschung zurueck', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const { kontoId, t } = await angemeldet(d);
        const post = sammler();
        const lauf = (tage) => pruefeInaktiveKonten(d.speicher, { versender: post, seite: SEITE, jetzt: t + tage * TAG });

        await lauf(702);
        assert.equal(post.mails.length, 1);

        // Am Tag 710 meldet sich jemand an — derselbe Weg, den jede
        // Anmeldeart nimmt: Es entsteht eine Sitzung.
        await erzeugeSitzung(d.speicher, kontoId, t + 710 * TAG);
        const konto = await d.speicher.hole(TABELLE_KONTEN, kontoId, 'konto');
        assert.equal(konto.loeschungAm, undefined, 'die Ankuendigung ist vom Tisch');

        await lauf(730);
        await lauf(800);
        assert.equal(await partitionLeer(d.speicher, kontoId), false, 'kein Loeschen nach der Anmeldung');
        assert.equal(post.mails.length, 1, 'und keine weitere Warnung in der neuen Frist, solange sie laeuft');

        // Die neue Frist hat ihre eigene Warnung.
        await lauf(710 + 702);
        assert.equal(post.mails.length, 2);
        await lauf(710 + 730);
        assert.equal(await partitionLeer(d.speicher, kontoId), true);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('ein Bestandskonto ohne letzteAnmeldung wird nicht sofort geloescht', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        const stichtag = Date.parse(STICHTAG);
        // Angelegt lange vor dem Stichtag, also laenger als zwei Jahre still,
        // wenn man nur auf `angelegt` saehe.
        const kontoId = await legeKontoAn(speicher,
            { kennungen: [{ art: 'mail', wert: ADRESSE }] }, stichtag - 1000 * TAG);
        const konto = await speicher.hole(TABELLE_KONTEN, kontoId, 'konto');
        assert.equal(konto.letzteAnmeldung, undefined, 'so sehen die Konten von vor dieser Aenderung aus');

        const post = sammler();
        const lauf = (tage) => pruefeInaktiveKonten(speicher, { versender: post, seite: SEITE, jetzt: stichtag + tage * TAG });

        await lauf(0);
        await lauf(1);
        await lauf(701);
        assert.equal(post.mails.length, 0, 'gemessen ab dem Stichtag, nicht ab dem Anlegen');
        assert.equal(await partitionLeer(speicher, kontoId), false);

        await lauf(702);
        assert.equal(post.mails.length, 1, 'irgendwann gilt die Regel aber auch fuer sie');
    } finally {
        p.zurueck();
    }
});

test('ein Bestandskonto, das nach dem Stichtag angelegt wurde, zaehlt ab dem Anlegen', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        const angelegt = Date.parse(STICHTAG) + 100 * TAG;
        const kontoId = await legeKontoAn(speicher, { kennungen: [{ art: 'mail', wert: ADRESSE }] }, angelegt);
        const post = sammler();
        await pruefeInaktiveKonten(speicher, { versender: post, seite: SEITE, jetzt: angelegt + 701 * TAG });
        assert.equal(post.mails.length, 0);
        await pruefeInaktiveKonten(speicher, { versender: post, seite: SEITE, jetzt: angelegt + 702 * TAG });
        assert.equal(post.mails.length, 1);
        assert.equal(await partitionLeer(speicher, kontoId), false);
    } finally {
        p.zurueck();
    }
});

test('ein Konto ohne Mailadresse wird ohne Mail geloescht — an der Frist, nicht frueher', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        const t = Date.parse(STICHTAG) + 10 * TAG;
        const kontoId = await legeKontoAn(speicher,
            { kennungen: [{ art: 'apple', wert: 'sub-ohne-adresse' }] }, t);
        await erzeugeSitzung(speicher, kontoId, t);

        const post = sammler();
        await pruefeInaktiveKonten(speicher, { versender: post, seite: SEITE, jetzt: t + 702 * TAG });
        assert.equal(post.mails.length, 0, 'es gibt niemanden, dem man schreiben koennte');
        await pruefeInaktiveKonten(speicher, { versender: post, seite: SEITE, jetzt: t + 729 * TAG });
        assert.equal(await partitionLeer(speicher, kontoId), false);
        await pruefeInaktiveKonten(speicher, { versender: post, seite: SEITE, jetzt: t + 730 * TAG });
        assert.equal(await partitionLeer(speicher, kontoId), true);
        assert.equal(await findeKonto(speicher, 'apple', 'sub-ohne-adresse'), null);
    } finally {
        p.zurueck();
    }
});

test('je Durchgang nur begrenzt viele Warnungen — der Rest am naechsten Tag, mit voller Frist', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    try {
        const t = Date.parse(STICHTAG) + 10 * TAG;
        for (const n of [1, 2, 3]) {
            const k = await legeKontoAn(speicher, { kennungen: [{ art: 'mail', wert: 'n' + n + '@example.org' }] }, t);
            await erzeugeSitzung(speicher, k, t);
        }
        const post = sammler();
        const jetzt = t + 702 * TAG;
        await pruefeInaktiveKonten(speicher, { versender: post, seite: SEITE, jetzt, hoechstens: 2 });
        assert.equal(post.mails.length, 2);
        await pruefeInaktiveKonten(speicher, { versender: post, seite: SEITE, jetzt: jetzt + TAG, hoechstens: 2 });
        assert.equal(post.mails.length, 3);
        assert.ok(Date.parse(post.mails[2].am) >= jetzt + TAG + WARNUNG_MS - TAG,
            'wer einen Tag spaeter gewarnt wird, bekommt trotzdem vier Wochen');
    } finally {
        p.zurueck();
    }
});

test('der 24-Stunden-Durchgang prueft die inaktiven Konten mit', async () => {
    const speicher = speicherImArbeitsspeicher();
    const p = fangeProtokoll();
    vergissAufraeumen();
    try {
        const t = Date.parse(STICHTAG) + 10 * TAG;
        const kontoId = await legeKontoAn(speicher, { kennungen: [{ art: 'mail', wert: ADRESSE }] }, t);
        await erzeugeSitzung(speicher, kontoId, t);

        const post = sammler();
        assert.equal(stosseAufraeumenAn(speicher, t + 702 * TAG, { versender: post, seite: SEITE }), true);
        for (let i = 0; i < 50 && post.mails.length === 0; i++) await new Promise((f) => setTimeout(f, 5));
        assert.equal(post.mails.length, 1);
        assert.ok(p.zeilen.some((z) => z.art === 'inaktiv' && z.ergebnis === 'ok'));
    } finally {
        vergissAufraeumen();
        p.zurueck();
    }
});

// ── Die Mail ────────────────────────────────────────────────────────

async function versendeEine(auftrag) {
    const gesendet = [];
    const v = erzeugeVersender({ versendeRoh: async (m) => { gesendet.push(m); } });
    v.reiheEin(auftrag);
    for (let i = 0; i < 50 && gesendet.length === 0; i++) await new Promise((f) => setTimeout(f, 2));
    return gesendet[0];
}

const AUFTRAG = {
    art: 'inaktiv', an: ADRESSE, am: '2028-11-03',
    verweis: 'https://iyambae.fm/?anmeldung=bitte',
};

test('die Warnmail nennt den Tag und den Weg zur Anmeldung', async () => {
    const p = fangeProtokoll();
    try {
        const de = await versendeEine({ ...AUFTRAG, sprache: 'de' });
        assert.match(de.plainText, /3\. November 2028/);
        assert.ok(de.plainText.includes(AUFTRAG.verweis));
        assert.match(de.plainText, /anmeldest/);

        const en = await versendeEine({ ...AUFTRAG, sprache: 'en' });
        assert.match(en.plainText, /3 November 2028/);
        assert.ok(en.plainText.includes(AUFTRAG.verweis));
    } finally {
        p.zurueck();
    }
});

test('ohne bekannte Sprache kommt die Warnmail zweisprachig — auch bei __proto__', async () => {
    const p = fangeProtokoll();
    try {
        for (const sprache of [undefined, '__proto__', 'constructor', 'xx']) {
            const m = await versendeEine({ ...AUFTRAG, sprache });
            assert.ok(m, 'versandt bei ' + String(sprache));
            assert.match(m.plainText, /3\. November 2028/);
            assert.match(m.plainText, /3 November 2028/);
        }
    } finally {
        p.zurueck();
    }
});
