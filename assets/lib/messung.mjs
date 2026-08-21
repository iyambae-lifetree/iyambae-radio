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
// passiert ist, wann, und die schon von nginx gekürzte Besucheradresse.
// Rechtsgrundlage ist das berechtigte Interesse — zu wissen, ob die Seite
// benutzt wird und ob die Sender überhaupt laufen.
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
//   Die volle Adresse. nginx kürzt sie, bevor überhaupt etwas geschrieben
//   wird (siehe deploy/nginx.conf).
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
const ARTEN = new Set(['start', 'filter', 'regal', 'suche', 'sprache', 'installiert']);

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

  const rumpf = { was };
  // Nur die Felder, die zur Art gehoeren. Was hier nicht steht, geht nicht
  // hinaus — auch nicht versehentlich.
  if (was === 'start' && felder.sender) rumpf.sender = String(felder.sender);
  if (was === 'regal' && felder.regal) rumpf.regal = String(felder.regal);
  if (was === 'filter') {
    if (felder.achse) rumpf.achse = String(felder.achse);
    if (felder.wert) rumpf.wert = String(felder.wert);
    if (Number.isFinite(felder.treffer)) rumpf.treffer = felder.treffer;
  }
  if (was === 'sprache') rumpf.wert = sprache();

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
