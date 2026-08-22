/*
  Die Umfrage — vier Fragen, keine Anmeldung, keine Kennung.

  Die Oberflaeche steht auf apps.iyambae.fm und verspricht dort woertlich:
  „keine Anmeldung, keine Adresse — nichts davon laesst sich dir zuordnen".
  Diese Datei ist die Stelle, an der dieses Versprechen entweder gehalten
  oder gebrochen wird. Alles Weitere hier folgt daraus.

  ── Warum kein Konto verlangt wird ──────────────────────────────────

  Eine Umfrage hinter einer Anmeldung misst die Angemeldeten. Gefragt wird
  aber nach einem Preis fuer ein Werkzeug, das es noch nicht gibt — die
  Antwort, auf die es ankommt, kommt von jemandem, der hier noch nie ein
  Konto hatte und vielleicht nie eines will.

  DER PREIS DAFUER, EHRLICH: Der Weg ist offen, und damit ist die Drossel in
  server.mjs die einzige Verteidigung. Sie steht dort neben den anderen
  Wegen, nicht hier.

  ── Erlaubnisliste, und zwar zweimal ────────────────────────────────

  Nicht nur die FELDNAMEN sind abschliessend aufgezaehlt, sondern bei drei
  von vier Fragen auch die WERTE. Das ist der Unterschied zwischen „wir
  nehmen ein Feld namens `preis` an" und „wir nehmen genau fuenf Zeichenketten
  an". Ein Verbotsfilter muesste jeden Angriff kennen, den sich jemand
  ausdenkt; eine geschlossene Werteliste kennt nur, was die Oberflaeche
  ueberhaupt anbieten kann.

  Damit ist bei `heute`, `fehlt`, `preis` und `sprache` gar keine Saeuberung
  noetig — was nicht in der Liste steht, wird nicht gekuerzt, nicht
  entschaerft, nicht geschwaerzt, sondern es entsteht nie eine Zeile daraus.

  Genau dieselbe Bauart hat `assets/lib/messung.mjs` mit ihren Ereignisarten
  und `src/protokoll.mjs` mit seinen Protokollfeldern, und beide begruenden
  es an Ort und Stelle.

  ── Das eine offene Feld ────────────────────────────────────────────

  `vorschlag` ist Freitext und kann per Definition keine Werteliste haben.
  Es ist deshalb das einzige Feld mit einer Saeuberung, und die steht unten
  bei `saeubereFreitext` samt Begruendung, was sie faengt und was nicht.

  ── Was NICHT gespeichert wird ──────────────────────────────────────

  Keine Kennung, kein Plaetzchen, keine Sitzung, keine Adresse, kein Netz,
  kein Abdruck davon, kein Browserkennzeichen. Die Zeile traegt einen
  Zufallsschluessel und sonst nur die Antworten.

  Der Grund steht in messung.mjs: Dort lagen Mess- und Zugriffszeilen in
  derselben Tabelle mit demselben Adressfeld und waren damit verbindbar. Das
  war der Fehler, den wir entschaerft haben, und er darf hier nicht neu
  entstehen.

  EHRLICH DAZUGESAGT, weil es sonst niemand nachliest: Table Storage setzt
  jeder Zeile von sich aus ein `Timestamp`. Das laesst sich nicht
  abschalten. Wer gleichzeitig das Zugriffsprotokoll von nginx hat, koennte
  bei sehr wenig Verkehr eine Antwort einem Zugriff zeitlich zuordnen. Was
  dagegen steht, ist die Aufbewahrungsfrist des Zugriffsprotokolls, nicht
  diese Datei — und dass dort ein Netz steht, keine Adresse.
*/

import { randomUUID } from 'node:crypto';
import { TABELLE_UMFRAGE } from './speicher.mjs';

