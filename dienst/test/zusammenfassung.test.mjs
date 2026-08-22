/*
  Die Zusammenfassung — /api/zusammenfassung.

  Sie ist der einzige Weg, der etwas HERAUSGIBT, ohne dass jemand angemeldet
  ist. Alles, was hier schiefgehen kann, geht in eine von drei Richtungen
  schief, und danach sind diese Tests sortiert:

    1. Der Weg gibt Zahlen heraus, ohne dass der Schluessel stimmt.
    2. Der Weg rechnet bei jedem Abruf neu und verbrennt Geld.
    3. Der Weg liefert eine Null, wenn er in Wahrheit nichts weiss —
       und Saemi-Ra schliesst daraus, seine Werbung habe nicht gewirkt.

  Der wichtigste Test steht ganz unten und heisst „dieselben Abfragen wie das
  Dashboard": Er vergleicht die KQL-Zeichenketten Zeichen fuer Zeichen mit
  infra/dashboard.bicep. Ohne ihn waere die Regel „keine zweite Datenhaltung"
  eine Absichtserklaerung im Kommentar; mit ihm ist sie geprueft.

  Log Analytics wird NICHT angesprochen. Der Abfrager wird hereingereicht,
  wie es der Speicher und der Mailversand in den anderen Tests auch werden —
  ein Test, der ein Netz braucht, prueft am Ende das Netz.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { erzeugeDrossel } from '../src/server.mjs';
import {
    KQL, baueAbfrage, liesFenster, liesSchluessel, schluesselStimmt,
    erzeugeZusammenfassung, formeZusammenfassung, zuZeilen,
    MASCHINENSCHWELLE, FENSTER_VORGABE, ZahlenFehler,
} from '../src/zahlen.mjs';
import { starteTestdienst, fangeProtokoll } from './hilfe.mjs';

const SCHLUESSEL = 'HGvB2q7XmT4pR9wZ0aKcNfLdSjEyUiOx';

/*
  Die Zahlen sind die WIRKLICH GEMESSENEN vom 22.08.2026 (Vorgang #8). Das
  ist kein Zierat: Die Crawlertrennung unten haengt daran, dass zwischen dem
  menschlichen und dem maschinellen Verhaeltnis drei Zehnerpotenzen liegen.
  Ausgedachte Zahlen haetten diese Luecke vielleicht gehabt und vielleicht
  nicht, und der Test haette es nicht gemerkt.
*/
const ZEILEN = {
    startquoteGesamt: [
        { Besucher_geschaetzt: 54, Starts: 202, Starts_je_Besuch: 3.74, Verschiedene_Sender: 24 },
    ],
    startquote: [
        { Tag: '2026-08-22T00:00:00Z', Besucher: 54, Seitenaufrufe: 231, Starts: 90, Starts_je_Besuch: 1.67 },
        { Tag: '2026-08-21T00:00:00Z', Besucher: 48, Seitenaufrufe: 228, Starts: 112, Starts_je_Besuch: 2.33 },
    ],
    sprachen: [
        { Sprache: 'en', Aufrufe: 6269, Besucher: 89 },
        { Sprache: 'de', Aufrufe: 459, Besucher: 54 },
        { Sprache: 'ar', Aufrufe: 323, Besucher: 43 },
        { Sprache: 'fr', Aufrufe: 298, Besucher: 45 },
        { Sprache: 'ja', Aufrufe: 296, Besucher: 43 },
        { Sprache: 'es', Aufrufe: 293, Besucher: 45 },
        { Sprache: 'it', Aufrufe: 291, Besucher: 43 },
    ],
    sprachenGemeldet: [
        { Sprache: 'de', Was: 'start', Ereignisse: 202 },
        { Sprache: 'de', Was: 'filter', Ereignisse: 57 },
        { Sprache: 'de', Was: 'regal', Ereignisse: 12 },
        { Sprache: 'en', Was: 'start', Ereignisse: 1 },
    ],
    ereignisarten: [
        { Was: 'start', TimeGenerated: '2026-08-21T00:00:00Z', Anzahl: 112 },
        { Was: 'start', TimeGenerated: '2026-08-22T00:00:00Z', Anzahl: 90 },
        { Was: 'filter', TimeGenerated: '2026-08-21T00:00:00Z', Anzahl: 31 },
        { Was: 'filter', TimeGenerated: '2026-08-22T00:00:00Z', Anzahl: 26 },
        { Was: 'regal', TimeGenerated: '2026-08-21T00:00:00Z', Anzahl: 22 },
        { Was: 'regal', TimeGenerated: '2026-08-22T00:00:00Z', Anzahl: 23 },
        { Was: 'suche', TimeGenerated: '2026-08-21T00:00:00Z', Anzahl: 1 },
        { Was: 'suche', TimeGenerated: '2026-08-22T00:00:00Z', Anzahl: 2 },
        { Was: 'installiert', TimeGenerated: '2026-08-22T00:00:00Z', Anzahl: 2 },
    ],
    senderListe: [
        { Sender: 'nts-1', Starts: 31, Tage_mit_Start: 2, Zuletzt: '2026-08-22T11:04:00Z' },
        { Sender: 'soma-thetrip', Starts: 24, Tage_mit_Start: 2, Zuletzt: '2026-08-22T09:12:00Z' },
        { Sender: 'stereo-anime', Starts: 12, Tage_mit_Start: 1, Zuletzt: '2026-08-21T18:40:00Z' },
    ],
};

