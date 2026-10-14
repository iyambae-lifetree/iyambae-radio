/*
 Die Sicherheitskoepfe aus deploy/nginx.conf — und die Falle, in der sie
 verschwinden (432hz-radio#44).

 nginx erbt `add_header` nur, wenn ein Block SELBST keines setzt. Ein
 einziges `add_header Cache-Control …` in einem location-Block wirft alle
 Koepfe der Ebene darueber weg, still. So fehlten am 01.10.2026 nosniff und
 Referrer-Policy auf allen HTML-Seiten von apps.iyambae.fm, bei Logos und
 Schriften, /sw.js, robots.txt, sitemap.xml und /.well-known/.

 Deshalb stehen die Koepfe in deploy/koepfe/ und jeder Block, der ein
 add_header traegt, laedt sie per `include`. Dieser Test liest die
 Konfiguration wie nginx — Bloecke, Anfuehrungszeichen, Kommentare,
 include — und prueft jeden Block einzeln. Wer einen neuen Block mit
 add_header anlegt und das include vergisst, faellt hier auf, nicht erst
 beim Nachmessen.

 Dazu zwei Pruefungen, auf denen die Richtlinie steht:
   - Das Radio hat kein einziges Inline-Skript. Sonst traegt
     `script-src 'self'` nicht.
   - Jedes Inline-Skript der Apps-Seite steht mit seinem Hash in der
     Richtlinie. Aendert jemand eins, bricht der Bau ab und nennt den neuen.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEPLOY = join(WURZEL, 'deploy');

// ── Ein kleiner Leser fuer nginx-Konfiguration ──────────────────────

function zerlege(text) {
  // Woerter, `{`, `}`, `;`. Anfuehrungszeichen halten zusammen, was sie
  // umschliessen — sonst zerbraeche `return 503 '{"fehler":…}'` den Baum.
  const teile = [];
  let i = 0;
  while (i < text.length) {
    const z = text[i];
    if (/\s/.test(z)) { i++; continue; }
    if (z === '#') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (z === '{' || z === '}' || z === ';') { teile.push(z); i++; continue; }
    let wort = '';
    while (i < text.length && !/[\s{};]/.test(text[i])) {
      if (text[i] === '"' || text[i] === "'") {
        const q = text[i++];
        while (i < text.length && text[i] !== q) {
          if (text[i] === '\\') wort += text[i++];
          wort += text[i++];
        }
        i++;
      } else {
        wort += text[i++];
      }
    }
    teile.push(wort);
  }
  return teile;
}

function baum(teile, datei) {
  let i = 0;
  function block() {
    const anweisungen = [];
    let aktuell = [];
    while (i < teile.length) {
      const t = teile[i++];
      if (t === ';') {
        const [name, ...arg] = aktuell;
        if (name === 'include') anweisungen.push(...lies(join(DEPLOY, arg[0])));
        else anweisungen.push({ name, arg });
        aktuell = [];
      } else if (t === '{') {
        const [name, ...arg] = aktuell;
        anweisungen.push({ name, arg, kinder: block() });
        aktuell = [];
      } else if (t === '}') {
        return anweisungen;
      } else {
        aktuell.push(t);
      }
    }
    assert.equal(aktuell.length, 0, `${datei}: Anweisung ohne Abschluss`);
    return anweisungen;
  }
  return block();
}

// include-Pfade sind relativ zu /etc/nginx; im Abbild liegt deploy/koepfe/
// unter /etc/nginx/koepfe/ (siehe Dockerfile). Hier also relativ zu deploy/.
function lies(pfad) {
  assert.ok(existsSync(pfad), `include zeigt ins Leere: ${pfad}`);
  return baum(zerlege(readFileSync(pfad, 'utf8')), pfad);
}

const KONF = lies(join(DEPLOY, 'nginx.conf'));
const SERVER = KONF.filter((a) => a.name === 'server');

function hostVon(server) {
  return server.kinder.find((a) => a.name === 'server_name').arg[0];
}

/** Jeder Block mit eigenem add_header, samt der Ebene des Servers selbst. */
function bloeckeMitKoepfen(server) {
  const raus = [{ wo: `server ${hostVon(server)}`, anweisungen: server.kinder }];
  (function geh(liste, pfad) {
    for (const a of liste) {
      if (!a.kinder) continue;
      const wo = `${pfad} > ${a.name} ${a.arg.join(' ')}`;
      if (a.kinder.some((k) => k.name === 'add_header')) raus.push({ wo, anweisungen: a.kinder });
      geh(a.kinder, wo);
    }
  })(server.kinder, `server ${hostVon(server)}`);
  return raus;
}

