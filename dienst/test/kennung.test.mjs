/*
  Die Naht zwischen dem Kern und der Fremdanmeldung.

  Geprueft wird hier NICHT gegen eine Attrappe: `verknuepfeAnbieterkennung`
  laeuft gegen dieselbe Schnittstelle, die server.mjs im Betrieb einhaengt,
  und die gegen den echten Speicher. test/fremd.test.mjs prueft die Regel
  gegen eine Attrappe — das ist der richtige Ort dafuer. Was dort NICHT
  auffallen kann, ist eine Attrappe, die sich anders verhaelt als der Kern.
  Genau dafuer ist diese Datei da.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    speicherImArbeitsspeicher, SpeicherFehler, TABELLE_KONTEN, TABELLE_VERWEISE,
    findeKonto, holeOderNichts, holeOderLegeKontoAn, loescheKonto,
    legeKontoAn, verknuepfeKennung, leseKennungen, loescheKennung, kennungAbdruck,
} from '../src/speicher.mjs';
import { speicherSchnittstelle } from '../src/server.mjs';
import { verknuepfeAnbieterkennung, zaehleAnmeldewege } from '../src/fremd.mjs';
import { erzeugeSitzung } from '../src/sitzung.mjs';
import { starteTestdienst, fangeProtokoll, meldeAn } from './hilfe.mjs';

/** Sammelt, was fremd.mjs schreiben will, ohne die Testausgabe zu fluten. */
function fangeSchreiber() {
    const zeilen = [];
    return { zeilen, schreib: (art, felder = {}) => zeilen.push({ art, ...felder }) };
}

function aufbau() {
    const speicher = speicherImArbeitsspeicher();
    return { speicher, schnitt: speicherSchnittstelle(speicher), protokoll: fangeSchreiber() };
}

// ════════════════════════════════════════════════════════════════════
//  Die Speicherfunktionen fuer sich
// ════════════════════════════════════════════════════════════════════

test('ein Konto mit Anbieterkennung ist ueber genau diese Kennung wiederzufinden', async () => {
    const p = fangeProtokoll();
    try {
        const speicher = speicherImArbeitsspeicher();
        const kontoId = await legeKontoAn(speicher, {
            kennungen: [{ art: 'google', wert: '1078', daten: { name: 'Anna' } }],
        });

        // Die kontoId muss durch pruefeSitzung passen und in WebAuthns
        // 64-Byte-Grenze fuer user.id — beides haengt an dieser einen Form.
        assert.match(kontoId, /^[0-9a-f]{32}$/);
        assert.ok(Buffer.byteLength(kontoId, 'utf8') <= 64);

        assert.equal(await findeKonto(speicher, 'google', '1078'), kontoId);
        assert.equal(await findeKonto(speicher, 'google', '1079'), null);
        assert.equal(await findeKonto(speicher, 'apple', '1078'), null, 'die Art gehoert zum Abdruck');

        const kennungen = await leseKennungen(speicher, kontoId);
        assert.deepEqual(kennungen.map((k) => [k.art, k.wert]), [['google', '1078']]);
        assert.equal(kennungen[0].daten.name, 'Anna');

        // Die Kontozeile selbst muss es auch geben, sonst antwortet
        // GET /api/konto mit `angelegt: null`.
        assert.ok(await holeOderNichts(speicher, TABELLE_KONTEN, kontoId, 'konto'));
    } finally {
        p.zurueck();
    }
});

test('ein Konto ohne jede Kennung ist erlaubt — Apple verbirgt die Adresse', async () => {
    const p = fangeProtokoll();
    try {
        const speicher = speicherImArbeitsspeicher();
        const kontoId = await legeKontoAn(speicher, { kennungen: [] });
        assert.deepEqual(await leseKennungen(speicher, kontoId), []);
        assert.ok(await holeOderNichts(speicher, TABELLE_KONTEN, kontoId, 'konto'));
    } finally {
        p.zurueck();
    }
});

