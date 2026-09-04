/*
  Die beiden Messwerkzeuge — Gegenstelle zu 432hz-radio#21.

  Wie bei der Umfrage sind es genau zwei Dinge, die hier schützen: die
  Erlaubnisliste und die Drossel. Also prüfen diese Tests genau die beiden,
  und zwar von außen über HTTP — nicht an der Funktion vorbei. Statuscodes,
  Weiche und Herkunftsprüfung sind die Stellen, an denen die Fehler
  entstehen, und ein Test mit nachgebauten Anfrageobjekten lässt sie alle
  aus.

  Der wichtigste Test steht ganz unten und heißt „ein Angriff": Er wirft
  alles hinein, was in einer anonymen Messung nie landen darf, und weist
  nach, dass es weder in der Tabelle noch im Protokoll wieder auftaucht.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeDrossel } from '../src/server.mjs';
import {
    TABELLE_HOERTEST, TABELLE_STIMMUNG, speicherImArbeitsspeicher,
} from '../src/speicher.mjs';
import {
    saeubereHoertest, saeubereStimmung, legeHoertestAb, legeStimmungAb,
    A4_MINDESTENS, A4_HOECHSTENS,
} from '../src/rueckmeldung.mjs';
import { starteTestdienst, fangeProtokoll } from './hilfe.mjs';

/** Alle Zeilen einer Tabelle, über alle Tagespartitionen hinweg. */
async function zeilen(speicher, tabelle) {
    const raus = [];
    for await (const zeile of speicher.listeAlle(tabelle)) raus.push(zeile);
    return raus;
}

const RUNDE = { runde: '432-433', treffer: 3, wahl_a: 2, sprache: 'de' };
const MESSUNG = {
    a4: 432.1, sicherheit: 0.87, traegt: true,
    laenge: 'bis10min', kanaele: 2, endung: 'flac', sprache: 'de',
};

// ── Die Erlaubnisliste, an der Funktion ─────────────────────────────

test('Hörtest: ein vollständiges Paket kommt vollständig durch', () => {
    assert.deepEqual(saeubereHoertest(RUNDE), RUNDE);
});

test('Hörtest: ohne Runde oder ohne Treffer bleibt nichts übrig', () => {
    // Ohne die beiden ist die Zeile keine Beobachtung, sondern ein leerer
    // Platz — und ein leerer Platz gehört nicht in die Tabelle.
    assert.deepEqual(saeubereHoertest({ treffer: 3, wahl_a: 2 }), {});
    assert.deepEqual(saeubereHoertest({ runde: '432-433', wahl_a: 2 }), {});
    assert.deepEqual(saeubereHoertest({ runde: 'ausgedacht', treffer: 3 }), {});
});

test('Hörtest: Beigaben dürfen fehlen, die Messung bleibt gültig', () => {
    assert.deepEqual(saeubereHoertest({ runde: '432-440', treffer: 0 }),
                     { runde: '432-440', treffer: 0 });
});

test('Hörtest: mehr Treffer als Durchgänge fällt weg', () => {
    // 5 Durchgänge, also 0..5. Eine 6 ist kein hoher Wert, sondern ein
    // kaputtes Paket — und ein kaputtes Paket verschiebt den Mittelwert.
    assert.deepEqual(saeubereHoertest({ runde: '432-433', treffer: 6 }), {});
    assert.deepEqual(saeubereHoertest({ runde: '432-433', treffer: -1 }), {});
    assert.equal(saeubereHoertest({ runde: '432-433', treffer: 2, wahl_a: 9 }).wahl_a,
                 undefined);
});

test('Messung: ein vollständiges Paket kommt vollständig durch', () => {
    assert.deepEqual(saeubereStimmung(MESSUNG), MESSUNG);
});

test('Messung: a4 außerhalb des Bereichs fällt weg, mitsamt der Zeile', () => {
    assert.deepEqual(saeubereStimmung({ ...MESSUNG, a4: A4_MINDESTENS - 0.1 }), {});
    assert.deepEqual(saeubereStimmung({ ...MESSUNG, a4: A4_HOECHSTENS + 0.1 }), {});
});

test('Messung: Zahlen werden auf die vereinbarten Stellen gerundet', () => {
    /*
      Nicht Kosmetik. Eine Zahl mit fünfzehn Nachkommastellen unterscheidet
      ihre Zeile von allen anderen — 432,1 teilen sich viele, 432,10437219
      hat genau einer. Derselbe Gedanke wie beim Weglassen des Dateinamens.
    */
    const sauber = saeubereStimmung({ a4: 432.10437219, sicherheit: 0.876543 });
    assert.equal(sauber.a4, 432.1);
    assert.equal(sauber.sicherheit, 0.88);
});

