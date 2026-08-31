/*
 Prueft die Stimmungsmessung an Material, dessen Stimmung bekannt ist.

 Die Wahrheit wird hier selbst erzeugt: reine Toene auf bekannten
 Kammertoenen, und echte Musik, die mit ffmpeg absichtlich verstimmt wurde.
 Nur so ist der Fehler ueberhaupt eine Zahl und nicht ein Eindruck.

 Aufruf:  node Scripts/pruefe-stimmung.mjs
 Braucht: ffmpeg im Pfad.
*/
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { messeStimmung } from '../apps/assets/lib/stimmung.mjs';

const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'stimmung-'));
const MUSIK = new URL('../apps/assets/klang/nocturne.mp3', import.meta.url).pathname;
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', ...a]);
const lies = (p) => { const b = fs.readFileSync(p); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };

let fehler = 0;
const pruefe = (name, bedingung, sagt) => {
  console.log(`  ${bedingung ? '✔' : '✘'} ${name}${sagt ? ' — ' + sagt : ''}`);
  if (!bedingung) fehler++;
};

console.log('== Reine Toene ==');
for (const hz of [432, 435, 440, 442, 443, 445]) {
  const p = path.join(ORDNER, `s${hz}.raw`);
  ff('-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=20:sample_rate=44100`, '-f', 'f32le', p, '-y');
  const r = messeStimmung(lies(p), 44100);
  const ab = Math.abs(1200 * Math.log2(r.a4 / hz));
  pruefe(`${hz} Hz`, r.genug && ab < 2 && r.sicherheit > 0.8,
         `gemessen ${r.a4.toFixed(2)} Hz, ${ab.toFixed(2)} ct daneben, Sicherheit ${(r.sicherheit * 100).toFixed(0)} %`);
}

console.log('== Echte Musik, absichtlich verstimmt ==');
// Erst den Ausgangspunkt messen, dann von dort aus verschieben.
const roh = path.join(ORDNER, 'roh.raw');
ff('-i', MUSIK, '-ac', '1', '-f', 'f32le', roh, '-y');
const ausgang = messeStimmung(lies(roh), 44100);
pruefe('Ausgangsaufnahme traegt ueberhaupt eine Stimmung',
       ausgang.genug && ausgang.sicherheit > 0.7,
       `${ausgang.a4.toFixed(2)} Hz, Sicherheit ${(ausgang.sicherheit * 100).toFixed(0)} %`);

for (const ziel of [432, 435, 443, 445]) {
  const p = path.join(ORDNER, `m${ziel}.raw`);
  ff('-i', MUSIK, '-ac', '1', '-af',
     `asetrate=44100*${ziel}/${ausgang.a4},aresample=44100,atempo=${ausgang.a4}/${ziel}`,
     '-f', 'f32le', p, '-y');
  const r = messeStimmung(lies(p), 44100);
  const ab = Math.abs(1200 * Math.log2(r.a4 / ziel));
  pruefe(`auf ${ziel} gebracht`, r.genug && ab < 3 && r.naechster.kurz === String(ziel),
         `gemessen ${r.a4.toFixed(2)} Hz, ${ab.toFixed(2)} ct daneben`);
}

console.log('== Material ohne Stimmung ==');
const rausch = path.join(ORDNER, 'rausch.raw');
ff('-f', 'lavfi', '-i', 'anoisesrc=d=20:c=pink:r=44100', '-f', 'f32le', rausch, '-y');
const rr = messeStimmung(lies(rausch), 44100);
pruefe('rosa Rauschen faellt durch', rr.sicherheit < 0.35,
       `Sicherheit ${(rr.sicherheit * 100).toFixed(0)} % — unter der Schwelle 35 %`);

const still = path.join(ORDNER, 'still.raw');
ff('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=20', '-f', 'f32le', still, '-y');
const sr = messeStimmung(lies(still), 44100);
pruefe('Stille liefert gar kein Ergebnis', !sr.genug, `Grund: ${sr.grund}`);

fs.rmSync(ORDNER, { recursive: true, force: true });
console.log(fehler ? `\n  ${fehler} Pruefung(en) fehlgeschlagen` : '\n  Alle Pruefungen bestanden');
process.exit(fehler ? 1 : 0);
