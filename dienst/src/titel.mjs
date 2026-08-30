/*
  ═══════════════════════════════════════════════════════════════════
  Was gerade läuft — der Titel aus dem Tonstrom.

  DER ANLASS ist die Rückmeldung eines Testers (432hz-radio#9):

    „Irgendwie stimmt dann das Bild vom Plattenladen nicht mehr, wenn man
     zwar weiß, welches Genre, aber nicht welcher Künstler."

  Heute kennt die Seite den Titel bei rund 36 von 165 Sendern — über
  Icecast-Statusadressen mit CORS, über SomaFMs eigene Adresse und aus dem
  HLS-Strom. Die übrigen schicken ihn sehr wohl mit, nur an einer Stelle, an
  die ein Browser nicht kommt: mitten im Tonstrom.

  ICY funktioniert so: Der Server nennt im Kopf ein `icy-metaint`, und alle
  so viele Bytes steckt ein Block zwischen den Tondaten. Das `<audio>`-
  Element schluckt ihn und gibt nur Ton heraus. Selbst mitzulesen hieße, den
  Strom ein zweites Mal zu laden — doppelte Bandbreite beim Besucher, für
  eine Textzeile.

  Also liest ihn dieser Dienst: kurz anhängen, den ersten Block lesen,
  Verbindung zu. Rund 16 KB je Sender, nicht der ganze Strom.

  ── DREI ENTSCHEIDUNGEN, DIE NICHT VERHANDELBAR SIND ────────────────

  1 · EINE ANTWORT FÜR ALLE, KEIN SENDER IN DER ANFRAGE

  Der naheliegende Weg wäre „was läuft gerade auf kiosk-radio?". Dann
  entsteht bei jedem Zuhörer alle zwanzig Sekunden eine Anfrage, die verrät,
  was er hört — über eine Stunde ein Muster neben einer Adresse im
  Zugriffsprotokoll. Aus einer Messung, die bewusst kein Adressfeld hat,
  würde so durch die Hintertür ein Hörprotokoll.

  Deshalb liefert `hole()` IMMER ALLE bekannten Titel, für jeden dieselbe
  Antwort. Eine Anfrage sagt dann nichts darüber, wer was hört. Es ist ein
  Anschlagbrett, kein Dialog.

  2 · KEIN TIMER

  Container Apps rechnet Leerlauf ab. Ein Intervall, das alle zwanzig
  Sekunden 165 Ströme anfasst, läuft auch nachts um vier, wenn niemand
  zuhört — und hält den Behälter wach, der sonst einschliefe.

  Gerechnet wird deshalb beiläufig: Ein echter Abruf liefert sofort den
  vorhandenen Stand und stößt im Hintergrund nach, was zu alt ist. Der
  nächste Abruf sieht das Ergebnis. Fragt niemand, passiert nichts.

  3 · GEDECKELT, UND ZWAR MIT AUSGERECHNETER OBERGRENZE

  Bei 165 Sendern alle zwanzig Sekunden wären es rund 8 MB je Stunde für
  nichts. Deshalb:

    · VORRANG für Sender, die zuletzt wirklich gestartet wurden (aus den
      Zahlen) — aber kein Ausschluss der übrigen, siehe REIHUM
    · ein Titel gilt ALTER_MS lang als frisch
    · höchstens JE_ZUG Ströme in einem Nachschub, GLEICHZEITIG davon
      wenige

  Rechnung im eingeschwungenen Zustand: 10 Ströme × 16 KB alle 90 s sind
  rund 6 MB je Stunde — und nur, solange überhaupt jemand fragt.

  ── WAS HIER NICHT PASSIERT ─────────────────────────────────────────

  Kein Sender wird in einer Anfrage genannt. Keine Kennung, kein Plätzchen,
  keine Sitzung. Der Dienst weiß nicht, wer fragt, und die Antwort ist für
  alle gleich. Was er nach außen sendet, sind Anfragen an dieselben Ströme,
  die die Besucher ohnehin hören — mit einem Kopfeintrag mehr.
  ═══════════════════════════════════════════════════════════════════
*/

/** Wie lange ein gelesener Titel als frisch gilt. */
export const ALTER_MS = 90_000;

