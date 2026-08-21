/*
  IYAMBAE FM — Passkeys (WebAuthn): anlegen, anmelden, verwalten.

  Die Kryptografie kommt aus @simplewebauthn/server. Das selbst zu bauen waere
  fahrlaessig: Es geht um CBOR-Zerlegung, COSE-Schluessel, Attestationsformate
  und ein Dutzend Flaggen in einem Bytefeld — jede einzelne davon eine Stelle,
  an der ein Fehler nicht auffaellt, weil die Anmeldung ja funktioniert.

  Was diese Datei selbst entscheidet, ist alles, was DANACH kommt: wem ein
  Schluessel gehoert, was mit einem rueckwaerts laufenden Zaehler geschieht,
  und ob ein Schluessel geloescht werden darf.

  Die Bibliothek wird TRAEGE geladen — erst beim ersten Gebrauch, per
  `await import`. Zwei Gruende: Der Container startet dadurch schneller (und
  der Kaltstart ist bei dieser App gemessen der teuerste Moment), und die Tests
  laufen ohne installierte Abhaengigkeit, weil sie eine Attrappe einsetzen.
*/

import {
  FremdFehler,
  Zustandsspeicher,
  ausB64u,
  b64u,
  istAnmeldeweg,
  jsonAntwort,
  leereAntwort,
  lesJson,
  plaetzchenKopf,
  pruefeUrsprung,
  zaehleAnmeldewege,
} from './fremd.mjs';

// Ein angefangener WebAuthn-Vorgang lebt kuerzer als ein OAuth-state: Der
// Browser zeigt sofort einen Dialog, da vergehen keine zehn Minuten.
export const VORGANG_LEBENSDAUER_MS = 5 * 60 * 1000;

