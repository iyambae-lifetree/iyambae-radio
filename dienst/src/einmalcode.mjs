/*
  Der sechsstellige Code aus der E-Mail — und die Marke aus dem
  Passwortlink. Beides Einmalgeheimnisse, beides mit Ablauf.

  ── Sechs Ziffern sind wenig. Deshalb die Zaehler ───────────────────

  Eine Million Moeglichkeiten klingt nach viel und ist es nicht: Wer
  ungebremst raten darf, hat den Code im Mittel nach 500.000 Versuchen, und
  500.000 HTTP-Anfragen sind eine Frage von Minuten. Was den Code sicher
  macht, ist nicht seine Laenge, sondern dass er nach FUENF Fehlversuchen
  verbrannt ist. Damit steht die Trefferwahrscheinlichkeit bei 5 zu 1.000.000
  je zugestellter Mail — und wer eine neue Mail anfordert, laeuft in die
  Ratenbegrenzung.

  ── Warum die Zeile nicht nach dem Code heisst ──────────────────────

  infra/konto.bicep.entwurf skizziert `code:<abdruck>` als Zeilenschluessel.
  Hier steht `code:<zweck>`, und das ist eine bewusste Abweichung vom
  Entwurf, kein Versehen.

  Der Grund ist der Versuchszaehler. Steht der Code IM Schluessel, findet ein
  FALSCHER Code die Zeile nicht — und dann gibt es nichts, woran man
  hochzaehlen koennte. Der Zaehler waere nicht bloss unbequem zu bauen, er
  waere unmoeglich, und die Fuenf-Versuche-Regel damit auch. Also traegt die
  Zeile den Zweck im Schluessel und den Abdruck als Feld.

  Das Praefix `code:` bleibt erhalten, damit der Bereichsdurchgang aus dem
  Entwurf (`RowKey ge 'code:' and RowKey lt 'code;'`) weiter greift.

  Nebenwirkung, und sie ist erwuenscht: Es gibt hoechstens EINEN gueltigen
  Code je Zweck und Konto. Wer einen neuen anfordert, macht den alten
  ungueltig — sonst sammelten sich bei jedem Klick auf „nochmal senden"
  weitere gueltige Codes an, und aus fuenf Rateversuchen wuerden fuenf mal
  soundsoviele.

  ── Was der Abdruck wirklich schuetzt, und was nicht ────────────────

  Gespeichert wird SHA-256 von `kontoId + ':' + code`, nie der Code. EHRLICH
  DAZUGESAGT: Wer die Tabelle lesen kann, kennt die kontoId — er steht ja in
  derselben Zeile — und kann eine Million Hashes in unter einer Sekunde
  durchrechnen. Der Abdruck schuetzt also NICHT gegen jemanden mit
  Lesezugriff auf die Tabelle.

  Wogegen er schuetzt: gegen das Versehen. Gegen einen Code, der in einer
  Fehlermeldung, in einer Datenausfuhr, in einem Speicherabbild oder auf dem
  Bildschirm einer Verwalterin landet. Das ist der Fall, der eintritt.
*/

import { randomInt, createHash } from 'node:crypto';
import { mitEtag, TABELLE_KONTEN } from './speicher.mjs';
import { gleichOhneZeitverrat } from './passwort.mjs';

export const GUELTIG_MS = Number(process.env.CODE_GUELTIG_MINUTEN ?? 10) * 60 * 1000;
export const HOECHSTENS_VERSUCHE = Number(process.env.CODE_VERSUCHE ?? 5);

const ZEILE = (zweck) => 'code:' + zweck;

/**
 * Sechs Ziffern aus crypto.randomInt.
 *
 * NICHT Math.random: Das ist ein xorshift128+, dessen Zustand sich aus
 * wenigen Ausgaben rekonstruieren laesst. Wer ein paar Codes gesehen hat
 * — etwa fuer eigene Konten —, koennte die folgenden vorhersagen.
 *
 * randomInt(0, 1000000) und nicht `randomBytes % 1000000`: Der Modulo waere
 * verzerrt, weil 2^32 kein Vielfaches von einer Million ist. randomInt
 * verwirft ueberzaehlige Ziehungen und ist gleichverteilt.
 */
export function erzeugeCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function abdruckVonCode(kontoId, code) {
    return createHash('sha256').update(kontoId + ':' + String(code), 'utf8').digest('hex');
}

