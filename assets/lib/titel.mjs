// ═══════════════════════════════════════════════════════════════════
// Was gerade laeuft
//
// Rueckmeldung eines Testers, 22.08.2026: „Irgendwie stimmt dann das Bild
// vom Plattenladen nicht mehr, wenn man zwar weiss, welches Genre, aber
// nicht welcher Kuenstler."
//
// Er hat recht. In einem Plattenladen steht der Kuenstler auf der Huelle.
//
// Die meisten Sender schicken den Titel sehr wohl mit — nur mitten im
// Tonstrom (ICY), und da kommt ein Browser nicht heran. Was er erreichen
// kann, sind Nebenadressen, die manche Haeuser danebenstellen. Alle 165
// Sender daraufhin abgeklopft, am 22.08.2026:
//
//   21  SomaFM, ueber die eigene Adresse des Hauses
//   13  Icecast, status-json.xsl mit Freigabe
//   13  Azuracast, nowplaying_static
//    4  Zeno, offene Leitung statt Abfrage
//    2  laut.fm
//    1  Shoutcast, stats?json=1
//   ──
//   54  von 165, dazu die HLS-Sender, die ihn im Strom mitfuehren
//
//   14  haben eine Adresse, sperren aber den Zugriff (CORS)
//   88  haben gar keine — bei ihnen hilft nur ein Dienst auf dem Server,
//       der den Tonstrom mitliest. Das ist Vorgang #9.
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
let leitung = null;

// Manche Haeuser tragen dort einen Platzhalter ein statt eines Titels.
// Angezeigt waere er schlimmer als ein leeres Feld.
const PLATZHALTER = [
  /^now playing info goes here$/i,
  /^airtime\b.*\boffline$/i,
  /^(unknown|unbekannt|n\/a|none|null)$/i,
  /^[\s\-–—.·]*$/,
  /^\*\*/,                       // Sendeplaene: ** Repeats (Master List)
  /\bwww\.|https?:\/\//i,        // Senderadresse statt Titel
];

function sauber(x) {
  if (typeof x !== 'string') return null;
  // Fuehrende Striche kommen vor, wenn der Kuenstler fehlt: „- Lil Uzi Vert"
  const t = x.replace(/\s+/g, ' ').replace(/^[\s\-–—]+/, '').trim();
  if (!t) return null;
  return PLATZHALTER.some((m) => m.test(t)) ? null : t;
}

const paar = (a, b) => (a && b ? `${a} — ${b}` : b || a || null);

async function hole(adresse, wandle) {
  try {
    const a = await fetch(adresse, { signal: AbortSignal.timeout(7000) });
    if (!a.ok) return null;
    return sauber(wandle(await a.json()));
  } catch { return null; }
}

// ── Die Wege, je nach Haus ────────────────────────────────────────

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

const vonSoma = (u) => hole(`https://somafm.com/songs/${somaKanal(u.href)}.json`,
  (j) => { const s = j?.songs?.[0]; return s?.title ? paar(s.artist, s.title) : null; });

const vonAzuracast = (u, k) => hole(`${u.origin}/api/nowplaying_static/${k}.json`,
  (j) => j?.now_playing?.song?.text);

const vonLautFm = (u, k) => hole(`https://api.laut.fm/station/${k}/current_song`,
  (j) => paar(j?.artist?.name, j?.title));

const vonRadioCo = (u, k) => hole(`https://public.radio.co/stations/${k}/status`,
  (j) => j?.current_track?.title);

const vonRadioking = (u, k) => hole(`https://api.radioking.io/widget/radio/${k}/track/current`,
  (j) => paar(j?.artist, j?.title));

const vonShoutcast = (u) => hole(`${u.origin}/stats?json=1`, (j) => j?.songtitle);

function vonIcecast(u) {
  return hole(`${u.origin}/status-json.xsl`, (j) => {
    let q = j?.icestats?.source;
    if (!q) return null;
    if (!Array.isArray(q)) q = [q];
    const pfad = u.pathname.replace(/\.(mp3|aac|ogg|flac)$/i, '');
    const treffer = q.find((s) => (s.listenurl || '').includes(pfad)) || q[0];
    return treffer?.title || treffer?.yp_currently_playing || null;
  });
}

/*
 Zeno haelt eine offene Leitung, statt sich fragen zu lassen — der Titel
 kommt von selbst, sobald er wechselt. Das ist sparsamer als jede Abfrage
 und muss deshalb anders behandelt werden als die uebrigen Wege.
*/
function ueberLeitung(mount, melde) {
  try {
    leitung = new EventSource(`https://api.zeno.fm/mounts/metadata/subscribe/${mount}`);
    leitung.onmessage = (e) => {
      let t = null;
      try { t = sauber(JSON.parse(e.data)?.streamTitle); } catch { /* kein JSON */ }
      if (t) melde(t);
    };
    leitung.onerror = () => haltAn();
    return true;
  } catch { return false; }
}

// Sucht den zustaendigen Weg an der Stromadresse. Ein Sender gehoert zu
// genau einem Haus — reihum alle durchzuprobieren waere unhoeflich
// gegenueber fremden Servern.
function wegeFuer(u) {
  const s = u.href, w = [];
  const nimm = (re, f) => { const m = re.exec(s); if (m) w.push([f, m[1]]); };

  if (/somafm\.com/i.test(s)) return [[vonSoma, null]];
  nimm(/\/listen\/([^/]+)\//, vonAzuracast);
  nimm(/stream\.laut\.fm\/([a-z0-9_-]+)/i, vonLautFm);
  nimm(/streams\.radio\.co\/([a-z0-9]+)\//i, vonRadioCo);
  nimm(/listen\.radioking\.com\/radio\/(\d+)\//i, vonRadioking);
  // Zuletzt die beiden, die auf jedem Standardserver liegen koennen
  w.push([vonIcecast, null], [vonShoutcast, null]);
  return w;
}

/*
 Startet die Abfrage fuer einen Sender. Ein zweiter Aufruf loest den ersten
 ab — es laeuft immer nur einer, so wie immer nur ein Sender spielt.

 Findet der erste Durchgang nichts, wird nicht weiter gefragt. Ein Sender,
 der es einmal nicht herausgibt, gibt es auch beim zwanzigsten Mal nicht
 heraus, und zwanzig vergebliche Anfragen je Minute waeren unhoeflich
 gegenueber einem fremden Server.
*/
export function beobachteTitel(sender, melde) {
  haltAn();
  if (!sender?.stream) return;

  let u;
  try { u = new URL(sender.stream); } catch { return; }

  const zeno = /stream\.zeno\.fm\/([a-z0-9]+)/i.exec(sender.stream);
  if (zeno && typeof EventSource === 'function') {
    if (ueberLeitung(zeno[1], melde)) return;
  }

  const wege = wegeFuer(u);
  let gestorben = false;

  const versuch = async () => {
    for (const [weg, kuerzel] of wege) {
      const titel = await weg(u, kuerzel);
      if (titel) return melde(titel);
    }
    if (!gestorben) { gestorben = true; haltAn(); }
  };

  versuch();
  laufend = setInterval(versuch, TAKT_MS);
}

export function haltAn() {
  if (laufend) clearInterval(laufend);
  laufend = null;
  if (leitung) leitung.close();
  leitung = null;
}
