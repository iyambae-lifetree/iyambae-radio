/*
  Inaktive Konten — warnen, dann loeschen.

  ── Die Regel (Entscheidung Micha, 03.11.2026; 432hz-radio#49) ──────

  Ein Konto, mit dem sich ZWEI JAHRE lang niemand angemeldet hat, wird
  geloescht. VIER WOCHEN vorher geht eine Mail an die Kontoadresse: „Dein
  Konto wird am … geloescht, wenn du dich bis dahin nicht anmeldest", mit
  einem Link zur Anmeldung. Wer sich anmeldet, setzt die Frist neu.

  Der Grund ist Art. 5 Abs. 1 lit. e DSGVO, die Speicherbegrenzung: Eine
  Merkliste, die niemand mehr ansieht, hat keinen Zweck mehr, und Daten ohne
  Zweck liegen hier nicht herum. docs/recht/HINWEISE.md, Punkt 20.

  ── Was „angemeldet" heisst ─────────────────────────────────────────

  Eine ANMELDUNG, nicht ein Besuch. Gemessen wird `letzteAnmeldung` in der
  Zeile `konto`, gesetzt von `merkeAnmeldung` — und die ruft
  `erzeugeSitzung` auf, denn jede Anmeldeart (Einmalcode, Passwort, Google,
  Apple, Passkey) endet in genau einer neuen Sitzung. Ein Weg, der eine
  Sitzung erzeugt und `letzteAnmeldung` vergisst, kann es so nicht geben.

  Wer mit einer noch gueltigen Sitzung hoert, meldet sich dabei nicht an.
  Das ist trotzdem kein Loch: Eine Sitzung lebt hoechstens
  SITZUNGSDAUER_TAGE (365), danach muss jeder neu herein. Solange die
  Inaktivitaetsfrist laenger ist als Sitzungsdauer plus Vorwarnung, bekommt
  niemand eine Warnung, dessen Sitzung noch gilt — deshalb der Riegel bei
  INAKTIV_MS unten.

  Das Feld `zuletztGesehen` gab es schon, aber es wird nur beim Anlegen
  geschrieben und danach nie wieder. Es umzudeuten hiesse, dass sein Name
  luegt; deshalb ein eigenes Feld mit dem Namen, der sagt, was es ist.

  ── Grundlast ───────────────────────────────────────────────────────

  Kein eigener Timer. Die Pruefung haengt am vorhandenen Durchgang in
  sitzung.mjs (`stosseAufraeumenAn`), der hoechstens einmal in 24 Stunden
  laeuft und nur, wenn eine echte Anfrage ihn anstoesst — Grundsatz 3 in
  server.mjs. Kommt tagelang niemand, wird tagelang nicht geprueft; dann
  wird eben spaeter gewarnt, und die Loeschung rueckt mit (siehe unten).
  Frueher als angekuendigt wird nie geloescht.
*/

import {
    TABELLE_KONTEN, mitEtag, holeOderNichts, loescheKonto,
} from './speicher.mjs';
import { protokolliere } from './protokoll.mjs';

const TAG_MS = 24 * 60 * 60 * 1000;

/*
  Dieselbe Zahl wie SITZUNGSDAUER_MS in sitzung.mjs. Hier gelesen statt
  importiert, weil sitzung.mjs diese Datei importiert — ein Kreis zwischen
  zwei Modulen, die beide beim Laden Konstanten ausrechnen, endet in einem
  Zugriff vor der Initialisierung.
*/
const SITZUNGSDAUER_MS = Number(process.env.SITZUNGSDAUER_TAGE ?? 365) * TAG_MS;

export const WARNUNG_MS = Number(process.env.INAKTIV_WARNUNG_TAGE ?? 28) * TAG_MS;

/*
  Der Riegel: Ist die Frist kuerzer als Sitzungsdauer plus Vorwarnung plus
  ein Tag, wird sie hochgesetzt. Sonst bekaeme jemand die Mail „wird
  geloescht", waehrend er mit einer gueltigen Sitzung gerade zuhoert — und
  wuerde geloescht, obwohl er nie weg war. Mit den Vorgaben (730 gegen
  365 + 28 + 1) greift der Riegel nicht.
*/
export const INAKTIV_MS = Math.max(
    Number(process.env.INAKTIV_TAGE ?? 730) * TAG_MS,
    SITZUNGSDAUER_MS + WARNUNG_MS + TAG_MS);

/*
  Hoechstens so viele Warnmails je Durchgang. Der Mailversand teilt sich 90
  Mails je Stunde mit den Anmeldecodes (mail.mjs); fuenfzig Warnungen auf
  einmal hiessen, dass sich eine Stunde lang niemand anmelden kann, weil sein
  Code in der Schlange hinter den Warnungen steht. Der Rest kommt am naechsten
  Tag dran — und verliert dabei nichts, denn die Loeschung wird ab der Mail
  gerechnet, nicht ab Tag 702.
*/
const WARNUNGEN_JE_DURCHGANG = Number(process.env.INAKTIV_WARNUNGEN_JE_LAUF ?? 20);