/**
 * Ein Abfrager, der nicht ins Netz geht. `rufe` zaehlt, wie oft wirklich
 * gerechnet wurde — daran haengt der ganze Nachweis, dass der
 * Zwischenspeicher greift.
 */
function attrappe({ scheitert = null, nurDieser = null, verzoegere = null } = {}) {
    const rufe = [];
    return {
        rufe,
        async fuehreAus(name, tage) {
            rufe.push({ name, tage });
            if (verzoegere) await verzoegere;
            if (scheitert && (!nurDieser || nurDieser === name)) throw new ZahlenFehler(scheitert);
            return ZEILEN[name];
        },
    };
}

function baueZahlen(optionen = {}) {
    const abfrager = optionen.abfrager ?? attrappe();
    const zahlen = erzeugeZusammenfassung({
        abfrager,
        schluessel: optionen.schluessel === undefined ? SCHLUESSEL : optionen.schluessel,
        frischeMs: optionen.frischeMs ?? 60 * 60_000,
        uhr: optionen.uhr ?? Date.now,
    });
    return { zahlen, abfrager };
}

const mitSchluessel = (wert = SCHLUESSEL) => ({ kopf: { Authorization: 'Bearer ' + wert } });

// ══ 1. Ohne Schluessel geht nichts hinaus ═══════════════════════════

test('ohne Schluessel: 401', async () => {
    const { zahlen, abfrager } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        const antwort = await d.rufe('GET', '/api/zusammenfassung');
        assert.equal(antwort.status, 401);
        assert.equal(antwort.daten.fehler, 'schluessel_fehlt_oder_falsch');
        // Und vor allem: Es wurde nicht einmal gerechnet.
        assert.equal(abfrager.rufe.length, 0);
    } finally {
        await d.schliesse();
    }
});

test('falscher Schluessel: 401 — und dieselbe Antwort wie ohne', async () => {
    const { zahlen, abfrager } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        const ohne = await d.rufe('GET', '/api/zusammenfassung');
        const falsch = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel('daneben'));

        assert.equal(falsch.status, 401);
        /*
          Woertlich dieselbe Antwort. Ein Unterschied zwischen „fehlt" und
          „falsch" waere die Auskunft, dass es ueberhaupt einen Schluessel
          gibt und wie er heisst.
        */
        assert.deepEqual(falsch.daten, ohne.daten);
        assert.equal(abfrager.rufe.length, 0);
    } finally {
        await d.schliesse();
    }
});

test('ein fast richtiger Schluessel — ein Zeichen daneben — reicht nicht', async () => {
    const { zahlen } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        const knapp = SCHLUESSEL.slice(0, -1) + 'y';
        const antwort = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel(knapp));
        assert.equal(antwort.status, 401);
    } finally {
        await d.schliesse();
    }
});

