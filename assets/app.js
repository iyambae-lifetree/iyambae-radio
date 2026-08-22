// ═══════════════════════════════════════════════════════════════════
// IYAMBAE Radio — Programmcode
//
// Die Senderliste steckt NICHT hier drin, sondern in data/sender.json.
// Genau deshalb konnten früher acht FLAC-Sender versehentlich mitten
// im Genre-Array landen: 6.700 Zeilen Daten im Programmtext.
// ═══════════════════════════════════════════════════════════════════

import { waehleUeberraschung } from './lib/gewichtung.mjs';
import { findeVerwandten } from './lib/verwandt.mjs';
import { frageMyRetuner, wartAufEinwilligung, frageBerechtigung,
         anzeigeStimmung, anzeigeQuelle, ZUSTAND, AUSGANG }
  from './lib/myretuner.mjs';
import { tippDerWoche, dazuPassend } from './lib/wochentipp.mjs';
import { senderbild, labelbild, hatEigenesLogo, regalton, REGALTON, MARKE, LABEL_MARKE, huellenzeilen,
         huellengroesse, regalmosaik, zerlegeName, haeuserMitMehreren, bandbreite }
  from './lib/senderbild.mjs';
import { symbol, setzeSymbole } from './lib/symbole.mjs';
import { leererFilter, istGefiltert, anzahlAktiv, wendeAn, vorschau,
         regionVon, etikettName, regionName, SCHNELL } from './lib/achsen.mjs';
import { beobachteAktualisierung } from './lib/aktualisierung.mjs';
import { beobachteFehler, einwilligungsstand, widerrufeEinwilligung }
  from './lib/fehlerbericht.mjs';
import { miss, messungLaeuft, setzeMessung } from './lib/messung.mjs';
import { ladeSprache, uebersetzeDokument, baueSprachumschalter, t }
  from './lib/sprache.mjs';

// ── Sprache ────────────────────────────────────────────────────────
// Zuerst, denn alles darunter schlaegt seine Texte hier nach. Die festen
// Texte im Dokument werden in einem Zug ersetzt, bevor der Ladeschirm faellt.
await ladeSprache();
uebersetzeDokument();
/*
 Der Umschalter wird gebaut, nicht ausgeliefert: Seine Verweise haengen von
 der Adresse ab, auf der man gerade steht — wer /fr/?los=meine liest, soll
 beim Wechsel auf /ja/?los=meine landen und nicht auf der Startseite.
*/
const sprachwahl = document.getElementById('sprachwahl');
baueSprachumschalter(sprachwahl);
/*
 Der Wechsel wird gemeldet, und zwar von hier aus.

 Der naheliegende Ort waere der Klickbehandler in sprache.mjs gewesen — dann
 muesste die aber messung.mjs einbinden, und messung.mjs bindet sprache.mjs
 ein. ES-Module tragen so einen Ring, aber er ist eine Falle fuer den
 Naechsten; ein zweiter Zuhoerer am selben Element kostet nichts.

 Vor dem Seitenwechsel, nicht danach: location.assign raeumt dieses Fenster
 ab. sendBeacon ueberlebt das, dafuer ist es gebaut.

 Gemeldet wird nur, DASS gewechselt wurde und wohin. Welche Sprache jemand
 benutzt, haengt ohnehin an jedem Ereignis; die Frage hier ist, ob der
 Umschalter ueberhaupt gefunden wird.
*/
sprachwahl?.addEventListener('click', (e) => {
  const verweis = e.target.closest('a[hreflang]');
  if (verweis) miss('sprache', { wert: verweis.hreflang });
});

// ── Katalog laden ──────────────────────────────────────────────────
const antwort = await fetch('/data/sender.json');
if (!antwort.ok) throw new Error('Katalog nicht ladbar: ' + antwort.status);
const KATALOG = await antwort.json();
const REGALE = KATALOG.regale;
// Fuer die Zuordnung von Fehlerberichten. Der Katalog traegt ohnehin eine
// Fassung, und sie steigt mit jeder Auslieferung.
const FASSUNG = KATALOG._version ?? 'unbekannt';
const SENDER = KATALOG.sender.filter(s => s.status !== 'tot');

// ── Örtlicher Speicher ─────────────────────────────────────────────
const SCHLUESSEL = {
  favoriten:  'hz_favoriten',
  zuletzt:    'hz_zuletzt',
  gehoert:    'hz_gehoert',
  fehlschlag: 'hz_fehlschlaege',
  lautstaerke:'hz_lautstaerke',
  pitch432:   'hz_pitch432',
  myretuner:  'hz_myretuner',
  // Welcher der drei Zustaende aus ZUSTAND zuletzt galt. Mehr wird nicht
  // gemerkt — die Einwilligung selbst liegt in der App, nicht hier.
  mrZustand:  'hz_mr_zustand',
};

const speicher = {
  lies(schluessel, ersatz) {
    try {
      const roh = localStorage.getItem(schluessel);
      return roh === null ? ersatz : JSON.parse(roh);
    } catch { return ersatz; }
  },
  schreib(schluessel, wert) {
    try { localStorage.setItem(schluessel, JSON.stringify(wert)); } catch {}
  },
};

// Beim Laden gemerkt: Ein weitergegebener Link steht hinter dem
// Rautezeichen, und wer ihn spaeter auswerten will, findet ihn dort nicht
// mehr zuverlaessig. Also gleich festhalten.
const GETEILTE_PLATTEN = (/[#&]platten=([a-z0-9.\-]+)/i.exec(location.hash) || [])[1] || '';

const ladeGehoert  = () => speicher.lies(SCHLUESSEL.gehoert, {});
const ladeZuletzt  = () => speicher.lies(SCHLUESSEL.zuletzt, []);

function zaehleGehoert(senderId) {
  const g = ladeGehoert();
  g[senderId] = (g[senderId] ?? 0) + 1;
  speicher.schreib(SCHLUESSEL.gehoert, g);
}

function merkeZuletzt(senderId) {
  const liste = [senderId, ...ladeZuletzt().filter(id => id !== senderId)].slice(0, 20);
  speicher.schreib(SCHLUESSEL.zuletzt, liste);
}

function zaehleFehlschlag(senderId) {
  const f = speicher.lies(SCHLUESSEL.fehlschlag, {});
  f[senderId] = (f[senderId] ?? 0) + 1;
  speicher.schreib(SCHLUESSEL.fehlschlag, f);
}

function loescheFehlschlag(senderId) {
  const f = speicher.lies(SCHLUESSEL.fehlschlag, {});
  if (f[senderId]) { delete f[senderId]; speicher.schreib(SCHLUESSEL.fehlschlag, f); }
}

// Ab dem dritten Fehlschlag in Folge rutscht ein Sender ans Regalende
// und wird in der Auslage nicht mehr gezogen.
function istWackelig(senderId) {
  return (speicher.lies(SCHLUESSEL.fehlschlag, {})[senderId] ?? 0) >= 3;
}

// ── Wiedergabe ─────────────────────────────────────────────────────
class AudioEngine {
  constructor() {
    // ZWEI Abspielelemente, und das aus einem zwingenden Grund:
    //
    // Sobald ein Element einmal in den Web-Audio-Graphen gehängt wurde
    // (createMediaElementSource), bleibt es dort — das lässt sich nicht
    // rückgängig machen und pro Element nur einmal tun. Lädt es danach
    // einen Stream ohne CORS-Freigabe, gibt der Graph Stille aus. Kein
    // Fehler, kein Hinweis, einfach kein Ton.
    //
    // Deshalb: ein Element für Sender mit Freigabe (durch den Graphen,
    // mit echter Pegelmessung) und eines für alle übrigen (direkt an den
    // Ausgang, ohne Graph).
    this.audioDirekt  = new Audio();
    this.audioAnalyse = new Audio();
    this.audioAnalyse.crossOrigin = 'anonymous';
    for (const el of [this.audioDirekt, this.audioAnalyse]) {
      el.preload = 'none';
      this._verdrahteElement(el);
    }
    this.audio = this.audioDirekt;   // zeigt stets auf das gerade benutzte

    this.laeuft = false;
    this.aktuellerSender = null;
    this.pitchFaktor = 432 / 440;   // ≈ 0,9818
    this.ist432An = true;
    this.lautstaerke = 0.7;
    this.istStumm = false;
    this.vorherigeLautstaerke = 0.7;
    this._simDaten = new Float32Array(128);
    this._rueckrufe = { start: [], fehler: [], laden: [], puffern: [], ohneZugriff: [] };

    this._audioCtx = null;
    this._analyse = null;
    this._quelle = null;
    this._frequenzDaten = null;
    this.analyseEcht = false;

    // Der Signalkern des IYAMBAE Tuners als WebAssembly. Steht erst zur Verfügung, wenn
    // der Graph aufgebaut ist und das Modul geladen wurde — bis dahin und
    // bei jedem Fehlschlag bleibt es beim Weg über playbackRate.
    this._retuner = null;
    this.retunerBereit = false;

    this.setzeLautstaerke(this.lautstaerke, false);
  }

  _verdrahteElement(el) {
    el.addEventListener('playing', () => {
      if (el !== this.audio) return;          // Meldungen des ruhenden Elements ignorieren
      this.laeuft = true; this._rufe('start');
    });
    el.addEventListener('pause', () => { if (el === this.audio) this.laeuft = false; });
    el.addEventListener('error', () => { if (el === this.audio) this._rufe('fehler'); });
    el.addEventListener('loadstart', () => { if (el === this.audio) this._rufe('laden'); });
    el.addEventListener('waiting',  () => { if (el === this.audio) this._rufe('puffern'); });
  }

  _rufe(art, ...was) { this._rueckrufe[art].forEach(fn => fn(...was)); }
  bei(art, fn) { this._rueckrufe[art].push(fn); }

  // Baut den Analysegraphen — nur einmal, und nur um das Analyse-Element.
  _richteAnalyseEin() {
    if (this._analyse) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this._audioCtx = new Ctx();
      this._quelle = this._audioCtx.createMediaElementSource(this.audioAnalyse);
      this._analyse = this._audioCtx.createAnalyser();
      this._analyse.fftSize = 256;
      this._analyse.smoothingTimeConstant = 0.75;
      this._quelle.connect(this._analyse);
      this._analyse.connect(this._audioCtx.destination);
      this._frequenzDaten = new Uint8Array(this._analyse.frequencyBinCount);

      // Nebenläufig, ohne den Start zu verzögern: Schlägt es fehl, bleibt
      // es beim bisherigen Weg über playbackRate.
      this._richteRetunerEin();
      return true;
    } catch {
      this._analyse = null;
      return false;
    }
  }

  /*
   Den Signalkern des IYAMBAE Tuners als WebAssembly in den Graphen hängen.

   Der Unterschied zum bisherigen Weg ist nicht kosmetisch: `playbackRate`
   ändert Tonhöhe *und* Tempo — ein Stück läuft dabei 1,8 % langsamer. Der
   Signalkern ändert nur die Tonhöhe, so wie der IYAMBAE Tuner auf dem Rechner.

   Gilt nur für Sender mit CORS-Freigabe: Ohne sie kommt der Strom gar nicht
   erst in den Graphen (siehe Kommentar im Konstruktor), und es bleibt beim
   Raten über playbackRate.
  */
  async _richteRetunerEin() {
    if (this._retuner || !this._audioCtx?.audioWorklet) return false;
    try {
      const [, antwort] = await Promise.all([
        this._audioCtx.audioWorklet.addModule('/assets/lib/retuner-worklet.js'),
        fetch('/assets/wasm/retuner.wasm'),
      ]);
      if (!antwort.ok) throw new Error('wasm ' + antwort.status);
      const bytes = await antwort.arrayBuffer();

      const knoten = new AudioWorkletNode(this._audioCtx, 'retuner', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });

      await new Promise((fertig, fehler) => {
        const zeit = setTimeout(() => fehler(new Error('Zeitüberschreitung')), 5000);
        knoten.port.onmessage = (e) => {
          clearTimeout(zeit);
          if (e.data?.art === 'bereit') fertig(e.data);
          else fehler(new Error(e.data?.text || 'unbekannt'));
        };
        knoten.port.postMessage({ art: 'wasm', bytes, frames: 2048 }, [bytes]);
      });

      // Zwischen Quelle und Analyse einhängen — so zeigt der Visualizer,
      // was auch zu hören ist.
      this._quelle.disconnect(this._analyse);
      this._quelle.connect(knoten);
      knoten.connect(this._analyse);

      this._retuner = knoten;
      this.retunerBereit = true;
      this.wendePitchAn();
      return true;
    } catch {
      this._retuner = null;
      this.retunerBereit = false;
      return false;
    }
  }

  async spiele(sender) {
    if (sender) {
      this.aktuellerSender = sender;
      const zielElement = sender.cors ? this.audioAnalyse : this.audioDirekt;

      // Das bisherige Element anhalten und freigeben, sonst laufen zwei
      // Sender gleichzeitig oder der alte puffert im Hintergrund weiter.
      if (this.audio !== zielElement) {
        try {
          this.audio.pause();
          this.audio.removeAttribute('src');
          this.audio.load();
        } catch {}
      }
      this.audio = zielElement;
      this.analyseEcht = sender.cors ? this._richteAnalyseEin() : false;
      this.audio.src = sender.stream;
    }

    if (this.audio === this.audioAnalyse && this._audioCtx?.state === 'suspended') {
      try { await this._audioCtx.resume(); } catch {}
    }

    this.wendePitchAn();
    this.audio.volume = this.istStumm ? 0 : this.lautstaerke;
    try {
      await this.audio.play();
      this.laeuft = true;
      this._wacheUeberStille();
    } catch (e) {
      if (e.name !== 'AbortError') this._rufe('fehler');
    }
  }

  /*
   ═══ Die Stillewache ═══════════════════════════════════════════════

   Ein Element im Web-Audio-Graphen, dessen Quelle den Kopfeintrag
   `access-control-allow-origin` NICHT mitschickt, gibt STILLE aus. Kein
   Fehler, kein Ereignis — die Zeit laeuft weiter, der Balkenkranz zappelt,
   und der Besucher hoert nichts.

   WARUM DER KATALOG DAS NICHT LOESEN KANN: Der Wert steht dort als `cors`
   und ist gemessen. Aber er ist nicht stabil. Dreimal hintereinander
   gemessen ergab bei Kiosk Radio `true,true,false` und bei Classic Vinyl HD
   `false,true,true` — offenbar ein Verteiler, bei dem nur ein Teil der
   Knoten den Eintrag mitschickt. Von 40 geprueften Sendern mit cors:true
   antworteten VIER nicht zuverlaessig.

   Welcher Wert im Katalog steht, ist damit Glueckssache. Die Seite muss es
   selbst merken.

   WIE: Nach dem Start zwei Sekunden lang in den Analysator sehen. Laeuft die
   Zeit und bleibt der Pegel bei exakt null, ist es diese Stille — echte
   Musik hat immer Rauschen. Dann still auf das direkte Element umschalten
   und den Sender fuer diese Sitzung als „ohne Zugriff" merken.

   Der Besucher merkt davon eine Verzoegerung von zwei Sekunden und sonst
   nichts. Das ist besser als Stille, und es ist besser, als ihn eine
   Fehlermeldung lesen zu lassen, mit der er nichts anfangen kann.
  */
  _wacheUeberStille() {
    clearTimeout(this._stilleWache);
    if (this.audio !== this.audioAnalyse || !this.analyseEcht || !this._analyse) return;
    const sender = this.aktuellerSender;
    const begonnen = this.audio.currentTime;
    const daten = new Uint8Array(this._analyse.frequencyBinCount);

    this._stilleWache = setTimeout(() => {
      if (!this.laeuft || this.aktuellerSender !== sender) return;
      // Die Zeit muss gelaufen sein — sonst puffert er nur, und das ist
      // keine Stille, sondern eine langsame Leitung.
      if (this.audio.currentTime - begonnen < 0.5) return this._wacheUeberStille();
      this._analyse.getByteFrequencyData(daten);
      if (daten.some((w) => w > 0)) return;          // es kommt Ton, alles gut

      // Stille trotz laufender Zeit: der Graph ist vergiftet.
      sender.cors = false;
      this._rufe('ohneZugriff', sender);
      this.spiele(sender);
    }, 2000);
  }

  pausiere() { clearTimeout(this._stilleWache); this.audio.pause(); this.laeuft = false; }

  wechsle() {
    if (this.laeuft) this.pausiere();
    else if (this.aktuellerSender) this.spiele();
  }

  // Beide Elemente gleich einstellen, damit ein Wechsel nichts verstellt.
  wendePitchAn() {
    /*
     Zwei Wege, je nachdem welches Element gerade spielt:

     Sender MIT CORS laufen durch den Graphen — dort macht der Signalkern
     des IYAMBAE Tuners die Arbeit, exakt und ohne Tempoänderung. `playbackRate`
     bleibt auf 1.

     Sender OHNE CORS erreichen den Graphen nicht (siehe Konstruktor). Für sie
     bleibt es beim bisherigen Weg: `playbackRate` zieht Tonhöhe und Tempo
     gemeinsam herunter, das Stück läuft also 1,8 % langsamer. Hörbar
     schlechter, aber besser als nichts.
    */
    for (const el of [this.audioDirekt, this.audioAnalyse]) {
      const uebernimmtKern = (el === this.audioAnalyse) && this.retunerBereit;
      el.playbackRate = (this.ist432An && !uebernimmtKern) ? this.pitchFaktor : 1.0;
      el.preservesPitch = false;
      el.webkitPreservesPitch = false;
    }
    if (this._retuner) {
      this._retuner.parameters.get('faktor').value =
        this.ist432An ? this.pitchFaktor : 1.0;
    }
  }

  /// Stimmt der Signalkern gerade um — oder raet die Seite noch?
  kernUebernimmt() {
    return !!(this.retunerBereit && this.audio === this.audioAnalyse && this.ist432An);
  }

  setze432(an) {
    this.ist432An = !!an;
    this.wendePitchAn();
    speicher.schreib(SCHLUESSEL.pitch432, this.ist432An);
  }

  statusText() {
    if (!this.ist432An) return t('status.live440');
    return this.kernUebernimmt() ? t('status.live432Gemessen') : t('status.live432');
  }

  setzeLautstaerke(wert, merken = true) {
    this.lautstaerke = Math.max(0, Math.min(1, wert));
    this.istStumm = this.lautstaerke === 0;
    for (const el of [this.audioDirekt, this.audioAnalyse]) {
      el.volume = this.istStumm ? 0 : this.lautstaerke;
    }
    if (merken) speicher.schreib(SCHLUESSEL.lautstaerke, this.lautstaerke);
  }

  wechsleStumm() {
    if (this.istStumm) { this.setzeLautstaerke(this.vorherigeLautstaerke || 0.7); this.istStumm = false; }
    else { this.vorherigeLautstaerke = this.lautstaerke; this.setzeLautstaerke(0); this.istStumm = true; }
    return this.istStumm;
  }

  // Liefert das Frequenzbild: echt, wo der Sender es erlaubt, sonst
  // überlagerte Sinuswellen. Welches von beidem, sagt analyseEcht.
  frequenzDaten(zeit) {
    if (this.analyseEcht && this._analyse && this.laeuft && this.audio === this.audioAnalyse) {
      this._analyse.getByteFrequencyData(this._frequenzDaten);
      const n = Math.min(this._simDaten.length, this._frequenzDaten.length);
      for (let i = 0; i < n; i++) this._simDaten[i] = this._frequenzDaten[i] / 255;
      return this._simDaten;
    }
    return this.simulierteDaten(zeit);
  }

  simulierteDaten(zeit) {
    const laenge = this._simDaten.length;
    const staerke = this.laeuft ? 1 : 0;
    for (let i = 0; i < laenge; i++) {
      const f = i / laenge;
      const w = Math.sin(zeit * 2.0 + i * 0.30) * 0.30
              + Math.sin(zeit * 3.7 + i * 0.15) * 0.20
              + Math.sin(zeit * 1.3 + i * 0.50) * 0.15
              + Math.sin(zeit * 5.1 + i * 0.08) * 0.10;
      const bass = Math.max(0, 1 - f * 3) * 0.3;
      this._simDaten[i] = Math.max(0, Math.min(1, (0.3 + w + bass) * staerke));
    }
    return this._simDaten;
  }
}

