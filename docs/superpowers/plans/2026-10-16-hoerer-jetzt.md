# „hören gerade“ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live-Hörerzahl („7 hören gerade“, erst ab 3) auf iyambae.fm und in IYAMBAE FM für Google TV, gespeist aus einem kennungslosen Pulsschlag.

**Architecture:** Wer hört, schickt alle 60 s `POST /api/hoeren` ohne Körper. Jedes Dienst-Exemplar zählt je Minute im Speicher und überschreibt — nur bei echten Anfragen, nie per Timer — höchstens alle 30 s seine eine Zeile in der Tabelle `hoerer`. Gelesen wird: eigene Zähler + fremde Zeilen, Mittel der zwei letzten vollständigen Minuten, unter 3 → `null`.

**Tech Stack:** Node 22 (`node:test`, `node:http`, kein Framework), Azure Table Storage über `dienst/src/speicher.mjs`, Vanilla-JS-ES-Module, nginx, Bicep; Kotlin/Compose/Media3/OkHttp für den Fernseher.

**Spec:** `docs/superpowers/specs/2026-10-16-hoerer-jetzt-design.md`

## Global Constraints

- Schwelle: Zahl nur bei **≥ 3**, sonst `null` — entschieden **im Dienst**.
- Pulsschlag: **kein Körper, keine Kennung, kein Cookie, kein Zufallswert, kein Sender**; `credentials: 'omit'`.
- **Kein Timer im Dienst** (Regel 3 in `dienst/src/server.mjs`). Schreiben nur im Zuge einer Anfrage.
- **Kein Protokoll** des Pulses: weder `protokolliere` im Dienst noch nginx-`access_log`.
- Drossel: `POST` netz 10/60 s + global 6000/60 s; `GET` netz 10/60 s.
- Keine Herkunftsprüfung für `POST /api/hoeren` (Fernseher sendet keinen `Origin`).
- Widerspruch „nicht mitzählen“ (`messungLaeuft()` aus `assets/lib/messung.mjs`) stoppt den Puls; Lesen per `GET` bleibt.
- Speicherdauer: Zähler ≤ 3 Minuten; Zeilen beendeter Exemplare nach 10 Minuten gelöscht.
- Sprachen: de, en, es, fr, it, ja, ar — Text mit `{n}`, eine Pluralform genügt.
- Deutsche Benennung im Code, wie im Bestand. Kommentare erklären das Warum.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Dateien

| Datei | Aufgabe |
|---|---|
| `dienst/src/hoerer.mjs` (neu) | Zählen, Schreiben, Lesen, Schwelle |
| `dienst/src/speicher.mjs` | Konstante `TABELLE_HOERER` |
| `dienst/src/server.mjs` | zwei Wege, Ausnahme von Herkunft/Körper, Verdrahtung in `starte` |
| `dienst/test/hoerer.test.mjs` (neu) | Einheit + HTTP |
| `dienst/test/hilfe.mjs` | Option `hoerer` |
| `infra/main.bicep` | Tabelle `hoerer` |
| `deploy/nginx.conf` | `location = /api/hoeren` ohne `access_log` |
| `assets/lib/hoerer.mjs` (neu) | Puls/Abfrage im Browser, Anzeige |
| `Scripts/test/hoerer.test.mjs` (neu) | Browsermodul mit Attrappen |
| `assets/app.js`, `index.html`, `assets/styles.css` | Verdrahtung, Element, Stil |
| `assets/lang/*.json` (7) | `hoerer.jetzt` |
| `sw.js`, `Scripts/zwischenspeicher-stand.json` | neue Datei in `SHELL_FILES`, Fassung hoch |
| `docs/recht/datenschutz.md`, `docs/recht/verarbeitungsverzeichnis.md` | neues Versprechen, V12 |
| `assets/lib/messung.mjs`, `infra/dashboard.bicep` | Kopfkommentare berichtigen |
| `MyRetuner/fm-tv/...` | Task 6, eigener Zweig im Repo `apps` |

---

### Task 1: Zählwerk `dienst/src/hoerer.mjs`

**Files:**
- Create: `dienst/src/hoerer.mjs`
- Modify: `dienst/src/speicher.mjs` (nach `TABELLE_STIMMUNG`, Zeile ~70)
- Test: `dienst/test/hoerer.test.mjs`

**Interfaces:**
- Produces: `erzeugeHoerer({ speicher, exemplar?, uhr? }) → { puls(): Promise<number|null>, zahl(): Promise<number|null> }`, `SCHWELLE = 3`, `TABELLE_HOERER = 'hoerer'` (aus `speicher.mjs`).

- [ ] **Step 1: Konstante anlegen** — in `dienst/src/speicher.mjs` hinter `export const TABELLE_STIMMUNG = 'stimmung';`:

```js
/*
  Die sechste — die Live-Hoererzahl (docs/superpowers/specs/
  2026-10-16-hoerer-jetzt-design.md). Eine Zeile je Dienst-Exemplar, die
  laufend ueberschrieben wird. Keine Zeile haengt an einem Menschen; es gibt
  hier nichts, das man mit einer anderen Tabelle verbinden koennte.
*/
export const TABELLE_HOERER = 'hoerer';
```

- [ ] **Step 2: Failing tests schreiben** — `dienst/test/hoerer.test.mjs`:

