import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { waehleUeberraschung } from '../../assets/lib/gewichtung.mjs';
import { tippDerWoche } from '../../assets/lib/wochentipp.mjs';

// Der Zufall soll überraschen. Aus einem Regal, das ausdrücklich das
// Vertraute sammelt, zu ziehen wäre das Gegenteil davon.

const katalog = JSON.parse(await readFile(new URL('../../data/sender.json', import.meta.url), 'utf8'));
const zurueckgenommen = new Set(katalog.regale.filter(r => r.zurueckgenommen).map(r => r.id));
const ziehbar = katalog.sender.filter(s => !zurueckgenommen.has(s.regal));

test('es gibt ueberhaupt ein zurueckgenommenes Regal', () => {
  assert.ok(zurueckgenommen.size > 0, 'sonst prueft dieser Test nichts');
});

test('die Wuehlkiste ist aus der Ziehmenge heraus', () => {
  assert.ok(ziehbar.length < katalog.sender.length);
  assert.ok(ziehbar.every(s => !zurueckgenommen.has(s.regal)));
});

test('hundert Ziehungen bringen nie einen Sender aus der Wuehlkiste', () => {
  for (let i = 0; i < 100; i++) {
    const [treffer] = waehleUeberraschung(ziehbar, {}, 1);
    assert.ok(!zurueckgenommen.has(treffer.regal), `${treffer.name} kam aus ${treffer.regal}`);
  }
});

test('auch die Auslage bleibt frei davon', () => {
  for (let i = 0; i < 40; i++) {
    for (const s of waehleUeberraschung(ziehbar, {}, 6)) {
      assert.ok(!zurueckgenommen.has(s.regal));
    }
  }
});

test('der Sender der Woche kommt ein Jahr lang nie aus der Wuehlkiste', () => {
  for (let w = 0; w < 60; w++) {
    const d = new Date(Date.UTC(2026, 0, 5 + w * 7));
    const tipp = tippDerWoche(ziehbar, d);
    assert.ok(!zurueckgenommen.has(tipp.sender.regal));
  }
});

test('der Programmcode filtert wirklich nach dem Merkmal', async () => {
  const app = await readFile(new URL('../../assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /r\.zurueckgenommen/, 'die Ziehmenge muss das Merkmal auswerten');
  assert.match(app, /tippDerWoche\(this\._ziehbareSender\(\)\)/,
    'auch die Wochenempfehlung zieht aus der gefilterten Menge');
});
