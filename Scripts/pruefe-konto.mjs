#!/usr/bin/env node
/*
 ═══════════════════════════════════════════════════════════════════
 Prüft die Zustandslogik des Kontos — und vor allem, dass sie schweigt.

     node Scripts/pruefe-konto.mjs

 WARUM ES DIESE PRÜFUNG GIBT:

 assets/lib/konto.mjs war vollständig geschrieben und wurde von keiner
 einzigen Datei importiert. app.js band siebzehn Module ein, dieses nicht.
 Ein Nutzer fragte, wo er sich anmelden könne, und fand nichts. Der Dienst
 lief die ganze Zeit.

 Beim Anschließen wird die Gefahr die umgekehrte: dass die Anmeldung jetzt
 überall auftaucht. Der Kopf von konto.mjs zieht dagegen drei Linien, und
 alle drei sind hier nachgeprüft, weil keine davon im Browser auffällt,
 wenn sie reißt:

   1. Ohne Dienst passiert GAR NICHTS. Zustand `kein-dienst`, keine
      Anmeldung wird angeboten, die Merkliste bleibt örtlich. Das ist der
      heutige Normalfall, wenn die Oberfläche vor dem Dienst ausgeliefert
      wird — und der Fall, in dem ein Fehler niemandem auffiele, weil die
      Seite dann eben „irgendwie komisch" ist.

   2. `unbekannt` ist nicht `abgemeldet`. Solange nicht geklärt ist, ob es
      einen Dienst gibt, darf weder eine Anmeldung angeboten noch das
      Merken verweigert werden. Die drei Zustände sind bewusst drei.

   3. Gefragt wird an genau EINER Stelle: am Herzen. Der Aufruf steht in
      toggleFavorit() und nirgends sonst — geprüft an der Quelle, weil kein
      Modultest bemerkt, wenn jemand die Frage zusätzlich beim Start stellt.

 Dazu die Zusammenführung der Merkliste: Ein entfernter Sender darf beim
 nächsten Abgleich nicht vom anderen Gerät zurückkommen.
 ═══════════════════════════════════════════════════════════════════
*/
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');

