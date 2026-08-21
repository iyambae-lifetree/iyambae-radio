/*
  Passwoerter — Regeln nach NIST SP 800-63B-4, Argon2id hinter einer
  Schranke, Leak-Abgleich ueber k-Anonymitaet.

  ── Warum eine Schranke vor Argon2 steht ────────────────────────────

  Argon2id ist mit Absicht teuer, und die Kosten sind SPEICHER. Die
  OWASP-Empfehlung lautet 19 MiB je Pruefung. Der Container hat 0,5 GiB, und
  die teilt er sich mit nginx und dem Radio. Rechnerisch waeren rund 26
  gleichzeitige Pruefungen die Grenze — und die Grenze ist keine, die man
  weich erreicht: Der Kernel raeumt bei Speichermangel den ganzen Container
  ab, nicht den einen Aufruf. Wer dann Musik hoert, verliert sie mitten im
  Stueck, weil jemand anders sich anzumelden versucht hat.

  Deshalb: ein Zaehler, der hoechstens N Pruefungen gleichzeitig durchlaesst,
  eine Warteschlange dahinter, und wenn die voll ist, eine ehrliche 503 mit
  Retry-After. Eine Absage, die nach einer Sekunde kommt, ist besser als ein
  Container, der stirbt.

  DIE ZWEITE GRENZE, die man leicht uebersieht: @node-rs/argon2 rechnet im
  Thread-Pool von libuv, und der hat ab Werk VIER Plaetze. N groesser als
  UV_THREADPOOL_SIZE zu setzen bringt nichts als eine zweite, unsichtbare
  Warteschlange — dann warten die Aufrufe dort statt hier, und die Schranke
  weiss nichts davon und kann keine 503 geben. N und UV_THREADPOOL_SIZE
  gehoeren zusammen; das Dockerfile setzt beides.

  Und die dritte: 0,25 vCPU. Eine Pruefung, die auf einem freien Kern 13 ms
  braucht, braucht bei einem Viertel Kern rund 52 ms. Der Durchsatz ist
  dadurch gedeckelt, nicht durch N. N schuetzt den Speicher, die
  Warteschlange schuetzt die Wartezeit.

  ── Warum keine Komplexitaetsregeln ─────────────────────────────────

  NIST SP 800-63B-4 verlangt ausdruecklich das Gegenteil von dem, was die
  meisten Formulare tun: Laenge statt Zeichenklassen, kein erzwungener
  Wechsel, kein Kuerzen, Unicode erlaubt. Der Grund ist gemessen und nicht
  Geschmack — Zeichenklassenregeln erzeugen `Passwort1!`, und das steht in
  jeder Liste. Was wirklich hilft, ist der Abgleich gegen die Listen selbst.
*/

import { createHash, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify, Algorithm } from '@node-rs/argon2';
import { protokolliere } from './protokoll.mjs';

/*
  OWASP „Password Storage Cheat Sheet", Argon2id: m=19 MiB, t=2, p=1.

  Ueber Umgebungsvariablen aenderbar, aber nur nach oben sinnvoll: Weniger
  Speicher macht die Pruefung billiger — auch fuer den, der Hashes gestohlen
  hat und sie durchprobiert.
*/
export const ARGON = {
    algorithm: Algorithm.Argon2id,
    memoryCost: Number(process.env.ARGON_SPEICHER_KIB ?? 19456),   // KiB
    timeCost: Number(process.env.ARGON_DURCHGAENGE ?? 2),
    parallelism: Number(process.env.ARGON_STRAENGE ?? 1),
};

export const MINDESTLAENGE = 15;
/*
  NIST verlangt, mindestens 64 Zeichen ohne Kuerzung anzunehmen. 256 ist
  grosszuegig darueber und trotzdem eine Grenze — Argon2 kostet zwar
  unabhaengig von der Laenge, aber die NFKC-Normalisierung und der Transport
  nicht, und irgendwo muss der Anfragekoerper enden.
*/
export const HOECHSTLAENGE = 256;

// ── Die Schranke ────────────────────────────────────────────────────

export class UeberlastFehler extends Error {
    constructor(sekunden) {
        super('ueberlastet');
        this.name = 'UeberlastFehler';
        this.art = 'ueberlastet';
        this.sekunden = sekunden;
    }
}