/**
 * Legt einen Code an und gibt ihn im Klartext zurueck — genau einmal, an
 * den Aufrufer, der ihn in die Mail schreibt. Danach existiert er nirgends
 * mehr ausser im Postfach des Empfaengers.
 */
export async function legeCodeAn(speicher, kontoId, zweck = 'anmeldung', jetzt = Date.now()) {
    const code = erzeugeCode();
    await speicher.setze(TABELLE_KONTEN, {
        partitionKey: kontoId,
        rowKey: ZEILE(zweck),
        abdruck: abdruckVonCode(kontoId, code),
        ablauf: jetzt + GUELTIG_MS,
        angelegt: jetzt,
        versuche: 0,
    });
    return { code, ablauf: jetzt + GUELTIG_MS };
}

/**
 * Prueft und verbraucht.
 *
 * Der Zaehler wird VOR dem Vergleich hochgesetzt, und zwar mit If-Match.
 * Andersherum liesse sich die Grenze aushebeln: Fuenfhundert gleichzeitige
 * Anfragen laesen alle denselben Zaehlerstand, verglichen wuerde
 * fuenfhundertmal, und geschrieben am Ende eine Vier. Mit If-Match gewinnt
 * genau einer, die anderen laufen in den Wiederholungsweg und sehen den
 * erhoehten Stand.
 *
 * @returns {{ok: boolean, grund?: string, uebrig?: number}}
 */
export async function pruefeCode(speicher, kontoId, code, zweck = 'anmeldung', jetzt = Date.now()) {
    if (!/^[0-9]{6}$/.test(String(code ?? ''))) {
        /*
          Formfehler zaehlen NICHT gegen die fuenf Versuche. Sonst koennte
          ein Angreifer den Code eines anderen mit fuenf Anfragen voller
          Unsinn verbrennen, ohne ihn je zu kennen — eine Sperre, die man
          gegen Fremde ausloesen kann, ist eine Waffe.
        */
        return { ok: false, grund: 'form' };
    }

    let zustand = { ok: false, grund: 'kein_code' };

    try {
        await mitEtag(speicher, TABELLE_KONTEN, kontoId, ZEILE(zweck), (zeile, gefunden) => {
            if (!gefunden) {
                zustand = { ok: false, grund: 'kein_code' };
                return null;
            }
            if (!(zeile.ablauf > jetzt)) {
                zustand = { ok: false, grund: 'abgelaufen' };
                return { ...zeile, ablauf: 0, versuche: HOECHSTENS_VERSUCHE };
            }
            const versuche = (zeile.versuche ?? 0) + 1;
            if (versuche > HOECHSTENS_VERSUCHE) {
                zustand = { ok: false, grund: 'zu_oft' };
                return { ...zeile, ablauf: 0, versuche };
            }
            if (gleichOhneZeitverrat(zeile.abdruck, abdruckVonCode(kontoId, code))) {
                zustand = { ok: true };
                // Verbraucht heisst weg. Ein zweites Mal geht nicht.
                return { ...zeile, ablauf: 0, versuche, verbraucht: true };
            }
            zustand = { ok: false, grund: 'falsch', uebrig: HOECHSTENS_VERSUCHE - versuche };
            return { ...zeile, versuche };
        });
    } catch (fehler) {
        if (fehler.art === 'nicht_gefunden') return { ok: false, grund: 'kein_code' };
        throw fehler;
    }

    /*
      Aufgebraucht, abgelaufen oder eingeloest: die Zeile verschwindet. Erst
      schreiben, dann loeschen — waere die Reihenfolge umgekehrt und der
      Loeschvorgang misslaenge, staende ein gueltiger Code ohne Zaehler da.
      So bleibt im schlechtesten Fall eine Zeile mit `ablauf: 0` liegen, und
      die ist harmlos: Sie faellt beim naechsten Vergleich durch und beim
      naechsten Aufraeumen weg.
    */
    if (zustand.ok || zustand.grund === 'zu_oft' || zustand.grund === 'abgelaufen') {
        await speicher.loesche(TABELLE_KONTEN, kontoId, ZEILE(zweck)).catch(() => {});
    }

    return zustand;
}

// ── Marken fuer den Passwortlink ────────────────────────────────────