/*
  DER STICHTAG FUER BESTANDSKONTEN.

  Konten, die vor dieser Aenderung angelegt wurden, haben kein
  `letzteAnmeldung`. Fuer sie gilt das Anlegedatum — aber NIE frueher als
  dieser Tag, der Tag der Auslieferung. Sonst wuerde ein Konto, das jemand
  vor langer Zeit angelegt und seither mit einer Sitzung benutzt hat, beim
  ersten Durchgang sofort gewarnt und vier Wochen spaeter geloescht, ohne
  dass es dafuer je eine angekuendigte Regel gab. So beginnt fuer jedes
  Bestandskonto die Zweijahresfrist fruehestens heute; niemand wird sofort
  geloescht.

  Fest eingetragen und nicht „beim ersten Durchgang nachtragen": Das
  kostete einen Schreibvorgang je Bestandskonto und hinge davon ab, wann
  der erste Durchgang laeuft. Wird diese Fassung spaeter ausgeliefert als
  hier steht, ist das unschaedlich — die Frist laeuft dann fuer Bestandskonten
  hoechstens ein paar Tage kuerzer als zwei Jahre ab Auslieferung, aber
  nie kuerzer als zwei Jahre ab ihrer tatsaechlich letzten Anmeldung, denn
  die liegt vor der Auslieferung.
*/
export const STICHTAG = '2026-11-03';