test('Listen und Flaggen eines Passkeys ueberstehen den Weg durch die Tabelle', async () => {
    const p = fangeProtokoll();
    try {
        const speicher = speicherImArbeitsspeicher();
        const kontoId = await legeKontoAn(speicher, { kennungen: [] });
        // `transporte` ist eine Liste, und Table Storage kennt keine Listen.
        // Genau daran zerbricht eine Kennung, die in flache Spalten will.
        await verknuepfeKennung(speicher, kontoId, 'passkey', 'schl-1', {
            zaehler: 7, transporte: ['internal', 'hybrid'], be: true, bs: false,
        });
        const [k] = await leseKennungen(speicher, kontoId);
        assert.deepEqual(k.daten.transporte, ['internal', 'hybrid']);
        assert.equal(k.daten.zaehler, 7);
        assert.equal(k.daten.be, true);
        assert.equal(k.daten.bs, false);
    } finally {
        p.zurueck();
    }
});

test('eine Kennung frischt auf, statt ein zweites Mal zu entstehen', async () => {
    const p = fangeProtokoll();
    try {
        const speicher = speicherImArbeitsspeicher();
        const kontoId = await legeKontoAn(speicher, { kennungen: [] });
        await verknuepfeKennung(speicher, kontoId, 'passkey', 'schl-1', { zaehler: 1 });
        await verknuepfeKennung(speicher, kontoId, 'passkey', 'schl-1', { zaehler: 2 });

        const kennungen = await leseKennungen(speicher, kontoId);
        assert.equal(kennungen.length, 1, 'eine Zeile, nicht zwei');
        assert.equal(kennungen[0].daten.zaehler, 2);
    } finally {
        p.zurueck();
    }
});

test('eine fremde Anbieterkennung wird nicht umgehaengt, sondern abgelehnt', async () => {
    const p = fangeProtokoll();
    try {
        const speicher = speicherImArbeitsspeicher();
        const opfer = await legeKontoAn(speicher, { kennungen: [{ art: 'google', wert: 'g-1' }] });
        const angreifer = await legeKontoAn(speicher, { kennungen: [] });

        await assert.rejects(
            () => verknuepfeKennung(speicher, angreifer, 'google', 'g-1', {}),
            (fehler) => fehler instanceof SpeicherFehler && fehler.art === 'konflikt');

        assert.equal(await findeKonto(speicher, 'google', 'g-1'), opfer, 'der Verweis bleibt, wo er war');
        assert.deepEqual(await leseKennungen(speicher, angreifer), []);
    } finally {
        p.zurueck();
    }
});

test('die Mailzeile wird verschmolzen, nicht ersetzt — das Passwort bleibt', async () => {
    const p = fangeProtokoll();
    try {
        const speicher = speicherImArbeitsspeicher();
        const { kontoId } = await holeOderLegeKontoAn(speicher, 'anna@example.org');
        await speicher.setze(TABELLE_KONTEN, {
            partitionKey: kontoId, rowKey: 'kennung:mail',
            adresse: 'anna@example.org', bestaetigtAm: 111, passwortHash: '$argon2id$erfunden',
        });

        // So kommt es aus fremd.mjs, wenn Google dieselbe Adresse meldet.
        await verknuepfeKennung(speicher, kontoId, 'mail', 'Anna@example.org',
            { adresse: 'anna@example.org', quelle: 'google', weiterleitung: false });

        const zeile = await holeOderNichts(speicher, TABELLE_KONTEN, kontoId, 'kennung:mail');
        assert.equal(zeile.passwortHash, '$argon2id$erfunden', 'ein Replace haette es weggeworfen');
        assert.equal(zeile.bestaetigtAm, 111);
        assert.equal(zeile.quelle, 'google');

        // Und der Hash verlaesst den Kern nicht ueber leseKennungen.
        const mail = (await leseKennungen(speicher, kontoId)).find((k) => k.art === 'mail');
        assert.equal(mail.wert, 'anna@example.org');
        assert.equal(mail.daten.passwortHash, undefined);
    } finally {
        p.zurueck();
    }
});

