/*
  Table Storage — lesen, verschmelzen, mit If-Match zurueckschreiben.

  Der Zugang laeuft ueber die verwaltete Identitaet. Das ist keine Vorliebe:
  infra/konto.bicep.entwurf setzt `allowSharedKeyAccess: false`, damit gibt
  es die Kontoschluessel gar nicht mehr. Eine Verbindungszeichenfolge wuerde
  hier also nicht bloss abgelehnt — sie existiert nicht.

  ── Warum ETag und nicht ein Schloss ────────────────────────────────

  Zwei Geraete gleichen im selben Augenblick dieselbe Merkliste ab. Wer
  zuerst schreibt, gewinnt; der zweite schreibt auf einem veralteten Stand
  und wuerde die Aenderung des ersten still ueberbuegeln. Genau das verhindert
  If-Match: Table Storage lehnt den zweiten Schreibvorgang mit 412 ab, wir
  lesen neu, verschmelzen neu, schreiben neu.

  Hoechstens drei Versuche. Wer beim vierten Mal immer noch kollidiert, hat
  kein Nebenlaeufigkeitsproblem, sondern eine Schleife im Aufrufer — und
  soll das als 409 zu sehen bekommen statt als endlose Wiederholung.

  ── Warum es einen Speicher im Arbeitsspeicher gibt ─────────────────

  Damit `node --test` ohne Azurite, ohne Anmeldung und ohne Netz laeuft. Er
  ist KEIN Betriebsmodus: server.mjs schreibt beim Start eine Warnung, wenn
  er ihn benutzt, und mit gesetztem TABELLEN_ENDPUNKT wird er nie gewaehlt.
*/

import { randomUUID, createHash } from 'node:crypto';
import { protokolliere } from './protokoll.mjs';

export class SpeicherFehler extends Error {
    constructor(art, ursache) {
        super(art);
        this.name = 'SpeicherFehler';
        this.art = art;   // 'nicht_gefunden' | 'konflikt' | 'nicht_erreichbar'
        this.ursache = ursache;
    }
}

export const TABELLE_KONTEN = 'konten';
export const TABELLE_VERWEISE = 'verweise';

/*
  Die dritte Tabelle, und sie steht mit Absicht NEBEN den beiden anderen.

  In `konten` und `verweise` haengt jede Zeile an einer Person — ueber die
  kontoId oder ueber den Abdruck einer Kennung. In `umfrage` haengt keine
  Zeile an irgendetwas: kein Konto, keine Kennung, kein Netz, kein Abdruck.

  Deshalb darf sie dort nicht hinein. Zwei Arten von Zeilen in einer Tabelle
  bekommen frueher oder spaeter ein gemeinsames Feld, ueber das sie sich
  verbinden lassen — genau so ist der Fehler entstanden, den wir bei der
  Reichweitenmessung wieder herausgenommen haben (siehe
  `assets/lib/messung.mjs`). Eine eigene Tabelle kann dieses Feld gar nicht
  erst bekommen.
*/
export const TABELLE_UMFRAGE = 'umfrage';

/*
  Die vierte und die fuenfte — die Gegenstelle der beiden Messwerkzeuge auf
  `apps.iyambae.fm` (432hz-radio#21). Begruendung und Erlaubnislisten stehen
  in `rueckmeldung.mjs`.

  ZWEI Tabellen und nicht eine, obwohl beide dasselbe Muster haben: Ein
  Hoertest und eine Messung aus derselben Sitzung duerfen nicht
  zusammenfindbar sein. Eine gemeinsame Tabelle mit einem Feld `art` laedt
  genau dazu ein — dieselbe Ueberlegung wie oben, eine Ebene tiefer.
*/
export const TABELLE_HOERTEST = 'hoertest';
export const TABELLE_STIMMUNG = 'stimmung';

/*
  Fehler, bei denen ein zweiter Versuch Sinn ergibt: Table Storage drosselt
  (503 ServerBusy), die Verbindung bricht weg, oder die Anfrage laeuft in
  ihre Zeitgrenze. Alles andere — 401, 403, 404, ein kaputter Schluessel —
  wird beim zweiten Mal genauso scheitern und kostet nur Zeit.
*/
const VORUEBERGEHEND = new Set([500, 502, 503, 504, 408]);
function istVoruebergehend(fehler) {
    if (VORUEBERGEHEND.has(fehler?.statusCode)) return true;
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ABORT_ERR', 'ERR_SOCKET_CONNECTION_TIMEOUT']
        .includes(fehler?.code);
}

