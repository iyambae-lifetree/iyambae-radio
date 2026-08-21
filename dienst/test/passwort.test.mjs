import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    pruefeRegeln, pruefeNeuesPasswort, normalisiere, laenge, hashe, pruefe,
    erzeugeSchranke, setzeSchranke, UeberlastFehler, zaehleLeaks,
    gleichOhneZeitverrat, MINDESTLAENGE, HOECHSTLAENGE,
} from '../src/passwort.mjs';
import { fangeProtokoll } from './hilfe.mjs';

const gruende = (ergebnis) => ergebnis.gruende.map((g) => g.grund);

// ── Die Regeln nach NIST SP 800-63B-4 ───────────────────────────────

test('vierzehn Zeichen sind zu kurz, und die Antwort sagt wie viel fehlt', () => {
    const ergebnis = pruefeRegeln('a'.repeat(9) + 'bcdef');   // 14
    assert.equal(ergebnis.ok, false);
    assert.deepEqual(gruende(ergebnis), ['zu_kurz']);
    assert.equal(ergebnis.gruende[0].fehlt, 1);
    assert.equal(ergebnis.gruende[0].mindestens, MINDESTLAENGE);
});

test('genau fuenfzehn Zeichen gehen', () => {
    assert.equal(pruefeRegeln('korrekt-pferd-1').ok, true);
    assert.equal(laenge('korrekt-pferd-1'), 15);
});

test('vierundsechzig Zeichen gehen und werden NICHT gekuerzt', async () => {
    const lang = 'Ph' + 'x'.repeat(60) + 'Z9';
    assert.equal(laenge(lang), 64);
    assert.equal(pruefeRegeln(lang).ok, true);

    // Der Beweis gegen stilles Kuerzen: Ein Passwort, das sich erst im
    // vorletzten Zeichen unterscheidet, darf nicht passen.
    const hash = await hashe(lang);
    assert.equal(await pruefe(lang, hash), true);
    assert.equal(await pruefe(lang.slice(0, 63) + 'A', hash), false);
    assert.equal(await pruefe(lang.slice(0, 63), hash), false);
});

test('mehr als die Hoechstlaenge wird abgelehnt, nicht abgeschnitten', () => {
    const ergebnis = pruefeRegeln('ab'.repeat(Math.ceil((HOECHSTLAENGE + 5) / 2)).slice(0, HOECHSTLAENGE + 5));
    assert.deepEqual(gruende(ergebnis), ['zu_lang']);
    assert.equal(ergebnis.gruende[0].zuviel, 5);
});

test('KEINE Komplexitaetsregeln: Kleinbuchstaben allein genuegen', () => {
    // Genau das, was NIST verlangt und die meisten Formulare verweigern.
    assert.equal(pruefeRegeln('wolken ziehen ueber den hof').ok, true);
});

test('Unicode ist erlaubt, auch jenseits der Grundebene', async () => {
    const mitEmoji = 'Sonnenaufgang\u{1F305}ueber\u{1F30A}dem\u{1F5FB}Meer';
    assert.equal(pruefeRegeln(mitEmoji).ok, true);

    const hash = await hashe(mitEmoji);
    assert.equal(await pruefe(mitEmoji, hash), true);
});

test('NFKC: dieselbe Eingabe in zwei Schreibweisen ergibt denselben Hash', async () => {
    // Ein Umlaut als ein Zeichen und als Buchstabe plus Trema. Ohne
    // Normalisierung meldet sich niemand vom Telefon an, der sich am
    // Rechner angemeldet hat.
    const einTeil = 'Mädchenfahrrad-1978';         // ä
    const zweiTeile = 'Mädchenfahrrad-1978';      // a + U+0308

    assert.notEqual(einTeil, zweiTeile, 'die Eingaben muessen wirklich verschieden sein');
    assert.equal(normalisiere(einTeil), normalisiere(zweiTeile));

    const hash = await hashe(einTeil);
    assert.equal(await pruefe(zweiTeile, hash), true, 'beide Schreibweisen muessen passen');
});

test('NFKC faltet auch Formvarianten, und die Laenge zaehlt Zeichen', () => {
    // Halbbreite Katakana und eine Ligatur werden von NFKC zerlegt.
    assert.equal(normalisiere('ﬁx'), 'fix');
    assert.equal(laenge('a\u{1F600}b'), 3, 'ein Emoji ist EIN Zeichen, nicht zwei');
});

test('fuenfzehnmal derselbe Buchstabe erfuellt die Laenge und wird trotzdem abgelehnt', () => {
    assert.deepEqual(gruende(pruefeRegeln('aaaaaaaaaaaaaaa')), ['nur_wiederholung']);
    assert.deepEqual(gruende(pruefeRegeln('abcdefghijklmnop')), ['nur_fortlaufend']);
});

test('das Passwort darf nicht die eigene Adresse enthalten', () => {
    const ergebnis = pruefeRegeln('lieselotte-und-noch-was', { adresse: 'lieselotte@example.org' });
    assert.deepEqual(gruende(ergebnis), ['enthaelt_adresse']);
});

test('leer wird als leer benannt und nicht als zu kurz', () => {
    assert.deepEqual(gruende(pruefeRegeln('')), ['leer']);
});

// ── Leak-Abgleich ───────────────────────────────────────────────────

