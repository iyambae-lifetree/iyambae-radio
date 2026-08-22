// Erkennt, ob der IYAMBAE Tuner auf demselben Rechner läuft.
//
// Ein Browser kann eine installierte App nicht von sich aus sehen — das wäre
// eine Sicherheitslücke. Also meldet sich die App: Sie öffnet lokal einen
// kleinen Anschluss, den diese Seite abfragt. Läuft sie nicht, kommt keine
// Antwort, und die Seite verhält sich, als hätte es die Abfrage nie gegeben.
//
// DASS SIE NICHT LÄUFT, IST DER NORMALFALL. Die allermeisten Besucher haben
// die App nicht. Nichts in diesem Modul darf diesen Fall wie einen Fehler
// aussehen lassen — die Seite stimmt dann weiter selbst um, ratend, wie sie
// es immer getan hat.
//
// Der Dateiname bleibt `myretuner.mjs`. Er steht im Vorrat des Service
// Workers und in den Fundstellen des Verarbeitungsverzeichnisses; für den
// Besucher ist er nirgends sichtbar. Ihn umzubenennen kostet einen Bruch im
// Zwischenspeicher jedes Bestandsbesuchers und bringt nichts ein.

export const ANSCHLUSS = 'http://127.0.0.1:47432/status';

/*
 Unter welchen Kennungen sich die App meldet.

 Bis 0.7.0 hiess sie „MyRetuner" und schrieb `"app": "myretuner"`, seit 0.7.1
 heisst sie „IYAMBAE Tuner" und schreibt `"app": "iyambae-tuner"`. Hier gelten
 BEIDE, und zwar dauerhaft.

 Genau daran ist die Brücke gescheitert: Sie liess nur `myretuner` gelten, die
 ausgelieferte App schickte `iyambae-tuner` — jede Antwort wurde verworfen,
 und die Seite sah aus, als sei kein Tuner da. Eine Kennung wegzunehmen sperrt
 immer eine der beiden Fassungen aus; deshalb wird hier nie wieder eine
 entfernt, sondern nur ergänzt.
*/
const KENNUNGEN = new Set(['iyambae-tuner', 'myretuner']);

/*
 Das Zeitlimit der stillen Abfrage. Sie läuft im Hintergrund, der Besucher
 wartet nicht auf sie, und die Seite darf nicht an ihr hängen.

 Für den Klickpfad gilt es AUSDRÜCKLICH NICHT — siehe wartAufEinwilligung.
*/
export const ZEITLIMIT_STILL_MS = 500;

/*
 Die Obergrenze für den Erstkontakt. Das ist KEINE Antwortzeit, sondern nur
 die Sicherung dagegen, dass ein hängender Aufruf für immer im Speicher
 liegen bleibt. Sie ist absichtlich grosszügig.
*/
export const OBERGRENZE_KLICK_MS = 60000;

// Drei Zustände, mehr kann die Seite über den Besucher nicht wissen. Ob die
// App da ist, lässt sich ohne Fragen nicht herausfinden — und genau das ist
// Absicht, sonst wäre es ein Ausspähkanal.
export const ZUSTAND = {
  unbekannt: 'unbekannt',
  erlaubt:   'erlaubt',
  abgelehnt: 'abgelehnt',
};

/*
 Warum ein Versuch nicht zum Ziel kam. Die drei Fälle brauchen verschiedene
 Sätze — sie zu vermengen war der Grund, warum ein blockierter Browser wie
 eine fehlende App aussah.
*/
export const AUSGANG = {
  da:            'da',              // der Tuner hat geantwortet
  browserSperrt: 'browserSperrt',   // der Browser lässt die Seite nicht ans Gerät
  keinTuner:     'keinTuner',       // der Normalfall: die App läuft nicht
};

/*
 Der Stand der Browserberechtigung für den Zugriff auf das eigene Gerät.

 WARUM ÜBERHAUPT: Eine LNA-Blockade und „die App läuft nicht" werfen beide
 exakt dasselbe — `TypeError: Failed to fetch`. Gemessen unterscheiden sie
 sich nur in der Dauer (rund 1 ms gegen rund 2000 ms), und das ist auf einem
 langsamen oder ausgelasteten Rechner keine Grundlage für einen Satz, den ein
 Mensch zu lesen bekommt. Diese Abfrage ist der einzige verlässliche
 Unterschied.

 WARUM ZWEI NAMEN: Chrome hat den Berechtigungsnamen mit Version 145
 aufgespalten. `local-network` meint das örtliche Netz; wer damit nach
 127.0.0.1 fragt, bekommt auf ewig `prompt` zurück und baut darauf eine
 falsche Anzeige. Für den Rückkanal auf das eigene Gerät heisst er
 `loopback-network`. `local-network-access` ist der ältere Name und bleibt
 als Rückfall stehen.

 WARUM ES NICHT SCHEITERN DARF: Firefox und Safari kennen diese Namen
 vermutlich gar nicht, und `permissions.query` wirft bei einem unbekannten
 Namen. Das ist kein Fehler, sondern „weiss ich nicht" — dort muss der Weg
 trotzdem funktionieren.

 Diese Abfrage löst KEINEN Dialog aus. Sie liest nur den Stand.
*/
export async function frageBerechtigung() {
  for (const name of ['loopback-network', 'local-network-access']) {
    try {
      const stand = await navigator.permissions?.query({ name });
      if (stand?.state) return stand.state;   // granted | prompt | denied
    } catch {
      // Name in diesem Browser unbekannt — den nächsten versuchen.
    }
  }
  return 'unbekannt';
}

