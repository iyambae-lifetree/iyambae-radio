/*
 Fehlerberichte — nur mit Einwilligung, und erst dann gefragt, wenn wirklich
 ein Fehler aufgetreten ist.

 Die Frage beim ersten Besuch zu stellen wäre falsch: Sie beträfe etwas, das
 vielleicht nie passiert, und stünde zwischen Besucher und Musik. Deshalb
 dasselbe Muster wie bei der MyRetuner-Brücke — einmal fragen, im richtigen
 Moment, Antwort merken, jederzeit widerrufbar.

 **Wohin die Berichte gehen:** an `/fehler` auf derselben Adresse. Von dort
 ins Protokoll des Containers, und damit nach Log Analytics in derselben
 Ressourcengruppe. Es gibt keinen Dritten, keine Übermittlung, keinen
 Auftragsverarbeitungsvertrag.

 **Was NICHT mitgeht:** Suchbegriffe, Merkliste, Hörverhalten, Kennungen. Der
 Pfad wird ohne Abfrageteil gesendet — dort könnte ein Suchbegriff stehen.
*/

import { t } from './sprache.mjs';


const SCHLUESSEL = 'hz_fehlerbericht';
const ZIEL = './fehler';

export const EINWILLIGUNG = {
    unbekannt: 'unbekannt',
    erlaubt:   'erlaubt',
    abgelehnt: 'abgelehnt',
};

let zustand = EINWILLIGUNG.unbekannt;
let warteschlange = [];
let gesendet = 0;
let fassung = 'unbekannt';
const HOECHSTENS = 5;      // je Sitzung — ein Fehler in einer Schleife soll nicht fluten
const gesehene = new Set();

function lies() {
    try { return localStorage.getItem(SCHLUESSEL) ?? EINWILLIGUNG.unbekannt; }
    catch { return EINWILLIGUNG.unbekannt; }   // privates Fenster: erwartbar
}
function schreib(wert) {
    try { localStorage.setItem(SCHLUESSEL, wert); } catch { /* siehe oben */ }
}

/** Alles entfernen, was auf eine Person zeigen könnte. */
function saeubere(bericht) {
    return {
        text:    String(bericht.text ?? '').slice(0, 300),
        stapel:  String(bericht.stapel ?? '').split('\n').slice(0, 6).join('\n').slice(0, 900),
        quelle:  String(bericht.quelle ?? '').slice(0, 200),
        zeile:   Number(bericht.zeile) || null,
        spalte:  Number(bericht.spalte) || null,
        // Ohne Abfrageteil: dort steht der Suchbegriff des Besuchers.
        pfad:    location.pathname,
        fassung,
        zeit:    new Date().toISOString(),
    };
}

async function sende(bericht) {
    if (gesendet >= HOECHSTENS) return;
    gesendet++;
    try {
        await fetch(ZIEL, {
            method: 'POST',
            // Kein Content-Type: Der loeste einen Vorabflug aus, und der
            // brächte hier nichts als eine zweite Anfrage.
            body: JSON.stringify(bericht),
            keepalive: true,          // überlebt das Schließen des Fensters
        });
    } catch {
        /*
         Erwarteter Zustand: kein Netz, oder der Besucher blockiert die
         Anfrage. Ein Fehlerbericht, der scheitert, darf keinen neuen Fehler
         auslösen — sonst dreht sich das im Kreis.
        */
    }
}

function frage(melde) {
    if (!melde) return;
    melde.frage(
        t('fehler.frage'),
        [
            { text: t('fehler.senden'), haupt: true, tun: () => {
                zustand = EINWILLIGUNG.erlaubt;
                schreib(zustand);
                warteschlange.splice(0).forEach(sende);
            }},
            { text: t('fehler.nein'), tun: () => {
                zustand = EINWILLIGUNG.abgelehnt;
                schreib(zustand);
                warteschlange = [];
            }},
        ]);
}

function nimmAuf(roh, melde) {
    // Denselben Fehler nicht mehrfach: Ein Fehler im Zeichnen feuert sonst je
    // Bild einmal.
    const kennung = `${roh.text}|${roh.quelle}|${roh.zeile}`;
    if (gesehene.has(kennung)) return;
    gesehene.add(kennung);

    const bericht = saeubere(roh);
    if (zustand === EINWILLIGUNG.erlaubt) { sende(bericht); return; }
    if (zustand === EINWILLIGUNG.abgelehnt) return;

    // Unbekannt: aufheben und genau einmal fragen.
    if (warteschlange.length === 0) { warteschlange.push(bericht); frage(melde); }
    else if (warteschlange.length < HOECHSTENS) warteschlange.push(bericht);
}

/**
 * @param {object} optionen
 * @param {string} [optionen.fassung]  Fassungskennung, für die Zuordnung
 * @param {{frage: Function}} [optionen.melde]  zeigt die Rückfrage an
 */
export function beobachteFehler({ fassung: f, melde } = {}) {
    if (f) fassung = f;
    zustand = lies();

    window.addEventListener('error', (e) => nimmAuf({
        text: e.message, stapel: e.error?.stack,
        quelle: e.filename, zeile: e.lineno, spalte: e.colno,
    }, melde));

    window.addEventListener('unhandledrejection', (e) => nimmAuf({
        text: 'Unbehandelte Ablehnung: ' + (e.reason?.message ?? e.reason),
        stapel: e.reason?.stack,
    }, melde));
}

/** Für Stellen, die einen Fehler selbst abfangen und trotzdem melden wollen. */
export function meldeFehler(fehler, zusatz = '', melde) {
    nimmAuf({
        text: (zusatz ? zusatz + ': ' : '') + (fehler?.message ?? String(fehler)),
        stapel: fehler?.stack,
    }, melde);
}

/** Für eine Einstellung: Was gilt gerade, und wie nimmt man es zurück? */
export function einwilligungsstand() { return zustand; }
export function widerrufeEinwilligung() {
    zustand = EINWILLIGUNG.abgelehnt;
    schreib(zustand);
}
