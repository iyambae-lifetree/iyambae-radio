import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STUFEN, AUSBLENDEN_MS, naechsteStufe, zustand } from '../../assets/lib/schlummer.mjs';

test('die Stufen laufen im Kreis und fangen bei Unbekanntem vorn an', () => {
  assert.equal(naechsteStufe(0), 15);
  assert.equal(naechsteStufe(90), 0);
  assert.equal(naechsteStufe(42), STUFEN[0]);
  let m = 0;
  for (let i = 0; i < STUFEN.length; i++) m = naechsteStufe(m);
  assert.equal(m, 0);
});

test('ohne Ende ist der Timer aus und die Lautstärke unberührt', () => {
  assert.deepEqual(zustand(null, 123), { phase: 'aus', restMinuten: 0, faktor: 1 });
});

test('Restminuten werden aufgerundet, voller Ton bis zum Ausblenden', () => {
  const z = zustand(15 * 60_000, 1);
  assert.equal(z.phase, 'laeuft');
  assert.equal(z.restMinuten, 15);
  assert.equal(z.faktor, 1);
});

test('in der letzten halben Minute wird linear leiser', () => {
  const z = zustand(AUSBLENDEN_MS, AUSBLENDEN_MS / 2);
  assert.equal(z.phase, 'blendet');
  assert.equal(z.faktor, 0.5);
});

test('ein verspäteter Takt (gedrosselter Hintergrund-Tab) hält trotzdem an', () => {
  const z = zustand(1000, 1000 + 5 * 60_000);
  assert.equal(z.phase, 'schluss');
  assert.equal(z.faktor, 0);
});