export async function frageMyRetuner(adresse = ANSCHLUSS,
                                     zeitlimitMs = ZEITLIMIT_STILL_MS) {
  try {
    /*
     Keine eigenen Kopfzeilen mitgeben. Ein GET ohne solche ist eine einfache
     Anfrage und löst keinen Vorabflug aus; mit eigenen Kopfzeilen erzwingt
     der Browser ein OPTIONS, und das beantwortet die App nicht mehr.
     `cache` ist eine Fetch-Option, keine Kopfzeile — unbedenklich.
    */
    const antwort = await fetch(adresse, {
      cache: 'no-store',
      signal: AbortSignal.timeout(zeitlimitMs),
    });
    /*
     Hierher kommt nur, was der Browser durchgelassen hat.

     Weist die App eine unbekannte Herkunft ab, antwortet sie mit 403 und
     ABSICHTLICH ohne Access-Control-Allow-Origin — sonst verriete schon die
     Abweisung, dass die App läuft. Ohne diese Kopfzeile verwirft der Browser
     die Antwort, und `fetch` wirft. Der Programmtext hier bekommt den 403
     also nie zu sehen. Das ist der Entwurf, kein Mangel.
    */
    if (!antwort.ok) return null;
    const daten = await antwort.json();
    return KENNUNGEN.has(daten?.app) ? daten : null;
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

/*
 Nach dem Klick. Jetzt dürfen beide Rückfragen erscheinen, und beide brauchen
 so lange, wie ein Mensch eben braucht.

 KEIN KURZES ZEITLIMIT AUF DEN ERSTKONTAKT. Gemessen: `AbortSignal.timeout(500)`
 bricht sauber ab, während Chromes Dialog noch steht — die Rejection kam nach
 511 ms. Ein kurzes Limit tötet damit SYSTEMATISCH jeden Erstkontakt, bei dem
 der Mensch noch nicht geklickt hat. Und der Erstkontakt ist der einzige, der
 überhaupt zählt. Der Reflex „ich warte nicht ewig auf localhost" ist hier
 genau falsch: Der Besucher sieht in diesem Moment den Dialog des Browsers
 und nicht unsere Seite.

 `beiPhase` meldet der Oberfläche, auf WEN gerade gewartet wird. Ohne das
 stünde eine Minute lang derselbe Satz, und der wäre die halbe Zeit falsch.
*/
export async function wartAufEinwilligung(adresse = ANSCHLUSS,
                                          obergrenzeMs = OBERGRENZE_KLICK_MS,
                                          beiPhase = () => {}) {
  /*
   Vorab den Stand lesen — das löst nichts aus. Steht die Berechtigung auf
   `denied`, wäre jeder Versuch vergeblich: dann sofort abbrechen, statt eine
   Minute lang ins Leere zu fragen und dem Besucher am Ende den falschen Satz
   hinzustellen.
  */
  const stand = await frageBerechtigung();
  if (stand === 'denied') {
    return { ausgang: AUSGANG.browserSperrt, daten: null };
  }

  /*
   Auf wen wartet der Besucher zuerst?

   prompt    → der Browser fragt gleich. Darauf hinweisen, sonst sucht er
               die Antwort auf unserer Seite statt in der Leiste des Browsers.
   granted   → der Browser ist längst durch, nur die App ist noch am Zug.
   unbekannt → Firefox, Safari, alles ohne diesen Berechtigungsnamen. Dort
               gibt es keinen bekannten Browserdialog, also gleich die App
               nennen.
  */
  let phase = stand === 'prompt' ? 'browser' : 'app';
  beiPhase(phase);

  /*
   Solange der erste Versuch läuft, den Stand im Auge behalten: Sobald der
   Besucher dem Browser zugestimmt hat, ist die App am Zug, und der Text soll
   das sagen. Der Beobachter fasst nichts an, er liest nur.
  */
  const beobachter = setInterval(async () => {
    if (phase === 'app') return;
    if (await frageBerechtigung() === 'granted') {
      phase = 'app';
      beiPhase(phase);
    }
  }, 500);

  try {
    const ende = Date.now() + obergrenzeMs;

    // Der erste Versuch bekommt die volle Spanne — er ist derjenige, der den
    // Dialog des Browsers auslöst.
    const erste = await frageMyRetuner(adresse, obergrenzeMs);
    if (erste) return { ausgang: AUSGANG.da, daten: erste };

    /*
     Der Browser ist durch, die App fragt noch. Ihr Dialog lebt 60 Sekunden
     (`OriginConsent.askTimeout`) — deshalb wird bis zur selben Grenze
     nachgefragt. Wären die Spannen verschieden, gäbe es ein Fenster, in dem
     der Nutzer zustimmt und die Seite schon aufgegeben hat.
    */
    while (Date.now() < ende) {
      await new Promise((weiter) => setTimeout(weiter, 1000));
      const daten = await frageMyRetuner(adresse, ZEITLIMIT_STILL_MS);
      if (daten) return { ausgang: AUSGANG.da, daten };
    }

    // Erst jetzt entscheiden, was der Besucher zu lesen bekommt. Hat er den
    // Dialog des Browsers abgelehnt, steht der Stand inzwischen auf `denied`.
    const danach = await frageBerechtigung();
    return {
      ausgang: danach === 'denied' ? AUSGANG.browserSperrt : AUSGANG.keinTuner,
      daten: null,
    };
  } finally {
    clearInterval(beobachter);
  }
}
