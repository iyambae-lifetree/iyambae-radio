import test from 'node:test';
import assert from 'node:assert/strict';

import {
    liesIcyTitel, saeubereTitel, erzeugeTitel,
    ALTER_MS, JE_ZUG, REIHUM, METAINT_HOECHSTENS,
} from '../src/titel.mjs';

/*
  Ein erfundener ICY-Strom.

  Alle Tests laufen OHNE NETZ. Ein Test, der echte Sender anfragt, misst das
  Wetter im Internet und nicht unseren Code — er wird rot, wenn ein fremder
  Server hustet, und niemand traut ihm nach dem dritten Mal noch.

  Der Aufbau ist der aus dem Verfahren: `icy-metaint` Bytes Ton, dann ein
  Laengenbyte in Sechzehnerschritten, dann der Block.
*/
function stromMit(titel, { intervall = 64, stueckeln = false, metaint = null } = {}) {
    const ton = new Uint8Array(intervall).fill(0x41);
    let block = new Uint8Array(0);
    let laengenbyte = 0;
    if (titel !== null) {
        const text = new TextEncoder().encode(`StreamTitle='${titel}';`);
        laengenbyte = Math.ceil(text.length / 16);
        block = new Uint8Array(laengenbyte * 16);
        block.set(text);
    }
    const alles = new Uint8Array(intervall + 1 + block.length);
    alles.set(ton);
    alles[intervall] = laengenbyte;
    alles.set(block, intervall + 1);

    return async () => ({
        ok: true,
        headers: { get: (n) => (n.toLowerCase() === 'icy-metaint'
            ? String(metaint ?? intervall) : null) },
        body: {
            getReader() {
                let stelle = 0;
                return {
                    async read() {
                        if (stelle >= alles.length) return { done: true };
                        // In Haeppchen, damit der Zusammenbau ueber mehrere
                        // read() hinweg wirklich geprueft wird.
                        const bis = stueckeln
                            ? Math.min(stelle + 7, alles.length) : alles.length;
                        const stueck = alles.subarray(stelle, bis);
                        stelle = bis;
                        return { value: stueck, done: false };
                    },
                    async cancel() {},
                };
            },
        },
    });
}

// ── Der Leser ───────────────────────────────────────────────────────

test('liest den Titel aus dem ersten Block', async () => {
    const { titel } = await liesIcyTitel('x', { holeStrom: stromMit('Maali - Someday') });
    assert.equal(titel, 'Maali - Someday');
});

test('liest ihn auch, wenn er ueber mehrere Haeppchen kommt', async () => {
    // Der Fall aus dem Betrieb: Ein Strom liefert nicht 16 KB am Stueck.
    const { titel } = await liesIcyTitel('x', {
        holeStrom: stromMit('Charmaine Lee - HGT', { stueckeln: true }) });
    assert.equal(titel, 'Charmaine Lee - HGT');
});

test('Laengenbyte 0 heisst: keine Auskunft, kein Fehler', async () => {
    const { titel } = await liesIcyTitel('x', { holeStrom: stromMit(null) });
    assert.equal(titel, null);
});

test('ohne icy-metaint kommt nichts heraus', async () => {
    const { titel } = await liesIcyTitel('x', {
        holeStrom: async () => ({ ok: true, headers: { get: () => null }, body: {} }) });
    assert.equal(titel, null);
});

test('ein unsinnig grosses icy-metaint wird abgelehnt', async () => {
    /*
      Sonst bestimmt ein fremder Server, wie viel Bandbreite wir ausgeben:
      `icy-metaint: 10000000` waere die Aufforderung, 10 MB zu lesen, bevor
      auch nur ein Byte Metadaten kommt.
    */
    const { titel } = await liesIcyTitel('x', {
        holeStrom: stromMit('egal', { metaint: METAINT_HOECHSTENS + 1 }) });
    assert.equal(titel, null);
});

test('ein Fehler beim Holen ist kein Ereignis, sondern kein Titel', async () => {
    const { titel } = await liesIcyTitel('x', {
        holeStrom: async () => { throw new Error('ECONNREFUSED'); } });
    assert.equal(titel, null);
});

test('ein Titel mit Apostroph darin geht nicht verloren', async () => {
    // StreamTitle='Rock 'n' Roll'; — der Abschluss ist das Anfuehrungszeichen
    // VOR dem Semikolon, nicht das erste beste.
    const { titel } = await liesIcyTitel('x', {
        holeStrom: stromMit("Rock 'n' Roll", { intervall: 96 }) });
    assert.equal(titel, "Rock 'n' Roll");
});

