// ═══════════════════════════════════════════════════════════════════
// Konto — Anmelden und die Merkliste über Geräte hinweg
//
// DIE REGEL, die alles andere bestimmt: Das Radio bleibt ohne Konto
// vollständig nutzbar. Abspielen, alle neun Regale, Suche, Nadel fallen
// lassen, 432 Hz, Sprachwechsel, offline — nichts davon fragt jemals nach
// einer Anmeldung. Am Konto hängen Merken, eigene Listen und Empfehlungen.
// Sonst nichts.
//
// Gefragt wird an genau EINER Stelle: wenn jemand auf ein Herz tippt. Das
// ist der Moment, in dem die Anmeldung etwas einbringt, und es ist derselbe
// Griff, den fehlerbericht.mjs und myretuner.mjs schon anwenden — einmal
// fragen, im richtigen Augenblick, und die Antwort merken. Die Frage beim
// ersten Besuch zu stellen wäre falsch: Sie beträfe etwas, das vielleicht
// nie passiert.
//
// SOLANGE DER DIENST NICHT ANTWORTET, ändert sich gar nichts. Dieses Modul
// prüft einmal, ob es unter /api/ jemanden gibt. Findet es niemanden,
// verhält sich die Seite genau wie bisher: Die Merkliste liegt örtlich, und
// es wird nie nach einem Konto gefragt. Damit kann die Oberfläche vor dem
// Dienst ausgeliefert werden, ohne dass jemandem etwas kaputtgeht.
// ═══════════════════════════════════════════════════════════════════

import { t, sprache } from './sprache.mjs';

const WEG = '/api';

/*
 Zustände, in denen dieses Modul sein kann.

 `unbekannt` ist nicht dasselbe wie `abgemeldet`: Solange nicht geklärt ist,
 ob es einen Dienst gibt, darf die Oberfläche weder eine Anmeldung anbieten
 noch das Merken verweigern. Der Unterschied ist der Grund, warum es drei
 Zustände sind und nicht zwei.
*/
export const ZUSTAND = {
  unbekannt:  'unbekannt',
  keinDienst: 'kein-dienst',
  abgemeldet: 'abgemeldet',
  angemeldet: 'angemeldet',
};

let zustand = ZUSTAND.unbekannt;
let konto = null;
const horcher = new Set();

// ── Die eine Frage, und dass sie nur einmal kommt ───────────────────
/*
 Der Kopf dieses Moduls verspricht „einmal fragen, im richtigen Augenblick,
 und die Antwort merken". Das Merken steht hier, aus demselben Grund, aus dem
 fehlerbericht.mjs seinen Schluessel selbst haelt: Wer die Speicherung sucht,
 soll sie neben der Begruendung finden.

 GESPEICHERT WIRD NUR DIE ABLEHNUNG — genau wie `hz_messung` in messung.mjs.
 Wer sich anmeldet, hinterlaesst ohnehin ein Sitzungsplaetzchen; ein zweiter
 Eintrag „hat ja gesagt" waere eine Spur ohne Zweck.

 § 25 Abs. 2 Nr. 2 TDDDG: Das Speichern ist unbedingt erforderlich fuer den
 ausdruecklich gewuenschten Dienst. Der Dienst ist hier das Versprechen, NICHT
 noch einmal zu fragen — und ein Nein, das beim naechsten Herz vergessen
 waere, ist keines. Dieselbe Abwaegung wie bei `hz_messung` und
 `hz_fehlerbericht`, und sie traegt hier sogar leichter: Der Eintrag ist ein
 einziges Wort und entsteht nur, wenn jemand ihn ausgeloest hat.
*/
const SCHLUESSEL_FRAGE = 'hz_konto_frage';

/** Hat der Besucher die Anmeldefrage schon einmal weggeschickt? */
export function schonGefragt() {
  try { return localStorage.getItem(SCHLUESSEL_FRAGE) === 'nein'; }
  catch { return false; }   // privates Fenster: dann eben noch einmal fragen
}

/** „Nicht jetzt." Wird gemerkt; der Weg ueber den Fuss bleibt offen. */
export function merkeAblehnung() {
  try { localStorage.setItem(SCHLUESSEL_FRAGE, 'nein'); } catch {}
}