let fehler = 0;
/*
 Eine geworfene Ausnahme ist ein Fehlschlag — mit einer Ausnahme: `UEBERGANGEN`.
 Damit sagt eine Prüfung, dass ihr die Grundlage fehlt, statt sie zu erfinden.
 Gebraucht wird das genau einmal, unten beim Abgleich gegen den Dienst: `dienst`
 steht in `.dockerignore` und liegt im Bau-Kontext gar nicht. Ein harter
 Fehlschlag dort hieße, den Bau an einer Datei scheitern zu lassen, die
 absichtlich nicht mitkommt.
*/
const UEBERGANGEN = Symbol('uebergangen');
function pruefe(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ✓ ${name}`))
    .catch((e) => {
      if (e?.uebergangen === UEBERGANGEN) return console.log(`  – ${name}\n      ${e.message}`);
      fehler++;
      console.log(`  ✗ ${name}\n      ${e.message}`);
    });
}
function ueberspringe(grund) {
  const e = new Error(grund);
  e.uebergangen = UEBERGANGEN;
  throw e;
}

/*
 konto.mjs läuft im Browser. Hier stehen die drei Dinge, die es dort
 vorfindet und hier nicht: ein localStorage, ein fetch und ein Dokument
 (für sprache.mjs, das konto.mjs einbindet).

 Bewusst KEIN echter Ersatz für localStorage, sondern eine Karte im
 Speicher: Diese Prüfung soll nichts auf der Platte hinterlassen.
*/
const lager = new Map();
globalThis.localStorage = {
  getItem: (k) => (lager.has(k) ? lager.get(k) : null),
  setItem: (k, v) => lager.set(k, String(v)),
  removeItem: (k) => lager.delete(k),
};
globalThis.document = { documentElement: { dataset: {} } };
globalThis.location = { pathname: '/de/', search: '', hash: '' };
// navigator wird NICHT gesetzt: node bringt seit Fassung 21 ein eigenes mit,
// das sich nicht überschreiben lässt. Gebraucht wird es hier auch nicht —
// sprache() steht ohne ladeSprache() auf dem Rückfall 'de'.

// Was der nächste fetch antworten soll, und was er mitbekommen hat.
let antwortet = () => { throw new TypeError('Failed to fetch'); };
let gerufen = [];
globalThis.fetch = async (adresse, optionen = {}) => {
  gerufen.push({ adresse, optionen });
  return antwortet(adresse, optionen);
};

/** Eine Antwort, wie der Dienst sie gibt. */
function json(koerper, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json; charset=utf-8' },
    json: async () => koerper,
  };
}

/** Was nginx liefert, wenn es den Endpunkt nicht gibt: die Seite selbst. */
function seite(status = 404) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'text/html; charset=utf-8' },
    json: async () => { throw new SyntaxError('Unexpected token <'); },
  };
}

const konto = await import('../assets/lib/konto.mjs');
const { ZUSTAND, klaereZustand, kontozustand, angemeldet, kontoNoetig,
        kontoDaten, abmelden, fordereCode, loeseCodeEin, meldeMitPasswortAn,
        gleicheAb, alsMenge, ausMenge, verschmilz,
        schonGefragt, merkeAblehnung, vergissAblehnung } = konto;

function zuruecksetzen() {
  lager.clear();
  gerufen = [];
  antwortet = () => { throw new TypeError('Failed to fetch'); };
}

console.log('\nKonto — Zustände und Zusammenführung\n');

// ── 1 · Ohne Dienst passiert gar nichts ────────────────────────────

await pruefe('vor der ersten Antwort ist der Zustand `unbekannt`', () => {
  // Nicht `abgemeldet`: Sonst böte die Oberfläche eine Anmeldung an,
  // bevor überhaupt feststeht, ob es eine gibt.
  assert.equal(ZUSTAND.unbekannt, 'unbekannt');
  assert.notEqual(ZUSTAND.unbekannt, ZUSTAND.abgemeldet);
  assert.notEqual(ZUSTAND.keinDienst, ZUSTAND.abgemeldet);
});

await pruefe('kein Netz → `kein-dienst`, und niemand wird gefragt', async () => {
  zuruecksetzen();
  const z = await klaereZustand();
  assert.equal(z, ZUSTAND.keinDienst);
  assert.equal(kontozustand(), ZUSTAND.keinDienst);
  assert.equal(angemeldet(), false);
  // DIE Zeile, an der alles hängt: Ohne Dienst braucht das Merken kein Konto.
  assert.equal(kontoNoetig(), false, 'ohne Dienst würde nach einem Konto gefragt');
});

await pruefe('nginx liefert die Seite statt JSON → `kein-dienst`', async () => {
  zuruecksetzen();
  antwortet = () => seite(404);
  const z = await klaereZustand();
  // Nicht `abgemeldet`, und schon gar kein Absturz: Eine HTML-Antwort auf
  // eine JSON-Anfrage heißt, dass es den Endpunkt nicht gibt.
  assert.equal(z, ZUSTAND.keinDienst);
  assert.equal(kontoNoetig(), false);
});

await pruefe('nginx meldet den schlafenden Dienst als JSON → `kein-dienst`', async () => {
  zuruecksetzen();
  /*
   Gemessen am eigenen Abbild (docker run probe, ohne Anmeldedienst daneben):

     HTTP/1.1 503 Service Temporarily Unavailable
     Content-Type: application/json
     {"fehler":"dienst_schlaeft"}

   deploy/nginx.conf faengt 502/503/504 ab und antwortet selbst — als JSON.
   Genau daran ist die erste Fassung dieser Zeile vorbeigelaufen: Sie fragte
   nach `kein_dienst`, und das setzt ruf() nur bei HTML oder gar keiner
   Antwort. Ein kalt startender Container hiess damit `abgemeldet`, und die
   Seite bot eine Anmeldung an, die nicht funktionieren konnte.
  */
  antwortet = () => json({ fehler: 'dienst_schlaeft' }, 503);
  const z = await klaereZustand();
  assert.equal(z, ZUSTAND.keinDienst,
    'ein schlafender Dienst gilt als abgemeldet — die Seite böte eine Anmeldung an');
  assert.equal(kontoNoetig(), false);
});

await pruefe('ohne Dienst schreibt der Abgleich nichts und ruft nichts', async () => {
  zuruecksetzen();
  await klaereZustand();
  gerufen = [];
  const antwort = await gleicheAb(alsMenge(['a', 'b']));
  assert.equal(antwort, null);
  assert.equal(gerufen.length, 0, 'der Abgleich hat ohne Konto das Netz berührt');
});

await pruefe('ohne Dienst wird nichts auf dem Gerät abgelegt', async () => {
  zuruecksetzen();
  await klaereZustand();
  // § 25 TDDDG hängt am Speichern auf dem Endgerät. Wer nie gefragt wird,
  // beantwortet nichts, und dann darf auch nichts abgelegt werden.
  assert.equal(lager.size, 0, `abgelegt wurde: ${[...lager.keys()].join(', ')}`);
});

// ── 2 · Mit Dienst ─────────────────────────────────────────────────

await pruefe('Dienst antwortet `angemeldet: false` → `abgemeldet`', async () => {
  zuruecksetzen();
  antwortet = () => json({ angemeldet: false });
  const z = await klaereZustand();
  assert.equal(z, ZUSTAND.abgemeldet);
  // Erst JETZT darf am Herzen gefragt werden.
  assert.equal(kontoNoetig(), true);
  assert.equal(gerufen[0].adresse, '/api/konto');
});

await pruefe('Dienst kennt die Sitzung → `angemeldet`, keine Frage mehr', async () => {
  zuruecksetzen();
  antwortet = () => json({ angemeldet: true, kontoId: 'k1', adresse: 'du@example.org' });
  const z = await klaereZustand();
  assert.equal(z, ZUSTAND.angemeldet);
  assert.equal(angemeldet(), true);
  assert.equal(kontoDaten().adresse, 'du@example.org');
  assert.equal(kontoNoetig(), false, 'ein Angemeldeter wird noch einmal gefragt');
});

await pruefe('abmelden räumt den Zustand ab und meldet es', async () => {
  zuruecksetzen();
  antwortet = () => json({ angemeldet: true, kontoId: 'k1' });
  await klaereZustand();
  let gemeldet = null;
  const weg = konto.beiAenderung((z) => { gemeldet = z; });
  antwortet = () => json({}, 204);
  await abmelden();
  weg();
  assert.equal(kontozustand(), ZUSTAND.abgemeldet);
  assert.equal(kontoDaten(), null);
  assert.equal(gemeldet, ZUSTAND.abgemeldet, 'die Oberfläche erfährt nichts vom Abmelden');
  assert.equal(gerufen.at(-1).adresse, '/api/abmelden');
  assert.equal(gerufen.at(-1).optionen.method, 'POST');
});

await pruefe('der Anmeldecode fährt die Sprache mit', async () => {
  zuruecksetzen();
  antwortet = () => json({}, 204);
  const ok = await fordereCode('du@example.org');
  assert.equal(ok, true);
  const rumpf = JSON.parse(gerufen.at(-1).optionen.body);
  // Ohne dieses Feld schreibt der Dienst die Mail auf Deutsch — auch für
  // jemanden, der auf /ja/ steht. server.mjs liest koerper.sprache.
  assert.ok(rumpf.sprache, 'der Aufruf trägt keine Sprache');
  assert.equal(rumpf.mail, 'du@example.org');
});

await pruefe('ein falscher Code meldet Fehlschlag statt Anmeldung', async () => {
  zuruecksetzen();
  antwortet = () => json({ angemeldet: false });
  await klaereZustand();
  antwortet = () => json({ fehler: 'code_ungueltig', grund: 'kein_code' }, 401);
  const a = await loeseCodeEin('du@example.org', '000000');
  assert.equal(a.ok, false);
  assert.equal(a.status, 401);
  assert.equal(kontozustand(), ZUSTAND.abgemeldet, 'ein 401 hat angemeldet');
});

await pruefe('ein falsches Passwort meldet Fehlschlag statt Anmeldung', async () => {
  zuruecksetzen();
  antwortet = () => json({ angemeldet: false });
  await klaereZustand();
  antwortet = () => json({ fehler: 'anmeldung_fehlgeschlagen' }, 401);
  const a = await meldeMitPasswortAn('du@example.org', 'falsch');
  assert.equal(a.ok, false);
  assert.equal(kontozustand(), ZUSTAND.abgemeldet);
});

// ── 3 · Die eine Frage, und dass sie nur einmal kommt ──────────────

await pruefe('nur die Ablehnung wird gemerkt, die Zustimmung nicht', () => {
  zuruecksetzen();
  assert.equal(schonGefragt(), false);
  assert.equal(lager.size, 0);
  merkeAblehnung();
  assert.equal(schonGefragt(), true);
  assert.deepEqual([...lager.keys()], ['hz_konto_frage']);
  assert.equal(lager.get('hz_konto_frage'), 'nein');
  // Nach der Anmeldung gibt es nichts mehr zu merken.
  vergissAblehnung();
  assert.equal(schonGefragt(), false);
  assert.equal(lager.size, 0);
});

await pruefe('ohne Speicher wird nicht geworfen, sondern gefragt', () => {
  zuruecksetzen();
  const echt = globalThis.localStorage;
  // Privates Fenster, Speicher gesperrt: Das ist erwartbar und darf nicht
  // den Start mitreißen.
  globalThis.localStorage = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  try {
    assert.equal(schonGefragt(), false);
    merkeAblehnung();
    vergissAblehnung();
  } finally {
    globalThis.localStorage = echt;
  }
});

// ── 4 · Die Merkliste zusammenführen ───────────────────────────────

await pruefe('zwei Geräte ergeben die Vereinigung, nicht das letzte Wort', () => {
  const hier = alsMenge(['a', 'b'], 1000);
  const dort = alsMenge(['c', 'd'], 2000);
  assert.deepEqual(ausMenge(verschmilz(hier, dort)).sort(), ['a', 'b', 'c', 'd']);
});

await pruefe('ein entfernter Sender kommt nicht zurück', () => {
  // Der Grabstein ist der ganze Grund für die Bauart: Ohne ihn schiebt das
  // andere Gerät den eben gelöschten Sender beim nächsten Abgleich zurück.
  const hier = { a: { a: 1000, e: 3000 } };     // hier entfernt
  const dort = { a: { a: 1000, e: null } };     // dort noch drin
  assert.deepEqual(ausMenge(verschmilz(hier, dort)), []);
});

await pruefe('wieder gemerkt schlägt den Grabstein', () => {
  const hier = { a: { a: 5000, e: 3000 } };     // nach dem Löschen erneut gemerkt
  const dort = { a: { a: 1000, e: 3000 } };
  assert.deepEqual(ausMenge(verschmilz(hier, dort)), ['a']);
});

await pruefe('der Abgleich läuft nur mit Konto über die Leitung', async () => {
  zuruecksetzen();
  antwortet = () => json({ angemeldet: true, kontoId: 'k1' });
  await klaereZustand();
  gerufen = [];
  antwortet = () => json({ stand: 1, eintraege: { b: { a: 9, e: null } }, serverzeit: 9 });
  const a = await gleicheAb(alsMenge(['a'], 5));
  assert.equal(gerufen.length, 1);
  assert.equal(gerufen[0].adresse, '/api/platten/abgleich');
  assert.deepEqual(ausMenge(verschmilz(alsMenge(['a'], 5), a.eintraege)).sort(), ['a', 'b']);
});

// ── 5 · Die Gegenprobe an der Quelle ───────────────────────────────
//
// Kein Modultest bemerkt, wenn jemand die Anmeldefrage zusätzlich an einer
// zweiten Stelle stellt oder das Herz von ihr abhängig macht. Deshalb hier
// die Quelle selbst.

const appJs = readFileSync(join(wurzel, 'assets/app.js'), 'utf8');
const swJs = readFileSync(join(wurzel, 'sw.js'), 'utf8');
const indexHtml = readFileSync(join(wurzel, 'index.html'), 'utf8');
/*
 Ohne Kommentare. In diesem Haus steht in den Kommentaren, WARUM etwas
 fehlt — auch, welche Dienstadresse absichtlich nicht angeboten wird. Eine
 Prüfung, die den Kommentar mitliest, findet dort genau das, wogegen sie
 gerichtet ist, und meldet einen Fehler, der keiner ist.
*/
const indexOhneKommentare = indexHtml.replace(/<!--[\s\S]*?-->/g, '');

await pruefe('app.js bindet konto.mjs überhaupt ein', () => {
  // Genau der Befund, der zu dieser Arbeit geführt hat.
  assert.ok(/from\s+'\.\/lib\/konto\.mjs'/.test(appJs),
    'assets/lib/konto.mjs wird von app.js nicht importiert');
});

await pruefe('gefragt wird nur am Herzen, und nur beim Merken', () => {
  const stellen = [...appJs.matchAll(/frageNachKonto\(\)/g)].length;
  // Zweimal: die Definition und der eine Aufruf.
  assert.equal(stellen, 2, `frageNachKonto() steht ${stellen}-mal in app.js`);

  const zeilen = appJs.split('\n');
  const anfang = zeilen.findIndex((z) => z.includes('toggleFavorit(id) {'));
  assert.ok(anfang > 0, 'toggleFavorit() nicht gefunden');
  const koerper = zeilen.slice(anfang, anfang + 20).join('\n');
  assert.ok(/frageNachKonto\(\)/.test(koerper),
    'die Frage hängt nicht mehr am Herzen');
  assert.ok(/if \(drin\)[^\n]*frageNachKonto/.test(koerper),
    'gefragt wird auch beim Entfernen eines Herzens');
});

await pruefe('das Herz merkt, bevor es fragt', () => {
  const zeilen = appJs.split('\n');
  const anfang = zeilen.findIndex((z) => z.includes('toggleFavorit(id) {'));
  const koerper = zeilen.slice(anfang, anfang + 20).join('\n');
  const geschrieben = koerper.indexOf('speicher.schreib(SCHLUESSEL.favoriten');
  const gefragt = koerper.indexOf('frageNachKonto');
  assert.ok(geschrieben > -1 && gefragt > geschrieben,
    'die Anmeldefrage steht vor dem Merken — das Herz wartet dann auf sie');
});

await pruefe('kein Modul außer app.js bindet das Konto ein', () => {
  // Ein zweiter Einbindungsort wäre ein zweiter Ort, an dem gefragt werden
  // kann. Die Regel „genau EINE Stelle" ist sonst nicht zu halten.
  const module = ['achsen', 'aktualisierung', 'fehlerbericht', 'gewichtung',
                  'messung', 'myretuner', 'senderbild', 'sprache', 'symbole',
                  'titel', 'verlauf', 'verwandt', 'wochentipp'];
  for (const name of module) {
    const quelle = readFileSync(join(wurzel, `assets/lib/${name}.mjs`), 'utf8');
    assert.ok(!/konto\.mjs/.test(quelle), `lib/${name}.mjs bindet konto.mjs ein`);
  }
});

await pruefe('der Service Worker kennt das Modul und fasst /api/ nicht an', () => {
  assert.ok(swJs.includes("'/assets/lib/konto.mjs'"),
    'konto.mjs fehlt in SHELL_FILES — offline bricht dann der ganze Start ab');
  assert.ok(/pathname\.startsWith\('\/api\/'\)/.test(swJs),
    'der Worker greift nach /api/ — dort liegt die Merkliste eines Angemeldeten');
  const fassung = /SW_VERSION = '([^']+)'/.exec(swJs)?.[1];
  assert.ok(fassung && fassung !== 'iyambae-v25',
    `SW_VERSION steht noch auf ${fassung} — bestehende Besucher bekämen die alten Dateien`);
});

await pruefe('die Oberfläche erfindet keine Endpunkte', () => {
  /*
   Jede Adresse unter /api/, die in index.html oder app.js steht, muss es im
   Dienst geben. Nachgesehen wird in dienst/src/ — nicht geraten.
  */
  const quellen = ['server', 'google', 'apple', 'passkey']
    .map((n) => join(wurzel, `dienst/src/${n}.mjs`));
  if (!quellen.every((p) => existsSync(p))) {
    ueberspringe('dienst/ liegt nicht vor (steht in .dockerignore) — '
               + 'diese Probe läuft im Arbeitsverzeichnis, nicht im Bau');
  }
  const dienst = quellen.map((p) => readFileSync(p, 'utf8')).join('\n');
  const wege = new Set([
    ...[...indexHtml.matchAll(/["'](\/api\/[a-z/]+)["']/g)].map((m) => m[1]),
    ...[...appJs.matchAll(/["'](\/api\/[a-z/]+)["']/g)].map((m) => m[1]),
  ]);
  assert.ok(wege.size > 0, 'keine einzige Dienstadresse gefunden');
  for (const weg of wege) {
    assert.ok(dienst.includes(weg), `${weg} steht in keiner Datei unter dienst/src/`);
  }
});

await pruefe('Apple steht nirgends als Knopf — der Dienst antwortet 501', () => {
  // Gemessen gegen iyambae.fm am 23.08.2026:
  //   GET /api/apple/start → 501 {"fehler":"apple_nicht_eingerichtet"}
  // Ein Knopf, der auf eine JSON-Fehlerseite führt, ist schlechter als
  // keiner. Diese Zeile fällt, sobald der Schlüssel hinterlegt ist.
  assert.ok(!indexOhneKommentare.includes('/api/apple/'),
    'index.html bietet Apple an, obwohl der Dienst es nicht eingerichtet hat');
  assert.ok(!/konto\.apple/.test(appJs),
    'app.js kennt einen Apple-Weg, den der Dienst nicht eingerichtet hat');
});

await pruefe('alle sieben Sprachen kennen jeden Text der Anmeldung', () => {
  const kataloge = {};
  for (const k of ['de', 'en', 'fr', 'es', 'it', 'ja', 'ar']) {
    kataloge[k] = JSON.parse(readFileSync(join(wurzel, `assets/lang/${k}.json`), 'utf8'));
  }
  // Was im Programmtext und in der Auszeichnung wirklich nachgeschlagen wird.
  /*
   Jede Zeichenkette 'konto.…' im Programmtext, nicht nur die in t().
   Der erste Anlauf suchte nach t('konto.…') und übersah damit alles, was
   in einem Bedingungsausdruck oder in einer Tabelle steht — und meldete
   neun lebende Schlüssel als tot.
  */
  const benutzt = new Set([
    ...[...appJs.matchAll(/'(konto\.[a-zA-Z.]+)'/g)].map((m) => m[1]),
    ...[...indexOhneKommentare.matchAll(
      /data-(?:text|html|aria|platzhalter)="(konto\.[a-zA-Z.]+)"/g)].map((m) => m[1]),
  ]);
  assert.ok(benutzt.size >= 20, `nur ${benutzt.size} konto-Schlüssel gefunden`);
  for (const [kuerzel, katalog] of Object.entries(kataloge)) {
    const fehlend = [...benutzt].filter((s) => !katalog[s]);
    assert.deepEqual(fehlend, [], `${kuerzel}.json fehlt: ${fehlend.join(', ')}`);
  }
  // Und umgekehrt: kein Schlüssel, den niemand mehr nachschlägt.
  const tote = Object.keys(kataloge.de)
    .filter((s) => s.startsWith('konto.') && !benutzt.has(s));
  assert.deepEqual(tote, [], `tote Schlüssel: ${tote.join(', ')}`);
});

await pruefe('der Platzhalter {anzahl} steht in allen sieben', () => {
  for (const k of ['de', 'en', 'fr', 'es', 'it', 'ja', 'ar']) {
    const katalog = JSON.parse(readFileSync(join(wurzel, `assets/lang/${k}.json`), 'utf8'));
    assert.ok(katalog['konto.abgeglichen'].includes('{anzahl}'),
      `${k}.json: konto.abgeglichen hat den Platzhalter verloren`);
  }
});

console.log(fehler === 0
  ? '\n  Ohne Dienst passiert nichts, und gefragt wird nur am Herzen.\n'
  : `\n  ${fehler} Prüfung(en) fehlgeschlagen.\n`);
process.exit(fehler === 0 ? 0 : 1);