// ── Balkenkranz ────────────────────────────────────────────────────
class Visualizer {
  constructor(engine) {
    this.engine = engine;
    this.heroCanvas = document.getElementById('heroVisualizer');
    this.miniCanvas = document.getElementById('miniVisualizer');
    this.heroCtx = this.heroCanvas?.getContext('2d');
    this.miniCtx = this.miniCanvas?.getContext('2d');
    this.zeit = 0;
    this._letzterStempel = 0;
    this._geglaettet = new Float32Array(128);
    this._laeuft = false;
  }

  start() { if (!this._laeuft) { this._laeuft = true; requestAnimationFrame(t => this._schleife(t)); } }
  stopp() { this._laeuft = false; }

  _schleife(stempel) {
    if (!this._laeuft) return;
    const dt = Math.min((stempel - this._letzterStempel) / 1000, 0.05);
    this._letzterStempel = stempel;
    this.zeit += dt;

    const roh = this.engine.frequenzDaten(this.zeit);
    for (let i = 0; i < roh.length; i++) {
      this._geglaettet[i] += (roh[i] - this._geglaettet[i]) * 0.25;
    }
    this._zeichneKranz();
    this._zeichneMini();
    requestAnimationFrame(t => this._schleife(t));
  }

  _klemm(v) { return Math.max(0, Math.min(1, isFinite(v) ? v : 0)); }

  _zeichneKranz() {
    const ctx = this.heroCtx;
    if (!ctx) return;
    const w = this.heroCanvas.width, h = this.heroCanvas.height;
    const cx = w / 2, cy = h / 2, radius = 68, maxLen = 72, balken = 72;
    ctx.clearRect(0, 0, w, h);

    const daten = this._geglaettet;
    const bass = this._klemm((daten[0] + daten[1] + daten[2] + daten[3]) / 4);

    for (let i = 0; i < balken; i++) {
      const winkel = (i / balken) * Math.PI * 2 - Math.PI / 2;
      const wert = this._klemm(daten[Math.floor((i / balken) * daten.length * 0.8)]);
      const laenge = 4 + wert * maxLen;
      const t = i / balken;
      // Farbbogen vom Logo-Gelb (44°) ins Logo-Blau (208°)
      ctx.strokeStyle = `hsla(${44 + t * 164}, ${62 + wert * 28}%, ${45 + wert * 28}%, ${0.35 + wert * 0.6})`;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(winkel) * radius, cy + Math.sin(winkel) * radius);
      ctx.lineTo(cx + Math.cos(winkel) * (radius + laenge), cy + Math.sin(winkel) * (radius + laenge));
      ctx.stroke();
    }

    const glut = radius * (1 + bass * 0.05);
    const verlauf = ctx.createRadialGradient(cx, cy, glut * 0.5, cx, cy, glut);
    verlauf.addColorStop(0, 'rgba(242, 183, 5, 0)');
    verlauf.addColorStop(1, `rgba(242, 183, 5, ${0.10 + bass * 0.10})`);
    ctx.fillStyle = verlauf;
    ctx.beginPath();
    ctx.arc(cx, cy, glut, 0, Math.PI * 2);
    ctx.fill();
  }

  _zeichneMini() {
    const ctx = this.miniCtx;
    if (!ctx) return;
    const w = this.miniCanvas.width, h = this.miniCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const daten = this._geglaettet, anzahl = 32, breite = (w / anzahl) - 1;
    for (let i = 0; i < anzahl; i++) {
      const wert = this._klemm(daten[Math.floor((i / anzahl) * daten.length * 0.6)]);
      const hoehe = 2 + wert * (h - 2);
      ctx.fillStyle = `hsla(${44 + (i / anzahl) * 164}, 72%, 55%, 0.85)`;
      ctx.fillRect(i * (breite + 1), h - hoehe, breite, hoehe);
    }
  }
}

// ── Oberfläche ─────────────────────────────────────────────────────
class UI {
  constructor(engine) {
    this.engine = engine;
    this.sender = SENDER;
    this.regale = REGALE;
    this.aktuelleId = null;
    /*
     EIN Filterzustand fuer alle vier Dimensionen.

     Vorher hatte jede ihren eigenen, und beide loeschten sich gegenseitig:
     Wer "verlustfrei" waehlte und dann "ohne Werbung", verlor die erste Wahl
     wieder. Die Suche verwarf ohnehin alles. Das fuehlte sich kaputt an, ohne
     dass ein Fehler vorlag — die Filter waren einfach nicht kombinierbar.
    */
    this.filter = leererFilter();
    this.favoriten = new Set(speicher.lies(SCHLUESSEL.favoriten, []));
  }

  senderMitId(id) { return this.sender.find(s => s.id === id) ?? null; }
  istFavorit(id)  { return this.favoriten.has(id); }

  toggleFavorit(id) {
    if (this.favoriten.has(id)) this.favoriten.delete(id);
    else this.favoriten.add(id);
    speicher.schreib(SCHLUESSEL.favoriten, [...this.favoriten]);
    this.aktualisiereFavoritenAnzeige();
    window.app?.aktualisiereGriff();
    return this.favoriten.has(id);
  }

