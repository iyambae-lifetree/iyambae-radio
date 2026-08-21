// Zieht Sender gewichtet: Was selten gehoert wurde, kommt haeufig.
// Nichts ist ausgeschlossen — auch der Lieblingssender kann auftauchen,
// sonst waere die Ueberraschung berechenbar.

export function waehleUeberraschung(sender, gehoert = {}, anzahl = 6, zuletzt = []) {
  const uebrig = [...sender];
  const gezogen = [];
  const zuHolen = Math.min(anzahl, uebrig.length);
  // Was gerade erst lief, soll nicht sofort wiederkommen.
  const frisch = new Set(zuletzt.slice(-20));

  for (let n = 0; n < zuHolen; n++) {
    const gewichte = uebrig.map(s =>
      (1 / (1 + (gehoert[s.id] ?? 0))) * (frisch.has(s.id) ? 0.1 : 1));
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
