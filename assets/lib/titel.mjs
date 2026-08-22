// ═══════════════════════════════════════════════════════════════════
// Was gerade laeuft
//
// Rueckmeldung eines Testers, 22.08.2026: „Schade auch, dass man nicht
// weiss, was man da gerade hoert, aber ich vermute, die Sender schicken die
// Info nicht mit, oder?"
//
// Er hat recht — die meisten nicht. Gemessen an allen 157 Sendern:
//
//   14  Icecast gibt den Titel heraus UND erlaubt den Zugriff
//   22  SomaFM, ueber die eigene Adresse des Hauses
//    6  Icecast hat ihn, gibt ihn aber nicht heraus (kein CORS)
//    5  Icecast antwortet, Titel ist leer
//  132  gar kein Icecast
//
// Dazu kommen die HLS-Sender, die ihn im Strom mitfuehren — die liest die
// Abspielmaschine selbst, nicht dieses Modul.
//
// WAS DIESES MODUL NICHT TUT: raten. Kein „unbekannt", kein Platzhalter,
// keine drei Punkte. Kommt nichts, steht nichts da. Ein Feld, das meistens
// „unbekannt" sagt, ist schlimmer als kein Feld — es erinnert bei jedem
// Sender daran, dass etwas fehlt.
//
// UND ES FRAGT NUR, SOLANGE JEMAND ZUHOERT. Kein Abruf im Hintergrund, kein
// Abruf fuer einen Sender, den niemand gestartet hat.
// ═══════════════════════════════════════════════════════════════════

const TAKT_MS = 20000;
let laufend = null;

async function hole(adresse, wandle) {
  try {
    const a = await fetch(adresse, { signal: AbortSignal.timeout(7000) });
    if (!a.ok) return null;
    return wandle(await a.json());
  } catch { return null; }
}

// SomaFM fuehrt je Kanal eine eigene Liste. Der Kanalname steckt in der
// Stromadresse: .../groovesalad-128-mp3 -> groovesalad
function somaKanal(stream) {
  // Zwei Formen: ice5.somafm.com/groovesalad-128-mp3
  //         und hls.somafm.com/hls/groovesalad/FLAC/program.m3u8
  const hls = /somafm\.com\/hls\/([a-z0-9]+)\//i.exec(stream);
  if (hls) return hls[1];
  const eis = /somafm\.com\/(?:[a-z0-9]+\/)?([a-z0-9]+)[-.]/i.exec(stream);
  return eis ? eis[1] : null;
}

async function vonSoma(stream) {
  const kanal = somaKanal(stream);
  if (!kanal) return null;
  return hole(`https://somafm.com/songs/${kanal}.json`, (j) => {
    const s = j?.songs?.[0];
    if (!s?.title) return null;
    return s.artist ? `${s.artist} — ${s.title}` : s.title;
  });
}

async function vonIcecast(stream) {
  let u;
  try { u = new URL(stream); } catch { return null; }
  return hole(`${u.origin}/status-json.xsl`, (j) => {
    let q = j?.icestats?.source;
    if (!q) return null;
    if (!Array.isArray(q)) q = [q];
    const pfad = u.pathname.replace(/\.(mp3|aac|ogg)$/i, '');
    const treffer = q.find((s) => (s.listenurl || '').includes(pfad)) || q[0];
    return treffer?.title || treffer?.yp_currently_playing || null;
  });
}

/*
 Startet die Abfrage fuer einen Sender. Ein zweiter Aufruf loest den ersten
 ab — es laeuft immer nur einer, so wie immer nur ein Sender spielt.

 Findet der erste Versuch nichts, wird nicht weiter gefragt. Ein Sender, der
 es einmal nicht herausgibt, gibt es auch beim zwanzigsten Mal nicht heraus,
 und zwanzig vergebliche Anfragen je Minute waeren unhoeflich gegenueber
 einem fremden Server.
*/
export function beobachteTitel(sender, melde) {
  haltAn();
  if (!sender?.stream) return;
  const wege = [vonSoma, vonIcecast];
  let gestorben = false;

  const versuch = async () => {
    for (const weg of wege) {
      const titel = await weg(sender.stream);
      if (titel) return melde(titel);
    }
    // Beim ersten Mal nichts: dieser Sender verraet es nicht.
    if (!gestorben) { gestorben = true; haltAn(); }
  };

  versuch();
  laufend = setInterval(versuch, TAKT_MS);
}

export function haltAn() {
  if (laufend) clearInterval(laufend);
  laufend = null;
}
