/*
 Auf welcher Stimmung steht eine Aufnahme?

 Dieselbe Rechnung, die im IYAMBAE Tuner die Quellstimmung schaetzt
 (RetunerCore/TuningAnalyzer.swift), hier fuer eine ganze Datei statt fuer
 einen laufenden Strom. Nachgebaut, nicht uebersetzt — Swift laeuft nicht im
 Browser. Die Schritte sind dieselben:

   Hann-Fenster → FFT → Spektralgipfel mit parabolischer Interpolation
   → Abweichung jedes Gipfels von der naechsten gleichstufigen Stufe
   → ZIRKULAERER Mittelwert.

 WARUM ZIRKULAER: Die Abweichung lebt modulo 100 Cent. +49 und −51 sind
 dieselbe Stimmung. Ein gewoehnlicher Mittelwert lieferte an der Nahtstelle
 Unsinn. Jede Abweichung wird deshalb als Einheitszeiger mit Winkel
 2π·dev/100 aufsummiert; der Winkel der Summe ist die Stimmung.

 ── WAS HIER ANDERS IST ALS IM TUNER, UND WARUM ────────────────────

 Der Tuner hoert einen Strom und muss jede Sekunde antworten. Er vergisst
 deshalb exponentiell (7 s lang) und schaetzt seine Sicherheit daraus, ob ein
 kurzes und ein langes Gedaechtnis dasselbe sagen.

 Eine Datei liegt ganz vor. Das erlaubt etwas Besseres: Wir nehmen PROBEN aus
 dem ganzen Stueck, rechnen jede fuer sich aus und sehen nach, ob sie
 uebereinstimmen. Das ist dasselbe Prinzip — zwei Zeugen, die sich einig sein
 muessen —, nur mit echten unabhaengigen Zeugen statt zweier Zeitkonstanten
 auf demselben Material.

 Es ist ausserdem schneller: 24 Proben zu 4 Sekunden sind 96 Sekunden Klang,
 gleich verteilt ueber das Stueck. Ein Vierminuenstueck ganz zu rechnen
 dauerte zweieinhalbmal so lang und saehe die leisen Stellen ueberbetont.

 ── WAS DIESE MESSUNG NICHT KANN ───────────────────────────────────

 Sie sagt, auf welchem Kammerton die Aufnahme steht, wenn dort ueberhaupt
 einer steht. Bei Perkussion, Sprache, Rauschen und stark verstimmtem
 Material heben sich die Zeiger auf, und dann sagt sie das auch — mit einer
 niedrigen Sicherheit statt mit einer erfundenen Zahl.

 Und sie kann eine Stimmung nur modulo Halbton bestimmen. Eine Aufnahme, die
 exakt einen Halbton tiefer liegt, sieht aus wie 440. Das ist keine
 Schwaeche der Rechnung, sondern liegt in der Sache: Ein Halbton tiefer ist
 dieselbe Stimmung, andere Tonart.
*/

export const STANDARD_A4 = 440.0;

/* Die Kammertoene, die in freier Wildbahn vorkommen. */
export const KAMMERTOENE = [
  { hz: 415.30, name: 'Barock',            kurz: '415' },
  { hz: 432.00, name: 'Verdi · Mailand 1880', kurz: '432' },
  { hz: 435.00, name: 'Paris 1859',        kurz: '435' },
  { hz: 440.00, name: 'ISO 16',            kurz: '440' },
  { hz: 442.00, name: 'viele Orchester',   kurz: '442' },
  { hz: 443.00, name: 'Deutschland heute', kurz: '443' },
  { hz: 445.00, name: 'Karajan',           kurz: '445' },
];

const FFT = 16384;
const SPRUNG = FFT / 2;
const TIEFSTE_HZ = 60;
const HOECHSTE_HZ = 2000;

/* Eine Probe. Vier Sekunden reichen fuer acht Analysebilder. */
const PROBE_SEKUNDEN = 4;
const PROBEN_HOECHSTENS = 24;

// ── FFT ─────────────────────────────────────────────────────────────
// Iterativ, radix-2, an Ort und Stelle. Kein Fremdcode: Das Modul soll
// ohne Netz und ohne zweite Datei arbeiten.

function dreheTabelle(n) {
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos(-2 * Math.PI * i / n);
    sin[i] = Math.sin(-2 * Math.PI * i / n);
  }
  return { cos, sin };
}

function bitUmkehr(n) {
  const t = new Uint32Array(n);
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    t[i] = j;
  }
  return t;
}

const DREH = dreheTabelle(FFT);
const UMKEHR = bitUmkehr(FFT);