```js
/*
  Die Live-Hoererzahl. Erst das Zaehlwerk mit gestellter Uhr, dann die Wege
  ueber echtes HTTP — dort sitzen Herkunft, Drossel und Protokoll.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeHoerer, SCHWELLE } from '../src/hoerer.mjs';
import { TABELLE_HOERER, speicherImArbeitsspeicher } from '../src/speicher.mjs';

const MINUTE = 60_000;

function uhrBei(ms) {
    const u = { jetzt: ms };
    return { u, uhr: () => u.jetzt };
}

/** n Pulse in der Minute, in der die Uhr gerade steht. */
async function pulse(hoerer, n) {
    for (let i = 0; i < n; i++) await hoerer.puls();
}

test('Schwelle ist 3', () => {
    assert.equal(SCHWELLE, 3);
});

test('zwei Hoerer ergeben null, drei ergeben 3', async () => {
    for (const [n, erwartet] of [[2, null], [3, 3]]) {
        const { u, uhr } = uhrBei(100 * MINUTE);
        const h = erzeugeHoerer({ speicher: speicherImArbeitsspeicher(), exemplar: 'a', uhr });
        // Minute 100 und 101: je n Pulse. Gelesen wird in Minute 102.
        await pulse(h, n); u.jetzt += MINUTE;
        await pulse(h, n); u.jetzt += MINUTE;
        assert.equal(await h.zahl(), erwartet, `${n} Hoerer`);
    }
});

test('die laufende Minute zaehlt nicht mit, nur m-1 und m-2', async () => {
    const { u, uhr } = uhrBei(10 * MINUTE);
    const h = erzeugeHoerer({ speicher: speicherImArbeitsspeicher(), exemplar: 'a', uhr });
    await pulse(h, 5);
    assert.equal(await h.zahl(), null, 'Minute 10 ist noch nicht vollstaendig');
    u.jetzt += MINUTE;
    // m-1 = 5, m-2 = 0 → (5+0)/2 = 2,5 → 3 (gerundet)
    assert.equal(await h.zahl(), 3);
});

test('Mittel ueber m-1 und m-2 glaettet einen verrutschten Puls', async () => {
    const { u, uhr } = uhrBei(10 * MINUTE);
    const h = erzeugeHoerer({ speicher: speicherImArbeitsspeicher(), exemplar: 'a', uhr });
    await pulse(h, 4); u.jetzt += MINUTE;   // m10: 4
    await pulse(h, 6); u.jetzt += MINUTE;   // m11: 6 (einer kam doppelt)
    assert.equal(await h.zahl(), 5);
});

test('zwei Exemplare werden ueber die Tabelle summiert', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { u, uhr } = uhrBei(50 * MINUTE);
    const a = erzeugeHoerer({ speicher, exemplar: 'a', uhr });
    const b = erzeugeHoerer({ speicher, exemplar: 'b', uhr });

    await pulse(a, 2); await pulse(b, 2); u.jetzt += MINUTE;
    await pulse(a, 2); await pulse(b, 2);
    // b hat zuletzt in Minute 51 geschrieben; danach 31 s weiter, damit sein
    // naechster Puls die Zeile erneut schreibt.
    u.jetzt += 31_000; await b.puls();
    u.jetzt += MINUTE - 31_000;
    // Minute 52: a liest eigene 2+2 und b's Zeile (2 in m50, 3 in m51).
    assert.equal(await a.zahl(), Math.round((2 + 2 + 2 + 3) / 2));
});

test('geschrieben wird hoechstens alle 30 s, und nur bei einer Anfrage', async () => {
    const speicher = speicherImArbeitsspeicher();
    let schreibvorgaenge = 0;
    const setze = speicher.setze.bind(speicher);
    speicher.setze = async (...a) => { schreibvorgaenge++; return setze(...a); };

    const { u, uhr } = uhrBei(0);
    const h = erzeugeHoerer({ speicher, exemplar: 'a', uhr });
    await pulse(h, 10);
    assert.equal(schreibvorgaenge, 1);
    u.jetzt += 29_000; await h.puls();
    assert.equal(schreibvorgaenge, 1);
    u.jetzt += 2_000; await h.puls();
    assert.equal(schreibvorgaenge, 2);
});

test('die Zeile traegt nur minute und zaehler', async () => {
    const speicher = speicherImArbeitsspeicher();
    const h = erzeugeHoerer({ speicher, exemplar: 'a', uhr: () => 7 * MINUTE });
    await h.puls();
    const zeile = await speicher.hole(TABELLE_HOERER, 'jetzt', 'a');
    const felder = Object.keys(zeile).filter((k) => !['partitionKey', 'rowKey', 'etag', 'timestamp'].includes(k)).sort();
    assert.deepEqual(felder, ['minute', 'zaehler']);
    assert.deepEqual(JSON.parse(zeile.zaehler), { 7: 1 });
});

test('Zeilen beendeter Exemplare zaehlen nicht und werden nach 10 min geloescht', async () => {
    const speicher = speicherImArbeitsspeicher();
    const alt = erzeugeHoerer({ speicher, exemplar: 'alt', uhr: () => 0 });
    await pulse(alt, 9);

    const h = erzeugeHoerer({ speicher, exemplar: 'neu', uhr: () => 11 * MINUTE });
    assert.equal(await h.zahl(), null);
    await assert.rejects(speicher.hole(TABELLE_HOERER, 'jetzt', 'alt'));
});

test('Tabelle gestoert: null, keine erfundene Zahl', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { u, uhr } = uhrBei(0);
    const h = erzeugeHoerer({ speicher, exemplar: 'a', uhr });
    await pulse(h, 9); u.jetzt += MINUTE;
    speicher.stoere(new Error('aus'));
    assert.equal(await h.puls(), null);
});

test('Lesen wird 5 s lang wiederverwendet', async () => {
    const speicher = speicherImArbeitsspeicher();
    let gelesen = 0;
    const liste = speicher.liste.bind(speicher);
    speicher.liste = (...a) => { gelesen++; return liste(...a); };
    const { u, uhr } = uhrBei(0);
    const h = erzeugeHoerer({ speicher, exemplar: 'a', uhr });
    await h.zahl(); await h.zahl();
    assert.equal(gelesen, 1);
    u.jetzt += 5_001; await h.zahl();
    assert.equal(gelesen, 2);
});
```

- [ ] **Step 3: Test laufen lassen** — `cd dienst && node --test test/hoerer.test.mjs` → FAIL, `Cannot find module '../src/hoerer.mjs'`.

- [ ] **Step 4: Implementierung** — `dienst/src/hoerer.mjs`:

