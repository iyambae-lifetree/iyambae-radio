import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { saeubere } from '../../assets/lib/titel.mjs';

const quelle = await readFile(new URL('../../assets/lib/titel.mjs', import.meta.url), 'utf8');
const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/*
 DER FEHLER, GEGEN DEN ES DIESE DATEI GIBT.

 Am 03.09.2026 im Browser gefunden, nicht durch eine Pruefung: Beim
 Abspielen jedes Senders flog

     ReferenceError: sauber is not defined

 Die Funktion heisst `saeubere`; an drei Stellen stand `sauber`. Eine
 Umbenennung, die drei Aufrufe vergessen hatte. Folge: `beobachteTitel`
 brach bei JEDEM Start sofort ab, und der laufende Titel erschien nie —
 fuer keinen einzigen Sender, wochenlang, live.

 Aufgefallen ist es erst, als jemand die Seite benutzen wollte statt sie
 zu bauen. Kein Test hat titel.mjs je angefasst.
*/
test('es gibt keinen Aufruf von sauber() mehr — die Funktion heisst saeubere', () => {
  assert.doesNotMatch(ohneKommentare, /\bsauber\s*\(/,
    'sauber() ist nirgends definiert; jeder Aufruf wirft beim Abspielen');
});

test('jeder Bezeichner, der hier als Funktion gerufen wird, existiert auch', () => {
  /*
   Die allgemeine Fassung desselben Schutzes. Sie sammelt die Namen, die im
   Modul erklaert oder eingefuehrt werden, und haelt jeden Aufruf dagegen.
   Sie kann nicht alles sehen — Methoden an Objekten etwa nicht —, aber
   genau die Klasse Fehler, die hier passiert ist.
  */
  const namen = (s) => [...s.matchAll(/[A-Za-z_$][\w$]*/g)].map(m => m[0]);
  const erklaert = new Set([
    // Erklaerungen: function f, const f, let f, var f, class F
    ...[...ohneKommentare.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]),
    // Eingefuehrtes aus anderen Modulen, auch mit `as`
    ...[...ohneKommentare.matchAll(/import\s*\{([^}]+)\}/g)]
        .flatMap(m => namen(m[1].replace(/[\w$]+\s+as\s+/g, ''))),
    // Parameterlisten von function-Erklaerungen
    ...[...ohneKommentare.matchAll(/function[\w$\s]*\(([^)]*)\)/g)].flatMap(m => namen(m[1])),
    // Parameter von Pfeilfunktionen, mit und ohne Klammern
    ...[...ohneKommentare.matchAll(/\(([^()]*)\)\s*=>/g)].flatMap(m => namen(m[1])),
    ...[...ohneKommentare.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)].map(m => m[1]),
    // Zerlegungen: const { a, b } = …, const [a, b] of …
    ...[...ohneKommentare.matchAll(/(?:const|let|var)\s*[\[{]([^\]}]*)[\]}]/g)].flatMap(m => namen(m[1])),
  ]);
  const eingebaut = new Set([
    'if','for','while','switch','catch','return','typeof','fetch','Number','String','Boolean',
    'Array','Object','JSON','Math','Date','Promise','Set','Map','RegExp','Error','parseInt',
    'parseFloat','isNaN','setTimeout','clearTimeout','setInterval','clearInterval','encodeURIComponent',
    'decodeURIComponent','AbortController','URL','URLSearchParams','structuredClone','queueMicrotask',
    'function','await','new','else','do','of','in','async','yield','delete','void','throw',
  ]);
  const gerufen = [...ohneKommentare.matchAll(/(?<![.\w$])([a-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
  const fehlend = [...new Set(gerufen)].filter(n => !erklaert.has(n) && !eingebaut.has(n));
  assert.deepEqual(fehlend, [], 'gerufen, aber nirgends erklaert');
});

test('saeubere gibt null zurueck, wo kein Titel steht', () => {
  assert.equal(saeubere(null, 'ByteFM'), null);
  assert.equal(saeubere(undefined, 'ByteFM'), null);
  assert.equal(saeubere('', 'ByteFM'), null);
  assert.equal(saeubere('ab', 'ByteFM'), null, 'zu kurz');
});

test('saeubere wirft Systemzeilen mit zwei Sternchen weg', () => {
  assert.equal(saeubere('**Repeats (Master List)', 'ByteFM'), null);
});

test('saeubere nimmt den Sendernamen heraus', () => {
  const t = saeubere('ByteFM - Nina Simone – Feeling Good', 'ByteFM');
  assert.ok(t && !t.includes('ByteFM'), 'der Sendername gehoert nicht in den Titel');
  assert.match(t, /Nina Simone/);
});

test('saeubere entfernt einen fuehrenden Strich aus leerem Kuenstlerfeld', () => {
  const t = saeubere('- Lil Uzi Vert', 'Irgendein Sender');
  assert.equal(t, 'Lil Uzi Vert');
});
