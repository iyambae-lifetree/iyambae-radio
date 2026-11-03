/*
  Kleine Haertungen aus der Pruefung vom 01.10.2026 (432hz-radio#46).

  Jede steht fuer sich und hat ihren eigenen Test hier, statt verstreut in
  den Dateien der Module, die sie beruehren: So sieht man an einer Stelle,
  was der Befund war und dass er gilt.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeVersender } from '../src/mail.mjs';
import { saeubereFreitext } from '../src/umfrage.mjs';
import {
    adresseSiehtEchtAus, erzeugeSpeicher, speicherImArbeitsspeicher, TABELLE_KONTEN,
} from '../src/speicher.mjs';
import {
    legeCodeAn, pruefeCode, vergissOffeneCodes, GUELTIG_MS, HOECHSTENS_VERSUCHE,
} from '../src/einmalcode.mjs';
import { liesUrspruenge } from '../src/urspruenge.mjs';
import { leseUmgebung } from '../src/fremd.mjs';
import { starteTestdienst, fangeProtokoll, meldeAn, HERKUNFT } from './hilfe.mjs';

// ── Punkt 1: Sprachwahl in Mails ────────────────────────────────────

test('eine Sprache wie __proto__ ergibt die englische Mail, keinen TypeError', async () => {
    for (const sprache of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
        const gesendet = new Promise((fertig) => {
            const versender = erzeugeVersender({ versendeRoh: async (mail) => { fertig(mail); } });
            versender.reiheEin({ art: 'code', an: 'a@example.org', code: '123456', minuten: 15, sprache });
        });
        // Mit Zeitgrenze: Vor der Berichtigung warf `texte()` und die Mail
        // kam nie an — der Test soll dann scheitern, nicht haengen.
        const mail = await Promise.race([gesendet, new Promise((_, nein) =>
            setTimeout(() => nein(new Error('keine Mail fuer ' + sprache)), 2000).unref())]);
        assert.match(mail.subject, /code/i, sprache);
        assert.match(mail.plainText, /123456/, sprache);
    }
});

// ── Punkt 2: Freitext in linearer Zeit ──────────────────────────────

test('langer Freitext ohne Leerraum blockiert den Event-Loop nicht', () => {
    for (const text of ['a'.repeat(4000), 'a'.repeat(3990) + '@', 'a@'.repeat(2000), 'a1'.repeat(2000)]) {
        // Das Kleinste aus fuenf Laeufen: Unter der Last der uebrigen Tests
        // schwankt ein einzelner Lauf, das Minimum misst den Code.
        let ms = Infinity;
        for (let i = 0; i < 5; i++) {
            const beginn = process.hrtime.bigint();
            saeubereFreitext(text);
            ms = Math.min(ms, Number(process.hrtime.bigint() - beginn) / 1e6);
        }
        assert.ok(ms < 20, `${ms.toFixed(1)} ms fuer ${text.slice(0, 6)}…`);
    }
});

test('der Freitext entfernt weiter Adressen und Geheimnisse, und nur sie', () => {
    assert.equal(saeubereFreitext('schreib an hallo@example.org bitte'),
        'schreib an entfernt:adresse bitte');
    assert.equal(saeubereFreitext('mein schluessel ist zufall7Hq2Lw9Xa4Mb8Rt3Yp6'),
        'mein schluessel ist entfernt:geheimnis');
    assert.equal(saeubereFreitext('Fuenfundzwanzigbuchstabenwort ohne Ziffer'),
        'Fuenfundzwanzigbuchstabenwort ohne Ziffer');
    assert.equal(saeubereFreitext('432 Hz klingt waermer'), '432 Hz klingt waermer');
});

// ── Punkt 6: Speicherwahl scheitert geschlossen ─────────────────────

test('im Container ohne Tabellenendpunkt bricht der Speicher ab, statt still im Arbeitsspeicher zu laufen', async () => {
    await assert.rejects(erzeugeSpeicher({ CONTAINER_APP_NAME: 'ca-iyambae-web' }), /TABELLEN_ENDPUNKT/);
    await assert.rejects(erzeugeSpeicher({ NODE_ENV: 'production' }), /TABELLEN_ENDPUNKT/);
    const oertlich = await erzeugeSpeicher({});
    assert.equal(oertlich.art, 'arbeitsspeicher');
});

// ── Punkt 7: Adressmuster ───────────────────────────────────────────

test('Trenn- und Klammerzeichen im lokalen Teil sind keine Adresse', () => {
    for (const mail of ['a,b@x.de', 'a;b@x.de', '"a"@x.de', 'a<b@x.de', 'a>b@x.de',
        'a(b)@x.de', 'a\b@x.de', 'a:b@x.de', 'a@b,c.de', 'a@b;c.de', 'a@b>c.de']) {
        assert.equal(adresseSiehtEchtAus(mail), false, mail);
    }
    for (const mail of ['vor.name+tag@example.org', "o'brien@example.ie", 'a_b-c@sub.example.co.uk',
        'name@münchen.de', 'jürgen@example.de']) {
        assert.equal(adresseSiehtEchtAus(mail), true, mail);
    }
});

// ── Punkt 4: Einmalcode erneut senden statt ersetzen ────────────────

/*
  Bis hierher ersetzte jede Anforderung den Code. Wer eine fremde Adresse
  kannte, konnte ihr die Codeanmeldung verleiden: Jede neue Anforderung
  machte den Code in der letzten Mail wertlos, und die Mail mit dem neuen
  kam vielleicht erst, nachdem der Besitzer den alten getippt hatte.
  Entschieden am 13.10.: Solange ein Code offen ist, geht DERSELBE noch
  einmal hinaus. Die fuenf Fehlversuche je Code bleiben, und sie beginnen
  beim erneuten Senden nicht von vorn.
*/

