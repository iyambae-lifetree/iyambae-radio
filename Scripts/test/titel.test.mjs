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

/*
 Die zwei Proben zu `beobachteTitel`, gefunden am 04.09.2026 an ByteFM.

 Sie brauchen kein echtes Netz: `fetch` wird ersetzt, die Uhr auch. Was
 geprueft wird, ist keine Formulierung, sondern Verhalten — deshalb laufen
 sie ueber die echte Funktion und nicht ueber den Quelltext.
*/

async function laufenLassen({ brettAntwortet, brettHatTitelAb = 99, runden = 8,
                              fremdSagtWas = () => null, uhr = false, dokument = null }) {
  const echteFetch = globalThis.fetch;
  const echtesSetInterval = globalThis.setInterval;
  const echtesClearInterval = globalThis.clearInterval;
  const echtesJetzt = Date.now;
  const hatteDokument = 'document' in globalThis;
  const echtesDokument = globalThis.document;
  // `uhr`: Jeder Takt rueckt die Uhr um 20 s vor, wie im Browser.
  let jetzt = 1_800_000_000_000;
  if (uhr) Date.now = () => jetzt;
  if (dokument) globalThis.document = dokument;

  let zug = 0;
  const anfragen = { brett: 0, fremd: 0 };
  const gemeldet = [];
  let tick = null;

  globalThis.setInterval = (fn) => { tick = fn; return 1; };
  globalThis.clearInterval = () => { tick = null; };
  globalThis.fetch = async (adresse) => {
    const a = String(adresse);
    if (a.includes('/api/titel')) {
      anfragen.brett++;
      if (!brettAntwortet) return { ok: false, status: 503, json: async () => ({}) };
      const kopf = new Headers({ 'content-type': 'application/json' });
      const titel = zug >= brettHatTitelAb ? { pruef: 'Kuenstler - Stueck' } : {};
      return { ok: true, status: 200, headers: kopf, json: async () => ({ titel }) };
    }
    anfragen.fremd++;
    const titel = fremdSagtWas(zug);
    return {
      ok: true, status: 200,
      // hole() sieht erst nach, WAS kommt — ohne diesen Kopf haelt es die
      // Antwort fuer einen Radiostrom und liest sie gar nicht.
      headers: new Headers({ 'content-type': 'application/json' }),
      // Die Form, die vonIcecast liest — nachgesehen in titel.mjs, nicht geraten.
      json: async () => (titel ? { icestats: { source: { title: titel } } } : {}),
      text: async () => '',
    };
  };

  // Frische Ausgabe je Probe: Das Modul haelt den Brettstand 15 s lang
  // fest, und der wirkte sonst aus der vorigen Probe nach.
  const { beobachteTitel, haltAn } =
    await import(`../../assets/lib/titel.mjs?lauf=${Math.random()}`);
  try {
    beobachteTitel(
      { id: 'pruef', name: 'Pruefsender', stream: 'https://pruef.example/live' },
      (x) => gemeldet.push(x)
    );
    // Den ersten Versuch (ohne Takt) erst ausreden lassen.
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    for (zug = 0; zug < runden; zug++) {
      if (!tick) break;
      jetzt += 20_000;
      await tick();
      // Der Zwischenspeicher des Bretts gilt 15 s — hier vorspulen.
      await new Promise((r) => setImmediate(r));
    }
    return { anfragen, gemeldet, laeuftNoch: !!tick, zuege: zug };
  } finally {
    haltAn();
    Date.now = echtesJetzt;
    if (hatteDokument) globalThis.document = echtesDokument;
    else delete globalThis.document;
    globalThis.fetch = echteFetch;
    globalThis.setInterval = echtesSetInterval;
    globalThis.clearInterval = echtesClearInterval;
  }
}

test('das Brett wird weiter gefragt, auch wenn es anfangs nichts hat', async () => {
  /*
   Der Fall von ByteFM: Der Sender steht beim Start nicht auf dem Brett und
   kommt erst nach einer Weile darauf. Vorher gab die Seite nach fuenf
   leeren Durchgaengen auf — und bekam den Titel nie zu sehen.
  */
  const { laeuftNoch } = await laufenLassen({ brettAntwortet: true, brettHatTitelAb: 99, runden: 8 });
  assert.equal(laeuftNoch, true,
    'Solange das Brett antwortet, darf die Abfrage nicht aufhoeren — es fuellt sich erst beim Zuhoeren.');
});

test('ohne Brett wird nach drei leeren Durchgaengen aufgehoert', async () => {
  // Die Ruecksicht auf fremde Server bleibt: Wer nichts hat und kein Brett
  // im Ruecken, wird nicht zwanzigmal je Minute gefragt.
  const { laeuftNoch, zuege } = await laufenLassen({ brettAntwortet: false, runden: 8 });
  assert.equal(laeuftNoch, false, 'Ohne Brett muss die Abfrage aufhoeren.');
  assert.ok(zuege <= 4, `Sie darf nicht erst nach ${zuege} Durchgaengen aufhoeren.`);
});

