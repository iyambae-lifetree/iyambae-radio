/*
 Jede veraendernde Anfrage der Seite schickt `Content-Type: application/json`
 (432hz-radio#46, Punkt 5).

 Der Anmeldedienst weist seit dieser Aenderung jede veraendernde Anfrage ohne
 diesen Kopf mit 415 ab. Der Grund steht in dienst/src/server.mjs bei
 `liesKoerper`: Ein POST mit text/plain ist eine „einfache" Anfrage, die jede
 fremde Seite ohne Vorabanfrage absetzen kann.

 Die Kehrseite: Vergisst ein `fetch` auf iyambae.fm oder apps.iyambae.fm den
 Kopf, bekommt er 415, und das faellt erst auf, wenn jemand auf den Knopf
 drueckt — bei der Umfrage oder dem Hoertest wahrscheinlich nie, denn die
 schweigen bei einem Fehler absichtlich. Deshalb liest dieser Test die
 Quellen der Seite und faellt beim Bau, nicht im Betrieb.

 Was er prueft:
   - Jeder `fetch` mit einer Methode, die nicht ausdruecklich GET oder HEAD
     ist, traegt im selben Aufruf `'Content-Type': 'application/json'`.
     Eine Methode aus einer Variablen gilt als veraendernd — der Test kann
     nicht wissen, was darin steht.
   - Ein `fetch`, dessen Optionen nicht als Objekt im Aufruf stehen
     (`fetch(adresse, optionen)`), ist nicht pruefbar und faellt durch.
   - `navigator.sendBeacon` kann keinen JSON-Kopf ohne Vorabanfrage setzen.
     Er ist nur erlaubt, wo das Ziel NICHT der Dienst ist (heute nur
     /messung, das nginx selbst ins Protokoll schreibt).
   - Kein XMLHttpRequest. Es gibt heute keins, und ein neues soll auffallen.

 Gelesen wird roh, ohne JavaScript-Zerleger: Klammern werden gezaehlt,
 Zeichenketten und Kommentare uebersprungen. Das genuegt fuer den Stil
 dieser Seite. Damit der Test nicht still nichts findet, zaehlt er mit und
 verlangt mindestens die Aufrufe, die es heute gibt.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/*
 Nicht Teil der ausgelieferten Seite: der Dienst selbst, die Werkzeuge, die
 Unterlagen, Infrastruktur und nginx. Alles andere wird gelesen, auch die
 sieben Sprachfassungen, sobald der Bau sie erzeugt hat.
*/
const AUSSER = new Set(['.git', 'node_modules', 'dienst', 'Scripts', 'docs', 'infra', 'deploy', '.github']);

function quellen(ordner = WURZEL) {
  const gefunden = [];
  for (const name of readdirSync(ordner)) {
    if (AUSSER.has(name)) continue;
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) gefunden.push(...quellen(pfad));
    else if (/\.(m?js|html)$/.test(name)) gefunden.push(pfad);
  }
  return gefunden;
}

const anzeige = (pfad) => relative(WURZEL, pfad).split(sep).join('/');

/**
 * Ab `start` (dem Zeichen nach der oeffnenden Klammer) bis zur passenden
 * schliessenden. Zeichenketten und Kommentare zaehlen nicht mit.
 */