```js
/*
  Die Live-Hoererzahl — „7 hoeren gerade“.

  Spec: docs/superpowers/specs/2026-10-16-hoerer-jetzt-design.md

  ── WAS HEREINKOMMT ─────────────────────────────────────────────────

  Nichts ausser der Tatsache, DASS ein Puls kam. Kein Koerper, keine
  Kennung, kein Sender. Wer hoert, meldet sich einmal pro Minute; die Zahl
  der Meldungen einer Minute IST die Zahl der Hoerer.

  ── WARUM EINE TABELLE UND NICHT NUR DER SPEICHER ────────────────────

  Es laufen bis zu drei Exemplare (hoechstExemplare in infra/main.bicep).
  Jedes saehe nur seinen Teil. Deshalb ueberschreibt jedes Exemplar SEINE
  EINE Zeile, und gelesen wird die Summe. Es entsteht kein Verlauf: Eine
  Zeile haelt hoechstens drei Minuten.

  ── WARUM KEIN TIMER ────────────────────────────────────────────────

  Regel 3 in server.mjs. Ein Timer haelt den Container wach und reisst die
  Leerlaufabrechnung. Geschrieben wird deshalb nur im Zuge einer Anfrage —
  und wenn niemand fragt, gibt es auch nichts zu zaehlen.

  ── WARUM DIE SCHWELLE HIER STEHT UND NICHT IM BROWSER ───────────────

  Eine 1 verraet einen einzelnen Menschen. Stuende die Schwelle nur in der
  Anzeige, lieferte die Antwort die 1 trotzdem aus.
*/

import { randomUUID } from 'node:crypto';
import { SpeicherFehler, TABELLE_HOERER } from './speicher.mjs';

export const SCHWELLE = 3;

const MINUTE = 60_000;
const SCHREIB_ABSTAND_MS = 30_000;
const LESE_FRISCHE_MS = 5_000;
const VERALTET_MINUTEN = 10;
const PK = 'jetzt';

export function erzeugeHoerer({
    speicher,
    // Der Zufall entsteht hier, auf dem Server — nie beim Hoerer.
    exemplar = process.env.CONTAINER_APP_REPLICA_NAME || randomUUID(),
    uhr = Date.now,
} = {}) {
    const zaehler = new Map();          // Minute → Anzahl, nur die letzten drei
    let zuletztGeschrieben = -Infinity;
    let gelesen = null;                 // { zeit, wert }

    const minuteVon = (t) => Math.floor(t / MINUTE);

    function beschneide(m) {
        for (const k of zaehler.keys()) if (k < m - 2) zaehler.delete(k);
    }

    async function schreibeWennFaellig() {
        const nun = uhr();
        if (nun - zuletztGeschrieben < SCHREIB_ABSTAND_MS) return;
        zuletztGeschrieben = nun;
        const m = minuteVon(nun);
        beschneide(m);
        try {
            await speicher.setze(TABELLE_HOERER, {
                partitionKey: PK,
                rowKey: exemplar,
                minute: m,
                zaehler: JSON.stringify(Object.fromEntries(zaehler)),
            });
        } catch (fehler) {
            // Die Zahl ist Beiwerk. Faellt die Tabelle aus, zaehlt der
            // Speicher weiter, und der naechste faellige Puls versucht es neu.
            if (!(fehler instanceof SpeicherFehler)) throw fehler;
        }
    }

    async function zahl() {
        const nun = uhr();
        if (gelesen && nun - gelesen.zeit < LESE_FRISCHE_MS) return gelesen.wert;

        const m = minuteVon(nun);
        let vorige = zaehler.get(m - 1) ?? 0;
        let vorvorige = zaehler.get(m - 2) ?? 0;
        let wert;
        try {
            for await (const zeile of speicher.liste(TABELLE_HOERER, PK)) {
                if (zeile.rowKey === exemplar) continue;   // die eigenen sind frischer im Speicher
                if (Number(zeile.minute) < m - VERALTET_MINUTEN) {
                    speicher.loesche(TABELLE_HOERER, PK, zeile.rowKey).catch(() => {});
                    continue;
                }
                let z;
                try { z = JSON.parse(zeile.zaehler); } catch { continue; }
                vorige += Number(z[m - 1]) || 0;
                vorvorige += Number(z[m - 2]) || 0;
            }
            const n = Math.round((vorige + vorvorige) / 2);
            wert = n >= SCHWELLE ? n : null;
        } catch (fehler) {
            if (!(fehler instanceof SpeicherFehler)) throw fehler;
            // Niemals eine erfundene Zahl.
            wert = null;
        }
        gelesen = { zeit: nun, wert };
        return wert;
    }

    async function puls() {
        const m = minuteVon(uhr());
        zaehler.set(m, (zaehler.get(m) ?? 0) + 1);
        beschneide(m);
        await schreibeWennFaellig();
        return zahl();
    }

    return { puls, zahl };
}
```

- [ ] **Step 5: Test grün** — `cd dienst && node --test test/hoerer.test.mjs` → alle PASS. Wenn „zwei Exemplare“ wegen der Zählung in b's Zeile abweicht: Erwartung aus den tatsächlich geschriebenen Zählern nachrechnen, nicht die Implementierung verbiegen. b schreibt in m50 (Zeile `{50:1}`), in m51+31 s (`{50:2,51:3}`); a liest in m52: eigene m51=2, m50=2, b m51=3, m50=2 → (2+3 + 2+2)/2 = 4,5 → 5.
- [ ] **Step 6: Ganze Suite** — `cd dienst && npm test` → nichts rot.
- [ ] **Step 7: Commit**

```bash
git add dienst/src/hoerer.mjs dienst/src/speicher.mjs dienst/test/hoerer.test.mjs
git commit -m "Dienst: Zählwerk für die Live-Hörerzahl (ab 3, ohne Timer)"
```

---

### Task 2: Wege `/api/hoeren`, Tabelle, nginx

**Files:**
- Modify: `dienst/src/server.mjs` (Import; `baueDienst`-Parameter; `wege`; Weiche Zeile ~1373; `starte`)
- Modify: `dienst/test/hilfe.mjs` (Option `hoerer`)
- Modify: `infra/main.bicep` (nach `tabelleStimmung`, Zeile ~583)
- Modify: `deploy/nginx.conf` (vor `location /api/` im iyambae.fm-Serverblock, Zeile ~396)
- Test: `dienst/test/hoerer.test.mjs` (anhängen)

**Interfaces:**
- Consumes: `erzeugeHoerer`, `TABELLE_HOERER`.
- Produces: `POST /api/hoeren` → `200 {"hoeren": n|null}`; `GET /api/hoeren` → dasselbe. `baueDienst({..., hoerer})`, `starteTestdienst({ hoerer: (speicher) => … })`.

- [ ] **Step 1: Testhelfer** — in `dienst/test/hilfe.mjs` Signatur und Aufruf erweitern:

```js
export async function starteTestdienst({ drossel, fremd, zahlen, titel, hoerer } = {}) {
```
und im `baueDienst({...})`-Objekt nach `titel: titel ?? null,`:
```js
        // Eine Fabrik, weil der Speicher erst hier entsteht.
        hoerer: hoerer ? hoerer(speicher) : null,
```

- [ ] **Step 2: Failing HTTP-Tests anhängen** an `dienst/test/hoerer.test.mjs`:

```js
import { erzeugeDrossel } from '../src/server.mjs';
import { starteTestdienst, fangeProtokoll } from './hilfe.mjs';

test('POST ohne Origin wird angenommen, Antwort ist {hoeren}', async () => {
    const d = await starteTestdienst({ hoerer: (speicher) => erzeugeHoerer({ speicher, exemplar: 't' }) });
    try {
        const a = await d.rufe('POST', '/api/hoeren', undefined, { kopf: { Origin: '' } });
        assert.equal(a.status, 200);
        assert.deepEqual(Object.keys(a.daten), ['hoeren']);
        assert.equal(a.daten.hoeren, null);
    } finally { await d.schliesse(); }
});

test('ein mitgeschickter Koerper wird nicht gelesen', async () => {
    const d = await starteTestdienst({ hoerer: (speicher) => erzeugeHoerer({ speicher, exemplar: 't' }) });
    try {
        const a = await d.rufe('POST', '/api/hoeren', { kennung: 'x'.repeat(100) });
        assert.equal(a.status, 200);
        const zeile = await d.speicher.hole(TABELLE_HOERER, 'jetzt', 't');
        assert.ok(!JSON.stringify(zeile).includes('xxxx'));
    } finally { await d.schliesse(); }
});

test('GET liefert die Zahl ohne zu zaehlen', async () => {
    const d = await starteTestdienst({ hoerer: (speicher) => erzeugeHoerer({ speicher, exemplar: 't' }) });
    try {
        const a = await d.rufe('GET', '/api/hoeren');
        assert.equal(a.status, 200);
        assert.equal(a.daten.hoeren, null);
        await assert.rejects(d.speicher.hole(TABELLE_HOERER, 'jetzt', 't'));
    } finally { await d.schliesse(); }
});

test('Drossel: der 11. Puls je Netz in einer Minute bekommt 429', async () => {
    const d = await starteTestdienst({
        drossel: erzeugeDrossel(),
        hoerer: (speicher) => erzeugeHoerer({ speicher, exemplar: 't' }),
    });
    try {
        const kopf = { 'X-Forwarded-For': '203.0.113.7' };
        for (let i = 0; i < 10; i++) {
            assert.equal((await d.rufe('POST', '/api/hoeren', undefined, { kopf })).status, 200);
        }
        assert.equal((await d.rufe('POST', '/api/hoeren', undefined, { kopf })).status, 429);
    } finally { await d.schliesse(); }
});

test('der Puls schreibt keine Protokollzeile', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst({ hoerer: (speicher) => erzeugeHoerer({ speicher, exemplar: 't' }) });
    try {
        await d.rufe('POST', '/api/hoeren');
        await d.rufe('GET', '/api/hoeren');
        assert.equal(p.zeilen.length, 0, JSON.stringify(p.zeilen));
    } finally { await d.schliesse(); p.zurueck(); }
});

test('ohne Einrichtung: 200 mit null, nie ein Fehler', async () => {
    const d = await starteTestdienst();
    try {
        const a = await d.rufe('POST', '/api/hoeren');
        assert.equal(a.status, 200);
        assert.equal(a.daten.hoeren, null);
    } finally { await d.schliesse(); }
});
```