function koepfe(anweisungen) {
  const k = new Map();
  for (const a of anweisungen) {
    if (a.name !== 'add_header') continue;
    const name = a.arg[0].toLowerCase();
    k.set(name, { wert: a.arg[1], immer: a.arg.includes('always') });
  }
  return k;
}

const PFLICHT = [
  'x-content-type-options',
  'referrer-policy',
  'strict-transport-security',
  'x-frame-options',
  'permissions-policy',
  'content-security-policy-report-only',
];

function richtlinie(server) {
  const k = koepfe(server.kinder).get('content-security-policy-report-only');
  assert.ok(k, `server ${hostVon(server)}: keine Richtlinie`);
  return new Map(k.wert.split(';').map((s) => s.trim()).filter(Boolean)
    .map((s) => { const [d, ...q] = s.split(/\s+/); return [d, q]; }));
}

const RADIO = SERVER.find((s) => hostVon(s) === 'iyambae.fm');
const APPS = SERVER.find((s) => hostVon(s) === 'apps.iyambae.fm');

// ── Die Vererbungsfalle ─────────────────────────────────────────────

test('beide Hostnamen sind gefunden', () => {
  assert.equal(SERVER.length, 2);
  assert.ok(RADIO && APPS);
});

test('jeder Block mit add_header behaelt alle Sicherheitskoepfe', () => {
  const fehlt = [];
  for (const server of SERVER) {
    const eigene = koepfe(server.kinder).get('content-security-policy-report-only')?.wert;
    for (const { wo, anweisungen } of bloeckeMitKoepfen(server)) {
      const k = koepfe(anweisungen);
      for (const name of PFLICHT) {
        if (!k.has(name)) fehlt.push(`${wo}: ${name}`);
        else if (!k.get(name).immer) fehlt.push(`${wo}: ${name} ohne always`);
      }
      // Und die Richtlinie DIESES Hostnamens, nicht die des anderen.
      const csp = k.get('content-security-policy-report-only')?.wert;
      if (csp && csp !== eigene) fehlt.push(`${wo}: Richtlinie eines anderen Hostnamens`);
    }
  }
  assert.deepEqual(fehlt, [], 'Block mit eigenem add_header, aber ohne include koepfe/…');
});

test('die Pruefung findet die Falle, wenn sie da ist', () => {
  // Gegenprobe am Leser selbst: Ein Block mit nur Cache-Control muss als
  // unvollstaendig auffallen. Sonst bestuende der Test oben auch dann,
  // wenn bloeckeMitKoepfen() gar nichts faende.
  const falle = baum(zerlege(`server { server_name x; include koepfe/radio.conf;
    location /a/ { add_header Cache-Control "no-cache" always; } }`), 'falle');
  const bloecke = bloeckeMitKoepfen(falle[0]);
  assert.equal(bloecke.length, 2);
  assert.equal(koepfe(bloecke[0].anweisungen).size >= PFLICHT.length, true);
  assert.equal(koepfe(bloecke[1].anweisungen).has('x-content-type-options'), false);
});