  // ── Karten ───────────────────────────────────────────────────────
  _karteHTML(sender) {
    const aktiv = this.aktuelleId === sender.id ? ' ist-aktiv' : '';
    const wackelig = istWackelig(sender.id) ? ' ans-regalende' : '';
    const favorit = this.istFavorit(sender.id);
    /*
     Klangqualitaet in vier Stufen, nicht in zwei.

     Fuer audiophile Hoerer ist FLAC etwas anderes als 256 kbit/s, und Opus
     bei 128 klingt besser als MP3 bei 192. Die Abstufung steht deshalb im
     Abzeichen selbst — sie ist die Information, nicht Schmuck.

     Sie steht jetzt in der Namenszeile statt auf dem Cover. Auf dem Bild war
     sie ueber hellen Covern unlesbar; genau darauf zielte die Beschwerde.
    */
    const guete = sender.codec === 'flac' ? 'FLAC'
                : ['opus', 'vorbis'].includes(sender.codec) ? sender.codec.toUpperCase()
                : sender.bitrate ? sender.bitrate + 'k' : '';
    const stufe = sender.codec === 'flac' ? 'verlustfrei'
                : ['opus', 'vorbis'].includes(sender.codec) ? 'gut'
                : (sender.bitrate ?? 0) >= 256 ? 'gut'
                : (sender.bitrate ?? 0) >= 192 ? 'ordentlich' : 'einfach';
    /*
     Was die Leitung dauerhaft hergeben muss — nur bei verlustfrei.

     Bei 320k steht die Zahl schon im Abzeichen. Bei FLAC steht dort nur
     "FLAC", und der Katalog hat fuer die vier verlustfreien Sender keine
     gemessene Datenrate. Ausgerechnet als Obergrenze ist ehrlicher als
     erfunden — siehe bandbreite() in senderbild.mjs.
    */
    const breite = bandbreite(sender);
    const guetetitel = sender.codec === 'flac'
        ? t('karte.guete.verlustfrei') + (breite ? ' — ' + t('karte.bandbreite', { wert: breite }) : '')
        : ['opus', 'vorbis'].includes(sender.codec)
          ? t('karte.guete.opus', { codec: sender.codec.toUpperCase(), bitrate: sender.bitrate })
          : t('karte.guete.mp3', { bitrate: sender.bitrate });

    /*
     Das Feld `kanal` wird bewusst NICHT gezeigt.

     Saemi-Ra hat es angelegt und bei allen 146 Sendern gefuellt, und ich
     hatte es als Reiter vor den Ort gesetzt. Live sah man dann
     "Gamesboro Radio · Gamesboro Radio".

     Nachgezaehlt: Bei 93 Sendern ist `kanal` woertlich der Name, bei 53
     steckt er darin ("NTS 1" -> "1", "NTS Slow Focus" -> "Slow Focus").
     Bei NULL Sendern steht dort etwas, das der Name nicht schon sagt.

     `kanal` ist also keine Zusatzangabe, sondern eine ZERLEGUNG des Namens:
     Betreiber plus Kanal. Nuetzlich waere sie, um mehrere Kanaele desselben
     Senders zusammenzufassen — "NTS" einmal mit drei Kanaelen darunter,
     statt dreimal "NTS" nebeneinander. Das ist ein eigener Umbau, nicht ein
     Abzeichen. Bis dahin waere jede Anzeige eine Wiederholung.
    */
    const eigenes = hatEigenesLogo(sender);
    return `
      <article class="karte${aktiv}${wackelig}" data-sender-id="${sender.id}"
               style="--regalton:${regalton(sender)}">
        <div class="karte__bild">
          ${eigenes
            ? `<img src="${senderbild(sender)}" alt="" loading="lazy" width="512" height="512">`
            /*
              Keine Huelle ohne Cover ist ein Fehler — in jedem Plattenladen
              stehen Testpressungen mit gesetztem Namen. Deshalb wird der Name
              gesetzt statt eine Hausmarke wiederholt.
            */
            : `<div class="huelle huelle--${huellengroesse(sender)}">
                 <span class="huelle__name">${huellenzeilen(sender).join('<br>')}</span>
                 <img class="huelle__marke" src="${MARKE}" alt="" width="28" height="20">
               </div>`}
          <div class="karte__schleier"></div>
          <p class="karte__kaertchen"><span>${sender.kaertchen}</span></p>
          <button class="karte__favorit${favorit ? ' ist-favorit' : ''}"
                  aria-label="${favorit ? t('karte.favorit.entfernen') : t('karte.favorit.hinzu')}">${symbol(favorit ? 'gemerkt' : 'merken', 20)}</button>
          <button class="karte__spielen" aria-label="${t('karte.spielen')}">
            <span class="karte__ikon--an">${symbol('abspielen', 20)}</span><span class="karte__ikon--aus">${symbol('pause', 20)}</span>
          </button>
          <div class="karte__laeuft"><span></span><span></span><span></span></div>
        </div>
        <div class="karte__etikett">
          <div class="karte__zeile">
            ${(() => {
              /*
               Haus klein, Kanal gross — aber nur, wenn das Haus mehrere
               Kanaele fuehrt. Bei einem einzelnen Sender waere die Zerlegung
               eine Erfindung: "Kiosk" ueber "Radio" zu setzen macht aus
               einem Namen zwei.
              */
              const { haus, kanal } = zerlegeName(sender);
              const mehrkanalig = haus && this._haeuser?.has(haus);
              return mehrkanalig
                ? `<h3 class="karte__name" title="${sender.name}">`
                  + `<span class="karte__haus">${haus}</span>${kanal}</h3>`
                : `<h3 class="karte__name" title="${sender.name}">${sender.name}</h3>`;
            })()}
            ${guete ? `<span class="karte__guete karte__guete--${stufe}" title="${guetetitel}">${guete}</span>` : ''}
          </div>
          <p class="karte__ort">${sender.ort} · ${sender.land}</p>
          ${breite ? `<p class="karte__leitung">${t('karte.bandbreite', { wert: breite })}</p>` : ''}
          <div class="karte__fuss">
            ${(sender.etiketten ?? []).slice(0, 2).map(e => `<span class="marke marke--etikett">${e}</span>`).join('')}
          </div>
        </div>
      </article>`;
  }