/**
 * Ein Zaehler mit Warteschlange. `nimm()` liefert eine Funktion zum
 * Zurueckgeben; wer sie nicht aufruft, blockiert den Platz fuer immer —
 * deshalb steht jeder Aufruf hier im Modul in einem try/finally.
 */
export function erzeugeSchranke({ plaetze, warteschlange, dauerJePruefungMs = 60 } = {}) {
    const hoechstensGleichzeitig = Math.max(1, plaetze ?? Number(process.env.ARGON_GLEICHZEITIG ?? 4));
    const hoechstensWartend = Math.max(0, warteschlange ?? Number(process.env.ARGON_WARTESCHLANGE ?? 64));

    let laufend = 0;
    const wartende = [];

    function weiter() {
        if (laufend >= hoechstensGleichzeitig) return;
        const naechster = wartende.shift();
        if (!naechster) return;
        laufend++;
        naechster(freigabe);
    }

    function freigabe() {
        laufend--;
        weiter();
    }

    return {
        zustand: () => ({ laufend, wartend: wartende.length, plaetze: hoechstensGleichzeitig }),

        nimm() {
            if (laufend < hoechstensGleichzeitig) {
                laufend++;
                return Promise.resolve(freigabe);
            }
            if (wartende.length >= hoechstensWartend) {
                /*
                  Retry-After aus dem, was die Warteschlange gerade wirklich
                  braucht — nicht eine feste Zahl. Sonst kommen alle
                  Abgewiesenen zur selben Sekunde zurueck und die Welle
                  wiederholt sich.
                */
                const sekunden = Math.max(1, Math.ceil(
                    (wartende.length * dauerJePruefungMs) / hoechstensGleichzeitig / 1000));
                protokolliere({
                    art: 'passwort.ueberlastet', ergebnis: 'ueberlastet',
                    laufend, wartend: wartende.length,
                });
                return Promise.reject(new UeberlastFehler(sekunden));
            }
            return new Promise((fertig) => wartende.push(fertig));
        },

        /** Nimmt einen Platz und gibt ihn nach `tun` sicher wieder zurueck. */
        async mit(tun) {
            const zurueck = await this.nimm();
            try {
                return await tun();
            } finally {
                zurueck();
            }
        },
    };
}

// ── Regeln ──────────────────────────────────────────────────────────

/*
  NFKC vor allem anderen.

  Ein Passwort mit Umlaut kann als ein Zeichen (U+00E4) oder als zwei
  (a + U+0308) im Anfragekoerper stehen — welche Form ein Browser schickt,
  haengt an Betriebssystem und Tastatur. Ohne Normalisierung meldet sich
  jemand auf dem Telefon nicht mehr an, mit dem er sich am Rechner
  angemeldet hat, und niemand findet den Grund. NIST nennt genau das und
  verlangt NFKC oder NFC; NFKC faltet zusaetzlich Formvarianten (Ligaturen,
  Halbbreiten) zusammen.
*/
export function normalisiere(passwort) {
    return String(passwort ?? '').normalize('NFKC');
}

/** Zeichen zaehlen, nicht Code-Einheiten — ein Emoji ist ein Zeichen. */
export function laenge(passwort) {
    return [...passwort].length;
}

/**
 * Die Regeln, ohne Netz. Gibt eine Liste maschinenlesbarer Gruende zurueck;
 * die Webseite uebersetzt sie (sie kann sieben Sprachen, der Dienst keine).
 *
 * Jeder Grund sagt, WAS fehlt — `zu_kurz` traegt die fehlende Zahl mit,
 * damit die Seite „noch drei Zeichen" schreiben kann und nicht nur
 * „ungueltig".
 */
