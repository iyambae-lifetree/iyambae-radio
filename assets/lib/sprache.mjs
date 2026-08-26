// ═══════════════════════════════════════════════════════════════════
// Sprache — Oberflaechentexte nachschlagen
//
// Die sichtbaren Texte stehen in assets/lang/<kuerzel>.json, nicht im
// Programmtext. Die Sendertexte gehoeren NICHT hierher: sie sind kuratierter
// Inhalt und bleiben in data/sender.json.
//
// WOHER DIE SPRACHE KOMMT — und warum sie NICHT mehr geraten wird
//
// Bis hierher hat dieses Modul selbst entschieden: navigator.languages
// befragen, Ergebnis merken, Texte tauschen. Das hatte einen Haken, den man
// erst sieht, wenn man die Seite teilt: Es gab nur eine Adresse. Wer einem
// franzoesischen Bekannten den Laden schickte, schickte ihm Deutsch, und ein
// Crawler ohne Programmcode sah durchgaengig Deutsch.
//
// Jetzt hat jede Sprache ihre eigene Adresse: /de/, /en/, /fr/, /es/, /it/,
// /ja/, /ar/. nginx leitet von / aus anhand von Accept-Language dorthin —
// aber NUR von /, niemals von einem Sprachpfad weg. Die Adresse ist damit
// die Wahrheit, und dieses Modul liest sie nur noch ab.
//
// Der Unterschied ist wichtig: Erkennen ja, Bevormunden nein. Wer /en/
// aufruft, bekommt Englisch, auch mit deutschem Browser.
// ═══════════════════════════════════════════════════════════════════

export const SPRACHEN = {
  de: { name: 'Deutsch',  richtung: 'ltr' },
  en: { name: 'English',  richtung: 'ltr' },
  fr: { name: 'Français', richtung: 'ltr' },
  es: { name: 'Español',  richtung: 'ltr' },
  it: { name: 'Italiano', richtung: 'ltr' },
  ja: { name: '日本語',    richtung: 'ltr' },
  ar: { name: 'العربية',   richtung: 'rtl' },
};

// Deutsch ist der Bestand — fehlt ein Schluessel in einer Uebersetzung,
// steht dort lieber der deutsche Satz als der nackte Schluessel.
const RUECKFALL = 'de';
const SCHLUESSEL_WAHL = 'hz_sprache';

let AKTUELL = RUECKFALL;
let TEXTE = {};
let TEXTE_RUECKFALL = {};