  _verdrahteKarten(behaelter) {
    behaelter.querySelectorAll('.karte').forEach(karte => {
      const id = karte.dataset.senderId;
      karte.addEventListener('click', (e) => {
        if (e.target.closest('.karte__favorit')) return;
        if (e.target.closest('.karte__spielen')) return;
        const sender = this.senderMitId(id);
        if (sender) window.app.spieleSender(sender);
      });
      karte.querySelector('.karte__favorit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFavorit(id);
      });
      /*
       Der Abspielknopf haelt an, wenn der Sender schon laeuft — sonst wuerde
       ein Klick auf ein sichtbares Pausenzeichen den Strom neu aufbauen.
      */
      karte.querySelector('.karte__spielen')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.aktuelleId === id) return window.app.wechselSpiel();
        const sender = this.senderMitId(id);
        if (sender) window.app.spieleSender(sender);
      });
    });
  }

  /*
   Die Regalwand — neun Faecher mit Bild.

   Bisher gab es die Regale nur als Ueberschriften mitten im Fluss. Wer wissen
   wollte, was der Laden fuehrt, musste an allem vorbeiscrollen.

   Die Bilder sind erzeugt, aber nicht erfunden: vier echte Cover aus dem Fach
   als Mosaik, getoent im Regalton. Ein gemaltes Fantasiebild waere huebscher
   und wuerde zeigen, was NICHT im Fach steht.
  */
  zeichneRegalwand() {
    const raster = document.getElementById('regalwandRaster');
    if (!raster) return;

    const proRegal = new Map();
    for (const s of this.sender) {
      if (!proRegal.has(s.regal)) proRegal.set(s.regal, []);
      proRegal.get(s.regal).push(s);
    }

    const faecher = this.regale.filter(r => (proRegal.get(r.id) ?? []).length);
    raster.innerHTML = faecher.map(r => {
      const drin = proRegal.get(r.id);
      // Nur die blanke Zahl. Sie braucht keine Uebersetzung und steht in
      // jeder der sieben Sprachen richtig da.
      return `
        <button class="regalfach" data-regal="${r.id}" style="--regalton:${REGALTON[r.id] ?? REGALTON.grenzgaenger}"
                title="${r.beschreibung ?? ''}">
          <span class="regalfach__name">${r.name}</span>
          <span class="regalfach__zahl">${drin.length}</span>
        </button>`;
    }).join('');

    const zahl = document.getElementById('regalwandZahl');
    if (zahl) zahl.textContent = t('regalwand.zahl', { faecher: faecher.length, sender: this.sender.length });

    raster.onclick = (e) => {
      const fach = e.target.closest('.regalfach');
      if (fach) this.springZuRegal(fach.dataset.regal);
    };
  }

  /*
   Ein Regalknopf filtert nicht — er fuehrt hin.

   Vorher blendete ein Druck alle anderen Sender aus. Im Plattenladen
   verschwinden die anderen Tische aber nicht, wenn man sich vor einen
   stellt; man geht hinueber und sieht die uebrigen weiter aus dem
   Augenwinkel. Genau das soll der Knopf tun.

   Steht noch ein Filter, wird er vorher aufgehoben: Sonst fuehrt der Knopf
   an eine Stelle, die es gerade nicht gibt.
  */
  springZuRegal(id) {
    miss('regal', { regal: id });
    const hin = () => {
      const reihe = document.querySelector(`#regale .regal[data-regal="${id}"]`);
      if (!reihe) return;
      // Wer reduzierte Bewegung eingestellt hat, will nicht durch drei
      // Bildschirmhoehen gefahren werden — der springt.
      const magBewegung = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      reihe.scrollIntoView({ behavior: magBewegung ? 'smooth' : 'auto', block: 'start' });
      reihe.classList.remove('wird-angesteuert');
      void reihe.offsetWidth;            // erzwingt den Neustart der Animation
      reihe.classList.add('wird-angesteuert');
    };
    if (this.istGefiltert?.() ?? false) {
      this.filterZuruecksetzen();
      requestAnimationFrame(() => requestAnimationFrame(hin));
    } else {
      hin();
    }
  }

  // ── Regale ───────────────────────────────────────────────────────
  /*
   Ungefiltert eine waagerechte Reihe je Regal, gefiltert ein Raster.

   Warum der Unterschied: Das sind zwei verschiedene Handlungen. Ungefiltert
   STOEBERT man — man weiss noch nicht, was man sucht, und blaettert quer
   durch die Kiste. Genau das tun Netflix, Spotify und Apple Music auf ihrer
   Startseite, und im Plattenladen tut man es auch: Man geht die Reihe
   entlang und zieht Huellen halb heraus. Neun Regale untereinander als
   Raster waeren zweiunddreissig Bildschirmhoehen Scrollweg.

   Gefiltert SUCHT man. Dann will man alle Treffer auf einmal sehen und
   vergleichen — dafuer ist ein Raster richtig, und seitwaerts blaettern
   waere Arbeit. Dieselbe Trennung hat Spotify zwischen Startseite und
   Suchergebnis.
  */
  zeichneRegale(auswahl = null) {
    const behaelter = document.getElementById('regale');
    const gefiltert = auswahl !== null;
    const daten = auswahl ?? this.sender;

    const zeichne = () => {
      behaelter.innerHTML = '';
      behaelter.classList.toggle('ist-gefiltert', gefiltert);

      if (!daten.length) {
        behaelter.innerHTML = `
          <div class="leer">
            <p class="leer__titel">${t('leer.titel')}</p>
            <p class="leer__hinweis">${t('leer.hinweis')}</p>
            <button class="knopf" id="leerZuruecksetzen">${t('filter.knopf.alle')}</button>
          </div>`;
        behaelter.querySelector('#leerZuruecksetzen')
          ?.addEventListener('click', () => this.filterZuruecksetzen());
        return;
      }

      for (const regal of this.regale) {
        const drin = daten.filter(s => s.regal === regal.id);
        if (!drin.length) continue;
        behaelter.appendChild(this._regalHTML(regal, drin, gefiltert));
      }
      this._verdrahteKarten(behaelter);
      this._verdrahteReihen(behaelter);
    };

    /*
     View Transitions: Beim Filterwechsel verschwinden und erscheinen Karten.
     Ohne Uebergang springt das Bild, und man verliert die Stelle, an der man
     war. Mit Uebergang blendet der Browser den alten in den neuen Zustand.

     Nur wenn der Besucher keine reduzierte Bewegung verlangt hat — sonst ist
     ein Uebergang genau das, was er abbestellt hat.
    */
    const magBewegung = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && magBewegung && this._schonGezeichnet) {
      /*
       Die Zusagen abfangen, sonst schreibt der Browser in die Konsole.

       Wer zwei Filterchips schnell hintereinander anklickt, bricht den
       laufenden Uebergang ab. Der Browser lehnt dann `finished` mit
       "Transition was skipped" ab — das ist kein Fehler, sondern genau das
       gewuenschte Verhalten. Unbehandelt landet es aber als Fehler in der
       Konsole und, schlimmer, im Fehlerbericht: Ein Bericht ueber etwas,
       das richtig laeuft, verstellt den Blick auf die echten.
      */
      const uebergang = document.startViewTransition(zeichne);
      uebergang.finished.catch(() => {});
      uebergang.updateCallbackDone.catch(() => {});
    } else {
      zeichne();
    }
    this._schonGezeichnet = true;
  }

  _regalHTML(regal, drin, alsRaster) {
    const el = document.createElement('section');
    el.className = 'regal';
    el.dataset.regal = regal.id;
    el.style.setProperty('--regalton', REGALTON[regal.id] ?? REGALTON.grenzgaenger);

    const reihe = alsRaster ? 'regal__raster' : 'regal__reihe';
    /*
     Die Blaetterknoepfe stehen nur da, wo es einen Zeiger gibt. Auf einem
     Handy wischt man; ein Pfeilknopf waere dort ein Knopf, den niemand
     drueckt und der Platz kostet.
    */
    const blaettern = alsRaster ? '' : `
        <div class="regal__blaettern" aria-hidden="true">
          <button class="regal__pfeil" data-richtung="-1" tabindex="-1">${symbol('zurueck', 16)}</button>
          <button class="regal__pfeil" data-richtung="1"  tabindex="-1">${symbol('weiter', 16)}</button>
        </div>`;

    el.innerHTML = `
      <div class="regal__kopf">
        <h2 class="regal__titel">${regal.name}</h2>
        <span class="regal__zahl">${drin.length}</span>
        ${blaettern}
      </div>
      <p class="regal__beschreibung">${regal.beschreibung}</p>
      <div class="${reihe}" role="group" aria-label="${regal.name}">
        ${drin.map(s => this._karteHTML(s)).join('')}
      </div>`;
    return el;
  }

  /*
   Die Blaetterknoepfe.

   Sie stehen auf aria-hidden und tabindex -1, und das ist Absicht: Mit der
   Tastatur kommt man ohnehin durch die Karten, und der Browser scrollt die
   Reihe dabei von selbst mit. Zwei zusaetzliche Tabstopps je Regal — bei
   neun Regalen achtzehn — waeren reine Wegstrecke ohne Gewinn.

   Geblaettert wird um fast eine volle Reihenbreite, nicht um genau eine:
   Die angeschnittene Huelle am Rand bleibt sichtbar und sagt, dass es
   weitergeht.
  */
  /*
   Mit der Maus durch eine Reihe ziehen.

   Auf dem Handy wischt man, und der Browser scrollt. Mit der Maus gab es
   bisher nur die beiden Pfeilknoepfe — und wer eine Kiste vor sich hat,
   greift hinein und schiebt. Genau das fehlte.

   DREI DINGE MACHEN DEN UNTERSCHIED ZWISCHEN "GEHT" UND "FUEHLT SICH RICHTIG
   AN", und alle drei sind hier gemeint:

   1. Ein Zug darf nicht als Klick enden. Wer 200 Pixel schiebt und loslaesst,
      hat NICHT auf die Huelle unter dem Zeiger getippt — sonst spielt beim
      Blaettern staendig ein Sender an. Deshalb faengt ein Zug ueber der
      Schwelle den naechsten Klick ab, einmal, in der Erfassungsphase.

   2. Es muss nachlaufen. Ein Zug, der beim Loslassen sofort steht, fuehlt
      sich an, als klemmte etwas. Aus der Geschwindigkeit der letzten
      Bewegungen wird ein Schwung berechnet, der ausrollt — dieselbe Sache,
      die ein Handy von selbst tut.

   3. Waagerecht ja, senkrecht nein. Wer die Seite herunterscrollen will und
      dabei ueber einer Reihe startet, darf nicht in ihr haengenbleiben. Die
      Richtung wird aus den ersten Pixeln bestimmt und dann festgehalten.

   Pointer Events statt mousedown/touchstart: Ein Satz Ereignisse fuer Maus,
   Finger und Stift. setPointerCapture sorgt dafuer, dass der Zug auch dann
   weiterlaeuft, wenn der Zeiger die Reihe verlaesst — ohne das reisst die
   Bewegung am Rand ab, und genau am Rand zieht man am haeufigsten.
  */
  _machZiehbar(reihe) {
    if (reihe.dataset.ziehbar) return;
    reihe.dataset.ziehbar = '1';

    const SCHWELLE = 6;        // Pixel, ab denen aus einem Klick ein Zug wird
    const REIBUNG = 0.94;      // je Bild; darunter wirkt es schmierig
    const MINDESTSCHWUNG = 0.4;

    let zieht = false, entschieden = false, achse = null;
    let startX = 0, startY = 0, startScroll = 0;
    let letzteZeit = 0, letztesX = 0, schwung = 0, lauf = 0;
    let gezogen = 0;

    const halt = () => {
      cancelAnimationFrame(lauf); lauf = 0;
      reihe.classList.remove('rollt-aus');
    };

    const rollAus = () => {
      if (Math.abs(schwung) < MINDESTSCHWUNG) {
        halt();
        reihe.classList.remove('rollt-aus');
        // Erst JETZT das weiche Scrollen zurueckgeben — es gehoert den
        // Pfeilknoepfen. Gab man es schon beim Loslassen zurueck, animierte
        // der Browser jede einzelne Zuweisung dieser Schleife und arbeitete
        // gegen sie: Gemessen kam null Nachlauf heraus, obwohl der Schwung
        // stimmte.
        reihe.style.scrollBehavior = '';
        return;
      }
      reihe.scrollLeft -= schwung;
      schwung *= REIBUNG;
      lauf = requestAnimationFrame(rollAus);
    };

    reihe.addEventListener('pointerdown', (e) => {
      /*
       Nur die Hauptzeigertaste. ABER: auch ueber einem Knopf.

       Zuerst hatte ich Knoepfe ausgenommen — wer aufs Herz zielt, will
       merken. Gemessen hat sich das als schlechter erwiesen: Der
       Abspielknopf erscheint beim Ueberfahren mitten auf dem Cover, und ein
       Zug, der zufaellig dort beginnt, tat gar nichts. Die Reihe fuehlte
       sich stellenweise kaputt an, ohne erkennbare Regel.

       Wer eine Kiste greift, greift DIE KISTE, nicht den Knopf darunter.
       Deshalb faengt der Zug ueberall an; ob es ein Klick oder ein Zug war,
       entscheidet erst die Bewegung. Der Knopf bleibt bedienbar, weil ein
       Druck ohne Bewegung nie zum Zug wird und der Klick dann normal
       durchgeht — und ein Zug seinen Klick verschluckt.
      */
      if (e.button !== 0) return;
      // Finger und Stift scrollen nativ besser, als wir es nachbauen koennen.
      if (e.pointerType !== 'mouse') return;

      halt();
      zieht = true; entschieden = false; achse = null; gezogen = 0;
      startX = e.clientX; startY = e.clientY;
      startScroll = reihe.scrollLeft;
      letzteZeit = performance.now(); letztesX = e.clientX; schwung = 0;
    });

    reihe.addEventListener('pointermove', (e) => {
      if (!zieht) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;

      if (!entschieden) {
        if (Math.abs(dx) < SCHWELLE && Math.abs(dy) < SCHWELLE) return;
        // Einmal festgelegt, bleibt es dabei — sonst kippt die Bewegung
        // mitten im Zug von waagerecht auf senkrecht.
        achse = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        entschieden = true;
        if (achse === 'y') { zieht = false; return; }
        reihe.setPointerCapture(e.pointerId);
        reihe.classList.add('wird-gezogen');
        // Waehrend des Zuges kein weiches Scrollen: Das ist fuer die
        // Pfeilknoepfe gedacht und macht den Zug traege.
        reihe.style.scrollBehavior = 'auto';
      }

      gezogen = Math.abs(dx);
      reihe.scrollLeft = startScroll - dx;

      const jetzt = performance.now();
      const spanne = jetzt - letzteZeit;
      if (spanne > 0) {
        // Geglaettet, damit ein einzelnes ruckeliges Ereignis den Schwung
        // nicht verreisst.
        const roh = (e.clientX - letztesX) / spanne * 16;
        schwung = schwung * 0.7 + roh * 0.3;
        letzteZeit = jetzt; letztesX = e.clientX;
      }
      e.preventDefault();
    });

    const loslassen = (e) => {
      if (!zieht) return;
      zieht = false;
      reihe.classList.remove('wird-gezogen');
      if (reihe.hasPointerCapture?.(e.pointerId)) reihe.releasePointerCapture(e.pointerId);

      if (gezogen > SCHWELLE) {
        /*
         Den naechsten Klick verschlucken — aber nur diesen einen, und nur
         wenn wirklich gezogen wurde. In der Erfassungsphase, weil der Klick
         sonst zuerst bei der Karte ankommt und ein Sender anspielt.
        */
        const schluck = (k) => { k.stopPropagation(); k.preventDefault(); };
        reihe.addEventListener('click', schluck, { capture: true, once: true });
        // Kam gar kein Klick (Zug endete ausserhalb), muss der Horcher wieder
        // weg — sonst frisst er irgendwann einen echten.
        setTimeout(() => reihe.removeEventListener('click', schluck, true), 0);
        // Das Einrasten bleibt aus, bis der Nachlauf steht — sonst zieht es
        // die Reihe schon im ersten Bild wieder auf die Kartenkante.
        reihe.classList.add('rollt-aus');
        rollAus();
      } else {
        // Kein Zug, also auch kein Nachlauf — dann gehoert das weiche
        // Scrollen sofort zurueck.
        reihe.style.scrollBehavior = '';
      }
      gezogen = 0;
    };

    reihe.addEventListener('pointerup', loslassen);
    reihe.addEventListener('pointercancel', loslassen);
    // Ein neuer Zug hebt das Nachlaufen auf — sonst zieht man gegen den
    // eigenen Schwung.
    reihe.addEventListener('wheel', halt, { passive: true });
  }

  _verdrahteReihen(behaelter) {
    for (const reihe of behaelter.querySelectorAll('.regal__reihe')) {
      // Ziehen gilt fuer JEDE Reihe, auch fuer die ohne Pfeilknoepfe —
      // Verlauf und Auslage haben keine, ziehen soll man dort trotzdem.
      this._machZiehbar(reihe);

      const kopf = reihe.closest('.regal')?.querySelector('.regal__blaettern');
      if (!kopf) continue;

      const stand = () => {
        const platz = reihe.scrollWidth - reihe.clientWidth;
        // In RTL ist scrollLeft negativ oder rueckwaerts gezaehlt, je nach
        // Browser. Der Betrag stimmt in beiden Faellen.
        const wo = Math.abs(reihe.scrollLeft);
        kopf.hidden = platz < 8;
        kopf.querySelector('[data-richtung="-1"]').disabled = wo < 8;
        kopf.querySelector('[data-richtung="1"]').disabled = wo > platz - 8;
      };
      stand();
      reihe.addEventListener('scroll', stand, { passive: true });
      new ResizeObserver(stand).observe(reihe);

      kopf.addEventListener('click', (e) => {
        const knopf = e.target.closest('[data-richtung]');
        if (!knopf) return;
        const richtung = Number(knopf.dataset.richtung)
                       * (getComputedStyle(reihe).direction === 'rtl' ? -1 : 1);
        reihe.scrollBy({ left: richtung * reihe.clientWidth * 0.85, behavior: 'smooth' });
      });
    }
  }

  // ── Verlauf ──────────────────────────────────────────────────────
  /*
   Zuletzt gehoert.

   Die Daten lagen schon da — merkeZuletzt() schreibt sie seit jeher, aber
   gezeigt wurden sie nur als Gewicht fuer den Zufallsgriff. Wer gestern
   etwas Gutes gehoert und den Namen vergessen hat, konnte es nicht
   wiederfinden. Das ist die haeufigste verlorene Handlung eines Radios.

   Neueste zuerst, jeder Sender einmal, hoechstens zwoelf. Laenger waere
   kein Verlauf mehr, sondern ein zweiter Katalog.
  */
  zeichneVerlauf() {
    const abschnitt = document.getElementById('verlauf');
    const reihe = document.getElementById('verlaufReihe');
    if (!abschnitt || !reihe) return;

    const ids = [...new Set(ladeZuletzt().slice().reverse())];
    const sender = ids.map(id => this.senderMitId(id)).filter(Boolean).slice(0, 12);

    abschnitt.hidden = sender.length < 2;
    if (abschnitt.hidden) return;

    reihe.innerHTML = sender.map(s => this._karteHTML(s)).join('');
    document.getElementById('verlaufZahl').textContent = sender.length;
    this._verdrahteKarten(abschnitt);
    this._verdrahteReihen(abschnitt);
  }

  // ── Filter ───────────────────────────────────────────────────────
  /*
   Die Leiste zeigt wenig, das Panel zeigt alles.

   Sechzehn Chips in eine klebende Leiste zu quetschen hiesse, sie entweder
   abzuschneiden oder die halbe Seite damit zu belegen. Beides ist falsch;
   abgeschnittene Filterchips sind ein bekannter Fehler, weil man nicht sehen
   kann, was man nicht sieht.

   Also: In der Leiste stehen die drei Fragen, die am haeufigsten gestellt
   werden, dazu die gerade aktiven Filter als abwaehlbare Chips und die
   Trefferzahl. Alles Weitere haengt hinter einem Knopf, der sagt, wie viele
   Filter es gibt.
  */
  zeichneFilter() {
    // Einmal bestimmen, welche Marken mehrere Kanaele fuehren — davon haengt
    // ab, wie der Name auf der Huelle gesetzt wird.
    this._haeuser = haeuserMitMehreren(this.sender);

    const zaehler = new Map();
    for (const s of this.sender) {
      for (const e of s.etiketten ?? []) zaehler.set(e, (zaehler.get(e) ?? 0) + 1);
    }
    this._etikettenNachHaeufigkeit = [...zaehler.entries()].sort((a, b) => b[1] - a[1]);

    const proRegion = new Map();
    for (const s of this.sender) {
      const r = regionVon(s);
      if (r) proRegion.set(r, (proRegion.get(r) ?? 0) + 1);
    }
    this._regionen = [...proRegion.entries()].sort((a, b) => b[1] - a[1]);

    this.zeichneFilterPanel();
    this.wendeFilterAn();
  }

  _chip(art, achse, wert, beschriftung, zahl) {
    const aktiv = achse === 'etikett' ? this.filter.etiketten.has(wert)
                : achse === 'region'  ? this.filter.regionen.has(wert)
                : achse === 'guete'   ? this.filter.guete === wert
                : achse === 'gemerkte' ? this.filter.nurGemerkte
                : false;
    // Wie viele Sender bleiben, wenn man DIESEN Chip zusaetzlich waehlt.
    // Bei einem bereits aktiven Chip ist die Zahl der Ist-Zustand.
    const rest = aktiv ? null
      : vorschau(this.sender, this.filter, (id) => this.istFavorit(id), achse, wert);
    const stumpf = rest === 0 ? ' ist-stumpf' : '';
    return `<button class="chip chip--${art}${aktiv ? ' ist-aktiv' : ''}${stumpf}"
              data-achse="${achse}" data-wert="${wert}"
              ${rest === 0 ? 'disabled' : ''}
              aria-pressed="${aktiv}">${beschriftung}<span>${rest ?? zahl}</span></button>`;
  }

  zeichneFilterPanel() {
    const kasten = document.getElementById('filterPanelInhalt');
    if (!kasten) return;
    const F = this.filter;

    const gruppe = (titel, chips) => !chips ? '' : `
      <div class="filter__gruppe">
        <p class="filter__titel">${titel}</p>
        <div class="filter__chips">${chips}</div>
      </div>`;

    kasten.innerHTML =
      gruppe(t('filter.guete.titel'),
        this._chip('klang', 'guete', 'verlustfrei', t('filter.guete.verlustfrei'), 0)
      + this._chip('klang', 'guete', 'hoch', t('filter.guete.hoch'), 0))
    + gruppe(t('filter.wofuer.titel'),
        this._etikettenNachHaeufigkeit
          .map(([e, n]) => this._chip('wofuer', 'etikett', e, etikettName(e), n)).join(''))
    + gruppe(t('filter.wo.titel'),
        this._regionen
          .map(([r, n]) => this._chip('wo', 'region', r, regionName(r), n)).join(''))
    + (this.favoriten.size ? gruppe(t('filter.meine.titel'),
        this._chip('meine', 'gemerkte', 'ja', t('filter.meine.knopf'), this.favoriten.size)) : '');

    document.getElementById('filterAnzahl').textContent =
      2 + this._etikettenNachHaeufigkeit.length + this._regionen.length
      + (this.favoriten.size ? 1 : 0);
  }

  zeichneSchnellchips() {
    const kasten = document.getElementById('filterSchnell');
    if (!kasten) return;
    const vorhanden = new Set(this._etikettenNachHaeufigkeit.map(([e]) => e));
    const chips = SCHNELL.filter(e => vorhanden.has(e))
      .map(e => this._chip('wofuer', 'etikett', e, etikettName(e),
                           this._etikettenNachHaeufigkeit.find(([k]) => k === e)?.[1] ?? 0));
    if (this.favoriten.size) {
      chips.unshift(this._chip('meine', 'gemerkte', 'ja', t('filter.meine.knopf'), this.favoriten.size));
    }
    kasten.innerHTML = chips.join('');
  }

  schalteFilter(achse, wert) {
    // Mit der Trefferzahl: Ein Filter, der immer ins Leere fuehrt, ist ein
    // Gestaltungsfehler — und einer, den man ohne Messung nie bemerkt.
    miss('filter', { achse, wert, treffer: this._letzteTreffer ?? 0 });
    const f = this.filter;
    if (achse === 'etikett') f.etiketten.has(wert) ? f.etiketten.delete(wert) : f.etiketten.add(wert);
    else if (achse === 'region') f.regionen.has(wert) ? f.regionen.delete(wert) : f.regionen.add(wert);
    else if (achse === 'guete') f.guete = f.guete === wert ? null : wert;
    else if (achse === 'gemerkte') f.nurGemerkte = !f.nurGemerkte;
    else if (achse === 'regal') f.regal = f.regal === wert ? null : wert;
    this.wendeFilterAn();
  }

  setzeRegalFilter(regal) {
    miss('regal', { regal });
    this.schalteFilter('regal', regal);
  }

  setzeSuche(text) {
    this.filter.suche = text ?? '';
    this.wendeFilterAn();
  }

  filterZuruecksetzen() {
    this.filter = leererFilter();
    const feld = document.getElementById('suche');
    if (feld) feld.value = '';
    this.wendeFilterAn();
  }

  istGefiltert() { return istGefiltert(this.filter); }

  wendeFilterAn() {
    const treffer = wendeAn(this.sender, this.filter, (id) => this.istFavorit(id));

    this.zeichneSchnellchips();
    this.zeichneFilterPanel();

    document.querySelectorAll('.regalfach').forEach(k =>
      k.classList.toggle('ist-aktiv', k.dataset.regal === this.filter.regal));

    this._letzteTreffer = treffer.length;
    this.zeigeFilterstand(treffer.length);
    this.zeichneRegale(this.istGefiltert() ? treffer : null);
  }

  /*
   Der Filterstand: was greift, und wie viel bleibt.

   Jeder aktive Filter steht als eigener Chip mit einem Kreuz da. Eine
   Sammelmeldung "3 Filter aktiv" waere kuerzer und schlechter — man muesste
   das Panel oeffnen, um zu sehen, welche drei, und einzeln abwaehlen ginge
   gar nicht.
  */
  zeigeFilterstand(anzahl) {
    const kasten = document.getElementById('filterStand');
    const aktive = document.getElementById('filterAktive');
    const knopf  = document.getElementById('filterKnopf');
    if (!kasten || !aktive) return;

    const f = this.filter;
    const teile = [];
    if (f.nurGemerkte) teile.push(['gemerkte', 'ja', t('filter.meine.knopf')]);
    if (f.guete) teile.push(['guete', f.guete, t('filter.guete.' + f.guete)]);
    if (f.regal) teile.push(['regal', f.regal,
                             this.regale.find(r => r.id === f.regal)?.name ?? f.regal]);
    for (const e of f.etiketten) teile.push(['etikett', e, etikettName(e)]);
    for (const r of f.regionen) teile.push(['region', r, regionName(r)]);

    aktive.innerHTML = teile.map(([achse, wert, text]) =>
      `<button class="chip chip--aktiv" data-achse="${achse}" data-wert="${wert}"
               aria-label="${t('filter.entfernen', { name: text })}">${text}<span>&times;</span></button>`
    ).join('');

    kasten.hidden = !this.istGefiltert();
    document.getElementById('filterStandText').textContent = anzahl === 1
      ? t('filter.stand.eins')
      : t('filter.stand.mehrere', { anzahl, gesamt: this.sender.length });
    if (knopf) knopf.dataset.aktiv = anzahlAktiv(this.filter) || '';

    // Dieselbe Zahl noch einmal im Panel: Wer dort Chips waehlt, sieht die
    // Leiste dahinter nicht.
    const imPanel = document.getElementById('filterPanelStand');
    if (imPanel) {
      imPanel.textContent = anzahl === 1
        ? t('filter.stand.eins')
        : t('filter.stand.mehrere', { anzahl, gesamt: this.sender.length });
    }
  }

  // ── Anzeigen aktualisieren ───────────────────────────────────────
  aktualisiereFavoritenAnzeige() {
    document.querySelectorAll('.karte').forEach(karte => {
      const favorit = this.istFavorit(karte.dataset.senderId);
      const knopf = karte.querySelector('.karte__favorit');
      if (knopf) { knopf.innerHTML = symbol(favorit ? 'gemerkt' : 'merken', 18); knopf.classList.toggle('ist-favorit', favorit); }
    });
    /*
     Nur das Wort tauschen, nicht den ganzen Knopfinhalt.

     Vorher stand hier heroKnopf.textContent = ... — das loescht ALLE
     Kindelemente, also auch das SVG-Herz daneben. Nach dem ersten Merken war
     das Zeichen weg und kam bis zum Neuladen nicht wieder.
    */
    const heroKnopf = document.getElementById('heroFavorit');
    if (heroKnopf && this.aktuelleId) {
      const ist = this.istFavorit(this.aktuelleId);
      const schluessel = ist ? 'hero.knopf.gemerkt' : 'hero.knopf.merken';
      const zeichen = heroKnopf.querySelector('[data-symbol]');
      const wort = heroKnopf.querySelector('[data-text]');
      if (zeichen) {
        zeichen.dataset.symbol = ist ? 'gemerkt' : 'merken';
        zeichen.innerHTML = symbol(zeichen.dataset.symbol,
                                   Number(zeichen.dataset.symbolGroesse) || 17);
      }
      if (wort) { wort.dataset.text = schluessel; wort.textContent = t(schluessel); }
      heroKnopf.classList.toggle('ist-favorit', ist);
    }
  }

  markiereAktiv() {
    document.querySelectorAll('.karte').forEach(k =>
      k.classList.toggle('ist-aktiv', k.dataset.senderId === this.aktuelleId));
  }

  zeigeSender(sender) {
    // Das Plattenlabel: Logo des Senders, sonst bleibt die IYAMBAE-Marke.
    const label = document.getElementById('labelBild');
    if (label && label.dataset.senderId !== sender.id) {
      label.dataset.senderId = sender.id;
      const bild = labelbild(sender);
      // Traegt der Sender kein eigenes Logo, liegt die Hausmarke auf dem
      // Teller — und ihr blauer Punkt sitzt dann genau auf der Spindel.
      label.closest('.label')?.classList.toggle('traegt-marke', bild === LABEL_MARKE);
      if (bild === LABEL_MARKE) {
        label.src = LABEL_MARKE;
      } else {
        // Erst laden, dann tauschen — sonst blitzt kurz ein leeres Label auf
        const probe = new Image();
        probe.onload  = () => { label.src = bild; };
        probe.onerror = () => { label.src = LABEL_MARKE; label.closest('.label')?.classList.add('traegt-marke'); };
        probe.src = bild;
      }
    }
    document.getElementById('heroName').textContent = sender.name;
    document.getElementById('heroOrt').textContent  = `${sender.betreiber} · ${sender.ort}, ${sender.land}`;
    document.getElementById('heroKaertchen').textContent = sender.kaertchen;
    const guete = sender.codec === 'flac' ? t('hero.guete.flac')
                : ['opus','vorbis'].includes(sender.codec) ? sender.codec.toUpperCase()
                : t('hero.guete.bitrate', { codec: sender.codec.toUpperCase(), bitrate: sender.bitrate ?? '?' });
    // Ehrlich benennen, ob der Balkenkranz das echte Signal zeigt.
    const pegel = sender.cors ? t('hero.pegel.live') : t('hero.pegel.simuliert');
    /*
     Und ebenso ehrlich benennen, was beim Umstimmen wirklich passiert.

     Achtzehn Sender lassen den Browser nicht an ihren Ton. Fuer die faellt
     die Seite auf playbackRate zurueck, und das zieht Tonhoehe und Tempo
     gemeinsam herunter — die Musik laeuft dort 1,8 Prozent langsamer.

     Das steht als cors im Katalog, ist gemessen und gilt je Sender. Anders
     als die Stimmung einer Aufnahme, die von Titel zu Titel wechselt und
     ueber die wir deshalb nichts behaupten.
    */
    const abstand = document.querySelector('.abstand__satz:not(.abstand__satz--loesung)');
    if (abstand) abstand.innerHTML = t(sender.cors ? 'stimmung.abstand' : 'stimmung.abstandLangsam');
    document.getElementById('heroGuete').textContent = guete + pegel;
    document.getElementById('heroLink').href = sender.homepage;
    document.getElementById('barName').textContent = sender.name;
    document.getElementById('barRegal').textContent = this.regale.find(r => r.id === sender.regal)?.name ?? '';
    document.querySelector('.spieler')?.classList.add('ist-sichtbar');
    this.aktualisiereFavoritenAnzeige();
  }

  zeigeStatus(art, text) {
    const punkt = document.getElementById('statusPunkt');
    const feld  = document.getElementById('statusText');
    if (punkt) punkt.className = 'status-punkt status-punkt--' + art;
    if (feld)  feld.textContent = text;
  }

  zeigeSpielzustand(laeuft) {
    for (const id of ['heroPlayIcon', 'barPlayIcon']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = symbol(laeuft ? 'pause' : 'abspielen', 20);
    }
    document.body.classList.toggle('spielt', laeuft);
    this.setzeTonarm(laeuft);
  }

  // Der Tonarm wird direkt gesetzt statt über eine Klasse — ein
  // klassenbasierter Wechsel auf einem SVG-<g> kommt im Renderer nicht an.
  setzeTonarm(liegtAuf) {
    const schwenk = document.querySelector('.tonarm__schwenk');
    if (!schwenk) return;
    schwenk.style.transform = `rotate(${liegtAuf ? 4 : -30}deg)`;
    clearInterval(this._armWandern);
    if (!liegtAuf) return;
    // Wie bei einer echten Platte wandert der Arm langsam nach innen.
    // Von 4° bis 15° in gut zwölf Minuten — kaum sichtbar, aber vorhanden.
    let winkel = 4;
    this._armWandern = setInterval(() => {
      winkel = Math.min(15, winkel + 0.1);
      schwenk.style.transform = `rotate(${winkel.toFixed(2)}deg)`;
      if (winkel >= 15) clearInterval(this._armWandern);
    }, 6500);
  }

  // ── Ausfall ──────────────────────────────────────────────────────
  markiereStumm(senderId) {
    const karte = document.querySelector(`.karte[data-sender-id="${senderId}"]`);
    if (!karte) return;
    karte.classList.add('ist-stumm');
    if (!karte.querySelector('.karte__stumm')) {
      const hinweis = document.createElement('span');
      hinweis.className = 'karte__stumm';
      hinweis.textContent = t('karte.stumm');
      karte.appendChild(hinweis);
    }
    if (istWackelig(senderId)) karte.classList.add('ans-regalende');
  }

  zeigeVorschlag(gescheitert, ersatz) {
    document.querySelector('.ausfall')?.remove();
    const kasten = document.createElement('div');
    kasten.className = 'ausfall';
    kasten.innerHTML = `<span>${t('ausfall.text', { name: gescheitert.name })}</span>
                        <button type="button">${t('ausfall.knopf', { name: ersatz.name })}</button>`;
    kasten.querySelector('button').addEventListener('click', () => {
      kasten.remove();
      window.app.spieleSender(ersatz);
    });
    document.querySelector('.hero__text').appendChild(kasten);
  }

  raeumeAusfallAuf() {
    document.querySelector('.ausfall')?.remove();
    document.querySelectorAll('.karte.ist-stumm').forEach(k => {
      k.classList.remove('ist-stumm');
      k.querySelector('.karte__stumm')?.remove();
    });
  }

  /*
   Eine Ruecksicht, die stehen bleibt, bis der Besucher entscheidet.

   Anders als `meldung()`: kein Zeitablauf. Fuer Fragen, die eine Antwort
   brauchen — Fehlerbericht senden, neue Fassung laden. Wer nicht antwortet,
   hat damit auch geantwortet: Es passiert nichts.
  */
  frage(text, aktionen) {
    const behaelter = document.getElementById('meldungen');
    if (!behaelter) return;

    const kasten = document.createElement('div');
    kasten.className = 'meldung meldung--info meldung--bleibt';
    kasten.setAttribute('role', 'status');

    const zeile = document.createElement('span');
    zeile.textContent = text;
    kasten.append(zeile);

    for (const a of aktionen) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'meldung__knopf' + (a.haupt ? '' : ' meldung__knopf--leise');
      knopf.textContent = a.text;
      knopf.addEventListener('click', () => { kasten.remove(); a.tun?.(); });
      kasten.append(knopf);
    }

    behaelter.appendChild(kasten);
  }

  meldung(text, art = 'info') {
    const behaelter = document.getElementById('meldungen');
    const el = document.createElement('div');
    el.className = 'meldung meldung--' + art;
    el.textContent = text;
    behaelter.appendChild(el);
    setTimeout(() => { el.classList.add('geht'); setTimeout(() => el.remove(), 300); }, 3200);
  }
}

