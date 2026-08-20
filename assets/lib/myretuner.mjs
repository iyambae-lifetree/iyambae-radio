// Erkennt, ob MyRetuner auf demselben Rechner läuft.
//
// Ein Browser kann eine installierte App nicht von sich aus sehen — das wäre
// eine Sicherheitslücke. Also meldet sich die App: Sie öffnet lokal einen
// kleinen Anschluss, den diese Seite abfragt. Läuft sie nicht, kommt keine
// Antwort, und die Seite verhält sich, als hätte es die Abfrage nie gegeben.

export const ANSCHLUSS = 'http://127.0.0.1:47432/status';
const ZEITLIMIT_MS = 500;   // die Seite darf daran nicht hängen

export async function frageMyRetuner(adresse = ANSCHLUSS) {
  try {
    const antwort = await fetch(adresse, {
      cache: 'no-store',
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
    });
    if (!antwort.ok) return null;
    const daten = await antwort.json();
    return daten?.app === 'myretuner' ? daten : null;
  } catch {
    return null;   // nicht installiert, nicht gestartet, kein Netz — alles gleich
  }
}

// Welche Zahl der Besucher sehen soll. Wer Preset 528 eingestellt hat, will
// "528 Hz" lesen — nicht 443,99, obwohl das der rechnerisch wirksame
// Kammerton ist. Beides kommt aus der App, presetHz ist das für die Anzeige.
export function anzeigeStimmung(daten) {
  if (!daten) return null;
  const hz = daten.presetHz ?? daten.zielstimmung;
  if (hz == null) return null;
  return Number.isInteger(hz) ? String(hz) : hz.toFixed(2).replace('.', ',');
}

// Die gemessene Quellstimmung, abgestuft nach dem Vertrauen der App.
//
// Eine harte Schwelle war zu grob: Die App liefert im laufenden Betrieb
// Werte um 0,25, und bei einer Schwelle von 0,5 bliebe die Messung dauerhaft
// unsichtbar. Umgekehrt wäre es falsch, eine unsichere Zahl mit einer
// Nachkommastelle hinzuschreiben — das wäre Scheingenauigkeit.
//
// Also drei Stufen: genau, ungefähr, gar nicht.
export function anzeigeQuelle(daten) {
  if (!daten || daten.quellstimmung == null) return null;
  const vertrauen = daten.vertrauen ?? 0;
  if (vertrauen >= 0.5) {
    return { wert: daten.quellstimmung.toFixed(1).replace('.', ','), sicher: true };
  }
  if (vertrauen >= 0.15) {
    return { wert: String(Math.round(daten.quellstimmung)), sicher: false };
  }
  return null;   // darunter ist es geraten, und Geratenes zeigt man nicht
}