// ── Wahl ───────────────────────────────────────────────────────────
function merkeWahl(kuerzel) {
  // Gemerkt wird nur fuer die Umleitung an der Wurzel: Wer /en/ besucht hat,
  // soll beim naechsten Aufruf von / wieder auf /en/ landen, auch wenn der
  // Browser etwas anderes meldet. Ein Cookie statt localStorage, weil nginx
  // es lesen koennen muss — localStorage sieht der Server nie.
  try {
    document.cookie = `${SCHLUESSEL_WAHL}=${kuerzel}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
  try { localStorage.setItem(SCHLUESSEL_WAHL, kuerzel); } catch {}
  return kuerzel;
}

/*
 Die Adresse entscheidet, in dieser Reihenfolge:

   1. data-sprache am <html> — setzt Scripts/baue-sprachen.py beim Erzeugen
   2. der erste Pfadabschnitt — falls die Seite von Hand ausgeliefert wird
   3. ?sprache=xx — der alte Weg, bleibt fuer Lesezeichen gueltig
   4. der Browser — nur noch, wenn die Seite ohne Sprachpfad laeuft
      (oertliche Entwicklung, python3 -m http.server)
*/
export function erkenneSprache() {
  const amDokument = document.documentElement.dataset.sprache;
  if (amDokument && SPRACHEN[amDokument]) return amDokument;

  const ausPfad = location.pathname.split('/').filter(Boolean)[0];
  if (ausPfad && SPRACHEN[ausPfad]) return ausPfad;

  const ausAdresse = new URLSearchParams(location.search).get('sprache');
  if (ausAdresse && SPRACHEN[ausAdresse]) return ausAdresse;

  return ausBrowser();
}

/** Was der Browser anbietet, auf unsere sieben Sprachen abgebildet. */
export function ausBrowser() {
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

/**
 * Adresse einer anderen Sprachfassung DIESER Seite.
 * Suchteil und Sprungmarke bleiben stehen — wer mitten in einer gefilterten
 * Ansicht umschaltet, soll sie behalten.
 */
export function adresseFuer(kuerzel) {
  const teile = location.pathname.split('/').filter(Boolean);
  if (teile.length && SPRACHEN[teile[0]]) teile[0] = kuerzel;
  else teile.unshift(kuerzel);
  return `/${teile.join('/')}${teile.length === 1 ? '/' : ''}${location.search}${location.hash}`;
}

/*
 Umschalten heisst jetzt: die Adresse wechseln.

 Vorher wurde die Wahl gemerkt und neu geladen — dieselbe Adresse, anderer
 Inhalt. Das ist genau das, was sich nicht teilen laesst.
*/
export function waehleSprache(kuerzel) {
  if (!SPRACHEN[kuerzel] || kuerzel === AKTUELL) return AKTUELL;
  merkeWahl(kuerzel);
  location.assign(adresseFuer(kuerzel));
  return kuerzel;
}

// ── Laden ──────────────────────────────────────────────────────────
async function hole(kuerzel) {
  try {
    // Absolut, nicht dokumentrelativ: Unter /fr/index.html suchte ein
    // "./assets/…" nach /fr/assets/… und faende nichts.
    const antwort = await fetch(`/assets/lang/${kuerzel}.json`);
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
  wurzel.dataset.sprache = AKTUELL;
  // Merken, damit die Umleitung an der Wurzel die Wahl kennt. Auch beim
  // blossen Besuch: Wer /ja/ aufruft, hat sich fuer Japanisch entschieden.
  merkeWahl(AKTUELL);
  return AKTUELL;
}

/*
 Zahlen, die IMMER eingesetzt werden — die Groesse des Ladens.

 Gefunden am 23.08.2026 auf der laufenden Seite: Unter der Ueberschrift
 stand woertlich

     „{senderzahl} Sender aus {laenderzahl} Ländern, in {regalzahl} Regalen"

 Der Erzeuger setzt die Zahlen beim Bauen ins HTML — das stimmte auch, im
 ausgelieferten Quelltext stand „165 Sender aus 37 Ländern". Nur schrieb
 `uebersetzeDokument` beim Start denselben Satz noch einmal aus der
 Sprachdatei darueber, und DORT stehen die Platzhalter.

 Zwei Wahrheiten fuer denselben Satz, und die spaetere gewann.

 Es gibt keinen dritten Ort dafuer: Der Erzeuger kennt den Katalog, die
 Seite kennt ihn auch. Also traegt die Seite ihre Zahlen hier ein, und
 `t()` setzt sie ueberall ein, ohne dass jede Aufrufstelle daran denken
 muss. Eine Aufrufstelle, die daran denken muss, wird eines Tages
 vergessen — genau das ist hier passiert.
*/
let ZAHLEN = {};

export function setzeZahlen(werte) {
  ZAHLEN = { ...ZAHLEN, ...werte };
}

// ── Nachschlagen ───────────────────────────────────────────────────
export function t(schluessel, werte) {
  const roh = TEXTE[schluessel] ?? TEXTE_RUECKFALL[schluessel] ?? schluessel;
  const alle = werte ? { ...ZAHLEN, ...werte } : ZAHLEN;
  return roh.replace(/\{(\w+)\}/g, (ganz, name) =>
    Object.hasOwn(alle, name) ? String(alle[name]) : ganz);
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
 eigenen <span>; `textContent` wuerde beides wegwerfen.

 Dieselbe Regel steht in Scripts/baue-sprachen.py als setze_text(). Beide
 MUESSEN denselben Knoten treffen: Die erzeugte Seite ist der erste Anblick,
 dieses Modul zeichnet danach dasselbe noch einmal. Faenden sie verschiedene
 Knoten, spraenge der Text beim Laden sichtbar um.
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

/*
 Der Sprachumschalter.

 Echte Verweise, keine Auswahlliste: Sie sind fuer eine Suchmaschine die
 Bruecke zwischen den sieben Fassungen, sie funktionieren mit der mittleren
 Maustaste, und sie stehen auch dann da, wenn Programmcode ausfaellt.
 Angezeigt wird jede Sprache in sich selbst — wer kein Deutsch kann, findet
 "Deutsch" nicht unter "German".
*/
export function baueSprachumschalter(kasten) {
  if (!kasten) return;
  const jetzt = sprache();
  kasten.innerHTML = `
    <summary class="sprachwahl__knopf" aria-label="${t('kopf.sprache.titel')}"
             title="${t('kopf.sprache.titel')}">${jetzt.toUpperCase()}</summary>
    <ul class="sprachwahl__liste">
      ${Object.entries(SPRACHEN).map(([k, s]) => `
        <li><a href="${adresseFuer(k)}" hreflang="${k}" lang="${k}"
               ${k === jetzt ? 'aria-current="true"' : ''}>${s.name}</a></li>`).join('')}
    </ul>`;
  kasten.addEventListener('click', (e) => {
    const verweis = e.target.closest('a[hreflang]');
    if (verweis) merkeWahl(verweis.hreflang);
  });
}