// ── Die Saeuberung ──────────────────────────────────────────────────

test('der fuehrende Strich faellt weg', () => {
    // Gemessen bei NEU Radio: ein leeres Kuenstlerfeld vor dem Titel.
    assert.equal(saeubereTitel('- Lil Uzi Vert - Ps & Qs'), 'Lil Uzi Vert - Ps & Qs');
    assert.equal(saeubereTitel(' - 4. Dastardly Kids - Icy Hot'),
                 '4. Dastardly Kids - Icy Hot');
});

test('bekannte Platzhalter werden verworfen', () => {
    // Alle vier gemessen, nicht ausgedacht.
    assert.equal(saeubereTitel('Now Playing info goes here'), null);
    assert.equal(saeubereTitel('Airtime - offline'), null);
    assert.equal(saeubereTitel('-'), null);
    assert.equal(saeubereTitel('   '), null);
});

test('ein Kuenstlername, der wie ein Platzhalter klingt, bleibt', () => {
    /*
      Die Liste ist woertlich und nicht als Muster gebaut. Ein /offline/i
      wuerde diesen Namen mitverwerfen — und ein Filter, der echte Titel
      frisst, ist schlimmer als einer, der einen Platzhalter durchlaesst.
    */
    assert.equal(saeubereTitel('Offline Pizza Kartell - Live'),
                 'Offline Pizza Kartell - Live');
});

test('leer und unbekannt sind dasselbe: null, nie ein leerer Text', () => {
    for (const w of [null, undefined, 42, {}, '', '  ', 'ab']) {
        assert.equal(saeubereTitel(w), null, JSON.stringify(w));
    }
});

// ── Der Stand ───────────────────────────────────────────────────────

function bau({ sender, titel = {}, beobachtet = null, uhr = { t: 1_000_000 } }) {
    const angefragt = [];
    return {
        angefragt,
        uhr,
        laden: erzeugeTitel({
            holeSenderliste: async () => sender,
            holeBeobachtete: async () => beobachtet,
            jetzt: () => uhr.t,
            holeStrom: async (url) => {
                angefragt.push(url);
                return stromMit(titel[url] ?? null)();
            },
        }),
    };
}

test('die Antwort ist fuer alle dieselbe und nennt keinen Frager', async () => {
    const { laden } = bau({
        sender: [{ id: 'a', stream: 'sa' }, { id: 'b', stream: 'sb' }],
        titel: { sa: 'Erster', sb: 'Zweiter' },
    });
    await laden.fuelle();
    const eins = laden.hole();
    const zwei = laden.hole();
    assert.deepEqual(eins.titel, { a: 'Erster', b: 'Zweiter' });
    assert.deepEqual(eins, zwei, 'zwei Abrufe, dieselbe Antwort');
    assert.deepEqual(Object.keys(eins).sort(), ['stand', 'titel']);
});

test('Sender ohne brauchbaren Titel stehen gar nicht erst drin', async () => {
    const { laden } = bau({
        sender: [{ id: 'a', stream: 'sa' }, { id: 'b', stream: 'sb' }],
        titel: { sa: 'Now Playing info goes here', sb: 'Echter Titel' },
    });
    await laden.fuelle();
    // Ein Feld mit einem Platzhalter waere schlimmer als ein fehlendes.
    assert.deepEqual(laden.hole().titel, { b: 'Echter Titel' });
});

test('HLS-Sender werden gar nicht angefragt', async () => {
    const { laden, angefragt } = bau({
        sender: [{ id: 'a', stream: 'sa' }, { id: 'h', stream: 'x/live.m3u8' }],
        titel: { sa: 'Echter Titel' },
    });
    await laden.fuelle();
    assert.deepEqual(angefragt, ['sa'], 'HLS liest die Abspielmaschine selbst');
});

test('die zuletzt gestarteten Sender werden ZUERST angefasst', async () => {
    /*
      Diese Zusicherung hiess bis 432hz-radio#9 „nur die zuletzt
      gestarteten" und pruefte einen Ausschluss. Der war falsch: Ein Sender,
      den heute zum ersten Mal jemand auflegt, steht in `sender_oben` noch
      nicht — und die Zahlen dahinter gelten bis zu einer Stunde. Aus dem
      Ausschluss ist ein Vorrang geworden; hier steht jetzt, dass der
      Vorrang wirklich einer ist.
    */
    const viele = Array.from({ length: 40 },
        (_x, i) => ({ id: 's' + i, stream: 'u' + i }));
    const { laden, angefragt } = bau({ sender: viele, beobachtet: ['s7', 's9'] });
    await laden.fuelle();
    assert.ok(angefragt.includes('u7') && angefragt.includes('u9'),
              'beide Beobachteten sind dabei');
    assert.equal(angefragt.indexOf('u7') < 2 && angefragt.indexOf('u9') < 2, true,
                 'und zwar vorn: ' + angefragt.slice(0, 4).join(','));
});