function fft(re, im) {
  const n = FFT;
  for (let i = 1; i < n; i++) {
    const j = UMKEHR[i];
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let laenge = 2; laenge <= n; laenge <<= 1) {
    const schritt = n / laenge, halb = laenge >> 1;
    for (let i = 0; i < n; i += laenge) {
      for (let k = 0; k < halb; k++) {
        const w = k * schritt;
        const wr = DREH.cos[w], wi = DREH.sin[w];
        const a = i + k, b = a + halb;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr;        im[a] += xi;
      }
    }
  }
}

// ── Ein Analysebild ─────────────────────────────────────────────────

const FENSTER = (() => {
  const w = new Float64Array(FFT);
  for (let n = 0; n < FFT; n++) w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (FFT - 1)));
  return w;
})();

const re = new Float64Array(FFT), im = new Float64Array(FFT);
const betrag = new Float64Array(FFT / 2);

/*
 Ein Block hinein, ein Zeiger heraus. Gibt null zurueck, wenn der Block zu
 leise ist oder keine brauchbaren Gipfel traegt — nicht etwa eine Null, die
 wie ein Messwert aussaehe.
*/
function bildZeiger(proben, ab, abtastrate) {
  let quadratsumme = 0;
  for (let n = 0; n < FFT; n++) {
    const v = (proben[ab + n] || 0) * FENSTER[n];
    re[n] = v; im[n] = 0;
    quadratsumme += v * v;
  }
  // −60 dBFS: darunter ist nichts, was eine Stimmung haette.
  if (quadratsumme / FFT <= 1e-6) return null;

  fft(re, im);
  re[0] = 0; im[0] = 0;              // Bin 0 traegt DC und Nyquist gemischt
  for (let b = 0; b < FFT / 2; b++) betrag[b] = Math.hypot(re[b], im[b]);

  const binHz = abtastrate / FFT;
  const tief = Math.max(2, Math.floor(TIEFSTE_HZ / binHz));
  const hoch = Math.min(FFT / 2 - 3, Math.floor(HOECHSTE_HZ / binHz));
  if (hoch <= tief) return null;

  let groesster = 0;
  for (let b = tief; b <= hoch; b++) if (betrag[b] > groesster) groesster = betrag[b];
  if (groesster <= 0) return null;
  const schwelle = groesster * 0.02;   // −34 dB unter dem groessten Gipfel

  let zr = 0, zi = 0, gewicht = 0;
  for (let b = tief; b <= hoch; ) {
    const v = betrag[b];
    if (v > schwelle && v > betrag[b - 1] && v >= betrag[b + 1]) {
      // Parabolische Interpolation ueber den LOGARITHMIERTEN Betrag.
      const l = Math.log(Math.max(betrag[b - 1], 1e-20));
      const m = Math.log(v);
      const r = Math.log(Math.max(betrag[b + 1], 1e-20));
      const nenner = l - 2 * m + r;
      let d = 0;
      if (Math.abs(nenner) > 1e-12) d = Math.max(-0.5, Math.min(0.5, 0.5 * (l - r) / nenner));

      const hz = (b + d) * binHz;
      if (hz >= TIEFSTE_HZ && hz <= HOECHSTE_HZ) {
        const cent = 1200 * Math.log2(hz / STANDARD_A4);
        const abweichung = cent - 100 * Math.round(cent / 100);
        const winkel = 2 * Math.PI * abweichung / 100;
        // Wurzel des Betrags: laute Bassgrundtoene sollen die Statistik
        // nicht allein bestimmen.
        const g = Math.sqrt(v);
        zr += g * Math.cos(winkel);
        zi += g * Math.sin(winkel);
        gewicht += g;
      }
      b += 2;                        // Nachbarbins gehoeren zum selben Gipfel
    } else b += 1;
  }
  return gewicht > 0 ? { zr, zi, gewicht } : null;
}

/* Winkel eines Zeigers in Cent, normiert auf [−50, +50). */
function zuCent(zr, zi) {
  let c = Math.atan2(zi, zr) / (2 * Math.PI) * 100;
  if (c >= 50) c -= 100; else if (c < -50) c += 100;
  return c;
}

/* Abstand zweier Cent-Werte AUF DEM KREIS: 49 und −49 liegen 2 auseinander. */
export function centAbstand(a, b) {
  let d = Math.abs(a - b);
  return d > 50 ? 100 - d : d;
}

// ── Die ganze Datei ─────────────────────────────────────────────────

/**
 * @param {Float32Array} proben  Mono, beliebige Laenge
 * @param {number} abtastrate
 * @param {(anteil:number)=>void} [fortschritt]
 */
