// ============================================================
// Service Worker — 432Hz Radio PWA
// Caches the app shell & manifest, network-first for live
// metadata/stream endpoints, falls back to cache when offline.
// ============================================================

// Bei JEDER Änderung an SHELL_FILES hochzählen. Ohne neue Fassung behalten
// bestehende Besucher ihren alten Zwischenspeicher — und damit alles, was
// darin fehlt. Genau daran hing der Offline-Fehler mit den drei nicht
// gelisteten Modulen.
const SW_VERSION = 'iyambae-v22';
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
    // Die Texturen des Plattenspielers: Vinyl, Filz, gebuerstetes
    // Metall. Ohne sie faellt der Teller auf Farbverlaeufe zurueck.
    /*
      Die drei Texturen stehen BEWUSST NICHT hier — gemessen, nicht gemutmasst.

      Zusammen 162 KiB (vinyl 54,5 / metall 93,2 / filz 14,5), und der Vorrat
      waechst dadurch um 19,3 Prozent. Der schaerfere Punkt steht unten im
      Einbau: der Neuladen-Schalter am Request geht am HTTP-Zwischenspeicher
      vorbei (siehe install-Behandler weiter unten). Das CSS
      holt die Texturen ohnehin beim ersten Anstrich, der Teller steht ueber
      der Falz — sie kaemen also ZWEIMAL ueber die Leitung, rund 324 KiB auf
      einem kalten Erstbesuch.

      Im Laufzeit-Zwischenspeicher landen sie trotzdem, sobald das CSS sie
      geholt hat. Die Offlinedeckung ab dem zweiten Besuch bleibt damit
      gleich; nur der blockierende Einbau wird um 162 KiB leichter.

      iyambae-label.svg steht dagegen weiter im Vorrat: Das wird offline
      gebraucht, bevor das CSS ueberhaupt laeuft.
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
    '/assets/lib/verwandt.mjs',
    '/assets/lib/myretuner.mjs',
    '/assets/lib/wochentipp.mjs',
    '/assets/lib/senderbild.mjs',
    '/assets/lib/symbole.mjs',
    '/assets/lib/achsen.mjs',
    '/assets/lib/messung.mjs',
    '/assets/lib/sprache.mjs',
    '/assets/lib/aktualisierung.mjs',
    '/assets/lib/fehlerbericht.mjs',
    // MyRetuners Signalkern. Der Worklet wird nicht importiert, sondern per
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
