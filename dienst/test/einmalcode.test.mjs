import { test } from 'node:test';
import assert from 'node:assert/strict';

import { speicherImArbeitsspeicher, TABELLE_KONTEN } from '../src/speicher.mjs';
import {
    erzeugeCode, legeCodeAn, pruefeCode, abdruckVonCode,
    legeMarkeAn, loeseMarkeEin, GUELTIG_MS, HOECHSTENS_VERSUCHE,
} from '../src/einmalcode.mjs';

const KONTO = 'a'.repeat(32);

test('der Code ist sechs Ziffern und benutzt keine schwache Quelle', () => {
    const gesehen = new Set();
    for (let i = 0; i < 3000; i++) {
        const code = erzeugeCode();
        assert.match(code, /^[0-9]{6}$/);
        gesehen.add(code);
    }
    // Keine Zufallspruefung, nur ein grober Riegel gegen einen Zaehler oder
    // eine feste Zahl: 3000 Ziehungen aus einer Million duerfen sich kaum
    // wiederholen.
    assert.ok(gesehen.size > 2950, 'zu viele Wiederholungen: ' + gesehen.size);
});

test('nur der Abdruck steht in der Tabelle, nie der Code', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { code } = await legeCodeAn(speicher, KONTO);

    const zeile = await speicher.hole(TABELLE_KONTEN, KONTO, 'code:anmeldung');
    const alsText = JSON.stringify(zeile);

    assert.equal(alsText.includes(code), false, 'der Klartext darf nirgends stehen');
    assert.equal(zeile.abdruck, abdruckVonCode(KONTO, code));
});

test('der richtige Code geht genau einmal', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { code } = await legeCodeAn(speicher, KONTO);

    assert.deepEqual(await pruefeCode(speicher, KONTO, code), { ok: true });
    // Verbraucht heisst weg.
    assert.deepEqual(await pruefeCode(speicher, KONTO, code), { ok: false, grund: 'kein_code' });
});

test('ein abgelaufener Code gilt nicht mehr', async () => {
    const speicher = speicherImArbeitsspeicher();
    const jetzt = 1_800_000_000_000;
    const { code } = await legeCodeAn(speicher, KONTO, 'anmeldung', jetzt);

    // Eine Millisekunde vor Ablauf: geht.
    assert.equal((await pruefeCode(speicher, KONTO, code, 'anmeldung', jetzt + GUELTIG_MS - 1)).ok, true);

    const { code: zweiter } = await legeCodeAn(speicher, KONTO, 'anmeldung', jetzt);
    const spaet = await pruefeCode(speicher, KONTO, zweiter, 'anmeldung', jetzt + GUELTIG_MS + 1);
    assert.deepEqual(spaet, { ok: false, grund: 'abgelaufen' });
});

test('nach fuenf Fehlversuchen ist der Code verbrannt', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { code } = await legeCodeAn(speicher, KONTO);
    const falsch = code === '000000' ? '111111' : '000000';

    for (let i = 1; i <= HOECHSTENS_VERSUCHE; i++) {
        const ergebnis = await pruefeCode(speicher, KONTO, falsch);
        assert.equal(ergebnis.ok, false);
        assert.equal(ergebnis.grund, 'falsch');
        assert.equal(ergebnis.uebrig, HOECHSTENS_VERSUCHE - i);
    }

    // Der sechste Versuch, sogar mit dem RICHTIGEN Code, geht nicht mehr.
    assert.deepEqual(await pruefeCode(speicher, KONTO, code), { ok: false, grund: 'zu_oft' });
});

test('Unsinn zaehlt nicht gegen die fuenf Versuche', async () => {
    // Sonst koennte ein Fremder den Code eines anderen mit fuenf Anfragen
    // verbrennen, ohne ihn je zu kennen.
    const speicher = speicherImArbeitsspeicher();
    const { code } = await legeCodeAn(speicher, KONTO);

    for (let i = 0; i < 50; i++) {
        assert.deepEqual(await pruefeCode(speicher, KONTO, 'abc'), { ok: false, grund: 'form' });
        assert.deepEqual(await pruefeCode(speicher, KONTO, '12345'), { ok: false, grund: 'form' });
    }

    assert.deepEqual(await pruefeCode(speicher, KONTO, code), { ok: true });
});

test('ein neuer Code macht den alten ungueltig', async () => {
    const speicher = speicherImArbeitsspeicher();
    const { code: alt } = await legeCodeAn(speicher, KONTO);
    const { code: neu } = await legeCodeAn(speicher, KONTO);

    if (alt !== neu) {
        assert.equal((await pruefeCode(speicher, KONTO, alt)).ok, false);
    }
    assert.deepEqual(await pruefeCode(speicher, KONTO, neu), { ok: true });
});

test('gleichzeitige Rateversuche kommen nicht an der Grenze vorbei', async () => {
    /*
      Ohne If-Match beim Hochzaehlen wuerden hier alle zwanzig denselben
      Stand lesen und die Grenze waere ein Vorschlag. Erwartet: hoechstens
      fuenf Antworten mit 'falsch', der Rest 'zu_oft' oder 'kein_code'.
    */
    const speicher = speicherImArbeitsspeicher();
    await legeCodeAn(speicher, KONTO);

    const ergebnisse = await Promise.all(
        Array.from({ length: 20 }, () => pruefeCode(speicher, KONTO, '000000').catch((f) => ({ ok: false, grund: f.art }))));

    const falsch = ergebnisse.filter((e) => e.grund === 'falsch').length;
    assert.ok(falsch <= HOECHSTENS_VERSUCHE, 'zu viele gezaehlte Versuche: ' + falsch);
    assert.equal(ergebnisse.some((e) => e.ok), false);
});

// ── Marken ──────────────────────────────────────────────────────────

test('eine Marke gilt einmal und traegt ihre Partition selbst', async () => {
    const speicher = speicherImArbeitsspeicher();
    const marke = await legeMarkeAn(speicher, KONTO);

    assert.ok(marke.startsWith(KONTO + '.'));
    assert.deepEqual(await loeseMarkeEin(speicher, marke), { ok: true, partition: KONTO });
    assert.deepEqual(await loeseMarkeEin(speicher, marke), { ok: false, grund: 'verbraucht' });
});

test('eine abgelaufene Marke wird abgewiesen und weggeraeumt', async () => {
    const speicher = speicherImArbeitsspeicher();
    const jetzt = 1_800_000_000_000;
    const marke = await legeMarkeAn(speicher, KONTO, 'passwort', jetzt);

    const spaet = await loeseMarkeEin(speicher, marke, 'passwort', jetzt + 61 * 60 * 1000);
    assert.deepEqual(spaet, { ok: false, grund: 'abgelaufen' });
    assert.deepEqual(await loeseMarkeEin(speicher, marke, 'passwort', jetzt), { ok: false, grund: 'verbraucht' });
});

test('eine erfundene Marke sieht aus wie eine verbrauchte', async () => {
    // Kein eigener Grund fuer „gab es nie": Sonst waere die Antwort ein
    // Pruefer dafuer, ob eine Marke jemals existiert hat.
    const speicher = speicherImArbeitsspeicher();
    await legeMarkeAn(speicher, KONTO);

    const erfunden = KONTO + '.' + 'x'.repeat(43);
    assert.deepEqual(await loeseMarkeEin(speicher, erfunden), { ok: false, grund: 'verbraucht' });
});
