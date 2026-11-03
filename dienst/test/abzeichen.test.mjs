/*
  Das Mess-Abzeichen — 432hz-radio#27, Spec in
  docs/superpowers/specs/2026-11-03-mess-abzeichen.md.

  Drei Dinge werden hier festgenagelt, weil an ihnen das Versprechen haengt:

    1. Es kommt NUR der Befund an. Keine Datei, kein Dateiname, keine
       Adresse — weder in der Tabelle noch im Protokoll.
    2. Der Loeschschluessel steht nur in der Antwort, in der Tabelle nur
       sein Abdruck.
    3. Nach zwei Jahren sagt der Weg „abgelaufen" (410), nicht 404 — auch
       dann noch, wenn die Zeile schon weggeraeumt ist.

  Wie alle Tests hier von aussen ueber HTTP, nicht an der Funktion vorbei.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { erzeugeDrossel } from '../src/server.mjs';
import { TABELLE_ABZEICHEN, speicherImArbeitsspeicher } from '../src/speicher.mjs';
import {
    saeubereBefund, neueKennung, tagAusKennung, kennungSiehtEchtAus,
    ablaufVon, legeAbzeichenAn, holeAbzeichen, loescheAbzeichen,
    raeumeAbzeichenAuf, waehleSprache, baueSeite, baueBild, SPRACHEN,
} from '../src/abzeichen.mjs';
import { starteTestdienst, fangeProtokoll } from './hilfe.mjs';

const SHA = 'a'.repeat(32) + '0123456789abcdef'.repeat(2);
const BEFUND = { a4: 432.1, sicherheit: 0.87, dauer: 222, sha256: SHA };
const TAG = 86_400_000;

async function zeilen(speicher) {
    const raus = [];
    for await (const z of speicher.listeAlle(TABELLE_ABZEICHEN)) raus.push(z);
    return raus;
}

// ── Die Erlaubnisliste ──────────────────────────────────────────────

test('ein vollstaendiger Befund kommt vollstaendig durch', () => {
    assert.deepEqual(saeubereBefund(BEFUND), { ok: true, befund: BEFUND });
});

test('nur die vier Felder — Dateiname und Datei fallen still weg', () => {
    const r = saeubereBefund({ ...BEFUND, dateiname: 'Privat 2019.flac', datei: 'UklGRg==', ip: '1.2.3.4' });
    assert.deepEqual(r.befund, BEFUND);
});

test('Zahlen werden gerundet wie vereinbart', () => {
    const r = saeubereBefund({ ...BEFUND, a4: 432.14999, sicherheit: 0.8749, dauer: 221.6 });
    assert.deepEqual(r.befund, { ...BEFUND, a4: 432.1, sicherheit: 0.87, dauer: 222 });
});

test('jedes Feld wird streng geprueft', () => {
    const falsch = [
        { a4: undefined }, { a4: '432.1' }, { a4: 379.9 }, { a4: 500.1 }, { a4: NaN },
        { sicherheit: 1.01 }, { sicherheit: '0.9' }, { sicherheit: null },
        { dauer: 0 }, { dauer: 86_401 }, { dauer: Infinity }, { dauer: '222' },
        { sha256: SHA.toUpperCase() }, { sha256: SHA.slice(1) }, { sha256: SHA + '0' },
        { sha256: 'g' + SHA.slice(1) }, { sha256: [SHA] }, { sha256: undefined },
    ];
    for (const kaputt of falsch) {
        const r = saeubereBefund({ ...BEFUND, ...kaputt });
        assert.equal(r.ok, false, JSON.stringify(kaputt));
        assert.equal(r.fehler, 'befund_ungueltig', JSON.stringify(kaputt));
    }
    assert.equal(saeubereBefund(null).ok, false);
    assert.equal(saeubereBefund([]).ok, false);
});

test('unter 0,35 Sicherheit gibt es kein Abzeichen', () => {
    // Die Seite zeigt dort gar keine Zahl. Ein Abzeichen dafuer waere eine
    // Behauptung, die nicht einmal angezeigt wurde.
    assert.deepEqual(saeubereBefund({ ...BEFUND, sicherheit: 0.34 }), { ok: false, fehler: 'traegt_nicht' });
    assert.equal(saeubereBefund({ ...BEFUND, sicherheit: 0.35 }).ok, true);
});

// ── Kennung und Ablauf ──────────────────────────────────────────────

test('die Kennung traegt den Tag und sieben Zeichen Zufall', () => {
    const jetzt = Date.UTC(2026, 10, 3, 15);
    const k = neueKennung(jetzt);
    assert.match(k, /^[0-9a-hjkmnp-tv-z]{10}$/);
    assert.ok(kennungSiehtEchtAus(k));
    assert.equal(tagAusKennung(k), Date.UTC(2026, 10, 3));
    const viele = new Set(Array.from({ length: 2000 }, () => neueKennung(jetzt)));
    assert.equal(viele.size, 2000);
});

test('Kennungen, die es nicht geben kann, werden erkannt', () => {
    for (const k of ['', 'abc', 'ABCDEFGHJK', '00000000il', '0000000000a', '../../etc', 'm7k2q9']) {
        assert.equal(kennungSiehtEchtAus(k), false, k);
    }
});

test('Ablauf: zwei Kalenderjahre ab Erstellung', () => {
    assert.equal(ablaufVon(Date.UTC(2026, 10, 3, 15)), Date.UTC(2028, 10, 3, 15));
});

// ── Ablegen, Holen, Loeschen am Speicher ────────────────────────────

test('in der Tabelle steht der Abdruck des Schluessels, nie der Schluessel', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { kennung, loeschschluessel } = await legeAbzeichenAn(speicher, BEFUND);
    assert.match(loeschschluessel, /^[A-Za-z0-9_-]{32}$/);
    const [zeile] = await zeilen(speicher);
    assert.equal(zeile.partitionKey, kennung);
    assert.equal(zeile.loeschHash, createHash('sha256').update(loeschschluessel).digest('hex'));
    assert.ok(!JSON.stringify(zeile).includes(loeschschluessel));
    assert.deepEqual(Object.keys(zeile).sort(),
        ['a4', 'ablauf', 'angelegt', 'dauer', 'etag', 'loeschHash', 'partitionKey', 'rowKey', 'sha256', 'sicherheit']);
});

test('Kollision: Bei schon vergebener Kennung wird neu gezogen', async () => {
    const speicher = speicherImArbeitsspeicher();
    const gezogen = ['0zz0000000', '0zz0000000', '0zz0000001'];
    const a = await legeAbzeichenAn(speicher, BEFUND, { ziehe: () => gezogen.shift() });
    const b = await legeAbzeichenAn(speicher, BEFUND, { ziehe: () => gezogen.shift() });
    assert.equal(a.kennung, '0zz0000000');
    assert.equal(b.kennung, '0zz0000001');
});

test('Holen: da, abgelaufen, nie dagewesen, nach Ablauf weggeraeumt', async () => {
    const speicher = speicherImArbeitsspeicher();
    const jetzt = Date.UTC(2026, 10, 3, 15);
    const { kennung } = await legeAbzeichenAn(speicher, BEFUND, { jetzt });

    assert.equal((await holeAbzeichen(speicher, kennung, jetzt + TAG)).zustand, 'da');
    const spaeter = Date.UTC(2028, 10, 3, 16);
    assert.equal((await holeAbzeichen(speicher, kennung, spaeter)).zustand, 'abgelaufen');
    // Beim Zugriff weggeraeumt …
    await new Promise((f) => setTimeout(f, 5));
    assert.equal((await zeilen(speicher)).length, 0);
    // … und trotzdem weiter „abgelaufen", nicht 404: Der Tag steht in der Kennung.
    assert.equal((await holeAbzeichen(speicher, kennung, spaeter)).zustand, 'abgelaufen');

    // Eine fremde Kennung von heute: nie dagewesen.
    assert.equal((await holeAbzeichen(speicher, neueKennung(jetzt), jetzt)).zustand, 'fehlt');
    // Ein Tag in der Zukunft kann es nicht geben.
    assert.equal((await holeAbzeichen(speicher, neueKennung(jetzt + 9 * TAG), jetzt)).zustand, 'fehlt');
});

test('Loeschen: falscher Schluessel, richtiger Schluessel, zweites Mal', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { kennung, loeschschluessel } = await legeAbzeichenAn(speicher, BEFUND);
    assert.equal(await loescheAbzeichen(speicher, kennung, 'x'.repeat(32)), 'schluessel_falsch');
    assert.equal((await zeilen(speicher)).length, 1);
    assert.equal(await loescheAbzeichen(speicher, kennung, loeschschluessel), 'ok');
    assert.equal((await zeilen(speicher)).length, 0);
    assert.equal(await loescheAbzeichen(speicher, kennung, loeschschluessel), 'nicht_gefunden');
});

test('der Tagesdurchgang raeumt nur Abgelaufenes', async () => {
    const speicher = speicherImArbeitsspeicher();
    const alt = Date.UTC(2024, 0, 10);
    // Vor 2026 laesst sich keine Kennung bilden — der Durchgang darf aber
    // nicht an der Kennung haengen, sondern nur an `ablauf`.
    await legeAbzeichenAn(speicher, BEFUND, { jetzt: Date.UTC(2026, 0, 2) });
    await speicher.setze(TABELLE_ABZEICHEN, {
        partitionKey: '0000000001', rowKey: 'a', ...BEFUND, angelegt: alt, ablauf: ablaufVon(alt), loeschHash: '0',
    });
    const weg = await raeumeAbzeichenAuf(speicher, Date.UTC(2026, 10, 3));
    assert.equal(weg, 1);
    assert.equal((await zeilen(speicher)).length, 1);
});

// ── Seite und Bild ──────────────────────────────────────────────────

test('Sprache: Abfrage vor Accept-Language vor Englisch', () => {
    assert.equal(waehleSprache('?sprache=ja', 'de-DE,de;q=0.9'), 'ja');
    assert.equal(waehleSprache('?sprache=xx', 'fr-FR'), 'fr');
    assert.equal(waehleSprache('', 'de-AT,en;q=0.5'), 'de');
    assert.equal(waehleSprache('', 'pt-BR'), 'en');
    assert.equal(waehleSprache(undefined, undefined), 'en');
});

const EINTRAG = {
    zustand: 'da', kennung: '0zz0000000',
    zeile: { ...BEFUND, angelegt: Date.UTC(2026, 10, 3, 15), ablauf: Date.UTC(2028, 10, 3, 15) },
};

test('jede Sprache sagt „gemessen" und nie „geprueft"', () => {
    for (const sprache of SPRACHEN) {
        const seite = baueSeite(EINTRAG, sprache);
        assert.ok(seite.includes(SHA), sprache);
        assert.ok(seite.includes('/stimmung/'), sprache + ': Hinweis zum Nachmessen fehlt');
        assert.ok(seite.includes('id="pflichtsatz"'), sprache + ': Pflichtsatz fehlt');
        assert.ok(!/<script(?![^>]*\ssrc=)/.test(seite), sprache + ': Inline-Skript');
    }
    const de = baueSeite(EINTRAG, 'de');
    assert.ok(de.includes('gemessen'));
    assert.ok(!/gepr[uü]ft/i.test(de));
    assert.ok(de.includes('Selbstauskunft'));
    assert.ok(de.includes('nicht, dass das Video'));
    assert.ok(!/gepr[uü]ft/i.test(baueBild(EINTRAG, 'de')));
    assert.ok(baueBild(EINTRAG, 'de').includes('gemessen'));
    assert.ok(baueBild(EINTRAG, 'de').includes('432,1'));
    assert.ok(baueBild(EINTRAG, 'en').includes('432.1'));
});

test('das Bild hat kein Skript und holt nichts von aussen', () => {
    for (const sprache of SPRACHEN) {
        for (const zustand of ['da', 'abgelaufen', 'fehlt']) {
            const svg = baueBild({ ...EINTRAG, zustand }, sprache);
            assert.ok(svg.startsWith('<svg'), sprache);
            assert.ok(!/<script|\son[a-z]+=|href=|url\((?!#)|@import/i.test(svg), `${sprache}/${zustand}`);
        }
    }
});

// ── Ueber HTTP ──────────────────────────────────────────────────────

test('HTTP: anlegen, Seite, Bild, loeschen — der ganze Weg', async () => {
    const dienst = await starteTestdienst();
    const protokoll = fangeProtokoll();
    try {
        const an = await dienst.rufe('POST', '/api/messung', { ...BEFUND, dateiname: 'Privat 2019.flac' });
        assert.equal(an.status, 201);
        assert.deepEqual(Object.keys(an.daten).sort(), ['kennung', 'loeschschluessel']);
        const { kennung, loeschschluessel } = an.daten;

        const seite = await dienst.rufe('GET', '/messung/' + kennung + '?sprache=de');
        assert.equal(seite.status, 200);
        assert.match(seite.kopf.get('content-type'), /^text\/html/);
        assert.match(seite.kopf.get('content-security-policy'), /default-src 'none'/);
        assert.match(seite.kopf.get('cache-control'), /public, max-age=300/);
        assert.equal(seite.kopf.get('x-robots-tag'), 'noindex');
        assert.equal(seite.kopf.get('cross-origin-resource-policy'), null);
        assert.ok(seite.daten.includes('432,1'));

        const bild = await dienst.rufe('GET', '/messung/' + kennung + '.svg');
        assert.equal(bild.status, 200);
        assert.match(bild.kopf.get('content-type'), /^image\/svg\+xml/);
        assert.equal(bild.kopf.get('cross-origin-resource-policy'), 'cross-origin');
        assert.match(bild.kopf.get('vary'), /Accept-Language/);

        assert.equal((await dienst.rufe('DELETE', '/api/messung', { kennung, loeschschluessel: 'x'.repeat(32) })).status, 403);
        assert.equal((await dienst.rufe('DELETE', '/api/messung', { kennung, loeschschluessel })).status, 204);
        assert.equal((await dienst.rufe('GET', '/messung/' + kennung)).status, 404);
        assert.equal((await dienst.rufe('GET', '/messung/' + kennung + '.svg')).status, 404);
        assert.equal((await dienst.rufe('DELETE', '/api/messung', { kennung, loeschschluessel })).status, 404);

        // Nichts davon im Protokoll: kein Dateiname, keine Kennung, kein
        // Schluessel, kein Befund, keine Adresse.
        const text = JSON.stringify(protokoll.zeilen);
        for (const verboten of ['Privat', kennung, loeschschluessel, SHA, '432.1', '127.0.0']) {
            assert.ok(!text.includes(verboten), 'im Protokoll: ' + verboten);
        }
        assert.ok(protokoll.zeilen.some((z) => z.art === 'abzeichen' && z.grund === 'angelegt'));
    } finally {
        protokoll.zurueck();
        await dienst.schliesse();
    }
});

test('HTTP: nur application/json, nur erlaubte Herkunft', async () => {
    const dienst = await starteTestdienst();
    try {
        const ohneTyp = await fetch(dienst.basis + '/api/messung', {
            method: 'POST', headers: { Origin: 'https://iyambae.fm', 'Content-Type': 'text/plain' },
            body: JSON.stringify(BEFUND),
        });
        assert.equal(ohneTyp.status, 415);
        const formular = await fetch(dienst.basis + '/api/messung', {
            method: 'POST', headers: { Origin: 'https://iyambae.fm', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'a4=432',
        });
        assert.equal(formular.status, 415);
        const fremd = await dienst.rufe('POST', '/api/messung', BEFUND, { kopf: { Origin: 'https://boese.example' } });
        assert.equal(fremd.status, 403);
        const loeschenOhneTyp = await fetch(dienst.basis + '/api/messung', {
            method: 'DELETE', headers: { Origin: 'https://iyambae.fm' },
            body: JSON.stringify({ kennung: '0zz0000000', loeschschluessel: 'x'.repeat(32) }),
        });
        assert.equal(loeschenOhneTyp.status, 415);
        assert.equal((await dienst.rufe('POST', '/api/messung', { ...BEFUND, sicherheit: 0.2 })).daten.fehler, 'traegt_nicht');
        assert.equal((await dienst.rufe('POST', '/api/messung', { ...BEFUND, sha256: 'abc' })).status, 400);
        assert.equal(dienst.speicher.art, 'arbeitsspeicher');
        assert.equal((await zeilen(dienst.speicher)).length, 0);
    } finally {
        await dienst.schliesse();
    }
});

test('HTTP: abgelaufen ist 410 auf Seite und Bild', async () => {
    const dienst = await starteTestdienst();
    try {
        const alt = Date.UTC(2026, 0, 5);
        const { kennung } = await legeAbzeichenAn(dienst.speicher, BEFUND, { jetzt: alt });
        // Jetzt ist der 03.11.2026 oder spaeter — also zwei Jahre vorspulen,
        // indem die Zeile ein frueheres Ablaufdatum bekommt.
        //
        // Vor jedem Abruf neu, denn der erste raeumt die Zeile beim Zugriff
        // weg — und vor 2028 kann der Tag in der Kennung allein noch nicht
        // „abgelaufen" sagen.
        const z = await dienst.speicher.hole(TABELLE_ABZEICHEN, kennung, 'a');
        const veralte = () => dienst.speicher.setze(TABELLE_ABZEICHEN, { ...z, ablauf: Date.now() - 1000 });
        await veralte();
        const seite = await dienst.rufe('GET', '/messung/' + kennung + '?sprache=de');
        assert.equal(seite.status, 410);
        assert.ok(seite.daten.includes('abgelaufen'));
        await veralte();
        const bild = await dienst.rufe('GET', '/messung/' + kennung + '.svg?sprache=de');
        assert.equal(bild.status, 410);
        assert.ok(bild.daten.includes('abgelaufen'));
    } finally {
        await dienst.schliesse();
    }
});

test('HTTP: Unsinn im Pfad ist 404 ohne Tabellenzugriff', async () => {
    const dienst = await starteTestdienst();
    try {
        dienst.speicher.stoere(new Error('darf nicht gefragt werden'));
        for (const pfad of ['/messung/abc', '/messung/..%2f..%2fetc', '/messung/ABCDEFGHJK.svg', '/messung/']) {
            const r = await dienst.rufe('GET', pfad);
            assert.equal(r.status, 404, pfad);
        }
    } finally {
        dienst.speicher.stoere(null);
        await dienst.schliesse();
    }
});

test('HTTP: Anlegen ist gedrosselt', async () => {
    const dienst = await starteTestdienst({ drossel: erzeugeDrossel() });
    try {
        const status = [];
        for (let i = 0; i < 11; i++) status.push((await dienst.rufe('POST', '/api/messung', BEFUND)).status);
        assert.deepEqual(status.slice(0, 10), Array(10).fill(201));
        assert.equal(status[10], 429);
    } finally {
        await dienst.schliesse();
    }
});
