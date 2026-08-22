/*
  Die Zusammenfassung — dieselben Zahlen wie das Dashboard, als JSON.

  ── Warum es diesen Weg ueberhaupt gibt ──────────────────────────────

  Es gibt bereits ein Dashboard (infra/dashboard.bicep, eine Azure-
  Arbeitsmappe). Der Satz, der diesen Weg begruendet, ist von Saemi-Ra und
  er stimmt: „Ein Dashboard muss man aufmachen. Was man aufmachen muss,
  vergisst man." Nach der zweiten Woche schaut niemand mehr hin — und genau
  dann waere es interessant.

  Ein Weg, der dieselben Zahlen als JSON liefert, laesst sich abfragen. Die
  Zahl meldet sich dann von selbst, statt darauf zu warten, dass jemand eine
  Seite oeffnet.

  ── KEINE ZWEITE DATENHALTUNG ───────────────────────────────────────

  Das ist die wichtigste Regel dieser Datei, und sie ist der Grund, warum
  unten KQL steht und kein eigener Zaehler und keine eigene Tabelle.

  Die Abfragen in `KQL` sind WOERTLICH aus infra/dashboard.bicep kopiert.
  Nicht sinngemaess, nicht „angepasst" — Zeichen fuer Zeichen dieselben, mit
  genau ZWEI mechanischen Aenderungen, die beide unten an Ort und Stelle
  stehen und begruendet sind:

    1. `ago(30d)` wird auf das gewuenschte Fenster gesetzt (`setzeFenster`).
    2. `| render …` faellt weg (`ohneRender`) — eine Zeichenanweisung fuer
       eine Arbeitsmappe, die eine JSON-Antwort nicht braucht.

  Wer eine Abfrage im Dashboard aendert, aendert sie HIER MIT. Ein Vergleich
  zwischen den Zeichenketten dort und hier muss Zeichen fuer Zeichen
  aufgehen, sonst zeigen Dashboard und Weg verschiedene Zahlen und keiner
  der beiden ist mehr belastbar. Deshalb der woertliche Uebernahmezwang
  statt einer „schoeneren" eigenen Fassung.

  ── WAS DIE ZAHLEN NICHT SIND ───────────────────────────────────────

  „Besucher" ist eine SCHAETZUNG und keine Zaehlung. Die Messzeilen tragen
  seit der Reichweitenmessung KEIN Adressfeld mehr — mit Absicht, siehe die
  Begruendung im Kopf von infra/dashboard.bicep. Die einzige Quelle fuer
  „verschiedene Besucher" ist damit das Zugriffsprotokoll, und dort steht
  eine gekuerzte Adresse: bei einem Anschluss mit vielen Geraeten zu
  niedrig, bei wechselnden Mobilfunkadressen zu hoch.

  Die Antwort sagt das auch. Jedes Feld, das darauf beruht, heisst
  `besucher_geschaetzt` und nicht `besucher`, und in `hinweise` steht der
  Satz noch einmal ausgeschrieben. Eine Schaetzung, die wie eine Zaehlung
  aussieht, ist schlimmer als keine Zahl.

  ── UND WIE CRAWLER HERAUSGERECHNET WERDEN ──────────────────────────

  Das ist der Teil, an dem eine naive Auswertung wertlos wird. Gemessen am
  22.08.2026, ueber dreissig Tage:

      Sprache          Seitenaufrufe   Adressen   Messereignisse
      en                     6.269          89              1
      de                       459          54            271
      ar/fr/ja/es/it       290–323       43–45              0

  6.269 englische Aufrufe von 89 Adressen sind siebzig Seiten je Adresse.
  Kein Mensch tut das. Die fuenf uebrigen Fremdsprachen liegen alle bei
  290–320 Aufrufen von 43–45 Adressen, gleichmaessig verteilt — das ist
  jemand, der die sitemap.xml abgeht.

  DER TRENNER IST NICHT DIE AUFRUFZAHL. Das war der erste Gedanke und er
  traegt nicht: en kommt auf 70 Aufrufe je Adresse, fr/es/it/ja/ar auf rund
  7 — aber de auf 8,5. Eine Schwelle „Aufrufe je Adresse" wuerde also
  entweder die Crawler durchlassen oder die deutschen Menschen mit
  hinauswerfen. Sie ist untauglich.

  DER TRENNER IST DIE AUSFUEHRUNG VON JAVASCRIPT. Ein Messereignis entsteht
  nur, wenn assets/lib/messung.mjs im Browser laeuft. Crawler fuehren kein
  JavaScript aus; sie koennen per Bauart kein Ereignis erzeugen. Also:

      Ereignisse je Seitenaufruf   =   Messereignisse / Seitenaufrufe

      de       271 / 459   = 0,59
      en         1 / 6.269 = 0,00016
      uebrige    0 / ~300  = 0

  Zwischen dem menschlichen und dem maschinellen Wert liegen mehr als drei
  Zehnerpotenzen. Die Schwelle steht bei 0,05 — das Zwanzigfache unter dem
  gemessenen menschlichen Wert und das Dreihundertfache ueber dem gemessenen
  englischen. Sie muss nicht genau sein; sie muss nur in einer Luecke
  liegen, die drei Zehnerpotenzen breit ist.

  Was das Verfahren GUT macht: Es korrigiert sich von selbst. Kommen die
  englischsprachigen Menschen, auf die Saemi-Ra bei Reddit zielt, steigt das
  Verhaeltnis fuer `en` von allein ueber die Schwelle, und `en` zaehlt ab
  dann mit. Es steht keine Crawlerliste irgendwo, die jemand nachpflegen
  muesste, und keine Browserkennung wird ausgewertet.

  Was es NICHT kann, und das gehoert dazugesagt: Es trennt je SPRACHE, nicht
  je Besucher. Ein Mensch, der die englische Fassung liest und nichts
  anklickt, faellt heute mit den Crawlern zusammen unter den Tisch. Deshalb
  wird nichts weggeworfen — die Rohzahlen stehen vollstaendig in
  `je_sprache` samt Verhaeltnis und Kennzeichen, und nur die EINE abgeleitete
  Summe `menschlich` laesst die maschinellen Sprachen aus. Wer die Rohzahl
  will, findet sie; wer die belastbare will, auch.
*/

