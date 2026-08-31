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
  nehmen ein Feld namens `bezahlt` an" und „wir nehmen genau sechs Zeichenketten
  an". Ein Verbotsfilter muesste jeden Angriff kennen, den sich jemand
  ausdenkt; eine geschlossene Werteliste kennt nur, was die Oberflaeche
  ueberhaupt anbieten kann.

  Damit ist bei `heute`, `fehlt`, `bezahlt` und `sprache` gar keine Saeuberung
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
      GEFRAGT IST, WAS WAR — nicht, was waere.

      Bis Commit 76b5aeb hiess dieses Feld `preis` und fragte nach der
      Zahlungsbereitschaft. Saemi-Ra hat es umgestellt, und die Begruendung
      steht in seiner Frage selbst: „Erinnerungen sind belastbarer als
      Absichten." Auf „was waerst du bereit zu zahlen" antwortet jeder zu
      niedrig; was jemand einmal wirklich ausgegeben hat, ist ein Ereignis.

      Nebenwirkung, die den Ausschlag gab: Die alte Frage MUSSTE das
      kostenlose Konkurrenzprodukt beim Namen nennen, sonst haette sie zu
      hoch gemessen. Diese braucht das nicht.

      Die Stufen bleiben ZEICHENKETTEN, obwohl vier von sechs wie Betraege
      aussehen. Sie sind Stufen einer Erinnerung: `nie` und `abo` haben gar
      keinen Betrag, und wer aus `bis50` einen Mittelwert rechnet, erfindet
      eine Zahl, die niemand genannt hat.

      Die sechs Werte stehen woertlich in apps/index.html als data-wert.
      Wer dort einen aendert, aendert ihn HIER AUCH — sonst faellt die
      Antwort still durch und die Seite zeigt trotzdem „Danke".
    */
    bezahlt: new Set(['nie', 'bis15', 'bis50', 'bis120', 'ueber120', 'abo']),
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
        // Objekte und Felder kommen gar nicht erst herein: Ein
        // { toString: () => 'nie' } wuerde sonst zu 'nie' und stuende
        // damit in der Liste — die Erlaubnisliste liesse sich also mit
        // einem selbstgebauten Objekt aushebeln.
        //
        // Zahlen bleiben zugelassen, obwohl seit der Umstellung auf
        // `bezahlt` KEIN Feld mehr Zahlenwerte hat. Das ist bewusst
        // folgenlos: Die Werteliste dahinter entscheidet, und eine Zahl
        // steht in keiner. Die Zeile kostet nichts und traegt ein
        // spaeteres Feld, dessen Stufen Zahlen sind.
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

/*
  ── AUSWERTEN ────────────────────────────────────────────────────────

  Der Anlass steht in 432hz-radio#8: Es gab einen Weg, eine Antwort
  ABZUGEBEN, aber keinen, sie zu LESEN. Saemi-Ra hat zweimal nach einer
  Zwischenauswertung gefragt, weil die Preisentscheidung daran haengt —
  besonders an `bezahlt`, der Frage nach dem, was jemand einmal wirklich
  ausgegeben hat.

  WAS HERAUSKOMMT: Anzahl je Antwortmoeglichkeit. Nichts, was auf eine
  einzelne Abgabe zurueckfuehrt.

  DER FREITEXT WIRD NICHT AUSGEGEBEN, nur gezaehlt. Er ist das einzige
  Feld, in dem ein Mensch frei geschrieben hat — auch wenn `saeubereFreitext`
  Adressen und Geheimnisse entfernt, bleibt es der eine Ort, an dem etwas
  stehen koennte, das nur einer geschrieben haben kann. Wer ihn lesen will,
  soll das ausdruecklich entscheiden und nicht nebenbei bekommen. In #8 war
  ausdruecklich nur nach Anzahlen gefragt.

  WARUM TAGESWEISE und nicht in einem Durchgang: Der Partitionsschluessel
  IST der Tag. Eine Abfrage je Tag laeuft ueber genau eine Partition; ein
  Durchgang durch alles wuerde mit jeder Woche teurer, und zwar fuer immer.
  Der Kopf dieser Datei nennt das als den Grund, warum der Tag dort steht —
  hier wird er eingelöst.
*/

/** Wie viele Tage rückwärts eine Auswertung höchstens umfasst. */
export const AUSWERTUNG_TAGE_HOECHSTENS = 365;

/**
 * Zählt die Antworten der letzten `tage` Tage.
 *
 * @returns `{ tage, seit, bis, abgaben, mitVorschlag, fragen: { feld: { wert: n } } }`
 */
export async function werteAus(speicher, { tage = 30, jetzt = Date.now() } = {}) {
    const spanne = Math.min(Math.max(Math.trunc(tage) || 1, 1), AUSWERTUNG_TAGE_HOECHSTENS);

    // Jede Antwortmoeglichkeit steht von Anfang an mit 0 da. Eine Stufe, die
    // niemand gewaehlt hat, ist ein Ergebnis — sie einfach weglassen liesse
    // den Leser raten, ob sie fehlt oder ob sie nie vorkam.
    const fragen = {};
    for (const [feld, werte] of Object.entries(AUSWAHL)) {
        fragen[feld] = {};
        for (const wert of werte) fragen[feld][wert] = 0;
    }

    let abgaben = 0;
    let mitVorschlag = 0;

    for (let i = 0; i < spanne; i++) {
        const tag = tagVon(jetzt - i * 86_400_000);
        for await (const zeile of speicher.liste(TABELLE_UMFRAGE, tag)) {
            abgaben++;
            for (const feld of Object.keys(AUSWAHL)) {
                const wert = zeile[feld];
                // `hasOwn` und nicht `in`: Sonst zaehlte ein Feld namens
                // 'toString' auf dem Prototyp mit.
                if (typeof wert === 'string' && Object.hasOwn(fragen[feld], wert)) {
                    fragen[feld][wert]++;
                }
            }
            if (typeof zeile.vorschlag === 'string' && zeile.vorschlag) mitVorschlag++;
        }
    }

    return {
        tage: spanne,
        seit: tagVon(jetzt - (spanne - 1) * 86_400_000),
        bis: tagVon(jetzt),
        abgaben,
        mitVorschlag,
        fragen,
    };
}
