/*
  Verschmelzen — die Merkliste und der Hoerverlauf.

  Reine Rechnung. Kein Netz, kein Speicher, keine Uhr ausser der, die man
  hineinreicht. Das ist Absicht: Diese Datei ist die einzige, die entscheidet,
  ob jemandem ein gemerkter Sender verlorengeht, und so etwas will man
  vollstaendig testen koennen.

  ── Warum die Merkliste eine Menge mit Zeitstempeln ist ─────────────

  Der naive Weg waere eine Liste von Kennungen und „wer zuletzt schreibt,
  gewinnt". Der Fall, an dem er zerbricht, steht im Bericht: Geraet A hat
  zwanzig Sender gemerkt, Geraet B fuenfzehn andere. Beide melden sich an.
  Mit „letzter gewinnt" bleiben je nach Reihenfolge zwanzig oder fuenfzehn
  uebrig, und fuenfzehn oder zwanzig sind weg — ohne Fehlermeldung, ohne dass
  jemand es merkt, bis er sie sucht.

  Deshalb traegt jeder Eintrag zwei Zeitstempel:

      { "<senderId>": { "a": <ms zugefuegt>, "e": <ms entfernt|null> } }

  Verschmolzen wird jeder Zeitstempel fuer sich, immer zum spaeteren hin:

      a = max(a_lokal, a_server)
      e = max(e_lokal, e_server)
      drin, wenn e === null oder a >= e

  Das hat drei Eigenschaften, auf die es ankommt, und alle drei sind
  getestet:

    VERTAUSCHBAR   A dann B ergibt dasselbe wie B dann A. Wer zuerst online
                   geht, aendert das Ergebnis nicht.
    WIEDERHOLBAR   Zweimal dasselbe verschmelzen aendert nichts mehr. Ein
                   wiederholter Abgleich nach einem Verbindungsabbruch kann
                   also nichts kaputtmachen.
    ENDGUELTIG     Ein Entfernen setzt sich gegen ein aelteres Hinzufuegen
                   durch. Wer auf A einen Sender wegwirft, bekommt ihn nicht
                   von B zurueckgeschoben, nur weil B ihn noch kennt.

  DER PREIS, und er gehoert benannt: Ein entfernter Eintrag verschwindet
  nicht, er wird zum Grabstein — `e` gesetzt, Zeile bleibt. Sonst kaeme er
  vom naechsten Geraet zurueck, das die Loeschung nie gesehen hat.
  Grabsteine wachsen mit. Ab GRABSTEIN_TAGE (Vorgabe 90, siehe
  infra/konto.bicep.entwurf) raeumt `raeumeGrabsteine` sie weg. Ein Geraet,
  das laenger als diese Frist offline war, kann einen geloeschten Sender
  wieder mitbringen. Neunzig Tage sind die Abwaegung; endlos waechst nichts.
*/

/*
  Grenzen — und sie sind gerechnet, nicht geschaetzt.

  Eine Zeichenketten-Eigenschaft in Table Storage fasst 32.768 Zeichen. Ein
  Eintrag als JSON ist rund 45 Zeichen lang ("nts-slow-focus":{"a":1755…,"e":
  null}). 600 Eintraege sind damit rund 27.000 Zeichen und lassen Luft.

  Die Zahl klingt hoch fuer eine Merkliste — es gibt 129 Sender. Sie muss es
  sein, weil Grabsteine mitzaehlen: Wer jahrelang merkt und wegwirft, sammelt
  Eintraege, die nicht mehr auf der Liste stehen, aber noch in der Zeile.

  Wichtiger als die Zahl ist, was bei Ueberschreitung passiert. Ohne Grenze
  waere die Folge nicht „ein Eintrag zu viel", sondern: JEDER weitere Abgleich
  dieses Kontos schluege fehl, fuer immer, mit einem Fehler aus dem
  Tabellendienst, den niemand versteht. Deshalb wird beschnitten statt
  abgelehnt, und beschnitten werden zuerst die Grabsteine.
*/
export const HOECHSTENS_EINTRAEGE = 600;
export const HOECHSTENS_ZEICHEN = 30_000;
const SENDER_MUSTER = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Ein Zeitstempel, den man beim Verschmelzen ohne Sonderfall vergleichen kann. */
function zahl(wert) {
    return typeof wert === 'number' && Number.isFinite(wert) && wert >= 0 ? Math.floor(wert) : 0;
}