test('der Schluessel taucht in keiner Protokollzeile auf', async () => {
    const p = fangeProtokoll();
    const { zahlen } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel('geheim-versuch-12345'));
        await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());

        const alles = JSON.stringify(p.zeilen);
        assert.equal(alles.includes(SCHLUESSEL), false);
        assert.equal(alles.includes('geheim-versuch-12345'), false);

        const abgelehnt = p.zeilen.find((z) => z.art === 'zusammenfassung' && z.ergebnis === 'abgelehnt');
        assert.equal(abgelehnt.grund, 'schluessel_falsch');
    } finally {
        p.zurueck();
        await d.schliesse();
    }
});

test('ohne eingerichteten Schluessel steht der Weg NICHT offen', async () => {
    /*
      Der gefaehrlichste Fehler waere, bei fehlender Einrichtung aufzumachen:
      Es funktioniert ja alles, es faellt niemandem auf, und die Zahlen
      liegen offen. Also 424 und ausdruecklich keine Zahlen.
    */
    const { zahlen } = baueZahlen({ schluessel: null });
    const d = await starteTestdienst({ zahlen });
    try {
        const antwort = await d.rufe('GET', '/api/zusammenfassung');
        assert.equal(antwort.status, 424);
        assert.equal(antwort.daten.fehler, 'zusammenfassung_nicht_eingerichtet');
        assert.equal('gesamt' in antwort.daten, false);
    } finally {
        await d.schliesse();
    }
});

test('ohne Zahlenbuendel — der Regelfall im Test — gibt es den Weg nicht', async () => {
    const d = await starteTestdienst();
    try {
        const antwort = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(antwort.status, 424);
        assert.equal(antwort.daten.fehler, 'zusammenfassung_nicht_eingerichtet');
    } finally {
        await d.schliesse();
    }
});

test('eine Sitzung ersetzt den Schluessel nicht', async () => {
    /*
      Wer angemeldet ist, darf seine Merkliste sehen — nicht die
      Geschaeftszahlen. Und ein Weg, der auf ein Plaetzchen hoert, ist ein
      Weg, den eine fremde Seite im Browser eines Angemeldeten aufrufen kann.
    */
    const { zahlen } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        await d.rufe('POST', '/api/anmelden', { mail: 'wer@example.org' });
        const code = d.mails.at(-1).code;
        await d.rufe('POST', '/api/anmelden/code', { mail: 'wer@example.org', code });
        assert.notEqual(d.holePlaetzchen(), null);

        const antwort = await d.rufe('GET', '/api/zusammenfassung');
        assert.equal(antwort.status, 401);
    } finally {
        await d.schliesse();
    }
});

test('der Vergleich haelt Schluessel verschiedener Laenge aus, ohne zu werfen', async () => {
    // timingSafeEqual wirft bei ungleich langen Puffern. Ein Laengenvergleich
    // davor waere selbst die Undichtigkeit — deshalb SHA-256 vorher.
    assert.equal(schluesselStimmt(SCHLUESSEL, 'kurz'), false);
    assert.equal(schluesselStimmt(SCHLUESSEL, SCHLUESSEL + 'x'), false);
    assert.equal(schluesselStimmt(SCHLUESSEL, SCHLUESSEL), true);
    assert.equal(schluesselStimmt('', ''), false);
    assert.equal(schluesselStimmt(SCHLUESSEL, null), false);
    assert.equal(schluesselStimmt(null, SCHLUESSEL), false);
});

test('der Schluessel wird nur als Bearer gelesen', async () => {
    assert.equal(liesSchluessel('Bearer abc'), 'abc');
    assert.equal(liesSchluessel('  Bearer   abc  '), 'abc');
    assert.equal(liesSchluessel('Basic abc'), null);
    assert.equal(liesSchluessel('abc'), null);
    assert.equal(liesSchluessel(undefined), null);
});

test('die Drossel greift, bevor jemand Schluessel durchprobieren kann', async () => {
    const { zahlen } = baueZahlen();
    const d = await starteTestdienst({ zahlen, drossel: erzeugeDrossel() });
    try {
        let gedrosselt = null;
        for (let i = 0; i < 40; i++) {
            const antwort = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel('raten' + i));
            if (antwort.status === 429) { gedrosselt = antwort; break; }
        }
        assert.notEqual(gedrosselt, null, 'nach 40 Versuchen haette die Drossel greifen muessen');
        assert.equal(gedrosselt.daten.fehler, 'zu_viele_versuche');
        assert.notEqual(gedrosselt.kopf.get('retry-after'), null);
    } finally {
        await d.schliesse();
    }
});

