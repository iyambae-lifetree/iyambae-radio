/*
  Der Anmeldedienst — HTTP, Weiche, Fehlerbehandlung.

  Er laeuft als zweiter Container NEBEN nginx in derselben Replik und hoert
  auf 127.0.0.1:8081. Von aussen kommt nichts direkt an ihn heran; nginx
  reicht /api/ weiter (siehe den Block „NOCH ZU TUN" in
  infra/konto.bicep.entwurf).

  Kein Framework. node:http kann alles, was hier gebraucht wird, und jede
  Abhaengigkeit an dieser Stelle waere eine, die man bei jeder
  Sicherheitsmeldung pruefen muesste — fuer Code, den man in zweihundert
  Zeilen selbst schreibt und dann auch versteht.

  ── Die drei Regeln, die dieser Datei ihre Form geben ───────────────

  1. KEINE ANTWORT VERRAET, OB EINE ADRESSE BEKANNT IST — auch nicht ueber
     ihre DAUER. Die Endpunkte /api/anmelden und /api/passwort/vergessen tun
     fuer eine unbekannte Adresse EXAKT dieselbe Arbeit wie fuer eine
     bekannte: dieselben Tabellenzugriffe, dieselbe Mail, dieselbe Anzahl
     Schreibvorgaenge. Nicht „aehnlich viel" — dieselbe. Wo das nicht ganz
     geht, kommt `aufBoden` dazu und quantisiert die Dauer.

  2. EIN AUSFALL DARF NICHT DAS RADIO MITREISSEN. Beide Container teilen sich
     0,5 GiB. Ein unbegrenzter Argon2-Ansturm faende hier sein Ende als
     OOM-Kill der GANZEN Replik. Deshalb die Schranke in passwort.mjs und
     deshalb 503 statt „wir versuchen es trotzdem".

  3. KEINE GRUNDLAST IM LEERLAUF. Kein Timer im Sekundentakt, keine
     Abfrageschleife, kein Aufwaermen. Die Leerlaufabrechnung von Container
     Apps gilt unter 0,01 vCPU UND unter 1.000 Byte je Sekunde; wer sie
     reisst, zahlt 12,88 statt 4,29 Euro im Monat. Aufgeraeumt wird
     beilaeufig, angestossen von einer echten Anfrage.
*/

import http from 'node:http';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { protokolliere, protokolliereFehler } from './protokoll.mjs';
import {
    erzeugeSpeicher, mitEtag, holeOderNichts, SpeicherFehler,
    TABELLE_KONTEN, TABELLE_VERWEISE,
    normalisiereAdresse, adresseSiehtEchtAus, kennungAbdruck,
    findeKonto, holeOderLegeKontoAn, loescheKonto,
    legeKontoAn, verknuepfeKennung, leseKennungen, loescheKennung,
} from './speicher.mjs';
import {
    pruefeSitzung, erzeugeSitzung, widerrufe, widerrufeAlle,
    baueSitzungsPlaetzchen, baueLoeschPlaetzchen, liesPlaetzchen,
    stosseAufraeumenAn, raeumeKonto,
} from './sitzung.mjs';
import { legeCodeAn, pruefeCode, legeMarkeAn, loeseMarkeEin, GUELTIG_MS, MARKE_GUELTIG_MS } from './einmalcode.mjs';
import { pruefe as pruefePasswort, hashe, pruefeNeuesPasswort, bereiteVor, UeberlastFehler } from './passwort.mjs';
import { erzeugeVersender } from './mail.mjs';
import {
    saeubereEintraege, verschmelzePlatten, nurDrin, raeumeGrabsteine, beschneide,
    saeubereVerlauf, verschmelzeVerlauf,
} from './abgleich.mjs';
import { erzeugeFremdanmeldung } from './fremd.mjs';

const PORT = Number(process.env.PORT ?? 8081);
const HOECHSTER_KOERPER = Number(process.env.HOECHSTER_KOERPER ?? 32 * 1024);
const GRABSTEIN_TAGE = Number(process.env.GRABSTEIN_TAGE ?? 90);
const ERLAUBTE_URSPRUENGE = String(process.env.ERLAUBTE_URSPRUENGE ?? 'https://iyambae.fm,https://www.iyambae.fm')
    .split(',').map((s) => s.trim()).filter(Boolean);
const SEITE = ERLAUBTE_URSPRUENGE[0] ?? 'https://iyambae.fm';

const schlaf = (ms) => new Promise((f) => setTimeout(f, ms));

// ── Zeitboden gegen das Ausrechnen von Adressen ─────────────────────

/*
  Warum ein Boden allein nicht reicht, und was hier stattdessen passiert.

  Ein fester Boden („antworte nie vor 250 ms") funktioniert, solange die
  echte Arbeit immer darunter bleibt. Tut sie das nicht — Table Storage
  haengt gerade, die Schranke ist voll —, ragt die Arbeit darueber hinaus,
  und der Unterschied zwischen bekannt und unbekannt ist wieder messbar. Ein
  Angreifer muss dafuer nur Last erzeugen; das kann er.

  Deshalb wird die Dauer auf ein VIELFACHES des Bodens aufgerundet. Dauert
  die Arbeit 40 ms, wird bei 250 geantwortet; dauert sie 260, bei 500. Der
  Unterschied zwischen zwei Faellen verschwindet, solange er kleiner ist als
  ein Boden — und das ist er, denn er ist ein Tabellenzugriff.

  DER PREIS steht ehrlich im README: Jede Anmeldeanfrage haelt eine
  Verbindung mindestens 250 ms offen. Bei 0,25 vCPU ist das kein
  Rechenaufwand, nur Wartezeit, aber es begrenzt die gleichzeitigen
  Anmeldungen.
*/
const BODEN_MS = Number(process.env.ANTWORT_BODEN_MS ?? 250);

async function aufBoden(start, boden = BODEN_MS) {
    if (boden <= 0) return;
    const verbraucht = Date.now() - start;
    const ziel = Math.ceil(Math.max(verbraucht, 1) / boden) * boden;
    if (ziel > verbraucht) await schlaf(ziel - verbraucht);
}

// ── Ratenbegrenzung ─────────────────────────────────────────────────

