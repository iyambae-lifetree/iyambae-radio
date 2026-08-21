/*
  Sitzungen — ein Plaetzchen, ein Zufallswert, ein Abdruck in der Tabelle.

  ── Was im Plaetzchen steht, und warum es zweiteilig ist ────────────

      hz_sitzung = <kontoId>.<32 zufaellige Bytes, base64url>

  Der zweite Teil ist das Geheimnis. Der erste ist nur der Wegweiser: Ohne
  ihn wuesste der Dienst nicht, in welcher Partition er nachsehen soll, und
  muesste die ganze Tabelle durchsuchen — bei jedem einzelnen Aufruf. Die
  Kontokennung ist kein Geheimnis; sie steht auch in der Antwort von
  /api/konto.

  GESPEICHERT WIRD NUR DER SHA-256 des Geheimnisses. Wer die Tabelle liest,
  kann daraus kein Plaetzchen bauen. Anders als beim Einmalcode ist das hier
  kein Feigenblatt, sondern echter Schutz: 32 Zufallsbytes haben 2^256
  Moeglichkeiten, die probiert niemand durch.

  Es wird nichts signiert. Es gibt keinen Signierschluessel, den man
  wechseln, verlieren oder vergessen koennte — der Wert IST der Beweis, und
  die Tabelle ist die Wahrheit darueber, ob er noch gilt.

  ── SameSite=Lax und nicht Strict ───────────────────────────────────

  Mit Strict schickt der Browser das Plaetzchen NICHT mit, wenn der Besucher
  von einer fremden Seite kommt — und genau das passiert bei der Rueckkehr
  von Google oder Apple nach der sozialen Anmeldung. Die Seite laedt, das
  Plaetzchen liegt im Browser, und trotzdem sieht der Dienst niemanden. Man
  sucht lange, bis man das versteht.

  Lax verliert dabei wenig: Es schickt das Plaetzchen bei einer normalen
  Navigation mit (GET, oberste Ebene), aber NICHT bei einem fremden POST.
  Damit ist der klassische CSRF-Fall schon abgedeckt; server.mjs prueft
  zusaetzlich die Herkunft.

  ── Abgelaufenes wegraeumen, ohne einen Takt zu erzeugen ────────────

  Es gibt in diesem Dienst KEINEN Timer im Sekundentakt. Der Grund steht in
  der Rechnung: Die Leerlaufabrechnung von Container Apps gilt nur unter
  0,01 vCPU UND unter 1.000 Byte je Sekunde. Ein regelmaessiger Timer reisst
  beides und verdreifacht die Rechnung.

  Stattdessen zwei Wege, beide beilaeufig:
    1. Wer eine abgelaufene Sitzung vorlegt, bekommt 401 — und die Zeile
       wird im selben Zug geloescht. Das erledigt den Normalfall.
    2. Wer NIE wiederkommt, raeumt nichts weg. Genau seine Sitzung ist die
       heikle: ein gueltiges Geheimnis, das niemand mehr beobachtet. Dafuer
       laeuft ein Durchgang ueber die ganze Tabelle — angestossen von einer
       beliebigen Anfrage, hoechstens einmal in 24 Stunden, im Hintergrund.
       Kein Timer, keine Grundlast, und wenn tagelang niemand kommt, laeuft
       er eben tagelang nicht. Dann liegt aber auch keine Last an.
*/

import { randomBytes, createHash } from 'node:crypto';
import { mitEtag, SpeicherFehler, TABELLE_KONTEN } from './speicher.mjs';
import { gleichOhneZeitverrat } from './passwort.mjs';
import { protokolliere } from './protokoll.mjs';

export const PLAETZCHEN = 'hz_sitzung';
export const SITZUNGSDAUER_MS = Number(process.env.SITZUNGSDAUER_TAGE ?? 365) * 24 * 60 * 60 * 1000;

const ZEILE = (abdruck) => 'sitzung:' + abdruck;

export function abdruckVon(geheimnis) {
    return createHash('sha256').update(geheimnis, 'utf8').digest('hex');
}

// ── Plaetzchen bauen und lesen ──────────────────────────────────────

/**
 * Baut die Set-Cookie-Zeile.
 *
 * HttpOnly: JavaScript kommt nicht heran. Das ist die eine Massnahme, die
 * bei einem eingeschleusten Skript noch etwas rettet — es kann dann Anfragen
 * im Namen des Angemeldeten stellen, aber die Sitzung nicht mitnehmen.
 *
 * Secure: nur ueber HTTPS. Oertlich laeuft die Seite ueber http, deshalb
 * laesst sich das mit PLAETZCHEN_UNSICHER=1 abschalten — und nur dort.
 */
export function baueSitzungsPlaetzchen(wert, { unsicher = process.env.PLAETZCHEN_UNSICHER === '1' } = {}) {
    const teile = [
        PLAETZCHEN + '=' + wert,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=' + Math.floor(SITZUNGSDAUER_MS / 1000),
    ];
    if (!unsicher) teile.push('Secure');
    return teile.join('; ');
}