test('scheitert eine Kennung beim Anlegen, bleibt keine halb beanspruchte zurueck', async () => {
    const p = fangeProtokoll();
    try {
        const speicher = speicherImArbeitsspeicher();
        await holeOderLegeKontoAn(speicher, 'belegt@example.org');

        await assert.rejects(
            () => legeKontoAn(speicher, {
                kennungen: [
                    { art: 'google', wert: 'g-neu' },
                    { art: 'mail', wert: 'belegt@example.org' },
                ],
            }),
            (fehler) => fehler instanceof SpeicherFehler && fehler.art === 'konflikt');

        assert.equal(await findeKonto(speicher, 'google', 'g-neu'), null,
            'der schon geschriebene Verweis wurde wieder weggeraeumt');
    } finally {
        p.zurueck();
    }
});

test('eine Kennung loesen raeumt Zeile UND Verweis — danach ist sie wieder frei', async () => {
    const p = fangeProtokoll();
    try {
        const speicher = speicherImArbeitsspeicher();
        const erstes = await legeKontoAn(speicher, { kennungen: [{ art: 'google', wert: 'g-1' }] });

        await loescheKennung(speicher, erstes, 'google', 'g-1');
        assert.deepEqual(await leseKennungen(speicher, erstes), []);
        assert.equal(await findeKonto(speicher, 'google', 'g-1'), null);

        // Bliebe der Verweis liegen, waere die Kennung fuer immer vergeben —
        // ohne Zeile, auf die sie zeigt, und ohne Weg, sie loszuwerden.
        const zweites = await legeKontoAn(speicher, { kennungen: [{ art: 'google', wert: 'g-1' }] });
        assert.equal(await findeKonto(speicher, 'google', 'g-1'), zweites);
    } finally {
        p.zurueck();
    }
});

test('eine Kontoloeschung nimmt JEDEN Verweis mit, nicht nur den der Adresse', async () => {
    const p = fangeProtokoll();
    try {
        const speicher = speicherImArbeitsspeicher();
        const kontoId = await legeKontoAn(speicher, {
            kennungen: [
                { art: 'mail', wert: 'anna@example.org', daten: { bestaetigtAm: 1 } },
                { art: 'google', wert: 'g-1' },
                { art: 'apple', wert: 'a-1' },
                { art: 'passkey', wert: 'p-1' },
            ],
        });

        await loescheKonto(speicher, kontoId);

        for (const [art, wert] of [['mail', 'anna@example.org'], ['google', 'g-1'], ['apple', 'a-1'], ['passkey', 'p-1']]) {
            assert.equal(await findeKonto(speicher, art, wert), null, `${art} zeigt noch ins Leere`);
            assert.equal(
                await holeOderNichts(speicher, TABELLE_VERWEISE, kennungAbdruck(art, wert), 'v'),
                null);
        }
    } finally {
        p.zurueck();
    }
});

// ════════════════════════════════════════════════════════════════════
//  Die Regel aus fremd.mjs, gegen den echten Kern
// ════════════════════════════════════════════════════════════════════

const GOOGLE = { anbieter: 'google', sub: 'g-anna', adresse: 'anna@example.org', adresseGeprueft: true };
const APPLE = { anbieter: 'apple', sub: 'a-anna', adresse: 'anna@example.org', adresseGeprueft: true };

test('die erste Anmeldung ueber einen Anbieter legt ein Konto an', async () => {
    const p = fangeProtokoll();
    try {
        const { speicher, schnitt, protokoll } = aufbau();
        const ergebnis = await verknuepfeAnbieterkennung({ speicher: schnitt, protokoll, ...GOOGLE });

        assert.equal(ergebnis.neu, true);
        assert.match(ergebnis.kontoId, /^[0-9a-f]{32}$/);

        const arten = (await leseKennungen(speicher, ergebnis.kontoId)).map((k) => k.art).sort();
        // Die gepruefte und noch freie Adresse wird als Kennung beansprucht —
        // sonst kaeme derselbe Mensch ueber den Einmalcode in ein zweites Konto.
        assert.deepEqual(arten, ['google', 'mail']);
        assert.equal(await findeKonto(speicher, 'mail', 'anna@example.org'), ergebnis.kontoId);
    } finally {
        p.zurueck();
    }
});