const schlaf = (ms) => new Promise((f) => setTimeout(f, ms));

// ── Der Speicher im Arbeitsspeicher ─────────────────────────────────

export function speicherImArbeitsspeicher() {
    const tabellen = new Map();
    let etagZaehler = 0;
    // Fuer Tests: setzt man das, scheitert jeder Zugriff wie ein
    // aussetzender Tabellendienst.
    let stoerung = null;

    const holeTabelle = (name) => {
        if (!tabellen.has(name)) tabellen.set(name, new Map());
        return tabellen.get(name);
    };
    // \u0000 und nicht das rohe Zeichen: Als Byte in der Quelldatei
    // hielt grep, diff und mancher Editor die ganze Datei fuer binaer — und
    // fuer einen Leser war das Trennzeichen unsichtbar. Gleiche Bedeutung,
    // lesbare Datei. Ein Schluesselteil kann das Zeichen nie enthalten,
    // deshalb koennen 'ab'+'c' und 'a'+'bc' nicht kollidieren.
    const schluessel = (pk, rk) => pk + '\u0000' + rk;
    const pruefeStoerung = () => {
        if (stoerung) throw new SpeicherFehler('nicht_erreichbar', stoerung);
    };

    return {
        art: 'arbeitsspeicher',
        stoere(wert) { stoerung = wert; },

        async hole(tabelle, pk, rk) {
            pruefeStoerung();
            const zeile = holeTabelle(tabelle).get(schluessel(pk, rk));
            if (!zeile) throw new SpeicherFehler('nicht_gefunden');
            return structuredClone(zeile);
        },

        async setze(tabelle, zeile, optionen = {}) {
            pruefeStoerung();
            const etag = optionen.etag;
            const t = holeTabelle(tabelle);
            const s = schluessel(zeile.partitionKey, zeile.rowKey);
            const vorhanden = t.get(s);
            if (etag === '*' && vorhanden) throw new SpeicherFehler('konflikt');
            if (etag && etag !== '*' && vorhanden?.etag !== etag) {
                throw new SpeicherFehler('konflikt');
            }
            const neu = { ...structuredClone(zeile), etag: 'W/"' + (++etagZaehler) + '"' };
            t.set(s, neu);
            return neu.etag;
        },

        async loesche(tabelle, pk, rk) {
            pruefeStoerung();
            holeTabelle(tabelle).delete(schluessel(pk, rk));
        },

        async *liste(tabelle, pk, praefix = '') {
            pruefeStoerung();
            for (const zeile of [...holeTabelle(tabelle).values()]) {
                if (zeile.partitionKey !== pk) continue;
                if (praefix && !zeile.rowKey.startsWith(praefix)) continue;
                yield structuredClone(zeile);
            }
        },

        async *listeAlle(tabelle, filter) {
            pruefeStoerung();
            for (const zeile of [...holeTabelle(tabelle).values()]) {
                if (filter && !filter(zeile)) continue;
                yield structuredClone(zeile);
            }
        },

        async stapel(tabelle, pk, vorgaenge) {
            pruefeStoerung();
            const t = holeTabelle(tabelle);
            for (const [art, zeile] of vorgaenge) {
                const s = schluessel(pk, zeile.rowKey);
                if (art === 'delete') t.delete(s);
                else t.set(s, { ...structuredClone(zeile), partitionKey: pk, etag: 'W/"' + (++etagZaehler) + '"' });
            }
        },
    };
}

// ── Der echte Speicher ──────────────────────────────────────────────