test('jeder Server laedt seine eigene Richtlinie', () => {
  // Ueber die Kinderliste VOR dem Aufloesen ginge es genauer; die Werte
  // reichen aber: Die Apps-Richtlinie traegt Hashes, die des Radios keine.
  assert.ok(!richtlinie(RADIO).get('script-src').some((q) => q.startsWith("'sha256-")));
  assert.ok(richtlinie(APPS).get('script-src').some((q) => q.startsWith("'sha256-")));
});

test('HSTS und Einbettungsschutz stehen so, wie in #44 vereinbart', () => {
  for (const server of SERVER) {
    const k = koepfe(server.kinder);
    assert.equal(k.get('strict-transport-security').wert, 'max-age=31536000; includeSubDomains');
    assert.equal(k.get('x-frame-options').wert, 'DENY');
    assert.equal(k.get('x-content-type-options').wert, 'nosniff');
    assert.deepEqual(richtlinie(server).get('frame-ancestors'), ["'none'"]);
  }
});

test('die Richtlinie laesst zu, was die Seite wirklich braucht', () => {
  for (const server of SERVER) {
    const r = richtlinie(server);
    const wo = hostVon(server);
    assert.deepEqual(r.get('default-src'), ["'self'"], wo);
    assert.deepEqual(r.get('object-src'), ["'none'"], wo);
    assert.deepEqual(r.get('base-uri'), ["'self'"], wo);
    // Der Signalkern ist WebAssembly im AudioWorklet (retuner-worklet.js).
    // Worklets erben die Richtlinie der Seite; ohne diese Quelle
    // scheiterte `new WebAssembly.Module`.
    assert.ok(r.get('script-src').includes("'wasm-unsafe-eval'"), wo);
    assert.ok(!r.get('script-src').includes("'unsafe-inline'"), wo);
    assert.ok(!r.get('script-src').includes("'unsafe-eval'"), wo);
  }
  const r = richtlinie(RADIO);
  // Beliebige Radiostroeme, und hls.js spielt ueber MediaSource: blob:.
  assert.ok(r.get('media-src').includes('https:'));
  assert.ok(r.get('media-src').includes('blob:'));
  // hls.js legt fuer ID3-Metadaten eine leere Textspur an:
  // `track.src = "data:,WEBVTT"`. Ohne data: ein Verstoss je HLS-Sender.
  const hls = readFileSync(join(WURZEL, 'assets/lib/hls.light.min.mjs'), 'utf8');
  if (hls.includes('"data:,WEBVTT"')) assert.ok(r.get('media-src').includes('data:'));
  // hls.js laedt Listen per XHR/fetch, titel.mjs fragt fremde Titeldienste
  // (somafm, laut.fm, radio.co, radioking, zeno als EventSource), und
  // myretuner.mjs spricht mit dem Tuner auf diesem Rechner.
  assert.ok(r.get('connect-src').includes('https:'));
  assert.ok(r.get('connect-src').includes('http://127.0.0.1:47432'));
  // hls.js startet seinen Arbeiter aus einem blob:.
  assert.ok(r.get('worker-src').includes('blob:'));
});

test('die Tuner-Adresse in der Richtlinie ist die aus myretuner.mjs', () => {
  const quelle = readFileSync(join(WURZEL, 'assets/lib/myretuner.mjs'), 'utf8');
  const anschluss = /ANSCHLUSS\s*=\s*'([^']+)'/.exec(quelle)[1];
  assert.ok(richtlinie(RADIO).get('connect-src').includes(new URL(anschluss).origin));
});

// ── Inline-Skripte ──────────────────────────────────────────────────

const SKRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi;
const AUSFUEHRBAR = new Set(['', 'module', 'text/javascript', 'application/javascript']);