function bisZurKlammer(text, start) {
  let tiefe = 1;
  let i = start;
  while (i < text.length) {
    const z = text[i];
    if (z === '"' || z === "'" || z === '`') {
      const q = z;
      i++;
      while (i < text.length && text[i] !== q) {
        if (text[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (z === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (z === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (z === '(' || z === '{' || z === '[') tiefe++;
    if (z === ')' || z === '}' || z === ']') {
      tiefe--;
      if (tiefe === 0) return text.slice(start, i);
    }
    i++;
  }
  return null;
}

/** Kommentare entfernen, Zeichenketten stehen lassen. */
function ohneKommentare(text) {
  let aus = '';
  let i = 0;
  while (i < text.length) {
    const z = text[i];
    if (z === '"' || z === "'" || z === '`') {
      const q = z;
      let j = i + 1;
      while (j < text.length && text[j] !== q && text[j] !== '\n') {
        if (text[j] === '\\') j++;
        j++;
      }
      aus += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (z === '/' && text[i + 1] === '/' && text[i - 1] !== ':' && text[i - 1] !== '\\') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (z === '/' && text[i + 1] === '*') {
      const ende = text.indexOf('*/', i + 2);
      const neu = ende < 0 ? text.length : ende + 2;
      // Die Zeilenumbrueche bleiben, sonst stimmen die Zeilennummern nicht.
      aus += text.slice(i, neu).replace(/[^\n]/g, '');
      i = neu;
      continue;
    }
    aus += z;
    i++;
  }
  return aus;
}

/** Das Argument an der Stelle `nummer` (0, 1, …) auf oberster Ebene. */
function argument(aufruf, nummer) {
  let tiefe = 0;
  let anfang = 0;
  let zaehler = 0;
  for (let i = 0; i < aufruf.length; i++) {
    const z = aufruf[i];
    if (z === '"' || z === "'" || z === '`') {
      const q = z;
      i++;
      while (i < aufruf.length && aufruf[i] !== q) { if (aufruf[i] === '\\') i++; i++; }
      continue;
    }
    if (z === '(' || z === '{' || z === '[') tiefe++;
    if (z === ')' || z === '}' || z === ']') tiefe--;
    if (z === ',' && tiefe === 0) {
      if (zaehler === nummer) return aufruf.slice(anfang, i).trim();
      zaehler++;
      anfang = i + 1;
    }
  }
  return zaehler === nummer ? aufruf.slice(anfang).trim() : null;
}

/*
 Der Kopf muss UNBEDINGT im Objekt `headers` stehen. `headers: x ? {…} :
 undefined` faellt durch: So stand es bis hierher in konto.mjs, und ein
 Aufruf mit `methode: 'DELETE'` ohne Rumpf ging ohne Kopf hinaus.
*/
const JSON_KOPF = /\bheaders\s*:\s*\{[^{}]*['"]?content-type['"]?\s*:\s*['"]application\/json/i;

/** Alle Aufrufe von `name(` in einer Quelle, ohne Kommentare. */
function aufrufe(text, muster) {
  const liste = [];
  const sauber = ohneKommentare(text);
  for (const treffer of sauber.matchAll(muster)) {
    const inhalt = bisZurKlammer(sauber, treffer.index + treffer[0].length);
    if (inhalt !== null) liste.push({ inhalt, zeile: sauber.slice(0, treffer.index).split('\n').length });
  }
  return liste;
}

function pruefeFetch(inhalt) {
  const optionen = argument(inhalt, 1);
  if (optionen === null || optionen === '') return null;        // ohne Optionen: GET
  if (!optionen.startsWith('{')) return 'Optionen stehen nicht im Aufruf, Methode nicht pruefbar';
  const methode = optionen.match(/\bmethod\s*:\s*([^,\n}]+)/);
  if (!methode) return null;                                     // keine Methode: GET
  if (/^['"`](GET|HEAD)['"`]$/i.test(methode[1].trim())) return null;
  return JSON_KOPF.test(optionen) ? null : 'veraendernder fetch ohne Content-Type: application/json';
}

// ── Erst die Werkzeuge selbst ──────────────────────────────────────

test('der Leser erkennt, was er erkennen soll', () => {
  const lies = (q) => aufrufe(q, /\bfetch\s*\(/g).map((a) => pruefeFetch(a.inhalt));
  assert.deepEqual(lies("fetch('/data/x.json')"), [null]);
  assert.deepEqual(lies("fetch('/a', { method: 'GET' })"), [null]);
  assert.deepEqual(lies("fetch('/a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })"), [null]);
  assert.deepEqual(lies("fetch('/a', { method: 'POST', body: '{}' })").map(Boolean), [true]);
  assert.deepEqual(lies("fetch('/a', { method: 'DELETE' })").map(Boolean), [true]);
  assert.deepEqual(lies("fetch('/a', { method: x ? 'POST' : 'GET' })").map(Boolean), [true]);
  assert.deepEqual(lies("fetch('/a', optionen)").map(Boolean), [true]);
  assert.deepEqual(lies("fetch('/a', { method: m, headers: r ? { 'Content-Type': 'application/json' } : undefined })")
    .map(Boolean), [true]);
  // Ein Kommentar ist kein Aufruf.
  assert.deepEqual(lies("// fetch('/a', { method: 'POST' })\n/* fetch('/b', { method: 'PUT' }) */"), []);
  // Eine Adresse mit // ist kein Kommentar.
  assert.deepEqual(lies("fetch('https://x.test/a', { method: 'POST' })").map(Boolean), [true]);
});

// ── Dann die Seite ─────────────────────────────────────────────────

test('jeder veraendernde fetch der Seite schickt Content-Type: application/json', () => {
  const fehler = [];
  let veraendernd = 0;
  for (const datei of quellen()) {
    const text = readFileSync(datei, 'utf8');
    for (const { inhalt, zeile } of aufrufe(text, /\bfetch\s*\(/g)) {
      const optionen = argument(inhalt, 1);
      if (optionen && /\bmethod\s*:/.test(optionen) && !/\bmethod\s*:\s*['"`](GET|HEAD)['"`]/i.test(optionen)) {
        veraendernd++;
      }
      const grund = pruefeFetch(inhalt);
      if (grund) fehler.push(`${anzeige(datei)}:${zeile}: ${grund}`);
    }
  }
  assert.deepEqual(fehler, []);
  /*
   Heute sind es sieben in den Vorlagen: Umfrage, Rueckmeldung (Hoertest und
   Stimmung teilen sich eine), Fehlerbericht, Konto, Mikesch und zweimal die
   Passwortseite. Weniger hiesse: Der Leser hat etwas uebersehen, nicht die
   Seite etwas verloren.
  */
  assert.ok(veraendernd >= 7, 'nur ' + veraendernd + ' veraendernde Aufrufe gefunden');
});

test('sendBeacon geht nie an den Dienst', () => {
  const fehler = [];
  let gefunden = 0;
  for (const datei of quellen()) {
    const text = readFileSync(datei, 'utf8');
    for (const { inhalt, zeile } of aufrufe(text, /\bsendBeacon\s*\(/g)) {
      gefunden++;
      let ziel = argument(inhalt, 0);
      // Steht dort ein Name, gilt die Zeichenkette, die ihm zugewiesen ist.
      if (/^[A-Za-z_$][\w$]*$/.test(ziel)) {
        const zuweisung = text.match(new RegExp('\\bconst\\s+' + ziel + '\\s*=\\s*([\'"`][^\'"`]*[\'"`])'));
        ziel = zuweisung ? zuweisung[1] : ziel;
      }
      const wert = ziel.match(/^['"`]([^'"`]*)['"`]$/)?.[1];
      if (wert === undefined) fehler.push(`${anzeige(datei)}:${zeile}: Ziel nicht pruefbar (${ziel})`);
      else if (!wert.startsWith('/') || wert.startsWith('/api')) {
        fehler.push(`${anzeige(datei)}:${zeile}: sendBeacon an ${wert}`);
      }
    }
  }
  assert.deepEqual(fehler, []);
  assert.ok(gefunden >= 1, 'messung.mjs benutzt sendBeacon — der Leser hat ihn nicht gefunden');
});

test('kein XMLHttpRequest auf der Seite', () => {
  const treffer = quellen()
    .filter((datei) => /\bnew\s+XMLHttpRequest\b/.test(ohneKommentare(readFileSync(datei, 'utf8'))))
    .map(anzeige);
  assert.deepEqual(treffer, []);
});