/*
 Wieder wegraeumen. Nach einer geglueckten Anmeldung gibt es nichts mehr zu
 merken — die Sitzung sagt schon alles, und ein liegengebliebenes „nein"
 waere ein Eintrag ohne Zweck. Aufgeraeumt statt aufgehoben.
*/
export function vergissAblehnung() {
  try { localStorage.removeItem(SCHLUESSEL_FRAGE); } catch {}
}

export function kontozustand() { return zustand; }
export function angemeldet() { return zustand === ZUSTAND.angemeldet; }
export function kontoDaten() { return konto; }

/** Braucht das Merken hier ein Konto? Ohne Dienst: nein. */
export function kontoNoetig() { return zustand === ZUSTAND.abgemeldet; }

export function beiAenderung(fn) { horcher.add(fn); return () => horcher.delete(fn); }
function melde() { for (const fn of horcher) { try { fn(zustand, konto); } catch {} } }

// ── Reden mit dem Dienst ───────────────────────────────────────────
/*
 Ein Fehlschlag ist hier kein Ausnahmefall, sondern der Normalfall, solange
 es den Dienst nicht gibt. Deshalb wirft dieser Aufruf nicht, sondern gibt
 zurueck, was passiert ist — der Aufrufer entscheidet, ob das schlimm ist.
*/
async function ruf(pfad, optionen = {}) {
  try {
    const antwort = await fetch(WEG + pfad, {
      credentials: 'same-origin',
      headers: optionen.rumpf ? { 'Content-Type': 'application/json' } : undefined,
      method: optionen.rumpf ? 'POST' : (optionen.methode ?? 'GET'),
      body: optionen.rumpf ? JSON.stringify(optionen.rumpf) : undefined,
      signal: AbortSignal.timeout(optionen.frist ?? 12000),
    });
    /*
     Eine HTML-Antwort auf eine JSON-Anfrage heisst: Es gibt den Endpunkt
     nicht, und nginx hat die Seite ausgeliefert. Das als JSON zu lesen
     wuerde einen Syntaxfehler werfen, der wie ein Programmfehler aussaehe.
    */
    const art = antwort.headers.get('content-type') ?? '';
    if (!art.includes('application/json')) {
      return { ok: false, kein_dienst: !antwort.ok, status: antwort.status };
    }
    const daten = antwort.status === 204 ? {} : await antwort.json();
    return { ok: antwort.ok, status: antwort.status, daten };
  } catch (fehler) {
    // Zeitueberschreitung, kein Netz, abgebrochen — alles dasselbe fuer den
    // Aufrufer: Es kam nichts an.
    return { ok: false, kein_dienst: true, grund: fehler.name };
  }
}

/**
 * Einmal klaeren, woran wir sind. Wird beim Start gerufen.
 * Faellt still auf `keinDienst` zurueck — das ist heute der erwartete Fall.
 */
export async function klaereZustand() {
  const a = await ruf('/konto', { frist: 6000 });
  /*
   `!a.ok`, nicht `!a.ok && a.kein_dienst` — der Unterschied ist gemessen und
   nicht theoretisch.

   deploy/nginx.conf faengt 502/503/504 vom Anmeldedienst ab und antwortet
   selbst: `503 {"fehler":"dienst_schlaeft"}` mit `Content-Type:
   application/json`. Das ist gut gemacht — aber es ist JSON, und deshalb ging
   es hier nicht in den `kein_dienst`-Zweig, sondern durch bis zum letzten:
   Ein schlafender Dienst hiess `abgemeldet`. Dann boete die Seite eine
   Anmeldung an, die nicht funktionieren kann, und fragte am Herzen danach.

   Gegen einen Container, der gerade kalt startet, ist das kein Randfall: Der
   Kaltstart ist gemessen und dauert Sekunden.

   Also die enge Regel: NUR eine 200er-Antwort, die ausdruecklich
   `angemeldet: false` sagt, heisst `abgemeldet`. Alles andere heisst, dass
   niemand geantwortet hat — und dann aendert sich gar nichts.
  */
  if (!a.ok) zustand = ZUSTAND.keinDienst;
  else if (a.daten?.angemeldet) { zustand = ZUSTAND.angemeldet; konto = a.daten; }
  else { zustand = ZUSTAND.abgemeldet; konto = null; }
  melde();
  return zustand;
}

