// ============================================================
// Service Worker — 432Hz Radio PWA
// Caches the app shell & manifest, network-first for live
// metadata/stream endpoints, falls back to cache when offline.
// ============================================================

// Bei JEDER Änderung an SHELL_FILES hochzählen. Ohne neue Fassung behalten
// bestehende Besucher ihren alten Zwischenspeicher — und damit alles, was
// darin fehlt. Genau daran hing der Offline-Fehler mit den drei nicht
// gelisteten Modulen.
// v34: „Zum Einschlafen" in der Filterleiste — und die Chips haben endlich
// einen Stil. app.js, achsen.mjs, styles.css und alle sieben Kataloge.
//
// v33: Der Sender der Woche zieht wieder aus der gefilterten Menge. Nur
// app.js hat sich geaendert — aber die steht im Vorrat, also zaehlt es.
//
// v32: Das Menue im Kopf. index.html, styles.css, app.js, symbole.mjs und
// alle sieben Kataloge haben sich geaendert — und damit auch alle sieben
// Sprachseiten.
//
// ERSTE FASSUNG, DIE NICHT VON HAND GEFUNDEN WURDE. pruefe-zwischenspeicher.py
// hat die vierzehn geaenderten Dateien gemeldet, bevor irgendetwas gepusht
// war. Genau dafuer ist es da.
//
// v31: Die Regalnamen sind jetzt auch uebersetzt. app.js und alle sieben
// Sprachseiten haben sich geaendert.
//
// v30: NACHGEZOGEN, NICHT SELBST VERURSACHT.
//
// 97250be hat die Katalogtexte in sechs Sprachen uebersetzt — 165 Sender
// und 11 Regale je Sprache —, dazu assets/app.js und alle sieben
// Sprachseiten geaendert. Die Fassung blieb dabei auf v29 stehen.
//
// Beides liegt im Zwischenspeicher: app.js steht in SHELL_FILES, die
// Sprachseiten kommen ueber SPRACHEN.flatMap dazu. Ohne neue Nummer haette
// jeder BESTEHENDE Besucher seine alte deutsche Seite behalten — dauerhaft.
//
// Genau das hat Sāmi-Ra am 01.09.2026 gemeldet: „Die internationalen Seiten
// ergeben keinen Sinn, wenn der meiste Text immer noch auf deutsch ist."
// Frisch aufgerufen war die Uebersetzung schon da; er sah seinen eigenen
// Zwischenspeicher.
//
// Der Satz ganz oben in dieser Datei sagt es seit jeher: Bei JEDER Aenderung
// an SHELL_FILES hochzaehlen.
//
// v29: Das Lichtspiel am Tellerrand und der Glanz auf den Rillen.
//
// v28: Kopfknopf „Mitnehmen", und die Statusleiste sagt nicht mehr
// „gemessen", wo nichts gemessen wird. app.js und alle sieben Kataloge
// haben sich geaendert.
//
// v27: retuner.wasm und retuner-worklet.js haben denselben Namen, aber
// anderen Inhalt — die gute Engine ist dazugekommen. Ohne neue Fassung
// behielte jeder bestehende Besucher fuer immer die alte Datei.
const SW_VERSION = 'iyambae-v34';
const SHELL_CACHE = `${SW_VERSION}-shell`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

// Die sieben Sprachen. Muss zu Scripts/baue-sprachen.py und zu
// assets/lib/sprache.mjs passen — Scripts/pruefe-sprachen.py haelt die drei
// Listen gegeneinander.
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it', 'ja', 'ar'];