async function baueAzure({ endpunkt, azurite }) {
    const { TableClient, odata } = await import('@azure/data-tables');

    const klienten = new Map();
    let baue;

    if (azurite) {
        /*
          Azurite oertlich. Das ist die EINZIGE Stelle im ganzen Dienst, an
          der eine Verbindungszeichenfolge vorkommt, und es ist die
          allgemein bekannte Azurite-Kennung aus der Microsoft-Doku — kein
          Geheimnis, sondern eine Konstante. Gegen Azure faellt dieser Zweig
          nie an, weil dort die Kontoschluessel abgeschaltet sind.
        */
        const kennung = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;'
            + 'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq5ZUdE1sc9dhCyaWaMi2mNTuNAX3IHNSzWvTA==;'
            + 'TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;';
        baue = (name) => TableClient.fromConnectionString(kennung, name, { allowInsecureConnection: true });
    } else {
        const { DefaultAzureCredential } = await import('@azure/identity');
        const ausweis = new DefaultAzureCredential();
        baue = (name) => new TableClient(endpunkt, name, ausweis);
    }

    const klient = (name) => {
        if (!klienten.has(name)) klienten.set(name, baue(name));
        return klienten.get(name);
    };

    /*
      Wiederholung bei voruebergehenden Fehlern. Zwei Zusatzversuche mit
      0,2 s und 0,6 s Pause — zusammen unter einer Sekunde, damit ein
      wackelnder Tabellendienst die Antwortzeit nicht ueber die Zeitgrenze
      des Browsers schiebt. Wer laenger warten will, wartet an der falschen
      Stelle: Der Aufrufer bekommt 503 mit Retry-After und darf es gleich
      selbst noch einmal versuchen.
    */
    async function mitWiederholung(tun) {
        let letzter;
        for (let versuch = 1; versuch <= 3; versuch++) {
            try {
                return await tun();
            } catch (fehler) {
                if (fehler?.statusCode === 404) throw new SpeicherFehler('nicht_gefunden', fehler);
                if (fehler?.statusCode === 412 || fehler?.statusCode === 409) throw new SpeicherFehler('konflikt', fehler);
                if (!istVoruebergehend(fehler) || versuch === 3) {
                    throw new SpeicherFehler('nicht_erreichbar', fehler);
                }
                letzter = fehler;
                protokolliere({
                    art: 'tabellen.wiederholung', dienst: 'tabellen', versuch,
                    grund: String(fehler?.statusCode ?? fehler?.code ?? ''),
                });
                await schlaf(versuch === 1 ? 200 : 600);
            }
        }
        throw new SpeicherFehler('nicht_erreichbar', letzter);
    }

    return {
        art: azurite ? 'azurite' : 'azure',

        hole: (tabelle, pk, rk) =>
            mitWiederholung(() => klient(tabelle).getEntity(pk, rk)),

        setze: (tabelle, zeile, optionen = {}) =>
            mitWiederholung(async () => {
                const etag = optionen.etag;
                if (etag === '*') {
                    // createEntity scheitert mit 409, wenn die Zeile schon da
                    // ist. Genau das wollen wir beim Anlegen eines Verweises.
                    await klient(tabelle).createEntity(zeile);
                    return undefined;
                }
                if (etag) {
                    const antwort = await klient(tabelle).updateEntity(zeile, 'Replace', { etag });
                    return antwort.etag;
                }
                const antwort = await klient(tabelle).upsertEntity(zeile, 'Replace');
                return antwort.etag;
            }),

        loesche: (tabelle, pk, rk) =>
            mitWiederholung(async () => {
                try {
                    await klient(tabelle).deleteEntity(pk, rk);
                } catch (fehler) {
                    // Schon weg ist der gewuenschte Zustand, kein Fehler.
                    if (fehler?.statusCode !== 404) throw fehler;
                }
            }),

        async *liste(tabelle, pk, praefix = '') {
            /*
              Der Bereichsfilter nutzt aus, dass ';' im Zeichensatz direkt
              hinter ':' kommt: 'sitzung:' bis 'sitzung;' fasst genau die
              Sitzungszeilen. Einen startswith-Filter kennt Table Storage
              nicht.
            */
            const filter = praefix
                ? odata`PartitionKey eq ${pk} and RowKey ge ${praefix} and RowKey lt ${naechsterPraefix(praefix)}`
                : odata`PartitionKey eq ${pk}`;
            yield* klient(tabelle).listEntities({ queryOptions: { filter } });
        },

        async *listeAlle(tabelle, _filter, odataFilter) {
            yield* klient(tabelle).listEntities(
                odataFilter ? { queryOptions: { filter: odataFilter } } : undefined);
        },

        stapel: (tabelle, pk, vorgaenge) =>
            mitWiederholung(async () => {
                /*
                  Table Storage fasst hoechstens 100 Aenderungen EINER
                  Partition zu einem Vorgang zusammen. Groessere Mengen
                  werden zerlegt — dann sind es mehrere Vorgaenge, und der
                  zweite kann scheitern. Beim Loeschen eines Kontos ist das
                  hinnehmbar: Der Aufrufer wiederholt, und das Loeschen einer
                  schon geloeschten Zeile tut nichts.
                */
                for (let i = 0; i < vorgaenge.length; i += 100) {
                    const teil = vorgaenge.slice(i, i + 100)
                        .map(([art, zeile]) => [art, { partitionKey: pk, ...zeile }]);
                    await klient(tabelle).submitTransaction(teil);
                }
            }),
    };
}

