// ═══════════════════════════════════════════════════════════════════
// Der Hinweis auf den IYAMBAE Tuner, an der Stelle, wo er passt
//
// Oben auf der Seite steht der Tuner für alle, die gerade erst ankommen.
// Wer aber zwanzig Minuten in 432 Hz gehört hat, hat die Stimmung ausprobiert
// und behalten. Genau dann darf der Laden einmal leise sagen, dass es das
// auch für Spotify, YouTube und die eigene Sammlung gibt.
//
// DREI GRENZEN, und alle drei sind Absicht:
//
// 1. Einmal je Besuch, und nur im Arbeitsspeicher. Nichts wird auf dem Gerät
//    abgelegt, auch kein „schon gezeigt“. Das wäre ein Merkzeichen, das der
//    Dienst nicht braucht (§ 25 Abs. 2 Nr. 2 TDDDG), und die Seite hat
//    bewusst kein Cookie-Banner. Wer morgen wiederkommt und wieder zwanzig
//    Minuten hört, liest den Satz noch einmal. Das ist der Preis, und er ist
//    klein.
// 2. Gezählt wird nur, was wirklich in 432 Hz lief: Musik an, Stimmung an,
//    und der Tuner selbst übernimmt nicht schon. Pausen zählen nicht mit,
//    die Zeit davor bleibt aber stehen.
// 3. Ein schlafender Rechner hört nicht zu. Liegt zwischen zwei Abfragen
//    mehr als LUECKE_MS, zählt nur LUECKE_MS. Sonst stünde nach dem Aufklappen
//    des Deckels sofort „seit zwanzig Minuten“ da.
//
// Der Satz selbst verspricht keine Wirkung (Heilmittelwerbegesetz). Er sagt,
// was der Tuner tut, nicht, was er mit einem macht.
// ═══════════════════════════════════════════════════════════════════

export const SCHWELLE_MS = 20 * 60 * 1000;
export const LUECKE_MS = 2 * 60 * 1000;

export function hoeruhr(schwelle = SCHWELLE_MS) {
  let gehoert = 0;
  let zuletzt = null;
  let gemeldet = false;
  return {
    /*
     Regelmäßig aufrufen. `zaehlt`: läuft gerade Musik in 432 Hz?
     Gibt genau einmal true zurück, wenn die Schwelle erreicht ist.
    */
    tick(jetzt, zaehlt) {
      if (gemeldet) return false;
      if (zaehlt && zuletzt !== null) gehoert += Math.min(Math.max(0, jetzt - zuletzt), LUECKE_MS);
      zuletzt = zaehlt ? jetzt : null;
      if (gehoert < schwelle) return false;
      gemeldet = true;
      return true;
    },
    get gehoert() { return gehoert; },
    get gemeldet() { return gemeldet; },
  };
}