// ══ 2. Der Zwischenspeicher ═════════════════════════════════════════

test('der Zwischenspeicher greift beim zweiten Aufruf', async () => {
    const { zahlen, abfrager } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        const erste = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(erste.status, 200);
        assert.equal(abfrager.rufe.length, 6, 'sechs Abfragen beim ersten Mal');

        const zweite = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(zweite.status, 200);
        assert.equal(abfrager.rufe.length, 6, 'beim zweiten Mal wird NICHT neu gerechnet');

        // Und es sind wirklich dieselben Zahlen, nicht bloss derselbe Status.
        assert.equal(zweite.daten.gerechnet_um, erste.daten.gerechnet_um);
        assert.equal(zweite.daten.gesamt.starts, 202);
    } finally {
        await d.schliesse();
    }
});

test('im JSON steht, WANN gerechnet wurde', async () => {
    let jetzt = Date.parse('2026-08-22T12:00:00Z');
    const { zahlen, abfrager } = baueZahlen({ uhr: () => jetzt });
    const d = await starteTestdienst({ zahlen });
    try {
        const erste = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(erste.daten.gerechnet_um, '2026-08-22T12:00:00.000Z');
        assert.equal(erste.daten.alter_sekunden, 0);
        assert.equal(erste.daten.frisch, true);

        // Eine halbe Stunde spaeter: dieselbe Zahl, aber sie gibt sich als
        // halbstuendig zu erkennen. Ohne das haelt der Leser sie fuer frisch.
        jetzt += 30 * 60_000;
        const zweite = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(zweite.daten.gerechnet_um, '2026-08-22T12:00:00.000Z');
        assert.equal(zweite.daten.alter_sekunden, 1800);
        assert.equal(abfrager.rufe.length, 6);
    } finally {
        await d.schliesse();
    }
});

test('nach einer Stunde wird neu gerechnet', async () => {
    let jetzt = Date.parse('2026-08-22T12:00:00Z');
    const { zahlen, abfrager } = baueZahlen({ uhr: () => jetzt, frischeMs: 60 * 60_000 });
    const d = await starteTestdienst({ zahlen });
    try {
        await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(abfrager.rufe.length, 6);

        jetzt += 59 * 60_000;
        await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(abfrager.rufe.length, 6, 'nach 59 Minuten noch nicht');

        jetzt += 2 * 60_000;
        const frisch = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(abfrager.rufe.length, 12, 'nach 61 Minuten schon');
        assert.equal(frisch.daten.gerechnet_um, '2026-08-22T13:01:00.000Z');
    } finally {
        await d.schliesse();
    }
});

test('jedes Fenster hat einen eigenen Eintrag', async () => {
    const { zahlen, abfrager } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        const einer = await d.rufe('GET', '/api/zusammenfassung?tage=1', undefined, mitSchluessel());
        assert.equal(einer.daten.fenster_tage, 1);
        assert.equal(abfrager.rufe.length, 6);
        assert.equal(abfrager.rufe.every((r) => r.tage === 1), true);

        await d.rufe('GET', '/api/zusammenfassung?tage=30', undefined, mitSchluessel());
        assert.equal(abfrager.rufe.length, 12);

        // Und das erste Fenster ist davon unberuehrt.
        await d.rufe('GET', '/api/zusammenfassung?tage=1', undefined, mitSchluessel());
        assert.equal(abfrager.rufe.length, 12);
    } finally {
        await d.schliesse();
    }
});

test('zwei gleichzeitige Abrufe rechnen EINMAL', async () => {
    let loese;
    const warte = new Promise((f) => { loese = f; });
    const abfrager = attrappe({ verzoegere: warte });
    const { zahlen } = baueZahlen({ abfrager });
    const d = await starteTestdienst({ zahlen });
    try {
        const beide = Promise.all([
            d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel()),
            d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel()),
        ]);
        loese();
        const [a, b] = await beide;

        assert.equal(a.status, 200);
        assert.equal(b.status, 200);
        assert.equal(abfrager.rufe.length, 6, 'zwoelf waeren es ohne den einen Zug je Fenster');
    } finally {
        await d.schliesse();
    }
});

