// Entscheidet, ob der Service Worker eine Anfrage abfangen darf.
//
// Der alte Fehler: die Ausschlussregel prüfte auf Dateiendungen wie ".mp3".
// Icecast-Adressen enden aber auf "-128-mp3" ohne Punkt — die Streams landeten
// deshalb im stale-while-revalidate-Zweig, wo der Worker versuchte, einen
// endlosen Audiostrom in den Cache zu schreiben.

// NACHGEZOGEN AM 02.09.2026. Hier stand zusaetzlich eine Ausnahme fuer
// fonts.googleapis.com und fonts.gstatic.com. Die ist in sw.js schon eine
// Weile weg — seit die Schriften unter /assets/schrift/ im eigenen Haus
// liegen und damit ohnehin unter den eigenen Ursprung fallen.
//
// Dass es hier stehen blieb, ist genau die Sorte Auseinanderlaufen, gegen
// die es dieses Modul gibt: Es hat keinen produktiven Aufrufer, es ist die
// geschriebene Fassung der Regel, die in sw.js von Hand steht. Wenn die
// beiden nicht mehr dasselbe sagen, ist das Modul wertlos.
export function darfAbfangen(anfrageUrl, eigenerUrsprung) {
  let url;
  try { url = new URL(anfrageUrl); } catch { return false; }
  return url.origin === eigenerUrsprung;
}
