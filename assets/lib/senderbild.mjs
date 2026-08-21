// Welches Bild ein Sender zeigt — auf der Karte wie auf dem Plattenlabel.
//
// Hat er ein eigenes Logo, gilt das. Hat er keins, erscheint die
// IYAMBAE-Marke: im Plattenladen ist das die Hausmarke auf der Testpressung.

export const MARKE = '/assets/logo/iyambae-marke.svg';

/*
 Die Adressen in data/sender.json stehen ohne fuehrenden Schraegstrich
 (assets/logos/xyz.webp). Seit die Seite unter /de/, /en/, /fr/ … liegt,
 suchte der Browser sie unter /de/assets/logos/ — 95 Bilder auf einen
 Schlag weg. Der Schraegstrich kommt deshalb hier dazu und nicht in die
 Daten: Die Daten beschreiben den Sender, nicht die Wegfuehrung.
*/
// Fuer das Plattenlabel eine eigene Fassung: Sie ist auf den blauen Punkt im
// Wirbel der Spirale ausgerichtet, nicht auf die Bildmitte. Dadurch faellt der
// Punkt mit der Drehachse zusammen und wird zur Spindel, auf der die Platte
// sitzt. Mit der gewoehnlichen Marke wuerde er beim Drehen eiern.
export const LABEL_MARKE = '/assets/logo/iyambae-label.svg';

// Was auf dem Plattenteller liegt.
export function labelbild(sender) {
  const bild = sender?.logo;
  if (!bild) return LABEL_MARKE;
  return bild.startsWith('/') || bild.startsWith('http') ? bild : '/' + bild;
}

export function senderbild(sender) {
  const bild = sender?.logo;
  if (!bild) return MARKE;
  return bild.startsWith('/') || bild.startsWith('http') ? bild : '/' + bild;
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
  // Sāmi-Ras zehntes Regal, angelegt am 21.08.2026. Er hat neun
  // Jahrzehnte-Kanaele aus dem Rueckspiegel hierher umgehaengt; dort bleiben
  // die Kuriositaeten. Ein gedecktes Gruen, weil die acht warmen Toene
  // nebeneinander sonst ineinanderlaufen — und weil Barrio das einzige
  // andere Gruen ist und weit genug weg steht.
  wuehlkiste:    '#7FA65C',
  // Sāmi-Ras elftes Regal, angelegt am 21.08.2026: zwoelf Klassiksender,
  // von BR-Klassik bis WQXR. Ein kuehles Blaugrau — Klassik ist das einzige
  // Regal, das nicht von der Nacht, der Strasse oder der Maschine erzaehlt,
  // und ein warmer Ton haette es in die falsche Nachbarschaft gestellt.
  klassik:       '#8FA8C8',
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

/*
 Das Bild eines Regalfachs: vier Cover aus dem Fach, zu einem Mosaik gelegt.

 Erzeugt, aber nicht erfunden. Ein gemaltes Fantasiebild waere huebscher und
 wuerde zeigen, was NICHT im Fach steht — das Mosaik zeigt, was drin ist, und
 bleibt richtig, wenn morgen ein Sender dazukommt.

 Genau der Griff, mit dem Spotify und Apple Music ihre Sammlungen bebildern.

 Ausgewaehlt wird nach Klangguete, nicht zufaellig: Das Fach zeigt vorne, was
 es am besten kann. Bei weniger als vier Covern wiederholen sich die
 vorhandenen — vier Felder bleiben vier Felder, sonst reisst das Raster.
*/
export function regalmosaik(sender, felder = 4) {
  const mit = sender.filter(hatEigenesLogo);
  if (!mit.length) return Array(felder).fill(MARKE);

  const rang = (s) => s.codec === 'flac' ? 0
                    : ['opus', 'vorbis'].includes(s.codec) ? 1
                    : (s.bitrate ?? 0) >= 256 ? 2
                    : (s.bitrate ?? 0) >= 192 ? 3 : 4;
  const sortiert = [...mit].sort((a, b) => rang(a) - rang(b));

  return Array.from({ length: felder },
                    (_, i) => senderbild(sortiert[i % sortiert.length]));
}

/*
 Häuser mit mehreren Kanälen — und wie ihr Name auf der Hülle steht.

 Sāmi-Ra hat das Feld `kanal` bei allen 146 Sendern gesetzt. Bei 93 steht dort
 der volle Name, bei 53 der Kanal eines Hauses: "NTS 1" → "1",
 "SomaFM Drone Zone" → "Drone Zone".

 Zwölf Marken haben mehrere Kanäle, SomaFM allein 22. Auf einer Regalreihe
 stand damit zweiundzwanzigmal fett "SomaFM" — und das Wort, das die Hüllen
 voneinander unterscheidet, lief als Anhängsel hinterher. Genau umgekehrt, als
 es sein sollte: Das Haus ist der Zusammenhang, der Kanal ist die Sache.

 WARUM DAS HAUS AUS DEM NAMEN KOMMT UND NICHT AUS `betreiber`

 `betreiber` ist die Firma, nicht die Marke. Dort steht "REGIOCAST" für
 90s90s, "Zelerk" für 24/7 und "RauteMusik GmbH" für RauteMusik. Ein Aufdruck
 "REGIOCAST / Eurodance" wäre schlechter als "90s90s Eurodance" — niemand
 sucht nach der Firma.

 Der Name trägt die Marke selbst: Alle 53 Namen enden auf ihren Kanal, ohne
 Ausnahme. Was davor steht, ist die Marke, wie sie auf der Hülle stehen soll.
*/
export function zerlegeName(sender) {
  const kanal = (sender?.kanal ?? '').trim();
  const name = (sender?.name ?? '').trim();
  if (!kanal || kanal === name || !name.endsWith(kanal)) return { haus: null, kanal: name };
  return { haus: name.slice(0, -kanal.length).trim(), kanal };
}

/**
 * Welche Häuser mehr als einen Kanal führen.
 * Ein Haus mit genau einem Kanal ist kein Haus, sondern ein Sender — dort
 * bleibt der Name, wie er ist.
 */
export function haeuserMitMehreren(sender) {
  const zaehler = new Map();
  for (const s of sender) {
    const { haus } = zerlegeName(s);
    if (haus) zaehler.set(haus, (zaehler.get(haus) ?? 0) + 1);
  }
  return new Set([...zaehler].filter(([, n]) => n > 1).map(([h]) => h));
}

/*
 Was die Verbindung dauerhaft hergeben muss.

 Bei verlustbehafteten Strömen steht die Datenrate schon im Abzeichen — 320k
 heißt 0,32 Mbit/s, das rechnet jeder selbst. Bei FLAC steht dort nur "FLAC",
 und die Zahl fehlt: Der Katalog hat für die vier verlustfreien Sender keine
 gemessene Datenrate, weil sie schwankt.

 Also wird sie ausgerechnet, und zwar als OBERGRENZE: Abtastrate × 16 Bit ×
 2 Kanäle. FLAC ist verlustfrei komprimiert und liegt in der Praxis bei 60
 bis 70 Prozent davon — mehr als der unkomprimierte Wert kann es nie werden.
 Eine ausgerechnete Obergrenze ist ehrlicher als eine erfundene Messung, und
 für die Frage "reicht meine Leitung?" ist die Obergrenze ohnehin die
 richtige Zahl.
*/
export function bandbreite(sender) {
  if (sender?.codec !== 'flac') return null;
  const takt = sender.samplerate ?? 44100;
  const bit = takt * 16 * 2;
  return (bit / 1e6).toFixed(1).replace('.', ',');
}