- [ ] **Step 3: Test rot** — `cd dienst && node --test test/hoerer.test.mjs` → die HTTP-Tests FAIL mit 404.

- [ ] **Step 4: Dienst** — in `dienst/src/server.mjs`:

Import nach `import { erzeugeTitel } from './titel.mjs';`:
```js
import { erzeugeHoerer } from './hoerer.mjs';
```

Nach `const SEITE = …` (Zeile ~76):
```js
/*
  Wege, die weder den Ursprung pruefen noch einen Koerper lesen.

  Nur der Puls der Live-Hoererzahl. Die Herkunftspruefung schuetzt Wege, die
  mit einem Plaetzchen etwas im Namen eines Menschen tun; dieser tut nichts
  ausser +1 und kennt kein Plaetzchen. Und die Fernseh-App schickt als
  native App keinen Origin-Kopf. Den Koerper liest niemand, damit gar nicht
  erst etwas hereinkommt, das jemand spaeter „mal eben" auswertet.
*/
const NUR_PULS = new Set(['POST /api/hoeren']);
```

`baueDienst`-Parameter um `hoerer = null,` nach `titel = null,` ergänzen.

In `wege`, vor `'GET /api/leben'`:
```js
        /*
          Die Live-Hoererzahl. Zaehlwerk und Begruendung in hoerer.mjs.

          KEIN protokolliere: Eine Zeile je Puls waere genau der Hoerverlauf,
          den die Datenschutzerklaerung ausschliesst. Aus demselben Grund hat
          deploy/nginx.conf fuer diesen Weg `access_log off`.

          Nicht eingerichtet → 200 mit null statt 424: Die Anzeige verschwindet
          dann einfach, und das ist das richtige Verhalten fuer Beiwerk.
        */
        'POST /api/hoeren': async ({ netz }) => {
            drossle([
                ['netz', 'hoer:' + netz, 10, 60_000],
                ['global', 'hoer:*', 6000, 60_000],
            ]);
            return { status: 200, koerper: { hoeren: hoerer ? await hoerer.puls() : null } };
        },

        'GET /api/hoeren': async ({ netz }) => {
            drossle([['netz', 'hoerg:' + netz, 10, 60_000]]);
            return { status: 200, koerper: { hoeren: hoerer ? await hoerer.zahl() : null } };
        },
```

In der Weiche die zwei Zeilen
```js
            if (anfrage.method !== 'GET') pruefeHerkunft(anfrage);
            const koerper = anfrage.method === 'GET' ? {} : await liesKoerper(anfrage);
```
ersetzen durch
```js
            const nurPuls = NUR_PULS.has(schluessel);
            if (anfrage.method !== 'GET' && !nurPuls) pruefeHerkunft(anfrage);
            const koerper = anfrage.method === 'GET' || nurPuls ? {} : await liesKoerper(anfrage);
```

In `starte`, dort wo `baueDienst({...})` mit `titel` aufgerufen wird, `hoerer: erzeugeHoerer({ speicher }),` ergänzen (Stelle mit `grep -n "baueDienst({" dienst/src/server.mjs` finden).

- [ ] **Step 5: Test grün** — `cd dienst && npm test` → alles PASS. Achtung beim Drosseltest: Die globale Drossel `drossle` protokolliert `art: 'drossel'` — der Protokolltest ruft nur zweimal, das bleibt leer.

- [ ] **Step 6: Tabelle** — `infra/main.bicep` nach dem Block `tabelleStimmung`:

```bicep
/*
  Live-Hoererzahl. Eine Zeile je Dienst-Exemplar, laufend ueberschrieben,
  kein Verlauf. Siehe dienst/src/hoerer.mjs.
*/
resource tabelleHoerer 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tabellendienst
  name: 'hoerer'
}
```
Prüfen: `az bicep build --file infra/main.bicep` (falls `az` fehlt: `grep -n "name: 'hoerer'" infra/main.bicep`).

- [ ] **Step 7: nginx** — im iyambae.fm-Serverblock direkt **vor** `location /api/ {` (Zeile ~396):

```nginx
    # Der Puls der Live-Hoererzahl — wie /api/, aber OHNE Zugriffsprotokoll.
    # Die Serverzeile `access_log … gekuerzt` schriebe sonst je Minute und
    # Hoerer eine Zeile mit gekuerzter Adresse: genau die Hoerdauer je
    # Anschluss, die die Datenschutzerklaerung ausschliesst.
    location = /api/hoeren {
        access_log off;
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $adresse_echt;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        client_max_body_size 1k;
        add_header Cache-Control "no-store" always;
        add_header X-Content-Type-Options "nosniff" always;
    }
```
Vorher die übrigen `add_header`/`proxy_*`-Zeilen des `location /api/`-Blocks lesen (`sed -n 396,436p deploy/nginx.conf`) und jede sicherheitsrelevante Zeile (z. B. `proxy_intercept_errors`, `error_page`) mit übernehmen — ein `location =` erbt sie nicht.
Prüfen: `docker build -t iyambae-test .` (läuft `nginx -t`); ohne Docker: im Zielbau.

- [ ] **Step 8: Commit**

```bash
git add dienst/src/server.mjs dienst/test/hilfe.mjs dienst/test/hoerer.test.mjs infra/main.bicep deploy/nginx.conf
git commit -m "Dienst: /api/hoeren ohne Herkunft, Körper und Protokoll; Tabelle hoerer; nginx ohne access_log"
```

---

### Task 3: Browser — `assets/lib/hoerer.mjs`, Anzeige, Sprachen, Service Worker

**Files:**
- Create: `assets/lib/hoerer.mjs`
- Create: `Scripts/test/hoerer.test.mjs`
- Modify: `assets/app.js` (nach `beobachteAktualisierung({…})`, Zeile ~2350; Import oben)
- Modify: `index.html` (nach `<div class="spieler__regal" id="barRegal"></div>`, Zeile ~987)
- Modify: `assets/styles.css` (nach `.spieler__titel[hidden]`, Zeile ~2501)
- Modify: `assets/lang/{de,en,es,fr,it,ja,ar}.json` (nach `aktualisierung.spaeter`)
- Modify: `sw.js` (`SW_VERSION`, Kommentar, `SHELL_FILES` neben `messung.mjs`), `Scripts/zwischenspeicher-stand.json`