/**
 * Nimmt entgegen, was vom Browser kommt, und laesst nur durch, was Form hat.
 * Alles Unbekannte faellt still weg — eine halb verstandene Merkliste ist
 * besser als eine abgelehnte.
 */
export function saeubereEintraege(roh) {
    const sauber = {};
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return sauber;
    let anzahl = 0;
    for (const [id, eintrag] of Object.entries(roh)) {
        if (anzahl >= HOECHSTENS_EINTRAEGE) break;
        if (!SENDER_MUSTER.test(id)) continue;
        if (!eintrag || typeof eintrag !== 'object') continue;
        const a = zahl(eintrag.a);
        const e = eintrag.e === null || eintrag.e === undefined ? null : zahl(eintrag.e);
        if (a === 0 && e === null) continue;   // traegt keine Aussage
        sauber[id] = { a, e };
        anzahl++;
    }
    return sauber;
}

/** Ist der Eintrag gerade auf der Merkliste? */
export function istDrin(eintrag) {
    if (!eintrag) return false;
    return eintrag.e === null || eintrag.e === undefined || zahl(eintrag.a) >= zahl(eintrag.e);
}

/** Ein Paar verschmelzen. Beide Zeitstempel je fuer sich zum spaeteren hin. */
function verschmelzeEintrag(links, rechts) {
    if (!links) return { a: zahl(rechts.a), e: rechts.e === null || rechts.e === undefined ? null : zahl(rechts.e) };
    if (!rechts) return { a: zahl(links.a), e: links.e === null || links.e === undefined ? null : zahl(links.e) };
    const a = Math.max(zahl(links.a), zahl(rechts.a));
    /*
      `null` heisst „nie entfernt" und nicht „am 1.1.1970 entfernt". Als
      Zahl waere es 0 und verlore gegen jedes echte Entfernen — richtig
      herum: Nur wenn BEIDE Seiten nie entfernt haben, bleibt es null.
    */
    const eLinks = links.e === null || links.e === undefined ? null : zahl(links.e);
    const eRechts = rechts.e === null || rechts.e === undefined ? null : zahl(rechts.e);
    let e = null;
    if (eLinks !== null || eRechts !== null) e = Math.max(eLinks ?? 0, eRechts ?? 0);
    return { a, e };
}

/**
 * Zwei Merklisten verschmelzen. Vertauschbar und wiederholbar.
 *
 * @param {object} links   Eintraege der einen Seite
 * @param {object} rechts  Eintraege der anderen
 * @returns {object}       die verschmolzenen Eintraege, Grabsteine inklusive
 */
export function verschmelzePlatten(links = {}, rechts = {}) {
    const ergebnis = {};
    for (const id of new Set([...Object.keys(links), ...Object.keys(rechts)])) {
        ergebnis[id] = verschmelzeEintrag(links[id], rechts[id]);
    }
    return ergebnis;
}

/** Nur die Kennungen, die gerade drin sind — das, was die Webseite anzeigt. */
export function nurDrin(eintraege = {}) {
    return Object.keys(eintraege).filter((id) => istDrin(eintraege[id])).sort();
}

/**
 * Grabsteine wegraeumen, die aelter sind als die Frist.
 *
 * WICHTIG: Nur Eintraege, die DRAUSSEN sind. Ein Sender, der vor einem Jahr
 * gemerkt und nie entfernt wurde, ist kein Grabstein, sondern genau das, was
 * jemand behalten wollte.
 */
export function raeumeGrabsteine(eintraege = {}, jetzt = Date.now(), grabsteinTage = 90) {
    const frist = jetzt - grabsteinTage * 24 * 60 * 60 * 1000;
    const ergebnis = {};
    for (const [id, eintrag] of Object.entries(eintraege)) {
        if (!istDrin(eintrag) && zahl(eintrag.e) < frist) continue;
        ergebnis[id] = eintrag;
    }
    return ergebnis;
}