/** 'sitzung:' -> 'sitzung;' — die obere Grenze eines Praefixbereichs. */
function naechsterPraefix(praefix) {
    const letzter = praefix.charCodeAt(praefix.length - 1);
    return praefix.slice(0, -1) + String.fromCharCode(letzter + 1);
}

/**
 * Waehlt die Anbindung. Ohne TABELLEN_ENDPUNKT und ohne AZURITE bleibt nur
 * der Arbeitsspeicher — server.mjs macht daraus eine sichtbare Warnung.
 */
export async function erzeugeSpeicher(umgebung = process.env) {
    if (umgebung.AZURITE === '1') return baueAzure({ azurite: true });
    if (umgebung.TABELLEN_ENDPUNKT) return baueAzure({ endpunkt: umgebung.TABELLEN_ENDPUNKT });
    return speicherImArbeitsspeicher();
}

// ── Lesen, verschmelzen, schreiben ──────────────────────────────────

/**
 * Der Kern der Nebenlaeufigkeit: liest die Zeile, laesst `verschmelze` eine
 * neue daraus machen und schreibt sie mit If-Match zurueck. Bei 412 von
 * vorn — hoechstens dreimal, danach SpeicherFehler('konflikt'), aus dem der
 * Server ein 409 macht.
 *
 * `verschmelze` bekommt die gelesene Zeile (oder `vorgabe`, wenn es sie
 * noch nicht gibt) und gibt die zu schreibende zurueck. Gibt sie `null`
 * zurueck, wird nichts geschrieben.
 */
export async function mitEtag(speicher, tabelle, pk, rk, verschmelze, vorgabe = {}) {
    for (let versuch = 1; versuch <= 3; versuch++) {
        let alt = null;
        try {
            alt = await speicher.hole(tabelle, pk, rk);
        } catch (fehler) {
            if (fehler.art !== 'nicht_gefunden') throw fehler;
        }

        const grundlage = alt ?? { partitionKey: pk, rowKey: rk, ...vorgabe };
        const neu = await verschmelze(grundlage, alt !== null);
        if (neu === null) return { zeile: grundlage, geschrieben: false };

        neu.partitionKey = pk;
        neu.rowKey = rk;
        const { etag: _weg, ...ohneEtag } = neu;

        try {
            /*
              Neue Zeile: '*' laesst createEntity laufen und scheitert, wenn
              zwischen Lesen und Schreiben jemand anders angelegt hat.
              Bestehende Zeile: der gelesene ETag.
            */
            await speicher.setze(tabelle, ohneEtag, { etag: alt ? alt.etag : '*' });
            return { zeile: ohneEtag, geschrieben: true };
        } catch (fehler) {
            if (fehler.art !== 'konflikt' || versuch === 3) {
                if (fehler.art === 'konflikt') {
                    protokolliere({ art: 'tabellen.konflikt', ergebnis: 'fehler', versuch });
                }
                throw fehler;
            }
            // Kurz warten, sonst treffen sich beide Schreiber gleich wieder.
            await schlaf(20 * versuch + Math.floor(Math.random() * 30));
        }
    }
    throw new SpeicherFehler('konflikt');
}

// ── Konten, Kennungen, Merkliste ────────────────────────────────────

/*
  Von der Adresse zur Partition — der Umweg, den zwei Tabellen erzwingen.

  Beim Anmelden kennt der Dienst nur die Adresse. Die Partition in `konten`
  heisst aber nach der kontoId. Also steht in `verweise` eine Zeile, die
  beides verbindet.

  Als Partitionsschluessel dort steht der SHA-256 der normalisierten
  Kennung, NICHT die Adresse. Wer die Tabelle liest, kann damit nicht nach
  „wer ist bei euch angemeldet" durchsuchen, ohne die gesuchte Adresse schon
  zu kennen. Gegen einen gezielten Angriff auf eine bestimmte Person hilft
  das nicht — gegen das massenhafte Auslesen eines Adressbestands schon.
  Die Begruendung im Langen steht in infra/konto.bicep.entwurf.
*/

/**
 * Kleinschreibung und NFKC.
 *
 * Der Teil vor dem @ ist nach RFC streng genommen gross-/kleinschreibungs-
 * empfindlich. In der Praxis behandelt ihn kein nennenswerter Mailanbieter
 * so, und wer sich mit `Anna@` registriert hat und mit `anna@` wiederkommt,
 * hat keinen zweiten Account verdient, sondern seinen ersten.
 *
 * NFKC aus demselben Grund wie beim Passwort: Ein Umlaut kann in zwei
 * Formen ankommen, und zwei Formen waeren zwei Konten.
 */