**Interfaces:**
- Consumes: `POST|GET /api/hoeren → {hoeren: number|null}`; `messungLaeuft()` aus `./messung.mjs`; `t()` aus `./sprache.mjs`.
- Produces: `beobachteHoerer({ spieltGerade, ziel, holen?, takt? }) → { frage(): Promise<void>, stoppe(): void }`.

- [ ] **Step 1: Failing test** — `Scripts/test/hoerer.test.mjs`:

```js
/*
  Das Browsermodul der Live-Hoererzahl, mit Attrappen statt Browser.
  Geprueft wird, WANN gesendet wird und WAS: nie ein Koerper, nie ein
  Plaetzchen, kein Puls bei Widerspruch, keine Anzeige unter 3.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';

let speicher = {};
globalThis.localStorage = {
  getItem: (k) => speicher[k] ?? null,
  setItem: (k, v) => { speicher[k] = String(v); },
  removeItem: (k) => { delete speicher[k]; },
};
globalThis.document = {
  visibilityState: 'visible',
  documentElement: { dataset: {}, lang: 'de' },
  addEventListener() {},
};
globalThis.location = { pathname: '/de/', search: '' };
globalThis.navigator = { languages: ['de'], sendBeacon: () => true };

const { beobachteHoerer } = await import('../../assets/lib/hoerer.mjs');

function attrappe(antworten) {
  const rufe = [];
  const holen = async (weg, optionen) => {
    rufe.push({ weg, ...optionen });
    const wert = antworten.shift() ?? { hoeren: null };
    return { ok: true, status: 200, json: async () => wert };
  };
  return { rufe, holen };
}
const ziel = () => ({ hidden: true, textContent: '' });

test('spielt: POST ohne Koerper und ohne Plaetzchen', async () => {
  speicher = {};
  const { rufe, holen } = attrappe([{ hoeren: 7 }]);
  const z = ziel();
  const h = beobachteHoerer({ spieltGerade: () => true, ziel: z, holen, takt: 0 });
  await h.frage();
  assert.equal(rufe[0].weg, '/api/hoeren');
  assert.equal(rufe[0].method, 'POST');
  assert.equal(rufe[0].body, undefined);
  assert.equal(rufe[0].credentials, 'omit');
  assert.equal(z.hidden, false);
  assert.match(z.textContent, /7/);
  h.stoppe();
});

test('spielt nicht: GET', async () => {
  const { rufe, holen } = attrappe([{ hoeren: 4 }]);
  const h = beobachteHoerer({ spieltGerade: () => false, ziel: ziel(), holen, takt: 0 });
  await h.frage();
  assert.equal(rufe[0].method, 'GET');
  h.stoppe();
});

test('Widerspruch: kein POST, nur GET', async () => {
  speicher = { hz_messung: 'nein' };
  const { rufe, holen } = attrappe([{ hoeren: 4 }]);
  const h = beobachteHoerer({ spieltGerade: () => true, ziel: ziel(), holen, takt: 0 });
  await h.frage();
  assert.equal(rufe[0].method, 'GET');
  speicher = {};
  h.stoppe();
});

test('unter 3 oder null: Anzeige verborgen', async () => {
  for (const hoeren of [null, 2, 0, '5', 2.5]) {
    const { holen } = attrappe([{ hoeren }]);
    const z = ziel();
    const h = beobachteHoerer({ spieltGerade: () => true, ziel: z, holen, takt: 0 });
    await h.frage();
    assert.equal(z.hidden, true, String(hoeren));
    assert.equal(z.textContent, '');
    h.stoppe();
  }
});

test('unsichtbar und still: gar keine Anfrage', async () => {
  document.visibilityState = 'hidden';
  const { rufe, holen } = attrappe([]);
  const h = beobachteHoerer({ spieltGerade: () => false, ziel: ziel(), holen, takt: 0 });
  await h.frage();
  assert.equal(rufe.length, 0);
  document.visibilityState = 'visible';
  h.stoppe();
});

test('Netzfehler: Anzeige verborgen, kein Wurf', async () => {
  const z = { hidden: false, textContent: '9 hören gerade' };
  const h = beobachteHoerer({
    spieltGerade: () => true, ziel: z, takt: 0,
    holen: async () => { throw new TypeError('offline'); },
  });
  await h.frage();
  assert.equal(z.hidden, true);
  h.stoppe();
});
```

Hinweis: Falls `messung.mjs` oder `sprache.mjs` beim Laden weitere Globale anfassen, die Attrappen oben nach dem Muster in `Scripts/pruefe-messung.mjs` ergänzen — nicht das Modul ändern.

- [ ] **Step 2: Test rot** — `node --test Scripts/test/hoerer.test.mjs` → FAIL, Modul fehlt.

- [ ] **Step 3: Modul** — `assets/lib/hoerer.mjs`:

```js
// ═══════════════════════════════════════════════════════════════════
// „7 hören gerade“ — die Live-Hörerzahl
//
// Spec: docs/superpowers/specs/2026-10-16-hoerer-jetzt-design.md
//
// Solange Musik läuft, meldet diese Seite einmal pro Minute „läuft noch“
// an /api/hoeren. Die Meldung trägt NICHTS: keinen Körper, kein Plätzchen
// (credentials: 'omit'), keinen Sender, keine Kennung. Der Dienst zählt
// nur, DASS sie kam.
//
// Wer die Messung im Fuß abgeschaltet hat, meldet nichts — die Zahl der
// anderen sieht er trotzdem, denn das Lesen meldet nichts.
//
// Die Schwelle (ab 3) steht im Dienst. Hier wird nur angezeigt, was als
// ganze Zahl ≥ 3 ankommt; alles andere verbirgt die Zeile.
// ═══════════════════════════════════════════════════════════════════

import { t } from './sprache.mjs';
import { messungLaeuft } from './messung.mjs';

const WEG = '/api/hoeren';
const TAKT = 60_000;

/**
 * @param {object} o
 * @param {() => boolean} o.spieltGerade
 * @param {{hidden: boolean, textContent: string}} o.ziel
 * @param {typeof fetch} [o.holen]
 * @param {number} [o.takt]  0 = kein Intervall (Tests)
 */
export function beobachteHoerer({ spieltGerade, ziel, holen = (...a) => fetch(...a), takt = TAKT }) {
  function zeige(n) {
    if (Number.isInteger(n) && n >= 3) {
      ziel.textContent = t('hoerer.jetzt', { n });
      ziel.hidden = false;
    } else {
      ziel.hidden = true;
      ziel.textContent = '';
    }
  }

  async function frage() {
    const spielt = spieltGerade();
    // Still und unsichtbar: niemand sieht die Zahl, niemand hört — also
    // auch keine Anfrage, die den Container weckt.
    if (!spielt && document.visibilityState !== 'visible') return;
    const methode = spielt && messungLaeuft() ? 'POST' : 'GET';
    try {
      const antwort = await holen(WEG, { method: methode, credentials: 'omit', cache: 'no-store' });
      // 429: Die alte Zahl bleibt stehen, in einer Minute wieder.
      if (antwort.status === 429) return;
      if (!antwort.ok) { zeige(null); return; }
      const daten = await antwort.json();
      zeige(daten?.hoeren);
    } catch {
      zeige(null);
    }
  }

  let uhr = null;
  if (takt > 0) {
    uhr = setInterval(frage, takt);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') frage();
    });
  }

  return {
    frage,
    stoppe() { if (uhr) clearInterval(uhr); uhr = null; },
  };
}
```