import { createHash, timingSafeEqual } from 'node:crypto';

// ── Die Abfragen ────────────────────────────────────────────────────

/*
  Die Vorrede aus dem Dashboard, woertlich. Sie zieht die Messzeilen aus
  ContainerAppConsoleLogs_CL und packt sie in `M`. Zweimal parse_json, weil
  nginx den Rumpf als Zeichenkette schreibt — die Falle ist im Dashboard
  ausfuehrlich erklaert und wird hier nicht ein zweites Mal erklaert,
  sondern nur nicht kaputtgemacht.
*/
const VORREDE = 'let M = ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| where Log_s has "messung"\n| extend E = parse_json(Log_s)\n| where tostring(E.art) == "messung"\n| extend R = parse_json(tostring(E.ereignis))\n| extend Was = tostring(R.was);\n';

/*
  Sechs Abfragen, und jede beantwortet genau eine der Fragen, die Saemi-Ra
  gestellt hat. Keine ist neu; jede steht so in infra/dashboard.bicep.

    startquoteGesamt   Starts je Besuch — SEINE wichtigste Zahl, weil sie
                       sagt, ob Leute nur schauen oder wirklich hoeren
    startquote         Seitenaufrufe, Besucher und Starts je TAG
    sprachen           Verteilung auf die sieben Fassungen, aus den Pfaden
    sprachenGemeldet   dieselbe Verteilung aus den MESSEREIGNISSEN — die
                       Gegenprobe, aus der die Crawlertrennung entsteht
    ereignisarten      Filter, Regal, Suche, Sprache, installiert
    senderListe        die meistgestarteten Sender

  WAS NICHT DABEI IST, weil es die Zahl nicht gibt: die „Fehlversuche je
  Sender" aus dem Vorgang. assets/lib/messung.mjs kennt genau sechs
  Ereignisarten (start, filter, regal, suche, sprache, installiert) und
  darunter keine fuer einen gescheiterten Start. Diese Zahl braeuchte zuerst
  eine siebte Art in der Messung — und damit eine eigene Entscheidung, nicht
  eine Abfrage hier.
*/
export const KQL = {
    startquoteGesamt: `${VORREDE}let besucher = toscalar(ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| where tostring(E.status) == "200"\n| extend P = tostring(E.pfad)\n| where P == "/" or P endswith "/index.html"\n| summarize dcount(tostring(E.besucher)));\nM\n| where Was == "start"\n| summarize Starts = count(), Verschiedene_Sender = dcount(tostring(R.sender))\n| extend Besucher_geschaetzt = besucher\n| extend Starts_je_Besuch = round(1.0 * Starts / besucher, 2)\n| project Besucher_geschaetzt, Starts, Starts_je_Besuch, Verschiedene_Sender`,

    startquote: `${VORREDE}let besuche = ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| where tostring(E.status) == "200"\n| extend P = tostring(E.pfad)\n| where P == "/" or P endswith "/index.html"\n| summarize Seitenaufrufe = count(), Besucher = dcount(tostring(E.besucher)) by Tag = bin(TimeGenerated, 1d);\nlet starts = M\n| where Was == "start"\n| summarize Starts = count() by Tag = bin(TimeGenerated, 1d);\nbesuche\n| join kind=leftouter starts on Tag\n| extend Starts = coalesce(Starts, long(0))\n| extend Starts_je_Besuch = round(1.0 * Starts / Besucher, 2)\n| project Tag, Besucher, Seitenaufrufe, Starts, Starts_je_Besuch\n| order by Tag desc`,

    sprachen: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| extend P = tostring(E.pfad)\n| where P endswith "/index.html" or P endswith "/"\n| extend Sprache = tolower(substring(P, 1, 2))\n| where Sprache in ("de", "en", "fr", "es", "it", "ja", "ar")\n| summarize Aufrufe = count(), Besucher = dcount(tostring(E.besucher)) by Sprache\n| order by Aufrufe desc\n| render piechart',

    sprachenGemeldet: `${VORREDE}M\n| extend Sprache = tolower(substring(tostring(R.sprache), 0, 2))\n| where Sprache in ("de", "en", "fr", "es", "it", "ja", "ar")\n| summarize Ereignisse = count() by Sprache, Was\n| order by Ereignisse desc`,

    ereignisarten: `${VORREDE}M\n| summarize Anzahl = count() by Was, bin(TimeGenerated, 1d)\n| render timechart`,

    senderListe: `${VORREDE}M\n| where Was == "start"\n| where isnotempty(tostring(R.sender))\n| summarize Starts = count(), Tage_mit_Start = dcount(bin(TimeGenerated, 1d)), Zuletzt = max(TimeGenerated) by Sender = tostring(R.sender)\n| order by Starts desc\n| take 60`,
};