test('ein Zug fasst hoechstens JE_ZUG Stroeme an', async () => {
    const viele = Array.from({ length: 40 },
        (_x, i) => ({ id: 's' + i, stream: 'u' + i }));
    const { laden, angefragt } = bau({ sender: viele });
    await laden.fuelle();
    assert.equal(angefragt.length, JE_ZUG);
});

test('ein frischer Titel wird nicht noch einmal geholt', async () => {
    const uhr = { t: 1_000_000 };
    const { laden, angefragt } = bau({
        sender: [{ id: 'a', stream: 'sa' }], titel: { sa: 'Echter Titel' }, uhr });
    await laden.fuelle();
    assert.equal(angefragt.length, 1);
    uhr.t += ALTER_MS - 1;
    await laden.fuelle();
    assert.equal(angefragt.length, 1, 'noch frisch');
    uhr.t += 2;
    await laden.fuelle();
    assert.equal(angefragt.length, 2, 'jetzt zu alt');
});

test('auch ein Fehlschlag setzt den Zeitstempel', async () => {
    /*
      Sonst stuende derselbe tote Sender bei jedem Zug wieder ganz oben —
      er waere ja weiter „unendlich alt" — und verdraengte alle anderen.
      Ein einziger kaputter Sender legte damit den ganzen Weg lahm.
    */
    const uhr = { t: 1_000_000 };
    const { laden, angefragt } = bau({
        sender: [{ id: 'tot', stream: 'st' }, { id: 'b', stream: 'sb' }],
        titel: { sb: 'Echter Titel' }, uhr });
    await laden.fuelle();
    assert.equal(angefragt.length, 2);
    uhr.t += 10;
    await laden.fuelle();
    assert.equal(angefragt.length, 2, 'der tote wurde nicht sofort wieder gefragt');
});

test('hole() wartet nicht auf fremde Server', async () => {
    let aufgeloest = null;
    const laden = erzeugeTitel({
        holeSenderliste: async () => [{ id: 'a', stream: 'sa' }],
        holeStrom: () => new Promise((r) => { aufgeloest = r; }),
        jetzt: () => 1_000_000,
    });
    // Kein await: Die Antwort muss SOFORT da sein, auch wenn der Nachschub
    // gerade an einem Strom haengt, der nie antwortet.
    const antwort = laden.hole();
    assert.deepEqual(antwort.titel, {});
    assert.equal(typeof antwort.stand, 'number');
    aufgeloest?.({ ok: false, headers: { get: () => null } });
});

test('zwei gleichzeitige Abrufe loesen einen Nachschub aus, nicht zwei', async () => {
    const viele = Array.from({ length: 5 },
        (_x, i) => ({ id: 's' + i, stream: 'u' + i }));
    const { laden, angefragt } = bau({ sender: viele });
    await Promise.all([laden.fuelle(), laden.fuelle(), laden.fuelle()]);
    assert.equal(angefragt.length, 5, 'jeder Strom genau einmal');
});

test('faellt die Senderliste aus, bleibt der alte Stand stehen', async () => {
    const uhr = { t: 1_000_000 };
    let kaputt = false;
    const laden = erzeugeTitel({
        holeSenderliste: async () => {
            if (kaputt) throw new Error('DNS');
            return [{ id: 'a', stream: 'sa' }];
        },
        holeStrom: stromMit('Echter Titel'),
        jetzt: () => uhr.t,
    });
    await laden.fuelle();
    assert.equal(laden.anzahl(), 1);
    kaputt = true;
    uhr.t += 3_600_001;          // Liste gilt als abgelaufen
    await laden.fuelle();
    // Kein Absturz, und der zuletzt bekannte Titel ist noch da.
    assert.deepEqual(laden.hole().titel, { a: 'Echter Titel' });
});

// ── Der Weg selbst ──────────────────────────────────────────────────

import { starteTestdienst } from './hilfe.mjs';