/**
 * Loescht das Plaetzchen im Browser. Max-Age=0 und derselbe Pfad — ein
 * anderer Pfad loescht ein anderes Plaetzchen, naemlich keines.
 *
 * Das ist die HAELFTE des Abmeldens. Die andere ist das Loeschen der Zeile;
 * ohne sie bliebe der Wert gueltig, und wer ihn vorher kopiert hat, waere
 * weiter angemeldet.
 */
export function baueLoeschPlaetzchen({ unsicher = process.env.PLAETZCHEN_UNSICHER === '1' } = {}) {
    const teile = [PLAETZCHEN + '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (!unsicher) teile.push('Secure');
    return teile.join('; ');
}

export function liesPlaetzchen(kopfzeile, name = PLAETZCHEN) {
    if (!kopfzeile) return null;
    for (const stueck of String(kopfzeile).split(';')) {
        const trenner = stueck.indexOf('=');
        if (trenner < 0) continue;
        if (stueck.slice(0, trenner).trim() !== name) continue;
        return stueck.slice(trenner + 1).trim();
    }
    return null;
}

// ── Erzeugen, Pruefen, Widerrufen ───────────────────────────────────

export async function erzeugeSitzung(speicher, kontoId, jetzt = Date.now()) {
    const geheimnis = randomBytes(32).toString('base64url');
    const abdruck = abdruckVon(geheimnis);
    await speicher.setze(TABELLE_KONTEN, {
        partitionKey: kontoId,
        rowKey: ZEILE(abdruck),
        abdruck,
        angelegt: jetzt,
        ablauf: jetzt + SITZUNGSDAUER_MS,
        // Nur das Datum, nicht die Uhrzeit. Ein Zeitstempel auf die Sekunde
        // waere ein Bewegungsprofil; ein Datum reicht, um eine tote Sitzung
        // zu erkennen.
        zuletzt: tagVon(jetzt),
    });
    return { wert: kontoId + '.' + geheimnis, abdruck };
}

function tagVon(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Prueft ein Plaetzchen. Gibt `{kontoId, abdruck}` zurueck oder `null`.
 *
 * Abgelaufene Zeilen werden beim Vorbeikommen geloescht — das ist Weg 1
 * aus dem Kommentar oben.
 */
export async function pruefeSitzung(speicher, plaetzchenWert, jetzt = Date.now()) {
    if (!plaetzchenWert || typeof plaetzchenWert !== 'string') return null;
    const trenner = plaetzchenWert.indexOf('.');
    if (trenner <= 0) return null;

    const kontoId = plaetzchenWert.slice(0, trenner);
    const geheimnis = plaetzchenWert.slice(trenner + 1);
    if (!/^[0-9a-f]{32}$/.test(kontoId) || geheimnis.length < 32) return null;

    const abdruck = abdruckVon(geheimnis);

    let zeile;
    try {
        zeile = await speicher.hole(TABELLE_KONTEN, kontoId, ZEILE(abdruck));
    } catch (fehler) {
        if (fehler.art === 'nicht_gefunden') return null;
        throw fehler;   // ein aussetzender Tabellendienst ist 503, nicht 401
    }

    /*
      Der Abgleich ist streng genommen schon durch den Zeilenschluessel
      erfolgt — man findet die Zeile nur mit dem richtigen Abdruck. Er steht
      trotzdem hier, und zwar zeitkonstant: Sollte jemals ein anderer Weg zu
      dieser Zeile fuehren (ein Durchgang, eine Migration, ein zweiter
      Index), ist der Vergleich schon an der richtigen Stelle. Sicherheit,
      die von einer Aufrufreihenfolge abhaengt, haelt nicht.
    */
    if (!gleichOhneZeitverrat(zeile.abdruck, abdruck)) return null;

    if (!(zeile.ablauf > jetzt)) {
        await speicher.loesche(TABELLE_KONTEN, kontoId, ZEILE(abdruck)).catch(() => {});
        protokolliere({ art: 'sitzung.abgelaufen', konto: kontoId, ergebnis: 'abgelehnt' });
        return null;
    }

    // Nur schreiben, wenn sich der Tag geaendert hat: sonst ein Schreibvorgang
    // je Anfrage, und das ist Geld und Personenbezug fuer nichts.
    const heute = tagVon(jetzt);
    if (zeile.zuletzt !== heute) {
        // Ohne If-Match, absichtlich: Zwei Anfragen desselben Menschen am
        // selben Tag schreiben denselben Wert, da gibt es nichts zu
        // gewinnen. Und ohne `await` — wer eine Seite aufruft, soll nicht
        // auf einen Buchhaltungseintrag warten.
        const { etag: _weg, ...ohneEtag } = zeile;
        speicher.setze(TABELLE_KONTEN, { ...ohneEtag, zuletzt: heute }).catch(() => {});
    }

    return { kontoId, abdruck };
}

export async function widerrufe(speicher, kontoId, abdruck) {
    await speicher.loesche(TABELLE_KONTEN, kontoId, ZEILE(abdruck));
}

/** Alle Sitzungen eines Kontos beenden — nach einem Passwortwechsel. */
export async function widerrufeAlle(speicher, kontoId, { ausser } = {}) {
    const zuLoeschen = [];
    for await (const zeile of speicher.liste(TABELLE_KONTEN, kontoId, 'sitzung:')) {
        if (ausser && zeile.rowKey === ZEILE(ausser)) continue;
        zuLoeschen.push(['delete', { rowKey: zeile.rowKey, partitionKey: kontoId, etag: '*' }]);
    }
    if (zuLoeschen.length) await speicher.stapel(TABELLE_KONTEN, kontoId, zuLoeschen);
    return zuLoeschen.length;
}

// ── Beilaeufiges Aufraeumen ─────────────────────────────────────────

/** Abgelaufene Sitzungen und Codes EINES Kontos. Billig, laeuft im Vorbeigehen. */
export async function raeumeKonto(speicher, kontoId, jetzt = Date.now()) {
    const weg = [];
    for (const praefix of ['sitzung:', 'code:', 'marke:']) {
        for await (const zeile of speicher.liste(TABELLE_KONTEN, kontoId, praefix)) {
            if (zeile.ablauf > jetzt) continue;
            weg.push(['delete', { rowKey: zeile.rowKey, partitionKey: kontoId, etag: '*' }]);
        }
    }
    if (weg.length) await speicher.stapel(TABELLE_KONTEN, kontoId, weg).catch(() => {});
    return weg.length;
}

const AUFRAEUMABSTAND_MS = Number(process.env.AUFRAEUM_STUNDEN ?? 24) * 60 * 60 * 1000;
let letzterDurchgang = 0;
let laeuft = false;

/**
 * Der Durchgang ueber alles. Wird von einer Anfrage angestossen, nicht von
 * einem Timer, und hoechstens alle AUFRAEUMABSTAND_MS.
 *
 * Er laeuft im Hintergrund: Der Aufrufer wartet nicht darauf, sonst zahlte
 * eine zufaellige Anfrage am Tag die ganze Rechnung. Fehler landen im
 * Protokoll und sonst nirgends — ein misslungener Durchgang wird morgen
 * wiederholt.
 */
export function stosseAufraeumenAn(speicher, jetzt = Date.now()) {
    if (laeuft) return false;
    if (jetzt - letzterDurchgang < AUFRAEUMABSTAND_MS) return false;
    letzterDurchgang = jetzt;
    laeuft = true;

    (async () => {
        const start = Date.now();
        let anzahl = 0;
        try {
            /*
              Ein Durchgang ueber die ganze Tabelle statt je Partition: Der
              Dienst weiss nicht, welche Konten es gibt, ohne nachzusehen.
              Der Filter laeuft dabei im Tabellendienst, nicht hier — es
              kommen nur die abgelaufenen Zeilen ueber die Leitung.
            */
            const nachPartition = new Map();
            const iterator = speicher.listeAlle(
                TABELLE_KONTEN,
                (zeile) => (zeile.rowKey.startsWith('sitzung:') || zeile.rowKey.startsWith('code:')
                    || zeile.rowKey.startsWith('marke:')) && zeile.ablauf <= jetzt,
                // `.0` ist kein Schoenheitsfehler: Zeitstempel in
                // Millisekunden passen nicht in Edm.Int32 und liegen deshalb
                // als Edm.Double in der Tabelle. Ein ganzzahliges Literal
                // waere ein anderer Typ; Table Storage vergleicht dann nicht,
                // sondern lehnt die Abfrage ab.
                'ablauf lt ' + jetzt + '.0 and ((RowKey ge \'code:\' and RowKey lt \'code;\')'
                    + ' or (RowKey ge \'marke:\' and RowKey lt \'marke;\')'
                    + ' or (RowKey ge \'sitzung:\' and RowKey lt \'sitzung;\'))');

            for await (const zeile of iterator) {
                if (!nachPartition.has(zeile.partitionKey)) nachPartition.set(zeile.partitionKey, []);
                nachPartition.get(zeile.partitionKey).push(
                    ['delete', { rowKey: zeile.rowKey, partitionKey: zeile.partitionKey, etag: '*' }]);
                anzahl++;
            }
            for (const [pk, vorgaenge] of nachPartition) {
                await speicher.stapel(TABELLE_KONTEN, pk, vorgaenge);
            }
            protokolliere({ art: 'aufraeumen', ergebnis: 'ok', anzahl, dauer: Date.now() - start });
        } catch (fehler) {
            protokolliere({
                art: 'aufraeumen', ergebnis: 'fehler',
                grund: fehler instanceof SpeicherFehler ? fehler.art : 'unbekannt',
                anzahl, dauer: Date.now() - start,
            });
        } finally {
            laeuft = false;
        }
    })();

    return true;
}

/** Nur fuer Tests: den Abstand zuruecksetzen. */
export function vergissAufraeumen() {
    letzterDurchgang = 0;
    laeuft = false;
}
