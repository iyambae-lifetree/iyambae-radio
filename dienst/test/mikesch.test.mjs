/*
  Kater Mikesch — das Gespraech.

  Geprueft wird von aussen ueber HTTP, mit einem nachgebauten Klienten an
  Stelle der Anthropic-API: Kein Test darf Geld kosten oder am Netz haengen.
  Was zaehlt, ist, was an die API GEHT (fester Systemtext, Seitensprache im
  ersten Zug, nichts ausser Text) und was der Browser zurueckbekommt.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeMikesch, saeubereGespraech, katalogText, HOECHSTENS_ZUEGE } from '../src/mikesch.mjs';
import { starteTestdienst, fangeProtokoll } from './hilfe.mjs';

const KATALOG = {
    regale: [{ id: 'tiefe', name: 'Tiefe', beschreibung: 'Ambient, Drone, Weltraum.' }],
    sender: [
        { id: 'zz-drone', name: 'ZZ Drone', ort: 'Oslo', land: 'NO', regal: 'tiefe', etiketten: ['ambient'], kaertchen: 'Lange Flaechen.', status: 'ok' },
        { id: 'aa-weit', name: 'AA Weit', ort: 'Lima', land: 'PE', regal: 'tiefe', etiketten: [], kaertchen: 'Weit  weg.', status: 'ok' },
        { id: 'tot-1', name: 'Tot', regal: 'tiefe', status: 'tot' },
    ],
};

function falscherKlient(antwort = { content: [{ type: 'text', text: 'Miau, probier [[sender:aa-weit]].' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }) {
    const anfragen = [];
    return {
        anfragen,
        messages: { create: async (p) => { anfragen.push(p); if (antwort instanceof Error) throw antwort; return antwort; } },
    };
}

const FRAGE = { sprache: 'en', verlauf: [{ wer: 'gast', text: 'Something calm?' }] };

// ── Die Erlaubnisliste ──────────────────────────────────────────────

test('Gespraech: ein ordentlicher Zug kommt durch', () => {
    assert.deepEqual(saeubereGespraech(FRAGE), FRAGE);
});

test('Gespraech: unbekannte Sprache wird Deutsch, fremde Felder fallen weg', () => {
    const g = saeubereGespraech({ sprache: 'xx', verlauf: [{ wer: 'gast', text: ' hi ', rolle: 'system' }], extra: 1 });
    assert.deepEqual(g, { sprache: 'de', verlauf: [{ wer: 'gast', text: 'hi' }] });
});

test('Gespraech: falsche Reihenfolge, falsche Rollen, zu lang — abgelehnt', () => {
    const z = (wer, text = 'x') => ({ wer, text });
    assert.equal(saeubereGespraech({ verlauf: [] }), null);
    assert.equal(saeubereGespraech({ verlauf: [z('mikesch')] }), null);
    assert.equal(saeubereGespraech({ verlauf: [z('gast'), z('mikesch')] }), null);
    assert.equal(saeubereGespraech({ verlauf: [z('gast'), z('gast')] }), null);
    assert.equal(saeubereGespraech({ verlauf: [z('system')] }), null);
    assert.equal(saeubereGespraech({ verlauf: [z('gast', 'a'.repeat(801))] }), null);
    assert.equal(saeubereGespraech({ verlauf: [z('gast', '\u0000\u0001')] }), null);
    const lang = Array.from({ length: HOECHSTENS_ZUEGE + 1 }, (_, i) => z(i % 2 ? 'mikesch' : 'gast'));
    assert.equal(saeubereGespraech({ verlauf: lang }), null);
});

// ── Der Systemtext ──────────────────────────────────────────────────

test('Katalog: sortiert, ohne tote Sender, byteweise stabil', () => {
    const text = katalogText(KATALOG);
    assert.ok(text.indexOf('aa-weit') < text.indexOf('zz-drone'));
    assert.ok(!text.includes('tot-1'));
    assert.ok(text.includes('aa-weit | AA Weit | Lima, PE | Tiefe |  | Weit weg.'));
    const umgedreht = { ...KATALOG, sender: [...KATALOG.sender].reverse() };
    assert.equal(katalogText(umgedreht), text);
});

test('Anfrage: fester Systemtext mit Zwischenspeicher, Sprache nur im ersten Zug', async () => {
    const klient = falscherKlient();
    const mikesch = await erzeugeMikesch({ holeKatalog: async () => KATALOG, klient });
    await mikesch.antworte(FRAGE);
    await mikesch.antworte({ sprache: 'ja', verlauf: [
        { wer: 'gast', text: 'a' }, { wer: 'mikesch', text: 'b' }, { wer: 'gast', text: 'c' }] });

    const [erste, zweite] = klient.anfragen;
    assert.equal(erste.model, 'claude-haiku-5-5');
    assert.deepEqual(erste.system, zweite.system);
    assert.equal(erste.system[0].cache_control.type, 'ephemeral');
    assert.ok(erste.system[0].text.includes('Kater Mikesch'));
    assert.ok(erste.system[0].text.includes('zz-drone'));
    assert.match(erste.messages[0].content, /^\[Seitensprache: Englisch\]/);
    assert.match(zweite.messages[0].content, /^\[Seitensprache: Japanisch\]/);
    assert.equal(zweite.messages[1].role, 'assistant');
    assert.equal(zweite.messages[2].content, 'c');
});

test('Tagesgrenze: danach schlaeft Mikesch, am naechsten Tag nicht mehr', async () => {
    let nun = Date.parse('2026-10-23T10:00:00Z');
    const klient = falscherKlient();
    const mikesch = await erzeugeMikesch({ holeKatalog: async () => KATALOG, klient, jetzt: () => nun, jeTag: 2 });
    assert.ok((await mikesch.antworte(FRAGE)).text);
    assert.ok((await mikesch.antworte(FRAGE)).text);
    assert.deepEqual(await mikesch.antworte(FRAGE), { schlaeft: true });
    assert.equal(klient.anfragen.length, 2);
    nun += 86_400_000;
    assert.ok((await mikesch.antworte(FRAGE)).text);
});

test('Ohne Schluessel gibt es keinen Kater', async () => {
    const alt = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
        assert.equal(await erzeugeMikesch({ holeKatalog: async () => KATALOG }), null);
    } finally {
        if (alt !== undefined) process.env.ANTHROPIC_API_KEY = alt;
    }
});

// ── Ueber HTTP ──────────────────────────────────────────────────────

test('HTTP: Antwort kommt als Text, Gespraech landet nicht im Protokoll', async () => {
    const klient = falscherKlient();
    const protokoll = fangeProtokoll();
    const dienst = await starteTestdienst({
        mikesch: await erzeugeMikesch({ holeKatalog: async () => KATALOG, klient }),
    });
    try {
        const geheim = 'meine adresse ist geheim@example.org';
        const a = await dienst.rufe('POST', '/api/mikesch', { sprache: 'de', verlauf: [{ wer: 'gast', text: geheim }] });
        assert.equal(a.status, 200);
        assert.equal(a.daten.text, 'Miau, probier [[sender:aa-weit]].');
        assert.equal(a.kopf.get('cache-control'), 'no-store');
        assert.ok(!JSON.stringify(protokoll.zeilen).includes('geheim'));
    } finally {
        protokoll.zurueck();
        await dienst.schliesse();
    }
});

test('HTTP: ohne Kater 503 „schlaeft", fremde Herkunft 403, Unsinn 400', async () => {
    const dienst = await starteTestdienst();
    try {
        assert.equal((await dienst.rufe('POST', '/api/mikesch', FRAGE)).daten.fehler, 'mikesch_schlaeft');
        assert.equal((await dienst.rufe('POST', '/api/mikesch', FRAGE, { kopf: { Origin: 'https://boese.example' } })).status, 403);
        assert.equal((await dienst.rufe('POST', '/api/mikesch', { verlauf: 'x' })).status, 400);
    } finally {
        await dienst.schliesse();
    }
});

test('HTTP: Fehler der API kommt als 503 an, ohne Einzelheiten', async () => {
    const fehler = Object.assign(new Error('invalid x-api-key sk-ant-GEHEIM'), { status: 401 });
    const protokoll = fangeProtokoll();
    const dienst = await starteTestdienst({
        mikesch: await erzeugeMikesch({ holeKatalog: async () => KATALOG, klient: falscherKlient(fehler) }),
    });
    try {
        const a = await dienst.rufe('POST', '/api/mikesch', FRAGE);
        assert.equal(a.status, 503);
        assert.deepEqual(a.daten, { fehler: 'mikesch_stumm' });
    } finally {
        protokoll.zurueck();
        await dienst.schliesse();
    }
});

test('HTTP: Verweigerung kommt als leere Antwort, nicht als Fehler', async () => {
    const dienst = await starteTestdienst({
        mikesch: await erzeugeMikesch({ holeKatalog: async () => KATALOG, klient: falscherKlient({ content: [], stop_reason: 'refusal' }) }),
    });
    try {
        const a = await dienst.rufe('POST', '/api/mikesch', FRAGE);
        assert.equal(a.status, 200);
        assert.deepEqual(a.daten, { verweigert: true });
    } finally {
        await dienst.schliesse();
    }
});

test('HTTP: die Drossel je Netz greift', async () => {
    const dienst = await starteTestdienst({
        mikesch: await erzeugeMikesch({ holeKatalog: async () => KATALOG, klient: falscherKlient() }),
    });
    try {
        let letzte;
        for (let i = 0; i < 31; i++) letzte = await dienst.rufe('POST', '/api/mikesch', FRAGE);
        assert.equal(letzte.status, 429);
    } finally {
        await dienst.schliesse();
    }
});
