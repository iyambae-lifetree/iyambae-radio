#!/usr/bin/env node
/*
 ═══════════════════════════════════════════════════════════════════
 Prüft das Regal „Zuletzt gehört".

     node Scripts/pruefe-verlauf.mjs

 WARUM ES DIESE PRÜFUNG GIBT:

 Ein Besucher meldete: „beim radio wenn ich auf einen kanal klicke
 verschwindet er". Nachgestellt im Browser, und es stimmte — aber nur im
 Regal „Zuletzt gehört", nicht in den neun Regalen darüber. Deshalb war der
 Fehler so schwer zu greifen: Er hing nicht am Klick, sondern daran, WO
 geklickt wurde.

 Der Grund war eine Absprache, die zwei Seiten verschieden verstanden.
 merkeZuletzt() legte den eben gehörten Sender VORNE an. zeichneVerlauf()
 drehte die Liste um, weil es die neuesten hinten vermutete, und zeigte
 dann die ersten zwölf. Bei bis zu zwölf gehörten Sendern sprang die
 angeklickte Hülle nur ans andere Ende der Reihe — aus dem Bild heraus. Ab
 dreizehn fiel sie ganz aus den gezeigten zwölf.

 Die Prüfung hält beide Seiten gegeneinander, so wie es das Auge im Browser
 nicht kann: schreiben, lesen, und schauen, ob der eben gehörte Sender dort
 steht, wo der Besucher ihn sucht.
 ═══════════════════════════════════════════════════════════════════
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { merkeGehoert, verlaufsliste, HOECHSTENS_GEMERKT, HOECHSTENS_GEZEIGT }
  from '../assets/lib/verlauf.mjs';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');

let fehler = 0;
function pruefe(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { fehler++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

// Ein Katalog, der jede Kennung kennt — bis auf die, die es nicht mehr gibt.
const alsSender = (id) => (id === 'gibt-es-nicht' ? null : { id });
const kennungen = (liste) => verlaufsliste(liste, alsSender).map((s) => s.id);

console.log('\nZuletzt gehört\n');

pruefe('der zuletzt gehörte Sender steht vorne', () => {
  let liste = [];
  for (const id of ['a', 'b', 'c']) liste = merkeGehoert(liste, id);
  assert.deepEqual(liste, ['c', 'b', 'a']);
});

pruefe('das Regal zeigt in derselben Reihenfolge wie gespeichert', () => {
  let liste = [];
  for (const id of ['a', 'b', 'c']) liste = merkeGehoert(liste, id);
  assert.deepEqual(kennungen(liste), ['c', 'b', 'a']);
});

/*
 Der gemeldete Fehler, in zwei Größen. Beide Fälle sahen für den Besucher
 gleich aus, hatten aber verschiedene Folgen — deshalb stehen sie einzeln da.
*/
pruefe('ein angeklickter Sender bleibt im Regal — kurze Liste', () => {
  let liste = [];
  for (const id of ['a', 'b', 'c', 'd', 'e']) liste = merkeGehoert(liste, id);
  // Der Besucher klickt im Regal auf "d".
  liste = merkeGehoert(liste, 'd');
  const gezeigt = kennungen(liste);
  assert.ok(gezeigt.includes('d'), '"d" ist aus dem Regal verschwunden');
  assert.equal(gezeigt[0], 'd', `"d" steht auf Platz ${gezeigt.indexOf('d') + 1} statt vorne`);
});

pruefe('ein angeklickter Sender bleibt im Regal — volle Liste', () => {
  // Genau der Fall aus der Meldung: mehr gehört, als das Regal zeigt.
  let liste = [];
  for (let n = 0; n < HOECHSTENS_GEMERKT; n++) liste = merkeGehoert(liste, 's' + n);
  const imRegal = kennungen(liste);
  assert.equal(imRegal.length, HOECHSTENS_GEZEIGT);
  // Der Besucher klickt auf die letzte Hülle, die er noch sieht.
  const geklickt = imRegal[imRegal.length - 1];
  liste = merkeGehoert(liste, geklickt);
  const danach = kennungen(liste);
  assert.ok(danach.includes(geklickt),
    `"${geklickt}" ist nach dem Klick aus dem Regal verschwunden`);
  assert.equal(danach[0], geklickt);
});

pruefe('kein Sender steht zweimal im Regal', () => {
  let liste = [];
  for (const id of ['a', 'b', 'a', 'c', 'a']) liste = merkeGehoert(liste, id);
  const gezeigt = kennungen(liste);
  assert.equal(new Set(gezeigt).size, gezeigt.length);
  assert.deepEqual(gezeigt, ['a', 'c', 'b']);
});

pruefe('mehr als HOECHSTENS_GEMERKT wird nicht behalten', () => {
  let liste = [];
  for (let n = 0; n < HOECHSTENS_GEMERKT + 7; n++) liste = merkeGehoert(liste, 's' + n);
  assert.equal(liste.length, HOECHSTENS_GEMERKT);
});

pruefe('ein Sender, den es nicht mehr gibt, kostet keinen Platz', () => {
  let liste = ['gibt-es-nicht'];
  for (let n = 0; n < HOECHSTENS_GEZEIGT; n++) liste = merkeGehoert(liste, 's' + n);
  // Die fehlende Kennung steht hinten drin und darf keinen der zwölf
  // Plätze belegen — sonst wird das Regal ohne erkennbaren Grund kürzer.
  const gezeigt = kennungen(liste);
  assert.equal(gezeigt.length, HOECHSTENS_GEZEIGT);
  assert.ok(!gezeigt.includes('gibt-es-nicht'));
});

/*
 Und die Gegenprobe an der Quelle: app.js darf die Liste nicht mehr selbst
 zusammenstellen. Genau dort stand das reverse(), das den Fehler gemacht
 hat — eine reine Prüfung der Modulfunktionen hätte es nicht bemerkt.
*/
pruefe('app.js baut den Verlauf nicht mehr selbst', () => {
  const quelle = readFileSync(join(wurzel, 'assets/app.js'), 'utf8');
  const zeilen = quelle.split('\n');
  const anfang = zeilen.findIndex((z) => z.includes('zeichneVerlauf() {'));
  assert.ok(anfang > 0, 'zeichneVerlauf() nicht gefunden');
  const koerper = zeilen.slice(anfang, anfang + 40).join('\n');
  assert.ok(koerper.includes('verlaufsliste('),
    'zeichneVerlauf() benutzt verlaufsliste() nicht');
  assert.ok(!/ladeZuletzt\(\)[\s\S]{0,80}reverse\(\)/.test(koerper),
    'zeichneVerlauf() dreht die Liste wieder um');
});

console.log(fehler === 0
  ? `\n  Beide Seiten der Liste sind sich einig.\n`
  : `\n  ${fehler} Prüfung(en) fehlgeschlagen.\n`);
process.exit(fehler === 0 ? 0 : 1);
