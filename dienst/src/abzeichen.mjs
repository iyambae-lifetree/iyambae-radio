/*
  ── DAS MESS-ABZEICHEN ───────────────────────────────────────────────

  Anlass: 432hz-radio#27. Creator behaupten unter ihren Videos „432 Hz", und
  niemand kann es nachpruefen. `apps.iyambae.fm/stimmung/` misst das. Ein
  Bild, das die Seite nach der Messung selbst ausgibt, hat Saemi-Ra
  verworfen: „Soll natuerlich ueberpruefbar sein." Ueberpruefbar heisst
  Speicher — und der steht hier.

  Spec: docs/superpowers/specs/2026-11-03-mess-abzeichen.md.

  ── WAS DAS ABZEICHEN SAGT, UND NUR DAS ──────────────────────────────

  Diese Datei (Pruefsumme) wurde am Tag X bei Y Hz gemessen. NICHT: dass das
  Video darunter dieselbe Datei enthaelt. Das kann niemand von aussen
  feststellen, wir auch nicht. Wer unehrlich ist, misst eine echte 432er-
  Datei und setzt das Abzeichen unter irgendein Video — Saemi-Ra hat das am
  02.10. selbst so aufgeschrieben. Deshalb steht auf der Seite ein
  Pflichtsatz, deshalb traegt das Bild das Wort „Selbstauskunft", und
  deshalb heisst es ueberall „gemessen" und nirgends „geprueft": Ein
  Pruefzeichen ist etwas, an das das Wettbewerbsrecht Anforderungen stellt
  (Michas Kommentar vom 01.10.).

  ── WAS ANKOMMT, UND WAS AUSDRUECKLICH NICHT ─────────────────────────

  Vier Zahlen: Kammerton, Sicherheit, Laenge der Datei, SHA-256. Keine
  Datei, kein Dateiname, keine Adresse, kein Konto, keine Sprache. Die
  Erlaubnisliste unten liest genau diese vier Felder und sieht alles
  andere nie an — dieselbe Bauart wie `rueckmeldung.mjs`.

  ── WARUM DER TAG IN DER KENNUNG STEHT ───────────────────────────────

  Nach zwei Jahren soll die Seite „abgelaufen" sagen (410), nicht „gibt es
  nicht" (404). Ist die Zeile aber weggeraeumt, weiss der Dienst nichts mehr
  von ihr — es sei denn, er hebt einen Grabstein auf, und dann lebte der
  Eintrag laenger als zwei Jahre. Also steht der Erstellungstag in den
  ersten drei Zeichen der Kennung. Er verraet nichts, was die Seite nicht
  ohnehin zeigt.
*/

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { TABELLE_ABZEICHEN, holeOderNichts } from './speicher.mjs';

// ── Der Befund ──────────────────────────────────────────────────────

/** Derselbe Bereich wie in rueckmeldung.mjs: Wo ein Kammerton ueberhaupt liegen kann. */
export const A4_MINDESTENS = 380.0;
export const A4_HOECHSTENS = 500.0;

/*
  Die Schwelle der Oberflaeche. Darunter zeigt /stimmung/ gar keine Zahl
  (stimmung.html: „UNTER DER SCHWELLE WIRD KEINE ZAHL BEHAUPTET"), und ein
  Abzeichen fuer eine Zahl, die nicht einmal angezeigt wurde, waere genau
  die Sorte Aussage, gegen die die Seite antritt.
*/
export const SICHERHEIT_MINDESTENS = 0.35;

/** Laenge der gemessenen Datei: eine Sekunde bis ein Tag. */
const DAUER_MINDESTENS = 1;
const DAUER_HOECHSTENS = 86_400;

const SHA256 = /^[0-9a-f]{64}$/;

/*
  NUR `number`. `Number("432,1")` ist NaN, `Number([432])` ist 432 — wer
  Bereiche gegen umgewandelte Werte prueft, laesst genau die Faelle durch,
  die er sucht. Dieselbe Regel und dieselbe Begruendung wie in
  rueckmeldung.mjs.
*/
function zahl(wert, von, bis, stellen) {
    if (typeof wert !== 'number' || !Number.isFinite(wert)) return null;
    if (wert < von || wert > bis) return null;
    const faktor = 10 ** stellen;
    return Math.round(wert * faktor) / faktor;
}

/**
 * Prueft einen eingegangenen Rumpf gegen die Erlaubnisliste.
 *
 * Anders als bei der anonymen Statistik faellt hier ein falsches Feld nicht
 * still weg: Ein Abzeichen mit drei von vier Angaben waere ein anderes
 * Abzeichen als das, das der Creator angefordert hat. Also alles oder
 * nichts — und die Seite erfaehrt es.
 *
 * @returns {{ok: true, befund: object} | {ok: false, fehler: string, feld?: string}}
 */