/*
  Aenderung 1 von 2 am uebernommenen Text.

  Das Dashboard steht fest auf dreissig Tagen; hier ist das Fenster ein
  Aufrufparameter. `replaceAll` und nicht `replace`: `startquoteGesamt`
  enthaelt `ago(30d)` ZWEIMAL — einmal in der Vorrede und einmal im
  toscalar-Block. Mit `replace` haette die Kennzahl Starts aus EINEM Tag
  durch Besucher aus DREISSIG geteilt, und das Ergebnis waere nicht bloss
  komisch aussehend, sondern falsch: ein Dreissigstel des richtigen Werts.
*/
function setzeFenster(kql, tage) {
    return kql.replaceAll('ago(30d)', `ago(${tage}d)`);
}

/*
  Aenderung 2 von 2.

  `render` sagt einer Arbeitsmappe, ob sie ein Kreis- oder ein Balkendiagramm
  zeichnen soll. Die Abfrage-API nimmt es an und haengt eine zusaetzliche
  Tabelle an die Antwort — verwertbar ist daran nichts, und eine zweite
  Tabelle in der Antwort ist eine Gelegenheit, die falsche zu erwischen.
*/
function ohneRender(kql) {
    return kql.split('\n').filter((zeile) => !zeile.startsWith('| render ')).join('\n');
}

/** Die Fassung, die wirklich hinausgeht. Beide Aenderungen, sonst nichts. */
export function baueAbfrage(name, tage) {
    return ohneRender(setzeFenster(KQL[name], tage));
}

/*
  Welche Fenster ueberhaupt gefragt werden duerfen — eine geschlossene
  Liste, dieselbe Bauart wie die Antwortlisten in umfrage.mjs.

  Das ist hier kein Formalismus, sondern eine Kostenbremse: Log Analytics
  wird nach GELESENER DATENMENGE abgerechnet. `?tage=3650` waere eine
  Aufforderung, alles zu lesen, was da ist. Drei Fenster beantworten jede
  Frage, die jemand an diesen Weg hat, und jedes weitere waere ein eigener
  Eintrag im Zwischenspeicher, also eine eigene stuendliche Rechnung.
*/
export const FENSTER = new Set([1, 7, 30]);
export const FENSTER_VORGABE = 7;

/**
 * Liest `?tage=` aus der Anfrage. Alles, was nicht in der Liste steht —
 * auch Unsinn, auch Fehlendes — wird zur Vorgabe. Kein Fehler: Wer sich
 * vertippt, soll Zahlen bekommen und nicht eine Fehlermeldung ueber ein
 * Feld, das er fuer nebensaechlich hielt.
 */
