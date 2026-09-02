import { test } from 'node:test';
import assert from 'node:assert/strict';
import { darfAbfangen } from '../../assets/lib/sw-regel.mjs';

const EIGEN = 'https://radio.example.org';

test('eigene Dateien werden abgefangen', () => {
  assert.equal(darfAbfangen(EIGEN + '/index.html', EIGEN), true);
  assert.equal(darfAbfangen(EIGEN + '/assets/app.js', EIGEN), true);
  assert.equal(darfAbfangen(EIGEN + '/data/sender.json', EIGEN), true);
});

test('fremde Schriftarten werden NICHT mehr abgefangen', () => {
  // Frueher stand hier das Gegenteil, und es stimmte auch. Seit die
  // Schriften unter /assets/schrift/ im eigenen Haus liegen, gibt es keine
  // fremde Schriftadresse mehr — und damit auch keinen Grund fuer eine
  // Ausnahme. sw.js hat sie laengst nicht mehr; das Modul hat es bis zum
  // 02.09.2026 noch behauptet.
  assert.equal(darfAbfangen('https://fonts.googleapis.com/css2?family=Inter', EIGEN), false);
  assert.equal(darfAbfangen('https://fonts.gstatic.com/s/inter/v13/x.woff2', EIGEN), false);
});

test('Icecast-Streams ohne Dateiendung werden durchgereicht', () => {
  // Genau hier ist die alte Regel gescheitert.
  assert.equal(darfAbfangen('https://ice6.somafm.com/dronezone-256-mp3', EIGEN), false);
  assert.equal(darfAbfangen('https://ice5.somafm.com/groovesalad-128-aac', EIGEN), false);
  assert.equal(darfAbfangen('https://stream-relay-geo.ntslive.net/stream', EIGEN), false);
  assert.equal(darfAbfangen('https://radio.gotanno.love/;', EIGEN), false);
});

test('Streams mit Dateiendung werden ebenfalls durchgereicht', () => {
  assert.equal(darfAbfangen('https://stream.radioparadise.com/flac', EIGEN), false);
  assert.equal(darfAbfangen('https://relay0.r-a-d.io/main.mp3', EIGEN), false);
  assert.equal(darfAbfangen('https://radio.plaza.one/ogg', EIGEN), false);
});

test('fremde Hosts werden nie abgefangen', () => {
  assert.equal(darfAbfangen('https://beliebig.example.com/irgendwas', EIGEN), false);
  assert.equal(darfAbfangen('https://de1.api.radio-browser.info/json/stats', EIGEN), false);
});

test('Unsinn als Adresse ergibt kein Abfangen', () => {
  assert.equal(darfAbfangen('kaputt', EIGEN), false);
  assert.equal(darfAbfangen('', EIGEN), false);
});

test('sw.js benutzt dieselbe Regel wie das getestete Modul', async () => {
  // Der Worker kann assets/lib/sw-regel.mjs nicht importieren — ES-Module in
  // Service Workern sind noch nicht überall unterstützt. Damit die Fassungen
  // nicht auseinanderlaufen, prüft dieser Test die entscheidenden Zeilen.
  const { readFile } = await import('node:fs/promises');
  const sw = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');

  assert.match(sw, /if \(url\.origin !== self\.location\.origin\) return;/,
    'sw.js muss alles Fremde durchreichen, und zwar am eigenen Ursprung gemessen');
  // Ohne Kommentare geprueft: In sw.js steht ueber der Zeile ein Absatz, der
  // erklaert, WARUM die Schriftart-Ausnahme weg ist — und darin kommen die
  // beiden Adressen naturgemaess vor. Ein Test, der ueber eine Erklaerung
  // stolpert, zwingt dazu, die Erklaerung zu loeschen. Falsch herum.
  const ohneKommentare = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(ohneKommentare, /fonts\.(googleapis|gstatic)\.com/,
    'die Schriftart-Ausnahme ist weg — die Schriften liegen im eigenen Haus');
  assert.doesNotMatch(sw, /\\\.\(mp3\|aac\|ogg\|flac/,
    'die alte Endungsregel darf nicht zurückkommen — an ihr ist der Bug entstanden');
});

test('eigene Dateien werden aus dem Netz geholt, nicht aus dem Speicher', async () => {
  // Ein Fehler blieb unsichtbar, weil der Zwischenspeicher die alte Fassung
  // weiterlieferte. Fuer alles ausser Logos muss das Netz gewinnen.
  const { readFile } = await import('node:fs/promises');
  const sw = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');

  assert.match(sw, /event\.respondWith\(\s*fetch\(req\)/,
    'eigene Dateien: erst fetch, dann der Speicher als Rueckfall');
  assert.match(sw, /istBild/, 'Logos duerfen weiterhin aus dem Speicher kommen');
  assert.doesNotMatch(sw, /caches\.match\(req\)\.then\(\(cached\) => \{\s*if \(cached\) return cached;/,
    'die alte cache-first-Fassung darf nicht zurueckkommen');
});

test('der Katalog wird beim Server rueckgefragt, nicht blind aus dem Speicher genommen', async () => {
  // Sonst sehen Besucher einen erweiterten Katalog nie. Genau so ist am
  // 21.08.2026 die Erweiterung auf 128 Sender unsichtbar geblieben.
  //
  // NACHGEZOGEN AM 02.09.2026. Hier stand die Forderung nach
  // `cache: 'no-cache'` am fetch in app.js. Die Frische kommt heute von
  // woanders: Der Service Worker holt eigene Dateien network-first, der
  // Zwischenspeicher ist nur noch Rueckfall. Damit ist der Fall von damals
  // — ein Katalog, der fuer immer alt bleibt — ausgeschlossen.
  //
  // OFFEN GEBLIEBEN, und deshalb hier notiert statt weggelassen: nginx
  // liefert /data/ mit `max-age=3600`. Der HTTP-Zwischenspeicher des
  // Browsers kann den Katalog also bis zu einer Stunde alt zeigen. Eine
  // Stunde ist kein Fehler, „fuer immer" war einer.
  const { readFile } = await import('node:fs/promises');
  const sw = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'\/data\/sender\.json'/,
    'der Katalog gehoert in den Vorrat, damit er offline da ist');
  assert.match(sw, /event\.respondWith\(\s*fetch\(req\)/,
    'und er muss network-first geholt werden, sonst friert er ein');
});