test('Messung: Zeichenketten sind keine Zahlen', () => {
    /*
      `Number("432,1")` ist NaN, `Number("")` ist 0, `Number([432])` ist 432.
      Wer Bereiche gegen umgewandelte Werte prüft, lässt genau die Fälle
      durch, die er sucht. Deshalb nur `number`.
    */
    assert.deepEqual(saeubereStimmung({ a4: '432.1', sicherheit: 0.9 }), {});
    assert.deepEqual(saeubereStimmung({ a4: [432], sicherheit: 0.9 }), {});
    assert.deepEqual(saeubereStimmung({ a4: NaN, sicherheit: 0.9 }), {});
    assert.deepEqual(saeubereStimmung({ a4: Infinity, sicherheit: 0.9 }), {});
});

test('Messung: traegt wird übernommen, nicht nachgerechnet', () => {
    /*
      `traegt` sagt nicht, ob die Messung gut war, sondern OB DER BESUCHER
      EINE ZAHL GESEHEN HAT. Die Schwelle dafür gehört der Oberfläche. Eine
      hier nachgerechnete Fassung erzählte etwas anderes als der Bildschirm.
    */
    assert.equal(saeubereStimmung({ a4: 432.0, sicherheit: 0.1, traegt: false }).traegt, false);
    assert.equal(saeubereStimmung({ a4: 432.0, sicherheit: 0.9, traegt: true }).traegt, true);
    // Kein Wahrheitswert: das Feld fällt weg, die Messung bleibt.
    const ohne = saeubereStimmung({ a4: 432.0, sicherheit: 0.9, traegt: 'ja' });
    assert.equal(ohne.traegt, undefined);
    assert.equal(ohne.a4, 432.0);
});

// ── Die Wege, über HTTP ─────────────────────────────────────────────

test('POST /api/hoertest legt eine Zeile ab und antwortet 204', async (t) => {
    const dienst = await starteTestdienst();
    t.after(() => dienst.schliesse());

    const antwort = await dienst.rufe('POST', '/api/hoertest', RUNDE);
    assert.equal(antwort.status, 204, 'nur 204 gilt — die Oberflaeche prueft genau darauf');

    const abgelegt = await zeilen(dienst.speicher, TABELLE_HOERTEST);
    assert.equal(abgelegt.length, 1);
    assert.equal(abgelegt[0].runde, '432-433');
    assert.equal(abgelegt[0].treffer, 3);
    assert.match(abgelegt[0].partitionKey, /^\d{4}-\d{2}-\d{2}$/, 'Partition ist der Tag');
});

test('POST /api/stimmung legt eine Zeile ab und antwortet 204', async (t) => {
    const dienst = await starteTestdienst();
    t.after(() => dienst.schliesse());

    assert.equal((await dienst.rufe('POST', '/api/stimmung', MESSUNG)).status, 204);

    const abgelegt = await zeilen(dienst.speicher, TABELLE_STIMMUNG);
    assert.equal(abgelegt.length, 1);
    assert.equal(abgelegt[0].a4, 432.1);
    assert.equal(abgelegt[0].endung, 'flac');
});

test('Die beiden Tabellen bleiben getrennt', async (t) => {
    /*
      Ein Hoertest und eine Messung aus derselben Sitzung duerfen nicht
      zusammenfindbar sein. Eine gemeinsame Tabelle mit einem Feld `art`
      laedt genau dazu ein.
    */
    const dienst = await starteTestdienst();
    t.after(() => dienst.schliesse());

    await dienst.rufe('POST', '/api/hoertest', RUNDE);
    await dienst.rufe('POST', '/api/stimmung', MESSUNG);

    assert.equal((await zeilen(dienst.speicher, TABELLE_HOERTEST)).length, 1);
    assert.equal((await zeilen(dienst.speicher, TABELLE_STIMMUNG)).length, 1);
    for (const zeile of await zeilen(dienst.speicher, TABELLE_HOERTEST)) {
        assert.equal(zeile.a4, undefined, 'keine Messfelder im Hoertest');
    }
    for (const zeile of await zeilen(dienst.speicher, TABELLE_STIMMUNG)) {
        assert.equal(zeile.runde, undefined, 'keine Hoertestfelder in der Messung');
    }
});

test('Ein leeres Paket wird abgelehnt, statt ein Danke zu verdienen', async (t) => {
    /*
      Der Fall aus #5: Eine Gegenstelle, die 200 mit einer HTML-Seite
      antwortet, laesst die Oberflaeche „Danke" zeigen und die Antwort
      wegwerfen. Schlimmer als ein Fehler, weil es niemand merkt.
    */
    const dienst = await starteTestdienst();
    t.after(() => dienst.schliesse());

    for (const pfad of ['/api/hoertest', '/api/stimmung']) {
        const antwort = await dienst.rufe('POST', pfad, {});
        assert.equal(antwort.status, 400, pfad);
        assert.equal(antwort.daten.fehler, 'nichts_erkannt', pfad);
    }
    assert.equal((await zeilen(dienst.speicher, TABELLE_HOERTEST)).length, 0);
    assert.equal((await zeilen(dienst.speicher, TABELLE_STIMMUNG)).length, 0);
});