/*
  Eine Marke ist der Wert hinter dem Link in „Passwort vergessen". Sie muss
  das Konto ALLEIN benennen koennen — anders als beim Code steht daneben
  kein Formular, in das jemand seine Adresse getippt hat.

      <kontoId>.<32 zufaellige Bytes, base64url>

  Kein Zaehler, keine fuenf Versuche: 32 Zufallsbytes raet niemand. Die
  Frist ist mit einer Stunde deutlich kuerzer als beim Code, weil ein Link
  im Postfach liegen bleibt — und ein Postfach wechselt manchmal den
  Besitzer.

  Nach Gebrauch weg, und das ist wichtiger als beim Code: Wer ein Passwort
  zuruecksetzt, hat den Link oft noch im Verlauf. Ein zweiter Klick darf
  nicht ein zweites Mal funktionieren.
*/
export const MARKE_GUELTIG_MS = Number(process.env.MARKE_GUELTIG_MINUTEN ?? 60) * 60 * 1000;
const MARKENZEILE = (zweck) => 'marke:' + zweck;

export async function legeMarkeAn(speicher, kontoId, zweck = 'passwort', jetzt = Date.now()) {
    const { randomBytes } = await import('node:crypto');
    const geheimnis = randomBytes(32).toString('base64url');
    await speicher.setze(TABELLE_KONTEN, {
        partitionKey: kontoId,
        rowKey: MARKENZEILE(zweck),
        abdruck: createHash('sha256').update(geheimnis, 'utf8').digest('hex'),
        ablauf: jetzt + MARKE_GUELTIG_MS,
        angelegt: jetzt,
    });
    return kontoId + '.' + geheimnis;
}

/**
 * Prueft eine Marke und verbraucht sie.
 *
 * Zurueck kommt die PARTITION, in der die Marke lag — nicht zwingend eine
 * kontoId. Der Aufrufer muss den Unterschied kennen: Bei einer Marke aus
 * „Passwort vergessen" ist es der Abdruck der Adresse, und der Weg zum
 * Konto fuehrt von dort ueber die Tabelle `verweise`. Genau dort faellt
 * dann auch auf, wenn es gar kein Konto gibt.
 *
 * @returns {{ok: boolean, partition?: string, grund?: string}}
 */
export async function loeseMarkeEin(speicher, marke, zweck = 'passwort', jetzt = Date.now()) {
    if (typeof marke !== 'string') return { ok: false, grund: 'form' };
    const trenner = marke.indexOf('.');
    if (trenner <= 0) return { ok: false, grund: 'form' };

    const partition = marke.slice(0, trenner);
    const geheimnis = marke.slice(trenner + 1);
    /*
      32 ODER 64 Hexzeichen. Beides kommt vor, und der Unterschied ist der
      Grund, warum /api/passwort/vergessen nichts verraet:

        32  eine kontoId
        64  der Abdruck einer Adresse

      Marken aus „Passwort vergessen" tragen IMMER die zweite Form — auch
      dann, wenn es zu der Adresse ein Konto gibt. Nur so ist der
      Schreibvorgang derselbe, ob das Konto existiert oder nicht. Waere hier
      bloss die kontoId erlaubt, gaebe es fuer unbekannte Adressen keine
      Marke, und das Ausbleiben der Marke waere die Antwort.
    */
    if (!/^([0-9a-f]{32}|[0-9a-f]{64})$/.test(partition) || geheimnis.length < 32) {
        return { ok: false, grund: 'form' };
    }

    let zeile;
    try {
        zeile = await speicher.hole(TABELLE_KONTEN, partition, MARKENZEILE(zweck));
    } catch (fehler) {
        if (fehler.art === 'nicht_gefunden') return { ok: false, grund: 'verbraucht' };
        throw fehler;
    }

    const abdruck = createHash('sha256').update(geheimnis, 'utf8').digest('hex');
    if (!gleichOhneZeitverrat(zeile.abdruck, abdruck)) return { ok: false, grund: 'verbraucht' };
    if (!(zeile.ablauf > jetzt)) {
        await speicher.loesche(TABELLE_KONTEN, partition, MARKENZEILE(zweck)).catch(() => {});
        return { ok: false, grund: 'abgelaufen' };
    }

    await speicher.loesche(TABELLE_KONTEN, partition, MARKENZEILE(zweck));
    return { ok: true, partition };
}