const SHELL_FILES = [
    // Jede Sprachseite und ihr Manifest. Sieben Seiten statt einer, weil
    // jede Sprache jetzt eine eigene Adresse hat — und weil ein Umschalten
    // ohne Netz sonst ins Leere liefe.
    //
    // Die Wurzel '/' steht bewusst NICHT hier: Sie antwortet mit einer
    // Umleitung, und eine Umleitung im Zwischenspeicher waere eine
    // eingefrorene Sprachentscheidung.
    ...SPRACHEN.flatMap((s) => [`/${s}/`, `/${s}/manifest.webmanifest`]),
    // Und jede Sprachdatei, aus demselben Grund.
    ...SPRACHEN.map((s) => `/assets/lang/${s}.json`),

    '/icon.svg',
    '/icon-192.png',
    // Vom Manifest verlangt, fehlte bisher.
    '/icon-512.png',
    '/assets/logo/icon-maskable-512.png',
    // Ladeschirm und Logo im Kopf. Ohne dieses Bild oeffnet der Laden
    // offline mit einer leeren Flaeche.
    '/assets/logo/iyambae-marke.svg',
    // Die runde Fassung fuer das Plattenlabel, auf den blauen Punkt
    // ausgerichtet — der sitzt beim Drehen auf der Spindel.
    '/assets/logo/iyambae-label.svg',
    /*
      Das Foto des Plattenspielers (92 KiB) steht BEWUSST NICHT hier —
      aus demselben Grund, aus dem vorher die drei Texturen fehlten:

      Es steht ueber der Falz, das HTML holt es also ohnehin beim ersten
      Anstrich. Der Neuladen-Schalter am Request geht am
      HTTP-Zwischenspeicher vorbei (siehe install-Behandler weiter unten)
      — es kaeme also ZWEIMAL ueber die Leitung, rund 184 KiB auf einem
      kalten Erstbesuch, fuer null zusaetzliche Offlinedeckung.

      Im Laufzeit-Zwischenspeicher landet es trotzdem, sobald das HTML es
      geholt hat. Ab dem zweiten Besuch ist es offline da.

      iyambae-label.svg steht dagegen weiter im Vorrat: Das wird offline
      gebraucht, bevor das CSS ueberhaupt laeuft.

      Die drei erzeugten Texturen (vinyl, filz, metall) sind fort — mit
      dem gezeichneten Plattenspieler, den sie ueberzogen haben.
    */
    '/assets/styles.css',
    '/assets/schrift/schriften.css',
    // Die SIL OFL verlangt, dass der Lizenztext die Schriften begleitet.
    '/assets/schrift/LIZENZEN.txt',
    '/assets/app.js',
    // Jedes Modul, das app.js importiert, muss hier stehen. Fehlt eines,
    // bricht offline der ganze Start ab — ein fehlendes ES-Modul reisst das
    // Skript mit. Scripts/pruefe-shell-dateien.py wacht darueber.
    '/assets/lib/gewichtung.mjs',
    '/assets/lib/verlauf.mjs',
    '/assets/lib/verwandt.mjs',
    '/assets/lib/myretuner.mjs',
    '/assets/lib/titel.mjs',
    '/assets/lib/wochentipp.mjs',
    '/assets/lib/senderbild.mjs',
    '/assets/lib/symbole.mjs',
    '/assets/lib/achsen.mjs',
    '/assets/lib/messung.mjs',
    '/assets/lib/sprache.mjs',
    '/assets/lib/aktualisierung.mjs',
    '/assets/lib/fehlerbericht.mjs',
    // Das Konto. Es steht hier NICHT, damit die Anmeldung offline liefe —
    // sie tut es nicht, und soll es auch nicht. Es steht hier, weil app.js
    // es importiert: Ein fehlendes ES-Modul reisst offline den ganzen Start
    // mit, und dann laeuft nicht einmal mehr die Musik. Der Zugriff auf
    // /api/ selbst wird vom fetch-Behandler weiter unten ausdruecklich
    // durchgereicht und nie abgelegt.
    '/assets/lib/konto.mjs',
    // Der Signalkern des IYAMBAE Tuners. Der Worklet wird nicht importiert, sondern per
    // addModule geladen, und die .wasm per fetch — beides sieht der
    // import-Ausdruck nicht. Scripts/pruefe-shell-dateien.py prueft deshalb
    // auch diese beiden Wege.
    '/assets/lib/retuner-worklet.js',
    '/assets/wasm/retuner.wasm',
    '/data/sender.json',
];

/** Welche Sprachseite zu dieser Adresse gehoert — Rueckfall Englisch. */
function sprachseite(url) {
    const erster = url.pathname.split('/').filter(Boolean)[0];
    return SPRACHEN.includes(erster) ? `/${erster}/` : '/en/';
}