test('die zweite Anmeldung desselben Anbieters findet dasselbe Konto', async () => {
    const p = fangeProtokoll();
    try {
        const { speicher, schnitt, protokoll } = aufbau();
        const erste = await verknuepfeAnbieterkennung({ speicher: schnitt, protokoll, ...GOOGLE });
        const zweite = await verknuepfeAnbieterkennung({
            speicher: schnitt, protokoll, ...GOOGLE,
            // Die Adresse darf sich zwischendurch aendern; die Zuordnung
            // haengt am sub und nicht an ihr.
            adresse: 'anna.neu@example.org',
        });

        assert.equal(zweite.kontoId, erste.kontoId);
        assert.equal(zweite.neu, false);
        assert.equal((await leseKennungen(speicher, erste.kontoId)).filter((k) => k.art === 'google').length, 1);
    } finally {
        p.zurueck();
    }
});

test('dieselbe gepruefte Adresse ueber zwei Anbieter fuehrt auf EIN Konto', async () => {
    const p = fangeProtokoll();
    try {
        const { speicher, schnitt, protokoll } = aufbau();
        const ueberGoogle = await verknuepfeAnbieterkennung({ speicher: schnitt, protokoll, ...GOOGLE });
        const ueberApple = await verknuepfeAnbieterkennung({ speicher: schnitt, protokoll, ...APPLE });

        assert.equal(ueberApple.kontoId, ueberGoogle.kontoId, 'kein zweites Konto');
        assert.equal(ueberApple.neu, false);
        assert.equal(ueberApple.angeschlossen, true);

        const arten = (await leseKennungen(speicher, ueberGoogle.kontoId)).map((k) => k.art).sort();
        assert.deepEqual(arten, ['apple', 'google', 'mail']);
        assert.equal(await findeKonto(speicher, 'apple', 'a-anna'), ueberGoogle.kontoId);
    } finally {
        p.zurueck();
    }
});

test('ungeprueft beim Anbieter: dieselbe Adresse fuehrt auf ein ZWEITES Konto', async () => {
    const p = fangeProtokoll();
    try {
        const { speicher, schnitt, protokoll } = aufbau();
        const ueberGoogle = await verknuepfeAnbieterkennung({ speicher: schnitt, protokoll, ...GOOGLE });

        // Das ist der Angriff aus Abschnitt 6: ein Anbieter, der eine Adresse
        // meldet, ohne sie geprueft zu haben. Waere hier eine Verknuepfung,
        // stuende der Fremde in Annas Konto.
        const ueberApple = await verknuepfeAnbieterkennung({
            speicher: schnitt, protokoll, ...APPLE, adresseGeprueft: false,
        });

        assert.notEqual(ueberApple.kontoId, ueberGoogle.kontoId);
        // Und das neue Konto beansprucht die Adresse NICHT — sonst haette es
        // sie dem ersten weggenommen.
        assert.equal(await findeKonto(speicher, 'mail', 'anna@example.org'), ueberGoogle.kontoId);
        assert.deepEqual((await leseKennungen(speicher, ueberApple.kontoId)).map((k) => k.art), ['apple']);
    } finally {
        p.zurueck();
    }
});

test('unbestaetigt im eigenen Bestand: dieselbe Adresse fuehrt auf ein ZWEITES Konto', async () => {
    const p = fangeProtokoll();
    try {
        const { speicher, schnitt, protokoll } = aufbau();
        // holeOderLegeKontoAn setzt `bestaetigtAm: 0` — die Adresse ist
        // beansprucht, aber niemand hat je einen Code aus dem Postfach geholt.
        const { kontoId: bestand } = await holeOderLegeKontoAn(speicher, 'anna@example.org');

        const ergebnis = await verknuepfeAnbieterkennung({ speicher: schnitt, protokoll, ...GOOGLE });

        assert.notEqual(ergebnis.kontoId, bestand);
        assert.equal(await findeKonto(speicher, 'mail', 'anna@example.org'), bestand,
            'die Adresse bleibt beim ersten Konto');
        assert.ok(protokoll.zeilen.some((z) => z.art === 'fremd_getrennt_gehalten'));
    } finally {
        p.zurueck();
    }
});

