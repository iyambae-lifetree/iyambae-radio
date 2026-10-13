/*
 „Neues Passwort" (assets/passwort-neu.mjs): Marke lesen, vorab pruefen.

 Die Vorpruefung schuetzt den Einmal-Link: Was sie durchlaesst und der
 Dienst ablehnt, kostet eine neue Mail. Deshalb steht hier, dass sie
 dieselben Grenzen zieht wie pruefeRegeln() in dienst/src/passwort.mjs.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { liesMarke, vorpruefe, grundAlsSatz, MINDESTLAENGE, HOECHSTLAENGE } from '../../assets/passwort-neu.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('liesMarke: liest die URL-kodierte Marke aus dem Fragment', () => {
  const marke = 'a'.repeat(64) + '.' + 'b'.repeat(43);
  assert.equal(liesMarke('#marke=' + encodeURIComponent(marke)), marke);
  assert.equal(liesMarke('#x=1&marke=ab%2Ecd'), 'ab.cd');
  assert.equal(liesMarke(''), '');
  assert.equal(liesMarke('#platte=abc'), '');
  assert.equal(liesMarke('#marke=%E0%A4%A'), '');
});

test('vorpruefe: Laenge in Zeichen, nicht in Code-Einheiten', () => {
  assert.equal(vorpruefe('').grund, 'leer');
  assert.deepEqual(vorpruefe('kurzer satz'), { grund: 'zu_kurz', mindestens: 15, fehlt: 4 });
  assert.equal(vorpruefe('🎵'.repeat(7) + 'abcdefg').grund, 'zu_kurz');
  assert.equal(vorpruefe('x'.repeat(HOECHSTLAENGE + 1)).grund, 'zu_lang');
  assert.equal(vorpruefe('a'.repeat(20)).grund, 'nur_wiederholung');
  assert.equal(vorpruefe('abcdefghijklmnop').grund, 'nur_fortlaufend');
  assert.equal(vorpruefe('Der Plattenspieler dreht sich'), null);
});

test('vorpruefe: dieselben Grenzen wie der Dienst', async () => {
  const dienst = await readFile(path.join(WURZEL, 'dienst/src/passwort.mjs'), 'utf8');
  assert.match(dienst, new RegExp(`MINDESTLAENGE = ${MINDESTLAENGE};`));
  assert.match(dienst, new RegExp(`HOECHSTLAENGE = ${HOECHSTLAENGE};`));
});

test('jeder Grund des Dienstes hat einen Satz', async () => {
  const dienst = await readFile(path.join(WURZEL, 'dienst/src/passwort.mjs'), 'utf8');
  const texte = JSON.parse(await readFile(path.join(WURZEL, 'data/passwort-neu-texte.json'), 'utf8'));
  const gruende = [...dienst.matchAll(/gruende(?:\.push\(|: \[)\{ grund: '(\w+)'/g)].map((m) => m[1]);
  assert.ok(gruende.length >= 6, 'Gruende im Dienst gefunden');
  for (const g of gruende) assert.ok(texte['grund.' + g], `grund.${g} fehlt`);
  const de = Object.fromEntries(Object.entries(texte).map(([k, v]) => [k, v.de]));
  assert.equal(grundAlsSatz(de, { grund: 'zu_kurz', fehlt: 3, mindestens: 15 }),
    'Es fehlen noch 3 Zeichen — mindestens 15 braucht es.');
  assert.equal(grundAlsSatz(de, { grund: 'unbekannt' }), de['grund.sonst']);
});
