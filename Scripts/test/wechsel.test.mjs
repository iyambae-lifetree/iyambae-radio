import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Der Fehler, den der erste Tester gemeldet hat: Nach einem Wechsel von
// einem Sender MIT CORS-Freigabe zu einem OHNE blieb es still. Ursache war
// ein einziges Audioelement, das dauerhaft im Web-Audio-Graphen hing —
// und ein Element im Graphen gibt bei einer Quelle ohne Freigabe Stille aus.
//
// Diese Tests halten die Bauweise fest, die das verhindert. Sie prüfen den
// Quelltext, weil die Web-Audio-Schnittstelle in Node nicht existiert.

const quelle = await readFile(new URL('../../assets/app.js', import.meta.url), 'utf8');

test('es gibt zwei getrennte Abspielelemente', () => {
  assert.match(quelle, /this\.audioDirekt\s*=\s*new Audio\(\)/);
  assert.match(quelle, /this\.audioAnalyse\s*=\s*new Audio\(\)/);
});

test('nur das Analyse-Element haengt im Audiographen', () => {
  assert.match(quelle, /createMediaElementSource\(this\.audioAnalyse\)/,
    'der Graph darf ausschliesslich um audioAnalyse gebaut werden');
  assert.doesNotMatch(quelle, /createMediaElementSource\(this\.audio\)/,
    'niemals das gerade aktive Element in den Graphen haengen — daran ist es gescheitert');
  assert.doesNotMatch(quelle, /createMediaElementSource\(this\.audioDirekt\)/,
    'das direkte Element muss ausserhalb des Graphen bleiben');
});

test('die Elementwahl haengt an der CORS-Freigabe des Senders', () => {
  assert.match(quelle, /sender\.cors \? this\.audioAnalyse : this\.audioDirekt/);
});

test('beim Wechsel wird das vorherige Element freigegeben', () => {
  // Sonst puffert der alte Sender im Hintergrund weiter oder es laufen zwei.
  assert.match(quelle, /if \(this\.audio !== zielElement\)[\s\S]{0,220}removeAttribute\('src'\)/);
});

test('crossOrigin wird fest am Analyse-Element gesetzt, nicht hin und her', () => {
  assert.match(quelle, /this\.audioAnalyse\.crossOrigin = 'anonymous'/);
  assert.doesNotMatch(quelle, /removeAttribute\('crossorigin'\)/,
    'das Attribut umzuschalten war der untaugliche Versuch, den Fehler zu umgehen');
});

test('Lautstaerke und Stimmung gelten fuer beide Elemente', () => {
  assert.match(quelle, /for \(const el of \[this\.audioDirekt, this\.audioAnalyse\]\)[\s\S]{0,200}playbackRate/);
  assert.match(quelle, /for \(const el of \[this\.audioDirekt, this\.audioAnalyse\]\)[\s\S]{0,200}volume/);
});

test('der Pegel wird nur gelesen, wenn das Analyse-Element auch laeuft', () => {
  assert.match(quelle, /this\.audio === this\.audioAnalyse/);
});