/*
  Dieselbe Frist fuer einen Sender, den gerade jemand hoert.

  DER ANLASS ist gemessen, nicht ausgedacht (432hz-radio#12). Saemi-Ra hat
  es gehoert, bevor eine Zahl es zeigte:

    "Auf ByteFM ist die aktuelle Titelanzeige nicht korrekt, eher einen
     Titel hinterher."

  Nachgemessen waren 51 von 117 Titeln veraltet, bei ByteFM zweieinhalb
  Minuten. Das war kein Fehler, sondern die Umlaufzeit: JE_ZUG Stroeme je
  Nachschub, jeder Sender fruehestens nach ALTER_MS wieder, ueber 150
  Sender — rund achtzehn Minuten fuer eine Runde. Ein Stueck laeuft vier.
  Also stand meistens der vorletzte Titel da.

  WARUM EINE ZWEITE FRIST und nicht einfach ALTER_MS herunter: Die 90 s
  sind die Ruecksicht auf fremde Server fuer die grosse Mehrheit, die
  gerade niemand hoert. Sie zu senken hiesse, 150 Sender oefter anzufassen,
  um einer Handvoll willen.

  Die Vorrangliste, die es dafuer braucht, gibt es schon: dieselbe, aus der
  unten die Restplaetze verteilt werden. Es kommt kein Merkmal dazu, keine
  Anfrage nennt einen Sender, und die Antwort bleibt fuer alle dieselbe.

  ZUR ZAHL: Ein Stueck laeuft rund vier Minuten. Bei 25 s steht der Titel
  spaetestens nach einem Sechzehntel eines Stueckes richtig da — genauer
  als jeder Mensch es bemerkt. Gleichzeitig gehoert werden bei den heutigen
  Besucherzahlen eine Handvoll Sender; fuenf Stroeme alle 25 s sind rund
  11 MB je Stunde, in derselben Groessenordnung wie die 6 MB von heute.
  Und wie diese fallen sie nur an, solange ueberhaupt jemand fragt.
*/
export const ALTER_BEOBACHTET_MS = 25_000;

/**
 * Wie lange die AUSGELIEFERTE Antwort zwischengespeichert wird.
 *
 * Kürzer als ALTER_MS, und das ist Absicht: Der Abruf soll den Nachschub
 * anstoßen dürfen, auch wenn die Antwort selbst noch steht.
 */
export const ANTWORT_MS = 20_000;

/** Höchstens so viele Sender werden überhaupt beobachtet. */
export const SENDER_HOECHSTENS = 25;

/** Höchstens so viele Ströme je Nachschub. */
export const JE_ZUG = 10;

/** Davon gleichzeitig. Mehr bringt nichts und fällt fremden Servern auf. */
export const GLEICHZEITIG = 4;

/*
  So viele Plätze eines Zuges bleiben den Sendern OHNE Vorrang.

  Ohne sie käme ein Sender, den heute zum ersten Mal jemand auflegt, bis zu
  eine Stunde lang gar nicht dran — so lange gelten die Zahlen, aus denen
  die Vorrangliste stammt. Mit drei Restplätzen ist bei 156 Sendern jeder
  spätestens nach gut fünfzig Zügen einmal gelesen, und das kostet drei
  Ströme mehr je Zug.
*/
export const REIHUM = 3;

/** Nach so langer Zeit wird eine Verbindung abgebrochen. */
export const ZEITLIMIT_MS = 6_000;

/**
 * Obergrenze für das, was aus einem Strom gelesen wird, bevor aufgegeben
 * wird. `icy-metaint` liegt üblicherweise bei 16.000; ein Server, der
 * 10 MB nennt, bekommt hier ein Nein statt unserer Bandbreite.
 */
export const METAINT_HOECHSTENS = 64_000;

