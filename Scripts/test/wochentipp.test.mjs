import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kalenderwoche, tippDerWoche, dazuPassend } from '../../assets/lib/wochentipp.mjs';

const SENDER = Array.from({ length: 117 }, (_, i) => ({
  id: 's' + i, name: 'Sender ' + i, regal: ['japan', 'jazz', 'barrio'][i % 3],
}));

test('Kalenderwoche nach ISO-8601', () => {
  // 2026-01-01 ist ein Donnerstag, gehoert also zu Woche 1 des Jahres 2026.
  assert.deepEqual(kalenderwoche(new Date('2026-01-01T12:00:00Z')), { jahr: 2026, woche: 1 });
  assert.deepEqual(kalenderwoche(new Date('2026-08-20T12:00:00Z')), { jahr: 2026, woche: 34 });
});

test('derselbe Tag ergibt denselben Tipp', () => {
  const a = tippDerWoche(SENDER, new Date('2026-08-20T08:00:00Z'));
  const b = tippDerWoche(SENDER, new Date('2026-08-20T22:00:00Z'));
  assert.equal(a.sender.id, b.sender.id, 'der Tipp darf nicht bei jedem Aufruf wechseln');
});

test('dieselbe Woche ergibt denselben Tipp', () => {
  const montag  = tippDerWoche(SENDER, new Date('2026-08-17T12:00:00Z'));
  const sonntag = tippDerWoche(SENDER, new Date('2026-08-23T12:00:00Z'));
  assert.equal(montag.sender.id, sonntag.sender.id);
});

test('die naechste Woche bringt einen anderen Sender', () => {
  const diese  = tippDerWoche(SENDER, new Date('2026-08-20T12:00:00Z'));
  const naechste = tippDerWoche(SENDER, new Date('2026-08-27T12:00:00Z'));
  assert.notEqual(diese.sender.id, naechste.sender.id);
});

test('ueber zwei Jahre wiederholt sich kaum etwas', () => {
  const gezogen = [];
  for (let w = 0; w < 104; w++) {
    const d = new Date(Date.UTC(2026, 0, 5 + w * 7));
    gezogen.push(tippDerWoche(SENDER, d).sender.id);
  }
  const verschieden = new Set(gezogen).size;
  assert.ok(verschieden > 75, `nur ${verschieden} verschiedene in 104 Wochen — zu wenig Streuung`);
});

test('aufeinanderfolgende Wochen bleiben nicht im selben Regal haengen', () => {
  const regale = [];
  for (let w = 0; w < 12; w++) {
    const d = new Date(Date.UTC(2026, 0, 5 + w * 7));
    regale.push(tippDerWoche(SENDER, d).sender.regal);
  }
  assert.ok(new Set(regale).size >= 2, 'zwoelf Wochen lang dasselbe Regal waere langweilig');
});

test('leerer Katalog ergibt keinen Tipp statt eines Fehlers', () => {
  assert.equal(tippDerWoche([], new Date()), null);
  assert.equal(tippDerWoche(null, new Date()), null);
});

test('Weiterhoeren kommt aus demselben Regal und ohne den Tipp selbst', () => {
  const tipp = SENDER[0];
  const dazu = dazuPassend(tipp, SENDER, 3);
  assert.equal(dazu.length, 3);
  assert.ok(dazu.every(s => s.regal === tipp.regal));
  assert.ok(dazu.every(s => s.id !== tipp.id));
});
