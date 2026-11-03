/*
  ── KATER MIKESCH: DAS GESPRAECH ─────────────────────────────────────

  Unten rechts auf iyambae.fm steckt Mikesch den Kopf ins Bild und
  beantwortet Fragen zum Laden. Die Antwort schreibt Claude; dieser Dienst
  ist der einzige Ort, der den Schluessel dafuer kennt. Der Browser schickt
  nur das Gespraech und bekommt nur Text zurueck.

  ── WAS HIER SCHUETZT ───────────────────────────────────────────────

  Dieselben zwei Dinge wie bei jedem anonymen Weg in server.mjs: die
  Erlaubnisliste (`saeubereGespraech`) und die Drossel. Dazu ein drittes,
  das es nur hier gibt, weil nur hier jede Anfrage Geld kostet: die
  TAGESGRENZE. Sie zaehlt alle Gespraechszuege des Tages zusammen und sagt
  danach freundlich „Mikesch schlaeft". Die Rechnung dazu steht in
  docs/mikesch-assistent.md; die Grenze ist so gesetzt, dass ein geteilter
  Beitrag die Seite nicht teuer machen kann.

  ── WAS NICHT GESPEICHERT WIRD ──────────────────────────────────────

  Nichts. Kein Gespraech, keine Frage, kein Satz der Antwort steht in einer
  Tabelle oder im Protokoll. Ins Protokoll gehen Laenge, Dauer und die
  Tokenzahlen — die braucht es, um die Rechnung zu verstehen, und an ihnen
  erkennt man niemanden. Das Gedaechtnis des Gespraechs liegt im Browser
  des Besuchers und kommt bei jedem Zug ganz mit.

  ── WARUM DER KATALOG IM SYSTEMTEXT STEHT ───────────────────────────

  Rund 190 Sender mit Kaertchen sind etwa 15.000 Token. Das ist fuer Claude
  wenig, und es erspart jede Werkzeugschleife: Mikesch kennt den Laden,
  statt nachzuschlagen. Der Systemtext ist dabei FEST — er haengt nur am
  ausgelieferten Katalog —, damit der Zwischenspeicher bei Anthropic greift
  und jeder weitere Zug den Katalog fuer ein Zehntel des Preises liest.
  Alles, was sich je Besucher aendert (die Seitensprache), steht deshalb im
  ersten Gespraechszug und nicht im Systemtext.
*/

import { readFile } from 'node:fs/promises';

const MODELL = process.env.MIKESCH_MODELL ?? 'claude-haiku-5-5';
const JE_TAG = Number(process.env.MIKESCH_JE_TAG ?? 1000);

/** Grenzen des Gespraechs, das der Browser mitschickt. */
export const HOECHSTENS_ZUEGE = 16;
export const HOECHSTENS_ZEICHEN_JE_ZUG = 800;
export const HOECHSTENS_ZEICHEN_GESAMT = 6000;

const SPRACHNAMEN = {
    de: 'Deutsch', en: 'Englisch', fr: 'Französisch', es: 'Spanisch',
    it: 'Italienisch', ja: 'Japanisch', ar: 'Arabisch',
};

// ── Die Erlaubnisliste ──────────────────────────────────────────────

/*
  Steuerzeichen raus, Zeilenumbrueche bleiben. Mehr nicht: Was ein Besucher
  schreibt, darf er schreiben — es geht hier nicht darum, Text zu
  bewerten, sondern darum, dass nichts anderes als Text durchkommt.
*/
function saeubereText(wert) {
    if (typeof wert !== 'string') return '';
    return wert.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}

/**
 * Prueft das Gespraech, das der Browser schickt.
 *
 * Erwartet `{ sprache, verlauf: [{ wer: 'gast'|'mikesch', text }] }`. Der
 * letzte Zug muss vom Gast kommen, die Zuege muessen sich abwechseln —
 * sonst lehnt die API ab, und das soll hier passieren statt dort, wo es
 * Geld kostet.
 *
 * @returns {{ sprache: string, verlauf: object[] } | null}
 */
export function saeubereGespraech(koerper) {
    if (!koerper || typeof koerper !== 'object') return null;
    const sprache = Object.hasOwn(SPRACHNAMEN, koerper.sprache) ? koerper.sprache : 'de';

    const roh = Array.isArray(koerper.verlauf) ? koerper.verlauf : null;
    if (!roh || !roh.length || roh.length > HOECHSTENS_ZUEGE) return null;

    const verlauf = [];
    let gesamt = 0;
    for (const zug of roh) {
        if (!zug || typeof zug !== 'object') return null;
        if (zug.wer !== 'gast' && zug.wer !== 'mikesch') return null;
        const text = saeubereText(zug.text);
        if (!text || text.length > HOECHSTENS_ZEICHEN_JE_ZUG) return null;
        gesamt += text.length;
        if (gesamt > HOECHSTENS_ZEICHEN_GESAMT) return null;
        if (verlauf.length && verlauf.at(-1).wer === zug.wer) return null;
        verlauf.push({ wer: zug.wer, text });
    }
    if (verlauf[0].wer !== 'gast' || verlauf.at(-1).wer !== 'gast') return null;
    return { sprache, verlauf };
}

// ── Der Systemtext ──────────────────────────────────────────────────

/**
 * Der Katalog als eine Zeile je Sender. Sortiert nach Kennung, damit der
 * Text bei gleichem Katalog byteweise gleich bleibt — eine andere
 * Reihenfolge waere fuer den Zwischenspeicher ein anderer Text.
 */