export function saeubereBefund(koerper) {
    if (!koerper || typeof koerper !== 'object' || Array.isArray(koerper)) {
        return { ok: false, fehler: 'befund_ungueltig', feld: 'rumpf' };
    }
    const a4 = zahl(koerper.a4, A4_MINDESTENS, A4_HOECHSTENS, 1);
    if (a4 === null) return { ok: false, fehler: 'befund_ungueltig', feld: 'a4' };
    const sicherheit = zahl(koerper.sicherheit, 0, 1, 2);
    if (sicherheit === null) return { ok: false, fehler: 'befund_ungueltig', feld: 'sicherheit' };
    const dauer = zahl(koerper.dauer, DAUER_MINDESTENS, DAUER_HOECHSTENS, 0);
    if (dauer === null) return { ok: false, fehler: 'befund_ungueltig', feld: 'dauer' };
    /*
      Genau 64 Zeichen, nur Kleinbuchstaben. Grossbuchstaben waeren dieselbe
      Pruefsumme in anderer Schreibweise — und dann stuende auf der Seite
      eine andere Zeichenfolge, als /stimmung/ beim Nachmessen zeigt. Wer
      Zeichen fuer Zeichen vergleicht, saehe einen Unterschied, wo keiner ist.
    */
    const sha256 = koerper.sha256;
    if (typeof sha256 !== 'string' || !SHA256.test(sha256)) {
        return { ok: false, fehler: 'befund_ungueltig', feld: 'sha256' };
    }
    if (sicherheit < SICHERHEIT_MINDESTENS) return { ok: false, fehler: 'traegt_nicht' };
    return { ok: true, befund: { a4, sicherheit, dauer, sha256 } };
}

// ── Kennung und Ablauf ──────────────────────────────────────────────

/*
  32 Zeichen ohne i, l, o, u — nichts, was man beim Abtippen von einem
  Bildschirmfoto verwechselt. 32 teilt 256, also ist `byte & 31`
  gleichverteilt, ohne Verwerfen.
*/
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const KENNUNG = /^[0-9a-hjkmnp-tv-z]{10}$/;
const TAG_MS = 86_400_000;
/** Tag 0 der Kennung. Drei Zeichen zur Basis 32 reichen 32 768 Tage, bis 2115. */
const ANFANG = Date.UTC(2026, 0, 1);

export function kennungSiehtEchtAus(kennung) {
    return typeof kennung === 'string' && KENNUNG.test(kennung);
}

/** Drei Zeichen Erstellungstag, sieben Zeichen Zufall (35 bit je Tag). */
export function neueKennung(jetzt = Date.now()) {
    const tag = Math.floor((jetzt - ANFANG) / TAG_MS);
    if (!(tag >= 0 && tag < 32 ** 3)) throw new RangeError('Tag ausserhalb der Kennung');
    const kopf = ALPHABET[(tag >> 10) & 31] + ALPHABET[(tag >> 5) & 31] + ALPHABET[tag & 31];
    let rest = '';
    for (const byte of randomBytes(7)) rest += ALPHABET[byte & 31];
    return kopf + rest;
}

/** Mitternacht (UTC) des Erstellungstags, aus den ersten drei Zeichen. */
export function tagAusKennung(kennung) {
    const [a, b, c] = [...kennung.slice(0, 3)].map((z) => ALPHABET.indexOf(z));
    return ANFANG + ((a << 10) | (b << 5) | c) * TAG_MS;
}

/** Zwei Kalenderjahre, nicht 730 Tage: „zwei Jahre ab Erstellung" meint das Datum. */
export function ablaufVon(angelegt) {
    const d = new Date(angelegt);
    d.setUTCFullYear(d.getUTCFullYear() + 2);
    return d.getTime();
}

// ── Der Loeschschluessel ────────────────────────────────────────────

/*
  24 Zufallsbytes, also 192 bit. Gespeichert wird nur der SHA-256.

  Ein schneller Hash ist hier richtig und bei einem Passwort waere er
  falsch: Argon2 macht das RATEN teuer, und raten laesst sich ein Wert mit
  192 bit Zufall ohnehin nicht. Dieselbe Ueberlegung wie bei den Links im
  Rundbrief (rundbrief.mjs).
*/
const SCHLUESSEL = /^[A-Za-z0-9_-]{32}$/;

export function schluesselSiehtEchtAus(wert) {
    return typeof wert === 'string' && SCHLUESSEL.test(wert);
}

function abdruck(schluessel) {
    return createHash('sha256').update(schluessel, 'utf8').digest('hex');
}

function gleich(a, b) {
    const x = Buffer.from(String(a), 'utf8');
    const y = Buffer.from(String(b), 'utf8');
    return x.length === y.length && timingSafeEqual(x, y);
}

// ── Ablegen, Holen, Loeschen ────────────────────────────────────────

/**
 * Legt ein Abzeichen an. Gibt Kennung und Loeschschluessel zurueck — den
 * Schluessel GENAU EINMAL, hier. Danach gibt es ihn nirgends mehr.
 *
 * Angelegt wird mit If-None-Match: Ziehen zwei Anfragen am selben Tag
 * dieselbe Kennung (1 zu 34 Milliarden), gewinnt die erste, und die zweite
 * zieht neu. Hoechstens dreimal; ein vierter Zusammenstoss ist kein Zufall
 * mehr, sondern ein kaputter Zufallsgenerator, und soll laut scheitern.
 */
export async function legeAbzeichenAn(speicher, befund, { jetzt = Date.now(), ziehe } = {}) {
    const loeschschluessel = randomBytes(24).toString('base64url');
    const ziehen = ziehe ?? (() => neueKennung(jetzt));
    let letzter;
    for (let versuch = 1; versuch <= 3; versuch++) {
        const kennung = ziehen();
        try {
            await speicher.setze(TABELLE_ABZEICHEN, {
                // Der Befund ZUERST, die Schluessel danach — dieselbe
                // Reihenfolge und derselbe Grund wie in rueckmeldung.mjs.
                a4: befund.a4,
                sicherheit: befund.sicherheit,
                dauer: befund.dauer,
                sha256: befund.sha256,
                angelegt: jetzt,
                ablauf: ablaufVon(jetzt),
                loeschHash: abdruck(loeschschluessel),
                partitionKey: kennung,
                rowKey: 'a',
            }, { etag: '*' });
            return { kennung, loeschschluessel };
        } catch (fehler) {
            if (fehler.art !== 'konflikt') throw fehler;
            letzter = fehler;
        }
    }
    throw letzter;
}

