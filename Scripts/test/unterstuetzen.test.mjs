import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unterstuetzenAdresse } from '../../assets/lib/unterstuetzen.mjs';

const katalog = JSON.parse(await readFile(new URL('../../data/sender.json', import.meta.url), 'utf8'));

test('nur https kommt durch', () => {
  assert.equal(unterstuetzenAdresse({ unterstuetzen: 'https://somafm.com/support/' }),
    'https://somafm.com/support/');
  assert.equal(unterstuetzenAdresse({ unterstuetzen: 'http://somafm.com/support/' }), null);
  assert.equal(unterstuetzenAdresse({ unterstuetzen: 'javascript:alert(1)' }), null);
  assert.equal(unterstuetzenAdresse({ unterstuetzen: 'keine adresse' }), null);
});

test('ohne Feld kein Link', () => {
  assert.equal(unterstuetzenAdresse({}), null);
  assert.equal(unterstuetzenAdresse({ unterstuetzen: '' }), null);
  assert.equal(unterstuetzenAdresse(undefined), null);
});

test('ein Anfuehrungszeichen bricht nicht aus dem Attribut aus', () => {
  const a = unterstuetzenAdresse({ unterstuetzen: 'https://example.org/"><script>' });
  assert.ok(a && !a.includes('"') && !a.includes('<'), a);
});

test('jede Adresse im Katalog ist https und lesbar', () => {
  const mit = katalog.sender.filter(s => 'unterstuetzen' in s);
  assert.ok(mit.length > 0, 'kein Sender hat eine Unterstuetzen-Adresse');
  for (const s of mit) {
    assert.equal(unterstuetzenAdresse(s), new URL(s.unterstuetzen).href,
      `${s.id}: ${s.unterstuetzen}`);
  }
});

test('jeder Sender traegt ein Aufnahmedatum fuer „Neu im Laden“', () => {
  for (const s of katalog.sender) {
    assert.match(s.seit ?? '', /^\d{4}-\d{2}-\d{2}$/, `${s.id}: seit fehlt oder ist kein Datum`);
    assert.ok(!Number.isNaN(Date.parse(s.seit)), `${s.id}: ${s.seit}`);
  }
  // Ein Datum in der Zukunft waere erfunden — und stuende im Feed ganz oben.
  const heute = new Date().toISOString().slice(0, 10);
  const spaeter = katalog.sender.filter(s => s.seit > heute);
  assert.deepEqual(spaeter.map(s => s.id), []);
});
