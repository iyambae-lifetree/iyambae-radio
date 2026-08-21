// ═══════════════════════════════════════════════════════════════════
// Sprache — Oberflaechentexte nachschlagen
//
// Die sichtbaren Texte stehen in assets/lang/<kuerzel>.json, nicht im
// Programmtext. Die Sendertexte gehoeren NICHT hierher: sie sind kuratierter
// Inhalt und bleiben in data/sender.json.
//
// Arabisch kommt spaeter dazu. Deshalb traegt jede Sprache von Anfang an
// ihre Schreibrichtung mit, auch wenn sie heute ueberall "ltr" ist — sonst
// muesste beim Nachruesten jede Aufrufstelle noch einmal angefasst werden.
// ═══════════════════════════════════════════════════════════════════

export const SPRACHEN = {
  de: { name: 'Deutsch', richtung: 'ltr' },
  en: { name: 'English', richtung: 'ltr' },
};

// Deutsch ist der Bestand — fehlt ein Schluessel in einer Uebersetzung,
// steht dort lieber der deutsche Satz als der nackte Schluessel.
const RUECKFALL = 'de';
const SCHLUESSEL_WAHL = 'hz_sprache';

let AKTUELL = RUECKFALL;
let TEXTE = {};
let TEXTE_RUECKFALL = {};

// ── Wahl ───────────────────────────────────────────────────────────
function liesWahl() {
  try { return localStorage.getItem(SCHLUESSEL_WAHL); } catch { return null; }
}

function merkeWahl(kuerzel) {
  try { localStorage.setItem(SCHLUESSEL_WAHL, kuerzel); } catch {}
  return kuerzel;
}

/*
 Reihenfolge: bewusste Wahl schlaegt Browser schlaegt Deutsch.

 `?sprache=en` in der Adresse gilt als bewusste Wahl und bleibt deshalb
 liegen — sonst muesste man den Parameter bei jedem Besuch neu anhaengen.
*/
export function erkenneSprache() {
  const ausAdresse = new URLSearchParams(location.search).get('sprache');
  if (ausAdresse && SPRACHEN[ausAdresse]) return merkeWahl(ausAdresse);

  const gemerkt = liesWahl();
  if (gemerkt && SPRACHEN[gemerkt]) return gemerkt;

  const angebot = navigator.languages?.length
    ? navigator.languages
    : [navigator.language ?? ''];
  for (const tag of angebot) {
    const kurz = String(tag).toLowerCase().split('-')[0];
    if (SPRACHEN[kurz]) return kurz;
  }
  return RUECKFALL;
}

export function sprache() { return AKTUELL; }

// Neu laden statt nachzeichnen: die Oberflaeche entsteht beim Start aus dem
// Katalog, ein zweiter Durchlauf waere derselbe Weg noch einmal.
export function waehleSprache(kuerzel) {
  if (!SPRACHEN[kuerzel] || kuerzel === AKTUELL) return AKTUELL;
  merkeWahl(kuerzel);
  location.reload();
  return kuerzel;
}

// ── Laden ──────────────────────────────────────────────────────────
async function hole(kuerzel) {
  try {
    const antwort = await fetch(`./assets/lang/${kuerzel}.json`);
    return antwort.ok ? await antwort.json() : null;
  } catch { return null; }
}

export async function ladeSprache(kuerzel = erkenneSprache()) {
  const gewaehlt = SPRACHEN[kuerzel] ? kuerzel : RUECKFALL;

  TEXTE_RUECKFALL = (await hole(RUECKFALL)) ?? {};
  TEXTE = gewaehlt === RUECKFALL
    ? TEXTE_RUECKFALL
    : ((await hole(gewaehlt)) ?? TEXTE_RUECKFALL);

  AKTUELL = TEXTE === TEXTE_RUECKFALL ? RUECKFALL : gewaehlt;

  const wurzel = document.documentElement;
  wurzel.lang = AKTUELL;
  wurzel.dir = SPRACHEN[AKTUELL]?.richtung ?? 'ltr';
  return AKTUELL;
}

// ── Nachschlagen ───────────────────────────────────────────────────
export function t(schluessel, werte) {
  const roh = TEXTE[schluessel] ?? TEXTE_RUECKFALL[schluessel] ?? schluessel;
  if (!werte) return roh;
  return roh.replace(/\{(\w+)\}/g, (ganz, name) =>
    Object.hasOwn(werte, name) ? String(werte[name]) : ganz);
}

// ── Auszeichnung im Dokument ───────────────────────────────────────
const ATTRIBUTE = {
  platzhalter: 'placeholder',
  titel:       'title',
  aria:        'aria-label',
  inhalt:      'content',
};

/*
 Nur die Textknoten tauschen, nicht das ganze Element.

 Knoepfe tragen neben ihrem Text ein Zeichen oder einen Zaehler in einem
 eigenen <span>; `textContent` wuerde beides wegwerfen. Der Abstand um den
 Text herum bleibt ebenfalls stehen, sonst klebt "▶" am Wort.
*/
function setzeText(el, text) {
  const knoten = [...el.childNodes].filter(
    k => k.nodeType === Node.TEXT_NODE && k.nodeValue.trim());
  if (!knoten.length) { el.textContent = text; return; }
  const roh = knoten[0].nodeValue;
  knoten[0].nodeValue = /^\s*/.exec(roh)[0] + text + /\s*$/.exec(roh)[0];
  for (let i = 1; i < knoten.length; i++) knoten[i].nodeValue = '';
}

export function uebersetzeDokument(wurzel = document) {
  for (const el of wurzel.querySelectorAll('[data-text]')) {
    setzeText(el, t(el.dataset.text));
  }
  // Nur fuer Saetze mit <em>/<strong> mittendrin. Die Auszeichnung steht in
  // der Sprachdatei, weil sie zum Satzbau gehoert und je Sprache anders faellt.
  for (const el of wurzel.querySelectorAll('[data-html]')) {
    el.innerHTML = t(el.dataset.html);
  }
  for (const [name, attribut] of Object.entries(ATTRIBUTE)) {
    for (const el of wurzel.querySelectorAll(`[data-${name}]`)) {
      el.setAttribute(attribut, t(el.dataset[name]));
    }
  }
}
