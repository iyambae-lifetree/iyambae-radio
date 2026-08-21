/*
  Protokoll — eine JSON-Zeile je Ereignis nach stdout.

  Von dort holt Container Apps sie ab und legt sie in Log Analytics, genau
  wie es deploy/nginx.conf mit dem Zugriffsprotokoll schon tut. Es gibt
  keinen zweiten Dienst, keinen Dritten, keine Uebermittlung.

  DIE REGEL, UND SIE IST DER GANZE SINN DIESER DATEI: Ein Protokoll wird
  dreissig Tage aufbewahrt, von Menschen gelesen und in Abfragen exportiert.
  Was hier hineingerat, ist damit dauerhaft und weitergereicht. Deshalb
  entscheidet nicht der Aufrufer, was geschrieben wird, sondern diese Datei:
  Alles, was nicht ausdruecklich erlaubt ist, faellt weg.

  Ein Verbotsfilter waere die falsche Richtung. Er muesste jeden kuenftigen
  Feldnamen kennen, und der erste, den jemand vergisst, steht dann dreissig
  Tage lang im Protokoll. Eine Erlaubnisliste vergisst nichts — sie laesst im
  Zweifel zu wenig durch, und das ist der harmlose Fehler.

  NIEMALS im Protokoll: Adresse, Passwort, Einmalcode, Sitzungsschluessel,
  Marke, volle IP, welcher Sender gehoert wird. Erlaubt: Ereignisart,
  Kontokennung, Dauer, Ergebnis, Anzahlen.
*/

/*
  Die Erlaubnisliste. Wer ein Feld braucht, das hier fehlt, traegt es hier
  ein — und muss dabei durch den Kommentar oben.
*/
const ERLAUBTE_FELDER = new Set([
    'art',          // was passiert ist, z.B. 'anmeldung.code'
    'ergebnis',     // 'ok' | 'abgelehnt' | 'fehler' | 'gedrosselt' | 'ueberlastet'
    'grund',        // maschinenlesbarer Kurzgrund, siehe README
    'dauer',        // Millisekunden
    'status',       // HTTP-Status der Antwort
    'verfahren',    // GET/POST/DELETE
    'pfad',         // NUR die Route aus der Weiche, nie die rohe Adresse
    'konto',        // kontoId — kein Personenbezug ohne die Kontotabelle
    'anzahl',       // Eintraege, Zeilen, Versuche
    'wartend',      // Laenge einer Warteschlange
    'laufend',      // belegte Plaetze eines Semaphors
    'versuch',      // Nummer eines Wiederholungsversuchs
    'stand',        // Versionszaehler der Merkliste
    'achse',        // welche Drosselachse gegriffen hat: 'adresse'|'netz'|'global'
    'dienst',       // Fremddienst, der ausgefallen ist: 'hibp'|'acs'|'tabellen'
    // Welcher Anmeldeanbieter, nicht WER sich angemeldet hat. Ohne diese
    // Zeile verwarf der Filter das Feld still, und in der Stoerungssuche
    // waere nicht zu sehen, ob Google oder Apple klemmt.
    'anbieter',     // 'google' | 'apple'
]);

/*
  Zweiter Riegel hinter der Erlaubnisliste.

  Ein erlaubtes Feld kann trotzdem den falschen Wert tragen — `grund` mit
  einer Adresse darin ist schnell geschrieben. Die beiden Muster fangen die
  zwei Faelle ab, die hier ueberhaupt vorkommen koennen: eine Mailadresse
  und eine lange Zufallszeichenkette, wie sie Sitzungswerte und Marken sind.

  Das ist Notwehr, kein Ersatz fuer Nachdenken beim Aufrufen.
*/
const SIEHT_AUS_WIE_ADRESSE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/*
  Ein langer Block aus Base64url-Zeichen ist im Zweifel ein Geheimnis —
  ausser er hat die Form eines Namens.

  Die Ausnahme fuer Namen ist noetig und war eine gemessene Ueberraschung:
  Ohne sie wurde `speicher_nur_im_arbeitsspeicher` als Geheimnis geschwaerzt,
  und die Startwarnung sagte nicht mehr, wovor sie warnt. Ein Filter, der die
  Meldung unlesbar macht, wird beim naechsten Mal abgeschaltet — und dann
  fehlt er da, wo er zaehlt.

  Als Name gilt nur, was MINDESTENS EINEN Trenner hat. Ein durchgehender
  Block aus 32 Kleinbuchstaben und Ziffern ohne Trenner ist kein Name,
  sondern ein Hexabdruck, und der wird geschwaerzt.
*/
const NAME = /^[a-z0-9]+([_-][a-z0-9]+)+$/;