export function liesFenster(url) {
    const roh = Number(new URL(url, 'http://x').searchParams.get('tage'));
    return FENSTER.has(roh) ? roh : FENSTER_VORGABE;
}

// ── Der Schluessel ──────────────────────────────────────────────────

/*
  WARUM DIESER WEG EINEN SCHLUESSEL BRAUCHT UND DIE UMFRAGE NICHT

  /api/umfrage nimmt etwas ENTGEGEN. Der Schaden, den jemand dort anrichten
  kann, ist eine Zeile Unsinn in einer Tabelle, und dagegen steht die
  Drossel. Dieser Weg hier GIBT etwas HERAUS. Offen waere er ein Datenfeed
  fuer jeden, der ihn erraet.

  Die Zahlen sind aggregiert und ohne Personenbezug — aber es sind
  Geschaeftszahlen, und ueber wen sie nichts sagen, sagen sie doch etwas:
  wie gut die Werbung eines Menschen gelaufen ist.

  ── Warum SHA-256 vor dem Vergleich ─────────────────────────────────

  `timingSafeEqual` verlangt gleich lange Puffer und WIRFT sonst. Ein
  Laengenvergleich davor waere selbst die Undichtigkeit: Wer probiert,
  bekaeme aus „Fehler" gegen „falsch" die Laenge des Schluessels heraus und
  haette den Suchraum eingedampft.

  Zwei Abdruecke sind IMMER 32 Byte lang. Damit ist der Vergleich in
  konstanter Zeit UND laengenunabhaengig, und es gibt keinen Zweig, der
  vorzeitig zurueckkehrt.
*/
export function schluesselStimmt(erwartet, mitgebracht) {
    if (typeof erwartet !== 'string' || !erwartet) return false;
    if (typeof mitgebracht !== 'string' || !mitgebracht) return false;
    const abdruck = (wert) => createHash('sha256').update(wert, 'utf8').digest();
    return timingSafeEqual(abdruck(erwartet), abdruck(mitgebracht));
}

/*
  Wie der Schluessel ankommt: `Authorization: Bearer <zeichen>`.

  Eine eigene Kopfzeile waere auch gegangen. Bearer, weil jeder HTTP-Klient
  das ohne Nachdenken kann, weil Protokollierer und Proxys diese Kopfzeile
  von sich aus schwaerzen und eine erfundene nicht, und weil ein Leser sofort
  sieht, dass hier ein Geheimnis steht.

  Ausdruecklich NICHT das Sitzungsplaetzchen. Wer angemeldet ist, ist damit
  noch lange niemand, der die Geschaeftszahlen sehen darf — und ein Weg, der
  auf ein Plaetzchen hoert, ist ein Weg, den eine fremde Seite im Browser
  eines Angemeldeten aufrufen kann.
*/
export function liesSchluessel(kopfzeile) {
    if (typeof kopfzeile !== 'string') return null;
    const treffer = /^Bearer[ ]+(\S+)$/.exec(kopfzeile.trim());
    return treffer ? treffer[1] : null;
}

// ── Die Abfrage-API ─────────────────────────────────────────────────

/*
  Die Kennung des Arbeitsbereichs ist die `customerId` (eine GUID), NICHT
  sein Name `log-iyambae`. Das ist der Fehler, den man an dieser Stelle
  genau einmal macht: Mit dem Namen antwortet die API 404, und ein 404 sieht
  aus wie „keine Daten" statt wie „falsche Adresse".
*/
const API = 'https://api.loganalytics.io/v1/workspaces';
const BEREICH = 'https://api.loganalytics.io/.default';

/*
  Zwanzig Sekunden. Grosszuegig fuer eine HTTP-Anfrage, aber diese hier
  laeuft hoechstens einmal je Stunde und Fenster, nicht bei jedem Abruf —
  und eine Abfrage ueber dreissig Tage darf ein paar Sekunden brauchen.
  Ohne Grenze haenge die Antwort unbegrenzt, und der Aufrufer wuesste nicht,
  ob er warten oder aufgeben soll.
*/
const ZEITGRENZE_MS = 20_000;

export class ZahlenFehler extends Error {
    constructor(grund, ursache) {
        super(grund);
        this.name = 'ZahlenFehler';
        // 'nicht_eingerichtet' | 'kein_ausweis' | 'abgelehnt' | 'nicht_erreichbar'
        this.grund = grund;
        this.ursache = ursache;
    }
}

