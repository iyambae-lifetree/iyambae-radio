/*
  ── MIKESCHS SCHNURRPOST: ANMELDEN, BESTAETIGEN, ABMELDEN ────────────

  Ein Rundbrief mit doppelter Bestaetigung. Wer seine Adresse eintraegt,
  bekommt EINE Mail mit einem Link; erst der Klick macht ihn zum Leser.
  Ohne Klick passiert nichts weiter, und nach sieben Tagen ist die Adresse
  wieder weg.

  ── WAS HIER STEHT UND WAS NICHT ─────────────────────────────────────

  Hier steht die Liste und ihr Nachweis. Hier steht NICHT der Versand der
  eigentlichen Rundbriefe — welcher Dienst das tut, ist Saemi-Ras
  Entscheidung (docs/mikesch-assistent.md). Bis dahin laesst sich die
  Liste der bestaetigten Leser mit `bestaetigteLeser` auslesen.

  ── DER NACHWEIS ────────────────────────────────────────────────────

  Wer einen Rundbrief verschickt, muss zeigen koennen, dass der Empfaenger
  eingewilligt hat. Gespeichert wird deshalb genau das, was diesen
  Nachweis traegt: wann angefragt, wann bestaetigt, in welcher Sprache und
  unter welcher Fassung des Einwilligungstextes. KEINE IP-Adresse — der
  Klick auf einen Link, der nur in diesem Postfach ankam, belegt mehr als
  eine Adresse, die jeder Anschluss mit hundert Nachbarn teilt.

  ── WARUM DIE MARKE IN ZWEI TEILEN KOMMT ─────────────────────────────

  Die Marke im Link ist `<abdruck>.<zufall>`. Der Abdruck findet die Zeile
  ohne Suche quer durch die Tabelle; der Zufall beweist, dass man die Mail
  gelesen hat. Gespeichert wird vom Zufall nur sein SHA-256 — wer die
  Tabelle liest, kann damit niemanden bestaetigen.

  Die Abmeldemarke dagegen liegt im Klartext. Sie muss in jeden kuenftigen
  Rundbrief, also muss der Versand sie kennen; und das Schlimmste, was man
  mit ihr tun kann, ist, jemanden abzumelden.

  Beide Links tragen die Marke im FRAGMENT (`#…`), nicht in der Adresse.
  Das Fragment verlaesst den Browser nie, es steht in keinem
  nginx-Protokoll — dieselbe Regel wie bei `/passwort-neu` (432hz-radio#42).
*/

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
    TABELLE_RUNDBRIEF, normalisiereAdresse, adresseSiehtEchtAus, holeOderNichts,
} from './speicher.mjs';

/** Wie lange der Bestaetigungslink gilt. */
export const BESTAETIGEN_STUNDEN = 72;

/** Nach wie vielen Tagen eine unbestaetigte Adresse geloescht wird. */
export const OFFEN_TAGE = 7;

/** Wie lange nach einer Anfrage keine zweite Mail an dieselbe Adresse geht. */
export const RUHE_MINUTEN = 10;

/*
  Die Fassung des Einwilligungstextes, den die Seite neben dem Feld zeigt
  (`mikesch.post.einwilligung` in assets/lang/*.json). Aendert sich dort
  der Sinn, wird hier hochgezaehlt — sonst belegt der Nachweis eine
  Einwilligung in einen Text, den es nicht mehr gibt.
*/
export const EINWILLIGUNG_FASSUNG = '2026-10-23';

const SPRACHEN = new Set(['de', 'en', 'fr', 'es', 'it', 'ja', 'ar']);

const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const zufall = () => randomBytes(24).toString('base64url');

export function rundbriefAbdruck(adresse) {
    return sha('rundbrief:' + normalisiereAdresse(adresse)).slice(0, 32);
}

/** `<abdruck>.<zufall>` zerlegen; alles andere ist keine Marke. */
function zerlegeMarke(marke) {
    const m = typeof marke === 'string' && marke.match(/^([0-9a-f]{32})\.([A-Za-z0-9_-]{32})$/);
    return m ? { pk: m[1], geheim: m[2] } : null;
}

function gleich(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && timingSafeEqual(x, y);
}

// ── Anmelden ────────────────────────────────────────────────────────

/**
 * Prueft die Anmeldung gegen die Erlaubnisliste.
 * @returns {{ mail: string, sprache: string } | null}
 */
export function saeubereAnmeldung(koerper) {
    if (!koerper || typeof koerper !== 'object') return null;
    // Das Haekchen MUSS gesetzt sein. Eine Einwilligung, die die Oberflaeche
    // vorausfuellt, ist keine — deshalb prueft es der Dienst, nicht die Seite.
    if (koerper.einwilligung !== true) return null;
    if (typeof koerper.mail !== 'string' || !adresseSiehtEchtAus(koerper.mail)) return null;
    const sprache = SPRACHEN.has(koerper.sprache) ? koerper.sprache : 'de';
    return { mail: normalisiereAdresse(koerper.mail), sprache };
}