export function messeStimmung(proben, abtastrate, fortschritt) {
  const laenge = proben.length;
  const probeLaenge = Math.min(laenge, Math.round(PROBE_SEKUNDEN * abtastrate));
  if (probeLaenge < FFT) {
    return { genug: false, grund: 'zu_kurz', sekunden: laenge / abtastrate };
  }

  /*
   Anfang und Ende auslassen: Dort stehen Ein- und Ausblendungen, Applaus,
   Ansagen. Bei sehr kurzen Dateien faellt der Rand weg, sonst bliebe nichts.
  */
  const rand = laenge > 20 * abtastrate ? Math.round(laenge * 0.02) : 0;
  const von = rand, bis = laenge - rand;
  const spanne = bis - von;

  const anzahl = Math.max(1, Math.min(PROBEN_HOECHSTENS,
                                      Math.floor(spanne / probeLaenge)));
  const schritt = anzahl > 1 ? (spanne - probeLaenge) / (anzahl - 1) : 0;

  let gesamtR = 0, gesamtI = 0, gesamtG = 0, bilder = 0;
  const einzeln = [];

  for (let p = 0; p < anzahl; p++) {
    const start = von + Math.round(p * schritt);
    let pr = 0, pi = 0, pg = 0, pb = 0;
    for (let ab = start; ab + FFT <= start + probeLaenge; ab += SPRUNG) {
      const z = bildZeiger(proben, ab, abtastrate);
      if (!z) continue;
      pr += z.zr; pi += z.zi; pg += z.gewicht; pb++;
    }
    if (pg > 0) {
      gesamtR += pr; gesamtI += pi; gesamtG += pg; bilder += pb;
      einzeln.push({
        sekunde: start / abtastrate,
        cent: zuCent(pr, pi),
        gewicht: pg,
        einigkeit: Math.hypot(pr, pi) / pg,
      });
    }
    if (fortschritt) fortschritt((p + 1) / anzahl);
  }

  if (gesamtG <= 0 || einzeln.length === 0) {
    return { genug: false, grund: 'kein_klang', sekunden: laenge / abtastrate };
  }

  const cent = zuCent(gesamtR, gesamtI);
  const a4 = STANDARD_A4 * Math.pow(2, cent / 1200);

  /*
   Die Sicherheit aus drei Faktoren, alle in [0, 1]:

   STRUKTUR    Laenge des Summenzeigers im Verhaeltnis zum Gewicht. Wo keine
               Struktur ist — Rauschen, Perkussion —, heben sich die Zeiger
               auf. Wie im Tuner auf 0,05 bezogen.
   EINIGKEIT   Sind sich die Proben untereinander einig? Der mittlere
               Kreisabstand zur Gesamtschaetzung, an 12 Cent gemessen —
               derselbe Toleranzwert wie im Tuner.
   MATERIAL    Genug Klang gesehen? Drei Sekunden sind die Untergrenze,
               wie im Tuner.
  */
  const kohaerenz = Math.hypot(gesamtR, gesamtI) / gesamtG;
  const struktur = Math.min(1, kohaerenz / 0.05);

  let abweichungssumme = 0, gewichtssumme = 0;
  for (const e of einzeln) {
    abweichungssumme += centAbstand(e.cent, cent) * e.gewicht;
    gewichtssumme += e.gewicht;
  }
  const mittlererAbstand = abweichungssumme / gewichtssumme;
  const einigkeit = Math.max(0, 1 - mittlererAbstand / 12);

  const noetigeBilder = 3 * abtastrate / SPRUNG;
  const material = Math.min(1, bilder / noetigeBilder);

  const sicherheit = struktur * einigkeit * material;

  return {
    genug: true,
    a4, cent, sicherheit,
    teile: { struktur, einigkeit, material },
    proben: einzeln,
    bilder,
    sekunden: laenge / abtastrate,
    naechster: naechsterKammerton(a4),
  };
}

/*
 Der naechstgelegene gebraeuchliche Kammerton — und wie weit weg.

 Verglichen wird IN CENT, nicht in Hertz: Ein Hertz bei 415 ist ein anderer
 Abstand als ein Hertz bei 445.
*/
export function naechsterKammerton(a4) {
  let bester = null, bestAbstand = Infinity;
  for (const k of KAMMERTOENE) {
    const abstand = Math.abs(1200 * Math.log2(a4 / k.hz));
    if (abstand < bestAbstand) { bestAbstand = abstand; bester = k; }
  }
  return { ...bester, abstandCent: bestAbstand };
}