test('aus dem angemeldeten Zustand heraus wird ohne Adressvergleich verknuepft', async () => {
    const p = fangeProtokoll();
    try {
        const { speicher, schnitt, protokoll } = aufbau();
        const meins = await legeKontoAn(speicher, { kennungen: [{ art: 'passkey', wert: 'p-1' }] });

        const ergebnis = await verknuepfeAnbieterkennung({
            speicher: schnitt, protokoll, anbieter: 'google', sub: 'g-anna',
            adresse: 'ganz@andere.org', adresseGeprueft: false,
            bestehendesKonto: meins,
        });

        assert.equal(ergebnis.kontoId, meins);
        assert.equal(ergebnis.angeschlossen, true);
        assert.equal(zaehleAnmeldewege(await leseKennungen(speicher, meins)), 2);
    } finally {
        p.zurueck();
    }
});

// ════════════════════════════════════════════════════════════════════
//  Durch den laufenden Dienst
// ════════════════════════════════════════════════════════════════════

test('die Wege der Fremdanmeldung haengen wirklich in der Weiche', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        // Ohne GOOGLE_CLIENT_ID ist das 501 und nicht 404 — 404 hiesse, die
        // Route sei nie verdrahtet worden, und genau das war der offene Punkt.
        const google = await d.rufe('GET', '/api/google/start');
        assert.equal(google.status, 501);
        assert.equal(google.daten.fehler, 'google_nicht_eingerichtet');

        const apple = await d.rufe('GET', '/api/apple/start');
        assert.equal(apple.status, 501);
        assert.equal(apple.daten.fehler, 'apple_nicht_eingerichtet');

        // Passkeys brauchen keine Einrichtung, wohl aber eine Sitzung.
        const passkey = await d.rufe('GET', '/api/passkey');
        assert.equal(passkey.status, 401);
        assert.equal(passkey.daten.fehler, 'nicht_angemeldet');

        // Und die Kopfzeilen sind dieselben wie ueberall sonst.
        assert.equal(passkey.kopf.get('cache-control'), 'no-store');
        assert.equal(passkey.kopf.get('x-content-type-options'), 'nosniff');
        assert.equal(passkey.kopf.get('referrer-policy'), 'no-referrer');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('eine Anfrage von fremdem Ursprung kommt an keinen Fremdanmeldeweg heran', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const antwort = await d.rufe('DELETE', '/api/google/verknuepfung', undefined,
            { kopf: { Origin: 'https://boese.example' } });
        assert.equal(antwort.status, 403);
        assert.equal(antwort.daten.fehler, 'ursprung_falsch');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('der letzte Anmeldeweg laesst sich nicht loesen — und danach schon', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        // Ein Konto, das NUR ueber Google hereinkommt.
        const kontoId = await legeKontoAn(d.speicher, {
            kennungen: [{ art: 'google', wert: 'g-allein' }],
        });
        const sitzung = await erzeugeSitzung(d.speicher, kontoId);
        d.setzePlaetzchen('hz_sitzung=' + sitzung.wert);

        const gesperrt = await d.rufe('DELETE', '/api/google/verknuepfung');
        assert.equal(gesperrt.status, 409);
        assert.equal(gesperrt.daten.fehler, 'letzter_anmeldeweg');
        assert.equal(await findeKonto(d.speicher, 'google', 'g-allein'), kontoId, 'nichts geloescht');

        // Ein zweiter Weg, und derselbe Aufruf geht durch.
        await verknuepfeKennung(d.speicher, kontoId, 'passkey', 'p-1', {});
        const geloest = await d.rufe('DELETE', '/api/google/verknuepfung');
        assert.equal(geloest.status, 204);
        assert.equal(await findeKonto(d.speicher, 'google', 'g-allein'), null);
        assert.deepEqual((await leseKennungen(d.speicher, kontoId)).map((k) => k.art), ['passkey']);

        // Zweimal loesen ist kein Fehler des Nutzers, sondern schlicht nichts
        // mehr da: 404, nicht 500.
        const nochmal = await d.rufe('DELETE', '/api/google/verknuepfung');
        assert.equal(nochmal.status, 404);

        // Und wieder anschliessen laesst sich der Weg auch.
        await verknuepfeKennung(d.speicher, kontoId, 'google', 'g-allein', {});
        assert.equal(await findeKonto(d.speicher, 'google', 'g-allein'), kontoId);
        const liste = await d.rufe('GET', '/api/passkey');
        assert.equal(liste.status, 200);
        assert.equal(liste.daten.anmeldewege, 2);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('eine bestaetigte Adresse zaehlt als zweiter Weg, eine unbestaetigte nicht', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        // Der echte Weg: Einmalcode einloesen setzt `bestaetigtAm`.
        const kontoId = await meldeAn(d, 'anna@example.org');
        await verknuepfeKennung(d.speicher, kontoId, 'google', 'g-anna', {});

        const geloest = await d.rufe('DELETE', '/api/google/verknuepfung');
        assert.equal(geloest.status, 204, 'die bestaetigte Adresse traegt die Anmeldung allein');

        // Dasselbe Konto, aber die Adresse gilt wieder als unbestaetigt.
        await d.speicher.setze(TABELLE_KONTEN, {
            partitionKey: kontoId, rowKey: 'kennung:mail',
            adresse: 'anna@example.org', bestaetigtAm: 0,
        });
        await verknuepfeKennung(d.speicher, kontoId, 'google', 'g-anna', {});

        const gesperrt = await d.rufe('DELETE', '/api/google/verknuepfung');
        assert.equal(gesperrt.status, 409);
        assert.equal(gesperrt.daten.fehler, 'letzter_anmeldeweg');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('das Protokoll der Fremdanmeldung nennt den Anbieter, nie die Adresse', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const kontoId = await legeKontoAn(d.speicher, {
            kennungen: [{ art: 'google', wert: 'g-anna', daten: { adresse: 'anna@example.org' } }],
        });
        const sitzung = await erzeugeSitzung(d.speicher, kontoId);
        d.setzePlaetzchen('hz_sitzung=' + sitzung.wert);
        await d.rufe('DELETE', '/api/google/verknuepfung');

        const zeile = p.zeilen.find((z) => z.art === 'fremd_loesen');
        assert.ok(zeile, 'das Zwischenstueck reicht die Zeile durch');
        assert.equal(zeile.anbieter, 'google');
        assert.equal(zeile.ergebnis, 'letzter_weg');
        // `kontoId` heisst in der Erlaubnisliste `konto` und ist gekuerzt.
        assert.equal(zeile.konto, kontoId.slice(0, 12));

        const alles = JSON.stringify(p.zeilen);
        assert.ok(!alles.includes('anna@example.org'));
        assert.ok(!alles.includes('g-anna'));
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('die Anbieterstarts sind gedrosselt wie eine Anmeldung', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        let gedrosselt = null;
        // 20 je Netz und zehn Minuten, dieselbe Zahl wie /api/anmelden.
        for (let i = 0; i < 25 && !gedrosselt; i++) {
            const antwort = await d.rufe('GET', '/api/google/start');
            if (antwort.status === 429) gedrosselt = antwort;
        }
        assert.ok(gedrosselt, 'ohne Grenze waere das ein kostenloser Hebel gegen Google');
        assert.equal(gedrosselt.daten.fehler, 'zu_viele_versuche');
        assert.ok(Number(gedrosselt.kopf.get('retry-after')) > 0);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('Apples Rueckweg wird NICHT nach Netz gedrosselt', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        /*
          Er kommt von Apples Adressen, nicht von der des Nutzers. Eine
          Grenze je Netz traefe dort alle gleichzeitig — und niemand kaeme
          mehr herein, ohne dass jemand etwas falsch gemacht haette.
        */
        for (let i = 0; i < 30; i++) {
            const antwort = await d.rufe('POST', '/api/apple/zurueck', undefined, {
                kopf: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            assert.notEqual(antwort.status, 429);
            // 501 heisst: Der Weg ist da, nur Apple ist nicht eingerichtet.
            // Ein 404 hiesse, dieser Test misst gar nichts.
            assert.equal(antwort.status, 501);
        }
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});
