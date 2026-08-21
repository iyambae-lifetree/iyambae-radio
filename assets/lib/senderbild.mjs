// Welches Bild ein Sender zeigt — auf der Karte wie auf dem Plattenlabel.
//
// Hat er ein eigenes Logo, gilt das. Hat er keins, erscheint die
// IYAMBAE-Marke: im Plattenladen ist das die Hausmarke auf der Testpressung.

export const MARKE = 'assets/logo/iyambae-marke.svg';

export function senderbild(sender) {
  return sender?.logo || MARKE;
}

export function hatEigenesLogo(sender) {
  return Boolean(sender?.logo);
}

// Damit die Sender ohne eigenes Logo nebeneinander nicht wie eine Kachelwand
// wirken, bekommt jede Huelle den Farbton ihres Regals.
export const REGALTON = {
  grenzgaenger:  '#F2B705',
  maschinenraum: '#8A7CD8',
  tiefe:         '#3E92D6',
  jazz:          '#D98E4A',
  japan:         '#E0607E',
  barrio:        '#3FB984',
  fundstuecke:   '#C9A227',
  freakshow:     '#B563C9',
  rueckspiegel:  '#E8734A',
};

export function regalton(sender) {
  return REGALTON[sender?.regal] ?? REGALTON.grenzgaenger;
}


/*
 Wie der Name auf einer selbst gestalteten Huelle steht.

 Vorher zeigten Sender ohne Logo nur die Hausmarke — 34 gleiche Kacheln
 nebeneinander, die wie Luecken aussahen statt wie Platten. Eine Huelle ohne
 Cover ist aber kein Fehler: In jedem Plattenladen stehen Testpressungen mit
 gesetztem Namen und ohne Bild. Genau das hier.

 Der Name wird auf zwei bis drei Zeilen gebrochen, damit lange Namen nicht
 winzig werden. Gebrochen wird an Trennern, nicht mitten im Wort.
*/
export function huellenzeilen(sender) {
  const name = (sender?.name ?? '').trim();
  if (!name) return [''];

  // An Bindestrich, Punkt oder Leerzeichen trennen — in dieser Reihenfolge.
  const woerter = name.split(/\s+/);
  if (woerter.length === 1) return [name];
  if (woerter.length === 2) return woerter;

  // Bei mehr als zwei Woertern: erste Zeile Marke, Rest darunter.
  return [woerter[0], woerter.slice(1).join(' ')];
}

/** Wie gross der Name gesetzt wird — lange Namen kleiner. */
export function huellengroesse(sender) {
  const laenge = (sender?.name ?? '').length;
  if (laenge <= 8)  return 'gross';
  if (laenge <= 16) return 'mittel';
  return 'klein';
}
