import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findeVerwandten } from '../../assets/lib/verwandt.mjs';

const ALLE = [
  { id: 'a', regal: 'japan', etiketten: ['community', 'live-dj'] },
  { id: 'b', regal: 'japan', etiketten: ['community'] },
  { id: 'c', regal: 'japan', etiketten: [] },
  { id: 'd', regal: 'barrio', etiketten: ['community', 'live-dj'] },
];

test('bevorzugt gleiches Regal mit meisten gemeinsamen Etiketten', () => {
  assert.equal(findeVerwandten(ALLE[0], ALLE, new Set(['a'])).id, 'b');
});

test('weicht auf gleiches Regal ohne Etikettentreffer aus', () => {
  assert.equal(findeVerwandten(ALLE[0], ALLE, new Set(['a', 'b'])).id, 'c');
});

test('weicht auf anderes Regal aus, wenn das eigene erschoepft ist', () => {
  assert.equal(findeVerwandten(ALLE[0], ALLE, new Set(['a', 'b', 'c'])).id, 'd');
});

test('gibt null zurueck, wenn nichts uebrig ist', () => {
  assert.equal(findeVerwandten(ALLE[0], ALLE, new Set(['a', 'b', 'c', 'd'])), null);
});