function siehtAusWieGeheimnis(text) {
    for (const stueck of text.split(/[^A-Za-z0-9_-]+/)) {
        if (stueck.length < 24) continue;
        if (NAME.test(stueck)) continue;
        return true;
    }
    return false;
}

function saeubereWert(wert) {
    if (typeof wert === 'number') return Number.isFinite(wert) ? wert : null;
    if (typeof wert === 'boolean') return wert;
    if (wert === null || wert === undefined) return null;
    const text = String(wert);
    if (SIEHT_AUS_WIE_ADRESSE.test(text)) return '<entfernt:adresse>';
    if (siehtAusWieGeheimnis(text)) return '<entfernt:geheimnis>';
    return text.slice(0, 200);
}

/*
  Die Kontokennung ist ein Zufallswert und faellt damit unter
  SIEHT_AUS_WIE_GEHEIMNIS. Sie soll aber ins Protokoll, sonst laesst sich
  eine Beschwerde nicht nachvollziehen. Gekuerzt auf zwoelf Zeichen: das
  reicht, um zwei Zeilen derselben Sitzung zusammenzubringen, und es ist
  ohne die Kontotabelle nichts wert.
*/
function kuerzeKonto(id) {
    if (!id) return null;
    return String(id).replaceAll('-', '').slice(0, 12);
}

let schreiber = (zeile) => process.stdout.write(zeile + '\n');

/** Nur fuer Tests: die Ausgabe umlenken. Gibt die vorige Senke zurueck. */
export function lenkeAusgabe(neu) {
    const alt = schreiber;
    schreiber = neu ?? ((zeile) => process.stdout.write(zeile + '\n'));
    return alt;
}

/**
 * Eine Zeile schreiben. Alles ausserhalb der Erlaubnisliste faellt weg,
 * ohne Fehler und ohne Hinweis — ein Protokollaufruf darf nie eine Anfrage
 * zum Scheitern bringen.
 */
export function protokolliere(felder = {}) {
    const zeile = { zeit: new Date().toISOString() };
    for (const [name, wert] of Object.entries(felder)) {
        if (!ERLAUBTE_FELDER.has(name)) continue;
        if (wert === undefined) continue;
        zeile[name] = name === 'konto' ? kuerzeKonto(wert) : saeubereWert(wert);
    }
    try {
        schreiber(JSON.stringify(zeile));
    } catch {
        // Ein kaputtes Protokoll ist ein Aergernis, ein abgestuerzter
        // Anmeldedienst ist ein Ausfall. Hier wird geschluckt.
    }
}

/**
 * Ein Fehler aus dem Inneren — OHNE Stapelabbild.
 *
 * In einem Stapelabbild stehen Dateipfade, manchmal Argumentwerte, und bei
 * den Azure-Bibliotheken gelegentlich ganze Anfragekoerper. Was gebraucht
 * wird, um einen Fehler einzuordnen, ist die Art, nicht der Weg dorthin.
 */
export function protokolliereFehler(art, fehler, zusatz = {}) {
    protokolliere({
        art,
        ergebnis: 'fehler',
        grund: fehler?.art ?? fehler?.code ?? fehler?.name ?? 'unbekannt',
        ...zusatz,
    });
}