test('ein unbekanntes Fenster faellt still auf die Vorgabe zurueck', async () => {
    // Wer sich vertippt, soll Zahlen bekommen — und `tage=3650` waere eine
    // Aufforderung an Log Analytics, alles zu lesen, was da ist.
    assert.equal(liesFenster('/api/zusammenfassung?tage=3650'), FENSTER_VORGABE);
    assert.equal(liesFenster('/api/zusammenfassung?tage=abc'), FENSTER_VORGABE);
    assert.equal(liesFenster('/api/zusammenfassung'), FENSTER_VORGABE);
    assert.equal(liesFenster('/api/zusammenfassung?tage=1'), 1);
    assert.equal(liesFenster('/api/zusammenfassung?tage=7'), 7);
    assert.equal(liesFenster('/api/zusammenfassung?tage=30'), 30);
});

// ══ 3. Ausfall heisst Ausfall, nicht Null ═══════════════════════════

test('faellt die Quelle aus und liegt nichts da: 424 mit ehrlicher Meldung', async () => {
    const abfrager = attrappe({ scheitert: 'nicht_erreichbar' });
    const { zahlen } = baueZahlen({ abfrager });
    const d = await starteTestdienst({ zahlen });
    try {
        const antwort = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());

        /*
          424 und ausdruecklich NICHT 503. deploy/nginx.conf hat im Block
          `location /api/` ein `proxy_intercept_errors on;` mit
          `error_page 502 503 504 = @dienst_schlaeft;` — eine 503 von hier
          kaeme beim Aufrufer als `{"fehler":"dienst_schlaeft"}` an und zeigte
          damit auf die falsche Ursache. Wer diesen Test rot macht, indem er
          auf 503 zurueckstellt, nimmt Saemi-Ras Beobachtung die Wahrheit weg.
        */
        assert.equal(antwort.status, 424);
        assert.notEqual(antwort.status, 503);
        assert.equal(antwort.daten.fehler, 'quelle_nicht_erreichbar');
        assert.equal(antwort.daten.grund, 'nicht_erreichbar');
        assert.equal(antwort.kopf.get('retry-after'), '60');

        /*
          DER KERN DIESES TESTS: nirgends eine Null, die man fuer eine
          Messung halten koennte. Keine `gesamt`, keine `starts`, keine
          `aufrufe` — die Antwort sagt, dass sie nichts weiss.
        */
        assert.equal('gesamt' in antwort.daten, false);
        assert.equal('je_tag' in antwort.daten, false);
        assert.equal('ereignisarten' in antwort.daten, false);
        assert.equal(JSON.stringify(antwort.daten).includes(': 0'), false);
        assert.match(antwort.daten.hinweis, /NICHT dasselbe wie null Aufrufe/);
    } finally {
        await d.schliesse();
    }
});

test('faellt die Quelle aus und liegt ein alter Stand da: der Stand, als alt gekennzeichnet', async () => {
    let jetzt = Date.parse('2026-08-22T12:00:00Z');
    let kaputt = false;
    const rufe = [];
    const abfrager = {
        rufe,
        async fuehreAus(name, tage) {
            rufe.push({ name, tage });
            if (kaputt) throw new ZahlenFehler('nicht_erreichbar');
            return ZEILEN[name];
        },
    };
    const { zahlen } = baueZahlen({ abfrager, uhr: () => jetzt });
    const d = await starteTestdienst({ zahlen });
    try {
        const gut = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(gut.daten.frisch, true);
        assert.equal(gut.daten.gesamt.starts, 202);

        kaputt = true;
        jetzt += 61 * 60_000;   // die Frische ist abgelaufen, es wird gerechnet
        const alt = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());

        assert.equal(alt.status, 200);
        // Die Zahlen sind noch da — und sie geben sich als alt zu erkennen.
        assert.equal(alt.daten.gesamt.starts, 202);
        assert.equal(alt.daten.frisch, false);
        assert.equal(alt.daten.stoerung, 'nicht_erreichbar');
        assert.equal(alt.daten.alter_sekunden, 3660);
        assert.equal(alt.daten.gerechnet_um, '2026-08-22T12:00:00.000Z');
    } finally {
        await d.schliesse();
    }
});