/*
  Zeichenketten, die kein Titel sind.

  Alle GEMESSEN, nicht ausgedacht — sie stehen so in den Strömen:

    Rinse FM, Kool FM     „Now Playing info goes here"  (Vorgabe der Software)
    dublab Barcelona      „Airtime - offline"           (Zustandsmeldung)
    Refuge Worldwide      „** Repeats (Master List)"    (Sendeplan)
    Rinse France          „-"                           (leer mit Strich)

  IM ZWEIFEL NICHTS ANZEIGEN. Ein Feld, das „Now Playing info goes here"
  sagt, ist schlimmer als ein leeres: Das leere sagt „wissen wir nicht", das
  andere sagt es auch, sieht aber aus wie eine Auskunft.

  Die Liste ist bewusst klein und wörtlich. Ein Muster wie /offline/i würde
  „Offline Pizza Kartell" mitverwerfen — es gibt Künstler mit solchen Namen,
  und ein Filter, der echte Titel frisst, ist schlimmer als einer, der einen
  Platzhalter durchlässt.
*/
export const KEINE_TITEL = new Set([
    'now playing info goes here',
    'airtime - offline',
    'offline',
    'unknown',
    'unknown artist - unknown title',
    'no title',
    'currently offline',
    'live',
    'live stream',
    'stream',
    '-',
    '.',
]);

/**
 * Macht aus dem, was im Strom steht, das, was auf der Hülle stehen darf.
 *
 * Die Textarbeit im Einzelnen macht Sāmi-Ra; hier steht nur, was ohne
 * Kenntnis der Sender sicher richtig ist:
 *
 *   · Leerraum weg, auch der doppelte in der Mitte
 *   · ein führender Strich weg — „- Lil Uzi Vert - Ps & Qs" ist ein Titel
 *     mit leerem Künstlerfeld davor, kein Titel, der mit Strich beginnt
 *   · bekannte Platzhalter verwerfen
 *   · alles unter drei Zeichen verwerfen
 *
 * Gibt `null` zurück, wenn nichts Brauchbares übrig bleibt. Niemals eine
 * leere Zeichenkette: Der Unterschied zwischen „kein Titel bekannt" und
 * „Titel ist leer" soll nicht erst beim Anzeigen entstehen.
 */
export function saeubereTitel(roh, sender = '') {
    if (typeof roh !== 'string') return null;
    let t = roh.replace(/\s+/g, ' ').trim();

    /*
      Erst der Anhang, dann der Name — die Reihenfolge ist nicht beliebig.
      Andersherum bliebe von `NDR Kultur - www.ndr.de/kultur` die nackte
      Adresse stehen: Der Name faellt weg, und was das Trennzeichen ihm
      vorher gab, faellt mit.
    */
    t = ohneSendername(ohneAnhang(t), sender);

    /*
      Zwei Sternchen sind bei Shoutcast und Airtime die Marke für eine
      Systemzeile, keine Auszeichnung: `** Repeats (Master List)`.

      Die Prüfung steht VOR dem Abschneiden, und das ist der ganze Punkt.
      Schnitte man sie erst weg, bliebe „Repeats (Master List)" übrig —
      etwas, das wie ein Titel aussieht und keiner ist. Ein Platzhalter,
      den man als Platzhalter erkennt, ist harmlos; einer, der sich als
      Titel ausgibt, nicht.
    */
    if (/^\*\*/.test(t)) return null;

    /*
      WBGO schiebt Werbung mit eigener Marke ein:
      `AD_INSERT - THIS STATION WILL CONTINUE AFTER THIS BREAK`. Der Text
      dahinter wechselt, die Marke nicht — deshalb sie und nicht der Satz.
    */
    if (/^ad_insert\b/i.test(t)) return null;

    // Führende Striche und Aufzählungszeichen, auch mehrere.
    t = t.replace(/^[\s\-–—*·|]+/, '').trim();
    if (t.length < 3) return null;
    if (KEINE_TITEL.has(t.toLowerCase())) return null;

    /*
      Bleibt am Ende nur der Sendername uebrig, ist nichts uebrig.
      Gemessen bei NDR Kultur: `NDR Kultur - www.ndr.de/kultur` — die
      Adresse faellt oben weg, und was dasteht, ist der Name des Senders,
      der auf der Seite ohnehin danebensteht.
    */
    if (sender && t.toLowerCase() === sender.trim().toLowerCase()) return null;
    return t;
}

/*
  Manche Häuser stellen ihren eigenen Namen vor den Titel:
  `Refuge Worldwide - ** Repeats (Master List)`. Weg damit — er steht auf
  der Seite ohnehin schon daneben, und er verdeckt hier, was dahinter für
  ein Text kommt.

  Nur der VOLLE Name, und nur mit Trennzeichen dahinter. „Jazz - Autumn
  Leaves" bei einem Sender namens „Jazz" bliebe damit unangetastet, denn
  drei Zeichen sind zu wenig, um sicher zu sein.
*/
function ohneSendername(t, sender) {
    if (typeof sender !== 'string' || sender.trim().length < 5) return t;
    const flucht = sender.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const gekuerzt = t.replace(new RegExp(`^${flucht}\\s*[-–—:|]\\s*`, 'i'), '').trim();
    return gekuerzt.length >= 3 ? gekuerzt : t;
}

