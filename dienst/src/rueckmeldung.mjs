/*
  ── RÜCKMELDUNG DER BEIDEN MESSWERKZEUGE ─────────────────────────────

  Auf `apps.iyambae.fm` stehen seit dem 01.09.2026 zwei Werkzeuge live:

    /stimmung/   misst, auf welchen Kammerton eine Aufnahme gestimmt ist
    /hoertest/   Blindtest, zwei Runden à fünf Durchgängen

  Beide rechnen im Browser, beide zeigen dem Besucher sein Ergebnis — und
  **beide warfen es danach weg.** Der Anlass steht in `432hz-radio#21`:

  > „Das ist der Grund, warum wir über 432 Hz weiterhin nur Behauptungen
  > anderer Leute zitieren können. Wir haben zwei Messgeräte im Feld und
  > heben nichts auf."

  Diese Datei ist die Gegenstelle. Was sie NICHT ist: ein Weg, Besucher zu
  zählen. Es geht um zwei Zahlen, die wir sonst nirgends bekommen — wie sich
  die gemessenen Stimmungen verteilen, und wie oft im Blindtest richtig
  geraten wird. Auch wenn es gegen uns ausfällt.

  ── WARUM ZWEI TABELLEN UND NICHT EINE ───────────────────────────────

  Dieselbe Begründung wie bei `TABELLE_UMFRAGE` in `speicher.mjs`, eine
  Ebene tiefer: Zwei Arten von Zeilen in einer Tabelle bekommen früher oder
  später ein gemeinsames Feld, über das sie sich verbinden lassen. Hier wäre
  das besonders unangenehm — ein Hörtest und eine Messung aus derselben
  Sitzung dürfen nicht zusammenfindbar sein, und eine gemeinsame Tabelle mit
  einem Feld `art` lädt genau dazu ein.

  Der Nebeneffekt ist praktisch: Jede Auswertung läuft über genau eine
  Partition ihrer eigenen Tabelle, statt fremde Zeilen zu überspringen.

  ── WAS AUSDRÜCKLICH NICHT ANKOMMT ───────────────────────────────────

  Kein Dateiname (im Testlauf hieß die Datei „Privat 2019.flac", im Paket
  steht `"endung": "flac"`), nichts vom Ton selbst, keine Kennung, kein
  Plätzchen. Die Erlaubnisliste unten lässt nichts anderes durch — nicht
  weil die Oberfläche brav ist, sondern weil diese Datei es nicht annimmt.
*/

import { randomUUID } from 'node:crypto';
import { TABELLE_HOERTEST, TABELLE_STIMMUNG } from './speicher.mjs';

/*
  Die sieben Sprachfassungen aus `assets/lib/sprache.mjs`. Sie sagen, in
  welcher Fassung jemand gelesen hat, nicht wer er ist — dieselbe Liste und
  dieselbe Begründung wie in `umfrage.mjs`.
*/
const SPRACHEN = new Set(['de', 'en', 'fr', 'es', 'it', 'ja', 'ar']);

// ── HÖRTEST ─────────────────────────────────────────────────────────

/*
  Die beiden Runden. `432-440` ist der weite Abstand (32 Cent), `432-433`
  der enge — der zweite ist die eigentliche Probe, weil dort niemand mehr
  ernsthaft etwas hören kann und ein auffälliger Trefferanteil deshalb
  entweder an uns oder am Zufall liegt.
*/
const RUNDEN = new Set(['432-440', '432-433']);

/** Fünf Durchgänge je Runde, also 0 bis 5 Treffer. */
const DURCHGAENGE = 5;

/**
 * Prüft ein Hörtest-Paket gegen die Erlaubnisliste.
 *
 * Fehlt `runde` oder `treffer`, kommt nichts zurück: Ohne die beiden ist
 * die Zeile keine Beobachtung, sondern ein leerer Platz. `wahl_a` und
 * `sprache` sind dagegen Beigaben — fehlt eine, bleibt die Messung gültig.
 *
 * @returns {object} nur erlaubte Felder; leer, wenn nichts trägt
 */
