// Zieht Sender gewichtet: Was selten gehoert wurde, kommt haeufig.
// Nichts ist ausgeschlossen — auch der Lieblingssender kann auftauchen,
// sonst waere die Ueberraschung berechenbar.

/*
 `verstehtMan` entscheidet, ob der Zuhoerer die Sprache am Mikrofon
 versteht. Wer sie nicht versteht, zieht solche Sender seltener — aber
 nicht nie. Ein Fuenftel des Gewichts bleibt: Eine Zufallsnadel, die
 ganze Laender ausschliesst, ist keine Zufallsnadel mehr, und manch einer
 hoert eine fremde Stimme gerade gern.

 Ohne die Angabe verhaelt sich alles wie vorher.
*/
export function waehleUeberraschung(sender, gehoert = {}, anzahl = 6, zuletzt = [],
                                    verstehtMan = () => true) {
  const uebrig = [...sender];
  const gezogen = [];
  const zuHolen = Math.min(anzahl, uebrig.length);
  // Was gerade erst lief, soll nicht sofort wiederkommen.
  const frisch = new Set(zuletzt.slice(-20));

  for (let n = 0; n < zuHolen; n++) {
    const gewichte = uebrig.map(s =>
      (1 / (1 + (gehoert[s.id] ?? 0)))
      * (frisch.has(s.id) ? 0.1 : 1)
      * (verstehtMan(s) ? 1 : 0.2));
    const summe = gewichte.reduce((a, b) => a + b, 0);
    let wurf = Math.random() * summe;
    let index = gewichte.length - 1;
    for (let i = 0; i < gewichte.length; i++) {
      wurf -= gewichte[i];
      if (wurf <= 0) { index = i; break; }
    }
    gezogen.push(uebrig[index]);
    uebrig.splice(index, 1);
  }
  return gezogen;
}