// ── Anwendung ──────────────────────────────────────────────────────
class App {
  constructor() {
    this.engine = new AudioEngine();
    this.ui = new UI(this.engine);
    this.visualizer = new Visualizer(this.engine);
    this.myRetunerAktiv = false;
  }

  async init() {
    const lautstaerke = speicher.lies(SCHLUESSEL.lautstaerke, 0.7);
    if (typeof lautstaerke === 'number') this.engine.setzeLautstaerke(lautstaerke, false);
    this.engine.setze432(speicher.lies(SCHLUESSEL.pitch432, true));

    this.ui.zeichneFilter();
    this.ui.zeichneRegalwand();
    this.ui.zeichneVerlauf();
    this.misstKopf();
    this.zeichneWochentipp();
    this.zeichneAuslage();
    this.aktualisiereGriff();
    this._verdrahte();

    this.engine.bei('start', () => {
      this.ui.zeigeSpielzustand(true);
      this.ui.zeigeStatus('live', this.engine.statusText());
      this.ui.raeumeAusfallAuf();
      if (this.engine.aktuellerSender) loescheFehlschlag(this.engine.aktuellerSender.id);
      this.visualizer.start();
      this._setzeMediaSession(this.engine.aktuellerSender);
    });

    this.engine.bei('laden',   () => this.ui.zeigeStatus('laden', t('status.verbinden')));
    this.engine.bei('puffern', () => this.ui.zeigeStatus('laden', t('status.puffern')));
    /*
     Die Stillewache hat umgeschaltet: Der Sender stand als „Browser darf
     zugreifen" im Katalog, tat es aber nicht. Jetzt laeuft er ueber den
     direkten Weg — also gilt der andere Satz im Abstandsfeld, und der
     Balkenkranz zeigt kein echtes Signal mehr.
    */
    this.engine.bei('ohneZugriff', (sender) => {
      const feld = document.querySelector('.abstand__satz:not(.abstand__satz--loesung)');
      if (feld) feld.innerHTML = t('stimmung.abstandLangsam');
      const guete = document.getElementById('heroGuete');
      if (guete && sender) {
        guete.textContent = guete.textContent.replace(t('hero.pegel.live'), t('hero.pegel.simuliert'));
      }
      miss('ohne-zugriff', { sender: sender?.id });
    });

    // Kein automatisches Weiterspringen mehr. Früher wechselte die App alle
    // 2,5 s zum nächsten Sender und warf jedes Mal eine rote Meldung — bei
    // 227 toten Einträgen im alten Katalog ein Dauerfeuer.
    this.engine.bei('fehler', () => {
      const sender = this.engine.aktuellerSender;
      if (!sender) return;
      this.ui.zeigeSpielzustand(false);
      this.ui.zeigeStatus('fehler', t('karte.stumm'));
      this.ui.markiereStumm(sender.id);
      zaehleFehlschlag(sender.id);
      const ersatz = findeVerwandten(sender, this.ui.sender.filter(s => !istWackelig(s.id)), new Set([sender.id]));
      if (ersatz) this.ui.zeigeVorschlag(sender, ersatz);
    });

    this.setzeMyRetuner(speicher.lies(SCHLUESSEL.myretuner, false), 'nutzer');
    this.starteMyRetunerErkennung();
    document.getElementById('ladeschirm')?.classList.add('weg');

    // Symbole einsetzen, bevor der Ladeschirm weggeht — sonst blitzen leere
    // Flaechen auf, wo Symbole hingehoeren.
    setzeSymbole();

    this.folgeAdressZiel();
    this.pruefeGeteilteAdresse();

    /*
     Aktualisierung ueberwachen. Spielt gerade Musik, wird nicht von selbst
     neu geladen — der Besucher entscheidet. Siehe lib/aktualisierung.mjs.
    */
    beobachteAktualisierung({
      spieltGerade: () => this.engine.laeuft,
      melde: (text, art) => this.ui.meldung(text, art),
    });

    /*
     Fehlerberichte. Gefragt wird erst, wenn wirklich ein Fehler auftritt —
     eine Einwilligungsfrage beim ersten Besuch betraefe etwas, das
     vielleicht nie passiert, und staende zwischen Besucher und Musik.
    */
    beobachteFehler({ fassung: FASSUNG, melde: this.ui });
  }