export function saeubereHoertest(koerper) {
    if (!koerper || typeof koerper !== 'object') return {};

    const runde = koerper.runde;
    if (typeof runde !== 'string' || !RUNDEN.has(runde)) return {};

    const treffer = ganzeZahlImBereich(koerper.treffer, 0, DURCHGAENGE);
    if (treffer === null) return {};

    const sauber = { runde, treffer };

    /*
      `wahl_a` zählt, wie oft der ERSTE Knopf gewählt wurde. Nicht für den
      Hörenden — für uns. Fällt das über viele Sitzungen deutlich von der
      Hälfte ab, liegt es an unserer Reihenfolge oder an der Oberfläche, und
      dann trägt KEINE Zahl, die wir veröffentlichen. Sāmi-Ras Assistent in
      #21: „Ich möchte das merken, bevor jemand anders es merkt."
    */
    const wahlA = ganzeZahlImBereich(koerper.wahl_a, 0, DURCHGAENGE);
    if (wahlA !== null) sauber.wahl_a = wahlA;

    if (typeof koerper.sprache === 'string' && SPRACHEN.has(koerper.sprache)) {
        sauber.sprache = koerper.sprache;
    }
    return sauber;
}

// ── STIMMUNGSMESSUNG ────────────────────────────────────────────────

/*
  Die Stufen der AUSGEWERTETEN Länge, nicht der Dateilänge. Das Werkzeug
  hört in ein Stück hinein; wie lang die Datei insgesamt ist, geht uns
  nichts an und stünde einer Wiedererkennung näher als einer Auswertung.
*/
const LAENGEN = new Set(['unter30', 'bis2min', 'bis10min', 'bis60min', 'laenger']);

