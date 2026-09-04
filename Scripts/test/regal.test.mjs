/*
 Die Regalseiten und der Tiefverweis, der zu ihnen gehoert.

 Sie pruefen ERGEBNISSE, nicht Formulierungen: Was hier steht, muss auch
 dann noch stimmen, wenn jemand die Saetze aendert.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = (p) => readFile(path.join(WURZEL, p), 'utf8');

test('app.js liest #regal= und bildet es auf ein Regal ab', async () => {
  /*
   Der Knopf auf einer Regalseite fuehrt auf /de/#regal=tiefe. Wird der
   Verweis nicht gelesen, landet der Besucher wortlos auf der Startseite —
   ein Fehler, den niemand als Fehler erkennt, weil die Seite ja laedt.
  */
  const app = await lies('assets/app.js');

  const muster = /GETEILTES_REGAL\s*=\s*\(([^\n]*)\)/.exec(app);
  assert.ok(muster, 'GETEILTES_REGAL wird nicht aus der Adresse gelesen');

  // Der Ausdruck selbst, gegen echte Adressen gehalten.
  const ausdruck = /[#&]regal=([a-z0-9\-]+)/i;
  assert.equal(ausdruck.exec('#regal=tiefe')?.[1], 'tiefe');
  assert.equal(ausdruck.exec('#regal=rueckspiegel')?.[1], 'rueckspiegel');
  assert.equal(ausdruck.exec('#platte=nts-1')?.[1], undefined,
    'Ein Senderverweis darf nicht als Regal gelesen werden');

  assert.match(app, /zeigeGeteiltesRegal\s*\(\s*\)\s*\{/,
    'Es gibt keine Gegenstelle zu GETEILTES_REGAL');
  assert.match(app, /this\.zeigeGeteiltesRegal\(\)/,
    'zeigeGeteiltesRegal wird beim Start nicht gerufen');
});

test('jedes Regal im Katalog hat mindestens einen Sender', async () => {
  // Ein leeres Regal bekaeme sieben Seiten ohne Inhalt — duenner Inhalt in
  // sieben Sprachen ist schlechter als kein Inhalt.
  const katalog = JSON.parse(await lies('data/sender.json'));
  const leer = katalog.regale
    .map((r) => [r.id, katalog.sender.filter((s) => s.regal === r.id).length])
    .filter(([, n]) => n === 0);
  assert.deepEqual(leer, [], `Leere Regale: ${JSON.stringify(leer)}`);
});

test('jeder Sender liegt in genau einem bekannten Regal', async () => {
  // Sonst zeigen die 11 Regalseiten zusammen nicht den ganzen Katalog, und
  // die fehlenden Sender haetten nirgends eine Adresse.
  const katalog = JSON.parse(await lies('data/sender.json'));
  const bekannt = new Set(katalog.regale.map((r) => r.id));
  const heimatlos = katalog.sender.filter((s) => !bekannt.has(s.regal));
  assert.deepEqual(heimatlos.map((s) => s.id), [],
    'Sender in einem Regal, das es nicht gibt');

  const summe = katalog.regale
    .reduce((n, r) => n + katalog.sender.filter((s) => s.regal === r.id).length, 0);
  assert.equal(summe, katalog.sender.length,
    'Die Regale zusammen zeigen nicht alle Sender');
});

test('regal-texte.json hat jeden Satz in allen sieben Sprachen', async () => {
  /*
   Fehlt eine Fassung, faellt die Seite still auf Deutsch zurueck. Auf einer
   japanischen Seite steht dann ein deutscher Knopf, und niemand merkt es,
   weil nichts kaputtgeht.
  */
  const texte = JSON.parse(await lies('data/regal-texte.json'));
  const sprachen = ['de', 'en', 'fr', 'es', 'it', 'ja', 'ar'];
  const fehlend = [];
  for (const [schluessel, fassungen] of Object.entries(texte)) {
    if (schluessel.startsWith('_')) continue;
    for (const s of sprachen) {
      if (!fassungen[s]) fehlend.push(`${schluessel}.${s}`);
    }
  }
  assert.deepEqual(fehlend, [], `Fehlende Fassungen: ${fehlend.join(', ')}`);
});

test('die Vorlage traegt jede Marke, die der Erzeuger fuellt', async () => {
  /*
   Der Erzeuger fuehrt seine Marken in MARKEN auf. Steht eine davon nicht in
   regal.html, bleibt an ihrer Stelle nichts — oder, schlimmer, es bleibt
   ein {{PLATZHALTER}} sichtbar stehen.
  */
  const skript = await lies('Scripts/baue-regale.py');
  const vorlage = await lies('regal.html');

  const block = /MARKEN = \[([\s\S]*?)\]/.exec(skript);
  assert.ok(block, 'MARKEN nicht gefunden');
  const marken = [...block[1].matchAll(/"([A-Z_0-9]+)"/g)].map((m) => m[1]);
  assert.ok(marken.length >= 20, `nur ${marken.length} Marken gefunden`);

  const fehlend = marken.filter((m) => !vorlage.includes(`{{${m}}}`));
  assert.deepEqual(fehlend, [], `Marken fehlen in regal.html: ${fehlend}`);

  // Und umgekehrt: keine Marke in der Vorlage, die der Erzeuger nicht kennt.
  const inVorlage = [...vorlage.matchAll(/\{\{([A-Z_0-9]+)\}\}/g)]
    .map((m) => m[1]);
  const unbekannt = [...new Set(inVorlage)].filter((m) => !marken.includes(m));
  assert.deepEqual(unbekannt, [],
    `regal.html nennt Marken, die baue-regale.py nicht fuellt: ${unbekannt}`);
});
