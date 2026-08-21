// Entscheidet, ob der Service Worker eine Anfrage abfangen darf.
//
// Der alte Fehler: die Ausschlussregel prüfte auf Dateiendungen wie ".mp3".
// Icecast-Adressen enden aber auf "-128-mp3" ohne Punkt — die Streams landeten
// deshalb im stale-while-revalidate-Zweig, wo der Worker versuchte, einen
// endlosen Audiostrom in den Cache zu schreiben.

export function darfAbfangen(anfrageUrl, eigenerUrsprung) {
  let url;
  try { url = new URL(anfrageUrl); } catch { return false; }
  if (url.origin === eigenerUrsprung) return true;
  return /^https:\/\/fonts\.(googleapis|gstatic)\.com$/.test(url.origin);
}
