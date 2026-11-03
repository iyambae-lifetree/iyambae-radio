/*
 Das Mess-Abzeichen auf der Seite /stimmung/ (432hz-radio#27).

 Der Dienst prueft sich in dienst/test/abzeichen.test.mjs. Hier steht, was
 auf DIESER Seite der Leitung schiefgehen kann: Was der Browser schickt
 (nur der Befund, nie Datei oder Name), dass nur ein 201 mit sauberer
 Antwort als Erfolg gilt, dass der Einbettcode nicht aus seinem Attribut
 ausbricht — und dass nginx den Weg auf dem richtigen Hostnamen ohne
 Zugriffsprotokoll weiterreicht.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import {
  befund, hexVon, pruefsumme, verweise, einbettcode, erzeuge, traegt,
} from '../../apps/assets/lib/abzeichen.mjs';

const nginx = readFileSync(new URL('../../deploy/nginx.conf', import.meta.url), 'utf8');
const stimmung = readFileSync(new URL('../../apps/stimmung.html', import.meta.url), 'utf8');

test('der Befund hat genau vier Felder, gerundet wie im Dienst', () => {
  const b = befund({ a4: 432.14999, sicherheit: 0.8749 }, 221.6, 'ab'.repeat(32));
  assert.deepEqual(b, { a4: 432.1, sicherheit: 0.87, dauer: 222, sha256: 'ab'.repeat(32) });
});

test('unter 0,35 traegt die Messung nicht — und dann gibt es keinen Knopf', () => {
  assert.equal(traegt(0.349), false);
  assert.equal(traegt(0.35), true);
});

test('die Pruefsumme ist die SHA-256 der Datei, klein geschrieben', async () => {
  const daten = new TextEncoder().encode('IYAMBAE 432');
  const erwartet = createHash('sha256').update(daten).digest('hex');
  assert.equal(await pruefsumme(daten.buffer), erwartet);
  assert.equal(hexVon(new Uint8Array([0, 15, 255]).buffer), '000fff');
});

test('Verweise und Einbettcode', () => {
  const v = verweise('https://apps.iyambae.fm', '0zz0000000');
  assert.deepEqual(v, {
    seite: 'https://apps.iyambae.fm/messung/0zz0000000',
    bild: 'https://apps.iyambae.fm/messung/0zz0000000.svg',
  });
  const code = einbettcode(v, '432,1 Hz "gemessen" <b>');
  assert.ok(code.startsWith('<a href="https://apps.iyambae.fm/messung/0zz0000000">'));
  assert.ok(code.includes('src="https://apps.iyambae.fm/messung/0zz0000000.svg"'));
  assert.ok(code.includes('&quot;gemessen&quot; &lt;b&gt;'), code);
  assert.ok(!/<b>/.test(code));
});

test('erzeuge: nur 201 mit sauberer Antwort gilt, und es geht nur der Befund hinaus', async () => {
  const gesendet = [];
  const alt = globalThis.fetch;
  const antworten = [
    { status: 201, json: async () => ({ kennung: '0zz0000000', loeschschluessel: 'a'.repeat(32) }) },
    { status: 200, json: async () => ({ kennung: '0zz0000000', loeschschluessel: 'a'.repeat(32) }) },
    { status: 201, json: async () => ({ kennung: '<script>', loeschschluessel: 'a'.repeat(32) }) },
    { status: 429, json: async () => ({ fehler: 'zu_viele_versuche' }) },
  ];
  globalThis.fetch = async (adresse, optionen) => { gesendet.push([adresse, optionen]); return antworten.shift(); };
  try {
    const b = { a4: 432.1, sicherheit: 0.87, dauer: 222, sha256: 'ab'.repeat(32), dateiname: 'Privat.flac' };
    assert.deepEqual(await erzeuge(b), { kennung: '0zz0000000', loeschschluessel: 'a'.repeat(32) });
    assert.equal(await erzeuge(b), null, '200 ist nicht 201 — siehe die Umfrage in #5');
    assert.equal(await erzeuge(b), null, 'eine Kennung, die keine ist, kommt nicht auf die Seite');
    assert.equal(await erzeuge(b), null);
  } finally {
    globalThis.fetch = alt;
  }
  const [adresse, optionen] = gesendet[0];
  assert.equal(adresse, '/api/messung');
  assert.equal(optionen.method, 'POST');
  assert.equal(optionen.headers['Content-Type'], 'application/json');
  assert.equal(optionen.credentials, 'omit');
  assert.deepEqual(Object.keys(JSON.parse(optionen.body)).sort(), ['a4', 'dauer', 'sha256', 'sicherheit']);
});

test('die Seite sendet erst auf Knopfdruck und sagt „nur jetzt sichtbar"', () => {
  assert.ok(stimmung.includes('id="abzKnopf"'));
  assert.ok(stimmung.includes('data-text="abz.knopf">Abzeichen erzeugen<'));
  assert.ok(/data-html="abz\.nurjetzt"[^>]*><strong>Nur jetzt sichtbar/.test(stimmung));
  // Gemessen, nie geprueft — auch nicht auf dieser Seite.
  const kasten = stimmung.slice(stimmung.indexOf('id="abzKasten"'), stimmung.indexOf('</section>'));
  assert.ok(!/gepr[uü]ft/i.test(kasten));
});

// ── nginx ───────────────────────────────────────────────────────────

/** Der Block eines server, an seinem server_name erkannt. */
function serverBlock(name) {
  const start = nginx.indexOf(`server_name ${name};`);
  assert.ok(start > 0, name);
  const ende = nginx.indexOf('\nserver {', start);
  return nginx.slice(start, ende < 0 ? undefined : ende);
}

test('nginx: /messung/ geht auf apps.iyambae.fm an den Dienst, ohne Zugriffsprotokoll', () => {
  const apps = serverBlock('apps.iyambae.fm');
  const block = apps.slice(apps.indexOf('location ^~ /messung/'));
  assert.ok(apps.includes('location ^~ /messung/'));
  assert.match(block, /proxy_pass http:\/\/127\.0\.0\.1:8081;/);
  assert.match(block, /access_log off;/);
  assert.match(block, /limit_except GET/);
  // Auf dem Radio-Host gibt es den Weg nicht — dort heisst /messung die
  // Reichweitenmessung, und die hat damit nichts zu tun.
  assert.ok(!serverBlock('iyambae.fm www.iyambae.fm _').includes('location ^~ /messung/'));
});

test('nginx: Cross-Origin-Resource-Policy nur fuer das Bild', () => {
  const zeilen = nginx.split('\n').filter((z) => /^\s*add_header Cross-Origin-Resource-Policy/.test(z));
  assert.equal(zeilen.length, 1);
  const svg = nginx.slice(nginx.indexOf('location ~ ^/messung/[0-9a-z]+\\.svg$'));
  // Bis zur schliessenden Klammer DES Blocks, nicht der von limit_except.
  assert.ok(svg.slice(0, svg.indexOf('\n        }\n')).includes('add_header Cross-Origin-Resource-Policy "cross-origin" always;'));
});
