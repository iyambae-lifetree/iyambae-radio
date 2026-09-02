import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { leererFilter, wendeAn, vorschau, anzahlAktiv,
         schalteEinschlafen, istEinschlafen, STIMMEN } from '../../assets/lib/achsen.mjs';

const katalog = JSON.parse(
  await readFile(new URL('../../data/sender.json', import.meta.url), 'utf8'));
const SENDER = katalog.sender.filter((s) => s.status !== 'tot');
const nie = () => false;
const redet = (s) => (s.etiketten ?? []).some((e) => STIMMEN.includes(e));

test('ohne Filter ist jeder Sender da', () => {
  const f = leererFilter();
  assert.equal(anzahlAktiv(f), 0);
  assert.equal(wendeAn(SENDER, f, nie).length, SENDER.length);
});

/*
 Der Kern des Zugriffs „Zum Einschlafen": Es darf niemand reden.

 Das ist die einzige Bedingung im ganzen Filterwerk, die etwas WEGNIMMT.
 Ginge sie verloren — etwa weil jemand `ohneStimme` beim Aufraeumen des
 Filterzustands vergisst —, bliebe der Chip bestehen und lieferte still
 Sender mit Moderation aus. Ein Fehler, den man beim Einschlafen bemerkt
 und nicht beim Testen.
*/
test('Zum Einschlafen liefert keinen einzigen Sender, in dem jemand redet', () => {
  const f = leererFilter();
  schalteEinschlafen(f);
  assert.equal(istEinschlafen(f), true);
  const treffer = wendeAn(SENDER, f, nie);
  assert.ok(treffer.length > 0, 'der Zugriff darf nicht ins Leere fuehren');
  assert.deepEqual(treffer.filter(redet), [], 'kein Sender mit Stimme');
});

test('Zum Einschlafen ist instrumental und ohne Werbung', () => {
  const f = leererFilter();
  schalteEinschlafen(f);
  for (const s of wendeAn(SENDER, f, nie)) {
    assert.ok((s.etiketten ?? []).includes('nur-instrumental'), s.id + ' ist nicht instrumental');
    assert.ok((s.etiketten ?? []).includes('ohne-werbung'), s.id + ' hat Werbung');
  }
});

test('die Zahl am Chip stimmt mit dem ueberein, was danach dasteht', () => {
  const f = leererFilter();
  const versprochen = vorschau(SENDER, f, nie, 'einschlafen', 'ja');
  schalteEinschlafen(f);
  assert.equal(wendeAn(SENDER, f, nie).length, versprochen);
});

test('die Zahl bleibt dieselbe, wenn der Zugriff schon an ist', () => {
  const f = leererFilter();
  schalteEinschlafen(f);
  const jetzt = wendeAn(SENDER, f, nie).length;
  assert.equal(vorschau(SENDER, f, nie, 'einschlafen', 'ja'), jetzt);
});

test('ein zweiter Klick fuehrt genau dorthin zurueck, wo man war', () => {
  const f = leererFilter();
  schalteEinschlafen(f);
  schalteEinschlafen(f);
  assert.equal(istEinschlafen(f), false);
  assert.equal(anzahlAktiv(f), 0);
  assert.equal(wendeAn(SENDER, f, nie).length, SENDER.length);
});

test('der Zugriff zaehlt als eine Achse mehr, nicht als keine', () => {
  const f = leererFilter();
  schalteEinschlafen(f);
  // zwei Etiketten plus die Stimm-Achse
  assert.equal(anzahlAktiv(f), 3);
});