/** Hashes der ausfuehrbaren Inline-Skripte, so wie der Browser sie bildet. */
function inlineHashes(html) {
  // Der HTML-Leser des Browsers macht aus CRLF ein LF, bevor er hasht.
  const text = html.replace(/\r\n?/g, '\n');
  const raus = [];
  for (const m of text.matchAll(SKRIPT)) {
    const attr = m[1] || '';
    if (/\bsrc\s*=/i.test(attr)) continue;
    const typ = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attr)?.[1] || '').toLowerCase();
    if (!AUSFUEHRBAR.has(typ)) continue;   // JSON-LD ist Daten, kein Skript
    raus.push(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
  return raus;
}

function handler(html) {
  return [...html.matchAll(/<[a-zA-Z][^<>]*\s(on[a-z]+)\s*=/g)].map((m) => m[1])
    .concat([...html.matchAll(/(?:href|src|action)\s*=\s*["']?\s*javascript:/gi)].map(() => 'javascript:'));
}

function htmlDateien(ordner, tief = true) {
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return tief ? htmlDateien(p) : [];
    return n.endsWith('.html') ? [p] : [];
  });
}

const SPRACHEN = ['de', 'en', 'fr', 'es', 'it', 'ja', 'ar'];

// Gebaute Seiten gibt es nur nach den Bauskripten — im Docker-Bau also
// immer, auf dem eigenen Rechner meist nicht. Die Vorlagen gibt es immer.
const RADIO_SEITEN = [
  join(WURZEL, 'index.html'),
  join(WURZEL, 'regal.html'),
  ...SPRACHEN.flatMap((s) => htmlDateien(join(WURZEL, s))),
  ...htmlDateien(join(WURZEL, 'recht')),
];
const APPS_SEITEN = [
  ...htmlDateien(join(WURZEL, 'apps'), false),
  ...SPRACHEN.flatMap((s) => htmlDateien(join(WURZEL, 'apps', s))),
];

test('das Radio hat kein Inline-Skript und keinen on…-Handler', () => {
  // myretuner-test.html ist eine Pruefseite fuer den Tuner auf dem Rechner,
  // keine Seite fuer Besucher, und hat beides. Unter der Richtlinie liefe
  // sie nicht mehr, sobald sie scharf geschaltet ist — siehe den PR.
  const funde = [];
  for (const f of RADIO_SEITEN) {
    const html = readFileSync(f, 'utf8');
    for (const h of inlineHashes(html)) funde.push(`${f}: Inline-Skript ${h}`);
    for (const h of handler(html)) funde.push(`${f}: ${h}`);
  }
  assert.deepEqual(funde, []);
});

test('jedes Inline-Skript der Apps-Seite steht mit Hash in der Richtlinie', () => {
  const erlaubt = new Set(richtlinie(APPS).get('script-src'));
  const fehlt = [];
  const gebraucht = new Set();
  for (const f of APPS_SEITEN) {
    for (const h of inlineHashes(readFileSync(f, 'utf8'))) {
      gebraucht.add(h);
      if (!erlaubt.has(h)) fehlt.push(`${f}: ${h}`);
    }
  }
  assert.ok(gebraucht.size > 0, 'keine Inline-Skripte gefunden — Leser kaputt?');
  assert.deepEqual(fehlt, [], 'Hash in deploy/koepfe/apps.conf eintragen (und den alten streichen)');
  // Und umgekehrt: kein Hash, zu dem es kein Skript mehr gibt.
  const verwaist = [...erlaubt].filter((q) => q.startsWith("'sha256-") && !gebraucht.has(q));
  assert.deepEqual(verwaist, [], 'Hash ohne Skript in deploy/koepfe/apps.conf');
});

test('die Apps-Seiten haben keinen on…-Handler', () => {
  // Hashes erlauben Skriptbloecke, keine Attribute. Ein onclick= liefe
  // unter der Richtlinie nicht.
  const funde = APPS_SEITEN.flatMap((f) => handler(readFileSync(f, 'utf8')).map((h) => `${f}: ${h}`));
  assert.deepEqual(funde, []);
});