/*
  Und manche hängen ihre Werbung hinten an:
  `Riders in the Sky by George Melachrino - Classic Vinyl on walmradio.com`

  Erkannt wird nicht der Sendername — der steht dort in einer anderen Form
  als im Katalog („Classic Vinyl" gegen „Classic Vinyl HD") —, sondern die
  Netzadresse. Ein Musiktitel endet nicht auf einer Domain; eine Beilage
  des Hauses fast immer.

  Die Endungen stehen wörtlich da, statt `\w+` zu nehmen. Sonst fiele
  „Sunday Morning - Live at Studio 4.0" mit, und ein Filter, der echte
  Titel frisst, ist schlimmer als einer, der eine Werbezeile durchlässt.
*/
const ENDUNGEN = 'com|net|org|fm|de|at|ch|uk|ru|io|co|tv|radio|live|info|eu';

function ohneAnhang(t) {
    const adresse = `(www\\.|[a-z0-9-]+\\.(${ENDUNGEN})\\b)`;

    // Venice Classic Radio haengt sie in geschweiften Klammern an:
    // `... {+info: veniceclassicradio.eu}`
    let k = t.replace(new RegExp(`\\s*\\{[^}]*${adresse}[^}]*\\}\\s*$`, 'i'), '').trim();

    /*
      Und die uebrigen hinter dem letzten Trennzeichen. Geschnitten wird
      mit `replace`, nicht mit `split`/`join`: Frisky trennt mit
      senkrechten Strichen, und die sollen senkrechte Striche bleiben.
    */
    k = k.replace(new RegExp(`\\s[-–—|]\\s[^-–—|]*${adresse}[^-–—|]*$`, 'i'), '').trim();
    return k.length >= 3 ? k : t;
}

/**
 * Liest den ersten ICY-Metadatenblock eines Stroms.
 *
 * Gibt `{ titel }` zurück — `titel` ist die ROHE Zeichenkette oder `null`.
 * Gesäubert wird eine Ebene höher, damit sich beides getrennt prüfen lässt.
 *
 * Wirft nicht. Ein Sender, der nicht antwortet, ist der Normalfall und kein
 * Ereignis: Von 156 gemessenen Strömen hatten 26 gar kein ICY und 15 einen
 * leeren Block.
 */
export async function liesIcyTitel(url, {
    holeStrom = fetch, zeitlimit = ZEITLIMIT_MS,
} = {}) {
    const abbruch = new AbortController();
    const wecker = setTimeout(() => abbruch.abort(), zeitlimit);
    let leser = null;
    try {
        const antwort = await holeStrom(url, {
            headers: { 'Icy-MetaData': '1' },
            signal: abbruch.signal,
            redirect: 'follow',
        });
        if (!antwort.ok || !antwort.body) return { titel: null };

        const intervall = Number(antwort.headers.get('icy-metaint'));
        if (!Number.isInteger(intervall) || intervall <= 0
            || intervall > METAINT_HOECHSTENS) {
            return { titel: null };
        }

        // Der Block ist höchstens 255 × 16 Bytes lang — so steht es im
        // Verfahren, das Längenbyte zählt in Sechzehnerschritten.
        const genug = intervall + 1 + 255 * 16;
        leser = antwort.body.getReader();
        const teile = [];
        let gesamt = 0;

        while (gesamt < genug) {
            const { value, done } = await leser.read();
            if (done) break;
            teile.push(value);
            gesamt += value.length;
            if (gesamt <= intervall) continue;

            const puffer = zusammen(teile, gesamt);
            const laenge = puffer[intervall] * 16;
            // Längenbyte 0 heißt: Es hat sich seit dem letzten Block nichts
            // geändert. Kein Fehler, nur keine Auskunft.
            if (laenge === 0) return { titel: null };
            if (puffer.length < intervall + 1 + laenge) continue;

            const roh = new TextDecoder('utf-8', { fatal: false })
                .decode(puffer.subarray(intervall + 1, intervall + 1 + laenge));
            const treffer = roh.match(/StreamTitle='((?:[^']|'(?!;))*)'/);
            return { titel: treffer ? treffer[1] : null };
        }
        return { titel: null };
    } catch {
        // Zeitüberschreitung, Namensauflösung, Zertifikat, abgebrochen —
        // für den Aufrufer ist all das dasselbe: kein Titel.
        return { titel: null };
    } finally {
        clearTimeout(wecker);
        // Erst den Leser lösen, dann abbrechen. Andersherum wirft der
        // Abbruch in ein laufendes read() hinein, und Node meldet einen
        // unbehandelten Fehler in einem Promise, das niemandem gehört.
        try { await leser?.cancel(); } catch {}
        try { abbruch.abort(); } catch {}
    }
}