  /*
   Ein Ziel aus der Adresse ausführen: ?los=nadel oder ?los=meine.

   Dafür gedacht sind die Sprungziele der installierten App — Rechtsklick
   aufs Symbol in der Taskleiste. Sie stehen als `shortcuts` im Manifest und
   brauchen eine Adresse, die etwas tut.

   Danach wird der Parameter aus der Adresszeile entfernt: Sonst zeigt ein
   Neuladen wieder dasselbe, und ein geteilter Link trägt eine Absicht mit
   sich, die dem Empfänger nichts sagt.
  */
  folgeAdressZiel() {
    const ziel = new URLSearchParams(location.search).get('los');
    if (!ziel) return;

    history.replaceState(null, '', location.pathname);

    if (ziel === 'nadel') this.nadelFallenLassen();
    else if (ziel === 'meine') this.zeigeMeinePlatten();
  }

  // ── Wiedergabe ───────────────────────────────────────────────────
  async spieleSender(sender, optionen = {}) {
    this.ui.aktuelleId = sender.id;
    this.engine.aktuellerSender = sender;
    this.ui.zeigeSender(sender);
    this.ui.markiereAktiv();
    this.ui.zeigeStatus('laden', t('status.verbinden'));
    this.ui.raeumeAusfallAuf();

    if (!optionen.still) {
      zaehleGehoert(sender.id);
      merkeZuletzt(sender.id);
      // Die eine Zahl, die ein Radio wirklich braucht: Wird der Sender
      // ueberhaupt gestartet? Wer nichts startet, hat nichts gefunden.
      miss('start', { sender: sender.id });
      this.aktualisiereGriff();
      this.ui.zeichneVerlauf();
    }
    await this.engine.spiele(sender);
  }

  wechselSpiel() {
    if (!this.engine.aktuellerSender) {
      return this.nadelFallenLassen();   // nichts gewählt: Zufall statt Fehlermeldung
    }
    this.engine.wechsle();
    this.ui.zeigeSpielzustand(this.engine.laeuft);
    this.ui.zeigeStatus(this.engine.laeuft ? 'live' : 'pause',
                        this.engine.laeuft ? this.engine.statusText() : t('status.pausiert'));
    if (!this.engine.laeuft) this.visualizer.stopp();
  }

  // ── Die drei Zugänge ─────────────────────────────────────────────
  // Zurueckgenommene Regale sind ausgenommen — die Wuehlkiste ist da, um
  // Besucher abzuholen, die etwas Vertrautes suchen. Wer das will, legt
  // selbst auf. Der Zufall ist fuer die Besonderheiten da, sonst verfehlt
  // er seinen Zweck. Das gilt fuer Nadel, Auslage und Sender der Woche.
  _ziehbareSender() {
    const zurueckgenommen = new Set(
      this.ui.regale.filter((r) => r.zurueckgenommen).map((r) => r.id));
    return this.ui.sender.filter(
      (s) => !istWackelig(s.id) && !zurueckgenommen.has(s.regal));
  }

  // Der Sender der Woche. Erfindet nichts: er kommt aus dem eigenen,
  // geprueften Katalog und steht fuer alle Besucher derselben Woche fest.
  zeichneWochentipp() {
    const tipp = tippDerWoche(this.ui.sender);
    const abschnitt = document.getElementById('tipp');
    if (!tipp || !abschnitt) return;
    const s = tipp.sender;

    document.getElementById('tippWoche').textContent =
      t('tipp.woche', { woche: tipp.woche, jahr: tipp.jahr });
    document.getElementById('tippName').textContent = s.name;
    document.getElementById('tippOrt').textContent =
      `${s.betreiber} · ${s.ort}, ${s.land} · ${this.ui.regale.find(r => r.id === s.regal)?.name ?? ''}`;
    document.getElementById('tippKaertchen').textContent = s.kaertchen;
    document.getElementById('tippLink').href = s.homepage;
    document.getElementById('tippPlay').onclick = () => this.spieleSender(s);

    const dazu = dazuPassend(s, this.ui.sender, 3);
    document.getElementById('tippDazu').innerHTML = dazu
      .map(d => `<button class="tipp__dazuKnopf" data-sender-id="${d.id}">${d.name}<span>${d.ort}</span></button>`)
      .join('');
    document.getElementById('tippDazu').querySelectorAll('.tipp__dazuKnopf').forEach(k => {
      k.addEventListener('click', () => {
        const gewaehlt = this.ui.senderMitId(k.dataset.senderId);
        if (gewaehlt) this.spieleSender(gewaehlt);
      });
    });
    abschnitt.hidden = false;
  }