/**
 * Wandelt eine Tabelle aus der Antwort in Objekte um.
 *
 * Die API liefert Spalten und Zeilen getrennt: `columns: [{name}]` und
 * `rows: [[…]]`. Ueber den Index zuzugreifen waere kuerzer und wuerde beim
 * naechsten `| project` still die falschen Werte liefern — deshalb ueber
 * den Spaltennamen.
 */
export function zuZeilen(tabelle) {
    const namen = (tabelle?.columns ?? []).map((spalte) => spalte.name);
    return (tabelle?.rows ?? []).map((zeile) => {
        const raus = {};
        namen.forEach((name, i) => { raus[name] = zeile[i]; });
        return raus;
    });
}

/**
 * Baut den Abfrager gegen Log Analytics. Gibt `null` zurueck, wenn kein
 * Arbeitsbereich eingetragen ist — dann gibt es diesen Weg schlicht nicht,
 * und der Server antwortet ehrlich 503 statt eine Null zu erfinden.
 */
export async function erzeugeAbfrager(umgebung = process.env) {
    const bereich = umgebung.LOG_ARBEITSBEREICH;
    if (!bereich) return null;

    const { DefaultAzureCredential } = await import('@azure/identity');
    /*
      Ein Ausweis fuer alle Abfragen. Die Bibliothek haelt das Token selbst
      vor und holt erst kurz vor Ablauf ein neues; ein neuer Ausweis je
      Abfrage klopfte bei jedem Aufruf beim Identitaetsdienst an.
    */
    const ausweis = new DefaultAzureCredential();

    return {
        bereich,
        async fuehreAus(name, tage) {
            let marke;
            try {
                marke = await ausweis.getToken(BEREICH);
            } catch (fehler) {
                throw new ZahlenFehler('kein_ausweis', fehler);
            }
            if (!marke?.token) throw new ZahlenFehler('kein_ausweis');

            let antwort;
            try {
                antwort = await fetch(`${API}/${encodeURIComponent(bereich)}/query`, {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer ' + marke.token,
                        'Content-Type': 'application/json',
                    },
                    /*
                      `timespan` ZUSAETZLICH zum `ago(…)` in der Abfrage.
                      Doppelt, aber nicht ueberfluessig: Der Dienst schneidet
                      damit vor dem Ausfuehren ganze Partitionen weg, und
                      abgerechnet wird, was gelesen wird.
                    */
                    body: JSON.stringify({ query: baueAbfrage(name, tage), timespan: `P${tage}D` }),
                    signal: AbortSignal.timeout(ZEITGRENZE_MS),
                });
            } catch (fehler) {
                throw new ZahlenFehler('nicht_erreichbar', fehler);
            }

            if (!antwort.ok) {
                /*
                  Der Rumpf wird gelesen und WEGGEWORFEN. Er enthaelt bei
                  einem Fehler die Abfrage im Klartext und gelegentlich
                  Angaben zum Arbeitsbereich; im Protokoll haette beides
                  nichts verloren. Gebraucht wird der Status, sonst nichts.
                */
                await antwort.text().catch(() => '');
                const abgewiesen = antwort.status === 401 || antwort.status === 403;
                throw new ZahlenFehler(abgewiesen ? 'abgelehnt' : 'nicht_erreichbar');
            }

            let daten;
            try {
                daten = await antwort.json();
            } catch (fehler) {
                throw new ZahlenFehler('nicht_erreichbar', fehler);
            }
            return zuZeilen(daten?.tables?.[0]);
        },
    };
}

// ── Aus sechs Tabellen wird eine Antwort ────────────────────────────

/*
  Die Schwelle aus dem Kopf dieser Datei. Ereignisse je Seitenaufruf; wer
  darunter liegt, ist Maschinenverkehr.

  Gemessen: Menschen 0,59 — Crawler 0,00016 und 0. Die Schwelle liegt
  zwanzigfach unter dem einen und dreihundertfach ueber dem anderen. Wer sie
  aendert, misst vorher die Zahlen im Kopf dieser Datei neu; eine Schwelle
  ohne Messung dahinter ist geraten.
*/
export const MASCHINENSCHWELLE = 0.05;

const SPRACHEN = ['de', 'en', 'fr', 'es', 'it', 'ja', 'ar'];

const zahl = (wert) => (typeof wert === 'number' && Number.isFinite(wert) ? wert : Number(wert) || 0);
const runde = (wert, stellen) => Math.round(wert * 10 ** stellen) / 10 ** stellen;