export function normalisiereAdresse(mail) {
    return String(mail ?? '').trim().normalize('NFKC').toLowerCase();
}

/*
  Absichtlich grosszuegig. Diese Pruefung soll Unsinn abweisen ("hallo",
  "a@b"), nicht entscheiden, welche Adressen es geben darf — das entscheidet
  der Mailserver, und er tut es besser. Eine strenge Regel weist hier
  regelmaessig gueltige Adressen ab, und der Betroffene kann nichts dagegen
  tun.
*/
const ADRESSE_MUSTER = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
export function adresseSiehtEchtAus(mail) {
    const sauber = normalisiereAdresse(mail);
    return sauber.length <= 254 && ADRESSE_MUSTER.test(sauber);
}

export function kennungAbdruck(art, wert) {
    return createHash('sha256').update(art + ':' + wert, 'utf8').digest('hex');
}

/** Gibt die kontoId zurueck oder `null`. Wirft nur, wenn die Tabelle klemmt. */
export async function findeKonto(speicher, art, wert) {
    try {
        const zeile = await speicher.hole(TABELLE_VERWEISE, kennungAbdruck(art, wert), 'v');
        return zeile.kontoId ?? null;
    } catch (fehler) {
        if (fehler.art === 'nicht_gefunden') return null;
        throw fehler;
    }
}

/**
 * Legt ein Konto an — oder gibt das bestehende zurueck.
 *
 * Die Reihenfolge ist wichtig und nicht die naheliegende: ERST der Verweis,
 * DANN die Kontozeilen. Der Verweis wird mit If-None-Match angelegt und ist
 * damit die Stelle, an der ein Wettlauf entschieden wird — melden sich zwei
 * Anfragen im selben Augenblick mit derselben neuen Adresse an, gewinnt
 * genau eine, die andere sieht den Konflikt und liest den Gewinner.
 *
 * Andersherum entstuenden bei einem Wettlauf zwei Kontopartitionen, von
 * denen der Verweis nur auf eine zeigt. Die andere bliebe als Waise liegen
 * — mit Daten drin, ohne Weg dorthin und ohne Weg zum Loeschen.
 */
export async function holeOderLegeKontoAn(speicher, adresse, jetzt = Date.now()) {
    const sauber = normalisiereAdresse(adresse);
    const abdruck = kennungAbdruck('mail', sauber);

    const vorhanden = await findeKonto(speicher, 'mail', sauber);
    if (vorhanden) return { kontoId: vorhanden, neu: false };

    const kontoId = randomUUID().replaceAll('-', '');
    try {
        await speicher.setze(TABELLE_VERWEISE,
            { partitionKey: abdruck, rowKey: 'v', kontoId, angelegt: jetzt },
            { etag: '*' });
    } catch (fehler) {
        if (fehler.art !== 'konflikt') throw fehler;
        // Jemand war schneller. Seines gilt.
        const gewinner = await findeKonto(speicher, 'mail', sauber);
        if (gewinner) return { kontoId: gewinner, neu: false };
        throw fehler;
    }

    await speicher.stapel(TABELLE_KONTEN, kontoId, [
        ['upsert', { rowKey: 'konto', angelegt: jetzt, zuletztGesehen: new Date(jetzt).toISOString().slice(0, 10), stand: 0 }],
        ['upsert', { rowKey: 'kennung:mail', adresse: sauber, bestaetigtAm: 0 }],
    ]);

    protokolliere({ art: 'konto.angelegt', konto: kontoId, ergebnis: 'ok' });
    return { kontoId, neu: true };
}

/** Eine Zeile lesen, ohne dass „gibt es nicht" ein Fehler waere. */
export async function holeOderNichts(speicher, tabelle, pk, rk) {
    try {
        return await speicher.hole(tabelle, pk, rk);
    } catch (fehler) {
        if (fehler.art === 'nicht_gefunden') return null;
        throw fehler;
    }
}

// ── Kennungen: Anbieter, Passkeys, Mail ─────────────────────────────