const KONTO46 = 'c'.repeat(32);

test('eine zweite Anforderung schickt denselben Code, solange er offen ist', async () => {
    vergissOffeneCodes();
    const speicher = speicherImArbeitsspeicher();
    const jetzt = 1_800_000_000_000;
    const erste = await legeCodeAn(speicher, KONTO46, 'anmeldung', jetzt);
    const zweite = await legeCodeAn(speicher, KONTO46, 'anmeldung', jetzt + 3 * 60_000);

    assert.equal(zweite.code, erste.code);
    assert.equal(zweite.erneut, true);
    // Die Frist laeuft weiter, sie beginnt nicht neu. Sonst hielte ein
    // Fremder den Code mit jeder Anforderung zehn Minuten laenger offen.
    assert.equal(zweite.ablauf, erste.ablauf);
    assert.deepEqual(await pruefeCode(speicher, KONTO46, erste.code, 'anmeldung', jetzt + 4 * 60_000), { ok: true });
});

test('erneutes Senden setzt die Fehlversuche nicht zurueck', async () => {
    vergissOffeneCodes();
    const speicher = speicherImArbeitsspeicher();
    const { code } = await legeCodeAn(speicher, KONTO46);
    const falsch = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 3; i++) await pruefeCode(speicher, KONTO46, falsch);
    const erneut = await legeCodeAn(speicher, KONTO46);
    assert.equal(erneut.code, code);

    assert.equal((await pruefeCode(speicher, KONTO46, falsch)).uebrig, 1);
    assert.equal((await pruefeCode(speicher, KONTO46, falsch)).uebrig, 0);
    assert.deepEqual(await pruefeCode(speicher, KONTO46, code), { ok: false, grund: 'zu_oft' });
});

