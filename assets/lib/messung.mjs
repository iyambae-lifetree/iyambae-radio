// ═══════════════════════════════════════════════════════════════════
// Reichweitenmessung — ohne Plätzchen, ohne Kennung, ohne Banner
//
// WARUM ES HIER KEINEN EINWILLIGUNGSBANNER GIBT
//
// § 25 Abs. 1 TDDDG verlangt eine Einwilligung für das SPEICHERN von
// Informationen auf dem Endgerät und für den ZUGRIFF auf dort bereits
// gespeicherte Informationen. Beides passiert hier nicht: Diese Messung setzt
// kein Plätzchen, liest keines, legt nichts in localStorage ab und liest
// nichts daraus. Sie schickt eine Zeile an den eigenen Server und vergisst
// sie dann.
//
// Damit greift § 25 nicht, und es bleibt die DSGVO. Verarbeitet wird: was
// passiert ist, wann, und in welcher Sprachfassung. Sonst nichts — die
// Protokollzeile hat kein Adressfeld, auch kein gekürztes.
// Rechtsgrundlage ist das berechtigte Interesse — zu wissen, ob die Seite
// benutzt wird und ob die Sender überhaupt laufen. Diese Abwägung geht
// deutlich auf, gerade WEIL auf der anderen Seite fast nichts liegt; der
// Abschalter unten ist dabei kein Zierrat, sondern der Grund, warum sie
// aufgeht (Art. 21 DSGVO).
//
// Die DSK-Orientierungshilfe „Digitale Dienste" (Nov. 2024) warnt in Rz. 116
// ausdrücklich davor, Banner dort zu zeigen, wo keine Einwilligung nötig ist:
// Sie gewöhnen Menschen daran, wegzuklicken, und entwerten die Einwilligung
// da, wo sie wirklich zählt.
//
// Stattdessen: ein Einstellungsbereich im Fuß. Wer nicht gezählt werden will,
// schaltet es dort ab — und DIESE Entscheidung wird gespeichert, weil sie
// sonst bei jedem Besuch verloren ginge. Das ist nach § 25 Abs. 2 Nr. 2
// zulässig; die Speicherung der Ablehnung ist für den gewünschten Dienst
// unbedingt erforderlich.
//
// WAS NICHT GEMESSEN WIRD, und das ist der wichtigere Teil der Liste:
//
//   Wer etwas hört. Es gibt keine Kennung, kein Plätzchen, keine Sitzung.
//   Wie lange jemand hört. Nur der Start wird gemeldet, nie das Ende.
//   Wonach gesucht wurde. Gezählt wird, DASS gesucht wurde — nie das Wort.
//   Der Text einer Fehlermeldung. Beim Abspielfehler geht die NUMMER hinaus
//   (MediaError.code, 1 bis 4 aus dem Standard), nie el.error.message — die
//   ist herstellerabhängiger Freitext aus fremder Quelle.
//   Die Adresse. Überhaupt keine, auch keine gekürzte: Mess- und
//   Zugriffszeilen liegen in derselben Tabelle, ein gemeinsames Adressfeld
//   hätte beide verbindbar gemacht (siehe deploy/nginx.conf).
// ═══════════════════════════════════════════════════════════════════

import { sprache } from './sprache.mjs';

const WEG = '/messung';
const SCHLUESSEL = 'hz_messung';

/*
 Die erlaubten Ereignisarten — abschliessend.

 Eine Erlaubnisliste statt einer Verbotsliste: Wer spaeter etwas Neues messen
 will, muss es hier eintragen und kommt dabei an diesem Kommentar vorbei.
 Genau dieselbe Bauart hat protokoll.mjs im Anmeldedienst.
*/
const ARTEN = new Set(['start', 'filter', 'regal', 'suche', 'sprache',
                       'installiert', 'abspielfehler', 'stockt', 'teilen-sender',
                       'teilen', 'teilen-uebernommen']);

/*
 Die drei Zweige von `abspielfehler` — ebenfalls abschliessend.

 Warum eine zweite Liste und nicht einfach eine Zeichenkette: Diese Werte
 landen als Spalte in einer Auswertung. Waere sie offen, entschiede jeder
 spaetere Aufrufer mit, welche Kategorien es gibt — und niemand merkte es,
 bis die Zahlen nicht mehr zusammenpassen.
*/
const ZWEIGE = new Set(['analyse-gescheitert', 'ohne-analyse-gelungen',
                        'ganz-gescheitert']);

let erlaubt = null;   // null = noch nicht gelesen

function liesWahl() {
  if (erlaubt !== null) return erlaubt;
  try {
    erlaubt = localStorage.getItem(SCHLUESSEL) !== 'nein';
  } catch {
    // Kein Speicher, kein Widerspruch bekannt — dann wird gemessen.
    erlaubt = true;
  }
  return erlaubt;
}

export function messungLaeuft() { return liesWahl(); }

export function setzeMessung(an) {
  erlaubt = Boolean(an);
  try {
    // Nur die ABLEHNUNG wird gespeichert. Wer zustimmt, hinterlaesst nichts —
    // ein Eintrag "ja" waere eine Spur ohne Zweck.
    if (erlaubt) localStorage.removeItem(SCHLUESSEL);
    else localStorage.setItem(SCHLUESSEL, 'nein');
  } catch {}
  return erlaubt;
}

