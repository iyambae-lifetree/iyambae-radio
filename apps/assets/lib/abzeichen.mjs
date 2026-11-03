/*
  Das Mess-Abzeichen, Browserseite (432hz-radio#27).

  Die Gegenstelle ist `POST /api/messung` im Anmeldedienst
  (dienst/src/abzeichen.mjs), die Spec liegt unter
  docs/superpowers/specs/2026-11-03-mess-abzeichen.md.

  WAS HINAUSGEHT, und das ist die ganze Liste: Kammerton, Sicherheit, Laenge
  der Datei, SHA-256 der Datei. Nicht die Datei, nicht ihr Name. Die
  Pruefsumme rechnet der Browser selbst aus den Bytes, die er ohnehin schon
  geladen hat — die Datei verlaesst den Rechner dafuer nicht.

  Gesendet wird ERST auf den Knopf „Abzeichen erzeugen". Vorher nichts.
*/

/* Dieselbe Herkunft wie rueckmeldung.mjs: apps.iyambae.fm reicht /api/ an
   den Dienst weiter. Kein CORS, kein zweiter Hostname. */
const ADRESSE = '/api/messung';

/* Die Schwelle der Seite. Darunter zeigt /stimmung/ keine Zahl — und fuer
   eine Zahl, die nicht einmal dasteht, gibt es auch kein Abzeichen. Der
   Dienst prueft dasselbe noch einmal. */
export const SCHWELLE = 0.35;

export function traegt(sicherheit) {
  return sicherheit >= SCHWELLE;
}

/* Gerundet wie im Dienst: eine Stelle beim Kammerton, zwei bei der
   Sicherheit, ganze Sekunden bei der Laenge. */
export function befund(messung, sekunden, sha256) {
  return {
    a4: Math.round(messung.a4 * 10) / 10,
    sicherheit: Math.round(messung.sicherheit * 100) / 100,
    dauer: Math.round(sekunden),
    sha256,
  };
}

export function hexVon(puffer) {
  return [...new Uint8Array(puffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/*
  SHA-256 der Datei. Muss VOR decodeAudioData laufen: Das uebernimmt den
  ArrayBuffer und laesst ihn leer zurueck — danach gaebe es nichts mehr zu
  hashen, und die Pruefsumme waere die einer leeren Datei.
*/
export async function pruefsumme(roh) {
  return hexVon(await crypto.subtle.digest('SHA-256', roh));
}

export function verweise(basis, kennung) {
  const seite = `${basis}/messung/${kennung}`;
  return { seite, bild: `${seite}.svg` };
}

const esc = t => String(t).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/* Ein Bild mit Verweis — fuer Webseiten. Unter YouTube- und TikTok-Videos
   geht nur der Verweis, keine Bilder. */
export function einbettcode(v, alt) {
  return `<a href="${esc(v.seite)}"><img src="${esc(v.bild)}" alt="${esc(alt)}" width="320" height="72"></a>`;
}

const KENNUNG = /^[0-9a-hjkmnp-tv-z]{10}$/;
const SCHLUESSEL = /^[A-Za-z0-9_-]{32}$/;

/*
  NUR 201 MIT SAUBERER ANTWORT GILT — dieselbe Lehre wie bei der Umfrage
  (#5): Eine Gegenstelle, die mit 200 und einer HTML-Seite antwortet, haette
  sonst einen Erfolg vorgetaeuscht, und der Creator saehe einen
  Loeschschluessel, den es nirgends gibt.

  Es geht genau der Befund hinaus, auch wenn der Aufrufer mehr mitgibt.
*/
export async function erzeuge(b) {
  try {
    const antwort = await fetch(ADRESSE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a4: b.a4, sicherheit: b.sicherheit, dauer: b.dauer, sha256: b.sha256 }),
      credentials: 'omit',
    });
    if (antwort.status !== 201) return null;
    const daten = await antwort.json();
    if (!KENNUNG.test(daten?.kennung) || !SCHLUESSEL.test(daten?.loeschschluessel)) return null;
    return { kennung: daten.kennung, loeschschluessel: daten.loeschschluessel };
  } catch {
    return null;
  }
}