/**
 * Legt eine offene Anmeldung an und gibt die Marke fuer die Mail zurueck —
 * oder null, wenn KEINE Mail gehen soll: Die Adresse ist schon dabei, oder
 * es ging eben erst eine hinaus.
 *
 * Der Aufrufer antwortet in beiden Faellen gleich. Ob eine Adresse auf der
 * Liste steht, erfaehrt nur ihr Postfach.
 */
export async function meldeAn(speicher, { mail, sprache }, jetzt = Date.now()) {
    const pk = rundbriefAbdruck(mail);
    const vorhanden = await holeOderNichts(speicher, TABELLE_RUNDBRIEF, pk, 'a');
    if (vorhanden?.zustand === 'dabei') return null;
    if (vorhanden && jetzt - vorhanden.angefragt_am < RUHE_MINUTEN * 60_000) return null;

    const geheim = zufall();
    await speicher.setze(TABELLE_RUNDBRIEF, {
        partitionKey: pk, rowKey: 'a',
        mail, sprache, zustand: 'offen',
        marke: sha(geheim),
        marke_bis: jetzt + BESTAETIGEN_STUNDEN * 3_600_000,
        angefragt_am: jetzt,
        fassung: EINWILLIGUNG_FASSUNG,
    });
    return pk + '.' + geheim;
}

// ── Bestaetigen ─────────────────────────────────────────────────────

/** @returns {'ok' | 'schon' | 'ungueltig' | 'abgelaufen'} */
export async function bestaetige(speicher, marke, jetzt = Date.now()) {
    const teile = zerlegeMarke(marke);
    if (!teile) return 'ungueltig';
    const zeile = await holeOderNichts(speicher, TABELLE_RUNDBRIEF, teile.pk, 'a');
    if (!zeile) return 'ungueltig';
    if (zeile.zustand === 'dabei') return 'schon';
    if (!gleich(zeile.marke, sha(teile.geheim))) return 'ungueltig';
    if (jetzt > zeile.marke_bis) return 'abgelaufen';

    const { etag, ...rest } = zeile;
    await speicher.setze(TABELLE_RUNDBRIEF, {
        ...rest,
        zustand: 'dabei',
        marke: '', marke_bis: 0,
        abmelden: zufall(),
        bestaetigt_am: jetzt,
    }, { etag });
    return 'ok';
}

// ── Abmelden ────────────────────────────────────────────────────────

/*
  Abmelden loescht die Zeile ganz. Kein „abgemeldet"-Vermerk, keine
  Sperrliste: Wer weg will, ist weg, und wer wiederkommt, faengt neu an.
*/
/** @returns {'ok' | 'ungueltig'} */
export async function meldeAb(speicher, marke) {
    const teile = zerlegeMarke(marke);
    if (!teile) return 'ungueltig';
    const zeile = await holeOderNichts(speicher, TABELLE_RUNDBRIEF, teile.pk, 'a');
    if (!zeile) return 'ungueltig';
    if (zeile.zustand !== 'dabei' || !gleich(zeile.abmelden, teile.geheim)) return 'ungueltig';
    await speicher.loesche(TABELLE_RUNDBRIEF, teile.pk, 'a');
    return 'ok';
}

/** Der Abmeldelink, wie er in jeden Rundbrief gehoert. */
export function abmeldeVerweis(seite, zeile) {
    return seite + '/' + zeile.sprache + '/#schnurrpost-ab=' + zeile.partitionKey + '.' + zeile.abmelden;
}

// ── Aufraeumen und Auslesen ─────────────────────────────────────────

/** Loescht unbestaetigte Anmeldungen, die aelter als OFFEN_TAGE sind. */
export async function raeumeAuf(speicher, jetzt = Date.now()) {
    const grenze = jetzt - OFFEN_TAGE * 86_400_000;
    let weg = 0;
    for await (const zeile of speicher.listeAlle(TABELLE_RUNDBRIEF,
        (z) => z.zustand === 'offen', "zustand eq 'offen'")) {
        if (zeile.angefragt_am < grenze) {
            await speicher.loesche(TABELLE_RUNDBRIEF, zeile.partitionKey, 'a');
            weg += 1;
        }
    }
    return weg;
}

/** Alle bestaetigten Leser — fuer den Versand, sobald es einen gibt. */
export async function bestaetigteLeser(speicher) {
    const raus = [];
    for await (const zeile of speicher.listeAlle(TABELLE_RUNDBRIEF,
        (z) => z.zustand === 'dabei', "zustand eq 'dabei'")) {
        raus.push(zeile);
    }
    return raus;
}
