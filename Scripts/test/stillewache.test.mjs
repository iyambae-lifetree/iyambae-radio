import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/*
 Die Stillewache stuft einen Sender auf „ohne Zugriff" herab, wenn der
 Analysator zwei Sekunden lang exakt null zeigt. Stumm oder auf null
 gedreht zeigt er das auch — bis 01.10.2026 wurde dann jeder herabgestuft,
 der gleich nach dem Start M drueckte, fuer die ganze Sitzung.

 Wie in zufall.test.mjs: Der Rumpf kommt aus app.js, mit nachgebautem
 `this` und einem Zeitgeber, der sofort feuert.
*/
const app = await readFile(new URL('../../assets/app.js', import.meta.url), 'utf8');
const treffer = /_wacheUeberStille\(\)\s*\{([\s\S]*?)\n  \}/.exec(app);
assert.ok(treffer, '_wacheUeberStille() nicht in app.js gefunden');

function lauf({ stumm = false, muted = false, volume = 0.7, pegel = 0 }) {
  const sender = { id: 'probe', cors: true };
  let runden = 0;
  const motor = {
    aktuellerSender: sender,
    laeuft: true,
    analyseEcht: true,
    istStumm: stumm,
    _analyse: {
      frequencyBinCount: 8,
      getByteFrequencyData: (d) => d.fill(pegel),
    },
    _rufe() {},
    spiele() {},
  };
  motor.audioAnalyse = motor.audio = { currentTime: 0, muted, volume };
  motor._wacheUeberStille = function () {
    // Hoechstens zwei Runden: Die zweite zeigt, ob gewartet statt geurteilt wird.
    if (++runden > 2) return;
    const zeitgeber = (fn) => { motor.audio.currentTime += 2; fn(); };
    return new Function('setTimeout', 'clearTimeout', treffer[1]).call(this, zeitgeber, () => {});
  };
  motor._wacheUeberStille();
  return { cors: sender.cors, runden };
}

test('echte Stille bei hoerbarem Ton stuft herab', () => {
  assert.equal(lauf({}).cors, false);
});

test('es kommt Ton — alles bleibt, wie es ist', () => {
  assert.equal(lauf({ pegel: 40 }).cors, true);
});

test('stummgeschaltet wird gewartet, nicht herabgestuft', () => {
  const r = lauf({ stumm: true });
  assert.equal(r.cors, true);
  assert.ok(r.runden > 1, 'die Wache muss sich neu stellen');
});

test('Lautstaerke null und muted ebenso', () => {
  assert.equal(lauf({ volume: 0 }).cors, true);
  assert.equal(lauf({ muted: true }).cors, true);
});