/*
  Die Endung, nicht der Dateiname. `andere` fängt alles, was die Liste nicht
  kennt — damit eine unbekannte Endung die Messung nicht mitreißt.
*/
const ENDUNGEN = new Set(['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'aiff', 'andere']);

/** Der Bereich, in dem ein Kammerton überhaupt liegen kann. */
export const A4_MINDESTENS = 380.0;
export const A4_HOECHSTENS = 500.0;

/**
 * Prüft ein Messpaket gegen die Erlaubnisliste.
 *
 * `a4` und `sicherheit` tragen die Beobachtung; ohne beide kommt nichts
 * zurück. Alles andere beschreibt sie nur näher.
 *
 * @returns {object} nur erlaubte Felder; leer, wenn nichts trägt
 */
export function saeubereStimmung(koerper) {
    if (!koerper || typeof koerper !== 'object') return {};

    /*
      EINE Nachkommastelle bei `a4`, ZWEI bei `sicherheit` — so, wie #21 es
      beschreibt, und hier durchgesetzt statt erwartet.

      Warum überhaupt runden, wo doch der Absender schon rundet: Eine Zahl
      mit fünfzehn Nachkommastellen ist genauer, als die Messung je sein
      kann — und je genauer eine Zahl, desto eher unterscheidet sie eine
      Zeile von allen anderen. 432,1 teilen sich viele; 432,10437219 hat
      genau einer. Das ist derselbe Gedanke wie beim Weglassen des
      Dateinamens, nur eine Stelle später.
    */
    const a4 = zahlImBereich(koerper.a4, A4_MINDESTENS, A4_HOECHSTENS, 1);
    if (a4 === null) return {};

    const sicherheit = zahlImBereich(koerper.sicherheit, 0, 1, 2);
    if (sicherheit === null) return {};

    const sauber = { a4, sicherheit };

    /*
      `traegt` wird ÜBERNOMMEN, nicht nachgerechnet.

      Es wäre naheliegend, es aus `sicherheit >= 0.35` selbst zu bilden —
      eine Quelle je Sache. Hier ist es trotzdem falsch: `traegt` sagt
      nicht, ob die Messung gut war, sondern OB DER BESUCHER EINE ZAHL
      GESEHEN HAT. Die Schwelle dafür gehört der Oberfläche; verschiebt sie
      sie, verschiebt sich die Bedeutung mit, und eine hier nachgerechnete
      Fassung erzählte etwas anderes als der Bildschirm es tat.
    */
    if (typeof koerper.traegt === 'boolean') sauber.traegt = koerper.traegt;

    if (typeof koerper.laenge === 'string' && LAENGEN.has(koerper.laenge)) {
        sauber.laenge = koerper.laenge;
    }
    const kanaele = ganzeZahlImBereich(koerper.kanaele, 1, 2);
    if (kanaele !== null) sauber.kanaele = kanaele;

    if (typeof koerper.endung === 'string' && ENDUNGEN.has(koerper.endung)) {
        sauber.endung = koerper.endung;
    }
    if (typeof koerper.sprache === 'string' && SPRACHEN.has(koerper.sprache)) {
        sauber.sprache = koerper.sprache;
    }
    return sauber;
}

// ── DIE BEIDEN PRÜFER FÜR ZAHLEN ────────────────────────────────────

/*
  NUR `number`, keine Zeichenketten.

  `umfrage.mjs` lässt an derselben Stelle auch Zahlen zu und wandelt in
  Text, weil dort eine Werteliste dahintersteht, die alles Falsche abfängt.
  Hier steht keine Liste, sondern ein Bereich — und `Number("432,1")` ist
  `NaN`, `Number("")` ist `0`, `Number([432])` ist `432`. Wer Bereiche gegen
  umgewandelte Werte prüft, lässt genau die Fälle durch, die er sucht.

  `Number.isFinite` schließt `NaN` und beide Unendlichkeiten mit ein.
*/
function zahlImBereich(wert, von, bis, stellen) {
    if (typeof wert !== 'number' || !Number.isFinite(wert)) return null;
    if (wert < von || wert > bis) return null;
    const faktor = 10 ** stellen;
    return Math.round(wert * faktor) / faktor;
}

function ganzeZahlImBereich(wert, von, bis) {
    if (typeof wert !== 'number' || !Number.isInteger(wert)) return null;
    if (wert < von || wert > bis) return null;
    return wert;
}

// ── ABLEGEN ─────────────────────────────────────────────────────────

/*
  Partitionsschlüssel ist der TAG, Zeilenschlüssel ein Zufallswert —
  wörtlich dieselbe Bauart wie `legeAbgabeAb` in `umfrage.mjs`, und aus
  denselben zwei Gründen:

  Der Tag macht das Zählen zu einer Abfrage statt zu einem Durchgang durch
  alles, und das spätere Wegräumen zu einem Löschen ganzer Partitionen.

  Der Zufallswert ist von der nächsten Zeile nicht unterscheidbar. Ein
  laufender Zähler wäre ein gemeinsamer Faden — man sähe, welche Messung auf
  welche folgte, und damit wäre aus zwei unabhängigen Beobachtungen eine
  Sitzung geworden.
*/
function tagVon(jetzt) {
    return new Date(jetzt).toISOString().slice(0, 10);   // 'JJJJ-MM-TT', UTC
}

async function legeAb(speicher, tabelle, felder, jetzt) {
    await speicher.setze(tabelle, {
        /*
          Die Felder ZUERST, die beiden Schlüssel danach — dieselbe
          Reihenfolge und derselbe Grund wie in `umfrage.mjs`: Ein Aufrufer,
          der sich seine Partition aussuchen darf, schreibt in fremde
          Zeilen. Aus der Erlaubnisliste kann kein `partitionKey` kommen;
          die Reihenfolge sorgt dafür, dass es auch dann nicht könnte, wenn
          jemand die Liste eines Tages unglücklich erweitert.
        */
        ...felder,
        partitionKey: tagVon(jetzt),
        rowKey: randomUUID(),
    });
}

/** Legt eine abgeschlossene Hörtest-Runde als eigene Zeile ab. */
export async function legeHoertestAb(speicher, felder, jetzt = Date.now()) {
    await legeAb(speicher, TABELLE_HOERTEST, felder, jetzt);
}

/** Legt eine gelungene Stimmungsmessung als eigene Zeile ab. */
export async function legeStimmungAb(speicher, felder, jetzt = Date.now()) {
    await legeAb(speicher, TABELLE_STIMMUNG, felder, jetzt);
}