export function pruefeRegeln(roh, { adresse } = {}) {
    const passwort = normalisiere(roh);
    const gruende = [];
    const n = laenge(passwort);

    if (n === 0) {
        gruende.push({ grund: 'leer' });
        return { ok: false, gruende, passwort };
    }
    if (n < MINDESTLAENGE) {
        gruende.push({ grund: 'zu_kurz', mindestens: MINDESTLAENGE, fehlt: MINDESTLAENGE - n });
    }
    if (n > HOECHSTLAENGE) {
        gruende.push({ grund: 'zu_lang', hoechstens: HOECHSTLAENGE, zuviel: n - HOECHSTLAENGE });
    }

    /*
      Keine Komplexitaetsregel, sondern das, was NIST ausdruecklich erlaubt
      und empfiehlt: sich wiederholende oder fortlaufende Zeichen abweisen.
      Fuenfzehnmal dasselbe Zeichen erfuellt die Laenge und ist trotzdem in
      einem Wimpernschlag geraten.
    */
    const zeichen = [...passwort];
    if (zeichen.length > 0 && zeichen.every((z) => z === zeichen[0])) {
        gruende.push({ grund: 'nur_wiederholung' });
    }
    if (istFortlaufend(zeichen)) {
        gruende.push({ grund: 'nur_fortlaufend' });
    }

    /*
      „Context-specific words" bei NIST. Der Teil vor dem @ ist der, den
      Menschen tatsaechlich als Passwort verwenden.
    */
    const oertlich = String(adresse ?? '').split('@')[0].toLowerCase();
    if (oertlich.length >= 4 && passwort.toLowerCase().includes(oertlich)) {
        gruende.push({ grund: 'enthaelt_adresse' });
    }

    return { ok: gruende.length === 0, gruende, passwort };
}

function istFortlaufend(zeichen) {
    if (zeichen.length < 4) return false;
    let hoch = true;
    let runter = true;
    for (let i = 1; i < zeichen.length; i++) {
        const d = zeichen[i].codePointAt(0) - zeichen[i - 1].codePointAt(0);
        if (d !== 1) hoch = false;
        if (d !== -1) runter = false;
    }
    return hoch || runter;
}

// ── Leak-Abgleich ueber k-Anonymitaet ───────────────────────────────

/*
  Have I Been Pwned, Range-API.

  DAS PASSWORT VERLAESST DEN DIENST NIE. Gesendet werden fuenf Hexziffern
  des SHA-1 — das sind rund eine Million moegliche Passwoerter hinter jedem
  Praefix. Die Antwort enthaelt die Endungen aller bekannten Treffer dieses
  Praefix; verglichen wird hier, oertlich.

  `Add-Padding: true` laesst den Dienst die Antwort mit Blindeintraegen auf
  eine einheitliche Groesse bringen. Ohne das koennte jemand, der nur die
  Groesse der verschluesselten Antwort sieht, das Praefix eingrenzen. Die
  Blindeintraege tragen den Zaehler 0 und werden hier verworfen — wer das
  vergisst, haelt jedes Passwort fuer geleakt.

  FAELLT DER ABGLEICH AUS, WIRD NICHT BLOCKIERT. Kein Netz, Zeitueberschreitung,
  HIBP hat einen schlechten Tag: Dann steht eine Zeile im Protokoll und die
  Anmeldung laeuft weiter. Ein fremder Dienst, der ausfaellt, darf niemanden
  aus seinem Konto aussperren — sonst haben wir uns eine Abhaengigkeit
  gebaut, die wir weder betreiben noch reparieren koennen.
*/
const HIBP = 'https://api.pwnedpasswords.com/range/';
const HIBP_ZEITGRENZE_MS = Number(process.env.HIBP_ZEITGRENZE_MS ?? 1500);

export async function zaehleLeaks(passwort, { holen = fetch, zeitgrenze = HIBP_ZEITGRENZE_MS } = {}) {
    if (process.env.HIBP === 'aus') return { gefunden: null, ausgefallen: false, abgeschaltet: true };

    const abdruck = createHash('sha1').update(passwort, 'utf8').digest('hex').toUpperCase();
    const praefix = abdruck.slice(0, 5);
    const endung = abdruck.slice(5);

    try {
        const antwort = await holen(HIBP + praefix, {
            headers: { 'Add-Padding': 'true', 'User-Agent': 'iyambae-konto' },
            signal: AbortSignal.timeout(zeitgrenze),
        });
        if (!antwort.ok) throw new Error('status ' + antwort.status);
        const text = await antwort.text();
        for (const zeile of text.split('\n')) {
            const trenner = zeile.indexOf(':');
            if (trenner < 0) continue;
            if (zeile.slice(0, trenner).trim().toUpperCase() !== endung) continue;
            const anzahl = Number.parseInt(zeile.slice(trenner + 1).trim(), 10) || 0;
            // Zaehler 0 ist ein Blindeintrag aus dem Padding, kein Treffer.
            if (anzahl > 0) return { gefunden: anzahl, ausgefallen: false };
        }
        return { gefunden: 0, ausgefallen: false };
    } catch (fehler) {
        protokolliere({
            art: 'passwort.leakabgleich', ergebnis: 'fehler', dienst: 'hibp',
            grund: fehler?.name === 'TimeoutError' ? 'zeitgrenze' : 'nicht_erreichbar',
        });
        return { gefunden: null, ausgefallen: true };
    }
}

