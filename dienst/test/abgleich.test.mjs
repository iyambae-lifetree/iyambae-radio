/*
  Die Merkliste. Der Fall aus dem Bericht steht hier als erster Test, weil
  er der Grund fuer die ganze Bauart ist.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    verschmelzePlatten, nurDrin, istDrin, saeubereEintraege, raeumeGrabsteine,
    beschneide, verschmelzeVerlauf, saeubereVerlauf, HOECHSTENS_EINTRAEGE,
} from '../src/abgleich.mjs';

const liste = (praefix, anzahl, zeit) => {
    const e = {};
    for (let i = 0; i < anzahl; i++) e[praefix + i] = { a: zeit, e: null };
    return e;
};

test('zwanzig auf A, fuenfzehn andere auf B ergeben fuenfunddreissig', () => {
    const a = liste('a', 20, 1_700_000_000_000);
    const b = liste('b', 15, 1_700_000_100_000);

    assert.equal(nurDrin(verschmelzePlatten(a, b)).length, 35);
});

test('und zwar unabhaengig von der Reihenfolge', () => {
    const a = liste('a', 20, 1_700_000_000_000);
    const b = liste('b', 15, 1_700_000_100_000);

    const ab = verschmelzePlatten(a, b);
    const ba = verschmelzePlatten(b, a);

    assert.equal(nurDrin(ba).length, 35);
    // Nicht bloss gleich viele — dieselben, mit denselben Zeitstempeln.
    assert.deepEqual(ab, ba);
});

test('auf A entfernt schlaegt auf B noch bekannt, wenn B aelter ist', () => {
    const aufA = { nts1: { a: 1000, e: 5000 } };      // gemerkt, dann weggeworfen
    const aufB = { nts1: { a: 1000, e: null } };      // B hat das Wegwerfen nie gesehen

    const zusammen = verschmelzePlatten(aufA, aufB);

    assert.equal(istDrin(zusammen.nts1), false, 'ein Grabstein darf nicht wiederauferstehen');
    assert.deepEqual(nurDrin(zusammen), []);
    assert.deepEqual(verschmelzePlatten(aufB, aufA), zusammen, 'auch andersherum');
});

test('wer nach dem Wegwerfen erneut merkt, bekommt den Sender zurueck', () => {
    // Genau der Fall, den ein reines „einmal weg, immer weg" kaputtmachen
    // wuerde: a ist juenger als e, also gilt das Merken.
    const zusammen = verschmelzePlatten(
        { nts1: { a: 9000, e: 5000 } },
        { nts1: { a: 1000, e: 5000 } });

    assert.equal(istDrin(zusammen.nts1), true);
});

test('gleiche Zeitstempel: Merken gewinnt gegen Wegwerfen', () => {
    // a >= e, nicht a > e. Bei gleicher Millisekunde ist die Reihenfolge
    // nicht feststellbar — dann lieber ein Sender zu viel als einer zu wenig.
    assert.equal(istDrin({ a: 5000, e: 5000 }), true);
});

test('wiederholtes Verschmelzen aendert nichts mehr', () => {
    const a = { x: { a: 10, e: null }, y: { a: 5, e: 9 } };
    const b = { y: { a: 5, e: null }, z: { a: 1, e: null } };

    const einmal = verschmelzePlatten(a, b);
    const zweimal = verschmelzePlatten(einmal, b);
    const dreimal = verschmelzePlatten(zweimal, einmal);

    assert.deepEqual(zweimal, einmal);
    assert.deepEqual(dreimal, einmal);
});

test('was der Browser schickt, wird gesaeubert', () => {
    const sauber = saeubereEintraege({
        'nts-1': { a: 100, e: null },
        'GROSS': { a: 100, e: null },              // Grossbuchstaben gibt es nicht
        'mit leerzeichen': { a: 100, e: null },
        'kaputt': 'kein objekt',
        'leer': { a: 0, e: null },                  // traegt keine Aussage
        'negativ': { a: -5, e: null },
        'ok2': { a: '17', e: null },                // Zeichenkette wird zu 0
    });

    assert.deepEqual(Object.keys(sauber), ['nts-1']);
});

test('mehr Eintraege als erlaubt werden abgeschnitten, nicht abgelehnt', () => {
    const viele = liste('s', HOECHSTENS_EINTRAEGE + 200, 100);
    assert.equal(Object.keys(saeubereEintraege(viele)).length, HOECHSTENS_EINTRAEGE);
});

test('Grabsteine verfallen nach der Frist, gemerkte Sender nie', () => {
    const jetzt = 1_800_000_000_000;
    const tag = 24 * 60 * 60 * 1000;

    const uebrig = raeumeGrabsteine({
        alt: { a: 1, e: jetzt - 100 * tag },        // Grabstein, zu alt
        frisch: { a: 1, e: jetzt - 10 * tag },      // Grabstein, noch in Frist
        gemerkt: { a: jetzt - 900 * tag, e: null }, // uralt, aber drin
    }, jetzt, 90);

    assert.deepEqual(Object.keys(uebrig).sort(), ['frisch', 'gemerkt']);
});

test('beschneiden wirft zuerst Grabsteine weg, nicht Gemerktes', () => {
    const eintraege = {};
    for (let i = 0; i < 400; i++) eintraege['g' + i] = { a: 1, e: 1000 + i };   // Grabsteine
    for (let i = 0; i < 400; i++) eintraege['d' + i] = { a: 5000 + i, e: null }; // drin

    const kurz = beschneide(eintraege, 500, 1_000_000);

    assert.equal(Object.keys(kurz).length, 500);
    assert.equal(nurDrin(kurz).length, 400, 'alle gemerkten muessen bleiben');
});

test('beschneiden achtet auch auf die Zeichengrenze der Tabellenzeile', () => {
    const eintraege = liste('sender-mit-langem-namen-', 600, 1_700_000_000_000);
    const kurz = beschneide(eintraege, 600, 3000);

    assert.ok(JSON.stringify(kurz).length <= 3000);
});

// ── Der Verlauf ─────────────────────────────────────────────────────

test('Verlauf verschmilzt mit Maximum, damit er wiederholbar bleibt', () => {
    const a = { nts1: { n: 5, z: 100 } };
    const b = { nts1: { n: 3, z: 900 } };

    const einmal = verschmelzeVerlauf(a, b);
    assert.deepEqual(einmal, { nts1: { n: 5, z: 900 } });

    // Der Punkt der ganzen Entscheidung: nochmal dasselbe zaehlt nicht hoch.
    assert.deepEqual(verschmelzeVerlauf(einmal, b), einmal);
    assert.deepEqual(verschmelzeVerlauf(b, a), einmal);
});

test('Verlauf wird gesaeubert wie die Merkliste', () => {
    const sauber = saeubereVerlauf({ 'nts-1': { n: 4, z: 100 }, 'BOESE': { n: 1, z: 1 } });
    assert.deepEqual(Object.keys(sauber), ['nts-1']);
});