test('faellt EINE von sechs Abfragen aus, kommen die uebrigen fuenf', async () => {
    const abfrager = attrappe({ scheitert: 'nicht_erreichbar', nurDieser: 'senderListe' });
    const { zahlen } = baueZahlen({ abfrager });
    const d = await starteTestdienst({ zahlen });
    try {
        const antwort = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());

        assert.equal(antwort.status, 200);
        assert.equal(antwort.daten.gesamt.starts, 202);
        // Der ausgefallene Block ist null — nicht eine leere Liste, die man
        // fuer „kein Sender wurde gestartet" halten koennte.
        assert.equal(antwort.daten.sender_oben, null);
        assert.deepEqual(antwort.daten.unvollstaendig,
            [{ block: 'senderListe', grund: 'nicht_erreichbar' }]);
    } finally {
        await d.schliesse();
    }
});

test('ein abgelehnter Ausweis wird als solcher gemeldet, nicht als leer', async () => {
    // Fehlt der Identitaet die Rolle „Log Analytics Reader", antwortet die
    // API 403. Das darf nicht aussehen wie „keine Daten".
    const abfrager = attrappe({ scheitert: 'abgelehnt' });
    const { zahlen } = baueZahlen({ abfrager });
    const d = await starteTestdienst({ zahlen });
    try {
        const antwort = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        assert.equal(antwort.status, 424);
        assert.equal(antwort.daten.grund, 'abgelehnt');
    } finally {
        await d.schliesse();
    }
});

// ══ 4. Was in der Antwort steht ═════════════════════════════════════

test('alles, wonach Saemi-Ra gefragt hat, steht drin', async () => {
    const { zahlen } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        const { daten } = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());

        // Seine wichtigste Zahl: Starts je Besuch.
        assert.equal(daten.gesamt.starts, 202);
        assert.equal(daten.gesamt.starts_je_besuch, 3.74);
        assert.equal(daten.gesamt.verschiedene_sender, 24);

        // Seitenaufrufe und Besucher je Tag.
        assert.equal(daten.je_tag.length, 2);
        assert.deepEqual(daten.je_tag[0], {
            tag: '2026-08-22', aufrufe: 231, besucher_geschaetzt: 54,
            starts: 90, starts_je_besuch: 1.67,
        });

        // Die uebrigen Ereignisarten, ueber die Tage aufaddiert.
        assert.deepEqual(daten.ereignisarten, {
            start: 202, filter: 57, regal: 45, suche: 3, installiert: 2,
        });

        // Die meistgestarteten Sender.
        assert.equal(daten.sender_oben[0].sender, 'nts-1');
        assert.equal(daten.sender_oben[0].starts, 31);

        // Die sieben Sprachfassungen.
        assert.equal(daten.je_sprache.length, 7);
        assert.equal(daten.unvollstaendig.length, 0);
    } finally {
        await d.schliesse();
    }
});

test('„Besucher" heisst ueberall „geschaetzt" und wird als Schaetzung erklaert', async () => {
    const { zahlen } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        const { daten } = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());

        /*
          KEIN Zahlenfeld heisst blank `besucher`. Es taeuschte eine
          Zaehlung vor, die es nicht gibt — die Messzeilen tragen kein
          Adressfeld, die Quelle ist eine gekuerzte Adresse.
        */
        const traeger = [daten.gesamt, ...daten.je_tag, ...daten.je_sprache, daten.menschlich];
        for (const objekt of traeger) {
            assert.equal('besucher' in objekt, false, 'blankes `besucher` gefunden');
        }
        assert.equal(typeof daten.gesamt.besucher_geschaetzt, 'number');
        assert.match(daten.hinweise.besucher, /Schaetzung, keine Zaehlung/);
        assert.match(daten.hinweise.besucher, /gekuerzter Adresse/);
        assert.match(daten.hinweise.quelle, /dashboard\.bicep/);
    } finally {
        await d.schliesse();
    }
});

// ══ 5. Die Crawlertrennung ══════════════════════════════════════════

