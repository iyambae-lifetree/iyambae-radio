import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anzeigeStimmung, anzeigeQuelle, frageMyRetuner } from '../../assets/lib/myretuner.mjs';

test('presetHz schlaegt zielstimmung in der Anzeige', () => {
  // Preset 528 bedeutet C5=528, daraus folgt A4=443,99. Der Besucher
  // hat 528 eingestellt und muss 528 lesen.
  assert.equal(anzeigeStimmung({ presetHz: 528, zielstimmung: 443.99 }), '528');
});

test('ohne presetHz wird zielstimmung genommen', () => {
  assert.equal(anzeigeStimmung({ zielstimmung: 432 }), '432');
});

test('krumme Werte bekommen ein Komma', () => {
  assert.equal(anzeigeStimmung({ zielstimmung: 443.99 }), '443,99');
});

test('ohne Angaben gibt es nichts anzuzeigen', () => {
  assert.equal(anzeigeStimmung(null), null);
  assert.equal(anzeigeStimmung({}), null);
});

test('sichere Messung kommt mit Nachkommastelle', () => {
  assert.deepEqual(anzeigeQuelle({ quellstimmung: 438.24, vertrauen: 0.87 }),
                   { wert: '438,2', sicher: true });
});

test('unsichere Messung wird gerundet und als ungefaehr gekennzeichnet', () => {
  // Die App liefert im Betrieb Werte um 0,25 — die Messung soll sichtbar
  // sein, aber ohne Scheingenauigkeit.
  assert.deepEqual(anzeigeQuelle({ quellstimmung: 438.173, vertrauen: 0.251 }),
                   { wert: '438', sicher: false });
});

test('geratene Messung wird gar nicht angezeigt', () => {
  assert.equal(anzeigeQuelle({ quellstimmung: 438.24, vertrauen: 0.05 }), null);
  assert.equal(anzeigeQuelle({ quellstimmung: 438.24 }), null, 'ohne Vertrauensangabe nichts anzeigen');
  assert.equal(anzeigeQuelle({ vertrauen: 0.9 }), null, 'ohne Messwert nichts anzeigen');
});

test('eine tote Adresse ergibt null statt eines Fehlers', async () => {
  // Die Seite darf nicht scheitern, wenn MyRetuner nicht laeuft.
  assert.equal(await frageMyRetuner('http://127.0.0.1:1/status'), null);
});

test('eine fremde App wird nicht als MyRetuner genommen', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ app: 'etwas-anderes', aktiv: true }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ergebnis = await frageMyRetuner(`http://127.0.0.1:${port}/status`);
  server.close();
  assert.equal(ergebnis, null);
});

test('eine echte Antwort wird durchgereicht', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ app: 'myretuner', aktiv: true, presetHz: 432, zielstimmung: 432 }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ergebnis = await frageMyRetuner(`http://127.0.0.1:${port}/status`);
  server.close();
  assert.equal(ergebnis.app, 'myretuner');
  assert.equal(anzeigeStimmung(ergebnis), '432');
});
