import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeDrossel, netzVon } from '../src/server.mjs';
import { starteTestdienst, fangeProtokoll } from './hilfe.mjs';

// ── Die Rechnung ────────────────────────────────────────────────────

test('nach der erlaubten Zahl greift die Drossel und nennt Retry-After', () => {
    let zeit = 0;
    const drossel = erzeugeDrossel({ uhr: () => zeit });
    const achsen = [['adresse', 'a', 3, 60_000]];

    for (let i = 0; i < 3; i++) assert.deepEqual(drossel.pruefe(achsen), { ok: true });

    const abgelehnt = drossel.pruefe(achsen);
    assert.equal(abgelehnt.ok, false);
    assert.equal(abgelehnt.achse, 'adresse');
    assert.ok(abgelehnt.sekunden >= 1, 'ohne Retry-After weiss niemand, wann er wiederkommen darf');
});

test('die Marken fuellen sich stetig nach, nicht in Spruengen', () => {
    /*
      Ein Zeitfenster mit harter Kante („5 je Minute", Zaehler zur vollen
      Minute auf null) laesst am Fensterwechsel die doppelte Menge durch: 5
      in der letzten Sekunde davor, 5 in der ersten danach.
    */
    let zeit = 0;
    const drossel = erzeugeDrossel({ uhr: () => zeit });
    const achsen = [['adresse', 'a', 6, 60_000]];

    for (let i = 0; i < 6; i++) drossel.pruefe(achsen);
    assert.equal(drossel.pruefe(achsen).ok, false);

    zeit += 10_000;   // eine Sechstelminute -> genau eine Marke
    assert.equal(drossel.pruefe(achsen).ok, true);
    assert.equal(drossel.pruefe(achsen).ok, false);
});

test('eine abgelehnte Anfrage verbraucht auf keiner Achse Marken', () => {
    let zeit = 0;
    const drossel = erzeugeDrossel({ uhr: () => zeit });
    // Die zweite Achse ist erschoepft, die erste noch reichlich gefuellt.
    const achsen = () => [['netz', 'n', 100, 60_000], ['global', 'g', 1, 60_000]];

    assert.equal(drossel.pruefe(achsen()).ok, true);
    for (let i = 0; i < 50; i++) assert.equal(drossel.pruefe(achsen()).ok, false);

    // Waeren die Marken der ersten Achse mitverbraucht worden, waere sie
    // jetzt leer — und ein Angreifer koennte mit abgelehnten Anfragen die
    // Drossel fuer alle anderen zuziehen.
    zeit += 60_000;
    assert.equal(drossel.pruefe([['netz', 'n', 100, 60_000]]).ok, true);
});

test('die Zahl der Eimer bleibt begrenzt', () => {
    // Sonst waere die Drossel selbst der Angriff: eine Million erfundener
    // Adressen sind eine Million Eintraege.
    const drossel = erzeugeDrossel({ hoechstensSchluessel: 50 });
    for (let i = 0; i < 5000; i++) drossel.pruefe([['adresse', 'a' + i, 5, 60_000]]);
    assert.ok(drossel.groesse() <= 50, 'Eimer: ' + drossel.groesse());
});

// ── Die Adresse des Besuchers ───────────────────────────────────────

test('aus X-Forwarded-For wird ein Netz, nie eine volle Adresse', () => {
    assert.equal(netzVon('203.0.113.47'), '203.0.113.0');
    assert.equal(netzVon('2a02:8109:abcd:1234::1'), '2a02:8109::');
    assert.equal(netzVon(''), 'unbekannt');
    assert.equal(netzVon(undefined), 'unbekannt');
});

test('der LETZTE Eintrag zaehlt, weil die davor gefaelscht sein koennen', () => {
    /*
      Der Browser darf X-Forwarded-For selbst mitschicken; der Ingress von
      Container Apps haengt die echte Adresse hinten an. Wer den ersten
      Eintrag nimmt, drosselt nach einem Wert, den der Angreifer bei jeder
      Anfrage neu erfindet.
    */
    assert.equal(netzVon('1.2.3.4, 5.6.7.8, 203.0.113.47'), '203.0.113.0');
    assert.equal(netzVon('irgendwas-erfundenes, 203.0.113.47'), '203.0.113.0');
});

// ── Am Endpunkt ─────────────────────────────────────────────────────

test('der Endpunkt antwortet 429 mit Retry-After', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const rufe = () => d.rufe('POST', '/api/anmelden', { mail: 'viel@example.org' },
            { kopf: { 'X-Forwarded-For': '203.0.113.9' } });

        let gedrosselt = null;
        for (let i = 0; i < 8 && !gedrosselt; i++) {
            const antwort = await rufe();
            if (antwort.status === 429) gedrosselt = antwort;
        }

        assert.ok(gedrosselt, 'die Drossel hat gar nicht gegriffen');
        assert.equal(gedrosselt.daten.fehler, 'zu_viele_versuche');
        const wieder = Number(gedrosselt.kopf.get('retry-after'));
        assert.ok(Number.isFinite(wieder) && wieder >= 1, 'Retry-After fehlt oder ist Unsinn');

        const zeile = p.zeilen.find((z) => z.art === 'drossel');
        assert.equal(zeile.ergebnis, 'gedrosselt');
        assert.equal(zeile.achse, 'adresse');
        // Auch hier: keine Adresse, kein Netz im Klartext.
        assert.equal(JSON.stringify(p.zeilen).includes('viel@'), false);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('eine gedrosselte Anfrage schickt keine Mail', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        for (let i = 0; i < 10; i++) {
            await d.rufe('POST', '/api/anmelden', { mail: 'flut@example.org' });
        }
        // Fuenf sind erlaubt, mehr darf der Mailversand nie zu sehen bekommen.
        assert.ok(d.mails.length <= 5, 'Mails: ' + d.mails.length);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});