/*
  Die vier Fragen mit ihren Antworten — abschliessend.

  Die Werte sind woertlich die `data-wert` aus `apps/index.html` im Zweig
  `plattenspieler-und-logo`. Wer die Oberflaeche um eine Antwort erweitert,
  traegt sie HIER ein, sonst faellt sie still weg. Still und nicht laut ist
  Absicht: Eine Umfrage, die 500 antwortet, weil jemand einen Knopf
  umbenannt hat, verliert die Antworten aller anderen mit.
*/
const AUSWAHL = {
    heute: new Set(['gar-nicht', 'handy', 'dateien', 'browser', 'bastelei', 'youtube']),
    fehlt: new Set(['handy-systemton', 'sammlung', 'andere-stimmungen', 'radio', 'qualitaet', 'einfacher']),
    /*
      Die Preisstufen bleiben ZEICHENKETTEN, obwohl sie wie Zahlen aussehen.
      Sie sind Stufen einer Skala, keine Betraege: „0" heisst nicht „null
      Euro wert", sondern „mir reicht das kostenlose mit Treiber". Wer sie
      als Zahl ablegt, rechnet spaeter einen Mittelwert daraus, und der
      waere sinnlos.
    */
    preis: new Set(['0', '19', '39', '69', '99']),
    // Die sieben Sprachfassungen aus assets/lib/sprache.mjs. Sie sagt, in
    // welcher Fassung jemand gelesen hat, nicht wer er ist.
    sprache: new Set(['de', 'en', 'fr', 'es', 'it', 'ja', 'ar']),
};

/** Was der Freitext hoechstens behaelt — dieselbe Zahl wie `maxlength` im Formular. */
export const FREITEXT_HOECHSTENS = 600;

/*
  Bevor ueberhaupt gesucht wird, wird hart abgeschnitten.

  Ein Rumpf bis 32 KiB kommt durch `liesKoerper`; darin koennte ein Freitext
  von 30.000 Zeichen stecken. Den erst zu durchsuchen und dann auf 600 zu
  kuerzen waere Arbeit fuer nichts. 4.000 ist grosszuegig ueber dem, was das
  Formular je erzeugt, und klein genug, dass die Suche darin nichts kostet.
*/
const VOR_DER_PRUEFUNG_HOECHSTENS = 4_000;

/*
  Was aus dem Freitext herausgenommen wird, und warum genau das.

  1. ADRESSEN. Jemand schreibt „schreibt mir an ...", weil er hilfsbereit
     ist. Damit waere die Zeile personenbezogen — und das Versprechen der
     Oberflaeche gebrochen, ohne dass er es wollte. Es wird also nicht
     abgelehnt, sondern geschwaerzt: Der Satz drumherum ist das Wertvolle.
     Dasselbe Muster und derselbe Ersatztext wie in protokoll.mjs; die
     beiden Dateien haben verschiedene Aufgaben und je einen eigenen Riegel,
     absichtlich, damit keine an der anderen haengt.

  2. LANGE ZEICHENFOLGEN MIT ZIFFERN. Ein Passwort, ein Schluessel, eine
     Sitzungskennung — Menschen fuegen so etwas versehentlich in Textfelder
     ein. Warum die ZIFFER Bedingung ist und nicht bloss die Laenge:
     „Donaudampfschifffahrtsgesellschaft" hat 34 Buchstaben und ist ein
     deutsches Wort. Ein Wort ohne Ziffern zu schwaerzen macht die Antwort
     unlesbar, und eine unlesbare Antwort ist derselbe Verlust wie eine
     verworfene.

  3. SPITZE KLAMMERN. Das Feld ist Prosa; es braucht sie nie. Richtig waere
     im Grundsatz, beim AUSGEBEN zu maskieren — nur ist hier bekannt, wo
     ausgegeben wird: in einer Auswertung, die jemand schnell
     zusammensteckt, aus einer Tabelle in eine Seite. Wer `<script>` gar
     nicht erst ablegt, kann es dort nicht vergessen. Der Preis ist ein
     Zeichen, das in einem Vorschlagssatz nichts zu sagen hat.

  4. STEUERZEICHEN und mehrfacher Leerraum. Ein Nullbyte oder ein
     Zeilenumbruchgewitter macht spaeter jede Anzeige kaputt.

  WAS ES NICHT FAENGT, und das gehoert dazugesagt: ein kurzes Passwort wie
  `hunter2` ist von einem Wort nicht zu unterscheiden. Dagegen hilft keine
  Regel, sondern nur, dass niemand nach einem Passwort fragt — und hier
  fragt niemand danach.
*/
const SIEHT_AUS_WIE_ADRESSE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const SIEHT_AUS_WIE_GEHEIMNIS = /(?=\S{20,})(?=\S*[0-9])(?=\S*[A-Za-z])\S{20,}/g;
const STEUERZEICHEN = /[\u0000-\u001F\u007F]/g;