- [ ] **Step 4: Test grün** — `node --test Scripts/test/hoerer.test.mjs` → PASS.

- [ ] **Step 5: Sprachen** — in jeder Datei nach der Zeile `"aktualisierung.spaeter": …,` einfügen:

| Datei | Zeile |
|---|---|
| `de.json` | `"hoerer.jetzt": "{n} hören gerade",` |
| `en.json` | `"hoerer.jetzt": "{n} listening now",` |
| `es.json` | `"hoerer.jetzt": "{n} escuchando ahora",` |
| `fr.json` | `"hoerer.jetzt": "{n} à l’écoute",` |
| `it.json` | `"hoerer.jetzt": "{n} in ascolto",` |
| `ja.json` | `"hoerer.jetzt": "{n}人が聴いています",` |
| `ar.json` | `"hoerer.jetzt": "{n} يستمعون الآن",` |

Prüfen: `python3 -c "import json,glob;[json.load(open(f,encoding='utf-8')) for f in glob.glob('assets/lang/*.json')]"` → keine Ausgabe.

- [ ] **Step 6: Element und Stil** — `index.html` nach `<div class="spieler__regal" id="barRegal"></div>`:

```html
        <!-- Live-Hörerzahl, erst ab 3 (assets/lib/hoerer.mjs). Platz und
             Gestaltung: Vorschlag, Sāmi-Ra entscheidet. -->
        <div class="spieler__hoerer" id="barHoerer" hidden aria-live="off"></div>
```

`assets/styles.css` nach `.spieler__titel[hidden] { display: none; }`:

```css
/* Live-Hörerzahl: leiser als der Titel, damit sie nie mit dem Sender konkurriert. */
.spieler__hoerer {
  font-size: 0.72rem;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spieler__hoerer[hidden] { display: none; }
```

- [ ] **Step 7: Verdrahtung** — `assets/app.js`: Import neben `beobachteAktualisierung` (`grep -n "from './lib/aktualisierung.mjs'" assets/app.js`):

```js
import { beobachteHoerer } from './lib/hoerer.mjs';
```

Nach dem Block `beobachteAktualisierung({ … });`:

```js
    /*
     Live-Hörerzahl. Der Puls beim Start kommt sofort — sonst stünde ein
     neuer Hörer bis zu einer Minute nicht in der Zahl. Siehe lib/hoerer.mjs.
    */
    const ziel = document.getElementById('barHoerer');
    if (ziel) {
      const hoerer = beobachteHoerer({ spieltGerade: () => this.engine.laeuft, ziel });
      this.engine.bei('start', () => hoerer.frage());
      hoerer.frage();
    }
```

Prüfen, dass `this.engine.bei` mehrere Rückrufe je Art erlaubt (`_rueckrufe[art]` ist ein Array, Zeile ~578) — sonst würde der bestehende `start`-Rückruf ersetzt.

- [ ] **Step 8: Service Worker** — `sw.js`: `'/assets/lib/hoerer.mjs',` in `SHELL_FILES` direkt nach `'/assets/lib/messung.mjs',`; `SW_VERSION` um eins hoch; Kommentar oben:

```js
// v75: Live-Hörerzahl „hören gerade“ (ab 3). Neue Datei lib/hoerer.mjs,
// dazu index.html, styles.css, app.js und alle sieben Kataloge.
```

Dann: `python3 Scripts/baue-sprachen.py && python3 Scripts/pruefe-shell-dateien.py && python3 Scripts/pruefe-zwischenspeicher.py --uebernehmen` und danach ohne `--uebernehmen` → grün. Die von `baue-sprachen.py` erzeugten Sprachordner nicht committen, wenn sie nicht versioniert sind (`git status`).

- [ ] **Step 9: Alle Prüfungen wie im Dockerfile**

```bash
python3 Scripts/pruefe-shell-dateien.py && python3 Scripts/pruefe-zwischenspeicher.py \
 && node Scripts/pruefe-messung.mjs && node Scripts/pruefe-verlauf.mjs && node Scripts/pruefe-konto.mjs \
 && node --test "Scripts/test/*.test.mjs"
```
Expected: alles grün.

- [ ] **Step 10: Im Browser** (Chrome DevTools, `python3 -m http.server 8000` reicht nicht für `/api/` — gegen den Docker-Bau aus Task 2 Step 7 auf `localhost:8080`): Sender starten → sofort ein `POST /api/hoeren` ohne Body und ohne Cookie; Pause → keine weiteren POSTs; Messung im Fuß abschalten → nur noch GET; Zeile bleibt verborgen (lokal < 3).

- [ ] **Step 11: Commit**

```bash
git add assets/lib/hoerer.mjs Scripts/test/hoerer.test.mjs assets/app.js index.html assets/styles.css assets/lang/*.json sw.js Scripts/zwischenspeicher-stand.json
git commit -m "Seite: „hören gerade“ im Abspieler, Puls nur bei Musik, ab 3 (SW v75)"
```

---

### Task 4: Rechtstexte und Kommentare

**Files:**
- Modify: `docs/recht/datenschutz.md` (Zeilen ~11–14, ~240, ~446–450; neuer Absatz in Abschnitt 3)
- Modify: `docs/recht/verarbeitungsverzeichnis.md` (Übersicht ~94; neuer Abschnitt `V12` nach V11)
- Modify: `assets/lib/messung.mjs` (Kopf „WAS NICHT GEMESSEN WIRD“), `infra/dashboard.bicep` (Kopf „WAS WEITERHIN NICHT GEMESSEN WIRD“)

- [ ] **Step 1: Kurzfassung oben** — `docs/recht/datenschutz.md`, den Satz ab „Was wir dagegen nicht wissen …“ bis „… berührt unseren Server nie.“ ersetzen durch:

```markdown
Solange Musik läuft, meldet die Seite einmal pro Minute „läuft noch“ — ohne
Kennung, ohne Cookie, ohne Sender. Daraus entsteht nur eine Zahl: wie viele
gerade hören, angezeigt ab drei. Sie wird nach spätestens drei Minuten
überschrieben, und es gibt keinen Verlauf, keine Protokollzeile und nichts,
woran sich zwei Meldungen derselben Person aufreihen ließen.
```

- [ ] **Step 2: Liste „Was nicht erhoben wird“** — die Zeile `- **Nicht, wie lange du hörst.** Nur der Start wird gemeldet, nie das Ende.` ersetzen durch:

```markdown
- **Nicht, wie lange du hörst.** Der Puls der Live-Hörerzahl (unten) trägt
  nichts, woran man ihn dir zuordnen könnte, und er wird nirgends protokolliert —
  auch nicht im Zugriffsprotokoll. Aus ihm lässt sich keine Hördauer
  zusammensetzen, nur die Summe aller, die in derselben Minute hören.
```

- [ ] **Step 3: Neuer Absatz** in Abschnitt 3 direkt nach dieser Liste:

```markdown
**Die Live-Hörerzahl („7 hören gerade“).** Solange Musik läuft — auf der Seite,
in der installierten App und in IYAMBAE FM für Google TV —, schickt dein Gerät
einmal pro Minute eine leere Anfrage an `/api/hoeren`. Leer heißt: kein Inhalt,
kein Cookie, keine Kennung, kein Sender. Unser Server zählt nur, wie viele
solcher Anfragen in einer Minute ankamen, und hält diese Zahl höchstens drei
Minuten. Angezeigt wird sie erst ab drei, damit sie nie einen einzelnen Menschen
verrät. Für den Schutz vor Missbrauch wird die gekürzte Adresse wie überall nur
im Arbeitsspeicher kurz gezählt und nicht gespeichert. Die Anfrage erscheint in
keinem Protokoll. Der Schalter „Reichweitenmessung“ in der Fußzeile stoppt auch
diese Meldung. Die Fernseh-App hat diesen Schalter noch nicht. Rechtsgrundlage
ist unser berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO), dir zu zeigen,
dass du nicht allein hörst; du kannst jederzeit widersprechen (Art. 21 DSGVO).
```

- [ ] **Step 4: Absatz „Die Seite, die für dich spricht“** — die Sätze „Wir zählen, dass ein Sender gestartet wurde (Abschnitt 3) — aber nicht, wie lange du bleibst, ob du weiterhörst, ob du dreimal am Tag zurückkommst. Das steht in keinem Protokoll, weil die Anfrage unseren Server nie erreicht. Das ist kein Versprechen, das man uns glauben muss — es folgt aus dem Aufbau.“ ersetzen durch:

```markdown
Wir zählen, dass ein Sender gestartet wurde, und wie viele gerade hören
(Abschnitt 3) — aber nicht, wie lange *du* bleibst, ob du weiterhörst, ob du
dreimal am Tag zurückkommst. Die Musik selbst erreicht unseren Server nie, und
der Puls für die Hörerzahl trägt nichts, woran man ihn dir zuordnen könnte.
```

- [ ] **Step 5: Verarbeitungsverzeichnis** — Zeile in der Übersicht ergänzen (Format der vorhandenen Zeilen übernehmen) und nach V11 (vor `## Kapitel V`) einfügen:

```markdown
## V12 — Live-Hörerzahl *(neu am 16.10.2026)*

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Anzeige „n hören gerade“ auf iyambae.fm und in IYAMBAE FM für Google TV |
| **Zweck** | Zeigen, dass gerade andere mithören. Keine Auswertung, kein Verlauf, keine Weitergabe |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. f DSGVO. Abwägung: kein Inhalt, keine Kennung, keine Speicherung über drei Minuten, Anzeige erst ab drei, Abschaltung mit einem Klick. § 25 TDDDG greift nicht — es wird nichts auf dem Endgerät gespeichert oder dort ausgelesen (Einordnung wie V11) |
| **Kategorien personenbezogener Daten** | keine im Ergebnis. Im Augenblick der Anfrage: gekürzte Adresse nur für die Drosselung im Arbeitsspeicher (10 je Minute je Netz), nicht gespeichert |
| **Nicht erhoben** | Kennung jeder Art, Cookie, Sender, Hördauer, Zugriffsprotokoll (`access_log off` für `/api/hoeren`) |
| **Speicherung** | Je Dienst-Exemplar eine Zeile in der Tabelle `hoerer` mit Zählern der letzten drei Minuten, laufend überschrieben; Zeilen beendeter Exemplare nach zehn Minuten gelöscht |
| **Empfänger** | keine Dritten; Microsoft als Auftragsverarbeiterin wie V1 |
| **Widerspruch** | Schalter „Reichweitenmessung“ in der Fußzeile, wirkt im Browser vor dem Absenden. Fernseh-App: noch kein Schalter |
| **Fundstellen** | `assets/lib/hoerer.mjs`, `dienst/src/hoerer.mjs`, `dienst/src/server.mjs` (`/api/hoeren`), `deploy/nginx.conf` (`location = /api/hoeren`), `infra/main.bicep` (`tabelleHoerer`), `MyRetuner/fm-tv` (`wiedergabe/Hoerer.kt`) |
```

- [ ] **Step 6: Kommentare** — in `assets/lib/messung.mjs` die Zeile `//   Wie lange jemand hört. Nur der Start wird gemeldet, nie das Ende.` ersetzen durch:

```js
//   Wie lange jemand hört. Nur der Start wird gemeldet, nie das Ende. Die
//   Live-Hörerzahl (lib/hoerer.mjs) sendet zwar während des Hörens, aber
//   ohne Inhalt und ohne Protokoll — sie liefert eine Summe, keine Dauer.
```

In `infra/dashboard.bicep` den Punkt „Wie lange gehört wird. …“ um denselben Hinweis ergänzen:

```
    Wie lange gehört wird. Nur der Start wird gemeldet, nie das Ende. Die
      Ströme laufen direkt vom Browser zum Sender und berühren diesen Server
      nie. Der Puls der Live-Hörerzahl (/api/hoeren) kommt zwar während des
      Hörens, landet aber in KEINEM Protokoll (access_log off) und taucht
      deshalb in diesem Dashboard nie auf.
```
(den bestehenden Wortlaut der übrigen Zeilen dieses Punkts beibehalten; nur den letzten Satz anfügen.)

- [ ] **Step 7: Bau der Rechtsseiten** — `python3 Scripts/baue-recht.py` → läuft ohne Fehler; `grep -c "hören gerade\|Live-Hörerzahl" recht/datenschutz/index.html` ≥ 1. Erzeugte Dateien nur committen, wenn sie versioniert sind.

- [ ] **Step 8: Commit**

```bash
git add docs/recht/datenschutz.md docs/recht/verarbeitungsverzeichnis.md assets/lib/messung.mjs infra/dashboard.bicep
git commit -m "Datenschutz: Live-Hörerzahl statt „nie das Ende“; V12 im Verzeichnis"
```

---

### Task 5: Abschluss iyambae-radio