test('ohne Einrichtung steht der Weg nicht offen, sondern gar nicht da', async () => {
    const d = await starteTestdienst();
    try {
        const antwort = await d.rufe('GET', '/api/titel');
        // 424 und nicht 503: nginx faengt die 503 ab und macht daraus
        // `dienst_schlaeft` — also die falsche Ursache.
        assert.equal(antwort.status, 424);
        assert.equal(antwort.daten.fehler, 'titel_nicht_eingerichtet');
    } finally { await d.schliesse(); }
});

test('eingerichtet liefert er den Stand — ohne Schluessel, fuer alle gleich', async () => {
    const laden = erzeugeTitel({
        holeSenderliste: async () => [{ id: 'a', stream: 'sa' }],
        holeStrom: stromMit('Maali - Someday'),
        jetzt: () => 1_000_000,
    });
    await laden.fuelle();
    const d = await starteTestdienst({ titel: laden });
    try {
        const eins = await d.rufe('GET', '/api/titel');
        assert.equal(eins.status, 200);
        assert.deepEqual(eins.daten.titel, { a: 'Maali - Someday' });
        assert.deepEqual(Object.keys(eins.daten).sort(), ['stand', 'titel']);

        // Kein Authorization-Kopf noetig, und zwei Abrufe sind gleich.
        const zwei = await d.rufe('GET', '/api/titel');
        assert.deepEqual(zwei.daten, eins.daten);
    } finally { await d.schliesse(); }
});

// ── Vorrang statt Ausschluss ────────────────────────────────────────

test('ein Sender ausserhalb der Vorrangliste kommt trotzdem dran', async () => {
    /*
      Saemi-Ras Einwand aus 432hz-radio#9: Ein Sender, den heute zum ersten
      Mal jemand auflegt, steht noch nicht in `sender_oben` — und die Zahlen
      dahinter gelten bis zu einer Stunde. Waere die Liste ein Filter, waere
      genau dieser Sender eine Stunde lang der, ueber den nichts dasteht.
    */
    const viele = Array.from({ length: 40 },
        (_x, i) => ({ id: 's' + i, stream: 'u' + i }));
    const { laden, angefragt } = bau({ sender: viele, beobachtet: ['s0', 's1'] });
    await laden.fuelle();
    assert.ok(angefragt.includes('u0'), 'die Beobachteten zuerst');
    assert.ok(angefragt.includes('u1'));
    /*
      REIHUM ist eine UNTERGRENZE fuer die Restplaetze, keine Obergrenze:
      Ist die Vorrangliste kuerzer als JE_ZUG - REIHUM, gehen alle uebrigen
      Plaetze an die anderen. Sonst laege der Zug halb brach, waehrend
      Sender ungelesen warten.
    */
    const fremde = angefragt.filter((u) => !['u0', 'u1'].includes(u));
    assert.equal(fremde.length, JE_ZUG - 2, 'der Zug bleibt voll');
    assert.ok(fremde.length >= REIHUM);
});

test('die Vorrangliste bekommt die Mehrheit der Plaetze', async () => {
    const viele = Array.from({ length: 40 },
        (_x, i) => ({ id: 's' + i, stream: 'u' + i }));
    const beobachtet = viele.slice(0, 20).map((s) => s.id);
    const { laden, angefragt } = bau({ sender: viele, beobachtet });
    await laden.fuelle();
    const menge = new Set(beobachtet.map((id) => 'u' + id.slice(1)));
    const ausVorrang = angefragt.filter((u) => menge.has(u)).length;
    assert.equal(angefragt.length, JE_ZUG);
    assert.equal(ausVorrang, JE_ZUG - REIHUM, 'sieben von zehn');
});

test('ohne Vorrangliste gehen alle Plaetze reihum', async () => {
    const viele = Array.from({ length: 40 },
        (_x, i) => ({ id: 's' + i, stream: 'u' + i }));
    const { laden, angefragt } = bau({ sender: viele, beobachtet: null });
    await laden.fuelle();
    assert.equal(angefragt.length, JE_ZUG);
});

test('ueber mehrere Zuege kommt jeder Sender einmal dran', async () => {
    const uhr = { t: 1_000_000 };
    const viele = Array.from({ length: 12 },
        (_x, i) => ({ id: 's' + i, stream: 'u' + i }));
    const { laden, angefragt } = bau({ sender: viele, beobachtet: ['s0'], uhr });
    for (let i = 0; i < 8; i += 1) { await laden.fuelle(); uhr.t += 1; }
    const erreicht = new Set(angefragt);
    assert.equal(erreicht.size, 12, 'keiner bleibt liegen: ' + [...erreicht].join(','));
});