export function saeubereFreitext(wert) {
    if (typeof wert !== 'string') return null;

    let text = wert.slice(0, VOR_DER_PRUEFUNG_HOECHSTENS);
    text = text.replace(STEUERZEICHEN, ' ');
    text = text.replace(SIEHT_AUS_WIE_ADRESSE, '<entfernt:adresse>');
    text = text.replace(SIEHT_AUS_WIE_GEHEIMNIS, '<entfernt:geheimnis>');
    /*
      Erst JETZT die Klammern weg. Andersherum haetten die beiden
      Ersatztexte oben ihre eigenen Klammern wieder verloren, und im
      Ergebnis stuende `entfernt:adresse` wie ein Wort mitten im Satz.
    */
    text = text.replaceAll('<', '').replaceAll('>', '');
    text = text.replace(/\s+/g, ' ').trim();

    if (!text) return null;
    return text.slice(0, FREITEXT_HOECHSTENS);
}

/**
 * Aus dem eingegangenen Rumpf wird die Zeile, die gespeichert werden darf.
 *
 * Es wird NICHT gefiltert, was verboten ist, sondern eingesammelt, was
 * erlaubt ist. Der Unterschied ist der ganze Sinn: Der Rumpf kommt aus dem
 * Netz, kann jedes Feld tragen, das sich jemand ausdenkt, und diese
 * Funktion sieht die meisten davon nie an.
 *
 * Alle Fragen sind freiwillig. Wer uebersprungen hat, schickt das Feld gar
 * nicht mit — deshalb ist ein fehlendes Feld kein Fehler, sondern die
 * haeufigste Antwort auf Frage vier.
 *
 * @returns {object} nur erlaubte Felder mit erlaubten Werten; kann leer sein
 */
export function saeubereAbgabe(koerper) {
    if (!koerper || typeof koerper !== 'object') return {};
    const sauber = {};

    for (const [feld, erlaubteWerte] of Object.entries(AUSWAHL)) {
        const wert = koerper[feld];
        // String() und nicht typeof-Pruefung: Kommt eine Zahl 99 statt der
        // Zeichenkette '99', ist das dieselbe Antwort. Kommt ein Objekt,
        // wird daraus '[object Object]' und steht in keiner Liste.
        if (typeof wert !== 'string' && typeof wert !== 'number') continue;
        const text = String(wert);
        if (!erlaubteWerte.has(text)) continue;
        sauber[feld] = text;
    }

    const vorschlag = saeubereFreitext(koerper.vorschlag);
    if (vorschlag) sauber.vorschlag = vorschlag;

    return sauber;
}

/*
  Der Partitionsschluessel ist der TAG, der Zeilenschluessel ein Zufallswert.

  WARUM DER TAG: Er macht das Zaehlen zu einer Abfrage statt zu einem
  Durchgang durch alles („wie viele Antworten kamen seit dem Start"), und er
  macht das spaetere Wegraeumen zu einem Loeschen ganzer Partitionen. Er
  verraet nichts, was nicht ohnehin dastuende — Table Storage schreibt sein
  `Timestamp` von selbst, und zwar auf die Sekunde genau.

  WARUM DER ZEILENSCHLUESSEL ZUFAELLIG IST und nicht laufend oder aus der
  Zeit gebaut: Ein laufender Zaehler waere ein gemeinsamer Faden zwischen
  Zeilen — man saehe, welche Antwort auf welche folgte. Ein Zufallswert ist
  von der naechsten Zeile nicht unterscheidbar, und genau das soll er sein.
*/
function tagVon(jetzt) {
    return new Date(jetzt).toISOString().slice(0, 10);   // 'JJJJ-MM-TT', UTC
}

/**
 * Legt eine Antwort als eigene Zeile ab. Kein Lesen davor, kein ETag:
 * Es gibt nichts zu verschmelzen, weil keine zwei Abgaben dieselbe Zeile
 * treffen koennen — der Zeilenschluessel ist neu gezogen.
 */
export async function legeAbgabeAb(speicher, antworten, jetzt = Date.now()) {
    await speicher.setze(TABELLE_UMFRAGE, {
        /*
          Die Antworten ZUERST, die beiden Schluessel danach. Aus der
          Erlaubnisliste kann kein `partitionKey` kommen — aber die
          Reihenfolge sorgt dafuer, dass es auch dann nicht koennte, wenn
          jemand die Liste eines Tages um ein unglueckliches Feld erweitert.
          Ein Aufrufer, der sich die Partition aussuchen darf, schreibt in
          fremde Zeilen.
        */
        ...antworten,
        partitionKey: tagVon(jetzt),
        rowKey: randomUUID(),
    });
}