test('nach Einloesen, Verbrennen oder Ablauf gibt es einen neuen Code', async () => {
    vergissOffeneCodes();
    const speicher = speicherImArbeitsspeicher();
    const jetzt = 1_800_000_000_000;

    // Eingeloest
    const a = await legeCodeAn(speicher, KONTO46, 'anmeldung', jetzt);
    await pruefeCode(speicher, KONTO46, a.code, 'anmeldung', jetzt);
    const b = await legeCodeAn(speicher, KONTO46, 'anmeldung', jetzt);
    assert.equal(b.erneut, false);

    // Verbrannt
    const falsch = b.code === '000000' ? '111111' : '000000';
    for (let i = 0; i <= HOECHSTENS_VERSUCHE; i++) await pruefeCode(speicher, KONTO46, falsch, 'anmeldung', jetzt);
    const c = await legeCodeAn(speicher, KONTO46, 'anmeldung', jetzt);
    assert.equal(c.erneut, false);
    assert.deepEqual(await pruefeCode(speicher, KONTO46, c.code, 'anmeldung', jetzt), { ok: true });

    // Abgelaufen, aber noch nicht abgeraeumt
    const d = await legeCodeAn(speicher, KONTO46, 'anmeldung', jetzt);
    const e = await legeCodeAn(speicher, KONTO46, 'anmeldung', jetzt + GUELTIG_MS + 1);
    assert.equal(e.erneut, false);
    assert.equal(e.ablauf, jetzt + GUELTIG_MS + 1 + GUELTIG_MS);
    if (d.code !== e.code) {
        assert.equal((await pruefeCode(speicher, KONTO46, d.code, 'anmeldung', jetzt + GUELTIG_MS + 2)).ok, false);
    }
});

test('ohne Gedaechtnis, etwa nach einem Neustart, wird ersetzt wie bisher', async () => {
    vergissOffeneCodes();
    const speicher = speicherImArbeitsspeicher();
    const alt = await legeCodeAn(speicher, KONTO46);
    vergissOffeneCodes();
    const neu = await legeCodeAn(speicher, KONTO46);

    assert.equal(neu.erneut, false);
    if (alt.code !== neu.code) assert.equal((await pruefeCode(speicher, KONTO46, alt.code)).ok, false);
    assert.deepEqual(await pruefeCode(speicher, KONTO46, neu.code), { ok: true });
});

test('auch beim erneuten Senden steht der Code nie in der Tabelle', async () => {
    vergissOffeneCodes();
    const speicher = speicherImArbeitsspeicher();
    const { code } = await legeCodeAn(speicher, KONTO46);
    await legeCodeAn(speicher, KONTO46);
    const zeile = await speicher.hole(TABELLE_KONTEN, KONTO46, 'code:anmeldung');
    assert.equal(JSON.stringify(zeile).includes(code), false);
});

