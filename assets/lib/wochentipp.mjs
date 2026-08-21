// Der Wochen-Tipp.
//
// Die alte Umsetzung hatte drei Fehler: Sie zog aus neun Einträgen über
// 52 Wochen (nach zwei Monaten wiederholte sich alles), sieben ihrer neun
// Stream-Adressen waren erfunden, und die Quellenangaben ebenfalls.
//
// Diese Fassung erfindet nichts. Sie wählt aus dem eigenen, geprüften
// Katalog — deterministisch aus Jahr und Kalenderwoche, damit derselbe
// Sender für alle Besucher derselben Woche erscheint und nicht bei jedem
// Neuladen wechselt. Bei 117 Sendern wiederholt sich nichts über zwei Jahre.

export function kalenderwoche(datum) {
  // ISO-8601: Woche 1 ist die mit dem ersten Donnerstag des Jahres.
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const wochentag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wochentag);
  const jahresanfang = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { jahr: d.getUTCFullYear(), woche: Math.ceil(((d - jahresanfang) / 86400000 + 1) / 7) };
}

// Zufällig ziehen wäre falsch: Über zwei Jahre käme mancher Sender viermal
// dran und mancher nie. Stattdessen wird der ganze Katalog in fester, aber
// weit springender Reihenfolge durchlaufen — jeder Sender genau einmal,
// bevor sich etwas wiederholt.
//
// Der Trick: Ist die Schrittweite teilerfremd zur Katalogmenge, führt
// (start + n·schritt) mod menge durch alle Positionen.
function groessterGemeinsamerTeiler(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

function schrittweite(menge) {
  // Ungefähr 38 Prozent der Menge springt weit genug, um nicht wochenlang
  // im selben Regal zu landen. Von dort aus die nächste teilerfremde Zahl.
  let s = Math.max(1, Math.floor(menge * 0.382));
  while (s < menge && groessterGemeinsamerTeiler(s, menge) !== 1) s++;
  return s < menge ? s : 1;
}

export function tippDerWoche(sender, datum = new Date()) {
  if (!sender?.length) return null;
  const { jahr, woche } = kalenderwoche(datum);
  const menge = sender.length;
  // Fortlaufende Wochenzählung, damit der Jahreswechsel keinen Sprung macht
  const laufend = jahr * 53 + woche;
  const index = (laufend * schrittweite(menge)) % menge;
  return { sender: sender[index], jahr, woche };
}

// Was sonst noch im selben Regal steht — als Weiterhören.
export function dazuPassend(tipp, alle, anzahl = 3) {
  if (!tipp) return [];
  return alle
    .filter(s => s.regal === tipp.regal && s.id !== tipp.id)
    .slice(0, anzahl);
}