export function katalogText(daten) {
    const regale = new Map((daten?.regale ?? []).map((r) => [r.id, r]));
    const regalZeilen = [...regale.values()]
        .map((r) => '- ' + r.name + ' (' + r.id + '): ' + r.beschreibung);
    const sender = [...(Array.isArray(daten) ? daten : daten?.sender ?? [])]
        .filter((s) => s && s.id && s.name && s.status !== 'tot')
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const senderZeilen = sender.map((s) => [
        s.id, s.name, [s.ort, s.land].filter(Boolean).join(', '),
        regale.get(s.regal)?.name ?? s.regal ?? '',
        (s.etiketten ?? []).join(' '),
        String(s.kaertchen ?? '').replace(/\s+/g, ' '),
    ].join(' | '));
    return '# Die Regale\n\n' + regalZeilen.join('\n')
        + '\n\n# Der Katalog (' + sender.length + ' Sender)\n\n'
        + 'Kennung | Name | Ort, Land | Regal | Etiketten | Kärtchen\n'
        + senderZeilen.join('\n') + '\n';
}

async function liesWesen() {
    return readFile(new URL('./mikesch-wesen.md', import.meta.url), 'utf8');
}

// ── Die Antwort ─────────────────────────────────────────────────────

/** Was die API zurueckgibt, in genau die Form, die der Browser liest. */
function textAus(antwort) {
    if (antwort?.stop_reason === 'refusal') return null;
    const teile = (antwort?.content ?? [])
        .filter((b) => b.type === 'text').map((b) => b.text);
    const text = teile.join('\n').trim();
    return text || null;
}

/**
 * Baut den Gespraechspartner.
 *
 * @param {object} o
 * @param {() => Promise<object>} o.holeKatalog  liefert sender.json
 * @param {object} [o.klient]  ein Anthropic-Klient; fehlt er, wird er aus
 *                             ANTHROPIC_API_KEY gebaut — oder gar nicht
 * @param {() => number} [o.jetzt]
 * @returns {Promise<object|null>} null, wenn kein Schluessel da ist
 */
export async function erzeugeMikesch({ holeKatalog, klient = null, jetzt = Date.now, jeTag = JE_TAG, protokolliere = () => {} } = {}) {
    if (!klient) {
        if (!process.env.ANTHROPIC_API_KEY) return null;
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        // Zwei Wiederholungen sind die Vorgabe des SDK. Eine reicht: Wer
        // auf eine Katzenantwort wartet, wartet keine Minute.
        klient = new Anthropic({ maxRetries: 1, timeout: 25_000 });
    }

    let system = null;
    let systemSeit = 0;
    const FRISCHE_MS = 6 * 3_600_000;

    /*
      Der Systemtext entsteht beim ersten Gespraech und dann alle sechs
      Stunden neu — so oft, wie ein neuer Sender realistisch dazukommt.
      Faellt der Katalog dabei aus, bleibt der alte stehen.
    */
    async function holeSystem() {
        const nun = jetzt();
        if (system && nun - systemSeit < FRISCHE_MS) return system;
        try {
            const [wesen, katalog] = await Promise.all([liesWesen(), holeKatalog()]);
            system = wesen.trim() + '\n\n' + katalogText(katalog);
            systemSeit = nun;
        } catch (fehler) {
            if (!system) throw fehler;
            protokolliere({ art: 'mikesch.katalog', ergebnis: 'fehler', grund: 'alter_katalog_bleibt' });
            systemSeit = nun;
        }
        return system;
    }

    let tag = '';
    let heute = 0;

    return {
        /** Fuer Tests: wie viele Zuege heute schon gezaehlt sind. */
        zaehler: () => heute,

        /**
         * @returns {Promise<{ text: string } | { schlaeft: true } | { verweigert: true }>}
         */
        async antworte({ sprache, verlauf }) {
            const datum = new Date(jetzt()).toISOString().slice(0, 10);
            if (datum !== tag) { tag = datum; heute = 0; }
            if (heute >= jeTag) return { schlaeft: true };
            heute += 1;

            const messages = verlauf.map((zug, i) => ({
                role: zug.wer === 'gast' ? 'user' : 'assistant',
                content: i === 0
                    ? '[Seitensprache: ' + SPRACHNAMEN[sprache] + ']\n\n' + zug.text
                    : zug.text,
            }));

            const antwort = await klient.messages.create({
                model: MODELL,
                max_tokens: 700,
                /*
                  Ohne Nachdenken, mit niedriger Muehe: Es sind kurze
                  Antworten auf Fragen, deren Antwort im Systemtext steht.
                  Nachdenken kostet hier nur Wartezeit und Geld.
                */
                thinking: { type: 'disabled' },
                output_config: { effort: 'low' },
                system: [{ type: 'text', text: await holeSystem(), cache_control: { type: 'ephemeral' } }],
                messages,
            });

            protokolliere({
                art: 'mikesch', ergebnis: 'ok',
                zuege: verlauf.length,
                ein: antwort.usage?.input_tokens ?? 0,
                zwischen: antwort.usage?.cache_read_input_tokens ?? 0,
                geschrieben: antwort.usage?.cache_creation_input_tokens ?? 0,
                aus: antwort.usage?.output_tokens ?? 0,
                ende: antwort.stop_reason ?? '',
            });

            const text = textAus(antwort);
            return text ? { text } : { verweigert: true };
        },
    };
}
