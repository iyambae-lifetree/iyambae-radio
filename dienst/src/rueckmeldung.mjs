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

// ── AUSWERTEN ───────────────────────────────────────────────────────

/*
  Der Anlass ist derselbe wie bei der Umfrage, nur diesmal vorher benannt:
  Es gab dort einen Weg, etwas ABZUGEBEN, und lange keinen, es zu LESEN
  (432hz-radio#8). Zwei Tabellen, die still vor sich hin sammeln, sind
  dasselbe wie zwei Werkzeuge, die ihr Ergebnis wegwerfen — nur langsamer.

  WAS HERAUSKOMMT: Anzahlen. Nichts, was auf eine einzelne Zeile
  zurückführt.

  WARUM TAGESWEISE und nicht in einem Durchgang: Der Partitionsschlüssel IST
  der Tag. Eine Abfrage je Tag läuft über genau eine Partition; ein Durchgang
  durch alles würde mit jeder Woche teurer, und zwar für immer. Wörtlich
  dieselbe Überlegung wie in `umfrage.mjs`.
*/

/** Wie viele Tage rückwärts eine Auswertung höchstens umfasst. */
export const AUSWERTUNG_TAGE_HOECHSTENS = 365;

function spanneVon(tage) {
    return Math.min(Math.max(Math.trunc(tage) || 1, 1), AUSWERTUNG_TAGE_HOECHSTENS);
}

/*
  Die Wahrscheinlichkeit, ALLEIN DURCH RATEN mindestens so gut abzuschneiden.

  Sie steht hier, weil ohne sie die andere Zahl gefährlich ist: „54 % richtig"
  liest sich wie ein Befund, ist aber bei fünfzig Durchgängen nichts. Wer eine
  Trefferquote veröffentlicht, ohne danebenzuschreiben, wie oft der Zufall
  dasselbe hergibt, behauptet mehr, als er gemessen hat — und genau davor
  will dieser Vorgang uns bewahren.

  Einseitig und exakt (Summe der Binomialterme ab `treffer`), nicht
  angenähert: Die Zahlen sind klein genug, dass eine Näherung nichts spart
  und an den Rändern falsch liegt. Bei p = 0,5 ist der Term C(n,k) / 2^n;
  gerechnet wird über Logarithmen, damit C(n,k) bei großen n nicht überläuft.

  KEINE Aussage über „Signifikanz". Hier steht eine Wahrscheinlichkeit, keine
  Schwelle — wer eine Grenze ziehen will, zieht sie selbst und schreibt dazu,
  wo.
*/
export function zufallsWahrscheinlichkeit(treffer, durchgaenge) {
    if (!Number.isInteger(treffer) || !Number.isInteger(durchgaenge)) return null;
    if (durchgaenge <= 0 || treffer < 0 || treffer > durchgaenge) return null;

    const lnFakultaet = (k) => {
        let summe = 0;
        for (let i = 2; i <= k; i++) summe += Math.log(i);
        return summe;
    };
    const lnN = lnFakultaet(durchgaenge);
    let p = 0;
    for (let k = treffer; k <= durchgaenge; k++) {
        const lnC = lnN - lnFakultaet(k) - lnFakultaet(durchgaenge - k);
        p += Math.exp(lnC - durchgaenge * Math.LN2);
    }
    return Math.min(1, Math.round(p * 10000) / 10000);
}

/**
 * Zählt die Hörtest-Runden der letzten `tage` Tage, je Runde getrennt.
 *
 * `432-440` und `432-433` sind zwei verschiedene Fragen und dürfen nie in
 * einer Zahl zusammenfallen — der weite Abstand ist die leichte Runde, der
 * enge die eigentliche Probe.
 */