/**
 * @returns {{zustand: 'da' | 'abgelaufen' | 'fehlt', kennung: string, zeile?: object}}
 */
export async function holeAbzeichen(speicher, kennung, jetzt = Date.now()) {
    // Was keine Kennung sein kann, kostet keinen Tabellenzugriff.
    if (!kennungSiehtEchtAus(kennung)) return { zustand: 'fehlt', kennung };
    const tag = tagAusKennung(kennung);
    if (tag > jetzt) return { zustand: 'fehlt', kennung };

    const zeile = await holeOderNichts(speicher, TABELLE_ABZEICHEN, kennung, 'a');
    if (zeile) {
        if (zeile.ablauf > jetzt) return { zustand: 'da', kennung, zeile };
        /*
          Abgelaufen und noch da: Der Tagesdurchgang war noch nicht hier.
          Wegraeumen im Vorbeigehen, ohne dass der Aufrufer darauf wartet.
        */
        speicher.loesche(TABELLE_ABZEICHEN, kennung, 'a').catch(() => {});
        return { zustand: 'abgelaufen', kennung };
    }
    /*
      Keine Zeile. Liegt der Tag in der Kennung mehr als zwei Jahre zurueck,
      war hier einmal etwas, das inzwischen abgelaufen ist — oder es gab an
      diesem Tag nie einen Eintrag mit genau diesen Zeichen. Beides heisst
      „abgelaufen" zu Recht: Unter dieser Kennung kann nichts mehr kommen.
    */
    return { zustand: ablaufVon(tag) <= jetzt ? 'abgelaufen' : 'fehlt', kennung };
}

/** @returns {'ok' | 'nicht_gefunden' | 'schluessel_falsch'} */
export async function loescheAbzeichen(speicher, kennung, schluessel, jetzt = Date.now()) {
    if (!kennungSiehtEchtAus(kennung)) return 'nicht_gefunden';
    const zeile = await holeOderNichts(speicher, TABELLE_ABZEICHEN, kennung, 'a');
    if (!zeile || !(zeile.ablauf > jetzt)) return 'nicht_gefunden';
    if (!gleich(zeile.loeschHash, abdruck(String(schluessel)))) return 'schluessel_falsch';
    await speicher.loesche(TABELLE_ABZEICHEN, kennung, 'a');
    return 'ok';
}

/**
 * Der Tagesdurchgang: alles, dessen `ablauf` vorbei ist. Der Filter laeuft
 * im Tabellendienst; ueber die Leitung kommen nur die abgelaufenen Zeilen.
 * `.0`, weil Millisekunden als Edm.Double liegen — siehe sitzung.mjs.
 */
export async function raeumeAbzeichenAuf(speicher, jetzt = Date.now()) {
    let weg = 0;
    for await (const zeile of speicher.listeAlle(TABELLE_ABZEICHEN,
        (z) => z.ablauf <= jetzt, 'ablauf le ' + Math.floor(jetzt) + '.0')) {
        await speicher.loesche(TABELLE_ABZEICHEN, zeile.partitionKey, zeile.rowKey);
        weg++;
    }
    return weg;
}

// ── Sprache ─────────────────────────────────────────────────────────

export const SPRACHEN = ['de', 'en', 'fr', 'es', 'it', 'ja', 'ar'];

/*
  `?sprache=` vor dem ersten Eintrag von Accept-Language vor Englisch —
  dieselbe Regel wie die Weiche in deploy/nginx.conf. Gespeichert wird
  keine Sprache: Das Abzeichen spricht die Sprache dessen, der es ansieht.
*/
export function waehleSprache(abfrage, acceptLanguage) {
    const gewaehlt = new URLSearchParams(String(abfrage ?? '').replace(/^\?/, '')).get('sprache');
    if (SPRACHEN.includes(gewaehlt)) return gewaehlt;
    const erste = String(acceptLanguage ?? '').trim().slice(0, 2).toLowerCase();
    return SPRACHEN.includes(erste) ? erste : 'en';
}

// ── Die Texte ───────────────────────────────────────────────────────