/**
 * Regeln plus Leak-Abgleich. Das ist die Pruefung, die vor jedem Setzen
 * eines Passworts laeuft — beim Anmelden wird NICHT geprueft, dort wird nur
 * verglichen.
 */
export async function pruefeNeuesPasswort(roh, { adresse, holen } = {}) {
    const ergebnis = pruefeRegeln(roh, { adresse });
    if (!ergebnis.ok) return ergebnis;

    const leak = await zaehleLeaks(ergebnis.passwort, holen ? { holen } : undefined);
    if (leak.gefunden) {
        return {
            ok: false,
            passwort: ergebnis.passwort,
            gruende: [{ grund: 'bekannt_geleakt', funde: leak.gefunden }],
        };
    }
    return { ok: true, gruende: [], passwort: ergebnis.passwort, leakAbgleichAusgefallen: leak.ausgefallen };
}

// ── Hashen und Vergleichen ──────────────────────────────────────────

let schranke = erzeugeSchranke();
let blindHash = null;

/** Nur fuer Tests: eine eigene Schranke einsetzen. */
export function setzeSchranke(neu) {
    schranke = neu;
    return schranke;
}
export function holeSchranke() {
    return schranke;
}

/**
 * Den Blind-Hash im Voraus rechnen.
 *
 * Er wird gebraucht, wenn es zu einer Adresse gar kein Konto gibt: Dann
 * muss trotzdem eine echte Argon2-Pruefung laufen, sonst antwortet der
 * Dienst fuer unbekannte Adressen messbar schneller und ist damit ein
 * Adresspruefer. Er wird beim START gerechnet und nicht beim ersten Bedarf
 * — sonst zahlte ausgerechnet die erste unbekannte Adresse die 13 ms extra
 * und waere daran zu erkennen.
 */
export async function bereiteVor() {
    if (!blindHash) {
        blindHash = await argonHash('blind-' + Date.now() + '-nie-ein-echtes-passwort', ARGON);
    }
    return blindHash;
}

export async function hashe(passwort) {
    return schranke.mit(() => argonHash(normalisiere(passwort), ARGON));
}

/**
 * Vergleicht. Gibt es keinen Hash (unbekannte Adresse, Konto ohne Passwort),
 * wird gegen den Blind-Hash geprueft — gleiche Arbeit, gleicher Platz in der
 * Schranke, gleiche Dauer, und das Ergebnis ist immer `false`.
 */
export async function pruefe(passwort, hash) {
    const gegen = hash || await bereiteVor();
    const echt = Boolean(hash);
    return schranke.mit(async () => {
        let stimmt = false;
        try {
            stimmt = await argonVerify(gegen, normalisiere(passwort), ARGON);
        } catch {
            // Ein kaputter Hash in der Tabelle ist kein Grund, 500 zu
            // antworten — es ist ein gescheiterter Anmeldeversuch.
            stimmt = false;
        }
        return echt && stimmt;
    });
}

/**
 * Zeitkonstanter Vergleich zweier Geheimnisse gleicher Bedeutung.
 *
 * `timingSafeEqual` verlangt gleiche Laenge und wirft sonst. Deshalb wird
 * beides erst durch SHA-256 geschickt: Das ergibt immer 32 Byte, und die
 * Laenge des Geheimnisses verraet sich nicht ueber die Ausnahme.
 */
export function gleichOhneZeitverrat(links, rechts) {
    const a = createHash('sha256').update(String(links ?? ''), 'utf8').digest();
    const b = createHash('sha256').update(String(rechts ?? ''), 'utf8').digest();
    return timingSafeEqual(a, b);
}