/*
  Drei Achsen, weil eine allein jedes Mal an derselben Stelle bricht:

    JE ADRESSE   haelt jemanden auf, der eine einzelne Adresse mit Codes
                 bombardiert oder ihr Passwort raet — auch wenn er dabei
                 tausend IP-Adressen benutzt.
    JE NETZ      haelt jemanden auf, der von einem Anschluss aus tausend
                 Adressen durchprobiert.
    GLOBAL       ist die Notbremse. Sie schuetzt nicht einzelne Konten,
                 sondern den Container: Sie ist die Zahl, unter der der
                 Mailversand und die Argon2-Schranke nicht kippen.

  DIE ZAEHLER LIEGEN IM ARBEITSSPEICHER. Bei einem Neustart sind sie weg.
  Das ist hinnehmbar und gehoert benannt: Eine Replik startet selten, und
  ein Angreifer kann Neustarts nicht ausloesen. Die Alternative — Zaehler in
  Table Storage — kostete einen Schreibvorgang je Anfrage und schuefe genau
  die Grundlast, die Regel 3 verbietet.

  ZWEITE EHRLICHE EINSCHRAENKUNG: Bei mehr als einer Replik zaehlt jede fuer
  sich. Aus fuenf Versuchen je Minute werden dann fuenf JE REPLIK. main.bicep
  laesst bis zu drei zu. Solange nginx davor mit `limit_req` seine eigene
  Grenze zieht (die gilt je Replik genauso), ist das die vorhandene, nicht
  die gewuenschte Lage — es steht als offener Punkt im README.
*/
export function erzeugeDrossel({ hoechstensSchluessel = 20_000, uhr = Date.now } = {}) {
    const eimer = new Map();

    function hole(schluessel, erlaubt, fensterMs, nun) {
        let e = eimer.get(schluessel);
        if (!e) {
            /*
              Obergrenze fuer die Anzahl der Eimer. Ohne sie waere die
              Drossel selbst der Angriffsweg: eine Million erfundener
              Adressen sind eine Million Eintraege, und der Container ist
              voll. Geworfen wird der am laengsten unberuehrte.
            */
            if (eimer.size >= hoechstensSchluessel) {
                let aeltester = null;
                let aeltesteZeit = Infinity;
                for (const [k, v] of eimer) {
                    if (v.letzte < aeltesteZeit) { aeltesteZeit = v.letzte; aeltester = k; }
                }
                if (aeltester !== null) eimer.delete(aeltester);
            }
            e = { marken: erlaubt, letzte: nun };
            eimer.set(schluessel, e);
        }
        // Nachfuellen nach verstrichener Zeit, nicht in Schritten: Ein
        // Zeitfenster mit harter Kante laesst am Fensterwechsel die doppelte
        // Menge durch.
        const zuwachs = ((nun - e.letzte) / fensterMs) * erlaubt;
        e.marken = Math.min(erlaubt, e.marken + zuwachs);
        e.letzte = nun;
        return e;
    }

    return {
        groesse: () => eimer.size,

        /**
         * @param {Array<[string,string,number,number]>} achsen
         *        [name, schluessel, erlaubt, fensterMs]
         * @returns {{ok: boolean, achse?: string, sekunden?: number}}
         */
        pruefe(achsen) {
            const nun = uhr();
            const eimerchen = achsen.map(([name, s, erlaubt, fenster]) =>
                [name, hole(s, erlaubt, fenster, nun), erlaubt, fenster]);

            // Erst alle pruefen, dann alle abbuchen. Sonst verbraucht eine
            // abgelehnte Anfrage noch Marken auf den Achsen davor.
            for (const [name, e, erlaubt, fenster] of eimerchen) {
                if (e.marken >= 1) continue;
                const sekunden = Math.max(1, Math.ceil(((1 - e.marken) * fenster) / erlaubt / 1000));
                return { ok: false, achse: name, sekunden };
            }
            for (const [, e] of eimerchen) e.marken -= 1;
            return { ok: true };
        },
    };
}