  /*
   Misst den Kopf und gibt seine Hoehe als --kopf-hoehe weiter, damit die
   Filterleiste genau darunter klebt.

   Fest verdrahten geht nicht: Der Kopf ist je nach Fensterbreite ein- oder
   zweizeilig, weil das Suchfeld umbricht. Ein fester Wert waere auf der
   einen Breite eine Luecke und auf der anderen eine Ueberdeckung.
  */
  misstKopf() {
    this._misst('kopf', '--kopf-hoehe', true);
    // Dieselbe Messung fuer die untere Navigationsleiste. Ihre Hoehe haengt
    // an der Sprache: 65 px in de/en/es/it, 72 px in ja, 73 px in ar und
    // 86 px in fr. Die Spielerleiste stand darueber fest auf 62,4 px und
    // ueberlappte sie je nach Sprache um 3 bis 24 px.
    this._misst('handyLeiste', '--leiste-hoehe', false);
  }

  _misst(kennung, variable, nurWennKlebend) {
    const el = document.getElementById(kennung);
    if (!el) return;
    const setze = () => {
      const stil = getComputedStyle(el);
      // Auf dem Handy scrollt der Kopf weg, dort klebt die Leiste bei 0.
      // Die Navigationsleiste ist auf dem Rechner gar nicht da (display: none)
      // — dann gilt ebenfalls null.
      const zaehlt = stil.display !== 'none'
                  && (!nurWennKlebend || stil.position === 'sticky');
      document.documentElement.style.setProperty(
        variable, zaehlt ? Math.round(el.offsetHeight) + 'px' : '0px');
    };
    setze();
    if (window.ResizeObserver) new ResizeObserver(setze).observe(el);
    window.addEventListener('resize', setze, { passive: true });
  }

  zeichneAuslage() {
    const auswahl = waehleUeberraschung(this._ziehbareSender(), ladeGehoert(), 6, ladeZuletzt());
    const raster = document.getElementById('auslageRaster');
    raster.innerHTML = auswahl.map(s => this.ui._karteHTML(s)).join('');
    this.ui._verdrahteReihen(raster.parentElement);
    this.ui._verdrahteKarten(raster);
  }

  nadelFallenLassen() {
    const [treffer] = waehleUeberraschung(this._ziehbareSender(), ladeGehoert(), 1, ladeZuletzt());
    if (treffer) {
      this.spieleSender(treffer);
      this.ui.meldung(t('meldung.nadel', { name: treffer.name }), 'info');
    }
  }