- [ ] **Step 1:** Volle Prüfung: `cd dienst && npm test` und Schritt 9 aus Task 3 → grün. Ausgabe festhalten.
- [ ] **Step 2:** `git push` und PR `hoerer-jetzt` → `main` mit `gh pr create`; Text nennt: was sich am Datenschutzversprechen ändert, nginx `access_log off`, Platz/Gestaltung als Vorschlag an Sāmi-Ra, Kostenwirkung. Endet mit `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3:** **Nicht selbst mergen.** Merge auf `main` liefert sofort aus (`ausliefern.yml`); die Freigabe gibt Micha.

---

### Task 6: Fernseher — `MyRetuner/fm-tv` (Repo `apps`, Zweig `hoerer-jetzt`)

**Files:**
- Create: `fm-tv/app/src/main/java/fm/iyambae/fm/tv/wiedergabe/Hoerer.kt`
- Modify: `fm-tv/app/src/main/java/fm/iyambae/fm/tv/wiedergabe/WiedergabeDienst.kt`
- Modify: `fm-tv/app/src/main/java/fm/iyambae/fm/tv/HauptActivity.kt`, `ui/Oberflaeche.kt` (`Zustand`, `Hero`)
- Modify: `fm-tv/app/src/main/res/values*/strings.xml` (7 Dateien)

**Interfaces:**
- Consumes: `POST https://iyambae.fm/api/hoeren → {"hoeren": n|null}`; `BASIS` aus `daten/Katalog.kt`; `Netz.client` aus `wiedergabe/Netz.kt`.
- Produces: `object Hoerer { val zahl: StateFlow<Int?> }`, `Zustand.hoeren: Int?`.

- [ ] **Step 0:** `cd MyRetuner && git pull --rebase origin main && git switch -c hoerer-jetzt`

- [ ] **Step 1: `Hoerer.kt`**

```kotlin
package fm.iyambae.fm.tv.wiedergabe

import fm.iyambae.fm.tv.daten.BASIS
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Die Live-Hörerzahl von iyambae.fm — „7 hören gerade“.
 *
 * Solange Musik läuft, einmal pro Minute ein leerer POST an /api/hoeren:
 * kein Inhalt, keine Kennung, kein Sender. Die Antwort ist die Zahl aller,
 * die gerade hören, oder null unter drei. Vertrag:
 * iyambae-radio/docs/superpowers/specs/2026-10-16-hoerer-jetzt-design.md
 */
object Hoerer {
    private val _zahl = MutableStateFlow<Int?>(null)
    val zahl: StateFlow<Int?> = _zahl

    private var lauf: Job? = null

    fun starte(bereich: CoroutineScope) {
        if (lauf?.isActive == true) return
        lauf = bereich.launch(Dispatchers.IO) {
            while (isActive) {
                _zahl.value = puls()
                delay(60_000)
            }
        }
    }

    fun stoppe() {
        lauf?.cancel(); lauf = null
        _zahl.value = null
    }

    private fun puls(): Int? = runCatching {
        val anfrage = Request.Builder()
            .url(BASIS + "api/hoeren")
            .post(ByteArray(0).toRequestBody(null))
            .build()
        Netz.client.newCall(anfrage).execute().use { antwort ->
            if (!antwort.isSuccessful) return@use null
            val wert = JSONObject(antwort.body!!.string()).opt("hoeren")
            (wert as? Int)?.takeIf { it >= 3 }
        }
    }.getOrNull()
}
```

Vorher prüfen: `Netz.client` sendet keine Cookies (`cat fm-tv/app/src/main/java/fm/iyambae/fm/tv/wiedergabe/Netz.kt`, kein `cookieJar`). Falls doch, in `puls()` einen eigenen `OkHttpClient` ohne CookieJar nehmen.

- [ ] **Step 2: Dienst verdrahten** — `WiedergabeDienst.kt`: Felder und Listener ergänzen.

```kotlin
    private val bereich = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Main)

    /** Puls nur, solange wirklich Ton kommt — nicht beim Puffern, nicht in der Pause. */
    private val pulsWache = object : androidx.media3.common.Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) Hoerer.starte(bereich) else Hoerer.stoppe()
        }
    }
```
In `onCreate` nach `Klang.player = player`: `player.addListener(pulsWache)`.
In `onDestroy` vor `sitzung?.run {`: `Hoerer.stoppe(); bereich.cancel()` (Import `kotlinx.coroutines.cancel`).

- [ ] **Step 3: Zustand und Anzeige** — `Oberflaeche.kt`: in `data class Zustand` `val hoeren: Int? = null,` ergänzen. Im `Hero` direkt nach dem `Text` für `ort` (Stelle mit `grep -n "val ort = when" ui/Oberflaeche.kt` finden, den zugehörigen `Text(ort …)`-Aufruf abwarten):

```kotlin
            z.hoeren?.let { n ->
                Text(
                    stringResource(R.string.hoerer_jetzt, n.toString()),
                    color = Farbe.text.copy(alpha = 0.6f), fontFamily = Schrift.mono,
                    fontSize = 12.sp, letterSpacing = Schrift.sperrung(0.05f),
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
```

`HauptActivity.kt`, in `onCreate` nach dem `lifecycleScope.launch { … katalog … }`-Block:

```kotlin
        lifecycleScope.launch {
            Hoerer.zahl.collect { n -> zustand.value = zustand.value.copy(hoeren = n) }
        }
```
(Import `fm.iyambae.fm.tv.wiedergabe.Hoerer`.)

- [ ] **Step 4: Texte** — in jeder `strings.xml` neben `status_pausiert`:

| Ordner | Zeile |
|---|---|
| `values` | `<string name="hoerer_jetzt">%1$s hören gerade</string>` |
| `values-en` | `<string name="hoerer_jetzt">%1$s listening now</string>` |
| `values-es` | `<string name="hoerer_jetzt">%1$s escuchando ahora</string>` |
| `values-fr` | `<string name="hoerer_jetzt">%1$s à l’écoute</string>` |
| `values-it` | `<string name="hoerer_jetzt">%1$s in ascolto</string>` |
| `values-ja` | `<string name="hoerer_jetzt">%1$s人が聴いています</string>` |
| `values-ar` | `<string name="hoerer_jetzt">%1$s يستمعون الآن</string>` |

- [ ] **Step 5: Bauen** — auf diesem Windows-Rechner gibt es kein Android SDK. Nur Syntax grob prüfen (`git diff`), **nicht als geprüft melden**. Bauen und Prüfen am Gerät: Sāmi-Ra auf dem Mac (`./gradlew assembleDebug`, LIESMICH.md), erst wenn der Dienst-Teil ausgeliefert ist.

- [ ] **Step 6: Commit, Push, PR** in `apps`, Text: ungeprüft, braucht Bau und Gerätetest; hängt an iyambae-radio-PR. Nicht mergen.

```bash
git add fm-tv
git commit -m "FM-TV: Live-Hörerzahl (Puls nur bei Wiedergabe, Anzeige ab 3) — ungeprüft, braucht Bau am Mac"
git push -u origin hoerer-jetzt
```

---

### Task 7: Vorgang an Sāmi-Ra

- [ ] Vorgang in `iyambae-lifetree/432hz-radio` (eigener Vorgang je Thema): Links auf beide PRs; Bitte um (1) Platz und Gestaltung der Zeile — Beobachtung statt Gegenentwurf, der Vorschlag ist nur ein Anfang; (2) Durchsicht des neuen Datenschutztexts; (3) Bau und Gerätetest FM-TV. Kostenwirkung nennen. Vorher Micha den Text zeigen.