/*
  Sieben Sprachen, wie /stimmung/. Platzhalter in geschweiften Klammern;
  `nach` und `pflicht` duerfen Auszeichnung tragen und kommen deshalb aus
  diesem Haus, nie aus der Anfrage.

  Das Wort ist UEBERALL „gemessen" (measured, mesuré, medido, misurato,
  測定, مُقاس) — kein Pruefzeichen, kein „verified", kein „certified".
*/
const TEXTE = {
    de: {
        abzeichen: 'Mess-Abzeichen', selbst: 'Selbstauskunft',
        titelDa: '{hz} Hz gemessen',
        vorwort: 'Am {datum} hat jemand eine Datei auf apps.iyambae.fm gemessen und dieses Abzeichen dazu angelegt.',
        kammerton: 'Kammerton', sicherheit: 'Sicherheit', laenge: 'Länge der Datei',
        pruefsumme: 'Prüfsumme (SHA-256)', gemessenAm: 'Gemessen am', bis: 'Gespeichert bis',
        pflichtTitel: 'Was dieses Abzeichen sagt — und was nicht',
        pflicht: 'Es sagt nur, dass <strong>die Datei mit dieser Prüfsumme</strong> am {datum} bei {hz} Hz gemessen wurde. Es sagt <strong>nicht, dass das Video</strong> oder die Musik, unter der es steht, dieselbe Datei enthält — das lässt sich von außen nicht feststellen, auch von uns nicht. Es ist eine <strong>Selbstauskunft mit Zeitstempel, kein Beweis.</strong>',
        nachTitel: 'So misst du nach',
        nach: 'Nachmessen kann, wer die Datei hat: Öffne <a href="/{sprache}/stimmung/">apps.iyambae.fm/stimmung/</a>, miss dieselbe Datei und vergleiche die SHA-256 unter dem Ergebnis mit der oben. Stimmt sie Zeichen für Zeichen, ist es dieselbe Datei, und die Messung sollte denselben Kammerton ergeben.',
        loeschenTitel: 'Eintrag löschen',
        loeschenText: 'Nur für den, der das Abzeichen erzeugt hat: mit dem Löschschlüssel, der dabei einmal angezeigt wurde. Der Eintrag ist danach sofort weg; Seite und Bild können noch bis zu fünf Minuten aus Zwischenspeichern kommen.',
        loeschenFeld: 'Löschschlüssel', loeschenKnopf: 'Endgültig löschen', loeschenOk: 'Gelöscht.',
        loeschenFalsch: 'Der Schlüssel passt nicht.', loeschenFehler: 'Das hat nicht geklappt. Versuch es gleich noch einmal.',
        titelAbgelaufen: 'Diese Messung ist abgelaufen',
        textAbgelaufen: 'Einträge werden zwei Jahre nach ihrer Erstellung gelöscht. Was hier stand, ist nicht mehr gespeichert.',
        titelFehlt: 'Keine Messung unter dieser Kennung',
        textFehlt: 'Entweder wurde sie gelöscht, oder es gab sie nie.',
        eigene: 'Eigene Datei messen', datenschutz: 'Datenschutz',
        bildDa: '{hz} Hz gemessen', bildZeile: '{datum} · Sicherheit {prozent} % · Selbstauskunft',
        bildAbgelaufen: 'Messung abgelaufen', bildFehlt: 'Keine Messung gefunden',
    },
    en: {
        abzeichen: 'Measurement badge', selbst: 'Self-declaration',
        titelDa: '{hz} Hz measured',
        vorwort: 'On {datum}, someone measured a file on apps.iyambae.fm and created this badge for it.',
        kammerton: 'Concert pitch', sicherheit: 'Confidence', laenge: 'Length of the file',
        pruefsumme: 'Checksum (SHA-256)', gemessenAm: 'Measured on', bis: 'Stored until',
        pflichtTitel: 'What this badge says — and what it does not',
        pflicht: 'It only says that <strong>the file with this checksum</strong> was measured at {hz} Hz on {datum}. It does <strong>not say that the video</strong> or the music it appears under contains the same file — nobody can tell that from the outside, including us. It is a <strong>self-declaration with a timestamp, not proof.</strong>',
        nachTitel: 'How to measure it yourself',
        nach: 'Anyone who has the file can check: open <a href="/{sprache}/stimmung/">apps.iyambae.fm/stimmung/</a>, measure the same file and compare the SHA-256 below the result with the one above. If it matches character for character, it is the same file, and the measurement should give the same concert pitch.',
        loeschenTitel: 'Delete this entry',
        loeschenText: 'Only for whoever created the badge: with the deletion key that was shown once at the time. The entry is gone immediately; page and image may still come from caches for up to five minutes.',
        loeschenFeld: 'Deletion key', loeschenKnopf: 'Delete for good', loeschenOk: 'Deleted.',
        loeschenFalsch: 'The key does not match.', loeschenFehler: 'That did not work. Please try again in a moment.',
        titelAbgelaufen: 'This measurement has expired',
        textAbgelaufen: 'Entries are deleted two years after they were created. What was here is no longer stored.',
        titelFehlt: 'No measurement under this ID',
        textFehlt: 'Either it was deleted, or it never existed.',
        eigene: 'Measure your own file', datenschutz: 'Privacy',
        bildDa: '{hz} Hz measured', bildZeile: '{datum} · confidence {prozent} % · self-declaration',
        bildAbgelaufen: 'Measurement expired', bildFehlt: 'No measurement found',
    },
    fr: {
        abzeichen: 'Badge de mesure', selbst: 'Déclaration personnelle',
        titelDa: '{hz} Hz mesurés',
        vorwort: 'Le {datum}, quelqu’un a mesuré un fichier sur apps.iyambae.fm et a créé ce badge.',
        kammerton: 'Diapason', sicherheit: 'Fiabilité', laenge: 'Durée du fichier',
        pruefsumme: 'Somme de contrôle (SHA-256)', gemessenAm: 'Mesuré le', bis: 'Conservé jusqu’au',
        pflichtTitel: 'Ce que ce badge dit — et ce qu’il ne dit pas',
        pflicht: 'Il dit seulement que <strong>le fichier ayant cette somme de contrôle</strong> a été mesuré à {hz} Hz le {datum}. Il ne dit <strong>pas que la vidéo</strong> ou la musique sous laquelle il figure contient le même fichier — personne ne peut le constater de l’extérieur, nous non plus. C’est une <strong>déclaration personnelle horodatée, pas une preuve.</strong>',
        nachTitel: 'Comment refaire la mesure',
        nach: 'Quiconque possède le fichier peut le refaire : ouvre <a href="/{sprache}/stimmung/">apps.iyambae.fm/stimmung/</a>, mesure le même fichier et compare la SHA-256 affichée sous le résultat avec celle ci-dessus. Si elle correspond caractère pour caractère, c’est le même fichier, et la mesure devrait donner le même diapason.',
        loeschenTitel: 'Supprimer l’entrée',
        loeschenText: 'Réservé à la personne qui a créé le badge : avec la clé de suppression affichée une seule fois à ce moment-là. L’entrée disparaît aussitôt ; la page et l’image peuvent encore venir de caches pendant cinq minutes au plus.',
        loeschenFeld: 'Clé de suppression', loeschenKnopf: 'Supprimer définitivement', loeschenOk: 'Supprimé.',
        loeschenFalsch: 'La clé ne correspond pas.', loeschenFehler: 'Cela n’a pas fonctionné. Réessaie dans un instant.',
        titelAbgelaufen: 'Cette mesure a expiré',
        textAbgelaufen: 'Les entrées sont supprimées deux ans après leur création. Ce qui figurait ici n’est plus conservé.',
        titelFehlt: 'Aucune mesure sous cet identifiant',
        textFehlt: 'Soit elle a été supprimée, soit elle n’a jamais existé.',
        eigene: 'Mesurer ton propre fichier', datenschutz: 'Confidentialité',
        bildDa: '{hz} Hz mesurés', bildZeile: '{datum} · fiabilité {prozent} % · déclaration personnelle',
        bildAbgelaufen: 'Mesure expirée', bildFehlt: 'Aucune mesure trouvée',
    },
    es: {
        abzeichen: 'Distintivo de medición', selbst: 'Declaración propia',
        titelDa: '{hz} Hz medidos',
        vorwort: 'El {datum}, alguien midió un archivo en apps.iyambae.fm y creó este distintivo.',
        kammerton: 'Diapasón', sicherheit: 'Fiabilidad', laenge: 'Duración del archivo',
        pruefsumme: 'Suma de verificación (SHA-256)', gemessenAm: 'Medido el', bis: 'Guardado hasta',
        pflichtTitel: 'Lo que dice este distintivo — y lo que no',
        pflicht: 'Solo dice que <strong>el archivo con esta suma de verificación</strong> se midió a {hz} Hz el {datum}. <strong>No dice que el vídeo</strong> o la música bajo la que aparece contenga el mismo archivo: eso no se puede determinar desde fuera, tampoco nosotros. Es una <strong>declaración propia con fecha y hora, no una prueba.</strong>',
        nachTitel: 'Cómo volver a medir',
        nach: 'Quien tenga el archivo puede comprobarlo: abre <a href="/{sprache}/stimmung/">apps.iyambae.fm/stimmung/</a>, mide el mismo archivo y compara la SHA-256 que aparece bajo el resultado con la de arriba. Si coincide carácter por carácter, es el mismo archivo, y la medición debería dar el mismo diapasón.',
        loeschenTitel: 'Borrar la entrada',
        loeschenText: 'Solo para quien creó el distintivo: con la clave de borrado que se mostró una única vez. La entrada desaparece al instante; la página y la imagen pueden seguir llegando de cachés durante cinco minutos como máximo.',
        loeschenFeld: 'Clave de borrado', loeschenKnopf: 'Borrar definitivamente', loeschenOk: 'Borrado.',
        loeschenFalsch: 'La clave no coincide.', loeschenFehler: 'No ha funcionado. Inténtalo de nuevo en un momento.',
        titelAbgelaufen: 'Esta medición ha caducado',
        textAbgelaufen: 'Las entradas se borran dos años después de crearse. Lo que había aquí ya no está guardado.',
        titelFehlt: 'Ninguna medición con este identificador',
        textFehlt: 'O se borró, o nunca existió.',
        eigene: 'Medir tu propio archivo', datenschutz: 'Privacidad',
        bildDa: '{hz} Hz medidos', bildZeile: '{datum} · fiabilidad {prozent} % · declaración propia',
        bildAbgelaufen: 'Medición caducada', bildFehlt: 'Ninguna medición encontrada',
    },
    it: {
        abzeichen: 'Badge di misurazione', selbst: 'Autodichiarazione',
        titelDa: '{hz} Hz misurati',
        vorwort: 'Il {datum} qualcuno ha misurato un file su apps.iyambae.fm e ha creato questo badge.',
        kammerton: 'Diapason', sicherheit: 'Affidabilità', laenge: 'Durata del file',
        pruefsumme: 'Checksum (SHA-256)', gemessenAm: 'Misurato il', bis: 'Conservato fino al',
        pflichtTitel: 'Che cosa dice questo badge — e che cosa no',
        pflicht: 'Dice soltanto che <strong>il file con questo checksum</strong> è stato misurato a {hz} Hz il {datum}. <strong>Non dice che il video</strong> o la musica sotto cui compare contenga lo stesso file: dall’esterno non si può stabilire, nemmeno da parte nostra. È un’<strong>autodichiarazione con data e ora, non una prova.</strong>',
        nachTitel: 'Come rifare la misura',
        nach: 'Chi ha il file può verificarlo: apri <a href="/{sprache}/stimmung/">apps.iyambae.fm/stimmung/</a>, misura lo stesso file e confronta lo SHA-256 sotto il risultato con quello qui sopra. Se coincide carattere per carattere, è lo stesso file, e la misura dovrebbe dare lo stesso diapason.',
        loeschenTitel: 'Elimina la voce',
        loeschenText: 'Solo per chi ha creato il badge: con la chiave di eliminazione mostrata una sola volta in quel momento. La voce sparisce subito; pagina e immagine possono arrivare ancora dalle cache per al massimo cinque minuti.',
        loeschenFeld: 'Chiave di eliminazione', loeschenKnopf: 'Elimina definitivamente', loeschenOk: 'Eliminato.',
        loeschenFalsch: 'La chiave non corrisponde.', loeschenFehler: 'Non ha funzionato. Riprova tra un attimo.',
        titelAbgelaufen: 'Questa misurazione è scaduta',
        textAbgelaufen: 'Le voci vengono eliminate due anni dopo la creazione. Ciò che c’era qui non è più conservato.',
        titelFehlt: 'Nessuna misurazione con questo codice',
        textFehlt: 'O è stata eliminata, o non è mai esistita.',
        eigene: 'Misura un tuo file', datenschutz: 'Privacy',
        bildDa: '{hz} Hz misurati', bildZeile: '{datum} · affidabilità {prozent} % · autodichiarazione',
        bildAbgelaufen: 'Misurazione scaduta', bildFehlt: 'Nessuna misurazione trovata',
    },
    ja: {
        abzeichen: '測定バッジ', selbst: '自己申告',
        titelDa: '{hz} Hz と測定',
        vorwort: '{datum}、だれかが apps.iyambae.fm でファイルを測定し、このバッジを作成しました。',
        kammerton: '基準ピッチ', sicherheit: '確度', laenge: 'ファイルの長さ',
        pruefsumme: 'チェックサム（SHA-256）', gemessenAm: '測定日', bis: '保存期限',
        pflichtTitel: 'このバッジが示すこと、示さないこと',
        pflicht: '示すのは、<strong>このチェックサムのファイル</strong>が {datum} に {hz} Hz と測定されたことだけです。バッジが付いている<strong>動画</strong>や音楽が同じファイルを含むことは<strong>示しません</strong>。それは外部から確かめられず、私たちにも分かりません。これは<strong>タイムスタンプ付きの自己申告であり、証明ではありません。</strong>',
        nachTitel: '自分で測り直すには',
        nach: 'ファイルを持っている人なら確かめられます。<a href="/{sprache}/stimmung/">apps.iyambae.fm/stimmung/</a> を開いて同じファイルを測定し、結果の下に表示される SHA-256 を上の値と比べてください。一文字残らず一致すれば同じファイルで、測定も同じ基準ピッチになるはずです。',
        loeschenTitel: 'このエントリを削除',
        loeschenText: 'バッジを作成した本人だけが、作成時に一度だけ表示された削除キーで削除できます。エントリはすぐに消えますが、ページと画像は最大5分間キャッシュから表示されることがあります。',
        loeschenFeld: '削除キー', loeschenKnopf: '完全に削除', loeschenOk: '削除しました。',
        loeschenFalsch: 'キーが一致しません。', loeschenFehler: 'うまくいきませんでした。少ししてからもう一度お試しください。',
        titelAbgelaufen: 'この測定は期限切れです',
        textAbgelaufen: 'エントリは作成から2年後に削除されます。ここにあった内容はもう保存されていません。',
        titelFehlt: 'このIDの測定はありません',
        textFehlt: '削除されたか、最初から存在しませんでした。',
        eigene: '自分のファイルを測定', datenschutz: 'プライバシー',
        bildDa: '{hz} Hz と測定', bildZeile: '{datum} · 確度 {prozent} % · 自己申告',
        bildAbgelaufen: '測定は期限切れ', bildFehlt: '測定が見つかりません',
    },
    ar: {
        abzeichen: 'شارة القياس', selbst: 'إفادة ذاتية',
        titelDa: 'قيس عند ⁦{hz} Hz⁩',
        vorwort: 'في {datum} قاس شخصٌ ملفًا على apps.iyambae.fm وأنشأ هذه الشارة له.',
        kammerton: 'نغمة المعايرة', sicherheit: 'درجة الثقة', laenge: 'طول الملف',
        pruefsumme: 'المجموع الاختباري (SHA-256)', gemessenAm: 'تاريخ القياس', bis: 'محفوظ حتى',
        pflichtTitel: 'ما تقوله هذه الشارة — وما لا تقوله',
        pflicht: 'تقول فقط إن <strong>الملف الذي يحمل هذا المجموع الاختباري</strong> قيس عند ⁦{hz} Hz⁩ في {datum}. <strong>ولا تقول إن الفيديو</strong> أو الموسيقى التي تظهر تحتها تحتوي على الملف نفسه — فهذا لا يمكن تبيّنه من الخارج، ولا نحن نستطيع ذلك. إنها <strong>إفادة ذاتية مع ختم زمني، وليست دليلًا.</strong>',
        nachTitel: 'كيف تعيد القياس بنفسك',
        nach: 'يستطيع من يملك الملف أن يتحقق: افتح <a href="/{sprache}/stimmung/">apps.iyambae.fm/stimmung/</a>، وقِس الملف نفسه، وقارن SHA-256 الظاهر تحت النتيجة بالقيمة أعلاه. إذا تطابق حرفًا بحرف فهو الملف نفسه، وينبغي أن يعطي القياس نغمة المعايرة نفسها.',
        loeschenTitel: 'حذف هذا الإدخال',
        loeschenText: 'لمن أنشأ الشارة فقط: بمفتاح الحذف الذي عُرض مرة واحدة عند الإنشاء. يختفي الإدخال فورًا؛ وقد تظل الصفحة والصورة تأتيان من ذاكرات التخزين المؤقت لمدة أقصاها خمس دقائق.',
        loeschenFeld: 'مفتاح الحذف', loeschenKnopf: 'حذف نهائي', loeschenOk: 'تم الحذف.',
        loeschenFalsch: 'المفتاح غير مطابق.', loeschenFehler: 'لم ينجح ذلك. حاول مرة أخرى بعد قليل.',
        titelAbgelaufen: 'انتهت صلاحية هذا القياس',
        textAbgelaufen: 'تُحذف الإدخالات بعد سنتين من إنشائها. ما كان هنا لم يعد محفوظًا.',
        titelFehlt: 'لا يوجد قياس بهذا المعرّف',
        textFehlt: 'إما أنه حُذف، أو لم يوجد قط.',
        eigene: 'قِس ملفك', datenschutz: 'الخصوصية',
        bildDa: 'قيس عند ⁦{hz} Hz⁩', bildZeile: '{datum} · الثقة {prozent} % · إفادة ذاتية',
        bildAbgelaufen: 'انتهت صلاحية القياس', bildFehlt: 'لم يُعثر على قياس',
    },
};