// ── Anmelden ───────────────────────────────────────────────────────
/*
 Schickt einen Einmalcode. Antwortet IMMER erfolgreich — siehe Dienst.

 Die Sprache faehrt mit, und das ist keine Beigabe: Der Dienst liest
 `koerper.sprache` und schreibt die Mail danach (server.mjs, 'POST
 /api/anmelden' → versender.reiheEin). Ohne dieses Feld bekaeme ein Besucher
 auf /ja/ seinen Anmeldecode auf Deutsch. Der Aufruf stand hier ohne sie, und
 der Fehler waere erst im Postfach eines Fremden aufgefallen.
*/
export async function fordereCode(mail) {
  const a = await ruf('/anmelden', { rumpf: { mail, sprache: sprache() } });
  return a.ok || a.status === 204;
}

export async function loeseCodeEin(mail, code) {
  const a = await ruf('/anmelden/code', { rumpf: { mail, code } });
  if (a.ok) { zustand = ZUSTAND.angemeldet; konto = a.daten; melde(); }
  return a;
}

export async function meldeMitPasswortAn(mail, passwort) {
  const a = await ruf('/anmelden/passwort', { rumpf: { mail, passwort } });
  if (a.ok) { zustand = ZUSTAND.angemeldet; konto = a.daten; melde(); }
  return a;
}

export async function abmelden() {
  await ruf('/abmelden', { methode: 'POST', rumpf: {} });
  zustand = ZUSTAND.abgemeldet;
  konto = null;
  melde();
}

/**
 * Adresse fuer die Anmeldung bei Google oder Apple.
 * Die Sprache faehrt mit, damit die Rueckkehr auf /fr/ statt auf / fuehrt.
 */
export function fremdAdresse(anbieter) {
  return `${WEG}/${anbieter}/start?sprache=${encodeURIComponent(sprache())}`;
}

// ── Abgleich der Merkliste ─────────────────────────────────────────
/*
 Die Liste ist eine MENGE MIT ZEITSTEMPELN, kein Feld:

   { "<senderId>": { a: <zugefuegt>, e: <entfernt|null> } }

 Zusammengefuehrt wird je Sender ueber beide Seiten:
   a = max(a_hier, a_dort), e = max(e_hier, e_dort)
   drin, wenn e null ist oder a >= e

 Warum so umstaendlich statt "der letzte Schreiber gewinnt": Wer auf einem
 Geraet zwanzig Sender merkt und auf einem anderen fuenfzehn andere, will
 fuenfunddreissig haben — nicht die zwanzig, die zuletzt hochgeladen wurden.
 Und ohne den Grabstein `e` kaeme ein geloeschter Sender beim naechsten
 Abgleich vom anderen Geraet zurueck.

 Der Zeitstempel ist der des GERAETS. Geht eine Uhr falsch, geht die
 Zusammenfuehrung falsch aus — der Dienst zieht deshalb Zukunftswerte auf
 seine eigene Zeit herunter.
*/
export function alsMenge(ids, jetzt = Date.now()) {
  const m = {};
  for (const id of ids) m[id] = { a: jetzt, e: null };
  return m;
}

export function ausMenge(menge) {
  return Object.entries(menge ?? {})
    .filter(([, w]) => w.e == null || w.a >= w.e)
    .map(([id]) => id);
}

export function verschmilz(hier, dort) {
  const raus = {};
  for (const id of new Set([...Object.keys(hier ?? {}), ...Object.keys(dort ?? {})])) {
    const x = hier?.[id] ?? { a: 0, e: null };
    const y = dort?.[id] ?? { a: 0, e: null };
    raus[id] = {
      a: Math.max(x.a ?? 0, y.a ?? 0),
      e: (x.e == null && y.e == null) ? null : Math.max(x.e ?? 0, y.e ?? 0),
    };
  }
  return raus;
}

/**
 * Gleicht die Merkliste ab. Gibt die zusammengefuehrte Liste zurueck oder
 * null, wenn nichts zu tun war.
 */
export async function gleicheAb(menge, stand = 0) {
  if (!angemeldet()) return null;
  const a = await ruf('/platten/abgleich', { rumpf: { stand, eintraege: menge } });
  if (!a.ok) return null;
  return a.daten;
}