export function erzeugePasskey({
  speicher,
  sitzung,
  protokoll,
  einst,
  webauthn = null,
  vorgaenge = new Zustandsspeicher({ lebensdauerMs: VORGANG_LEBENSDAUER_MS }),
  zaehlerStreng = false,
}) {
  let geladen = null;
  async function bibliothek() {
    if (webauthn) return webauthn;
    geladen ??= import('@simplewebauthn/server');
    return geladen;
  }

  /*
    `required` waere strenger: Dann muss der Schluessel den Menschen selbst
    pruefen (Fingerabdruck, Gesicht, PIN), und die Anmeldung ist zweifach.
    `preferred` ist die Vorgabe, weil ein Sicherheitsschluessel ohne PIN sonst
    nicht mehr anmeldet — und weil ein Passkey ohne Nutzerpruefung immer noch
    genau so viel wert ist wie das Sitzungsplaetzchen, das er ersetzt.

    Wer es anders will, setzt PASSKEY_NUTZERPRUEFUNG=required. Ob es geschah,
    wird in jedem Fall gespeichert — dann kann man spaeter unterscheiden.
  */
  const nutzerpruefung = einst.nutzerpruefung === 'required' ? 'required' : 'preferred';
  const verlangeNutzerpruefung = nutzerpruefung === 'required';

  async function lesePasskeys(kontoId) {
    const alle = (await speicher.leseKennungen(kontoId)) ?? [];
    return alle.filter((k) => k.art === 'passkey');
  }

  // ── Anlegen ───────────────────────────────────────────────────────

  async function anlegenStart(anfrage, antwort) {
    pruefeUrsprung(anfrage, einst.urspruenge);
    const kontoId = await sitzung.pruefe(anfrage);
    if (!kontoId) throw new FremdFehler('nicht_angemeldet', 401);

    const { generateRegistrationOptions } = await bibliothek();
    const vorhandene = await lesePasskeys(kontoId);
    const kennungen = (await speicher.leseKennungen(kontoId)) ?? [];
    const anzeige = waehleAnzeigenamen(kennungen, kontoId);

    const optionen = await generateRegistrationOptions({
      rpName: einst.rpName,
      rpID: einst.rpId,
      /*
        Die kontoId als Nutzerkennung, damit der Schluessel beim spaeteren
        Anmelden ohne Benutzernamen sagen kann, WEM er gehoert. WebAuthn
        erlaubt hoechstens 64 Byte — eine kontoId, die laenger waere, wuerde
        vom Browser stillschweigend abgelehnt, deshalb hier lieber laut.
      */
      userID: kontoIdAlsBytes(kontoId),
      userName: anzeige.name,
      userDisplayName: anzeige.anzeige,
      attestationType: 'none',
      /*
        Damit derselbe Schluessel nicht zweimal angelegt wird. Ohne diese Liste
        legt ein Nutzer, der den Knopf zweimal drueckt, zwei Eintraege fuer
        dasselbe Geraet an und wundert sich in der Verwaltung.
      */
      excludeCredentials: vorhandene.map((k) => ({
        id: k.wert,
        transports: Array.isArray(k.daten?.transporte) ? k.daten.transporte : undefined,
      })),
      authenticatorSelection: {
        // `required`, weil das Anmelden ohne Benutzernamen genau das braucht:
        // einen Schluessel, der seine eigene Kennung mitbringt.
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: nutzerpruefung,
      },
      // ES256 und RS256. Ed25519 (-8) laesst die Bibliothek von sich aus zu;
      // hier bewusst weggelassen, weil Apples Schluesselbund es nicht anbietet
      // und ein Verfahren weniger ein Pruefpfad weniger ist.
      supportedAlgorithmIDs: [-7, -257],
    });

    /*
      Die Herausforderung gehoert dem SERVER. Sie geht als Vorgangsnummer
      zurueck, nicht als frei mitgeschickter Wert — sonst koennte der Browser
      beim Abschluss behaupten, die Herausforderung sei eine andere gewesen,
      und die ganze Pruefung waere ein Selbstgespraech.
    */
    const vorgang = vorgaenge.lege({ art: 'anlegen', kontoId, herausforderung: optionen.challenge });

    protokoll?.schreib?.('passkey_anlegen_start', { kontoId, ergebnis: 'ok' });
    jsonAntwort(antwort, 200, { optionen, vorgang });
  }

  async function anlegenFertig(anfrage, antwort) {
    pruefeUrsprung(anfrage, einst.urspruenge);
    const kontoId = await sitzung.pruefe(anfrage);
    if (!kontoId) throw new FremdFehler('nicht_angemeldet', 401);

    const rumpf = await lesJson(anfrage);
    const eintrag = vorgaenge.hole(rumpf.vorgang);
    if (!eintrag || eintrag.art !== 'anlegen') throw new FremdFehler('vorgang_unbekannt', 400);
    /*
      Der Vorgang muss demselben Konto gehoeren wie die jetzige Sitzung. Ohne
      diese Zeile koennte jemand einen fremden Vorgang abschliessen und den
      Schluessel in SEIN Konto legen — oder umgekehrt seinen eigenen Schluessel
      in ein fremdes Konto, was noch schlechter waere.
    */
    if (eintrag.kontoId !== kontoId) throw new FremdFehler('vorgang_fremd', 403);

    const { verifyRegistrationResponse } = await bibliothek();
    let ergebnis;
    try {
      ergebnis = await verifyRegistrationResponse({
        response: rumpf.antwort,
        expectedChallenge: eintrag.herausforderung,
        // BEIDE Urspruenge. iyambae.fm und www.iyambae.fm sind zwei Adressen,
        // aber ein Passkey — siehe RP-ID unten.
        expectedOrigin: einst.urspruenge,
        expectedRPID: einst.rpId,
        requireUserVerification: verlangeNutzerpruefung,
      });
    } catch (f) {
      protokoll?.schreib?.('passkey_anlegen', { kontoId, ergebnis: 'abgelehnt' });
      throw new FremdFehler('passkey_ungueltig', 400, { ursache: f?.message });
    }
    if (!ergebnis.verified || !ergebnis.registrationInfo) {
      protokoll?.schreib?.('passkey_anlegen', { kontoId, ergebnis: 'abgelehnt' });
      throw new FremdFehler('passkey_ungueltig', 400);
    }

    const schluessel = normalisiereAnlegen(ergebnis.registrationInfo);

    /*
      Gehoert dieser Schluessel schon jemandem? excludeCredentials verhindert
      den Normalfall im Browser, aber ein Browser ist kein Beweis. Ohne diese
      Pruefung koennte jemand einen fremden Schluessel in sein Konto eintragen
      lassen — und die Anmeldung ohne Benutzernamen fuehrte danach nicht mehr
      eindeutig zu einem Konto.
    */
    const schonVergeben = await speicher.findeKontoUeberKennung('passkey', schluessel.id);
    if (schonVergeben && schonVergeben !== kontoId) {
      protokoll?.schreib?.('passkey_anlegen', { kontoId, ergebnis: 'bereits_vergeben' });
      throw new FremdFehler('schluessel_bereits_vergeben', 409);
    }

    await speicher.verknuepfeKennung(kontoId, 'passkey', schluessel.id, {
      oeffentlicherSchluessel: schluessel.oeffentlicherSchluessel,
      zaehler: schluessel.zaehler,
      transporte: schluessel.transporte,
      /*
        BE und BS, die beiden Flaggen, die spaeter niemand mehr rekonstruieren
        kann. BE (Backup Eligible) sagt: Dieser Schluessel DARF ueber Geraete
        hinweg gesichert werden. BS (Backup State) sagt: Er IST es gerade.

        Warum das zaehlt: Ein Passkey mit BE=false lebt auf genau einem Geraet.
        Geht das Geraet verloren, ist der Anmeldeweg weg. Wer nur solche
        Schluessel hat, sollte gewarnt werden, bevor es passiert — und diese
        Warnung laesst sich ohne die Flagge nicht schreiben.
      */
      be: schluessel.be,
      bs: schluessel.bs,
      geraeteart: schluessel.geraeteart,
      aaguid: schluessel.aaguid,
      nutzergeprueft: schluessel.nutzergeprueft,
      name: saubererName(rumpf.name),
      angelegtAm: new Date().toISOString(),
    });

    protokoll?.schreib?.('passkey_anlegen', { kontoId, ergebnis: schluessel.be ? 'gesichert' : 'einzelgeraet' });
    jsonAntwort(antwort, 201, {
      schluesselId: schluessel.id,
      gesichert: schluessel.bs,
      geraeteuebergreifend: schluessel.be,
    });
  }

  // ── Anmelden ──────────────────────────────────────────────────────

  async function anmeldenStart(anfrage, antwort) {
    pruefeUrsprung(anfrage, einst.urspruenge);
    const { generateAuthenticationOptions } = await bibliothek();

    const optionen = await generateAuthenticationOptions({
      rpID: einst.rpId,
      /*
        LEER, und das ist der ganze Sinn. Eine gefuellte Liste haette zwei
        Nachteile, und der zweite ist der schwerere:

        1. Wir muessten vorher wissen, WER sich anmeldet — also nach einem
           Benutzernamen fragen. Genau das soll wegfallen.
        2. Die Liste waere eine Auskunft: Wer eine Adresse eingibt und eine
           Liste zurueckbekommt, weiss, dass diese Adresse ein Konto hat. Das
           ist eine Aufzaehlungsluecke, die man nicht mehr zumacht.

        Leer heisst: Das Geraet zeigt selbst, welche Schluessel es fuer
        iyambae.fm hat, und der Mensch waehlt.
      */
      allowCredentials: [],
      userVerification: nutzerpruefung,
    });

    const vorgang = vorgaenge.lege({ art: 'anmelden', herausforderung: optionen.challenge });
    jsonAntwort(antwort, 200, { optionen, vorgang });
  }

  async function anmeldenFertig(anfrage, antwort) {
    pruefeUrsprung(anfrage, einst.urspruenge);
    const rumpf = await lesJson(anfrage);
    const eintrag = vorgaenge.hole(rumpf.vorgang);
    if (!eintrag || eintrag.art !== 'anmelden') throw new FremdFehler('vorgang_unbekannt', 400);

    const antwortDaten = rumpf.antwort;
    const schluesselId = typeof antwortDaten?.id === 'string' ? antwortDaten.id : null;
    if (!schluesselId) throw new FremdFehler('schluessel_fehlt', 400);

    const kontoId = await speicher.findeKontoUeberKennung('passkey', schluesselId);
    if (!kontoId) {
      /*
        Unbekannter Schluessel. 401 mit demselben Text wie eine fehlgeschlagene
        Pruefung — der Unterschied zwischen "kenne ich nicht" und "stimmt
        nicht" waere eine Auskunft darueber, welche Schluessel es gibt.
      */
      protokoll?.schreib?.('passkey_anmelden', { ergebnis: 'unbekannt' });
      jsonAntwort(antwort, 401, { fehler: 'anmeldung_fehlgeschlagen' });
      return;
    }

    const kennungen = (await speicher.leseKennungen(kontoId)) ?? [];
    const gespeichert = kennungen.find((k) => k.art === 'passkey' && k.wert === schluesselId);
    if (!gespeichert) {
      // Verweistabelle und Kontopartition sind auseinandergelaufen. Nicht
      // anmelden, aber laut sein: Das ist ein Datenfehler, kein Angriff.
      protokoll?.schreib?.('passkey_anmelden', { kontoId, ergebnis: 'verweis_ohne_zeile' });
      jsonAntwort(antwort, 401, { fehler: 'anmeldung_fehlgeschlagen' });
      return;
    }

    /*
      Der userHandle ist das, was WIR beim Anlegen als Nutzerkennung
      mitgegeben haben. Kommt er zurueck, muss er zur kontoId passen. Weicht er
      ab, stimmt etwas an der Zuordnung nicht — dann lieber gar nicht anmelden
      als in ein Konto, das vielleicht nicht das richtige ist.
    */
    const handIn = antwortDaten?.response?.userHandle;
    if (typeof handIn === 'string' && handIn.length > 0) {
      const gemeint = ausB64u(handIn).toString('utf8');
      if (gemeint !== kontoId) {
        protokoll?.schreib?.('passkey_anmelden', { kontoId, ergebnis: 'nutzerkennung_passt_nicht' });
        jsonAntwort(antwort, 401, { fehler: 'anmeldung_fehlgeschlagen' });
        return;
      }
    }

    const alterZaehler = Number(gespeichert.daten?.zaehler ?? 0);
    const { verifyAuthenticationResponse } = await bibliothek();

    let ergebnis;
    try {
      ergebnis = await verifyAuthenticationResponse({
        response: antwortDaten,
        expectedChallenge: eintrag.herausforderung,
        expectedOrigin: einst.urspruenge,
        expectedRPID: einst.rpId,
        credential: {
          id: schluesselId,
          publicKey: new Uint8Array(ausB64u(gespeichert.daten?.oeffentlicherSchluessel ?? '')),
          /*
            HIER BEWUSST 0 UND NICHT DER GESPEICHERTE ZAEHLER.

            @simplewebauthn/server wirft ab Fassung 13 einen Fehler, sobald der
            gemeldete Zaehler nicht groesser ist als der gespeicherte. Das ist
            eine vertretbare Voreinstellung — aber sie nimmt uns die
            Entscheidung ab, und die wollen wir behalten: Ein rueckwaerts
            laufender Zaehler ist ein HINWEIS auf einen geklonten Schluessel,
            kein Beweis. Sehr viele Plattform-Passkeys zaehlen ueberhaupt nicht
            (beide Werte bleiben 0), und bei manchen laeuft der Zaehler nach
            einer Wiederherstellung aus dem Backup zurueck, ohne dass etwas
            geschehen waere.

            Also: Der Bibliothek den Vergleich abnehmen, ihn selbst fuehren und
            das Ergebnis protokollieren. Wer streng sein will, setzt
            `zaehlerStreng` — dann wird abgewiesen. Der Preis dafuer steht in
            FREMDANMELDUNG.md.
          */
          counter: 0,
          transports: Array.isArray(gespeichert.daten?.transporte) ? gespeichert.daten.transporte : undefined,
        },
        requireUserVerification: verlangeNutzerpruefung,
      });
    } catch (f) {
      protokoll?.schreib?.('passkey_anmelden', { kontoId, ergebnis: 'abgelehnt' });
      jsonAntwort(antwort, 401, { fehler: 'anmeldung_fehlgeschlagen' });
      return;
    }

    if (!ergebnis.verified) {
      protokoll?.schreib?.('passkey_anmelden', { kontoId, ergebnis: 'abgelehnt' });
      jsonAntwort(antwort, 401, { fehler: 'anmeldung_fehlgeschlagen' });
      return;
    }

    const neuerZaehler = Number(ergebnis.authenticationInfo?.newCounter ?? 0);
    const zaehltUeberhaupt = neuerZaehler > 0 || alterZaehler > 0;
    const rueckwaerts = zaehltUeberhaupt && neuerZaehler <= alterZaehler;

    if (rueckwaerts) {
      protokoll?.schreib?.('passkey_zaehler_rueckwaerts', { kontoId, ergebnis: zaehlerStreng ? 'abgewiesen' : 'gemeldet' });
      if (zaehlerStreng) {
        jsonAntwort(antwort, 401, { fehler: 'anmeldung_fehlgeschlagen' });
        return;
      }
    }

    await speicher.verknuepfeKennung(kontoId, 'passkey', schluesselId, {
      ...gespeichert.daten,
      // Nie zurueckdrehen: Sonst machte ein einziger geklonter Schluessel mit
      // niedrigem Zaehler den Hinweis fuer alle folgenden Anmeldungen stumm.
      zaehler: Math.max(alterZaehler, neuerZaehler),
      // BE und BS koennen sich aendern — ein Schluessel, der heute nur auf
      // einem Geraet liegt, kann morgen gesichert sein.
      be: ergebnis.authenticationInfo?.credentialDeviceType === 'multiDevice',
      bs: Boolean(ergebnis.authenticationInfo?.credentialBackedUp),
      geraeteart: ergebnis.authenticationInfo?.credentialDeviceType ?? gespeichert.daten?.geraeteart ?? null,
      nutzergeprueft: Boolean(ergebnis.authenticationInfo?.userVerified),
      zuletztAm: new Date().toISOString(),
    });

    const neu = await sitzung.erzeuge(kontoId);
    protokoll?.schreib?.('passkey_anmelden', { kontoId, ergebnis: 'ok' });
    jsonAntwort(antwort, 200, { kontoId }, { 'set-cookie': plaetzchenKopf(neu.plaetzchen, neu.ablauf) });
  }

  // ── Verwalten ─────────────────────────────────────────────────────

  /*
    KEINE Ursprungspruefung auf diesem Weg, und das ist Absicht.

    Die Pruefung schuetzt vor ortsfremden Anfragen, die etwas VERAENDERN. Dieser
    Weg liest nur, und eine fremde Seite kann die Antwort ohnehin nicht lesen —
    dafuer sorgt die Gleiche-Herkunft-Regel des Browsers, nicht dieser Dienst.

    Dazu kommt eine Falle, die man erst spaeter tritt: Bei einem
    gleichherkuenftigen GET schickt der Browser gar keinen Origin-Kopf. Die
    Pruefung fiele auf den Verweiser zurueck, und der haengt an der
    Referrer-Policy in deploy/nginx.conf. Die steht heute auf
    `strict-origin-when-cross-origin`, damit ginge es. Wer sie eines Tages aus
    guten Gruenden auf `no-referrer` zieht — bei dieser Seite ein naheliegender
    Schritt —, haette hier einen 403, den niemand mit der Kopfzeile in
    Verbindung braechte.
  */
  async function liste(anfrage, antwort) {
    const kontoId = await sitzung.pruefe(anfrage);
    if (!kontoId) throw new FremdFehler('nicht_angemeldet', 401);
    const schluessel = await lesePasskeys(kontoId);
    jsonAntwort(antwort, 200, {
      // Kein oeffentlicher Schluessel in der Antwort. Er ist zwar oeffentlich,
      // aber er gehoert nicht in eine Oberflaeche, die ihn nicht braucht.
      schluessel: schluessel.map((k) => ({
        id: k.wert,
        name: k.daten?.name ?? null,
        geraeteuebergreifend: Boolean(k.daten?.be),
        gesichert: Boolean(k.daten?.bs),
        angelegtAm: k.daten?.angelegtAm ?? null,
        zuletztAm: k.daten?.zuletztAm ?? null,
      })),
      anmeldewege: zaehleAnmeldewege(await speicher.leseKennungen(kontoId)),
    });
  }

  async function loesche(anfrage, antwort, { treffer }) {
    pruefeUrsprung(anfrage, einst.urspruenge);
    const kontoId = await sitzung.pruefe(anfrage);
    if (!kontoId) throw new FremdFehler('nicht_angemeldet', 401);

    let id;
    try {
      id = decodeURIComponent(treffer[1]);
    } catch {
      throw new FremdFehler('schluessel_unbekannt', 404);
    }

    const kennungen = (await speicher.leseKennungen(kontoId)) ?? [];
    const betroffen = kennungen.find((k) => k.art === 'passkey' && k.wert === id);
    /*
      404 und nicht 403, wenn der Schluessel einem anderen Konto gehoert:
      Andernfalls koennte jemand mit einer Reihe von Loeschversuchen
      herausfinden, welche Schluessel es ueberhaupt gibt. Ob es ihn nicht gibt
      oder ob er einem anderen gehoert, ist von aussen dieselbe Antwort — und
      geloescht wird in beiden Faellen nichts.
    */
    if (!betroffen) throw new FremdFehler('schluessel_unbekannt', 404);

    /*
      DER LETZTE ANMELDEWEG DARF NICHT WEG.

      Gezaehlt wird der Zustand DANACH, nicht davor. Wer seinen einzigen
      Passkey loescht und weder eine bestaetigte Adresse noch eine
      Fremdanmeldung hat, steht danach vor einem Konto, das ihm gehoert und in
      das er nicht mehr hineinkommt. Es gibt keinen Weg zurueck: Die
      Wiederherstellung liefe ueber eine Adresse, und genau die fehlt ja.

      409 heisst hier: Der Wunsch ist verstanden, aber der Zustand des Kontos
      laesst ihn nicht zu. Die Oberflaeche soll daraus einen Satz machen wie
      "Lege zuerst einen zweiten Anmeldeweg an" — nicht "Fehler".
    */
    if (zaehleAnmeldewege(kennungen) <= 1 && istAnmeldeweg(betroffen)) {
      protokoll?.schreib?.('passkey_loeschen', { kontoId, ergebnis: 'letzter_weg' });
      throw new FremdFehler('letzter_anmeldeweg', 409);
    }

    await speicher.loescheKennung(kontoId, 'passkey', id);
    protokoll?.schreib?.('passkey_loeschen', { kontoId, ergebnis: 'ok' });
    leereAntwort(antwort, 204);
  }

  return {
    routen: [
      { methode: 'POST', pfad: '/api/passkey/anlegen/start', behandler: anlegenStart },
      { methode: 'POST', pfad: '/api/passkey/anlegen/fertig', behandler: anlegenFertig },
      { methode: 'POST', pfad: '/api/passkey/anmelden/start', behandler: anmeldenStart },
      { methode: 'POST', pfad: '/api/passkey/anmelden/fertig', behandler: anmeldenFertig },
      { methode: 'GET', pfad: '/api/passkey', behandler: liste },
      /*
        Die Kennung ist base64url — Buchstaben, Ziffern, Bindestrich,
        Unterstrich. Das Muster laesst genau das zu und sonst nichts, damit
        kein Pfad in den Pfad hineingeschmuggelt wird.
      */
      { methode: 'DELETE', pfad: /^\/api\/passkey\/([A-Za-z0-9_%-]{1,512})$/, behandler: loesche },
    ],
    _intern: { vorgaenge, lesePasskeys },
  };
}