// ── Zahlen und Daten je Sprache ─────────────────────────────────────

/*
  `-u-nu-latn`: Arabisch bekommt westliche Ziffern, wie auf /stimmung/
  (baue-apps-sprachen.py schreibt dort `data-zahlformat`). Daten in UTC und
  ausdruecklich so beschriftet — der Dienst kennt die Zeitzone des Lesers
  nicht und soll sie nicht raten.
*/
const ort = (sprache) => sprache + '-u-nu-latn';

function hzText(a4, sprache) {
    return new Intl.NumberFormat(ort(sprache), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(a4);
}

function datumText(ms, sprache, art = 'long') {
    return new Intl.DateTimeFormat(ort(sprache), { dateStyle: art, timeZone: 'UTC' }).format(ms);
}

function zeitText(ms, sprache) {
    return new Intl.DateTimeFormat(ort(sprache), {
        dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC',
    }).format(ms) + ' UTC';
}

function laengeText(sekunden) {
    const s = Math.round(sekunden);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

const esc = (t) => String(t).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function fuelle(satz, werte) {
    return satz.replace(/\{(\w+)\}/g, (_, n) => (n in werte ? werte[n] : `{${n}}`));
}

// ── Die Seite ───────────────────────────────────────────────────────

/*
  Einbettschutz steht in der scharfen Richtlinie (`frame-ancestors 'none'`,
  server.mjs) und als X-Frame-Options von nginx — nicht ein zweites Mal
  hier, sonst kaeme die Kopfzeile doppelt.

  Das Geruest von /stimmung/ — werkzeug.css und die Schriften kommen von
  apps.iyambae.fm selbst, der Rest steht hier. KEIN Inline-Skript: Das
  Loeschen laedt /assets/lib/abzeichen-loeschen.mjs, und die scharfe
  Richtlinie dieser Antwort (server.mjs) erlaubt nur `script-src 'self'`.
*/
export function baueSeite(eintrag, sprache) {
    const t = TEXTE[sprache] ?? TEXTE.en;
    const richtung = sprache === 'ar' ? 'rtl' : 'ltr';
    let titel;
    let rumpf;

    if (eintrag.zustand === 'da') {
        const z = eintrag.zeile;
        const hz = hzText(z.a4, sprache);
        const werte = { hz: esc(hz), datum: esc(datumText(z.angelegt, sprache)), sprache };
        titel = fuelle(t.titelDa, { hz }) + ' — ' + t.abzeichen;
        rumpf = `
  <p class="eyebrow">${esc(t.abzeichen)} · ${esc(t.selbst)}</p>
  <h1>${esc(fuelle(t.titelDa, { hz }))}</h1>
  <p class="vorwort">${fuelle(esc(t.vorwort), werte)}</p>
  <table class="tabelle">
    <tr><td>${esc(t.kammerton)}</td><td>${esc(hz)} Hz</td></tr>
    <tr><td>${esc(t.sicherheit)}</td><td>${Math.round(z.sicherheit * 100)} %</td></tr>
    <tr><td>${esc(t.laenge)}</td><td>${laengeText(z.dauer)}</td></tr>
    <tr><td>${esc(t.pruefsumme)}</td><td><code class="pruefsumme">${esc(z.sha256)}</code></td></tr>
    <tr><td>${esc(t.gemessenAm)}</td><td>${esc(zeitText(z.angelegt, sprache))}</td></tr>
    <tr><td>${esc(t.bis)}</td><td>${esc(datumText(z.ablauf, sprache))}</td></tr>
  </table>
  <div class="pflicht" id="pflichtsatz">
    <h2>${esc(t.pflichtTitel)}</h2>
    <p>${fuelle(t.pflicht, werte)}</p>
  </div>
  <h2>${esc(t.nachTitel)}</h2>
  <p>${fuelle(t.nach, werte)}</p>
  <details class="loeschen">
    <summary>${esc(t.loeschenTitel)}</summary>
    <p>${esc(t.loeschenText)}</p>
    <form id="loeschen" data-kennung="${esc(eintrag.kennung)}"
          data-ok="${esc(t.loeschenOk)}" data-falsch="${esc(t.loeschenFalsch)}" data-fehler="${esc(t.loeschenFehler)}">
      <label>${esc(t.loeschenFeld)}
        <input name="schluessel" autocomplete="off" spellcheck="false" required pattern="[A-Za-z0-9_\\-]{32}" maxlength="32"></label>
      <button type="submit">${esc(t.loeschenKnopf)}</button>
      <p class="meldung" role="status" hidden></p>
    </form>
  </details>
  <script type="module" src="/assets/lib/abzeichen-loeschen.mjs"></script>`;
    } else {
        const ab = eintrag.zustand === 'abgelaufen';
        titel = ab ? t.titelAbgelaufen : t.titelFehlt;
        rumpf = `
  <p class="eyebrow">${esc(t.abzeichen)}</p>
  <h1>${esc(titel)}</h1>
  <p class="vorwort">${esc(ab ? t.textAbgelaufen : t.textFehlt)}</p>
  <p><a href="/${sprache}/stimmung/">${esc(t.eigene)}</a></p>`;
    }

    return `<!DOCTYPE html>
<html lang="${sprache}" dir="${richtung}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${esc(titel)}</title>
<link rel="icon" href="/assets/iyambae-marke.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/schrift/schriften.css">
<link rel="stylesheet" href="/assets/werkzeug.css">
<style>
.pruefsumme { word-break: break-all; font-size: .82rem; }
.pflicht { border: 1px solid var(--warm); border-radius: 3px; padding: 1rem 1.2rem; margin: 1.6rem 0; }
.pflicht h2 { margin-top: 0; font-size: 1.3rem; }
.loeschen { margin-top: 2.4rem; border-top: 1px solid var(--kante); padding-top: 1rem; color: var(--leise); }
.loeschen summary { cursor: pointer; }
.loeschen input { display: block; width: 100%; max-width: 24rem; margin: .4rem 0 .8rem; font-family: var(--daten); padding: .5rem; background: var(--grund-hoch); color: var(--text); border: 1px solid var(--kante-hell); }
.loeschen button { padding: .55rem 1.1rem; background: transparent; color: var(--text); border: 1px solid var(--warm); border-radius: 2px; cursor: pointer; }
</style>
</head>
<body>
<header class="kopfleiste"><div class="rahmen kopfleiste__inhalt">
  <a class="marke" href="/${sprache}/"><img src="/assets/iyambae-marke.svg" alt="" width="28" height="28"><span class="marke__wort">IYAMBAE <span>Tuner</span></span></a>
</div></header>
<main class="rahmen teil">${rumpf}
</main>
<footer class="fuss"><div class="rahmen fuss__reihe">
  <a href="/${sprache}/stimmung/">${esc(t.eigene)}</a>
  <nav class="fuss__wege"><a href="https://iyambae.fm/recht/datenschutz/">${esc(t.datenschutz)}</a></nav>
</div></footer>
</body>
</html>
`;
}

// ── Das Bild ────────────────────────────────────────────────────────

/*
  320 × 72, ohne Skript, ohne fremde Ressourcen, nur Systemschriften —
  ein SVG in einem <img> darf ohnehin nichts nachladen, und wer es direkt
  oeffnet, bekommt dazu die scharfe Richtlinie aus server.mjs. Der
  Regenbogen links ist derselbe wie auf der Seite.

  Arabisch: Zahl und Einheit stehen zwischen U+2066 und U+2069 (LRI/PDI),
  sonst stellt die Leserichtung „432.1 Hz" als „Hz 432.1" dar — gesehen
  am ersten Bildschirmfoto. Dieselbe Loesung wie „⁦Tuner⁩" in ar.json.

  Das Wort „Selbstauskunft" steht IM Bild, nicht nur auf der Seite dahinter:
  Das Bild ist, was unter dem Video gesehen wird. Saemi-Ra: „nirgends
  groesser darstellen, als es ist."
*/
export function baueBild(eintrag, sprache) {
    const t = TEXTE[sprache] ?? TEXTE.en;
    const rtl = sprache === 'ar';
    const x = rtl ? 304 : 18;
    const richtung = rtl ? ' direction="rtl"' : '';
    let gross;
    let klein;
    if (eintrag.zustand === 'da') {
        const z = eintrag.zeile;
        gross = fuelle(t.bildDa, { hz: hzText(z.a4, sprache) });
        klein = fuelle(t.bildZeile, {
            datum: datumText(z.angelegt, sprache, 'medium'),
            prozent: Math.round(z.sicherheit * 100),
        });
    } else {
        gross = eintrag.zustand === 'abgelaufen' ? t.bildAbgelaufen : t.bildFehlt;
        klein = t.abzeichen;
    }
    const schrift = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="72" viewBox="0 0 320 72" role="img" aria-label="${esc(gross + ' — ' + klein)}">
<title>${esc(gross + ' — ' + klein)}</title>
<defs><linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF5252"/><stop offset=".25" stop-color="#FABF33"/><stop offset=".5" stop-color="#4CD973"/><stop offset=".75" stop-color="#4C9EFA"/><stop offset="1" stop-color="#B866FA"/></linearGradient></defs>
<rect x=".5" y=".5" width="319" height="71" rx="6" fill="#121216" stroke="#38393F"/>
<rect x="${rtl ? 312 : 1}" y="1" width="7" height="70" fill="url(#r)"/>
<g font-family="${schrift}"${richtung}>
<text x="${x}" y="20" font-size="9.5" letter-spacing=".12em" fill="#4CD973">IYAMBAE · ${esc(t.abzeichen.toUpperCase())}</text>
<text x="${x}" y="44" font-size="${gross.length > 24 ? 15 : 19}" fill="#ECECF0">${esc(gross)}</text>
<text x="${x}" y="61" font-size="10" fill="#A6A7B2" textLength="${klein.length > 52 ? 286 : ''}" lengthAdjust="spacingAndGlyphs">${esc(klein)}</text>
</g>
</svg>
`.replace(' textLength="" lengthAdjust="spacingAndGlyphs"', '');
}