export async function werteHoertestAus(speicher, { tage = 30, jetzt = Date.now() } = {}) {
    const spanne = spanneVon(tage);

    /*
      Jede Runde und jede Trefferzahl steht von Anfang an mit 0 da — dieselbe
      Regel wie bei der Umfrage: Eine Stufe, die niemand erreicht hat, ist
      ein Ergebnis. Sie wegzulassen ließe den Leser raten, ob sie fehlt oder
      ob sie nie vorkam.
    */
    const jeRunde = {};
    for (const runde of RUNDEN) {
        const jeTreffer = {};
        for (let k = 0; k <= DURCHGAENGE; k++) jeTreffer[k] = 0;
        jeRunde[runde] = {
            runden: 0, treffer: 0, durchgaenge: 0,
            wahl_a: 0, wahl_a_von: 0, je_treffer: jeTreffer,
        };
    }

    for (let i = 0; i < spanne; i++) {
        const tag = tagVon(jetzt - i * 86_400_000);
        for await (const zeile of speicher.liste(TABELLE_HOERTEST, tag)) {
            const eintrag = jeRunde[zeile.runde];
            if (!eintrag) continue;
            const treffer = zeile.treffer;
            if (!Number.isInteger(treffer) || treffer < 0 || treffer > DURCHGAENGE) continue;

            eintrag.runden++;
            eintrag.treffer += treffer;
            eintrag.durchgaenge += DURCHGAENGE;
            eintrag.je_treffer[treffer]++;
            if (Number.isInteger(zeile.wahl_a)) {
                eintrag.wahl_a += zeile.wahl_a;
                eintrag.wahl_a_von += DURCHGAENGE;
            }
        }
    }

    for (const eintrag of Object.values(jeRunde)) {
        eintrag.anteil = eintrag.durchgaenge
            ? Math.round(eintrag.treffer / eintrag.durchgaenge * 1000) / 1000 : null;
        /*
          Der Anteil, mit dem der ERSTE Knopf gewählt wurde. Fällt er
          deutlich von 0,5 ab, liegt es an unserer Reihenfolge oder an der
          Oberfläche — und dann trägt KEINE Zahl aus diesem Test. Deshalb
          steht er gleichberechtigt neben der Trefferquote und nicht im
          Kleingedruckten.
        */
        eintrag.wahl_a_anteil = eintrag.wahl_a_von
            ? Math.round(eintrag.wahl_a / eintrag.wahl_a_von * 1000) / 1000 : null;
        eintrag.zufall = zufallsWahrscheinlichkeit(eintrag.treffer, eintrag.durchgaenge);
    }

    return {
        tage: spanne,
        seit: tagVon(jetzt - (spanne - 1) * 86_400_000),
        bis: tagVon(jetzt),
        je_runde: jeRunde,
    };
}

/**
 * Zählt die Stimmungsmessungen der letzten `tage` Tage.
 *
 * `je_hz` zählt auf GANZE Hertz gerundet. Die abgelegte Zahl hat eine
 * Nachkommastelle; sie hier auszugeben hieße, über tausend Fächer für ein
 * paar hundert Messungen zu öffnen — und je feiner das Fach, desto eher
 * sitzt genau einer darin. Ganze Hertz beantworten die Frage („worauf ist
 * die Sammlung gestimmt") genauso gut.
 */
export async function werteStimmungAus(speicher, { tage = 30, jetzt = Date.now() } = {}) {
    const spanne = spanneVon(tage);

    const zaehle = (werte) => Object.fromEntries([...werte].map((w) => [w, 0]));
    const ergebnis = {
        messungen: 0,
        traegt: 0,
        traegt_nicht: 0,
        je_hz: {},
        je_laenge: zaehle(LAENGEN),
        je_endung: zaehle(ENDUNGEN),
        je_kanaele: { 1: 0, 2: 0 },
        je_sprache: zaehle(SPRACHEN),
    };
    let sicherheitSumme = 0;

    for (let i = 0; i < spanne; i++) {
        const tag = tagVon(jetzt - i * 86_400_000);
        for await (const zeile of speicher.liste(TABELLE_STIMMUNG, tag)) {
            const a4 = zeile.a4;
            if (typeof a4 !== 'number' || !Number.isFinite(a4)) continue;

            ergebnis.messungen++;
            if (typeof zeile.sicherheit === 'number') sicherheitSumme += zeile.sicherheit;

            /*
              IN DIE VERTEILUNG GEHT NUR, WAS TRÄGT. Eine Messung unter der
              Schwelle ist eine Beobachtung — dass jemand es versucht hat —,
              aber keine Aussage über einen Kammerton. Beides in dasselbe
              Fach zu werfen hieße, Rauschen als Verteilung auszugeben.
              Gezählt wird sie trotzdem, unter `traegt_nicht`: Wie oft die
              Messung nichts hergab, ist selbst eine Zahl, die wir brauchen.
            */
            if (zeile.traegt === false) {
                ergebnis.traegt_nicht++;
            } else {
                ergebnis.traegt++;
                const hz = String(Math.round(a4));
                ergebnis.je_hz[hz] = (ergebnis.je_hz[hz] ?? 0) + 1;
            }

            for (const [feld, fach] of [
                ['laenge', ergebnis.je_laenge],
                ['endung', ergebnis.je_endung],
                ['sprache', ergebnis.je_sprache],
            ]) {
                const wert = zeile[feld];
                // `hasOwn` und nicht `in`: Sonst zählte ein Feld namens
                // 'toString' auf dem Prototyp mit — wie in `umfrage.mjs`.
                if (typeof wert === 'string' && Object.hasOwn(fach, wert)) fach[wert]++;
            }
            if (zeile.kanaele === 1 || zeile.kanaele === 2) ergebnis.je_kanaele[zeile.kanaele]++;
        }
    }

    return {
        tage: spanne,
        seit: tagVon(jetzt - (spanne - 1) * 86_400_000),
        bis: tagVon(jetzt),
        ...ergebnis,
        sicherheit_mittel: ergebnis.messungen
            ? Math.round(sicherheitSumme / ergebnis.messungen * 100) / 100 : null,
    };
}