test('Crawler werden getrennt — an den Messereignissen, nicht an der Aufrufzahl', async () => {
    const { zahlen } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        const { daten } = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        const je = Object.fromEntries(daten.je_sprache.map((s) => [s.sprache, s]));

        // Deutsch: 271 Ereignisse auf 459 Aufrufe. Menschen.
        assert.equal(je.de.ereignisse, 271);
        assert.equal(je.de.maschinenverkehr, false);

        // Englisch: 6.269 Aufrufe, EIN Ereignis. Siebzig Seiten je Adresse.
        assert.equal(je.en.aufrufe, 6269);
        assert.equal(je.en.ereignisse, 1);
        assert.equal(je.en.maschinenverkehr, true);

        // Die uebrigen fuenf: kein einziges Ereignis.
        for (const sprache of ['fr', 'es', 'it', 'ja', 'ar']) {
            assert.equal(je[sprache].ereignisse, 0);
            assert.equal(je[sprache].maschinenverkehr, true);
        }

        // Die bereinigte Summe: nur Deutsch.
        assert.deepEqual(daten.menschlich.sprachen, ['de']);
        assert.equal(daten.menschlich.besucher_geschaetzt, 54);
        assert.equal(daten.menschlich.aufrufe, 459);
        assert.equal(daten.menschlich.ereignisse, 271);
    } finally {
        await d.schliesse();
    }
});

test('die Rohzahlen bleiben vollstaendig stehen — nichts wird weggeworfen', async () => {
    /*
      Ein Mensch, der die englische Fassung liest und nichts anklickt, faellt
      mit den Crawlern zusammen unter den Tisch. Deshalb wird gekennzeichnet
      und nicht geloescht: Wer nachrechnen will, kann es.
    */
    const { zahlen } = baueZahlen();
    const d = await starteTestdienst({ zahlen });
    try {
        const { daten } = await d.rufe('GET', '/api/zusammenfassung', undefined, mitSchluessel());
        const summe = daten.je_sprache.reduce((s, x) => s + x.aufrufe, 0);
        assert.equal(summe, 6269 + 459 + 323 + 298 + 296 + 293 + 291);
        assert.match(daten.hinweise.aufrufe, /enthalten\s+Crawler/);
    } finally {
        await d.schliesse();
    }
});

test('die Aufrufzahl je Adresse taugt NICHT als Trenner — deshalb wird sie nicht benutzt', () => {
    /*
      Der Nachweis, warum das naheliegende Verfahren verworfen wurde. Er
      steht als Test da, damit ihn niemand aus Versehen wieder einbaut.
    */
    const jeAdresse = (aufrufe, besucher) => aufrufe / besucher;
    const de = jeAdresse(459, 54);      // 8,5 — Menschen
    const fr = jeAdresse(298, 45);      // 6,6 — Crawler
    assert.ok(de > fr, 'die Menschen liegen HOEHER als die Crawler — jede Schwelle waere falsch');

    // Das benutzte Verfahren trennt dagegen um drei Zehnerpotenzen.
    const jeAufruf = (ereignisse, aufrufe) => ereignisse / aufrufe;
    assert.ok(jeAufruf(271, 459) > MASCHINENSCHWELLE * 10);
    assert.ok(jeAufruf(1, 6269) < MASCHINENSCHWELLE / 100);
    assert.ok(jeAufruf(0, 298) < MASCHINENSCHWELLE);
});

test('kommen die englischsprachigen Menschen, kippt „en" von allein', async () => {
    /*
      Die gute Eigenschaft des Verfahrens: Es gibt keine Crawlerliste, die
      jemand nachpflegen muesste. Steigt das Verhaeltnis, zaehlt die Sprache
      ab dem naechsten Rechnen mit.
    */
    const ergebnisse = {
        startquoteGesamt: { zeilen: ZEILEN.startquoteGesamt },
        startquote: { zeilen: ZEILEN.startquote },
        ereignisarten: { zeilen: ZEILEN.ereignisarten },
        senderListe: { zeilen: ZEILEN.senderListe },
        sprachen: { zeilen: [{ Sprache: 'en', Aufrufe: 6500, Besucher: 140 }] },
        sprachenGemeldet: { zeilen: [{ Sprache: 'en', Was: 'start', Ereignisse: 400 }] },
    };
    const daten = formeZusammenfassung({ ergebnisse, tage: 30, gerechnetUm: Date.now() });

    assert.equal(daten.je_sprache[0].maschinenverkehr, false);
    assert.deepEqual(daten.menschlich.sprachen, ['en']);
});