// ── Hilfen ────────────────────────────────────────────────────────

export const NUTZERKENNUNG_GRENZE = 64;

export function kontoIdAlsBytes(kontoId) {
  const bytes = new TextEncoder().encode(String(kontoId));
  // WebAuthn erlaubt hoechstens 64 Byte. Ein laengerer Wert wird vom Browser
  // abgelehnt, und die Fehlermeldung nennt den Grund nicht.
  if (bytes.length === 0 || bytes.length > NUTZERKENNUNG_GRENZE) {
    throw new FremdFehler('kontoid_zu_lang', 500);
  }
  return bytes;
}

/*
  Der Name eines Passkeys kommt vom Nutzer ("iPhone", "Arbeitsrechner") und
  steht spaeter in einer Liste. Steuerzeichen raus — sonst schreibt jemand
  einen Zeilenumbruch hinein, und die Liste zeigt eine Zeile, die es nicht gibt.
*/
export function saubererName(wert) {
  if (typeof wert !== 'string') return null;
  const t = wert.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return t.length > 0 ? t.slice(0, 60) : null;
}

/*
  Anzeigename fuer den Passkey-Dialog. Der Browser zeigt ihn im Schluesselbund,
  manchmal jahrelang — er soll also erkennbar sein, aber er wird auch beim
  Anbieter gespeichert. Deshalb die Adresse, wenn es eine gibt, sonst etwas
  Neutrales. Nie die kontoId in voller Laenge, die sagt niemandem etwas.
*/
export function waehleAnzeigenamen(kennungen, kontoId) {
  const mail = (kennungen ?? []).find((k) => k.art === 'mail' && typeof k.wert === 'string');
  if (mail) return { name: mail.wert, anzeige: mail.daten?.name ?? mail.wert };
  const mitName = (kennungen ?? []).find((k) => typeof k.daten?.name === 'string' && k.daten.name.length > 0);
  const kurz = `IYAMBAE ${String(kontoId).slice(0, 8)}`;
  return { name: kurz, anzeige: mitName?.daten?.name ?? kurz };
}

/*
  Fassungen von @simplewebauthn/server unterscheiden sich in der Form dieses
  Ergebnisses: bis 12 lagen `credentialID` und `credentialPublicKey` flach im
  Objekt, ab 13 stecken sie in `credential`. Beides wird hier auf eine Form
  gebracht, damit ein Fassungswechsel nicht durch die halbe Datei geht.
*/
export function normalisiereAnlegen(info) {
  const c = info.credential ?? {};
  const id = c.id ?? info.credentialID;
  const roh = c.publicKey ?? info.credentialPublicKey;
  if (typeof id !== 'string' || !roh) throw new FremdFehler('passkey_ungueltig', 400);

  return {
    id,
    oeffentlicherSchluessel: b64u(roh),
    zaehler: Number(c.counter ?? info.counter ?? 0),
    transporte: Array.isArray(c.transports) ? c.transports : [],
    be: info.credentialDeviceType === 'multiDevice',
    bs: Boolean(info.credentialBackedUp),
    geraeteart: info.credentialDeviceType ?? null,
    aaguid: typeof info.aaguid === 'string' ? info.aaguid : null,
    nutzergeprueft: Boolean(info.userVerified),
  };
}