test('/api/anmelden zweimal: beide Mails tragen denselben Code, und er gilt', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const mail = 'zweimal@example.org';
        assert.equal((await d.rufe('POST', '/api/anmelden', { mail })).status, 204);
        assert.equal((await d.rufe('POST', '/api/anmelden', { mail })).status, 204);

        assert.equal(d.mails.length, 2);
        assert.equal(d.mails[1].code, d.mails[0].code);
        assert.ok(d.mails[1].minuten >= 1 && d.mails[1].minuten <= Math.round(GUELTIG_MS / 60_000));

        const antwort = await d.rufe('POST', '/api/anmelden/code', { mail, code: d.mails[0].code });
        assert.equal(antwort.status, 200);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('die Mail sagt "eine Minute", nicht "1 Minuten"', async () => {
    for (const [sprache, muster] of [['de', /gilt eine Minute /], ['en', /valid for 1 minute /]]) {
        const mail = await new Promise((fertig) => {
            erzeugeVersender({ versendeRoh: async (m) => { fertig(m); } })
                .reiheEin({ art: 'code', an: 'a@example.org', code: '123456', minuten: 1, sprache });
        });
        assert.match(mail.plainText, muster, sprache);
    }
});

// ── Punkt 4: Warteschlange je Adresse entdoppeln ────────────────────

/** Reiht synchron ein und sammelt, was in den naechsten Takten hinausgeht. */
async function versendeGleichzeitig(auftraege) {
    const gesendet = [];
    const versender = erzeugeVersender({ versendeRoh: async (m) => { gesendet.push(m); } });
    for (const a of auftraege) versender.reiheEin(a);
    for (let i = 0; i < 20; i++) await new Promise((f) => setImmediate(f));
    return gesendet;
}

test('wartet schon eine Mail derselben Art an dieselbe Adresse, geht nur die neueste hinaus', async () => {
    const gesendet = await versendeGleichzeitig([
        { art: 'code', an: 'a@example.org', code: '111111', minuten: 10, sprache: 'de' },
        { art: 'code', an: 'a@example.org', code: '222222', minuten: 10, sprache: 'de' },
        { art: 'code', an: 'a@example.org', code: '333333', minuten: 10, sprache: 'de' },
    ]);
    assert.equal(gesendet.length, 1);
    assert.match(gesendet[0].plainText, /333333/);
});

test('verschiedene Adressen und verschiedene Arten bleiben getrennt', async () => {
    const gesendet = await versendeGleichzeitig([
        { art: 'code', an: 'a@example.org', code: '111111', minuten: 10, sprache: 'de' },
        { art: 'code', an: 'b@example.org', code: '222222', minuten: 10, sprache: 'de' },
        { art: 'marke', an: 'a@example.org', verweis: 'https://iyambae.fm/x', minuten: 60, sprache: 'de' },
    ]);
    assert.equal(gesendet.length, 3);
    assert.deepEqual(gesendet.map((m) => m.an), ['a@example.org', 'b@example.org', 'a@example.org']);
});

test('"marke" und "unbekannt" sind dieselbe Mail: Passwort vergessen', async () => {
    // Zwischen zwei Anforderungen kann ein Konto entstehen. Dann soll nicht
    // „kein Konto" UND „neues Passwort" hinausgehen, sondern das Neuere.
    const gesendet = await versendeGleichzeitig([
        { art: 'unbekannt', an: 'a@example.org', sprache: 'de' },
        { art: 'marke', an: 'a@example.org', verweis: 'https://iyambae.fm/x', minuten: 60, sprache: 'de' },
    ]);
    assert.equal(gesendet.length, 1);
    assert.match(gesendet[0].plainText, /iyambae\.fm\/x/);
});

// ── Punkt 4: Die globale Grenze folgt der Versandrate ───────────────

test('mailende Wege teilen sich eine globale Grenze von 25 je Minute', async () => {
    /*
      Bis hierher liess /api/anmelden global 200 je Minute durch, der
      Versand schafft 25. Der Rest stand in der Schlange, und bei 500
      wurden die AELTESTEN Mails verworfen — die, auf die schon jemand
      wartete. Jetzt zaehlen /api/anmelden, /api/passwort/vergessen und
      /api/rundbrief/anmelden in denselben Eimer.

      Jede Anfrage aus einem eigenen Netz und an eine eigene Adresse, damit
      nur die globale Achse greifen kann. Gleichzeitig, weil jede Antwort
      auf dem Zeitboden von 250 ms liegt.
    */
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const anfragen = Array.from({ length: 26 }, (_, i) => {
            const kopf = { 'X-Forwarded-For': '198.51.' + i + '.7' };
            const mail = 'flut' + i + '@example.org';
            return i % 2
                ? d.rufe('POST', '/api/anmelden', { mail }, { kopf })
                : d.rufe('POST', '/api/passwort/vergessen', { mail }, { kopf });
        });
        const status = (await Promise.all(anfragen)).map((a) => a.status);

        assert.equal(status.filter((s) => s === 204).length, 25, status.join(','));
        assert.equal(status.filter((s) => s === 429).length, 1, status.join(','));
        assert.equal(p.zeilen.find((z) => z.art === 'drossel')?.achse, 'global');

        // Und die Schnurrpost steht im selben Eimer.
        const post = await d.rufe('POST', '/api/rundbrief/anmelden',
            { mail: 'post@example.org', sprache: 'de', einwilligung: true },
            { kopf: { 'X-Forwarded-For': '198.51.200.7' } });
        assert.equal(post.status, 429);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

// ── Punkt 5: Inhaltstyp ─────────────────────────────────────────────

/*
  Ein POST mit `text/plain` ist eine „einfache" Anfrage: Der Browser schickt
  ihn von jeder fremden Seite ohne Vorabanfrage los. Die Herkunftspruefung
  faengt ihn ab, aber sie ist dann die EINZIGE Reihe. Mit application/json
  als Pflicht braucht jede fremde Seite eine Vorabanfrage, und die
  beantwortet dieser Dienst nicht.
*/

async function rohPost(d, pfad, kopf, rumpf = '{}') {
    const antwort = await fetch(d.basis + pfad, { method: 'POST', headers: kopf, body: rumpf });
    const text = await antwort.text();
    let daten = null;
    try { daten = JSON.parse(text); } catch { daten = text; }
    return { status: antwort.status, daten };
}

test('text/plain und fehlender Inhaltstyp bekommen 415, und es geht keine Mail hinaus', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const rumpf = JSON.stringify({ mail: 'plain@example.org' });
        for (const art of ['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded',
            'multipart/form-data; boundary=x', 'application/jsonx', null]) {
            const kopf = { Origin: HERKUNFT };
            if (art) kopf['Content-Type'] = art;
            // Ohne Content-Type setzt fetch fuer einen Text-Rumpf selbst
            // text/plain. Ein leerer Blob kommt ganz ohne Kopf an.
            const antwort = art
                ? await rohPost(d, '/api/anmelden', kopf, rumpf)
                : await rohPost(d, '/api/anmelden', kopf, new Blob([rumpf]));
            assert.equal(antwort.status, 415, String(art));
            assert.equal(antwort.daten.fehler, 'falscher_inhaltstyp');
        }
        assert.equal(d.mails.length, 0);

        // Auch auf den anonymen Wegen und beim Abmelden.
        for (const pfad of ['/api/umfrage', '/api/abmelden', '/api/stimmung']) {
            const antwort = await rohPost(d, pfad, { Origin: HERKUNFT, 'Content-Type': 'text/plain' });
            assert.equal(antwort.status, 415, pfad);
        }

        // Mit Zeichensatz und in anderer Schreibung bleibt es JSON.
        for (const art of ['application/json; charset=utf-8', 'Application/JSON']) {
            const antwort = await rohPost(d, '/api/anmelden', { Origin: HERKUNFT, 'Content-Type': art }, rumpf);
            assert.equal(antwort.status, 204, art);
        }
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

// ── Punkt 5: Urspruenge je Weg ──────────────────────────────────────

const APPS = 'https://apps.iyambae.fm';

test('apps.iyambae.fm darf die drei Rueckmeldewege', async () => {
    const p = fangeProtokoll();
    const d = await starteTestdienst();
    try {
        const kopf = { Origin: APPS };
        assert.equal((await d.rufe('POST', '/api/umfrage', { bezahlt: 'nie' }, { kopf })).status, 204);
        assert.equal((await d.rufe('POST', '/api/hoertest',
            { runde: '432-433', treffer: 3, wahl_a: 2, sprache: 'de' }, { kopf })).status, 204);
        assert.equal((await d.rufe('POST', '/api/stimmung',
            { a4: 432.1, sicherheit: 0.87, traegt: true, laenge: 'bis10min', kanaele: 2, endung: 'flac', sprache: 'de' },
            { kopf })).status, 204);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('apps.iyambae.fm bekommt auf jedem Kontoweg 403, auch mit der Umgebung aus main.bicep', async () => {
    /*
      Ausgerollt wird nur das Abbild, nicht main.bicep. In der laufenden
      Umgebung steht apps.iyambae.fm deshalb in ERLAUBTE_URSPRUENGE — genau
      so wird hier gestartet. Die Umfrage von apps ist die Gegenprobe: Ohne
      sie bestuende dieser Test auch dann, wenn apps gar nichts duerfte.
    */
    const p = fangeProtokoll();
    const d = await starteTestdienst({
        umgebung: { ERLAUBTE_URSPRUENGE: 'https://iyambae.fm,https://www.iyambae.fm,https://apps.iyambae.fm' },
    });
    try {
        assert.equal((await d.rufe('POST', '/api/umfrage', { bezahlt: 'nie' },
            { kopf: { Origin: APPS } })).status, 204, 'Gegenprobe: die Umfrage muss von apps gehen');

        const kontoId = await meldeAn(d, 'apps@example.org');
        assert.ok(kontoId);
        const kopf = { Origin: APPS };
        const wege = [
            ['POST', '/api/anmelden', { mail: 'apps@example.org' }],
            ['POST', '/api/anmelden/code', { mail: 'apps@example.org', code: '123456' }],
            ['POST', '/api/anmelden/passwort', { mail: 'apps@example.org', passwort: 'x' }],
            ['POST', '/api/passwort/vergessen', { mail: 'apps@example.org' }],
            ['POST', '/api/passwort/neu', { marke: 'x', passwort: 'y' }],
            ['POST', '/api/passwort/setzen', { passwort: 'lang genug und neu 4711' }],
            ['POST', '/api/abmelden', {}],
            ['POST', '/api/platten/abgleich', { stand: 0, eintraege: {} }],
            ['POST', '/api/verlauf/abgleich', { stand: 0, eintraege: {} }],
            ['DELETE', '/api/konto', {}],
            ['POST', '/api/mikesch', { verlauf: [] }],
            ['POST', '/api/rundbrief/anmelden', { mail: 'apps@example.org', sprache: 'de', einwilligung: true }],
            ['POST', '/api/rundbrief/bestaetigen', { marke: 'x' }],
            ['POST', '/api/rundbrief/abmelden', { marke: 'x' }],
            ['POST', '/api/passkey/anmelden/start', {}],
            ['POST', '/api/passkey/anlegen/start', {}],
        ];
        const mailsVorher = d.mails.length;
        for (const [verfahren, pfad, rumpf] of wege) {
            const antwort = await d.rufe(verfahren, pfad, rumpf, { kopf });
            assert.equal(antwort.status, 403, verfahren + ' ' + pfad + ' -> ' + antwort.status);
        }
        assert.equal(d.mails.length, mailsVorher, 'von apps aus darf keine Mail entstehen');

        // Und die Sitzung lebt noch: Das DELETE von eben hat nichts geloescht.
        assert.equal((await d.rufe('GET', '/api/konto')).status, 200);
    } finally {
        await d.schliesse();
        p.zurueck();
    }
});

test('steht apps in ERLAUBTE_URSPRUENGE (wie heute in main.bicep), ist es trotzdem kein Kontoursprung', () => {
    const u = liesUrspruenge({
        ERLAUBTE_URSPRUENGE: 'https://iyambae.fm, https://www.iyambae.fm, https://apps.iyambae.fm',
    });
    assert.deepEqual(u.konto, ['https://iyambae.fm', 'https://www.iyambae.fm']);
    assert.ok(u.rueckmeldung.includes('https://apps.iyambae.fm'));
    assert.ok(u.rueckmeldung.includes('https://iyambae.fm'));

    // Dieselbe Liste bekommt die Fremdanmeldung, also auch die Passkeys.
    const f = leseUmgebung({ ERLAUBTE_URSPRUENGE: 'https://iyambae.fm,https://apps.iyambae.fm' });
    assert.deepEqual(f.urspruenge, ['https://iyambae.fm']);

    // Ohne Angaben: die Vorgaben.
    const v = liesUrspruenge({});
    assert.deepEqual(v.konto, ['https://iyambae.fm', 'https://www.iyambae.fm']);
    assert.deepEqual(v.rueckmeldung, ['https://iyambae.fm', 'https://www.iyambae.fm', 'https://apps.iyambae.fm']);
});
