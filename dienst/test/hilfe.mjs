/*
  Gemeinsames Werkzeug fuer die Tests. Enthaelt selbst KEINE Tests.

  Der Dienst wird dabei wirklich gestartet und wirklich ueber HTTP
  angesprochen — nicht mit erfundenen Anfrageobjekten. Das ist der
  Unterschied zwischen „die Funktion tut das Richtige" und „der Endpunkt tut
  das Richtige": Plaetzchen, Kopfzeilen, Statuscodes und die Weiche sind
  genau die Stellen, an denen Sicherheitsfehler entstehen, und ein Test mit
  nachgebauten Objekten laesst sie alle aus.
*/

import http from 'node:http';
import { baueDienst, baueFremdanmeldung, erzeugeDrossel } from '../src/server.mjs';
import { speicherImArbeitsspeicher } from '../src/speicher.mjs';
import { bereiteVor } from '../src/passwort.mjs';
import { lenkeAusgabe } from '../src/protokoll.mjs';
import { vergissAufraeumen } from '../src/sitzung.mjs';

export const HERKUNFT = 'https://iyambae.fm';

/** Faengt alle Protokollzeilen auf, statt sie in die Testausgabe zu schuetten. */
export function fangeProtokoll() {
    const zeilen = [];
    const alt = lenkeAusgabe((zeile) => zeilen.push(JSON.parse(zeile)));
    return { zeilen, zurueck: () => lenkeAusgabe(alt) };
}

/**
 * Startet den Dienst auf einem freien Port.
 * @returns Werkzeug zum Rufen, plus `speicher`, `mails` und `schliesse`.
 */
export async function starteTestdienst({ drossel, fremd, zahlen, titel } = {}) {
    await bereiteVor();
    vergissAufraeumen();

    const speicher = speicherImArbeitsspeicher();
    const mails = [];
    const versender = {
        reiheEin: (auftrag) => { mails.push(auftrag); return true; },
        zustand: () => ({ wartend: 0, pausiert: false }),
    };

    /*
      Die Fremdanmeldung wird MITGESTARTET, auch wo kein Test sie braucht.
      Sonst pruefte kein Test die Weiche so, wie sie im Betrieb steht — und
      die Weiche ist genau die Stelle, an der ein Weg versehentlich vor oder
      hinter der Herkunftspruefung landet.
    */
    /*
      `zahlen` bleibt ohne Angabe `null` — genau wie im Betrieb, solange
      kein Arbeitsbereich und kein Schluessel eingetragen sind. Ein Test, der
      die Zusammenfassung braucht, reicht ein Buendel herein; alle anderen
      pruefen damit beilaeufig mit, dass der Weg ohne Einrichtung nicht
      etwa offen dasteht.
    */
    const server = http.createServer(baueDienst({
        speicher, versender,
        drossel: drossel ?? erzeugeDrossel(),
        fremd: fremd ?? await baueFremdanmeldung(speicher),
        zahlen: zahlen ?? null,
        // Wie `zahlen`: ohne Angabe null, damit jeder andere Test
        // beilaeufig mitprueft, dass der Weg ohne Einrichtung nicht
        // etwa offen dasteht.
        titel: titel ?? null,
    }));
    await new Promise((f) => server.listen(0, '127.0.0.1', f));
    const basis = 'http://127.0.0.1:' + server.address().port;

    let plaetzchen = null;

    async function rufe(verfahren, pfad, koerper, extra = {}) {
        const kopf = { Origin: HERKUNFT, ...extra.kopf };
        if (koerper !== undefined) kopf['Content-Type'] = 'application/json';
        if (plaetzchen && extra.ohnePlaetzchen !== true) kopf.Cookie = plaetzchen;

        const begonnen = process.hrtime.bigint();
        const antwort = await fetch(basis + pfad, {
            method: verfahren,
            headers: kopf,
            body: koerper === undefined ? undefined : JSON.stringify(koerper),
        });
        const dauerMs = Number(process.hrtime.bigint() - begonnen) / 1e6;

        const setz = antwort.headers.get('set-cookie');
        if (setz && extra.merkePlaetzchen !== false) {
            plaetzchen = setz.split(';')[0];
            if (plaetzchen.endsWith('=')) plaetzchen = null;   // Abmelden
        }

        let daten = null;
        const text = await antwort.text();
        if (text) { try { daten = JSON.parse(text); } catch { daten = text; } }

        return { status: antwort.status, kopf: antwort.headers, daten, dauerMs, setzPlaetzchen: setz };
    }

    return {
        basis, speicher, mails, rufe,
        setzePlaetzchen: (wert) => { plaetzchen = wert; },
        holePlaetzchen: () => plaetzchen,
        schliesse: () => new Promise((f) => server.close(f)),
    };
}

/** Meldet eine Adresse an und gibt kontoId zurueck. Nutzt den echten Weg. */
export async function meldeAn(dienst, mail) {
    await dienst.rufe('POST', '/api/anmelden', { mail });
    const letzte = dienst.mails.at(-1);
    const antwort = await dienst.rufe('POST', '/api/anmelden/code', { mail, code: letzte.code });
    return antwort.daten.kontoId;
}

/** Der Median ist gegen einzelne Ausreisser robuster als der Mittelwert. */
export function median(zahlen) {
    const sortiert = [...zahlen].sort((a, b) => a - b);
    const mitte = Math.floor(sortiert.length / 2);
    return sortiert.length % 2 ? sortiert[mitte] : (sortiert[mitte - 1] + sortiert[mitte]) / 2;
}