/*
  Die Zeilenform steht so in infra/konto.bicep.entwurf:

      kennung:mail                die Adresse
      kennung:google:<sub>        Anbieterkennung
      kennung:apple:<sub>
      kennung:passkey:<credId>    WebAuthn-Schluessel

  Dazu je eine Zeile in `verweise`, deren Partition der Abdruck aus
  `kennungAbdruck` ist. Sie ist der EINZIGE Weg von einer Kennung zurueck zur
  kontoId — und damit die Stelle, an der ein Wettlauf entschieden wird.

  ── Warum `mail` anders aussieht als alle anderen ───────────────────

  Die Mailzeile gab es zuerst, und server.mjs liest ihre Spalten beim Namen:
  `adresse`, `bestaetigtAm`, `passwortHash`. Sie behaelt deshalb ihre flache
  Form, und ihr Wert steht in `adresse` statt im Zeilenschluessel. Wer das
  vereinheitlicht, muss drei Endpunkte und den Bestand mitnehmen.

  Alle uebrigen tragen ihre Angaben als JSON in einer Spalte `daten`. Nicht
  aus Bequemlichkeit: `transporte` eines Passkeys ist eine Liste, und Table
  Storage kennt keine Listen. Eine Spalte je WebAuthn-Feld hiesse ausserdem,
  dass jede neue Flagge eine Wanderung ueber den Bestand braucht.
*/
const KENNUNG = 'kennung:';