// ══ 6. Keine zweite Datenhaltung ════════════════════════════════════

test('das Fenster wird an ALLEN Stellen gesetzt, auch im toscalar-Block', () => {
    /*
      `startquoteGesamt` enthaelt `ago(30d)` zweimal. Bliebe eines stehen,
      teilte die Kennzahl Starts aus einem Tag durch Besucher aus dreissig —
      ein Dreissigstel des richtigen Werts, und nichts daran saehe kaputt aus.
    */
    const abfrage = baueAbfrage('startquoteGesamt', 1);
    assert.equal(abfrage.includes('ago(30d)'), false);
    assert.equal(abfrage.split('ago(1d)').length - 1, 2);
});

test('render faellt weg, sonst nichts', () => {
    const mit = KQL.sprachen;
    const ohne = baueAbfrage('sprachen', 30);
    assert.equal(mit.includes('| render piechart'), true);
    assert.equal(ohne.includes('| render'), false);
    // Und der Rest ist unangetastet.
    assert.equal(ohne + '\n| render piechart', mit);
});

test('dieselben Abfragen wie das Dashboard — Zeichen fuer Zeichen', async (t) => {
    /*
      DER TEST, DER DIE REGEL „KEINE ZWEITE DATENHALTUNG" TRAEGT.

      Ohne ihn ist sie eine Absichtserklaerung in einem Kommentar. Mit ihm
      faellt es auf, sobald jemand eine Abfrage im Dashboard aendert und die
      hier vergisst — und dann zeigen Dashboard und Weg verschiedene Zahlen,
      ohne dass es jemandem auffiele.

      Die Bicep-Datei liegt ausserhalb von dienst/. Fehlt sie — etwa weil
      jemand nur den Dienst ausgecheckt hat —, wird uebersprungen und gesagt
      warum, statt rot zu werden.
    */
    const pfad = fileURLToPath(new URL('../../infra/dashboard.bicep', import.meta.url));
    let quelle;
    try {
        quelle = await readFile(pfad, 'utf8');
    } catch {
        t.skip('infra/dashboard.bicep nicht vorhanden — nur der Dienst ausgecheckt?');
        return;
    }

    /*
      Die Vorrede steht in der Bicep-Datei als `var ereignisse` und wird dort
      per `${ereignisse}` vorangestellt. Hier wird sie genauso eingesetzt,
      damit sich die vollstaendigen Zeichenketten vergleichen lassen.
    */
    const vorrede = /^var ereignisse = '(.*)'$/m.exec(quelle);
    assert.notEqual(vorrede, null, 'var ereignisse nicht gefunden');

    for (const name of Object.keys(KQL)) {
        const treffer = new RegExp(`^  ${name}: '(.*)'$`, 'm').exec(quelle);
        assert.notEqual(treffer, null, `${name} steht nicht in dashboard.bicep`);

        // Bicep und JavaScript schreiben beide `\n` fuer den Umbruch und
        // `\'` fuer das Anfuehrungszeichen — mehr Umrechnung braucht es nicht.
        const ausDemDashboard = treffer[1]
            .replaceAll('${ereignisse}', vorrede[1])
            .replaceAll('\\n', '\n')
            .replaceAll("\\'", "'");

        assert.equal(KQL[name], ausDemDashboard,
            `${name} weicht vom Dashboard ab — eine der beiden Fassungen ist falsch`);
    }
});

test('Spalten werden ueber den Namen gelesen, nicht ueber den Index', () => {
    // Ein `| project` in anderer Reihenfolge wuerde bei Indexzugriff still
    // die falschen Werte liefern.
    const tabelle = {
        columns: [{ name: 'Starts' }, { name: 'Sender' }],
        rows: [[31, 'nts-1'], [24, 'soma-thetrip']],
    };
    assert.deepEqual(zuZeilen(tabelle), [
        { Starts: 31, Sender: 'nts-1' },
        { Starts: 24, Sender: 'soma-thetrip' },
    ]);
    assert.deepEqual(zuZeilen(undefined), []);
    assert.deepEqual(zuZeilen({ columns: [{ name: 'A' }], rows: [] }), []);
});
