import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { waehleUeberraschung } from '../../assets/lib/gewichtung.mjs';
import { tippDerWoche } from '../../assets/lib/wochentipp.mjs';

// Der Zufall soll überraschen. Aus einem Regal, das ausdrücklich das
// Vertraute sammelt, zu ziehen wäre das Gegenteil davon.

const katalog = JSON.parse(await readFile(new URL('../../data/sender.json', import.meta.url), 'utf8'));
const zurueckgenommen = new Set(katalog.regale.filter(r => r.zurueckgenommen).map(r => r.id));

/*
 Die Ziehmenge kommt aus dem PROGRAMM, nicht aus einem Filter hier im Test.
 Vorher stand hier dieselbe Filterzeile wie in app.js — und dann prueften
 hundert Ziehungen nur, dass waehleUeberraschung nichts erfindet. Ob app.js
 wirklich filtert, sah niemand.

 _ziehbareSender() ist eine Methode der Radio-Klasse; app.js laesst sich
 nicht als Modul laden, weil es beim Import das Dokument anfasst. Deshalb
 wird der Rumpf der Methode aus dem Quelltext geschnitten und mit einem
 nachgebauten `this` ausgefuehrt. Bricht das Schneiden, faellt der Test
 laut — nicht still gruen.
*/
const app = await readFile(new URL('../../assets/app.js', import.meta.url), 'utf8');
const rumpf = /_ziehbareSender\(\)\s*\{([\s\S]*?)\n  \}/.exec(app);
assert.ok(rumpf, '_ziehbareSender() nicht in app.js gefunden');
const rumpfKatalog = /_katalogOhneWuehlkiste\(\)\s*\{([\s\S]*?)\n  \}/.exec(app);
assert.ok(rumpfKatalog, '_katalogOhneWuehlkiste() nicht in app.js gefunden');
// Der Katalogrumpf bekommt ABSICHTLICH kein istWackelig: Griffe er danach,
// fiele er mit ReferenceError — genau das soll auffallen.
const katalogOhneWuehlkiste = new Function(rumpfKatalog[1]);
const nachgebautesThis = () => ({
  ui: { regale: katalog.regale, sender: katalog.sender },
  _katalogOhneWuehlkiste() { return katalogOhneWuehlkiste.call(this); },
});
const ziehbareSender = new Function('istWackelig', rumpf[1]);
const ziehbar = ziehbareSender.call(nachgebautesThis(), () => false);

test('es gibt ueberhaupt ein zurueckgenommenes Regal', () => {
  assert.ok(zurueckgenommen.size > 0, 'sonst prueft dieser Test nichts');
});

test('die Wuehlkiste ist aus der Ziehmenge heraus', () => {
  assert.ok(ziehbar.length < katalog.sender.length);
  assert.ok(ziehbar.every(s => !zurueckgenommen.has(s.regal)));
  // Und nur sie: was nicht zurueckgenommen ist, bleibt drin.
  const erwartet = katalog.sender.filter(s => !zurueckgenommen.has(s.regal)).length;
  assert.equal(ziehbar.length, erwartet);
});

test('wackelige Sender bleiben ebenfalls draussen', () => {
  const erster = katalog.sender[0];
  const ohne = ziehbareSender.call(nachgebautesThis(), (id) => id === erster.id);
  assert.ok(!ohne.some(s => s.id === erster.id), `${erster.name} wurde trotzdem gezogen`);
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

// Der Sender der Woche zieht aus dem Katalog ohne Wuehlkiste, nicht aus der
// Ziehmenge: Die haengt an den oertlichen Fehlerzaehlern, und dann waere er
// nicht fuer alle Besucher derselbe.
const wochenmenge = katalogOhneWuehlkiste.call(nachgebautesThis());

test('der Sender der Woche kommt ein Jahr lang nie aus der Wuehlkiste', () => {
  for (let w = 0; w < 60; w++) {
    const d = new Date(Date.UTC(2026, 0, 5 + w * 7));
    const tipp = tippDerWoche(wochenmenge, d);
    assert.ok(!zurueckgenommen.has(tipp.sender.regal));
  }
});

test('der Sender der Woche kennt keine oertlichen Fehlerzaehler', () => {
  // Auf einem Geraet, auf dem jeder Sender als wackelig gilt, ist die
  // Ziehmenge leer — der Sender der Woche bleibt trotzdem derselbe.
  const allesWackelig = ziehbareSender.call(nachgebautesThis(), () => true);
  assert.equal(allesWackelig.length, 0);
  const erwartet = katalog.sender.filter(s => !zurueckgenommen.has(s.regal));
  assert.deepEqual(wochenmenge.map(s => s.id), erwartet.map(s => s.id));
  assert.doesNotMatch(rumpfKatalog[1], /istWackelig/,
    'die Wochenmenge darf nicht an den Fehlerzaehlern haengen');
  for (let w = 0; w < 60; w++) {
    const d = new Date(Date.UTC(2026, 0, 5 + w * 7));
    assert.equal(tippDerWoche(wochenmenge, d).sender.id, tippDerWoche(erwartet, d).sender.id);
  }
});

test('der Programmcode filtert wirklich nach dem Merkmal', async () => {
  const app = await readFile(new URL('../../assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /r\.zurueckgenommen/, 'die Ziehmenge muss das Merkmal auswerten');
  assert.match(app, /tippDerWoche\(this\._katalogOhneWuehlkiste\(\)\)/,
    'die Wochenempfehlung zieht aus dem Katalog ohne Wuehlkiste — nicht aus der geraetabhaengigen Ziehmenge');
});
