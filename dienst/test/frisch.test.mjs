/*
  Frische Anmeldung fuer die Wege, die einem Fremden eine Hintertuer oeffnen
  (432hz-radio#40): Passwort setzen, Passkey anlegen, Anbieter verknuepfen,
  Konto loeschen.

  Gegen den echten Dienst ueber HTTP, wie die anderen Endpunkttests. Die
  Sitzung wird „gealtert", indem ihre Zeile zurueckdatiert wird — so, wie sie
  nach einer Kaffeepause am offenen Geraet aussaehe.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TABELLE_KONTEN } from '../src/speicher.mjs';
import { FRISCH_MS } from '../src/sitzung.mjs';
import { sitzungSchnittstelle } from '../src/server.mjs';
import { starteTestdienst, meldeAn, fangeProtokoll } from './hilfe.mjs';

const PASSWORT = 'ein ausreichend langes passwort';

/** Datiert alle Sitzungen des Kontos um `ms` zurueck. */
async function altere(d, kontoId, ms = FRISCH_MS + 60_000) {
    const zeilen = [];
    for await (const z of d.speicher.liste(TABELLE_KONTEN, kontoId, 'sitzung:')) zeilen.push(z);
    for (const z of zeilen) {
        const { etag: _weg, ...ohneEtag } = z;
        await d.speicher.setze(TABELLE_KONTEN, { ...ohneEtag, angelegt: z.angelegt - ms });
    }
    assert.ok(zeilen.length > 0, 'keine Sitzung zum Altern gefunden');
}

test('Passwort setzen: frisch ja, nach der Frist 403 — und das Passwort bleibt ungesetzt', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const kontoId = await meldeAn(d, 'frisch@example.org');
        await altere(d, kontoId);

        const alt = await d.rufe('POST', '/api/passwort/setzen', { passwort: PASSWORT });
        assert.equal(alt.status, 403);
        assert.equal(alt.daten.fehler, 'frische_anmeldung_noetig');
        assert.equal((await d.rufe('GET', '/api/konto')).daten.hatPasswort, false,
            'abgelehnt heisst: nichts geschrieben');
        assert.ok(p.zeilen.some((z) => z.art === 'passwort.gesetzt' && z.grund === 'nicht_frisch'));

        // Neu anmelden genuegt — danach geht es.
        await meldeAn(d, 'frisch@example.org');
        assert.equal((await d.rufe('POST', '/api/passwort/setzen', { passwort: PASSWORT })).status, 204);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('Konto loeschen: nach der Frist 403, das Konto steht noch', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const kontoId = await meldeAn(d, 'loeschen@example.org');
        await altere(d, kontoId);

        const alt = await d.rufe('DELETE', '/api/konto', { bestaetigung: 'loeschen' });
        assert.equal(alt.status, 403);
        assert.equal(alt.daten.fehler, 'frische_anmeldung_noetig');
        assert.equal((await d.rufe('GET', '/api/konto')).daten.angemeldet, true);

        await meldeAn(d, 'loeschen@example.org');
        assert.equal((await d.rufe('DELETE', '/api/konto', { bestaetigung: 'loeschen' })).status, 204);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('GET /api/konto sagt, ob die Sitzung frisch ist — die Seite kann vorher fragen', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const kontoId = await meldeAn(d, 'anzeige@example.org');
        assert.equal((await d.rufe('GET', '/api/konto')).daten.frisch, true);
        await altere(d, kontoId);
        assert.equal((await d.rufe('GET', '/api/konto')).daten.frisch, false);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('Passkey anlegen ueber den echten Dienst: nach der Frist 403', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const kontoId = await meldeAn(d, 'passkey@example.org');
        await altere(d, kontoId);
        const alt = await d.rufe('POST', '/api/passkey/anlegen/start', {});
        assert.equal(alt.status, 403);
        assert.equal(alt.daten.fehler, 'frische_anmeldung_noetig');

        const fertig = await d.rufe('POST', '/api/passkey/anlegen/fertig', { vorgang: 'x', antwort: {} });
        assert.equal(fertig.status, 403, 'auch der Abschluss, nicht nur der Anfang');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('die Sitzungsschnittstelle fuer fremd.mjs meldet frisch und nicht frisch', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const kontoId = await meldeAn(d, 'schnitt@example.org');
        const sitzung = sitzungSchnittstelle(d.speicher);
        const anfrage = { headers: { cookie: d.holePlaetzchen() } };

        assert.equal(await sitzung.pruefe(anfrage), kontoId);
        assert.equal(await sitzung.frisch(anfrage), true);
        await altere(d, kontoId);
        assert.equal(await sitzung.frisch(anfrage), false);
        assert.equal(await sitzung.frisch({ headers: {} }), false, 'ohne Sitzung nie frisch');
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});
