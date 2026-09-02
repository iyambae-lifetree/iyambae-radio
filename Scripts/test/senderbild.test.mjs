import { test } from 'node:test';
import assert from 'node:assert/strict';
import { senderbild, hatEigenesLogo, regalton, MARKE } from '../../assets/lib/senderbild.mjs';

test('ein eigenes Logo hat Vorrang', () => {
  // Mit fuehrendem Schraegstrich, seit die Seite unter /de/, /en/ … liegt:
  // Ohne ihn suchte der Browser die Bilder unter /de/assets/logos/ und fand
  // 95 davon nicht. Das Modul setzt ihn deshalb selbst.
  assert.equal(senderbild({ logo: 'assets/logos/nts-1.webp' }), '/assets/logos/nts-1.webp');
  assert.equal(hatEigenesLogo({ logo: 'assets/logos/nts-1.webp' }), true);
});

test('ohne Logo erscheint die IYAMBAE-Marke', () => {
  assert.equal(senderbild({ name: 'ByteFM' }), MARKE);
  assert.equal(hatEigenesLogo({ name: 'ByteFM' }), false);
});

test('nichts kaputt bei fehlenden Angaben', () => {
  assert.equal(senderbild(null), MARKE);
  assert.equal(senderbild({ logo: '' }), MARKE);
  assert.equal(hatEigenesLogo(null), false);
});

test('jedes Regal hat seinen Farbton, unbekannte einen Rueckfall', () => {
  assert.equal(regalton({ regal: 'japan' }), '#E0607E');
  assert.equal(regalton({ regal: 'gibtsnicht' }), '#F2B705');
  assert.equal(regalton(null), '#F2B705');
});

test('das Feld kanal ist bei jedem Sender gesetzt', async () => {
  // Michas Bitte vom 21.08.2026: Dann kann er Kanäle desselben Hauses
  // zusammenfassen, ohne raten zu müssen, ob zwei Namen zusammengehören.
  const { readFile } = await import('node:fs/promises');
  const k = JSON.parse(await readFile(new URL('../../data/sender.json', import.meta.url), 'utf8'));
  const ohne = k.sender.filter(s => !s.kanal);
  assert.deepEqual(ohne.map(s => s.id), [], 'diese Sender haben kein kanal-Feld');
});

test('Kanaele eines Hauses sind untereinander verschieden', async () => {
  const { readFile } = await import('node:fs/promises');
  const k = JSON.parse(await readFile(new URL('../../data/sender.json', import.meta.url), 'utf8'));
  const nachHaus = new Map();
  for (const s of k.sender) {
    if (!nachHaus.has(s.betreiber)) nachHaus.set(s.betreiber, []);
    nachHaus.get(s.betreiber).push(s.kanal);
  }
  for (const [haus, kanaele] of nachHaus) {
    assert.equal(new Set(kanaele).size, kanaele.length,
      `${haus} hat zwei Kanäle mit derselben Bezeichnung: ${kanaele.join(', ')}`);
  }
});