/** Nur das Datum, wie `zuletzt` bei den Sitzungen — eine Uhrzeit waere ein Bewegungsprofil. */
function tagVon(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

function anfangDesTages(ms) {
    return Math.floor(ms / TAG_MS) * TAG_MS;
}

/**
 * Ab wann zaehlt die Stille? `letzteAnmeldung`, sonst das Anlegen, aber nie
 * vor dem Stichtag (siehe oben).
 */
export function bezugVon(konto) {
    const angemeldet = Date.parse(konto?.letzteAnmeldung ?? '');
    if (Number.isFinite(angemeldet)) return angemeldet;
    const angelegt = Number.isFinite(konto?.angelegt) ? anfangDesTages(konto.angelegt) : -Infinity;
    return Math.max(angelegt, Date.parse(STICHTAG));
}

/**
 * Bei jeder Anmeldung: Datum setzen, eine angekuendigte Loeschung streichen.
 *
 * Nur wenn sich etwas aendert — wer sich am selben Tag zweimal anmeldet,
 * kostet keinen zweiten Schreibvorgang. Gibt es die Kontozeile nicht, wird
 * sie hier NICHT angelegt: Ein Konto entsteht in speicher.mjs, nicht als
 * Nebenwirkung einer Buchfuehrung.
 */
export async function merkeAnmeldung(speicher, kontoId, jetzt = Date.now()) {
    const heute = tagVon(jetzt);
    await mitEtag(speicher, TABELLE_KONTEN, kontoId, 'konto', (zeile, gibtEs) => {
        if (!gibtEs) return null;
        if (zeile.letzteAnmeldung === heute && zeile.loeschungAm === undefined) return null;
        const { loeschungAm: _weg, ...rest } = zeile;
        return { ...rest, letzteAnmeldung: heute };
    });
}

/**
 * Der Link in der Mail. `?anmeldung=bitte` oeffnet auf der Seite das
 * Anmeldefenster (app.js, `folgeAnmeldeRueckweg`). Ohne bekannte Sprache die
 * Wurzel — die Seite waehlt dann selbst.
 */
function verweisZurAnmeldung(seite) {
    return seite + '/?anmeldung=bitte';
}

/**
 * Ein Durchgang ueber alle Konten. Laeuft aus `stosseAufraeumenAn` heraus.
 *
 * Fuer jedes Konto drei Moeglichkeiten:
 *   - noch nicht in den letzten vier Wochen der Frist: nichts.
 *   - in den letzten vier Wochen und fuer DIESE Frist noch nicht gewarnt:
 *     Mail, und `loeschungAm` am Konto merken.
 *   - gewarnt, und der angekuendigte Tag ist da: loeschen.
 *
 * „Fuer diese Frist" heisst: `loeschungAm` liegt nicht vor dem Fristende.
 * Eine Ankuendigung aus einer frueheren Frist — etwa wenn das Streichen bei
 * einer Anmeldung gescheitert ist — zaehlt nicht und wird ersetzt.
 *
 * Die Loeschung ist `loescheKonto` aus speicher.mjs, dieselbe wie
 * `DELETE /api/konto`: eine Partition, alle Verweise. Nichts Eigenes, damit
 * es keine zweite Loeschung gibt, die irgendwann etwas vergisst.
 *
 * @returns {{ gewarnt: number, geloescht: number }}
 */
export async function pruefeInaktiveKonten(speicher, {
    versender, seite, jetzt = Date.now(), hoechstens = WARNUNGEN_JE_DURCHGANG,
} = {}) {
    /*
      Ohne Versender gar nichts — auch nicht das Loeschen bereits gewarnter
      Konten. Sonst merkte sich ein Aufruf ohne Mailweg eine Ankuendigung,
      die nie verschickt wurde, und vier Wochen spaeter verschwaende ein
      Konto ungewarnt.
    */
    if (!versender) return { gewarnt: 0, geloescht: 0 };

    /*
      Erst sammeln, dann handeln: Wer waehrend des Blaetterns durch die
      Tabelle Zeilen loescht, verschiebt unter Table Storage die
      Fortsetzungsmarke. Gesammelt wird nur, was zur Entscheidung noetig ist.
      Der Filter laeuft im Tabellendienst; es kommen nur die Kontozeilen.
    */
    const konten = [];
    for await (const zeile of speicher.listeAlle(
        TABELLE_KONTEN, (z) => z.rowKey === 'konto', 'RowKey eq \'konto\'')) {
        konten.push({
            kontoId: zeile.partitionKey,
            faellig: bezugVon(zeile) + INAKTIV_MS,
            loeschungAm: Date.parse(zeile.loeschungAm ?? ''),
        });
    }

    let gewarnt = 0;
    let geloescht = 0;

    for (const { kontoId, faellig, loeschungAm } of konten) {
        if (jetzt < faellig - WARNUNG_MS) continue;

        const angekuendigt = Number.isFinite(loeschungAm) && loeschungAm >= faellig;

        if (angekuendigt) {
            if (jetzt < loeschungAm || jetzt < faellig) continue;
            /*
              Kurz vor dem Loeschen noch einmal lesen. Zwischen dem Sammeln
              oben und hier kann sich jemand angemeldet haben; dann hat
              `merkeAnmeldung` die Ankuendigung gestrichen, und genau das
              muss hier auffallen. Ein Rest an Wettlauf bleibt (Anmeldung in
              den Millisekunden zwischen diesem Lesen und dem Loeschen) —
              der ist so klein, dass ein Schloss dafuer mehr kostete als er
              rettet.
            */
            const frisch = await holeOderNichts(speicher, TABELLE_KONTEN, kontoId, 'konto');
            if (!frisch || frisch.loeschungAm === undefined) continue;
            if (jetzt < bezugVon(frisch) + INAKTIV_MS) continue;

            await loescheKonto(speicher, kontoId);
            protokolliere({ art: 'konto.inaktiv_geloescht', ergebnis: 'ok', konto: kontoId });
            geloescht++;
            continue;
        }

        if (gewarnt >= hoechstens) continue;

        /*
          Der angekuendigte Tag: das Fristende — oder, wenn spaet gewarnt
          wird, vier Wochen ab heute. Gerechnet in ganzen Tagen, weil die
          Mail einen Tag nennt und keine Uhrzeit.
        */
        const am = Math.max(faellig, anfangDesTages(jetzt) + WARNUNG_MS);
        const kennung = await holeOderNichts(speicher, TABELLE_KONTEN, kontoId, 'kennung:mail');
        const adresse = kennung?.adresse ?? null;

        /*
          Erst merken, dann einreihen. Andersherum bekaeme bei einem
          Konflikt (gleichzeitige Anmeldung) jemand eine Warnung zu einer
          Loeschung, die nicht kommt. So herum faellt im schlimmsten Fall
          eine Mail aus — und dann gilt das Folgende.

          OHNE ADRESSE wird trotzdem gemerkt, nur ohne Mail: Ein Konto, das
          nur ueber Apple mit verborgener Adresse oder nur ueber einen
          Passkey besteht, hat niemanden, dem man schreiben koennte. Es wird
          am Fristende geloescht, wie alle anderen.
        */
        const { geschrieben } = await mitEtag(speicher, TABELLE_KONTEN, kontoId, 'konto', (zeile, gibtEs) => {
            if (!gibtEs) return null;
            if (bezugVon(zeile) + INAKTIV_MS !== faellig) return null;   // inzwischen angemeldet
            return { ...zeile, loeschungAm: tagVon(am) };
        }).catch((fehler) => {
            protokolliere({ art: 'konto.inaktiv_gewarnt', ergebnis: 'fehler', konto: kontoId, grund: fehler?.art ?? 'unbekannt' });
            return { geschrieben: false };
        });
        if (!geschrieben) continue;

        if (adresse && versender) {
            versender.reiheEin({
                art: 'inaktiv', an: adresse, am: tagVon(am),
                verweis: verweisZurAnmeldung(seite),
            });
            gewarnt++;
        }
        protokolliere({
            art: 'konto.inaktiv_gewarnt', ergebnis: 'ok', konto: kontoId,
            grund: adresse ? 'mail' : 'ohne_adresse',
        });
    }

    return { gewarnt, geloescht };
}
