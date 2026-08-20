// ============================================================
// Service Worker — 432Hz Radio PWA
// Caches the app shell & manifest, network-first for live
// metadata/stream endpoints, falls back to cache when offline.
// ============================================================

// Hochgezaehlt, weil SHELL_FILES drei fehlende Module bekommen hat. Ohne
// neue Fassung behielten bestehende Besucher den alten, unvollstaendigen
// Zwischenspeicher — und damit den Offline-Fehler.
const SW_VERSION = 'iyambae-v8';
const SHELL_CACHE = `${SW_VERSION}-shell`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

const SHELL_FILES = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icon.svg',
    './icon-192.png',
    // Vom Manifest verlangt, fehlte bisher.
    './icon-512.png',
    './assets/logo/icon-maskable-512.png',
    // Ladeschirm und Logo im Kopf. Ohne dieses Bild oeffnet der Laden
    // offline mit einer leeren Flaeche.
    './assets/logo/iyambae-marke.svg',
    './assets/styles.css',
    './assets/app.js',
    // Jedes Modul, das app.js importiert, muss hier stehen. Fehlt eines,
    // bricht offline der ganze Start ab — ein fehlendes ES-Modul reisst das
    // Skript mit. Scripts/pruefe-shell-dateien.py wacht darueber.
    './assets/lib/gewichtung.mjs',
    './assets/lib/verwandt.mjs',
    './assets/lib/myretuner.mjs',
    './assets/lib/wochentipp.mjs',
    './assets/lib/senderbild.mjs',
    // MyRetuners Signalkern. Der Worklet wird nicht importiert, sondern per
    // addModule geladen, und die .wasm per fetch — beides sieht der
    // import-Ausdruck nicht. Scripts/pruefe-shell-dateien.py prueft deshalb
    // auch diese beiden Wege.
    './assets/lib/retuner-worklet.js',
    './assets/wasm/retuner.wasm',
    './data/sender.json',
];

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

// Fetch strategy:
//   - same-origin app shell  → cache-first (fast + offline)
//   - cross-origin (fonts/manifest) → stale-while-revalidate
//   - audio streams + metadata → network-only (don't cache huge/binary)
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Audioströme niemals abfangen. Icecast-Adressen haben oft gar keine
    // Dateiendung (…/groovesalad-128-mp3), deshalb reicht ein Endungstest nicht —
    // genau daran ist die alte Regel gescheitert. Alles, was nicht ausdrücklich
    // zur App gehört, wird jetzt durchgereicht.
    const istAppEigen = url.origin === self.location.origin;
    const istSchriftart = /^https:\/\/fonts\.(googleapis|gstatic)\.com$/.test(url.origin);
    if (!istAppEigen && !istSchriftart) return;

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
        const istBild = /\/assets\/logos?\//.test(url.pathname);

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
                            ? caches.match('./index.html')
                            // Ein mit undefined aufgeloestes respondWith wird
                            // zum Netzwerkfehler ohne Erklaerung. Eine echte
                            // Antwort sagt wenigstens, was los ist.
                            : new Response('', { status: 504, statusText: 'offline' })))
                )
        );
        return;
    }

    // Cross-origin (e.g. Google Fonts): stale-while-revalidate.
    event.respondWith(
        caches.open(RUNTIME_CACHE).then(async (cache) => {
            const cached = await cache.match(req);
            const network = fetch(req).then((res) => {
                if (res && res.status === 200) cache.put(req, res.clone());
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});

// Failsafe: when the page becomes available again, ping clients to refetch.
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
