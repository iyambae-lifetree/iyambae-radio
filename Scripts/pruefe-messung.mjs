#!/usr/bin/env node
/*
 ═══════════════════════════════════════════════════════════════════
 Prüft die Erlaubnisliste der Reichweitenmessung.

     node Scripts/pruefe-messung.mjs

 WARUM ES DIESE PRÜFUNG GIBT, und zwar erst seit heute:

 In assets/app.js standen drei Aufrufe — `miss('ohne-zugriff', …)`,
 `miss('teilen', …)`, `miss('teilen-uebernommen', …)` —, deren Art nicht in
 der Liste ARTEN von assets/lib/messung.mjs steht. Sie haben deshalb NIE
 etwas gesendet: miss() gibt still `false` zurück und tut nichts.

 Die Liste hat getan, wofür sie da ist. Aber der Fehler ist von der Sorte,
 die niemand bemerkt: Es gibt keine Fehlermeldung, keinen roten Test, keinen
 Eintrag im Protokoll. Nur eine Zahl, die für immer null bleibt — und die
 liest sich wie „passiert nicht", nicht wie „wird nicht gemessen".

 Diese Prüfung stellt beide Seiten nebeneinander:

   1. Jede Art, die app.js zu messen versucht, steht in ARTEN.
   2. Jede Art in ARTEN wird irgendwo auch benutzt (sonst ist sie tot).
   3. Die Felder, die hinausgehen, sind genau die vorgesehenen — und ein
      untergeschobenes Feld kommt nicht durch.

 Punkt 3 ist der wichtigste: Er ist die einzige Stelle, an der maschinell
 festgehalten ist, dass in einer Messzeile keine Adresse, keine Kennung und
 kein Freitext aus fremder Quelle landet.
 ═══════════════════════════════════════════════════════════════════
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const gesendet = [];

// Der Browser, so weit messung.mjs ihn braucht. sendBeacon fängt die Zeile
// ab, statt sie zu senden.
Object.defineProperty(globalThis, 'navigator', {
  value: { sendBeacon: (_weg, blob) => { gesendet.push(blob); return true; },
           languages: ['de'] },
  configurable: true, writable: true,
});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { documentElement: { dataset: {} } };
globalThis.location = { pathname: '/de/', search: '' };
globalThis.Blob = class { constructor(teile) { this.inhalt = teile[0]; } };

const messungPfad = join(wurzel, 'assets', 'lib', 'messung.mjs');
const { miss } = await import(pathToFileURL(messungPfad).href);
const letzte = () => JSON.parse(gesendet[gesendet.length - 1].inhalt);

let fehler = 0;
function pruefe(name, fn) {
  try { fn(); console.log(`  ✔ ${name}`); }
  catch (e) { console.log(`  ✘ ${name}\n      ${e.message}`); fehler += 1; }
}

// ── 1 · Beide Seiten müssen dieselbe Liste kennen ──────────────────
const quelleMessung = readFileSync(messungPfad, 'utf8');
const quelleApp = readFileSync(join(wurzel, 'assets', 'app.js'), 'utf8');

const artenBlock = quelleMessung.match(/const ARTEN = new Set\(\[([\s\S]*?)\]\)/);
assert.ok(artenBlock, 'ARTEN nicht in messung.mjs gefunden');
const arten = [...artenBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

// Was app.js zu messen versucht. Nur wörtliche Aufrufe — ein berechneter
// Name ließe sich hier ohnehin nicht prüfen, und es gibt keinen.
const benutzt = [...quelleApp.matchAll(/\bmiss\(\s*'([^']+)'/g)].map((m) => m[1]);

pruefe('jede gemessene Art steht in der Erlaubnisliste', () => {
  const fehlend = [...new Set(benutzt)].filter((a) => !arten.includes(a));
  assert.deepEqual(fehlend, [],
    `app.js misst ${fehlend.join(', ')} — steht nicht in ARTEN, sendet also nichts`);
});

pruefe('keine Art in der Liste ist tot', () => {
  // 'sprache' und 'installiert' hängen an Stellen außerhalb von app.js;
  // gesucht wird deshalb im ganzen Ordner assets/.
  const alles = quelleApp + readFileSync(join(wurzel, 'assets', 'lib', 'sprache.mjs'), 'utf8');
  const tot = arten.filter((a) => !alles.includes(`'${a}'`));
  assert.deepEqual(tot, [], `nie benutzt: ${tot.join(', ')}`);
});

// ── 2 · Was hinausgeht, und was nicht ──────────────────────────────
pruefe('abspielfehler trägt Sender, Zweig und Fehlercode', () => {
  assert.equal(miss('abspielfehler',
    { sender: 'nts-1', zweig: 'analyse-gescheitert', code: 4 }), true);
  assert.deepEqual(letzte(), { was: 'abspielfehler', sprache: 'de',
    sender: 'nts-1', zweig: 'analyse-gescheitert', code: 4 });
});

pruefe('ein unbekannter Zweig fällt weg, die Zeile bleibt', () => {
  // Absicht: „Bei diesem Sender ging etwas schief" ist mehr wert als
  // Schweigen, auch wenn der Zweig nicht einzuordnen ist.
  miss('abspielfehler', { sender: 'x', zweig: 'ausgedacht', code: 2 });
  assert.equal(letzte().zweig, undefined);
  assert.equal(letzte().sender, 'x');
});

pruefe('nur MediaError-Codes 1 bis 4 kommen durch', () => {
  for (const c of [0, 5, 4.5, '4', null, NaN, Infinity]) {
    miss('abspielfehler', { sender: 'y', zweig: 'ganz-gescheitert', code: c });
    assert.equal(letzte().code, undefined, `Code ${String(c)} kam durch`);
  }
});

pruefe('kein untergeschobenes Feld kommt durch', () => {
  // Die Stelle, an der festgehalten ist, dass keine Adresse, keine Kennung
  // und kein Freitext aus fremder Quelle in einer Messzeile landet.
  miss('abspielfehler', { sender: 'z', zweig: 'ohne-analyse-gelungen',
    adresse: '203.0.113.9', meldung: 'DEMUXER_ERROR_COULD_NOT_OPEN',
    kontoId: 'c'.repeat(32), sitzung: 'abcdef' });
  assert.deepEqual(Object.keys(letzte()).sort(),
    ['sender', 'sprache', 'was', 'zweig']);
});

pruefe('eine unbekannte Art sendet nichts', () => {
  const vorher = gesendet.length;
  assert.equal(miss('ausgedacht', { sender: 'a' }), false);
  assert.equal(gesendet.length, vorher);
});

console.log(fehler === 0
  ? `\n  ${arten.length} Ereignisarten, beide Seiten einig.`
  : `\n  ${fehler} Prüfung(en) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