test('Fremde Herkunft kommt nicht durch', async (t) => {
    const dienst = await starteTestdienst();
    t.after(() => dienst.schliesse());

    for (const pfad of ['/api/hoertest', '/api/stimmung']) {
        const antwort = await dienst.rufe('POST', pfad, RUNDE,
            { kopf: { Origin: 'https://boeswillig.example' } });
        assert.equal(antwort.status, 403, pfad);
        assert.equal(antwort.daten.fehler, 'herkunft_fremd', pfad);
    }
});

test('Die Drossel greift je Netz', async (t) => {
    const dienst = await starteTestdienst({ drossel: erzeugeDrossel() });
    t.after(() => dienst.schliesse());

    let gedrosselt = 0;
    for (let i = 0; i < 14; i++) {
        const antwort = await dienst.rufe('POST', '/api/hoertest', RUNDE);
        if (antwort.status === 429) {
            ++gedrosselt;
            assert.ok(antwort.kopf.get('retry-after'), 'Retry-After gehoert dazu');
        }
    }
    assert.ok(gedrosselt >= 4, `nach zehn Runden wird gedrosselt (gedrosselt: ${gedrosselt})`);
});

test('Die Schlüssel gewinnen gegen die Felder, auch an der Liste vorbei', async () => {
    /*
      Die zweite Reihe, und sie wird hier ABSICHTLICH ohne die
      Erlaubnisliste geprueft.

      Ueber HTTP ist sie nicht zu erreichen: `saeubereStimmung` nimmt einen
      `partitionKey` schon weg, bevor `legeStimmungAb` ihn saehe. Ein Test
      ueber HTTP bestuende deshalb auch dann, wenn die Reihenfolge im
      Ablegen falsch waere — beim Mutationslauf am 04.09.2026 tat er das
      auch, und genau daran ist aufgefallen, dass er nichts prueft.

      Die Reihenfolge ist fuer den Tag gebaut, an dem jemand die Liste um
      ein unglueckliches Feld erweitert. Also wird sie so geprueft, wie sie
      dann getroffen wuerde: an der Liste vorbei, direkt.
    */
    const speicher = speicherImArbeitsspeicher();
    await legeStimmungAb(speicher, {
        a4: 432.0, sicherheit: 0.9,
        partitionKey: 'fremde-partition', rowKey: 'fremde-zeile',
    });

    const [zeile] = await zeilen(speicher, TABELLE_STIMMUNG);
    assert.notEqual(zeile.partitionKey, 'fremde-partition');
    assert.notEqual(zeile.rowKey, 'fremde-zeile');
    assert.match(zeile.partitionKey, /^\d{4}-\d{2}-\d{2}$/);

    const speicher2 = speicherImArbeitsspeicher();
    await legeHoertestAb(speicher2, {
        runde: '432-440', treffer: 1, partitionKey: 'fremde-partition',
    });
    assert.notEqual((await zeilen(speicher2, TABELLE_HOERTEST))[0].partitionKey,
                    'fremde-partition');
});

// ── Ein Angriff ─────────────────────────────────────────────────────

test('Ein Angriff: nichts Fremdes kommt in die Tabelle oder ins Protokoll', async (t) => {
    const dienst = await starteTestdienst();
    t.after(() => dienst.schliesse());
    const protokoll = fangeProtokoll();
    t.after(() => protokoll.zurueck());

    /*
      Alles, was in einer anonymen Messung nie landen darf — und dazu die
      beiden Schluessel, mit denen jemand in fremde Zeilen schriebe.
    */
    const boese = {
        ...MESSUNG,
        dateiname: 'Privat 2019.flac',
        titel: 'etwas, das nur einer besitzt',
        mail: 'jemand@example.com',
        kennung: 'abc-123',
        ip: '203.0.113.7',
        partitionKey: 'fremde-partition',
        rowKey: 'fremde-zeile',
        __proto__: { geerbt: 'ja' },
    };

    assert.equal((await dienst.rufe('POST', '/api/stimmung', boese)).status, 204);

    const abgelegt = await zeilen(dienst.speicher, TABELLE_STIMMUNG);
    assert.equal(abgelegt.length, 1);
    const zeile = abgelegt[0];

    for (const feld of ['dateiname', 'titel', 'mail', 'kennung', 'ip', 'geerbt']) {
        assert.equal(zeile[feld], undefined, `${feld} darf nicht in der Zeile stehen`);
    }
    assert.notEqual(zeile.partitionKey, 'fremde-partition',
                    'der Absender darf sich seine Partition nicht aussuchen');
    assert.notEqual(zeile.rowKey, 'fremde-zeile');
    assert.match(zeile.partitionKey, /^\d{4}-\d{2}-\d{2}$/);

    // Und dasselbe fuer das Protokoll: die ANZAHL der Felder darf darin
    // stehen, kein Wert daraus.
    const text = JSON.stringify(protokoll.zeilen);
    for (const wort of ['Privat 2019', 'jemand@example.com', 'abc-123', '203.0.113.7', '432.1']) {
        assert.ok(!text.includes(wort), `„${wort}" hat im Protokoll nichts verloren`);
    }
    assert.ok(protokoll.zeilen.some((z) => z.art === 'stimmung' && z.ergebnis === 'ok'));
});