test('nur fuenf Hexziffern gehen hinaus, nie das Passwort', async () => {
    let gesehen = null;
    const holen = async (adresse, optionen) => {
        gesehen = { adresse, optionen };
        return { ok: true, text: async () => '0018A45C4D1DEF81644B54AB7F969B88D65:1\n' };
    };

    await zaehleLeaks('irgendein sehr geheimes passwort', { holen });

    assert.match(gesehen.adresse, /^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
    assert.equal(gesehen.adresse.includes('geheim'), false);
    assert.equal(gesehen.optionen.headers['Add-Padding'], 'true');
});

test('ein bekanntes Passwort wird erkannt', async () => {
    const { createHash } = await import('node:crypto');
    const passwort = 'passwortpasswort';
    const abdruck = createHash('sha1').update(passwort).digest('hex').toUpperCase();

    const holen = async () => ({
        ok: true,
        text: async () => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\n' + abdruck.slice(5) + ':42\n',
    });

    const ergebnis = await pruefeNeuesPasswort(passwort, { holen });
    assert.equal(ergebnis.ok, false);
    assert.deepEqual(gruende(ergebnis), ['bekannt_geleakt']);
    assert.equal(ergebnis.gruende[0].funde, 42);
});

test('Blindeintraege aus dem Padding zaehlen nicht als Treffer', async () => {
    const { createHash } = await import('node:crypto');
    const passwort = 'weit-und-breit-nichts';
    const abdruck = createHash('sha1').update(passwort).digest('hex').toUpperCase();

    // Derselbe Abdruck, aber mit Zaehler 0 — so sieht Padding aus.
    const holen = async () => ({ ok: true, text: async () => abdruck.slice(5) + ':0\n' });

    assert.equal((await pruefeNeuesPasswort(passwort, { holen })).ok, true);
});

test('faellt HIBP aus, wird NICHT blockiert — es steht nur im Protokoll', async () => {
    const p = fangeProtokoll();
    try {
        const holen = async () => { throw new Error('kein Netz'); };
        const ergebnis = await pruefeNeuesPasswort('ein voellig neues passwort', { holen });

        assert.equal(ergebnis.ok, true, 'ein fremder Ausfall darf niemanden aussperren');
        assert.equal(ergebnis.leakAbgleichAusgefallen, true);
        assert.ok(p.zeilen.some((z) => z.art === 'passwort.leakabgleich' && z.dienst === 'hibp'));
    } finally {
        p.zurueck();
    }
});

test('das Protokoll des Leak-Abgleichs enthaelt kein Passwort', async () => {
    const p = fangeProtokoll();
    try {
        await zaehleLeaks('geheimnis-geheimnis-42', { holen: async () => { throw new Error('weg'); } });
        const alsText = JSON.stringify(p.zeilen);
        assert.equal(alsText.includes('geheimnis'), false);
    } finally {
        p.zurueck();
    }
});

// ── Die Schranke ────────────────────────────────────────────────────

test('die Schranke laesst nur N gleichzeitig durch', async () => {
    const schranke = erzeugeSchranke({ plaetze: 2, warteschlange: 10 });
    let gleichzeitig = 0;
    let hoechstens = 0;

    await Promise.all(Array.from({ length: 12 }, () => schranke.mit(async () => {
        gleichzeitig++;
        hoechstens = Math.max(hoechstens, gleichzeitig);
        await new Promise((f) => setTimeout(f, 5));
        gleichzeitig--;
    })));

    assert.equal(hoechstens, 2);
    assert.deepEqual(schranke.zustand(), { laufend: 0, wartend: 0, plaetze: 2 });
});

test('ist die Warteschlange voll, kommt UeberlastFehler mit Retry-After', async () => {
    const p = fangeProtokoll();
    try {
        const schranke = erzeugeSchranke({ plaetze: 1, warteschlange: 2 });
        const halte = [];

        // Einen Platz und zwei Wartende belegen.
        for (let i = 0; i < 3; i++) halte.push(schranke.nimm());
        await halte[0];

        await assert.rejects(() => schranke.nimm(), (fehler) => {
            assert.ok(fehler instanceof UeberlastFehler);
            assert.ok(fehler.sekunden >= 1);
            return true;
        });

        assert.ok(p.zeilen.some((z) => z.art === 'passwort.ueberlastet' && z.ergebnis === 'ueberlastet'));
    } finally {
        p.zurueck();
    }
});

test('ein Platz wird auch dann frei, wenn die Arbeit wirft', async () => {
    const schranke = erzeugeSchranke({ plaetze: 1, warteschlange: 0 });
    await assert.rejects(() => schranke.mit(async () => { throw new Error('kaputt'); }));
    assert.equal(schranke.zustand().laufend, 0, 'sonst waere die Schranke nach einem Fehler zu');
});

test('eine unbekannte Adresse kostet einen Platz wie eine bekannte', async () => {
    // Sonst verhielte sich der Dienst unter Last fuer unbekannte Adressen
    // anders — nie 503 — und das waere die Antwort auf die Frage.
    const schranke = erzeugeSchranke({ plaetze: 1, warteschlange: 0 });
    const alt = setzeSchranke(schranke);
    try {
        const blockiert = schranke.nimm();
        await blockiert;
        await assert.rejects(() => pruefe('irgendwas', undefined), UeberlastFehler);
    } finally {
        setzeSchranke(alt);
    }
});

// ── Zeitkonstanter Vergleich ────────────────────────────────────────

test('gleichOhneZeitverrat vergleicht Inhalt, nicht Laenge', () => {
    assert.equal(gleichOhneZeitverrat('abc', 'abc'), true);
    assert.equal(gleichOhneZeitverrat('abc', 'abd'), false);
    // Unterschiedliche Laengen duerfen nicht werfen — timingSafeEqual tut
    // das, wenn man es unvorbereitet fuettert.
    assert.equal(gleichOhneZeitverrat('a', 'x'.repeat(500)), false);
    assert.equal(gleichOhneZeitverrat(null, undefined), true);
});