/**
 * Formt die sechs Abfrageergebnisse zur Antwort.
 *
 * `ergebnisse` traegt je Name entweder `{ zeilen }` oder `{ fehler }`. Eine
 * gescheiterte Abfrage wird zu `null` und zu einem Eintrag in
 * `unvollstaendig` — NIEMALS zu einer Null. Eine Null saehe aus wie „heute
 * hat niemand etwas gestartet", und das ist die eine Aussage, die dieser
 * Weg nie faelschlich machen darf: Saemi-Ra schloesse daraus, seine Werbung
 * habe nicht gewirkt.
 */
export function formeZusammenfassung({ ergebnisse, tage, gerechnetUm }) {
    const unvollstaendig = [];
    const zeilenVon = (name) => {
        const eintrag = ergebnisse[name];
        if (!eintrag || eintrag.fehler) {
            unvollstaendig.push({ block: name, grund: eintrag?.fehler ?? 'fehlt' });
            return null;
        }
        return eintrag.zeilen;
    };

    // ── Die Kennzahl ────────────────────────────────────────────────
    const gesamtZeilen = zeilenVon('startquoteGesamt');
    const g = gesamtZeilen?.[0] ?? null;
    const gesamt = gesamtZeilen === null ? null : {
        besucher_geschaetzt: zahl(g?.Besucher_geschaetzt),
        starts: zahl(g?.Starts),
        starts_je_besuch: zahl(g?.Starts_je_Besuch),
        verschiedene_sender: zahl(g?.Verschiedene_Sender),
    };

    // ── Je Tag ──────────────────────────────────────────────────────
    const tagZeilen = zeilenVon('startquote');
    const jeTag = tagZeilen === null ? null : tagZeilen.map((z) => ({
        /*
          Nur das Datum. `bin(…, 1d)` setzt die Uhrzeit immer auf 00:00; sie
          mitzuschicken taeuschte eine Genauigkeit vor, die nicht
          dahintersteht.
        */
        tag: String(z.Tag ?? '').slice(0, 10),
        aufrufe: zahl(z.Seitenaufrufe),
        besucher_geschaetzt: zahl(z.Besucher),
        starts: zahl(z.Starts),
        starts_je_besuch: zahl(z.Starts_je_Besuch),
    }));

    // ── Je Sprache, samt Crawlertrennung ────────────────────────────
    const sprachZeilen = zeilenVon('sprachen');
    const gemeldetZeilen = zeilenVon('sprachenGemeldet');

    let jeSprache = null;
    let menschlich = null;
    if (sprachZeilen !== null && gemeldetZeilen !== null) {
        /*
          Die Gegenprobe kommt je (Sprache, Was) und wird hier je Sprache
          aufaddiert. Das ist Nachbereitung einer vorhandenen Abfrage, keine
          zweite Abfrage.
        */
        const ereignisseJeSprache = new Map();
        for (const z of gemeldetZeilen) {
            const s = String(z.Sprache ?? '');
            ereignisseJeSprache.set(s, (ereignisseJeSprache.get(s) ?? 0) + zahl(z.Ereignisse));
        }

        jeSprache = sprachZeilen
            .filter((z) => SPRACHEN.includes(String(z.Sprache ?? '')))
            .map((z) => {
                const sprache = String(z.Sprache);
                const aufrufe = zahl(z.Aufrufe);
                const ereignisse = ereignisseJeSprache.get(sprache) ?? 0;
                const verhaeltnis = aufrufe > 0 ? ereignisse / aufrufe : 0;
                return {
                    sprache,
                    aufrufe,
                    besucher_geschaetzt: zahl(z.Besucher),
                    ereignisse,
                    ereignisse_je_aufruf: runde(verhaeltnis, 5),
                    /*
                      Das Kennzeichen, nicht die Loeschung. Die Rohzahlen
                      bleiben vollstaendig stehen — wer sie braucht, findet
                      sie; wer die belastbare Summe will, nimmt `menschlich`.
                    */
                    maschinenverkehr: verhaeltnis < MASCHINENSCHWELLE,
                };
            });

        const menschen = jeSprache.filter((s) => !s.maschinenverkehr);
        menschlich = {
            /*
              Diese Summe ist eine OBERGRENZE, keine Zahl. `dcount` hat je
              Sprache gerechnet; dieselbe Adresse kann in zwei Fassungen
              auftauchen und wird dann zweimal gezaehlt. In der Praxis
              wechselt kaum jemand die Fassung — sauber ist es trotzdem
              nicht, und deshalb steht es hier und nicht bloss im README.
            */
            besucher_geschaetzt: menschen.reduce((s, x) => s + x.besucher_geschaetzt, 0),
            aufrufe: menschen.reduce((s, x) => s + x.aufrufe, 0),
            ereignisse: menschen.reduce((s, x) => s + x.ereignisse, 0),
            sprachen: menschen.map((s) => s.sprache),
        };
    }

    // ── Die uebrigen Ereignisarten ──────────────────────────────────
    const artZeilen = zeilenVon('ereignisarten');
    let ereignisarten = null;
    if (artZeilen !== null) {
        // Die Abfrage liefert je Art UND Tag; hier interessiert die Summe.
        // Der Tagesverlauf steht fuer die Starts schon in `je_tag`.
        ereignisarten = {};
        for (const z of artZeilen) {
            const was = String(z.Was ?? '');
            if (!was) continue;
            ereignisarten[was] = (ereignisarten[was] ?? 0) + zahl(z.Anzahl);
        }
    }

    // ── Die meistgestarteten Sender ─────────────────────────────────
    const senderZeilen = zeilenVon('senderListe');
    /*
      Die Abfrage holt sechzig; hierher gehen zwanzig. Sechzig Sender sind
      eine Tabelle zum Durchsehen, zwanzig sind eine Antwort auf „was laeuft
      gerade gut". Die Abfrage bleibt trotzdem unveraendert — sie ist die
      des Dashboards, und geschnitten wird hier, nicht dort.
    */
    const senderOben = senderZeilen === null ? null : senderZeilen.slice(0, 20).map((z) => ({
        sender: String(z.Sender ?? ''),
        starts: zahl(z.Starts),
        tage_mit_start: zahl(z.Tage_mit_Start),
        zuletzt: z.Zuletzt ?? null,
    }));

    return {
        fenster_tage: tage,
        gerechnet_um: new Date(gerechnetUm).toISOString(),
        gesamt,
        je_tag: jeTag,
        je_sprache: jeSprache,
        menschlich,
        ereignisarten,
        sender_oben: senderOben,
        unvollstaendig,
        hinweise: {
            besucher: 'Schaetzung, keine Zaehlung. Die Messzeilen tragen kein Adressfeld;'
                + ' die einzige Quelle ist das Zugriffsprotokoll mit gekuerzter Adresse —'
                + ' bei einem Anschluss mit vielen Geraeten zu niedrig, bei wechselnden'
                + ' Mobilfunkadressen zu hoch.',
            maschinenverkehr: 'Eine Sprache gilt als Maschinenverkehr, wenn auf einen'
                + ` Seitenaufruf weniger als ${MASCHINENSCHWELLE} Messereignisse kommen.`
                + ' Crawler fuehren kein JavaScript aus und koennen daher kein Ereignis'
                + ' erzeugen.',
            aufrufe: 'aufrufe und besucher_geschaetzt in je_sprache und je_tag enthalten'
                + ' Crawler. Die um Maschinenverkehr bereinigte Summe steht in menschlich.',
            quelle: 'Dieselben KQL-Abfragen wie die Arbeitsmappe in infra/dashboard.bicep.',
        },
    };
}

