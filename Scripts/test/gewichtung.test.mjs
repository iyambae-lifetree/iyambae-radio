import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waehleUeberraschung } from '../../assets/lib/gewichtung.mjs';

const SENDER = Array.from({ length: 50 }, (_, i) => ({ id: 's' + i, name: 'Sender ' + i }));

test('liefert die gewuenschte Anzahl', () => {
  assert.equal(waehleUeberraschung(SENDER, {}, 6).length, 6);
});

test('liefert keine Doppelten', () => {
  const ids = waehleUeberraschung(SENDER, {}, 10).map(s => s.id);
  assert.equal(new Set(ids).size, 10);
});

test('fordert mehr als vorhanden an, liefert alle', () => {
  assert.equal(waehleUeberraschung(SENDER, {}, 999).length, SENDER.length);
});

test('oft Gehoertes kommt deutlich seltener', () => {
  const gehoert = { s0: 100 };
  let getroffen = 0;
  for (let i = 0; i < 400; i++) {
    if (waehleUeberraschung(SENDER, gehoert, 5).some(s => s.id === 's0')) getroffen++;
  }
  assert.ok(getroffen < 15, 'oft Gehoertes kam ' + getroffen + '-mal — zu haeufig');
});

test('nie Gehoertes ist nicht ausgeschlossen', () => {
  const gehoert = Object.fromEntries(SENDER.map(s => [s.id, 100]));
  gehoert.s7 = 0;
  let getroffen = 0;
  for (let i = 0; i < 200; i++) {
    if (waehleUeberraschung(SENDER, gehoert, 5).some(s => s.id === 's7')) getroffen++;
  }
  assert.ok(getroffen > 100, 'nie Gehoertes kam nur ' + getroffen + '-mal');
});

test('leere Senderliste ergibt leeres Ergebnis', () => {
  assert.deepEqual(waehleUeberraschung([], {}, 5), []);
});

test('zuletzt Gehoertes bekommt einen Malus', () => {
  const zuletzt = ['s3'];
  let getroffen = 0;
  for (let i = 0; i < 400; i++) {
    if (waehleUeberraschung(SENDER, {}, 5, zuletzt).some(s => s.id === 's3')) getroffen++;
  }
  assert.ok(getroffen < 25, 'zuletzt Gehoertes kam ' + getroffen + '-mal — zu haeufig');
});

test('ohne zuletzt-Liste verhaelt es sich wie vorher', () => {
  assert.equal(waehleUeberraschung(SENDER, {}, 6).length, 6);
  assert.equal(waehleUeberraschung(SENDER, {}, 6, []).length, 6);
});