/*
 Senden, ohne den Start zu behindern.

 sendBeacon reiht die Anfrage beim Browser ein und kehrt sofort zurueck; sie
 laeuft auch dann noch, wenn die Seite in derselben Sekunde geschlossen wird.
 Genau das ist beim Ereignis "start" der Fall: Wer einen Sender antippt und
 sofort den Reiter wechselt, soll trotzdem gezaehlt werden — und das Antippen
 darf keine Millisekunde auf eine Netzantwort warten.

 Faellt sendBeacon aus, wird nichts nachgeholt. Eine verlorene Zeile ist
 belanglos; ein hakender Abspielknopf waere es nicht.
*/
export function miss(was, felder = {}) {
  if (!ARTEN.has(was) || !liesWahl()) return false;
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;

  /*
     Die Sprache haengt an JEDEM Ereignis, und sie kommt aus dem Pfad.

     sprache() liest der Reihe nach: data-sprache am <html> (das setzt der
     Erzeuger aus dem Pfad), den ersten Pfadabschnitt, ?sprache=xx, und erst
     ganz zuletzt navigator.languages. Keine dieser Quellen ist der
     Geraetespeicher — hz_sprache wird hier NICHT angefasst.

     Das ist der Unterschied, an dem § 25 TDDDG haengt: Die Adresse, unter
     der jemand die Seite aufruft, ist keine im Endgeraet gespeicherte
     Information. Das gleichnamige Cookie waere eine.
    */
  const rumpf = { was, sprache: sprache() };
  // Nur die Felder, die zur Art gehoeren. Was hier nicht steht, geht nicht
  // hinaus — auch nicht versehentlich.
  if (was === 'start' && felder.sender) rumpf.sender = String(felder.sender);
  if (was === 'regal' && felder.regal) rumpf.regal = String(felder.regal);
  if (was === 'filter') {
    if (felder.achse) rumpf.achse = String(felder.achse);
    if (felder.wert) rumpf.wert = String(felder.wert);
    /*
     Die Trefferzahl sagt, ob ein Filter taugt: Wer 0 liefert, ist ein
     Gestaltungsfehler. Bei EINER Achse sagt sie etwas ganz anderes.

     "gemerkte" findet per Wesensart genau das, was diese eine Person gemerkt
     hat. Analytisch ist die Zahl damit wertlos — und ueber Wochen stabil.
     Eine stabile Zahl zwischen 0 und 129 neben einer gekuerzten Adresse ist
     ein besserer Wiedererkennungswert als die Adresse allein.
    */
    if (felder.achse !== 'gemerkte' && Number.isFinite(felder.treffer)) {
      rumpf.treffer = felder.treffer;
    }
  }
  // Beim Wechsel die ZIELsprache — rumpf.sprache traegt zu diesem
  // Zeitpunkt noch die alte, die Seite laedt ja erst danach neu.
  if (was === 'sprache' && felder.wert) rumpf.wert = String(felder.wert);
  /*
   Der Abspielfehler: Sender, Zweig, Fehlercode. Sonst nichts.

   Der Zweig muss in ZWEIGE stehen, sonst geht die Zeile OHNE ihn hinaus —
   nicht gar nicht. Eine Zeile ohne Zweig ist immer noch die Auskunft „bei
   diesem Sender ging etwas schief", und die ist mehr wert als Schweigen.

   `code` ist MediaError.code, eine Zahl von 1 bis 4 aus dem Standard. Sie
   wird auf ganze Zahlen 1..4 eingegrenzt: Was ausserhalb liegt, kommt nicht
   aus dem Standard, sondern von irgendwoher — und dann steht die Zeile
   lieber ohne Code da.

   `el.error.message` steht ausdruecklich NICHT hier. Die ist
   herstellerabhaengiger Freitext aus fremder Quelle und hat in einer
   Protokollzeile nichts verloren.
  */
  /*
   'teilen' und 'teilen-uebernommen' gehen OHNE FELDER hinaus, obwohl
   app.js `{ anzahl }` mitgibt.

   Das ist kein Versehen, sondern dieselbe Entscheidung wie bei der Achse
   `gemerkte` ein paar Zeilen weiter oben — und es ist sogar dieselbe Zahl:
   die Anzahl der gemerkten Sender.

   Sie ist ueber Wochen stabil und liegt zwischen 0 und der Zahl der Sender.
   Die Messzeile hat zwar kein Adressfeld, aber sie liegt mit Zeitstempel in
   derselben Ablage wie die Zugriffszeilen, die eines haben. Eine stabile
   Zahl an einem Zeitstempel ist damit ein Wiedererkennungswert.

   Gemessen wird also, DASS jemand geteilt hat. Das beantwortet die Frage,
   fuer die das Ereignis gebaut wurde — wird die Teilenfunktion ueberhaupt
   benutzt —, und traegt nichts bei, woran sich jemand wiedererkennen liesse.

   Bis heute sendeten beide Aufrufe GAR NICHTS: Ihre Art stand nicht in
   ARTEN, und miss() gibt dann still `false` zurueck. Scripts/pruefe-messung.mjs
   faengt diesen Fall jetzt ab.
  */
  if (was === 'abspielfehler') {
    if (felder.sender) rumpf.sender = String(felder.sender);
    if (ZWEIGE.has(felder.zweig)) rumpf.zweig = felder.zweig;
    if (Number.isInteger(felder.code) && felder.code >= 1 && felder.code <= 4) {
      rumpf.code = felder.code;
    }
  }

  try {
    /*
     text/plain und nicht application/json: sendBeacon mit einem Blob vom Typ
     application/json loest einen CORS-Vorabflug aus, sobald jemand die Seite
     unter einem anderen Hostnamen aufruft — und ein Vorabflug auf einen
     Endpunkt, der nur 204 antwortet, ist zweimal Arbeit fuer nichts.
     text/plain gilt als einfache Anfrage und kommt ohne aus.
    */
    return navigator.sendBeacon(
      WEG, new Blob([JSON.stringify(rumpf)], { type: 'text/plain;charset=UTF-8' }));
  } catch {
    return false;
  }
}