  zeigeMeinePlatten() {
    const favoriten = this.ui.sender.filter(s => this.ui.istFavorit(s.id));
    const zuletzt = ladeZuletzt()
      .map(id => this.ui.senderMitId(id))
      .filter(Boolean)
      .filter(s => !favoriten.includes(s));
    const meine = [...favoriten, ...zuletzt];

    if (!meine.length) {
      this.ui.meldung(t('meldung.meineLeer'), 'info');
      return;
    }
    this.ui.zeichneRegale(meine);
    this._zeigeTeilleiste(favoriten);
    document.getElementById('regale').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /*
   ═══ Platten weitergeben ═══════════════════════════════════════════

   Die Merkliste steckt in der Adresse HINTER dem Rautezeichen. Was dort
   steht, schickt der Browser nicht an den Server — kein Protokolleintrag,
   keine Tabelle, kein Konto. Wer seine Platten weitergibt, gibt sie dem
   Empfaenger und niemandem sonst.

   Das ist derselbe Handel wie ueberall hier: kein Login und kein Driss.
   Der Preis dafuer ist, dass eine Liste nur so lange lebt wie der Link.
   Das ist in Ordnung — es ist eine Empfehlung, kein Konto.
  */
  _zeigeTeilleiste(favoriten) {
    const behaelter = document.getElementById('regale');
    if (!behaelter || !favoriten.length) return;
    document.querySelector('.teilen')?.remove();

    const leiste = document.createElement('div');
    leiste.className = 'teilen';
    leiste.innerHTML = `
      <span class="teilen__satz">${t('teilen.satz', { anzahl: favoriten.length })}</span>
      <button class="knopf knopf--leise" type="button">${t('teilen.knopf')}</button>`;
    leiste.querySelector('button').addEventListener('click', async (e) => {
      const adresse = this.baueTeilAdresse(favoriten);
      try {
        await navigator.clipboard.writeText(adresse);
        e.target.textContent = t('teilen.kopiert');
        this.ui.meldung(t('teilen.kopiert'), 'info');
      } catch {
        // Kein Zugriff auf die Zwischenablage — dann eben zum Abschreiben.
        const feld = document.createElement('input');
        feld.className = 'teilen__feld';
        feld.value = adresse;
        feld.readOnly = true;
        leiste.appendChild(feld);
        feld.select();
      }
      miss('teilen', { anzahl: favoriten.length });
    });
    behaelter.before(leiste);
  }

  baueTeilAdresse(favoriten) {
    const ids = favoriten.map(s => s.id).join('.');
    return `${location.origin}${location.pathname}#platten=${ids}`;
  }

  /*
   Die Gegenseite: Jemand oeffnet einen weitergegebenen Link.

   Es wird NICHTS ungefragt uebernommen. Die Seite zeigt, was drin ist, und
   fragt. Eine fremde Liste stillschweigend in die eigene zu schreiben waere
   ein Uebergriff — und der Empfaenger haette hinterher zwanzig Sender im
   Fach, die er nie gewaehlt hat.
  */
  pruefeGeteilteAdresse() {
    if (!GETEILTE_PLATTEN) return;
    const ids = GETEILTE_PLATTEN.split('.').filter(Boolean);
    const sender = ids.map(id => this.ui.senderMitId(id)).filter(Boolean);
    history.replaceState(null, '', location.pathname + location.search);
    if (!sender.length) return;

    this.ui.zeichneRegale(sender);
    const behaelter = document.getElementById('regale');
    const leiste = document.createElement('div');
    leiste.className = 'teilen teilen--empfangen';
    leiste.innerHTML = `
      <span class="teilen__satz">${t('teilen.empfangen', { anzahl: sender.length })}</span>
      <button class="knopf" type="button">${t('teilen.uebernehmen')}</button>`;
    leiste.querySelector('button').addEventListener('click', () => {
      for (const s of sender) if (!this.ui.istFavorit(s.id)) this.ui.toggleFavorit(s.id);
      leiste.remove();
      this.ui.meldung(t('teilen.uebernommen', { anzahl: sender.length }), 'info');
      miss('teilen-uebernommen', { anzahl: sender.length });
    });
    document.querySelector('.teilen')?.remove();
    behaelter.before(leiste);
    leiste.scrollIntoView({ block: 'start' });
  }

  aktualisiereGriff() {
    const anzahl = this.ui.favoriten.size + ladeZuletzt().length;
    const el = document.getElementById('griffMeineZahl');
    if (el) el.textContent = anzahl ? t('griff.meine.zahl', { anzahl }) : t('griff.meine.leer');
  }

  // ── Suche ────────────────────────────────────────────────────────
  suche(eingabe) {
    // Fuettert denselben Filterzustand wie die Knoepfe. Vorher zeichnete die
    // Suche direkt und verwarf dabei jede aktive Auswahl.
    this.ui.setzeSuche(eingabe);

    /*
     Gemeldet wird, DASS jemand sucht — nie wonach.

     Das Ereignis haengt am ersten Zeichen und nicht an jedem: Bei jedem
     Tastendruck zu melden hiesse, das Suchwort buchstabenweise zu senden.
     Aus "j", "ja", "jaz", "jazz" liesse es sich zusammensetzen, auch wenn
     keine einzelne Zeile es enthaelt. Ein Ereignis je begonnener Suche
     beantwortet "wird die Suche benutzt?" genauso gut — und laesst sich
     nicht zusammensetzen.
    */
    const leer = !eingabe.trim();
    if (!leer && !this._suchteSchon) miss('suche');
    this._suchteSchon = !leer;
  }

  // ── IYAMBAE Tuner ────────────────────────────────────────────────
  // Stufe 1: von Hand geschaltet. In Runde 3 ruft die Erkennung dieselbe
  // Funktion mit quelle='erkannt' auf — die Oberfläche bleibt identisch.
  setzeMyRetuner(istAn, quelle = 'nutzer') {
    this.myRetunerAktiv = !!istAn;
    if (quelle === 'nutzer') speicher.schreib(SCHLUESSEL.myretuner, this.myRetunerAktiv);

    // Läuft der IYAMBAE Tuner systemweit und die Seite verstimmt zusätzlich,
    // landet man bei rund 424 Hz — doppelt heruntergezogen.
    if (this.myRetunerAktiv) this.engine.setze432(false);

    const knopf432 = document.getElementById('knopf432');
    if (knopf432) {
      knopf432.disabled = this.myRetunerAktiv;
      knopf432.querySelector('.stimmung__wort').textContent =
        this.myRetunerAktiv ? t('kopf.432.myretuner')
                            : t(this.engine.ist432An ? 'kopf.432.an' : 'kopf.432.aus');
      const an = this.engine.ist432An && !this.myRetunerAktiv;
      knopf432.classList.toggle('ist-an', an);
      knopf432.setAttribute('aria-checked', String(an));
      /*
       Erst wenn die Stimmung wirklich an ist, wird darunter etwas sichtbar.
       Vorher ist „Ich habe MyRetuner" eine Frage nach einem Ding, von dem
       der Besucher noch nie gehoert hat — und ein Hinweis auf eine App die
       Antwort auf eine Frage, die er nicht gestellt hat.

       Angezeigt wird auch, solange MyRetuner selbst stimmt: Dann steht dort
       die gemessene Tonhoehe, und die ist der eigentliche Beleg.
      */
      document.body.classList.toggle('stimmt-432', an || this.myRetunerAktiv);
    }
    /*
     Frueher stand hier die Beschriftung des zweiten Knopfes. Der ist kein
     Umschalter mehr, sondern heisst „Ich habe den IYAMBAE Tuner" und ist
     ueberall ausser im Zustand `erlaubt` sichtbar — siehe `_zeigeZugang`.
     Wuerde hier weiterhin geschrieben, ueberschriebe der Aufruf beim Start
     die neue Beschriftung mit „Tuner aus".
    */
  }

  // ── IYAMBAE Tuner, Stufe 2: Erkennung ────────────────────────────
  // Einmal beim Laden, danach alle fuenf Sekunden waehrend Musik laeuft.
  // Schlaegt die Abfrage fehl, faellt alles still auf den Handschalter
  // zurueck — der Besucher merkt nichts.
  starteMyRetunerErkennung() {
    const zustand = speicher.lies(SCHLUESSEL.mrZustand, ZUSTAND.unbekannt);
    this._zeigeZugang(zustand);

    if (zustand !== ZUSTAND.erlaubt) return;

    /*
     Der einzige Fall, in dem ungefragt abgefragt wird — und er ist
     unbedenklich: Browser-Berechtigung und Einwilligung der App liegen beide
     vor, es erscheint kein Dialog. Nachgeprueft wird trotzdem bei jedem
     Besuch, denn die App koennte deinstalliert oder die Einwilligung dort
     widerrufen worden sein.
    */
    const abfragen = async () => {
      const daten = await frageMyRetuner();
      this._zeigeMyRetuner(daten);
    };

    /*
     Auch hier wird NICHT blind losgefragt.

     Chrome zeigt seinen Berechtigungsdialog ohne Nutzergeste — eine Abfrage
     beim Laden kann also unvermittelt einen Dialog aufziehen, den der
     Besucher nicht erwartet. Und drei weggeklickte Dialoge sperren die
     Herkunft dauerhaft. Eine solche Abfrage waere genau das, was das
     Einwilligungsmodell ausschliesst.

     Nur `granted` ist eine Erlaubnis. `denied` sowieso nicht — und `prompt`
     auch nicht: Es bedeutet „es wuerde gefragt", also gerade den Fall, den
     wir vermeiden. Bleibt `unbekannt` (Firefox, Safari, alles ohne diesen
     Berechtigungsnamen): Dort gibt es keinen bekannten Browserdialog, und
     die Einwilligung fuer diese Herkunft liegt ja bereits vor.
    */
    (async () => {
      const stand = await frageBerechtigung();
      if (stand === 'denied' || stand === 'prompt') return;

      abfragen();

      // Nur EIN Takt. Nach einer erfolgreichen Einwilligung ruft
      // frageMyRetunerAn() diese Funktion noch einmal auf; ohne die Sperre
      // liefe danach ein zweiter Zeitgeber mit, und der Tuner bekaeme
      // dauerhaft die doppelte Zahl an Anfragen.
      if (this._mrTakt) return;
      this._mrTakt = setInterval(
        () => { if (this.engine.laeuft || this.myRetunerErkannt) abfragen(); }, 5000);
    })();
  }

  /*
   Auf Klick: Der Browser fragt den Nutzer um Erlaubnis fuer den lokalen
   Zugriff, danach fragt die App ihn um Einwilligung fuer diese Herkunft.
   Beides dauert, also wird gewartet statt einmal zu probieren.
  */
  async frageMyRetunerAn() {
    const knopf = document.getElementById('knopfMyRetuner');
    const feld  = document.getElementById('myRetunerMessung');

    /*
     Sperre gegen schnelles Wiederklicken.

     Chrome sperrt eine Herkunft VON SELBST UND DAUERHAFT, wenn sein Dialog
     dreimal weggeklickt wird. Wer den Knopf dreimal drueckt, ohne im Dialog
     zu antworten, haette sich die Bruecke also verbaut, ohne es zu merken —
     und ohne dass wir es rueckgaengig machen koennten.

     Die Sperre lebt im Arbeitsspeicher und NICHT im oertlichen Speicher:
     Etwas auf dem Endgeraet abzulegen loest § 25 TDDDG aus, und dafuer ist
     eine Klicksperre es nicht wert. Sie ueberlebt kein Neuladen — das ist in
     Ordnung, denn Neuladen ist keine Klickfolge.
    */
    if (Date.now() < (this._mrSperreBis ?? 0)) return;

    const zeige = (schluessel) => {
      if (feld) { feld.textContent = t(schluessel); feld.hidden = false; }
    };

    if (knopf) knopf.disabled = true;
    zeige('myretuner.warteBrowser');

    /*
     Das Warten darf lange dauern und darf dabei NICHT nach Fehler aussehen.
     Der Besucher schaut in diesem Moment auf Chromes Dialog, nicht auf
     unsere Seite — deshalb sagt der Text, wo seine Antwort hingehoert, und
     wechselt mit, sobald der Browser durch ist und nur noch die App fragt.
    */
    const { ausgang, daten } = await wartAufEinwilligung(
      undefined, undefined,
      (phase) => zeige(phase === 'browser' ? 'myretuner.warteBrowser'
                                           : 'myretuner.warte'));

    if (knopf) knopf.disabled = false;

    if (ausgang === AUSGANG.da) {
      speicher.schreib(SCHLUESSEL.mrZustand, ZUSTAND.erlaubt);
      this._zeigeZugang(ZUSTAND.erlaubt);
      this._zeigeMyRetuner(daten);
      this.starteMyRetunerErkennung();
      return;
    }

    this._mrSperreBis = Date.now() + 30000;

    /*
     Zwei Ausgaenge, zwei Saetze — und der Unterschied ist wichtig.

     `browserSperrt` heisst: Die Berechtigung steht auf `denied`. Das ist der
     EINZIGE Stand, auf den man sich verlassen kann (`granted` und `prompt`
     sagen nichts darueber, ob eine Anfrage durchkaeme). Hier ist ein
     Handgriff moeglich, also wird er genannt.

     `keinTuner` ist der NORMALFALL, nicht der Fehlerfall: Die allermeisten
     Besucher haben die App schlicht nicht. Ein Satz, kein Vorwurf, keine
     Anleitung. Die Seite stimmt weiter selbst um, ratend, wie immer.

     Das ersetzt ausserdem eine stille Sackgasse: Frueher wurde hier
     `abgelehnt` geschrieben und der Knopf danach fuer immer verborgen.
    */
    speicher.schreib(SCHLUESSEL.mrZustand, ZUSTAND.abgelehnt);
    zeige(ausgang === AUSGANG.browserSperrt ? 'myretuner.browserSperrt'
                                            : 'myretuner.nichtErreicht');
    this._zeigeZugang(ZUSTAND.abgelehnt);
  }

  /*
   Welche der beiden Schaltflaechen sichtbar ist, haengt allein am Zustand:

     unbekannt   Knopf ja,   Hinweis ja    erster Besuch
     erlaubt     Knopf nein, Hinweis nein  die Messung spricht fuer sich
     abgelehnt   Knopf ja,   Hinweis ja    ein zweiter Versuch bleibt moeglich

   `abgelehnt` verbarg den Knopf frueher auf Dauer. Das war als „nicht
   nachbohren" gemeint und wurde zur Falle: Ein Fehlversuch hat viele
   Ursachen, die haeufigste — die Herkunft ist im Tuner noch nicht
   freigegeben — behebt der Besucher in zehn Sekunden, und danach gab es
   keinen Weg zurueck.

   Genervt wird trotzdem niemand: Von SELBST fragt die Seite in diesem
   Zustand nie (siehe starteMyRetunerErkennung). Der Knopf ist ein Angebot,
   keine Rueckfrage.
  */
  _zeigeZugang(zustand) {
    const knopf   = document.getElementById('knopfMyRetuner');
    const werbung = document.getElementById('knopfMyRetunerHolen');
    if (knopf)   knopf.hidden   = (zustand === ZUSTAND.erlaubt);
    if (werbung) werbung.hidden = (zustand === ZUSTAND.erlaubt);
  }

  _zeigeMyRetuner(daten) {
    const lief = this.myRetunerErkannt;
    this.myRetunerErkannt = !!(daten && daten.aktiv);

    if (this.myRetunerErkannt) {
      if (!lief) this.setzeMyRetuner(true, 'erkannt');
      const ziel = anzeigeStimmung(daten);
      const quelle = anzeigeQuelle(daten);
      // Der eigentliche Moment: die Seite raet 440, die App hat gemessen.
      const text = quelle
        ? t(quelle.sicher ? 'myretuner.quelle' : 'myretuner.quelleUnsicher',
            { wert: quelle.wert, ziel })
        : t('myretuner.erkannt', { ziel });
      const feld = document.getElementById('myRetunerMessung');
      if (feld) { feld.textContent = text; feld.hidden = false; }
      // Sie antwortet wieder — der Hinweis hat sich erledigt.
      const werbung = document.getElementById('knopfMyRetunerHolen');
      if (werbung) werbung.hidden = true;
    } else {
      const feld = document.getElementById('myRetunerMessung');
      if (feld) feld.hidden = true;
      // Nur zuruecksetzen, wenn die Erkennung ihn vorher gesetzt hatte —
      // ein von Hand gesetzter Schalter bleibt, wie der Nutzer ihn ließ.
      if (lief) this.setzeMyRetuner(speicher.lies(SCHLUESSEL.myretuner, false), 'nutzer');

      /*
       Eingewilligt, aber niemand antwortet: Die App kann deinstalliert oder
       die Einwilligung dort widerrufen worden sein. Dann faellt die Seite
       still auf den Hinweis zurueck — aber ohne erneut zu fragen, denn die
       Einwilligung wurde ja einmal gegeben. Der gespeicherte Zustand bleibt
       deshalb unangetastet.
      */
      const werbung = document.getElementById('knopfMyRetunerHolen');
      if (werbung) werbung.hidden = false;
    }
  }

  wechsle432() {
    if (this.myRetunerAktiv) return;
    this.engine.setze432(!this.engine.ist432An);
    this.setzeMyRetuner(false, 'anzeige');
    this.ui.zeigeStatus(this.engine.laeuft ? 'live' : 'pause',
                        this.engine.laeuft ? this.engine.statusText() : t('status.pausiert'));
  }

  // ── Verdrahtung ──────────────────────────────────────────────────
  _verdrahte() {
    const anKlick = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);

    anKlick('griffMeinePlatten', () => this.zeigeMeinePlatten());
    anKlick('griffNadel',        () => this.nadelFallenLassen());
    anKlick('heroPlay',          () => this.wechselSpiel());
    anKlick('barPlay',           () => this.wechselSpiel());
    anKlick('knopf432',          () => this.wechsle432());
    anKlick('knopfMyRetuner',    () => this.frageMyRetunerAn());
    anKlick('auslageNeu',        () => this.zeichneAuslage());
    anKlick('filterZuruecksetzen', () => this.ui.filterZuruecksetzen());
    anKlick('filterPanelLeeren',   () => this.ui.filterZuruecksetzen());

    /*
     Die Datenschutz-Einstellungen.

     Ein natives <dialog> wie das Filterpanel — Fokusfang, Escape und
     Verdunkler kommen vom Browser. Kein Banner beim ersten Besuch: Es gibt
     hier nichts, wofuer eine Einwilligung noetig waere, und ein Banner ohne
     Anlass gewoehnt Menschen nur ans Wegklicken.
    */
    const einst = document.getElementById('einstellungen');
    if (einst) {
      const schalterM = document.getElementById('schalterMessung');
      const schalterF = document.getElementById('schalterFehler');
      const zeige = () => {
        if (schalterM) schalterM.checked = messungLaeuft();
        // Der Fehlerschalter zeigt den Ist-Zustand. Er laesst sich nur AUS-
        // schalten: Zustimmung wird im Fehlerfall gefragt, nicht auf Vorrat
        // erteilt.
        if (schalterF) {
          schalterF.checked = einwilligungsstand() === 'erlaubt';
          schalterF.disabled = einwilligungsstand() !== 'erlaubt';
        }
      };
      anKlick('einstellungenAuf', () => { zeige(); einst.showModal(); });
      anKlick('einstellungenZu', () => einst.close());
      anKlick('einstellungenFertig', () => einst.close());
      einst.addEventListener('click', (e) => { if (e.target === einst) einst.close(); });
      schalterM?.addEventListener('change', (e) => {
        setzeMessung(e.target.checked);
        this.ui.meldung(t(e.target.checked ? 'einstellungen.messungAn' : 'einstellungen.messungAus'));
      });
      schalterF?.addEventListener('change', (e) => {
        if (!e.target.checked) {
          widerrufeEinwilligung();
          zeige();
          this.ui.meldung(t('fuss.widerrufen'));
        }
      });
    }

    anKlick('heroFavorit',       () => { if (this.ui.aktuelleId) this.ui.toggleFavorit(this.ui.aktuelleId); });

    /*
     Ein Zuhoerer fuer alle Chips, egal wo sie stehen.

     Die Chips entstehen bei jedem Filterwechsel neu — in der Leiste, im
     Panel und in der Standanzeige. Sie einzeln zu verdrahten hiesse, bei
     jedem Klick Dutzende Zuhoerer wegzuwerfen und neu anzulegen. Der Klick
     steigt ohnehin bis zum Dokument auf; hier wird er einmal abgefangen.
    */
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip[data-achse]');
      if (chip && !chip.disabled) this.ui.schalteFilter(chip.dataset.achse, chip.dataset.wert);
    });

    const suchfeld = document.getElementById('suche');
    suchfeld?.addEventListener('input', (e) => this.suche(e.target.value));

    const regler = document.getElementById('lautstaerke');
    if (regler) {
      regler.value = this.engine.lautstaerke;
      regler.addEventListener('input', (e) => this.engine.setzeLautstaerke(parseFloat(e.target.value)));
    }

    document.querySelectorAll('.handy-leiste button').forEach(knopf => {
      knopf.addEventListener('click', () => {
        const ziel = knopf.dataset.ziel;
        if (ziel === 'nadel') return this.nadelFallenLassen();
        if (ziel === 'meine') return this.zeigeMeinePlatten();
        if (ziel === 'suche') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          suchfeld?.focus();
          return;
        }
        document.getElementById('auslage')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
      const tasten = {
        ' ': () => this.wechselSpiel(),
        'z': () => this.nadelFallenLassen(),
        'Z': () => this.nadelFallenLassen(),
        'h': () => this.wechsle432(),
        'H': () => this.wechsle432(),
        'm': () => this.engine.wechsleStumm(),
        'M': () => this.engine.wechsleStumm(),
        '/': () => suchfeld?.focus(),
        'ArrowUp':   () => this.engine.setzeLautstaerke(this.engine.lautstaerke + 0.05),
        'ArrowDown': () => this.engine.setzeLautstaerke(this.engine.lautstaerke - 0.05),
      };
      if (tasten[e.key]) { e.preventDefault(); tasten[e.key](); }
    });
  }

  // Sperrbildschirm und Bluetooth-Tasten. Lief früher nie, weil der
  // nachgereichte Skriptblock auf window.app wartete — das nie gesetzt wurde.
  _setzeMediaSession(sender) {
    if (!('mediaSession' in navigator) || !sender) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: sender.name,
        artist: sender.betreiber ?? 'IYAMBAE Radio',
        album: 'IYAMBAE Radio',
      });
      navigator.mediaSession.setActionHandler('play',  () => this.wechselSpiel());
      navigator.mediaSession.setActionHandler('pause', () => this.wechselSpiel());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.nadelFallenLassen());
      navigator.mediaSession.playbackState = 'playing';
    } catch {}
  }
}

// ── Start ──────────────────────────────────────────────────────────
const app = new App();
window.app = app;        // Ohne diese Zeile finden die Zusatzteile die Instanz nicht.
await app.init();

/*
 Wenn jemand den Laden auf den Startbildschirm legt.

 'installiert' stand von Anfang an in der Erlaubnisliste von messung.mjs und
 wurde nie gemeldet — die Auswertung haette eine Linie gezeigt, die immer
 null ist, und niemand haette gewusst, ob das die Wahrheit oder ein Fehler
 ist. Also entweder melden oder die Art streichen; melden ist richtiger.

 'appinstalled' feuert erst, wenn der Einbau WIRKLICH durch ist —
 'beforeinstallprompt' feuert schon, wenn er nur moeglich waere, und das ist
 eine ganz andere Zahl.
*/
addEventListener('appinstalled', () => miss('installiert'));
