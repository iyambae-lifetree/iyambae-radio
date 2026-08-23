// ═══════════════════════════════════════════════════════════════════
// Zuletzt gehoert — Schreiber und Leser derselben Liste
//
// WARUM DIESE ZWEI FUNKTIONEN IN EINER DATEI STEHEN:
//
// Sie sind die zwei Seiten einer Absprache, und genau an dieser Absprache
// ist etwas zerbrochen. Der Schreiber legte den zuletzt gehoerten Sender
// VORNE an; der Leser drehte die Liste um, weil er annahm, vorne stuenden
// die aeltesten. Ergebnis: Wer im Regal "Zuletzt gehoert" auf eine Huelle
// klickte, sah sie im selben Augenblick verschwinden — sie rutschte ans
// andere Ende der Reihe, und ab dreizehn gehoerten Sendern fiel sie ganz
// aus den gezeigten zwoelf heraus.
//
// Getrennt in zwei Dateien war der Widerspruch nicht zu sehen. Nebeneinander
// ist er es, und eine Pruefung kann beide Seiten gegeneinander halten:
// Scripts/pruefe-verlauf.mjs.
//
// Beide Listen sind NEUESTE ZUERST. Das ist die eine Regel dieser Datei.
// ═══════════════════════════════════════════════════════════════════

// Wie viel behalten wird, und wie viel davon gezeigt wird. Behalten wird
// mehr als gezeigt, weil die Liste auch den Zufallsgriff speist: Was gerade
// lief, soll nicht sofort wiederkommen.
export const HOECHSTENS_GEMERKT = 20;
export const HOECHSTENS_GEZEIGT = 12;

/*
 Einen gehoerten Sender vorne einreihen — neueste zuerst.

 Ein Sender steht hoechstens einmal drin. Wer ihn erneut auflegt, holt ihn
 nach vorne, statt einen zweiten Eintrag zu erzeugen.
*/
export function merkeGehoert(liste, senderId, hoechstens = HOECHSTENS_GEMERKT) {
  return [senderId, ...liste.filter((id) => id !== senderId)].slice(0, hoechstens);
}

/*
 Was das Regal zeigt: dieselbe Reihenfolge, neueste zuerst.

 `aufloesen` gibt zu einer Kennung den Sender oder etwas Falsches, wenn es
 ihn nicht mehr gibt. Solche Kennungen werden UEBERSPRUNGEN, nicht mitgezaehlt
 — sonst nimmt ein aus dem Katalog gefallener Sender einen der zwoelf
 Plaetze mit ins Grab, und das Regal wird ohne erkennbaren Grund kuerzer.
*/
export function verlaufsliste(liste, aufloesen, hoechstens = HOECHSTENS_GEZEIGT) {
  const gesehen = new Set();
  const gezeigt = [];
  for (const id of liste) {
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    const sender = aufloesen(id);
    if (!sender) continue;
    gezeigt.push(sender);
    if (gezeigt.length >= hoechstens) break;
  }
  return gezeigt;
}
