// ═══════════════════════════════════════════════════════════════════
// Was gerade laeuft
//
// Rueckmeldung eines Testers, 22.08.2026: „Irgendwie stimmt dann das Bild
// vom Plattenladen nicht mehr, wenn man zwar weiss, welches Genre, aber
// nicht welcher Kuenstler."
//
// Er hat recht. In einem Plattenladen steht der Kuenstler auf der Huelle.
//
// ZWEI WEGE, in dieser Reihenfolge:
//
// 1. `/api/titel` — ein Anschlagbrett auf unserem eigenen Server. Es liest
//    den Titel dort, wo die Sender ihn wirklich mitschicken: mitten im
//    Tonstrom (ICY), wohin ein Browser nicht reicht. Eine Antwort fuer
//    alle, ohne Sender in der Anfrage. Damit verraet kein Abruf, wer was
//    hoert — waere es je Sender, entstuende aus einer Messung ohne
//    Adressfeld durch die Hintertuer ein Hoerprotokoll.
//    Gebaut von Micha, Vorgang #9. Deckt rund 130 Sender.
//
// 2. Die Nebenadressen der Haeuser selbst, falls das Brett den Sender
//    (noch) nicht kennt oder es den Dienst nicht gibt — auf GitHub Pages
//    liegt er nicht. Alle 165 Sender daraufhin abgeklopft, 22.08.2026:
//
//      21  SomaFM        13  Icecast status-json.xsl
//      13  Azuracast      4  Zeno, offene Leitung
//       2  laut.fm        1  Shoutcast stats?json=1
//
//    Zusammen 61 von 156 Sendern ohne HLS. HLS fuehrt den Titel im Strom
//    mit — den liest die Abspielmaschine selbst, nicht dieses Modul.
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
    /*
     Erst nachsehen, WAS da kommt.

     hirschmilch.de beantwortet jeden Pfad mit Ton: `/status-json.xsl`
     liefert 200 und `content-type: audio/mpeg`. Ohne diese Zeile begaenne
     `.json()` einen Radiostrom zu lesen und liefe sieben Sekunden lang —
     alle zwanzig Sekunden, beim Zuhoerer auf die Rechnung.

     Wieder dasselbe Muster wie heute schon dreimal: ein 200, das aussieht
     wie eine Antwort und keine ist.
    */
    if (!/json|text/i.test(a.headers.get('content-type') || '')) return null;
    return sauber(wandle(await a.json()));
  } catch { return null; }
}

// ── Das Anschlagbrett ─────────────────────────────────────────────

const DIENST = '/api/titel';
const STAND_GILT_MS = 15000;
let stand = null;      // { zeit, titel } — fuer alle Sender derselbe
let dienstDa = null;   // null = noch nicht gefragt

/*
 Holt den gemeinsamen Stand, hoechstens alle 15 s. Ein Abruf bringt die
 Titel aller Sender mit — der naechste Sender kostet dann nichts mehr.
*/
async function holeStand() {
  if (stand && Date.now() - stand.zeit < STAND_GILT_MS) return stand.titel;
  try {
    const a = await fetch(DIENST, { signal: AbortSignal.timeout(6000) });
    if (!a.ok) { dienstDa = false; return null; }
    const j = await a.json();
    dienstDa = true;
    stand = { zeit: Date.now(), titel: j?.titel || {} };
    return stand.titel;
  } catch { dienstDa = false; return null; }
}

async function vomDienst(sender) {
  const alle = await holeStand();
  return alle ? sauber(alle[sender.id]) : null;
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

/*
 Shoutcast, und hier ist Sorgfalt noetig: `/stats?json=1` nennt EINEN Titel
 fuer den ganzen Server. Auf hirschmilch.de liegen sechzehn Mounts auf
 demselben Port — Techno, Hypnotic, Progressive, Electronic zeigten
 daraufhin alle denselben Titel. Vier Kanaele, ein Titel, und zwar der
 falsche: ein Ergebnis, das nach einem Ergebnis aussieht.

 `/statistics?json=1` nennt sie einzeln, mit `streampath`. Findet sich der
 Mount dort, gilt nur er. Erst wenn es diese Adresse gar nicht gibt, ist
 `/stats?json=1` zu gebrauchen — dann hat der Server nur einen Strom.
*/
async function vonShoutcast(u) {
  const einzeln = await hole(`${u.origin}/statistics?json=1`, (j) => {
    let q = j?.streams || j?.stream;
    if (!q) return null;
    if (!Array.isArray(q)) q = [q];
    const treffer = q.find((x) => (x.streampath || '') === u.pathname);
    return treffer ? treffer.songtitle : '';   // '' = Liste da, Mount nicht drin
  });
  if (einzeln) return einzeln;
  return hole(`${u.origin}/stats?json=1`, (j) => j?.songtitle);
}

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

  const wege = wegeFuer(u);
  let leer = 0;

  const versuch = async () => {
    const vomBrett = await vomDienst(sender);
    if (vomBrett) return melde(vomBrett);

    // Das Brett kennt ihn nicht — dann bei seinem Haus selbst nachfragen.
    for (const [weg, kuerzel] of wege) {
      const titel = await weg(u, kuerzel);
      if (titel) return melde(titel);
    }

    /*
     Gibt es das Brett, lohnt Geduld: Es fuellt sich erst, wenn jemand den
     Sender startet — beim ersten Zug ist es fuer ihn noch leer, beim
     naechsten steht er drin.

     Gibt es das Brett nicht, ist ein Sender, der es einmal nicht
     herausgibt, auch beim zwanzigsten Mal stumm. Dann sofort aufhoeren:
     zwanzig vergebliche Anfragen je Minute waeren unhoeflich gegenueber
     einem fremden Server.
    */
    if (++leer >= (dienstDa ? 5 : 1)) haltAn();
  };

  const zeno = /stream\.zeno\.fm\/([a-z0-9]+)/i.exec(sender.stream);
  if (zeno && typeof EventSource === 'function' && ueberLeitung(zeno[1], melde)) {
    // Die offene Leitung meldet von selbst — aber sie meldet erst beim
    // naechsten Wechsel. Bis dahin ans Brett halten.
    versuch();
    return;
  }

  versuch();
  laufend = setInterval(versuch, TAKT_MS);
}

export function haltAn() {
  if (laufend) clearInterval(laufend);
  laufend = null;
  if (leitung) leitung.close();
  leitung = null;
}