/**
 * Auf die Groesse bringen, die in eine Tabellenzeile passt.
 *
 * Weggeworfen wird in dieser Reihenfolge, und die Reihenfolge ist die ganze
 * Sorgfalt an dieser Funktion:
 *   1. die AELTESTEN Grabsteine — sie kosten Platz und tragen nur noch die
 *      Nachricht „das hier wollte jemand mal nicht mehr"
 *   2. erst wenn das nicht reicht: die am laengsten unberuehrten Eintraege,
 *      die noch DRIN sind
 *
 * Schritt 2 verliert echte Merkungen. Er faellt nur an, wenn jemand mehr als
 * sechshundert Sender gleichzeitig gemerkt hat — bei 129 Sendern im Bestand
 * heisst das, dass etwas anderes kaputt ist. Er steht hier, damit der Dienst
 * auch dann noch antwortet statt zu klemmen.
 */
export function beschneide(eintraege = {}, hoechstens = HOECHSTENS_EINTRAEGE, hoechstensZeichen = HOECHSTENS_ZEICHEN) {
    let ergebnis = { ...eintraege };
    const passtNicht = () => Object.keys(ergebnis).length > hoechstens
        || JSON.stringify(ergebnis).length > hoechstensZeichen;
    if (!passtNicht()) return ergebnis;

    const grabsteine = Object.keys(ergebnis)
        .filter((id) => !istDrin(ergebnis[id]))
        .sort((a, b) => zahl(ergebnis[a].e) - zahl(ergebnis[b].e));
    for (const id of grabsteine) {
        if (!passtNicht()) break;
        delete ergebnis[id];
    }
    if (!passtNicht()) return ergebnis;

    const drin = Object.keys(ergebnis).sort((a, b) => zahl(ergebnis[a].a) - zahl(ergebnis[b].a));
    for (const id of drin) {
        if (!passtNicht()) break;
        delete ergebnis[id];
    }
    return ergebnis;
}

// ── Der Hoerverlauf ─────────────────────────────────────────────────

/*
  Zaehler je Sender, plus wann zuletzt.

      { "<senderId>": { "n": <wie oft>, "z": <ms zuletzt> } }

  Verschmolzen wird mit MAXIMUM, nicht mit Summe — und das ist eine
  Entscheidung mit einem Nachteil, den man kennen muss.

  Summe waere die intuitive Wahl und ist falsch: Ein Abgleich ist nicht
  garantiert einmalig. Bricht die Verbindung nach dem Schreiben, aber vor
  der Antwort ab, wiederholt die Webseite ihn — und mit Summe zaehlte jede
  Wiederholung die Zahlen erneut hoch. Nach einem schlechten Zug in der Bahn
  haette jemand dreitausend Wiedergaben. Maximum ist wiederholbar: dasselbe
  zweimal zu verschmelzen aendert nichts.

  DER PREIS: Hoert jemand denselben Sender am selben Tag auf zwei Geraeten je
  fuenfmal, steht am Ende 5 und nicht 10. Sauber loesen liesse sich das nur
  mit einem Zaehler je Geraet (G-Counter), also einer Geraetekennung, die
  jedes Geraet mitschickt und die dauerhaft gespeichert wird. Das ist ein
  zusaetzliches, langlebiges Merkmal je Geraet — fuer eine Anzeige „am
  meisten gehoert" ist das die falsche Abwaegung.
*/
export const HOECHSTENS_VERLAUF = 600;   // dieselbe Rechnung wie oben

export function saeubereVerlauf(roh) {
    const sauber = {};
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return sauber;
    let anzahl = 0;
    for (const [id, eintrag] of Object.entries(roh)) {
        if (anzahl >= HOECHSTENS_VERLAUF) break;
        if (!SENDER_MUSTER.test(id)) continue;
        if (!eintrag || typeof eintrag !== 'object') continue;
        const n = Math.min(zahl(eintrag.n), 1_000_000);
        const z = zahl(eintrag.z);
        if (n === 0 && z === 0) continue;
        sauber[id] = { n, z };
        anzahl++;
    }
    return sauber;
}

export function verschmelzeVerlauf(links = {}, rechts = {}) {
    const ergebnis = {};
    for (const id of new Set([...Object.keys(links), ...Object.keys(rechts)])) {
        const l = links[id] ?? { n: 0, z: 0 };
        const r = rechts[id] ?? { n: 0, z: 0 };
        ergebnis[id] = { n: Math.max(zahl(l.n), zahl(r.n)), z: Math.max(zahl(l.z), zahl(r.z)) };
    }
    return ergebnis;
}
