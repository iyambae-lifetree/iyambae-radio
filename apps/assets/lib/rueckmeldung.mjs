/*
  Freiwillige, anonyme Rueckmeldung an unsere eigene Gegenstelle.

  ────────────────────────────────────────────────────────────────────
  DIE GEGENSTELLE STEHT SEIT DEM 04.09.2026.

  Bis dahin stand hier `null`, und dieses Modul gab es praktisch nicht:
  kein Kaestchen, nichts erhoben, nichts gesendet. Das war Absicht — ein
  Einwilligungskaestchen ohne Empfaenger waere eine Frage ohne Zweck.

  Micha hat POST /api/hoertest und POST /api/stimmung gebaut und
  ausgeliefert (297 Proben, gegen die Produktion nachgemessen). Die
  Browser-Seite lag seit dem 01.09. fertig auf dem Zweig
  `rueckmeldung-c1-c2` und wartete nur auf diese eine Zeile. Vier Tage
  lang haben beide Werkzeuge weiter jedes Ergebnis weggeworfen, obwohl
  beide Haelften fertig waren.

  Siehe Vorgang 432hz-radio#21.
  ────────────────────────────────────────────────────────────────────
*/

/*
  GLEICHE HERKUNFT, deshalb nur der Pfad und kein Hostname.

  apps.iyambae.fm reicht /api/ an denselben Dienst weiter, der auch die
  Umfrage annimmt. Kein CORS, kein Vorabflug, keine zweite Adresse, die
  irgendwann auseinanderlaeuft.
*/
export const ADRESSE = '/api';

export function moeglich() {
  return typeof ADRESSE === 'string' && ADRESSE !== '';
}

/*
  NUR 204 GILT ALS ANGEKOMMEN.

  Bei /api/umfrage waere beinahe genau das schiefgegangen: apps.iyambae.fm
  reichte /api/ nicht weiter, ein POST bekam 200 mit einer HTML-Seite, und
  eine Pruefung auf `antwort.ok` haette daraus Erfolg gelesen. Wochenlang
  gesammelt, nichts gehabt (Vorgang #5).

  Hier faellt ein solcher Fall auf: Es wird false zurueckgegeben, und der
  Aufrufer zeigt kein Danke.
*/
export async function sende(pfad, rumpf) {
  if (!moeglich()) return false;
  // Ohne Inhalt gibt es nichts zu senden. Kommt vor, wenn jemand anhakt,
  // nachdem eine Messung fehlgeschlagen ist.
  if (!rumpf) return false;
  try {
    const antwort = await fetch(ADRESSE + pfad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rumpf),
      // Keine Plaetzchen, keine Anmeldedaten. Es gibt nichts zu erkennen.
      credentials: 'omit',
      keepalive: true,
    });
    return antwort.status === 204;
  } catch {
    return false;
  }
}

/* Die Sprache der Seite, fuer die Auswertung nach Herkunft. Steht im
   <html>-Element, das der Erzeuger schreibt. */
export function sprache() {
  return document.documentElement.lang || 'de';
}

/*
  Die Laenge kommt bewusst NUR als grobe Stufe.

  Genaue Sekunden waeren zusammen mit der Stimmung auf 0,1 Hz und der
  Abtastrate ein Fingerabdruck des Stuecks — und mit einem Zeitstempel
  daneben waere eine Zeile schwach zuordenbar. Fuer die Frage, ob Leute
  Ausschnitte oder ganze Alben messen, reicht die Stufe vollkommen.
*/
export function laengenstufe(sekunden) {
  if (sekunden < 30) return 'unter30';
  if (sekunden < 120) return 'bis2min';
  if (sekunden < 600) return 'bis10min';
  if (sekunden < 3600) return 'bis60min';
  return 'laenger';
}

const ENDUNGEN = ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'aiff', 'aif'];

/* Nur die Endung, nie der Name. „Sitzung mit Dr. Meier.mp3" wird zu „mp3". */
export function endung(dateiname) {
  const e = String(dateiname).toLowerCase().split('.').pop();
  return ENDUNGEN.includes(e) ? (e === 'aif' ? 'aiff' : e) : 'andere';
}

/*
  Das Kaestchen aufsetzen.

  Gesendet wird ERST beim Anhaken, nie vorher — die Einwilligung geht der
  Uebertragung voraus und nicht umgekehrt. Einmal gesendet, wird das
  Kaestchen gesperrt; ein zweites Haekchen soll die Zahl nicht verdoppeln.
*/
export function kaestchen(kasten, haken, danke, pfad, hole) {
  if (!moeglich()) return;
  kasten.hidden = false;
  haken.addEventListener('change', async () => {
    if (!haken.checked) return;
    haken.disabled = true;
    const gut = await sende(pfad, hole());
    if (gut) {
      danke.hidden = false;
    } else {
      // Kein Danke fuer etwas, das nicht angekommen ist.
      haken.checked = false;
      haken.disabled = false;
    }
  });
}