// Install: pre-cache app shell so the page loads offline.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) =>
            cache.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' })))
        ).catch(() => {
            // In File:// or some test contexts caching may fail — non-fatal.
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
                    .map((k) => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// Wie geholt wird:
//   - eigene Dateien          → erst Netz, dann Zwischenspeicher
//   - eigene Logos            → erst Zwischenspeicher, dann Netz
//   - Schriftarten (fremd)    → aus dem Speicher, im Hintergrund erneuern
//   - Audioströme, Metadaten  → gar nicht abfangen
//
// Der Kommentar sagte hier lange „cache-first" für die eigenen Dateien. Das
// stimmte einmal und war seit der Umstellung falsch — nachgezogen, damit
// niemand danach sucht.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Audioströme niemals abfangen. Icecast-Adressen haben oft gar keine
    // Dateiendung (…/groovesalad-128-mp3), deshalb reicht ein Endungstest nicht —
    // genau daran ist die alte Regel gescheitert. Alles, was nicht ausdrücklich
    // zur App gehört, wird jetzt durchgereicht.
    // Alles Fremde wird durchgereicht. Frueher gab es hier eine Ausnahme
    // fuer fonts.googleapis.com und fonts.gstatic.com — die ist weg, seit
    // die Schriften im eigenen Haus liegen. Damit faellt auch der
    // stale-while-revalidate-Zweig ganz unten weg.
    if (url.origin !== self.location.origin) return;

    /*
     /api/ und /messung fasst der Worker NICHT an.

     Das ist keine Feinheit, sondern verhindert eine Datenpanne: Unter /api/
     liegt die Merkliste eines angemeldeten Menschen. Legte der Worker die
     Antwort ab, bekaeme sie der naechste am selben Geraet vorgesetzt — auch
     nach dem Abmelden. Auf einem Familien-Tablett waere das genau das.

     /messung steht aus einem anderen Grund hier: Eine zwischengespeicherte
     Messung waere eine Zahl, die zweimal gezaehlt wird.
    */
    if (url.pathname.startsWith('/api/') || url.pathname === '/messung') return;

    // Eigene Dateien: erst das Netz, dann der Zwischenspeicher.
    //
    // Vorher andersherum — und genau daran ist eine Fehlerbehebung hängen
    // geblieben: Der Zwischenspeicher lieferte weiter die alte Fassung, die
    // Tester bekamen die Korrektur nie zu sehen. Solange sich die App noch
    // ändert, muss das Netz gewinnen.
    //
    // Ausnahme sind Logos: die ändern sich so gut wie nie, und 84 Bilder bei
    // jedem Aufruf neu zu holen wäre Verschwendung.
    if (url.origin === self.location.origin) {
        // Logos und Schriften aendern sich praktisch nie.
        const istBild = /\/assets\/(logos?|schrift)\//.test(url.pathname);

        if (istBild) {
            event.respondWith(
                caches.match(req).then((gespeichert) => gespeichert || fetch(req).then((res) => {
                    if (res && res.status === 200) {
                        const kopie = res.clone();
                        caches.open(SHELL_CACHE).then((c) => c.put(req, kopie));
                    }
                    return res;
                }))
            );
            return;
        }

        event.respondWith(
            fetch(req)
                .then((res) => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const kopie = res.clone();
                        caches.open(SHELL_CACHE).then((c) => c.put(req, kopie));
                    }
                    return res;
                })
                .catch(() =>
                    // Kein Netz: aus dem Zwischenspeicher, sonst die Hülle
                    caches.match(req).then((gespeichert) =>
                        gespeichert
                        || (req.mode === 'navigate'
                            // Die Seite DER angefragten Sprache. Frueher stand
                            // hier './index.html' — das lieferte offline unter
                            // /ja/ die deutsche Seite aus.
                            ? caches.match(sprachseite(url))
                            // Ein mit undefined aufgeloestes respondWith wird
                            // zum Netzwerkfehler ohne Erklaerung. Eine echte
                            // Antwort sagt wenigstens, was los ist.
                            : new Response('', { status: 504, statusText: 'offline' })))
                )
        );
        return;
    }
});

// Failsafe: when the page becomes available again, ping clients to refetch.
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
