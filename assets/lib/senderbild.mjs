// Welches Bild ein Sender zeigt — auf der Karte wie auf dem Plattenlabel.
//
// Hat er ein eigenes Logo, gilt das. Hat er keins, erscheint die
// IYAMBAE-Marke: im Plattenladen ist das die Hausmarke auf der Testpressung.

export const MARKE = 'assets/logo/iyambae-marke.svg';

// Fuer das Plattenlabel eine eigene Fassung: Sie ist auf den blauen Punkt im
// Wirbel der Spirale ausgerichtet, nicht auf die Bildmitte. Dadurch faellt der
// Punkt mit der Drehachse zusammen und wird zur Spindel, auf der die Platte
// sitzt. Mit der gewoehnlichen Marke wuerde er beim Drehen eiern.
export const LABEL_MARKE = 'assets/logo/iyambae-label.svg';

export function senderbild(sender) {
  return sender?.logo || MARKE;
}

// Was auf dem Plattenteller liegt.
export function labelbild(sender) {
  return sender?.logo || LABEL_MARKE;
}

export function hatEigenesLogo(sender) {
  return Boolean(sender?.logo);
}

// Damit 33 Hausmarken nebeneinander nicht wie eine Kachelwand wirken,
// bekommt jede Karte ohne eigenes Logo den Farbton ihres Regals.
export const REGALTON = {
  grenzgaenger:  '#F2B705',
  maschinenraum: '#8A7CD8',
  tiefe:         '#3E92D6',
  jazz:          '#D98E4A',
  japan:         '#E0607E',
  barrio:        '#3FB984',
  fundstuecke:   '#C9A227',
  freakshow:     '#B563C9',
};

export function regalton(sender) {
  return REGALTON[sender?.regal] ?? REGALTON.grenzgaenger;
}