test('ein Haus, das zwischendurch schweigt, wird nicht dauerhaft aufgegeben', async () => {
  /*
   Der zweite Fehler vom 04.09.2026: `leerFremd` wurde nie auf null
   zurueckgesetzt. Ein Haus, das zwischen zwei Stuecken kurz nichts sagt,
   sammelte die Luecken ueber den ganzen Abend — nach der dritten kam der
   Titel nie wieder, obwohl das Haus laengst wieder sprach.

   Hier wechselt es ab: Zug 0 schweigt, Zug 1 spricht, Zug 2 schweigt …
   Ohne Zuruecksetzen ist nach der dritten Luecke Schluss.
  */
  const { gemeldet } = await laufenLassen({
    brettAntwortet: true,
    runden: 12,
    fremdSagtWas: (zug) => (zug % 2 === 1 ? `Kuenstler - Stueck ${zug}` : null),
  });
  assert.ok(gemeldet.length >= 5,
    `Es haetten sechs Titel kommen muessen, gekommen sind ${gemeldet.length}: ${JSON.stringify(gemeldet)}`);
});

// ── Sparsam fragen (432hz-radio#59) ──────────────────────────────────

test('das Brett wird hoechstens einmal je Minute gefragt, nicht bei jedem Takt', async () => {
  /*
   Jeder Abruf ist eine Anfrage je Zuhoerer an iyambae.fm — sie haelt den
   Container wach und stand im Zugriffsprotokoll. Bis 06.11.2026 ging bei
   jedem 20-s-Takt eine hinaus.

   Start bei 0 s, dann neun Takte bis 180 s: gefragt bei 0, 60, 120, 180.
  */
  const { anfragen, zuege } = await laufenLassen({ brettAntwortet: true, runden: 9, uhr: true });
  assert.equal(zuege, 9);
  assert.equal(anfragen.brett, 4, `Brett ${anfragen.brett}-mal gefragt, erwartet 4`);
  // Die fremden Haeuser bleiben beim 20-s-Takt; sie schweigen hier und
  // werden nach drei leeren Durchgaengen in Ruhe gelassen — wie bisher.
  assert.ok(anfragen.fremd > 0);
});

test('auch ein schlafender Dienst wird nicht bei jedem Takt geweckt', async () => {
  // Vorher wurde nur ein GELUNGENER Stand wiederverwendet: Bei 503 fragte
  // jeder Takt neu und weckte den Container alle 20 s.
  const { anfragen } = await laufenLassen({ brettAntwortet: false, runden: 2, uhr: true });
  assert.equal(anfragen.brett, 1, `Brett ${anfragen.brett}-mal gefragt, erwartet 1`);
});

test('ein verborgener Tab fragt nichts', async () => {
  let lauscher = null;
  const dokument = {
    visibilityState: 'hidden',
    addEventListener: (art, fn) => { if (art === 'visibilitychange') lauscher = fn; },
  };
  const { anfragen, laeuftNoch } =
    await laufenLassen({ brettAntwortet: true, runden: 6, uhr: true, dokument });
  assert.equal(anfragen.brett + anfragen.fremd, 0,
    `Verborgen gefragt: ${JSON.stringify(anfragen)}`);
  // Ein ausgelassener Takt ist kein Schweigen: Die Abfrage laeuft weiter.
  assert.equal(laeuftNoch, true);
  assert.equal(typeof lauscher, 'function', 'kein Lauscher auf visibilitychange');
});

test('der Lauscher fragt beim Sichtbarwerden sofort nach', async () => {
  let lauscher = null;
  const dokument = {
    visibilityState: 'hidden',
    addEventListener: (art, fn) => { if (art === 'visibilitychange') lauscher = fn; },
  };
  const echteFetch = globalThis.fetch;
  const hatteDokument = 'document' in globalThis;
  globalThis.document = dokument;
  let gefragt = 0;
  globalThis.fetch = async () => { gefragt++; return { ok: false, status: 503, json: async () => ({}) }; };
  const { beobachteTitel, haltAn } =
    await import(`../../assets/lib/titel.mjs?lauf=${Math.random()}`);
  try {
    beobachteTitel({ id: 'pruef', name: 'Pruefsender', stream: 'https://pruef.example/live' }, () => {});
    await new Promise((r) => setImmediate(r));
    assert.equal(gefragt, 0, 'verborgen darf nichts hinausgehen');
    dokument.visibilityState = 'visible';
    lauscher();
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    assert.ok(gefragt > 0, 'beim Sichtbarwerden wurde nicht gefragt');
  } finally {
    haltAn();
    globalThis.fetch = echteFetch;
    if (!hatteDokument) delete globalThis.document;
  }
});