/*
  Was in einen RowKey darf, entscheidet Table Storage: Schraegstrich,
  Rueckstrich, Rautenzeichen, Fragezeichen und Steuerzeichen sind verboten.
  Ein `sub` von Google oder Apple und eine base64url-Schluesselkennung
  enthalten davon nichts, dieser Riegel faellt also nie — er steht hier, damit
  ein kuenftiger Aufrufer den Fehler im eigenen Dienst sieht und nicht als
  zusammenhanglose 400 von Azure.

  Absichtlich KEIN SpeicherFehler: Dessen `art` entscheidet in server.mjs
  ueber den Statuscode, und ein unbekannter Wert wuerde dort zu 503 mit
  Retry-After. Das hiesse „versuch es gleich noch einmal" fuer etwas, das beim
  naechsten Mal genauso scheitert.
*/
const WERT_VERBOTEN = /[/\\#?\u0000-\u001f\u007f-\u009f]/;

function kennungsZeile(art, wert) {
    if (typeof art !== 'string' || art === '' || art.includes(':') || WERT_VERBOTEN.test(art)) {
        throw new TypeError('Kennungsart unbrauchbar');
    }
    const text = String(wert ?? '');
    /*
      Ein leerer Wert ergibt einen gueltigen Abdruck und damit einen
      Verweis, den sich zwei Konten teilen wuerden. Das faellt erst auf,
      wenn der zweite im Konto des ersten sitzt.
    */
    if (text === '') throw new TypeError('Kennungswert unbrauchbar');

    // Die Adresse steht in der Spalte `adresse`, nicht im Zeilenschluessel —
    // was Table Storage dort verbietet, betrifft sie deshalb nicht.
    if (art === 'mail') return KENNUNG + 'mail';

    if (text.length > 512 || WERT_VERBOTEN.test(text)) {
        throw new TypeError('Kennungswert unbrauchbar');
    }
    return KENNUNG + art + ':' + text;
}

/** In beiden Tabellen dieselbe Schreibweise — die Mailadresse normalisiert. */
function kennungsWert(art, wert) {
    return art === 'mail' ? normalisiereAdresse(wert) : String(wert ?? '');
}

function kennungsSpalten(art, wert, daten = {}) {
    if (art === 'mail') return { ...daten, adresse: wert };
    return { daten: JSON.stringify(daten ?? {}) };
}

/** Aus einer Kontozeile die Kennung — oder `null`, wenn die Zeile keine ist. */
function kennungAusZeile(zeile) {
    const rowKey = String(zeile?.rowKey ?? '');
    if (!rowKey.startsWith(KENNUNG)) return null;
    const rest = rowKey.slice(KENNUNG.length);
    const trenner = rest.indexOf(':');
    const art = trenner < 0 ? rest : rest.slice(0, trenner);
    if (!art) return null;

    const { partitionKey: _p, rowKey: _r, etag: _e, timestamp: _t, ...felder } = zeile;

    if (trenner < 0) {
        /*
          Die flache Mailzeile. Der Passwort-Hash wird herausgenommen, bevor
          irgendjemand diese Kennung in der Hand haelt: `leseKennungen`
          bedient fremd.mjs und passkey.mjs, und die bauen daraus Antworten.
          Ein Geheimnis, das nur dort liegt, wo es gebraucht wird, kann auch
          nur dort danebengehen.
        */
        const { passwortHash: _h, ...ohneGeheimnis } = felder;
        const wert = ohneGeheimnis.adresse ?? null;
        return wert ? { art, wert: String(wert), daten: ohneGeheimnis } : null;
    }

    let daten = {};
    try {
        daten = felder.daten ? JSON.parse(felder.daten) : {};
    } catch {
        /*
          Eine unlesbare Zeile darf keine Anmeldung sprengen. Sie zaehlt
          weiter als Anmeldeweg — fort sind nur ihre Angaben, und die sind
          Beiwerk: Name, Zaehler, Flaggen.
        */
        protokolliere({ art: 'kennung.zeile_kaputt', ergebnis: 'fehler' });
        daten = {};
    }
    return { art, wert: rest.slice(trenner + 1), daten };
}

/** Alle Kennungen eines Kontos als `{art, wert, daten}`. */
export async function leseKennungen(speicher, kontoId) {
    const kennungen = [];
    for await (const zeile of speicher.liste(TABELLE_KONTEN, kontoId, KENNUNG)) {
        const kennung = kennungAusZeile(zeile);
        if (kennung) kennungen.push(kennung);
    }
    return kennungen;
}

/**
 * Eine Kennung an ein Konto haengen — oder ihre Angaben auffrischen.
 *
 * Erst der Verweis, dann die Zeile: dieselbe Reihenfolge und derselbe Grund
 * wie in `holeOderLegeKontoAn`. Der Verweis wird mit If-None-Match angelegt
 * und entscheidet damit den Wettlauf; andersherum entstuende eine
 * Kennungszeile, zu der kein Weg zurueckfuehrt.
 *
 * Gehoert die Kennung schon einem ANDEREN Konto, wird nichts umgehaengt,
 * sondern `konflikt` geworfen. Das ist keine Vorsicht, sondern die Regel aus
 * fremd.mjs eine Etage tiefer: Wer eine fremde Anbieterkennung eintragen
 * koennte, koennte fremde Konten uebernehmen.
 */
export async function verknuepfeKennung(speicher, kontoId, art, wert, daten = {}, jetzt = Date.now()) {
    const sauber = kennungsWert(art, wert);
    const rowKey = kennungsZeile(art, sauber);

    const besitzer = await findeKonto(speicher, art, sauber);
    if (besitzer && besitzer !== kontoId) throw new SpeicherFehler('konflikt');

    if (!besitzer) {
        try {
            await speicher.setze(TABELLE_VERWEISE,
                { partitionKey: kennungAbdruck(art, sauber), rowKey: 'v', kontoId, angelegt: jetzt },
                { etag: '*' });
        } catch (fehler) {
            if (fehler.art !== 'konflikt') throw fehler;
            // Zwischen Lesen und Schreiben war jemand schneller. Meinte er
            // dasselbe Konto, ist alles gut; sonst gehoert die Kennung ihm.
            if (await findeKonto(speicher, art, sauber) !== kontoId) throw fehler;
        }
    }

    if (art === 'mail') {
        /*
          Die Mailzeile traegt Fremdes mit: `bestaetigtAm` aus dem Einmalcode,
          `passwortHash` aus der Passwortanmeldung. Sie wird deshalb
          verschmolzen und nicht ersetzt — ein Replace loeschte hier still das
          Passwort eines Menschen, der sich gerade mit Google angemeldet hat.
        */
        await mitEtag(speicher, TABELLE_KONTEN, kontoId, rowKey,
            (zeile) => ({ ...zeile, ...daten, adresse: sauber, geaendert: jetzt }),
            { adresse: sauber, bestaetigtAm: 0 });
        return;
    }

    await speicher.setze(TABELLE_KONTEN, {
        partitionKey: kontoId,
        rowKey,
        ...kennungsSpalten(art, sauber, daten),
        geaendert: jetzt,
    });
}

/**
 * Ein neues Konto mit mehreren Kennungen auf einmal — was eine Erstanmeldung
 * ueber Google oder Apple braucht.
 *
 * OHNE Kennung ist erlaubt und kommt vor: Wer sich mit Apple anmeldet und
 * seine Adresse verbirgt, ohne dass Apple sie weiterreicht, bekommt ein Konto
 * mit nichts als der Anbieterkennung — und die Mailkennung fehlt dann ganz.
 *
 * Reisst einer der Verweise, werden die eigenen wieder weggeraeumt und der
 * Aufrufer sieht einen Konflikt. Ein halb beanspruchter Satz waere schlimmer
 * als ein misslungener Versuch: Er zeigte auf eine Partition, die es nie
 * geben wird, und die Adresse waere fuer immer vergeben.
 */
export async function legeKontoAn(speicher, { kennungen = [] } = {}, jetzt = Date.now()) {
    const kontoId = randomUUID().replaceAll('-', '');

    // Erst alles pruefen, dann schreiben — sonst haengt der Rueckbau an einem
    // Tippfehler in der vierten Kennung.
    const vorbereitet = kennungen.map((k) => {
        const wert = kennungsWert(k.art, k.wert);
        return { art: k.art, wert, rowKey: kennungsZeile(k.art, wert), daten: k.daten ?? {} };
    });

    const beansprucht = [];
    try {
        for (const k of vorbereitet) {
            const abdruck = kennungAbdruck(k.art, k.wert);
            await speicher.setze(TABELLE_VERWEISE,
                { partitionKey: abdruck, rowKey: 'v', kontoId, angelegt: jetzt },
                { etag: '*' });
            beansprucht.push(abdruck);
        }
    } catch (fehler) {
        for (const abdruck of beansprucht) {
            await speicher.loesche(TABELLE_VERWEISE, abdruck, 'v').catch(() => {});
        }
        throw fehler;
    }

    await speicher.stapel(TABELLE_KONTEN, kontoId, [
        ['upsert', {
            rowKey: 'konto', angelegt: jetzt,
            zuletztGesehen: new Date(jetzt).toISOString().slice(0, 10), stand: 0,
        }],
        ...vorbereitet.map((k) => ['upsert', {
            rowKey: k.rowKey, ...kennungsSpalten(k.art, k.wert, k.daten), geaendert: jetzt,
        }]),
    ]);

    protokolliere({ art: 'konto.angelegt', konto: kontoId, ergebnis: 'ok', anzahl: vorbereitet.length });
    return kontoId;
}

/**
 * Eine Kennung wieder loesen.
 *
 * Zeile zuerst, Verweis danach — dieselbe Richtung wie in `loescheKonto` und
 * aus demselben Grund. Bricht es dazwischen ab, zeigt der Verweis auf eine
 * Zeile, die es nicht mehr gibt; passkey.mjs erkennt genau das und meldet
 * niemanden an. Andersherum bliebe ein benutzbarer Anmeldeweg uebrig, den
 * niemand mehr loswird.
 *
 * OB geloest werden darf — der letzte Anmeldeweg darf es nicht —, entscheidet
 * fremd.mjs. Hier steht die Mechanik, nicht die Regel.
 */
export async function loescheKennung(speicher, kontoId, art, wert) {
    const sauber = kennungsWert(art, wert);
    await speicher.loesche(TABELLE_KONTEN, kontoId, kennungsZeile(art, sauber));

    // Nur den eigenen Verweis. Zeigt er woandershin, gehoert die Kennung
    // inzwischen einem anderen Konto, und der behaelt sie.
    if (await findeKonto(speicher, art, sauber) === kontoId) {
        await speicher.loesche(TABELLE_VERWEISE, kennungAbdruck(art, sauber), 'v');
    }
}

/**
 * Loescht ALLES zu einem Konto: die ganze Partition in `konten` und JEDEN
 * Verweis, der auf sie zeigt.
 *
 * Jeden, nicht nur den der Adresse. Seit es Google, Apple und Passkeys gibt,
 * haengen an einem Konto mehrere Verweiszeilen; bliebe eine davon liegen,
 * zeigte sie nach der Loeschung ins Leere — und die Anbieterkennung waere
 * fuer immer vergeben, ohne dass jemand sagen koennte, an wen. Nach Art. 17
 * DSGVO ist das die falsche Antwort.
 *
 * Der Verweis zuletzt. Bricht es dazwischen ab, zeigt er auf eine leere
 * Partition — der naechste Anmeldeversuch legt sie neu an, und niemand
 * kommt an alte Daten, weil keine mehr da sind. Andersherum — Verweis
 * zuerst — bliebe eine volle Partition ohne Weg dorthin liegen. Genau das
 * waere bei einem Loeschverlangen nach Art. 17 DSGVO die falsche Antwort.
 */
export async function loescheKonto(speicher, kontoId) {
    const zeilen = [];
    for await (const zeile of speicher.liste(TABELLE_KONTEN, kontoId)) {
        zeilen.push(zeile);
    }
    const kennungen = zeilen.map(kennungAusZeile).filter(Boolean);

    if (zeilen.length) {
        await speicher.stapel(TABELLE_KONTEN, kontoId,
            zeilen.map((z) => ['delete', { rowKey: z.rowKey, partitionKey: kontoId, etag: '*' }]));
    }
    for (const k of kennungen) {
        await speicher.loesche(TABELLE_VERWEISE, kennungAbdruck(k.art, k.wert), 'v');
    }
    protokolliere({ art: 'konto.geloescht', konto: kontoId, ergebnis: 'ok', anzahl: zeilen.length });
    return zeilen.length;
}