/*
  Die volle Adresse des Besuchers wird NIE gespeichert — auch nicht in einem
  Drosselzaehler, denn ein Zaehler ist ein Speicher.

  DIE ZEILE, AUF DIE ES ANKOMMT, IST DIE LETZTE: X-Forwarded-For ist eine
  Liste, und der Browser darf sie selbst mitschicken. Der Ingress von
  Container Apps HAENGT die echte Adresse HINTEN AN. Wer den ersten Eintrag
  nimmt, drosselt also nach einem Wert, den der Angreifer bei jeder Anfrage
  frei erfindet — die Begrenzung waere eine Zierde. Der letzte Eintrag ist
  der, den die Plattform selbst geschrieben hat.

  ACHTUNG, OFFENER PUNKT: deploy/nginx.conf nimmt in der Karte `$besucher`
  den ERSTEN Eintrag. Fuer das Protokoll ist das eine Ungenauigkeit, hier
  waere es ein Loch. Steht im README.
*/
export function netzVon(kopfzeile) {
    const teile = String(kopfzeile ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const adresse = teile[teile.length - 1] ?? '';
    const v4 = adresse.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
    if (v4) return v4[1] + '.0';                      // /24, wie im nginx-Protokoll
    const v6 = adresse.match(/^([0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}):/);
    if (v6) return v6[1] + '::';                      // /32, der Rest ist das Geraet
    return 'unbekannt';
}

/** Ein Drosselschluessel aus der Adresse, ohne die Adresse zu behalten. */
function adressSchluessel(adresse) {
    return createHash('sha256').update('drossel:' + adresse, 'utf8').digest('hex').slice(0, 24);
}

// ── Anfrage und Antwort ─────────────────────────────────────────────

class HttpFehler extends Error {
    constructor(status, grund, zusatz = {}) {
        super(grund);
        this.status = status;
        this.grund = grund;
        this.zusatz = zusatz;
    }
}

async function liesKoerper(anfrage) {
    let laenge = 0;
    const stuecke = [];
    for await (const stueck of anfrage) {
        laenge += stueck.length;
        if (laenge > HOECHSTER_KOERPER) {
            /*
              Aufhoeren zu lesen, aber NICHT die Verbindung wegwerfen.
              nginx begrenzt mit client_max_body_size schon auf 32k; der
              Dienst darf sich trotzdem nicht darauf verlassen, denn er
              hoert auf 127.0.0.1 und wer je im selben Netzwerknamensraum
              steht, kommt an nginx vorbei.

              GEMESSEN, und es war der Unterschied zwischen einer Antwort
              und keiner: Mit `anfrage.destroy()` an dieser Stelle bekam der
              Aufrufer ECONNRESET statt 413 — die Antwort war geschrieben,
              aber der Sockel schon tot. Also nur pausieren; das Abraeumen
              uebernimmt die Fehlerbehandlung, nachdem die 413 draussen ist.
            */
            anfrage.pause();
            throw new HttpFehler(413, 'zu_gross');
        }
        stuecke.push(stueck);
    }
    if (!laenge) return {};
    try {
        const wert = JSON.parse(Buffer.concat(stuecke).toString('utf8'));
        if (!wert || typeof wert !== 'object' || Array.isArray(wert)) throw new Error('kein Objekt');
        return wert;
    } catch {
        throw new HttpFehler(400, 'kein_json');
    }
}

function antworte(res, status, koerper, kopf = {}) {
    const kopfzeilen = {
        // Doppelt gemoppelt mit nginx, und das mit Absicht: Eine Merkliste,
        // die in einem Firmenproxy landet, sammelt man nicht wieder ein.
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        ...kopf,
    };
    if (koerper === null || koerper === undefined) {
        res.writeHead(status, kopfzeilen);
        res.end();
        return;
    }
    const text = typeof koerper === 'string' ? koerper : JSON.stringify(koerper);
    kopfzeilen['Content-Type'] = kopfzeilen['Content-Type'] ?? 'application/json; charset=utf-8';
    kopfzeilen['Content-Length'] = Buffer.byteLength(text);
    res.writeHead(status, kopfzeilen);
    res.end(text);
}

/*
  Herkunftspruefung.

  SameSite=Lax deckt den klassischen Fall schon ab: Ein fremdes Formular,
  das hierher postet, bekommt das Plaetzchen nicht mit. Diese Pruefung ist
  die zweite Reihe — fuer den Tag, an dem ein Browser Lax anders auslegt,
  oder jemand die Seite in einen Rahmen setzt.

  Fehlt der Origin-Kopf ganz, wird abgelehnt. Browser schicken ihn bei jedem
  POST. Wer ihn nicht schickt, ist kein Browser — und dieser Dienst hat
  keine anderen Nutzer. Wer doch welche braucht (ein Skript, ein Test),
  setzt HERKUNFT_LOCKER=1 und weiss, was er tut.
*/
function pruefeHerkunft(anfrage) {
    if (process.env.HERKUNFT_LOCKER === '1') return;
    const herkunft = anfrage.headers.origin;
    if (!herkunft) throw new HttpFehler(403, 'herkunft_fehlt');
    if (!ERLAUBTE_URSPRUENGE.includes(herkunft)) throw new HttpFehler(403, 'herkunft_fremd');
}

// ── Das Zwischenstueck zur Fremdanmeldung ───────────────────────────

/*
  fremd.mjs, google.mjs, apple.mjs und passkey.mjs sind gegen eine
  abgesprochene Schnittstelle gebaut worden: Methodenobjekte `speicher`,
  `sitzung`, `protokoll`. Der Kern hier ist parallel entstanden und
  exportiert freie Funktionen mit `speicher` als erstem Argument.

  Das ist kein Fehler auf einer der beiden Seiten, sondern die Naht, an der
  zwei gleichzeitig gebaute Haelften aufeinandertreffen — und sie wird genau
  hier geschlossen, an einer Stelle, nicht in vier Dateien verstreut.
  FREMDANMELDUNG.md 0.3 hat die Umrechnung Zeile fuer Zeile.

  `erzeugeFremdanmeldung` laedt google.mjs, apple.mjs und passkey.mjs traege
  nach, deshalb ist es asynchron und deshalb steht es hier und nicht in
  `baueDienst`: Gebaut wird beim Start, einmal.

  Die fuenf Speichermethoden stehen als eigene Funktion daneben, damit ein
  Test genau das pruefen kann, was der Betrieb benutzt — und nicht eine
  Attrappe, die ihm aehnlich sieht.
*/
export function speicherSchnittstelle(speicher) {
    return {
        findeKontoUeberKennung: (art, wert) => findeKonto(speicher, art, wert),
        legeKontoAn: ({ kennungen }) => legeKontoAn(speicher, { kennungen }),
        verknuepfeKennung: (kontoId, art, wert, daten) =>
            verknuepfeKennung(speicher, kontoId, art, wert, daten),
        leseKennungen: (kontoId) => leseKennungen(speicher, kontoId),
        loescheKennung: (kontoId, art, wert) => loescheKennung(speicher, kontoId, art, wert),
    };
}

export async function baueFremdanmeldung(speicher, zusatz = {}) {
    return erzeugeFremdanmeldung({
        speicher: speicherSchnittstelle(speicher),
        sitzung: {
            async erzeuge(kontoId) {
                const { wert } = await erzeugeSitzung(speicher, kontoId);
                /*
                  Ein fertiger Set-Cookie-Kopf, kein blosser Wert:
                  `plaetzchenKopf` in fremd.mjs erkennt ihn am Semikolon und
                  uebernimmt ihn unveraendert. So gelten fuer die
                  Fremdanmeldung dieselben Plaetzchenregeln wie fuer den
                  Einmalcode — auch PLAETZCHEN_UNSICHER=1.
                */
                return { plaetzchen: baueSitzungsPlaetzchen(wert), ablauf: null };
            },
            async pruefe(anfrage) {
                const stand = await pruefeSitzung(speicher, liesPlaetzchen(anfrage.headers.cookie));
                return stand?.kontoId ?? null;
            },
        },
        protokoll: {
            /*
              Zwei Argumente werden zu einem Objekt, und `kontoId` heisst in
              der Erlaubnisliste von protokoll.mjs `konto`. Alles, was hier
              nicht ausdruecklich durchgereicht wird, faellt weg — und das
              ist die Absicht: Was ein Aufrufer sonst noch mitgibt, hat im
              Protokoll nichts verloren.
            */
            schreib: (art, { kontoId, ergebnis, anbieter } = {}) =>
                protokolliere({ art, konto: kontoId, ergebnis, anbieter }),
        },
        ...zusatz,
    });
}

/*
  Drosselung der Fremdanmeldung.

  Ohne sie sind diese Wege ein kostenloser Hebel gegen Google und Apple:
  Jeder Start ist eine Anfrage, die wir dort verursachen, ohne dass jemand
  angemeldet sein muss. konto.bicep.entwurf zieht in nginx dieselbe Grenze
  ein zweites Mal; hier steht sie, weil der Dienst auf 127.0.0.1 hoert und
  wer im selben Namensraum steht, an nginx vorbeikommt.

  Die Zahlen sind KEINE neuen. Ein Anbieterstart ist eine Anmeldung, nur bei
  jemand anderem, und bekommt die Werte von /api/anmelden (20 je Netz, 200
  global). Ein Passkey-Lauf prueft einen Nachweis: je Netz die 40 von
  /api/anmelden/passwort, global aber die 300 von /api/anmelden/code und
  nicht dessen 120 — die 120 stehen dort fuer die Argon2-Schranke, und eine
  Signaturpruefung kostet nichts dergleichen.

  Die Achse „Adresse" faellt ueberall weg: An diesen Stellen ist keine
  bekannt, und das ist der Grund, warum sie hier nicht fehlt, sondern nicht
  gebraucht wird.

  NICHT gedrosselt werden die beiden Rueckwege. Apples kommt von Apples
  Adressen, nicht von der des Nutzers — eine Drosselung nach Netz traefe
  dort alle gleichzeitig. Googles kostet nichts ohne einen `state`, und den
  gibt es nur ueber den gedrosselten Start.
*/
function fremdDrossel(schluessel, netz) {
    switch (schluessel) {
        case 'GET /api/google/start':
        case 'GET /api/apple/start':
            return [
                ['netz', 'fremd:' + netz, 20, 10 * 60_000],
                ['global', 'fremd:*', 200, 60_000],
            ];
        case 'POST /api/passkey/anmelden/start':
        case 'POST /api/passkey/anmelden/fertig':
            return [
                ['netz', 'pkey:' + netz, 40, 10 * 60_000],
                ['global', 'pkey:*', 300, 60_000],
            ];
        default:
            return null;
    }
}

// ── Der Dienst ──────────────────────────────────────────────────────

/**
 * Baut den Anfragebehandler. Getrennt vom Lauschen, damit Tests ihn ohne
 * Netzwerk aufrufen koennen — und damit Speicher und Versender von aussen
 * einsetzbar sind.
 */
export function baueDienst({ speicher, versender, drossel = erzeugeDrossel(), fremd = null } = {}) {

    // ── Kleinkram, der von mehreren Stellen gebraucht wird ──────────

    async function holeAngemeldeten(anfrage) {
        const wert = liesPlaetzchen(anfrage.headers.cookie);
        return pruefeSitzung(speicher, wert);
    }

    async function verlangeSitzung(anfrage) {
        const sitzung = await holeAngemeldeten(anfrage);
        if (!sitzung) throw new HttpFehler(401, 'nicht_angemeldet');
        return sitzung;
    }

    function drossle(achsen) {
        const ergebnis = drossel.pruefe(achsen);
        if (!ergebnis.ok) {
            protokolliere({ art: 'drossel', ergebnis: 'gedrosselt', achse: ergebnis.achse });
            throw new HttpFehler(429, 'zu_viele_versuche', { 'Retry-After': String(ergebnis.sekunden) });
        }
    }

    /**
     * Merkliste oder Verlauf lesen und verschmelzen, mit ETag.
     * Beide Zeilen haben dieselbe Form, deshalb eine Funktion.
     */
    async function gleicheAb(kontoId, zeilenname, eingehend, verschmelze, jetzt) {
        let ergebnis = null;
        await mitEtag(speicher, TABELLE_KONTEN, kontoId, zeilenname, (zeile) => {
            let gespeichert = {};
            try {
                gespeichert = zeile.eintraege ? JSON.parse(zeile.eintraege) : {};
            } catch {
                // Eine kaputte Zeile ist schlimm, aber ein Abgleich, der ab
                // jetzt fuer immer 500 antwortet, ist schlimmer. Was der
                // Browser mitbringt, wird die neue Wahrheit.
                protokolliere({ art: 'abgleich.zeile_kaputt', konto: kontoId, ergebnis: 'fehler' });
                gespeichert = {};
            }

            let verschmolzen = verschmelze(gespeichert, eingehend);
            if (zeilenname === 'platten') {
                verschmolzen = raeumeGrabsteine(verschmolzen, jetzt, GRABSTEIN_TAGE);
            }
            verschmolzen = beschneide(verschmolzen);

            const text = JSON.stringify(verschmolzen);
            const unveraendert = text === JSON.stringify(gespeichert);
            ergebnis = { eintraege: verschmolzen, stand: zeile.stand ?? 0 };

            // Nichts geaendert, nichts geschrieben. Das ist kein
            // Feinschliff: Ein Browser, der beim Start abgleicht, erzeugt
            // sonst je Sitzung einen Schreibvorgang fuer nichts.
            if (unveraendert) return null;

            ergebnis.stand = (zeile.stand ?? 0) + 1;
            return { ...zeile, eintraege: text, stand: ergebnis.stand, geaendert: jetzt };
        }, { eintraege: '{}', stand: 0 });

        return ergebnis;
    }

    // ── Die Endpunkte ──────────────────────────────────────────────

    const wege = {

        /*
          Anmeldung anfordern. IMMER 204.

          DIE WICHTIGSTE EIGENSCHAFT DIESER FUNKTION: Sie schaut gar nicht
          nach, ob es das Konto gibt. Der Code wird in eine Partition
          geschrieben, die nach dem ABDRUCK DER ADRESSE heisst, nicht nach
          der kontoId — und diese Partition gibt es fuer jede Adresse, ob
          dahinter ein Konto steht oder nicht. Damit ist die Arbeit fuer
          bekannt und unbekannt nicht bloss aehnlich, sondern gleich: ein
          Schreibvorgang, eine Mail, kein Unterschied, den man messen
          koennte.

          Das Konto entsteht erst, wenn der Code eingeloest wird. Wer nur
          Adressen durchprobiert, legt also keine Konten an.
        */
        'POST /api/anmelden': async ({ koerper, netz, start }) => {
            const adresse = normalisiereAdresse(koerper.mail);
            const echt = adresseSiehtEchtAus(adresse);

            drossle([
                ['adresse', 'anm:' + adressSchluessel(adresse), 5, 10 * 60_000],
                ['netz', 'anm:' + netz, 20, 10 * 60_000],
                ['global', 'anm:*', 200, 60_000],
            ]);

            if (echt) {
                const partition = kennungAbdruck('mail', adresse);
                const { code } = await legeCodeAn(speicher, partition, 'anmeldung');
                versender.reiheEin({
                    art: 'code', an: adresse, code,
                    minuten: Math.round(GUELTIG_MS / 60_000),
                    sprache: koerper.sprache,
                });
            }

            protokolliere({ art: 'anmeldung.angefordert', ergebnis: 'ok', dauer: Date.now() - start });
            await aufBoden(start);
            return { status: 204 };
        },

        'POST /api/anmelden/code': async ({ koerper, netz, start }) => {
            const adresse = normalisiereAdresse(koerper.mail);

            drossle([
                ['adresse', 'code:' + adressSchluessel(adresse), 10, 10 * 60_000],
                ['netz', 'code:' + netz, 60, 10 * 60_000],
                ['global', 'code:*', 300, 60_000],
            ]);

            const partition = kennungAbdruck('mail', adresse);
            const gepr = await pruefeCode(speicher, partition, koerper.code, 'anmeldung');

            if (!gepr.ok) {
                protokolliere({ art: 'anmeldung.code', ergebnis: 'abgelehnt', grund: gepr.grund });
                await aufBoden(start);
                return { status: 401, koerper: { fehler: 'code_ungueltig', grund: gepr.grund } };
            }

            // Erst hier entsteht das Konto.
            const { kontoId, neu } = await holeOderLegeKontoAn(speicher, adresse);

            /*
              Der eingeloeste Code IST der Nachweis, dass jemand das Postfach
              erreicht. Also gilt die Adresse ab jetzt als bestaetigt —
              einen zweiten Bestaetigungsschritt gaebe es nicht zu bestaetigen.
            */
            await mitEtag(speicher, TABELLE_KONTEN, kontoId, 'kennung:mail',
                (zeile) => (zeile.bestaetigtAm ? null : { ...zeile, adresse, bestaetigtAm: Date.now() }),
                { adresse, bestaetigtAm: 0 });

            const sitzung = await erzeugeSitzung(speicher, kontoId);
            protokolliere({ art: 'anmeldung.code', ergebnis: 'ok', konto: kontoId, dauer: Date.now() - start });
            await aufBoden(start);
            return {
                status: 200,
                koerper: { kontoId, neu },
                kopf: { 'Set-Cookie': baueSitzungsPlaetzchen(sitzung.wert) },
            };
        },

        /*
          Anmeldung mit Passwort.

          Hier laeuft IMMER eine echte Argon2-Pruefung — auch wenn es die
          Adresse gar nicht gibt und auch, wenn das Konto nie ein Passwort
          bekommen hat. Sonst waere die Antwortzeit die Antwort: 50 ms heisst
          „kenne ich nicht", 250 ms heisst „gibt es". passwort.mjs haelt dafuer
          einen Blind-Hash bereit, der schon beim Start gerechnet wurde.

          Der Blindlauf nimmt auch einen Platz in der Schranke. Auch das ist
          Absicht: Sonst verhielte sich der Dienst unter Last fuer unbekannte
          Adressen anders (nie 503) als fuer bekannte.
        */
        'POST /api/anmelden/passwort': async ({ koerper, netz, start }) => {
            const adresse = normalisiereAdresse(koerper.mail);

            drossle([
                ['adresse', 'pw:' + adressSchluessel(adresse), 10, 10 * 60_000],
                ['netz', 'pw:' + netz, 40, 10 * 60_000],
                ['global', 'pw:*', 120, 60_000],
            ]);

            const kontoId = await findeKonto(speicher, 'mail', adresse);
            const kennung = kontoId
                ? await holeOderNichts(speicher, TABELLE_KONTEN, kontoId, 'kennung:mail')
                : null;

            const stimmt = await pruefePasswort(String(koerper.passwort ?? ''), kennung?.passwortHash);

            if (!stimmt) {
                protokolliere({
                    art: 'anmeldung.passwort', ergebnis: 'abgelehnt',
                    grund: kennung?.passwortHash ? 'falsch' : 'kein_passwort',
                });
                await aufBoden(start);
                return { status: 401, koerper: { fehler: 'anmeldung_fehlgeschlagen' } };
            }

            const sitzung = await erzeugeSitzung(speicher, kontoId);
            protokolliere({ art: 'anmeldung.passwort', ergebnis: 'ok', konto: kontoId, dauer: Date.now() - start });
            await aufBoden(start);
            return {
                status: 200,
                koerper: { kontoId, neu: false },
                kopf: { 'Set-Cookie': baueSitzungsPlaetzchen(sitzung.wert) },
            };
        },

        'POST /api/passwort/setzen': async ({ anfrage, koerper }) => {
            const sitzung = await verlangeSitzung(anfrage);
            const kennung = await holeOderNichts(speicher, TABELLE_KONTEN, sitzung.kontoId, 'kennung:mail');

            const gepr = await pruefeNeuesPasswort(koerper.passwort, { adresse: kennung?.adresse });
            if (!gepr.ok) {
                protokolliere({
                    art: 'passwort.gesetzt', ergebnis: 'abgelehnt',
                    konto: sitzung.kontoId, grund: gepr.gruende[0]?.grund,
                });
                return { status: 400, koerper: { fehler: 'passwort_abgelehnt', gruende: gepr.gruende } };
            }

            const hash = await hashe(gepr.passwort);
            await mitEtag(speicher, TABELLE_KONTEN, sitzung.kontoId, 'kennung:mail',
                (zeile) => ({ ...zeile, passwortHash: hash, passwortGesetztAm: Date.now() }),
                { adresse: kennung?.adresse ?? '', bestaetigtAm: 0 });

            /*
              Alle ANDEREN Sitzungen beenden. Wer sein Passwort setzt, tut
              das oft, weil er einen Verdacht hat — dann muss der Fremde
              hinaus. Die eigene bleibt: Wer sich beim Passwortsetzen selbst
              abmeldet, hat eine Anwendung, die man nicht mag.
            */
            const beendet = await widerrufeAlle(speicher, sitzung.kontoId, { ausser: sitzung.abdruck });
            protokolliere({
                art: 'passwort.gesetzt', ergebnis: 'ok', konto: sitzung.kontoId,
                anzahl: beendet, grund: gepr.leakAbgleichAusgefallen ? 'ohne_leakabgleich' : undefined,
            });
            return { status: 204 };
        },

        /*
          Passwort vergessen. IMMER 204 — und, wie bei /api/anmelden, mit
          derselben Arbeit fuer bekannt und unbekannt.

          Die Marke landet in der Partition des ADRESSABDRUCKS, nicht in der
          des Kontos. Damit entsteht sie auch fuer eine Adresse ohne Konto,
          und der Schreibvorgang ist derselbe.

          Und es geht AUCH DANN eine Mail hinaus. Sie sagt dann, dass es hier
          kein Konto gibt. Das ist der einzige Weg, der ohne Luege auskommt
          und trotzdem nichts verraet: Wer eine fremde Adresse eintippt,
          erfaehrt vom Dienst nichts — der Besitzer der Adresse dagegen
          erfaehrt, dass jemand es versucht hat, und das soll er.
        */
        'POST /api/passwort/vergessen': async ({ koerper, netz, start }) => {
            const adresse = normalisiereAdresse(koerper.mail);
            const echt = adresseSiehtEchtAus(adresse);

            drossle([
                ['adresse', 'verg:' + adressSchluessel(adresse), 3, 30 * 60_000],
                ['netz', 'verg:' + netz, 10, 30 * 60_000],
                ['global', 'verg:*', 60, 60_000],
            ]);

            if (echt) {
                const partition = kennungAbdruck('mail', adresse);
                const marke = await legeMarkeAn(speicher, partition, 'passwort');
                const kontoId = await findeKonto(speicher, 'mail', adresse);
                versender.reiheEin({
                    art: kontoId ? 'marke' : 'unbekannt',
                    an: adresse,
                    verweis: SEITE + '/passwort-neu?marke=' + encodeURIComponent(marke),
                    minuten: Math.round(MARKE_GUELTIG_MS / 60_000),
                    sprache: koerper.sprache,
                });
            }

            protokolliere({ art: 'passwort.vergessen', ergebnis: 'ok', dauer: Date.now() - start });
            await aufBoden(start);
            return { status: 204 };
        },

        'POST /api/passwort/neu': async ({ koerper, netz, start }) => {
            drossle([
                ['netz', 'neu:' + netz, 20, 10 * 60_000],
                ['global', 'neu:*', 60, 60_000],
            ]);

            const eingeloest = await loeseMarkeEin(speicher, koerper.marke, 'passwort');
            if (!eingeloest.ok) {
                protokolliere({ art: 'passwort.neu', ergebnis: 'abgelehnt', grund: eingeloest.grund });
                await aufBoden(start);
                // 410 und nicht 401: Die Marke war vielleicht echt, sie gilt
                // nur nicht mehr. Die Seite soll „fordern Sie einen neuen
                // Link an" sagen koennen und nicht „falsches Passwort".
                return { status: 410, koerper: { fehler: 'marke_ungueltig', grund: eingeloest.grund } };
            }

            /*
              Die Marke liegt in der Partition des Adressabdrucks. Von dort
              zum Konto fuehrt der Verweis — und wenn keiner da ist, gab es
              nie ein Konto. Dann ist die Marke echt und trotzdem wertlos,
              und 410 ist die richtige Antwort.
            */
            const verweis = await holeOderNichts(speicher, TABELLE_VERWEISE, eingeloest.partition, 'v');
            const kontoId = verweis?.kontoId;
            if (!kontoId) {
                await aufBoden(start);
                return { status: 410, koerper: { fehler: 'marke_ungueltig', grund: 'kein_konto' } };
            }

            const kennung = await holeOderNichts(speicher, TABELLE_KONTEN, kontoId, 'kennung:mail');
            const gepr = await pruefeNeuesPasswort(koerper.passwort, { adresse: kennung?.adresse });
            if (!gepr.ok) {
                /*
                  400 und die Marke ist SCHON VERBRAUCHT — sie wurde beim
                  Einloesen geloescht. Das ist unbequem: Wer sich vertippt,
                  braucht einen neuen Link. Die Alternative waere, die Marke
                  bis zum Erfolg gueltig zu lassen, und damit ein
                  Einmalgeheimnis, das man beliebig oft vorlegen kann. Die
                  Antwort nennt den Grund, damit die Seite das erklaeren kann.
                */
                protokolliere({ art: 'passwort.neu', ergebnis: 'abgelehnt', konto: kontoId, grund: gepr.gruende[0]?.grund });
                await aufBoden(start);
                return {
                    status: 400,
                    koerper: { fehler: 'passwort_abgelehnt', gruende: gepr.gruende, markeVerbraucht: true },
                };
            }

            const hash = await hashe(gepr.passwort);
            await mitEtag(speicher, TABELLE_KONTEN, kontoId, 'kennung:mail',
                (zeile) => ({ ...zeile, passwortHash: hash, passwortGesetztAm: Date.now() }),
                { adresse: kennung?.adresse ?? '', bestaetigtAm: 0 });

            // Hier ALLE Sitzungen, ohne Ausnahme: Wer das Passwort ueber den
            // Link zuruecksetzt, hat gerade keine Sitzung, die man schonen
            // muesste — und wenn doch jemand eine hat, ist er der Falsche.
            const beendet = await widerrufeAlle(speicher, kontoId);
            protokolliere({ art: 'passwort.neu', ergebnis: 'ok', konto: kontoId, anzahl: beendet });
            await aufBoden(start);
            return { status: 204 };
        },

        'GET /api/konto': async ({ anfrage }) => {
            const sitzung = await holeAngemeldeten(anfrage);
            if (!sitzung) return { status: 200, koerper: { angemeldet: false } };

            const [konto, kennung] = await Promise.all([
                holeOderNichts(speicher, TABELLE_KONTEN, sitzung.kontoId, 'konto'),
                holeOderNichts(speicher, TABELLE_KONTEN, sitzung.kontoId, 'kennung:mail'),
            ]);

            return {
                status: 200,
                koerper: {
                    angemeldet: true,
                    kontoId: sitzung.kontoId,
                    // Die eigene Adresse zurueckzugeben ist kein Verrat: Wer
                    // die Sitzung hat, hat das Konto.
                    adresse: kennung?.adresse ?? null,
                    bestaetigt: Boolean(kennung?.bestaetigtAm),
                    hatPasswort: Boolean(kennung?.passwortHash),
                    angelegt: konto?.angelegt ?? null,
                },
            };
        },

        'POST /api/abmelden': async ({ anfrage }) => {
            const sitzung = await holeAngemeldeten(anfrage);
            if (sitzung) {
                // Die ZEILE loeschen, nicht nur das Plaetzchen. Ein Plaetzchen
                // kann man kopiert haben; eine geloeschte Zeile nicht.
                await widerrufe(speicher, sitzung.kontoId, sitzung.abdruck);
                protokolliere({ art: 'abmeldung', ergebnis: 'ok', konto: sitzung.kontoId });
            }
            return { status: 204, kopf: { 'Set-Cookie': baueLoeschPlaetzchen() } };
        },

        'POST /api/platten/abgleich': async ({ anfrage, koerper }) => {
            const sitzung = await verlangeSitzung(anfrage);
            const jetzt = Date.now();
            const eingehend = saeubereEintraege(koerper.eintraege);
            const ergebnis = await gleicheAb(sitzung.kontoId, 'platten', eingehend, verschmelzePlatten, jetzt);
            protokolliere({
                art: 'platten.abgleich', ergebnis: 'ok', konto: sitzung.kontoId,
                anzahl: nurDrin(ergebnis.eintraege).length, stand: ergebnis.stand,
            });
            return {
                status: 200,
                koerper: { stand: ergebnis.stand, eintraege: ergebnis.eintraege, serverzeit: jetzt },
            };
        },

        'GET /api/platten': async ({ anfrage }) => {
            const sitzung = await verlangeSitzung(anfrage);
            const zeile = await holeOderNichts(speicher, TABELLE_KONTEN, sitzung.kontoId, 'platten');
            let eintraege = {};
            try { eintraege = zeile?.eintraege ? JSON.parse(zeile.eintraege) : {}; } catch { eintraege = {}; }
            return {
                status: 200,
                koerper: { stand: zeile?.stand ?? 0, eintraege, serverzeit: Date.now() },
            };
        },

        'POST /api/verlauf/abgleich': async ({ anfrage, koerper }) => {
            const sitzung = await verlangeSitzung(anfrage);
            const jetzt = Date.now();
            const eingehend = saeubereVerlauf(koerper.eintraege);
            const ergebnis = await gleicheAb(sitzung.kontoId, 'verlauf', eingehend, verschmelzeVerlauf, jetzt);
            /*
              Anzahl ja, Kennungen nein. WELCHER Sender gehoert wird, gehoert
              zu den Angaben, die dieses Projekt an keiner Stelle
              protokolliert — auch nicht hier, wo es bequem waere.
            */
            protokolliere({
                art: 'verlauf.abgleich', ergebnis: 'ok', konto: sitzung.kontoId,
                anzahl: Object.keys(ergebnis.eintraege).length, stand: ergebnis.stand,
            });
            return {
                status: 200,
                koerper: { stand: ergebnis.stand, eintraege: ergebnis.eintraege, serverzeit: jetzt },
            };
        },

        /*
          Auskunft nach Art. 15 DSGVO, als Datei zum Herunterladen.

          ALLES, was zu diesem Konto in der Tabelle steht — und zwar
          wirklich alles, auch die Zeilen, die niemand erwartet. Was
          herausgenommen wird, sind die GEHEIMNISSE: Passwort-Hash,
          Sitzungsabdruecke, Codeabdruecke. Sie gehoeren zwar zum Konto, aber
          eine Datei, die in einem Download-Ordner liegt und aus der man sich
          anmelden kann, ist keine Auskunft, sondern ein Schluesselbund.
        */
        'GET /api/konto/ausfuhr': async ({ anfrage }) => {
            const sitzung = await verlangeSitzung(anfrage);
            const geheim = new Set(['abdruck', 'passwortHash', 'etag', 'timestamp']);
            const zeilen = [];
            for await (const zeile of speicher.liste(TABELLE_KONTEN, sitzung.kontoId)) {
                const sauber = {};
                for (const [name, wert] of Object.entries(zeile)) {
                    if (geheim.has(name)) continue;
                    sauber[name] = wert;
                }
                // Die Merkliste als Struktur statt als Zeichenkette — eine
                // Auskunft, die man erst parsen muss, ist keine.
                if (typeof sauber.eintraege === 'string') {
                    try { sauber.eintraege = JSON.parse(sauber.eintraege); } catch { /* dann eben roh */ }
                }
                zeilen.push(sauber);
            }
            protokolliere({ art: 'konto.ausfuhr', ergebnis: 'ok', konto: sitzung.kontoId, anzahl: zeilen.length });
            return {
                status: 200,
                koerper: {
                    kontoId: sitzung.kontoId,
                    erstelltAm: new Date().toISOString(),
                    hinweis: 'Passwort-Hash, Sitzungs- und Codeabdruecke sind bewusst nicht enthalten.',
                    zeilen,
                },
                kopf: { 'Content-Disposition': 'attachment; filename="iyambae-konto.json"' },
            };
        },

        'DELETE /api/konto': async ({ anfrage, koerper }) => {
            const sitzung = await verlangeSitzung(anfrage);
            /*
              Die Bestaetigung ist keine Zierde. Ein DELETE ohne Rumpf kann
              aus einem falsch geratenen Wiederholungsversuch kommen, aus
              einem Werkzeug, aus einem Tippfehler in der Konsole. Ein Konto
              zurueckzuholen gibt es hier nicht — es gibt keine Sicherung,
              aus der man einzelne Zeilen wiederherstellen koennte.
            */
            if (koerper.bestaetigung !== 'loeschen') {
                return { status: 400, koerper: { fehler: 'bestaetigung_fehlt' } };
            }
            await loescheKonto(speicher, sitzung.kontoId);
            return { status: 204, kopf: { 'Set-Cookie': baueLoeschPlaetzchen() } };
        },

        /*
          Lebenszeichen. Ohne Sitzung, ohne Protokolleintrag, ohne
          Tabellenzugriff.

          Kein Protokoll, weil sonst jede Abfrage eine Zeile nach Log
          Analytics schoebe — und wer das im Sekundentakt fragt, zahlt fuer
          nichts. Kein Tabellenzugriff, weil ein Lebenszeichen nichts
          beweisen soll, was es nicht selbst weiss: Antwortet es, laeuft der
          Prozess. Ob Table Storage erreichbar ist, sagt der erste echte
          Aufruf, und dessen 503 steht dann im Protokoll.

          UND: Es gibt trotzdem KEINE Probe auf diesen Container. Der Grund
          steht in infra/konto.bicep.entwurf und ist wichtiger als dieser
          Endpunkt — eine Liveness-Probe hier kann die ganze Replik neu
          starten, und dann ist wegen des Anmeldedienstes das Radio weg.
        */
        'GET /api/leben': async () => ({ status: 204 }),
    };

    // ── Die Weiche ─────────────────────────────────────────────────

    return async function behandle(anfrage, antwort) {
        const start = Date.now();
        const pfad = (anfrage.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';
        const schluessel = anfrage.method + ' ' + pfad;

        // Vor allem anderen, damit ein Lebenszeichen wirklich nichts kostet.
        if (schluessel === 'GET /api/leben') {
            antworte(antwort, 204, null);
            return;
        }

        try {
            const netz = netzVon(anfrage.headers['x-forwarded-for']);

            /*
              Google, Apple und Passkeys VOR der eigenen Wegwahl. Sie lesen
              ihren Rumpf selbst — Formular bei Apple, JSON bei den
              Passkeys —, deshalb darf `liesKoerper` vorher nicht daran
              gewesen sein.

              Und deshalb laeuft `pruefeHerkunft` hier auch nicht: Jeder
              veraendernde Weg dort prueft den Ursprung selbst, gegen
              dieselbe Liste. Es muss so sein, denn GENAU EINER darf es
              nicht — Apples Rueckweg ist ein form_post von
              appleid.apple.com, dort ist der Ursprung fremd und der einmal
              gueltige `state` der Schutz.
            */
            if (fremd) {
                const achsen = fremdDrossel(schluessel, netz);
                if (achsen) drossle(achsen);
                /*
                  Die drei Kopfzeilen aus `antworte` vorab setzen, damit auch
                  Umleitungen und Passkey-Antworten sie tragen. writeHead in
                  fremd.mjs ueberschreibt, was es selbst setzt, und laesst den
                  Rest stehen — no-referrer ist der Zusatz, den es dort nicht
                  gibt und den eine Umleitung zu Google gut gebrauchen kann.
                */
                antwort.setHeader('Cache-Control', 'no-store');
                antwort.setHeader('X-Content-Type-Options', 'nosniff');
                antwort.setHeader('Referrer-Policy', 'no-referrer');
                if (await fremd.behandle(anfrage, antwort)) {
                    stosseAufraeumenAn(speicher);
                    return;
                }
            }

            const behandler = wege[schluessel];
            if (!behandler) {
                /*
                  Nur /api/ gehoert diesem Dienst. Alles andere gehoert
                  nginx. Ein 404 beansprucht nichts.
                */
                antworte(antwort, 404, { fehler: 'unbekannter_pfad' });
                return;
            }

            if (anfrage.method !== 'GET') pruefeHerkunft(anfrage);
            const koerper = anfrage.method === 'GET' ? {} : await liesKoerper(anfrage);

            const ergebnis = await behandler({ anfrage, koerper, netz, start, pfad });
            antworte(antwort, ergebnis.status, ergebnis.koerper ?? null, ergebnis.kopf);

            /*
              Das Aufraeumen ganz am Ende, NACH der Antwort. Es haengt an
              einer echten Anfrage und nicht an einem Timer — und die Anfrage
              wartet nicht darauf.
            */
            stosseAufraeumenAn(speicher);

        } catch (fehler) {
            behandleFehler(fehler, antwort, { anfrage, start });
        }
    };
}

function behandleFehler(fehler, antwort, { anfrage, start } = {}) {
    if (fehler instanceof HttpFehler) {
        if (fehler.status === 413) {
            /*
              Der Rest des Rumpfes liegt noch auf der Leitung und wird nie
              gelesen. Ohne `Connection: close` wartete node darauf, bevor
              es die naechste Anfrage auf derselben Verbindung annimmt — und
              der Aufrufer saehe erst nach einer Zeitgrenze etwas. Also:
              antworten, hinausschieben, dann die Verbindung schliessen.
            */
            antworte(antwort, 413, { fehler: fehler.grund }, { Connection: 'close' });
            antwort.on('finish', () => anfrage?.destroy());
            return;
        }
        antworte(antwort, fehler.status, { fehler: fehler.grund }, fehler.zusatz);
        return;
    }

    if (fehler instanceof UeberlastFehler) {
        /*
          503 und nicht 429. Der Unterschied ist nicht kosmetisch: 429 heisst
          „DU hast zu viel gefragt", 503 heisst „mir geht es gerade schlecht".
          Wer hier abgewiesen wird, hat meist gar nichts falsch gemacht — er
          stand nur hinter zweihundert anderen.
        */
        protokolliere({ art: 'antwort', ergebnis: 'ueberlastet', status: 503, dauer: Date.now() - start });
        antworte(antwort, 503, { fehler: 'ueberlastet' }, { 'Retry-After': String(fehler.sekunden) });
        return;
    }

    if (fehler instanceof SpeicherFehler) {
        if (fehler.art === 'konflikt') {
            // Dreimal kollidiert. Das ist kein Serverfehler, sondern ein
            // Aufrufer, der sich mit sich selbst ins Gehege kommt.
            protokolliereFehler('speicher', fehler, { status: 409 });
            antworte(antwort, 409, { fehler: 'gleichzeitig_geaendert' });
            return;
        }
        /*
          Table Storage antwortet nicht. Dann antwortet auch dieser Dienst
          nicht mit Daten, sondern sagt es — 503 mit Retry-After, und die
          Webseite arbeitet mit ihrem oertlichen Stand weiter. Eine leere
          Merkliste mit Status 200 waere die schlimmste aller Antworten: Der
          Browser hielte sie fuer die Wahrheit und schriebe sie beim
          naechsten Abgleich zurueck.
        */
        protokolliereFehler('speicher', fehler, { status: 503 });
        antworte(antwort, 503, { fehler: 'speicher_nicht_erreichbar' }, { 'Retry-After': '5' });
        return;
    }

    protokolliereFehler('unbehandelt', fehler, { status: 500, dauer: Date.now() - start });
    antworte(antwort, 500, { fehler: 'innerer_fehler' });
}

// ── Start ───────────────────────────────────────────────────────────

export async function starte({ port = PORT } = {}) {
    const speicher = await erzeugeSpeicher();
    const versender = erzeugeVersender({
        endpunkt: process.env.ACS_ENDPUNKT,
        absender: process.env.ABSENDER,
    });

    // Der Blind-Hash muss VOR der ersten Anfrage stehen. Waere er es nicht,
    // zahlte die erste unbekannte Adresse 13 ms extra und waere daran zu
    // erkennen.
    await bereiteVor();

    if (speicher.art === 'arbeitsspeicher') {
        protokolliere({
            art: 'start.warnung', ergebnis: 'fehler', grund: 'speicher_nur_im_arbeitsspeicher',
        });
        process.stderr.write(
            'WARNUNG: weder TABELLEN_ENDPUNKT noch AZURITE gesetzt. Alle Konten liegen im\n'
            + 'Arbeitsspeicher und sind beim naechsten Neustart weg. Das ist nur fuer Tests.\n');
    }

    /*
      Einmal beim Start, nicht bei der ersten Anmeldung: Das Nachladen von
      google.mjs, apple.mjs und passkey.mjs faellt sonst dem ersten Menschen
      zur Last, der sich anmeldet — und der wartet ohnehin schon auf den
      Kaltstart.
    */
    const fremd = await baueFremdanmeldung(speicher);

    const server = http.createServer(baueDienst({ speicher, versender, fremd }));

    /*
      Zeitgrenzen ausdruecklich setzen. Die Vorgaben von node:http sind
      grosszuegig, und eine haengende Verbindung haelt hier nicht bloss
      Speicher, sondern moeglicherweise einen Platz in der Argon2-Schranke.
    */
    server.headersTimeout = 10_000;
    server.requestTimeout = 20_000;
    server.keepAliveTimeout = 65_000;

    await new Promise((fertig) => server.listen(port, '0.0.0.0', fertig));
    protokolliere({ art: 'start', ergebnis: 'ok', grund: speicher.art });

    /*
      Sauber herunterfahren. Container Apps schickt SIGTERM und wartet; wer
      dann mitten in einer Anmeldung steckt, soll sie zu Ende bringen duerfen.
      Wartende Mails gehen dabei verloren — das steht im README.
    */
    for (const zeichen of ['SIGTERM', 'SIGINT']) {
        process.on(zeichen, () => {
            protokolliere({ art: 'ende', ergebnis: 'ok', grund: zeichen });
            server.close(() => process.exit(0));
        });
    }

    return server;
}

/*
  Nur starten, wenn diese Datei das Programm ist — Tests importieren sie.
  `pathToFileURL` und nicht 'file://' + Pfad: Auf Windows waere der
  zusammengesetzte Pfad ('C:\...') keine gueltige Adresse, der Vergleich
  schluege immer fehl, und der Dienst liesse sich oertlich nicht starten.
*/
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    starte().catch((fehler) => {
        protokolliereFehler('start', fehler);
        process.exit(1);
    });
}

export { HttpFehler, raeumeKonto };