// ── Der Zwischenspeicher ────────────────────────────────────────────

/*
  WARUM UEBERHAUPT ZWISCHENGESPEICHERT WIRD

  Jeder Abruf loeste sechs Log-Analytics-Abfragen aus, und die werden nach
  gelesener Datenmenge abgerechnet. Der Sinn dieses Weges ist aber, dass
  eine Beobachtung ihn HAEUFIG fragt — alle zwei Minuten waeren 4.320
  Abfragen am Tag fuer Zahlen, die sich stuendlich kaum aendern. Das waere
  absurd.

  Stuendlich neu rechnen heisst hoechstens 144 Abfragen am Tag (drei Fenster
  mal sechs Abfragen mal 24 Stunden), und selbst die nur, wenn wirklich
  jemand fragt: Es gibt KEINEN Timer. Gerechnet wird beilaeufig, angestossen
  von einem echten Abruf — dieselbe Regel wie beim Aufraeumen in
  sitzung.mjs, und aus demselben Grund (Regel 3 im Kopf von server.mjs, die
  Leerlaufabrechnung von Container Apps).

  IM JSON STEHT, WANN GERECHNET WURDE. `gerechnet_um` und `alter_sekunden`
  sind nicht Zierde: Ohne sie haelt der Leser eine 55 Minuten alte Zahl fuer
  frisch, und bei „seit der Ankuendigung 340 Aufrufe" ist das der ganze
  Unterschied.

  EIN ZUG JE FENSTER. Fragen zwei Abrufe gleichzeitig dasselbe Fenster,
  laeuft die Rechnung EINMAL — der zweite haengt sich an dasselbe
  Versprechen. Ohne das waeren es zwoelf Abfragen statt sechs, und zwar
  genau dann, wenn es voll ist.
*/
export function erzeugeZusammenfassung({
    abfrager, schluessel = null, frischeMs = 60 * 60_000, uhr = Date.now,
} = {}) {
    // Je Fenster ein Eintrag: { stand, gerechnetUm, laeuft }
    const speicher = new Map();

    async function rechne(tage) {
        const namen = Object.keys(KQL);
        /*
          `allSettled` und nicht `all`: Faellt eine der sechs Abfragen aus,
          sollen die uebrigen fuenf trotzdem geliefert werden. `all` haette
          alles verworfen, und aus einer haengenden Abfrage waere eine leere
          Antwort geworden.
        */
        const ausgang = await Promise.allSettled(namen.map((name) => abfrager.fuehreAus(name, tage)));

        const ergebnisse = {};
        namen.forEach((name, i) => {
            const a = ausgang[i];
            ergebnisse[name] = a.status === 'fulfilled'
                ? { zeilen: a.value }
                : { fehler: a.reason?.grund ?? 'unbekannt' };
        });

        /*
          ALLE SECHS gescheitert heisst: Log Analytics ist weg. Dann entsteht
          gar kein Stand — der Aufrufer bekommt 503 und eine Begruendung
          statt einer Antwort, in der ueberall `null` steht und die man auf
          den ersten Blick fuer „nichts los" haelt.
        */
        if (namen.every((name) => ergebnisse[name].fehler)) {
            throw new ZahlenFehler(ergebnisse[namen[0]].fehler);
        }

        return formeZusammenfassung({ ergebnisse, tage, gerechnetUm: uhr() });
    }

    return {
        /*
          Der Schluessel reist MIT dem Zwischenspeicher, nicht getrennt.

          Beides gehoert zu diesem einen Weg, und ein Server, der den
          Zwischenspeicher bekommt, aber den Schluessel nicht, waere ein
          offener Datenfeed. Zusammen in einem Buendel kann das nicht
          passieren: Wer `zahlen` hat, hat beides oder nichts.
        */
        schluessel,

        /**
         * Liefert `{ zahlen, frisch, alterSekunden, stoerung }`.
         *
         * Wirft ZahlenFehler nur, wenn es NICHTS zu liefern gibt — also
         * wenn die Quelle ausfaellt und auch kein alter Stand daliegt.
         */
        async hole(tage) {
            const eintrag = speicher.get(tage) ?? {};
            const alter = eintrag.stand ? uhr() - eintrag.gerechnetUm : Infinity;

            if (eintrag.stand && alter < frischeMs) {
                return { zahlen: eintrag.stand, frisch: true, alterSekunden: Math.round(alter / 1000) };
            }

            // Ein Zug je Fenster, siehe oben.
            if (!eintrag.laeuft) {
                eintrag.laeuft = rechne(tage)
                    .then((zahlen) => {
                        eintrag.stand = zahlen;
                        eintrag.gerechnetUm = uhr();
                        return zahlen;
                    })
                    .finally(() => { eintrag.laeuft = null; });
                speicher.set(tage, eintrag);
            }

            try {
                const zahlen = await eintrag.laeuft;
                return { zahlen, frisch: true, alterSekunden: 0 };
            } catch (fehler) {
                /*
                  Die Rechnung ist gescheitert. Liegt ein alter Stand da,
                  geht der hinaus — MIT `frisch: false` und mit `stoerung`.
                  Eine veraltete Zahl, die sich als veraltet zu erkennen
                  gibt, ist brauchbar; eine veraltete Zahl, die sich als
                  frisch ausgibt, ist eine Luege.
                */
                if (eintrag.stand) {
                    return {
                        zahlen: eintrag.stand,
                        frisch: false,
                        alterSekunden: Math.round((uhr() - eintrag.gerechnetUm) / 1000),
                        stoerung: fehler?.grund ?? 'unbekannt',
                    };
                }
                throw fehler instanceof ZahlenFehler ? fehler : new ZahlenFehler('nicht_erreichbar', fehler);
            }
        },
    };
}