function zusammen(teile, gesamt) {
    if (teile.length === 1) return teile[0];
    const alles = new Uint8Array(gesamt);
    let stelle = 0;
    for (const t of teile) { alles.set(t, stelle); stelle += t.length; }
    teile.length = 0;
    teile.push(alles);
    return alles;
}

/**
 * Der Stand: welcher Sender spielt was, und wie alt ist die Auskunft.
 *
 * `holeSenderliste`  liefert `[{ id, stream }]` — die Sender, die überhaupt
 *                    in Frage kommen. Wird selten aufgerufen und
 *                    zwischengespeichert.
 * `holeBeobachtete`  liefert die Kennungen der zuletzt gestarteten Sender,
 *                    oder `null`, wenn das gerade nicht zu erfahren ist.
 *                    Damit steht die Deckelung auf dem, was Leute wirklich
 *                    hören, statt auf einem Rundlauf durch alle 165.
 */
export function erzeugeTitel({
    holeSenderliste, holeBeobachtete = async () => null,
    holeStrom = fetch, jetzt = () => Date.now(), protokolliere = () => {},
} = {}) {
    /** id -> { titel, stand } */
    const stand = new Map();
    let senderliste = null;
    let senderlisteStand = 0;
    let laeuftNachschub = false;
    let letzteAntwort = null;
    let letzteAntwortStand = 0;

    async function senderMitStrom() {
        // Die Liste ändert sich mit jedem Ausrollen, nicht im Betrieb.
        // Eine Stunde ist reichlich und spart 142 KB je Abruf.
        if (senderliste && jetzt() - senderlisteStand < 3_600_000) return senderliste;
        try {
            const liste = await holeSenderliste();
            if (Array.isArray(liste) && liste.length) {
                senderliste = liste.filter((s) => s?.id && typeof s.stream === 'string'
                    // HLS trägt den Titel im Strom mit; das liest die
                    // Abspielmaschine im Browser selbst. Dieser Weg ist für
                    // die anderen.
                    && !s.stream.includes('.m3u8'));
                senderlisteStand = jetzt();
            }
        } catch { /* alter Stand bleibt stehen */ }
        return senderliste || [];
    }

    async function welcheNachsehen() {
        const alle = await senderMitStrom();
        if (!alle.length) return [];

        let beobachtet = null;
        try {
            const liste = await holeBeobachtete();
            if (Array.isArray(liste) && liste.length) beobachtet = new Set(liste);
        } catch { /* dann gibt es eben keine Vorrangliste */ }

        // Die ältesten zuerst. Ein Sender ohne Eintrag zählt als unendlich
        // alt und kommt damit vor allen, die schon einmal gelesen wurden.
        const jetztMs = jetzt();
        // Wer gerade gehoert wird, ist frueher wieder faellig. Ohne
        // Vorrangliste gilt fuer alle dieselbe Frist wie bisher.
        const frist = (id) => (beobachtet?.has(id) ? ALTER_BEOBACHTET_MS : ALTER_MS);
        const faellig = alle
            .map((s) => ({ s, alter: jetztMs - (stand.get(s.id)?.stand ?? -Infinity) }))
            .filter((x) => x.alter >= frist(x.s.id))
            .sort((a, b) => b.alter - a.alter);

        if (!beobachtet) return faellig.slice(0, JE_ZUG).map((x) => x.s);

        /*
          VORRANG STATT AUSSCHLUSS — und das ist eine Berichtigung.

          Zuerst stand hier ein Filter: Wer nicht in der Beobachtungsliste
          steht, wird gar nicht gelesen. Saemi-Ras Einwand dazu trifft
          (432hz-radio#9):

            „Ein Sender, den heute zum ersten Mal jemand auflegt, steht dort
             noch nicht — also gerade der Fall, um den es dem Tester ging."

          Die Liste kommt aus `sender_oben` und die Zahlen dahinter gelten
          bis zu einer Stunde. Ein Sender, den gerade jemand entdeckt, waere
          also eine Stunde lang genau der, ueber den nichts dasteht.

          Deshalb: RESTPLAETZE. Die Beobachteten bekommen den Vorrang, aber
          die letzten REIHUM Plaetze eines Zuges gehen an die aeltesten
          aller uebrigen. Damit kommt jeder Sender ueber ein paar Zuege
          hinweg dran, ohne dass die Deckelung faellt.

          Nicht gewaehlt: die Seite den Sender nennen zu lassen. Das waere
          der kurze Weg und der falsche — eine Anfrage mit Sender landet
          samt Adresse im Zugriffsprotokoll, alle zwanzig Sekunden neu, und
          ergibt damit nicht nur den Anfang, sondern die Dauer. Genau das
          Hoerprotokoll, das diese Bauart vermeidet.
        */
        const vorrang = faellig.filter((x) => beobachtet.has(x.s.id));
        const uebrige = faellig.filter((x) => !beobachtet.has(x.s.id));
        const ausVorrang = vorrang.slice(0, Math.max(0, JE_ZUG - REIHUM));
        const ausReihum = uebrige.slice(0, JE_ZUG - ausVorrang.length);
        return [...ausVorrang, ...ausReihum].map((x) => x.s);
    }

    async function nachschub() {
        if (laeuftNachschub) return;
        laeuftNachschub = true;
        try {
            const dran = await welcheNachsehen();
            if (!dran.length) return;
            let gelesen = 0;
            const reihe = dran.slice();
            const arbeiter = Array.from({ length: Math.min(GLEICHZEITIG, reihe.length) },
                async () => {
                    for (;;) {
                        const s = reihe.shift();
                        if (!s) return;
                        const { titel } = await liesIcyTitel(s.stream, { holeStrom });
                        const sauber = saeubereTitel(titel, s.name);
                        // Auch ein Fehlschlag setzt den Zeitstempel: Sonst
                        // stünde derselbe tote Sender bei jedem Zug wieder
                        // ganz oben und verdrängte die anderen.
                        stand.set(s.id, { titel: sauber, stand: jetzt() });
                        if (sauber) gelesen += 1;
                    }
                });
            await Promise.all(arbeiter);
            protokolliere({ art: 'titel', ergebnis: 'ok',
                            angefragt: dran.length, gelesen });
        } catch (fehl) {
            protokolliere({ art: 'titel', ergebnis: 'fehler', grund: fehl?.name });
        } finally {
            laeuftNachschub = false;
            letzteAntwortStand = 0;   // die Antwort neu bauen lassen
        }
    }

    return {
        /**
         * Der Stand für alle. Liefert sofort, was da ist, und stößt im
         * Hintergrund an, was zu alt ist — der nächste Abruf sieht es.
         */
        hole() {
            const jetztMs = jetzt();
            if (!letzteAntwort || jetztMs - letzteAntwortStand >= ANTWORT_MS) {
                const titel = {};
                for (const [id, eintrag] of stand) {
                    if (eintrag.titel) titel[id] = eintrag.titel;
                }
                letzteAntwort = { stand: Math.floor(jetztMs / 1000), titel };
                letzteAntwortStand = jetztMs;
            }
            // Bewusst NICHT abgewartet: Der Abrufer soll nicht auf fremde
            // Server warten. Ein abgewiesenes Promise wird verschluckt, es
            // ist im Nachschub schon behandelt.
            nachschub().catch(() => {});
            return letzteAntwort;
        },

        /** Für Tests und für einen ersten Stand beim Hochfahren. */
        async fuelle() { await nachschub(); },

        /** Wie viele Sender gerade einen brauchbaren Titel haben. */
        anzahl() {
            let n = 0;
            for (const e of stand.values()) if (e.titel) n += 1;
            return n;
        },
    };
}
