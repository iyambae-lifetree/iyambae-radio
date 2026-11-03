import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoeruhr, SCHWELLE_MS, LUECKE_MS } from '../../assets/lib/tunerhinweis.mjs';

/*
 Der Tuner-Hinweis darf genau einmal kommen, und nur nach zwanzig Minuten,
 die wirklich in 432 Hz liefen. Die Uhr wird hier im 15-Sekunden-Takt
 abgefragt, wie in app.js (wacheTunerHinweis).
*/
const TAKT = 15_000;

function hoere(uhr, start, dauer, zaehlt = true) {
  let meldungen = 0;
  for (let t = start; t <= start + dauer; t += TAKT) if (uhr.tick(t, zaehlt)) meldungen++;
  return meldungen;
}

test('nach zwanzig Minuten in 432 Hz meldet sie sich', () => {
  const uhr = hoeruhr();
  assert.equal(hoere(uhr, 0, SCHWELLE_MS - TAKT), 0, 'vor der Schwelle still');
  assert.equal(uhr.tick(SCHWELLE_MS, true), true);
});

test('sie meldet sich nur einmal je Besuch', () => {
  const uhr = hoeruhr();
  assert.equal(hoere(uhr, 0, 3 * SCHWELLE_MS), 1);
  assert.equal(uhr.gemeldet, true);
});

test('Pause und 440 Hz zaehlen nicht mit, die Zeit davor bleibt stehen', () => {
  const uhr = hoeruhr();
  hoere(uhr, 0, 10 * 60_000);                              // zehn Minuten 432 Hz
  const davor = uhr.gehoert;
  hoere(uhr, 10 * 60_000 + TAKT, 30 * 60_000, false);      // eine halbe Stunde Pause oder 440 Hz
  assert.equal(uhr.gehoert, davor, 'Pause hat mitgezaehlt');
  assert.equal(uhr.gemeldet, false);
  // Die naechsten zehn Minuten in 432 Hz reichen dann.
  const start = 41 * 60_000;
  assert.equal(hoere(uhr, start, 10 * 60_000 + TAKT), 1);
});

test('ein schlafender Rechner hoert nicht zu', () => {
  const uhr = hoeruhr();
  uhr.tick(0, true);
  // Deckel zu, eine Stunde spaeter wieder auf: zaehlt hoechstens LUECKE_MS.
  assert.equal(uhr.tick(60 * 60_000, true), false);
  assert.equal(uhr.gehoert, LUECKE_MS);
});

test('eine rueckwaerts laufende Uhr zieht nichts ab', () => {
  const uhr = hoeruhr();
  uhr.tick(100_000, true);
  uhr.tick(40_000, true);
  assert.equal(uhr.gehoert, 0);
});

test('nichts landet im Geraetespeicher', async () => {
  // § 25 TDDDG: Der Hinweis merkt sich nichts ausserhalb des Arbeitsspeichers.
  const { readFile } = await import('node:fs/promises');
  const quelle = await readFile(new URL('../../assets/lib/tunerhinweis.mjs', import.meta.url), 'utf8');
  const code = quelle.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|document\.cookie|speicher\./);
});
