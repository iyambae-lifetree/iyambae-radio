/*
  IYAMBAE FM — gemeinsamer Teil der Fremdanmeldung.

  Hier steht alles, was Google, Apple und die Passkeys TEILEN: Zufall, PKCE,
  der einmal gueltige state, die Pruefung fremder Tokens gegen die JWKS des
  Anbieters, ein paar HTTP-Handgriffe — und die Kontoverknuepfung, die
  gefaehrlichste Stelle des ganzen Dienstes.

  Diese Datei importiert ihre Geschwister NICHT statisch. `erzeugeFremdanmeldung`
  holt sie mit `await import(...)`. Grund: google.mjs, apple.mjs und passkey.mjs
  importieren umgekehrt VON HIER. Ein statischer Ring waere zwar nach der
  ES-Modul-Regel erlaubt, aber er bricht in dem Augenblick, in dem eines der
  Geschwister etwas aus dieser Datei schon zur Ladezeit benutzt statt erst im
  Funktionsrumpf. Der dynamische Import macht diesen Fehler unmoeglich.

  Zweiter Grund, der genauso zaehlt: So laesst sich diese Datei in Tests laden,
  ohne dass @simplewebauthn/server installiert sein muss.
*/

import crypto from 'node:crypto';

// ── Sprachen ────────────────────────────────────────────────────────

/*
  Dieselbe Liste wie in deploy/nginx.conf. Sie steht hier ein zweites Mal, und
  das ist Absicht: Der Dienst darf sich nicht darauf verlassen, dass ein
  vorgelagerter nginx schon gefiltert hat. Die Rueckkehradresse wird aus diesem
  Wert gebaut — kaeme er ungeprueft aus dem Netz, waere das eine offene
  Weiterleitung, und die traegt Anmeldedaten davon.
*/
export const SPRACHEN = ['de', 'en', 'fr', 'es', 'it', 'ja', 'ar'];

export function saubereSprache(wert, ersatz = 'de') {
  return SPRACHEN.includes(wert) ? wert : ersatz;
}

// ── Zufall und base64url ────────────────────────────────────────────

export function zufallBytes(anzahl = 32) {
  return crypto.randomBytes(anzahl);
}

export function b64u(daten) {
  return Buffer.from(daten).toString('base64url');
}

export function ausB64u(text) {
  return Buffer.from(String(text), 'base64url');
}

export function zufallText(anzahl = 32) {
  return b64u(zufallBytes(anzahl));
}

/*
  Vergleich in gleichbleibender Zeit. Wo ein Geheimnis mit einem Wert aus dem
  Netz verglichen wird, verraet ein `===` ueber die Laufzeit, wie viele Zeichen
  schon stimmen. Bei einem 32-Byte-Zufallswert ist das theoretisch — aber es
  kostet nichts, es richtig zu machen, und die naechste Stelle, an der jemand
  diese Funktion benutzt, ist vielleicht nicht mehr theoretisch.
*/
export function gleichSicher(a, b) {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

// ── PKCE ────────────────────────────────────────────────────────────

/*
  PKCE mit S256 bei BEIDEN Anbietern, auch bei Apple, das es nicht verlangt.

  Warum auch dort: Der Autorisierungscode faehrt bei Apple per form_post durch
  den Browser des Nutzers. Wer ihn dort abfaengt — eine Erweiterung, ein
  Verlaufseintrag, ein Fehler in einer Zwischenstation — kann ihn ohne PKCE
  gegen ein Token eintauschen, sofern er auch an das Client-Geheimnis kommt.
  Mit PKCE braucht er zusaetzlich den verifier, und der hat den Server nie
  verlassen.

  `plain` gibt es hier nicht. Ein verifier, der ungehasht durch die Umleitung
  faehrt, ist kein Schutz, sondern eine Bequemlichkeit mit gutem Namen.
*/
export function erzeugePkce() {
  // 32 Zufallsbytes ergeben 43 Zeichen base64url — die Untergrenze aus RFC 7636.
  const verifizierer = zufallText(32);
  const abgleich = b64u(crypto.createHash('sha256').update(verifizierer).digest());
  return { verifizierer, abgleich, verfahren: 'S256' };
}

// ── Der state-Speicher ──────────────────────────────────────────────

export const STATE_LEBENSDAUER_MS = 10 * 60 * 1000;

/*
  state, nonce und der PKCE-verifier liegen SERVERSEITIG. Der Wert, der durch
  das Netz faehrt, ist nur ein Zeiger: 32 Zufallsbytes, sonst nichts.

  Damit traegt der state keine Information, die jemand lesen oder faelschen
  koennte, und er ist GENAU EINMAL gueltig — `hole` loescht beim Lesen. Ein
  zweiter Rueckweg mit demselben state findet nichts mehr. Das ist zugleich der
  Schutz gegen das Wiedereinspielen eines mitgeschnittenen Rueckwegs.

  Im Arbeitsspeicher und nicht in der Tabelle: Ein state lebt zehn Minuten. Ein
  Neustart des Containers macht angefangene Anmeldungen ungueltig — der Nutzer
  klickt noch einmal. Das ist der guenstigere Fehler als eine Tabellenzeile je
  Anmeldeversuch, die dann auch wieder weggeraeumt werden muesste.

  ZU WISSEN, BEVOR JEMAND HOCHSKALIERT: Bei mehr als einer Replik muss der
  Rueckweg dieselbe Replik treffen wie der Start, sonst ist der state dort
  unbekannt. main.bicep faehrt heute eine Replik. Wer das aendert, braucht
  entweder klebende Sitzungen (Container Apps: `affinity: sticky`) oder diesen
  Speicher in der Tabelle. Steht so auch in FREMDANMELDUNG.md.
*/
export class Zustandsspeicher {
  constructor({ lebensdauerMs = STATE_LEBENSDAUER_MS, hoechstzahl = 20000, uhr = Date.now } = {}) {
    this.lebensdauerMs = lebensdauerMs;
    this.hoechstzahl = hoechstzahl;
    this.uhr = uhr;
    this.eintraege = new Map();
  }

  lege(daten) {
    this.raeumeAuf();
    /*
      Obergrenze, damit ein Angreifer den Arbeitsspeicher nicht mit
      Anmeldestarts vollaeuft — der Container hat 0,5 GiB, und die teilt er
      sich mit nginx. Map behaelt die Einfuegereihenfolge, der aelteste Eintrag
      steht vorn und faellt zuerst.
    */
    while (this.eintraege.size >= this.hoechstzahl) {
      const aeltester = this.eintraege.keys().next();
      if (aeltester.done) break;
      this.eintraege.delete(aeltester.value);
    }
    const schluessel = b64u(zufallBytes(32));
    this.eintraege.set(schluessel, { ...daten, angelegt: this.uhr() });
    return schluessel;
  }

  // Einmal gueltig: Wer liest, verbraucht.
  hole(schluessel) {
    if (typeof schluessel !== 'string' || schluessel.length === 0) return null;
    const eintrag = this.eintraege.get(schluessel);
    if (!eintrag) return null;
    this.eintraege.delete(schluessel);
    if (this.uhr() - eintrag.angelegt > this.lebensdauerMs) return null;
    return eintrag;
  }

  raeumeAuf() {
    const grenze = this.uhr() - this.lebensdauerMs;
    for (const [schluessel, eintrag] of this.eintraege) {
      // Einfuegereihenfolge: Sobald einer jung genug ist, sind es alle danach auch.
      if (eintrag.angelegt >= grenze) break;
      this.eintraege.delete(schluessel);
    }
  }

  get groesse() {
    return this.eintraege.size;
  }
}

// ── Fehler mit Antwortcode ──────────────────────────────────────────

export class FremdFehler extends Error {
  constructor(code, status = 400, zusatz = {}) {
    super(code);
    this.name = 'FremdFehler';
    this.code = code;
    this.status = status;
    this.zusatz = zusatz;
  }
}

// ── JWKS: Schluessel des Anbieters holen und behalten ───────────────

export class JwksSpeicher {
  /*
    holer: eine Funktion wie fetch. Wird in Tests ersetzt.

    WARUM `mindestAbstandMs`: Bei unbekannter kid soll erneuert werden — sonst
    steht die Anmeldung still, sobald der Anbieter seine Schluessel dreht, und
    Google dreht sie ohne Ankuendigung. Ohne Untergrenze waere das aber ein
    Hebel: Wer id_tokens mit erfundenen kid schickt, laesst uns Google im
    Sekundentakt fragen, bis Google uns bremst. Die Untergrenze macht aus dem
    Hebel eine Bremse.
  */
  constructor({
    holer = fetch,
    mindestAbstandMs = 60_000,
    hoechstalterMs = 6 * 60 * 60 * 1000,
    zeitgrenzeMs = 5000,
    uhr = Date.now,
  } = {}) {
    this.holer = holer;
    this.mindestAbstandMs = mindestAbstandMs;
    this.hoechstalterMs = hoechstalterMs;
    this.zeitgrenzeMs = zeitgrenzeMs;
    this.uhr = uhr;
    this.staende = new Map(); // adresse -> {schluessel: Map, geholtAm, versuchAm, laeuft}
  }

  stand(adresse) {
    let s = this.staende.get(adresse);
    if (!s) {
      s = { schluessel: new Map(), geholtAm: 0, versuchAm: 0, laeuft: null };
      this.staende.set(adresse, s);
    }
    return s;
  }

  async holeSchluessel(adresse, kid) {
    const s = this.stand(adresse);
    const alt = this.uhr() - s.geholtAm > this.hoechstalterMs;

    if (s.schluessel.has(kid) && !alt) return s.schluessel.get(kid);

    if (this.uhr() - s.versuchAm >= this.mindestAbstandMs) {
      // Nur EINE Abfrage gleichzeitig je Anbieter. Zehn parallele Anmeldungen
      // mit unbekannter kid sollen sich ein Ergebnis teilen, nicht zehn
      // Abfragen ausloesen.
      if (!s.laeuft) {
        s.laeuft = this.lade(adresse, s).finally(() => {
          s.laeuft = null;
        });
      }
      try {
        await s.laeuft;
      } catch (fehler) {
        /*
          Die Abfrage ist ausgefallen. Haben wir noch Schluessel im Speicher,
          arbeiten wir damit weiter: Ein alter, aber echter Schluessel ist immer
          noch ein echter Schluessel, und ein Netzausfall bei Google darf nicht
          jede laufende Anmeldung abwuergen. Nur wenn wir gar nichts haben,
          geht es nicht — dann 503 und nicht etwa 401, denn der Fehler liegt
          bei uns, nicht beim Nutzer.
        */
        if (s.schluessel.size === 0) {
          throw new FremdFehler('jwks_nicht_erreichbar', 503, { ursache: fehler?.message });
        }
      }
    }

    if (s.schluessel.has(kid)) return s.schluessel.get(kid);
    throw new FremdFehler('unbekannter_schluessel', 401);
  }

  async lade(adresse, s) {
    s.versuchAm = this.uhr();
    const antwort = await this.holer(adresse, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.zeitgrenzeMs),
    });
    if (!antwort.ok) throw new Error(`jwks ${antwort.status}`);
    const rumpf = await antwort.json();
    if (!rumpf || !Array.isArray(rumpf.keys)) throw new Error('jwks ohne keys');

    const neu = new Map();
    for (const jwk of rumpf.keys) {
      if (!jwk || typeof jwk.kid !== 'string') continue;
      // `use: 'enc'` waere ein Verschluesselungs-, kein Signaturschluessel.
      if (jwk.use && jwk.use !== 'sig') continue;
      if (jwk.kty !== 'RSA' && jwk.kty !== 'EC') continue;
      try {
        const schluessel = crypto.createPublicKey({ key: jwk, format: 'jwk' });
        neu.set(jwk.kid, { schluessel, alg: jwk.alg ?? (jwk.kty === 'RSA' ? 'RS256' : 'ES256') });
      } catch {
        // Ein unbrauchbarer Schluessel im Satz darf die anderen nicht mitreissen.
      }
    }
    if (neu.size === 0) throw new Error('jwks ohne brauchbaren schluessel');
    // Erst ganz am Ende tauschen: Ein halb gefuellter Satz waere schlimmer als
    // der alte.
    s.schluessel = neu;
    s.geholtAm = this.uhr();
  }
}

// ── id_token pruefen, nicht glauben ─────────────────────────────────

export const ZEITSCHLUPF_S = 60;

export function teileJwt(token) {
  if (typeof token !== 'string') throw new FremdFehler('token_fehlt', 400);
  const teile = token.split('.');
  if (teile.length !== 3) throw new FremdFehler('token_unlesbar', 400);
  let kopf;
  let rumpf;
  try {
    kopf = JSON.parse(ausB64u(teile[0]).toString('utf8'));
    rumpf = JSON.parse(ausB64u(teile[1]).toString('utf8'));
  } catch {
    throw new FremdFehler('token_unlesbar', 400);
  }
  if (!kopf || typeof kopf !== 'object' || !rumpf || typeof rumpf !== 'object') {
    throw new FremdFehler('token_unlesbar', 400);
  }
  return { kopf, rumpf, teile };
}

/*
  Ein id_token, das nur zerlegt und nicht geprueft wird, ist ein Zettel mit
  einer Behauptung darauf. Jeder kann einen schreiben.

  Geprueft wird in dieser Reihenfolge, und keine Stufe darf fehlen:

    1. alg gegen eine FESTE Liste — niemals das nehmen, was im Kopf steht.
       `none` waere sonst ein gueltiges Verfahren, und `HS256` liesse sich mit
       dem oeffentlichen Schluessel des Anbieters als HMAC-Geheimnis faelschen.
       Das ist der klassische JWT-Angriff, und er funktioniert bis heute, weil
       Bibliotheken hoeflich sind.
    2. Signatur gegen den Schluessel mit passender kid aus der JWKS.
    3. iss, wortgleich.
    4. aud, wortgleich mit der eigenen Client-Kennung. Ein Token von Google ist
       echt signiert, auch wenn es fuer eine ganz andere App ausgestellt wurde
       — ohne diese Pruefung meldet sich damit jeder an, der irgendwo eine
       Google-App betreibt.
    5. exp und iat, mit einer Minute Schlupf fuer ungenaue Uhren.
    6. nonce, wortgleich mit dem beim Start hinterlegten.
    7. sub vorhanden und nicht leer — ohne ihn gibt es keine Verknuepfung.
*/
export async function pruefeIdToken(token, {
  jwks,
  jwksAdresse,
  iss,
  aud,
  nonce,
  verfahren = ['RS256', 'ES256'],
  uhr = Date.now,
  schlupfS = ZEITSCHLUPF_S,
} = {}) {
  const { kopf, rumpf, teile } = teileJwt(token);

  if (!verfahren.includes(kopf.alg)) throw new FremdFehler('alg_nicht_erlaubt', 401);
  if (typeof kopf.kid !== 'string' || kopf.kid.length === 0) throw new FremdFehler('kid_fehlt', 401);

  const eintrag = await jwks.holeSchluessel(jwksAdresse, kopf.kid);
  // Der Anbieter sagt in der JWKS selbst, wofuer der Schluessel gedacht ist.
  // Weicht das vom Kopf ab, ist etwas verschoben — nicht raten, ablehnen.
  if (eintrag.alg && eintrag.alg !== kopf.alg) throw new FremdFehler('alg_passt_nicht', 401);

  const daten = Buffer.from(`${teile[0]}.${teile[1]}`, 'utf8');
  const unterschrift = ausB64u(teile[2]);
  let echt = false;
  try {
    if (kopf.alg === 'RS256') {
      echt = crypto.verify('sha256', daten, eintrag.schluessel, unterschrift);
    } else {
      // JWS legt bei ES256 die rohe Form R||S ab; node erwartet sonst DER.
      echt = crypto.verify(
        'sha256',
        daten,
        { key: eintrag.schluessel, dsaEncoding: 'ieee-p1363' },
        unterschrift,
      );
    }
  } catch {
    echt = false;
  }
  if (!echt) throw new FremdFehler('unterschrift_falsch', 401);

  const erlaubteIss = Array.isArray(iss) ? iss : [iss];
  if (!erlaubteIss.includes(rumpf.iss)) throw new FremdFehler('iss_falsch', 401);

  const empfaenger = Array.isArray(rumpf.aud) ? rumpf.aud : [rumpf.aud];
  if (!empfaenger.includes(aud)) throw new FremdFehler('aud_falsch', 401);
  /*
    Mehrere Empfaenger sind nach OIDC erlaubt, aber dann muss `azp` sagen, fuer
    WEN das Token ausgestellt wurde. Fehlt azp oder zeigt es woandershin, ist
    das Token nicht unseres — auch wenn unsere Kennung in der Liste steht.
  */
  if (empfaenger.length > 1 && rumpf.azp !== aud) throw new FremdFehler('azp_falsch', 401);

  const jetzt = Math.floor(uhr() / 1000);
  if (typeof rumpf.exp !== 'number' || jetzt > rumpf.exp + schlupfS) {
    throw new FremdFehler('token_abgelaufen', 401);
  }
  if (typeof rumpf.iat === 'number' && rumpf.iat > jetzt + schlupfS) {
    throw new FremdFehler('token_aus_der_zukunft', 401);
  }
  if (typeof rumpf.nbf === 'number' && jetzt + schlupfS < rumpf.nbf) {
    throw new FremdFehler('token_noch_nicht_gueltig', 401);
  }

  // nonce bindet das Token an genau diesen Anmeldestart.
  if (nonce !== undefined && nonce !== null) {
    if (!gleichSicher(rumpf.nonce ?? '', nonce)) throw new FremdFehler('nonce_falsch', 401);
  }

  if (typeof rumpf.sub !== 'string' || rumpf.sub.length === 0) throw new FremdFehler('sub_fehlt', 401);

  return rumpf;
}

// ── Adressen ────────────────────────────────────────────────────────

export function normalisiereAdresse(wert) {
  if (typeof wert !== 'string') return null;
  const t = wert.trim().toLowerCase();
  /*
    Keine Adressvalidierung nach RFC — nur so viel, dass nichts Absurdes als
    Kennung in die Tabelle geraet. Ob eine Adresse existiert, sagt ohnehin erst
    die Zustellung, und eine strenge Regel wirft mehr gueltige Adressen weg,
    als sie ungueltige faengt.
  */
  if (t.length < 3 || t.length > 254) return null;
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(t)) return null;
  return t;
}

/*
  Apple stellt vielen Nutzern eine Weiterleitungsadresse aus. Sie ist eine
  vollwertige Adresse — Post kommt an —, aber sie haengt an der
  Apple-Anmeldung: Wer die Verknuepfung in seinen Apple-Einstellungen loest,
  macht sie tot. Deshalb wird sie als solche vermerkt, damit spaeter niemand
  raetselt, warum eine Mail unzustellbar zurueckkommt.
*/
export function istWeiterleitungsadresse(adresse) {
  return typeof adresse === 'string' && adresse.toLowerCase().endsWith('@privaterelay.appleid.com');
}

/*
  Anbieter melden `email_verified` mal als Wahrheitswert, mal als Zeichenkette
  "true" — Apple tut Letzteres. Alles andere, auch `undefined`, gilt als NICHT
  geprueft. Im Zweifel nicht geprueft: Dieser Zweifel entscheidet weiter unten
  darueber, ob jemand ein fremdes Konto betritt.
*/
export function istGeprueft(wert) {
  return wert === true || wert === 'true';
}

// ── Kontoverknuepfung ───────────────────────────────────────────────

export function istAnmeldeweg(kennung) {
  if (!kennung || typeof kennung.art !== 'string') return false;
  if (kennung.art === 'passkey') return true;
  if (kennung.art === 'google' || kennung.art === 'apple') return true;
  // Eine Mail-Kennung traegt nur dann eine Anmeldung, wenn sie bestaetigt ist
  // — vorher kommt kein Einmalcode an, der jemanden hereinliesse.
  if (kennung.art === 'mail') return Boolean(kennung.daten?.bestaetigtAm);
  return false;
}

export function zaehleAnmeldewege(kennungen) {
  return (kennungen ?? []).filter(istAnmeldeweg).length;
}

/*
  ══════════════════════════════════════════════════════════════════════
   DIE REGEL. Wer sie aufweicht, verschenkt fremde Konten.
  ══════════════════════════════════════════════════════════════════════

  Verknuepft wird ueber die STABILE ANBIETERKENNUNG — Google `sub`, Apple
  `sub` —, NIEMALS ueber die E-Mail-Adresse allein.

  Warum: Es gibt Anbieter, die eine Adresse ins Token schreiben, ohne je
  geprueft zu haben, ob sie dem Anmelder gehoert. Wuerde allein nach der
  Adresse verknuepft, genuegte es, bei einem solchen Anbieter ein Konto mit der
  Adresse eines fremden IYAMBAE-Nutzers anzulegen — und die Anmeldung landete
  in dessen Konto, mitsamt Merkliste und Hoerverlauf. Der Angreifer braeuchte
  weder ein Passwort noch Zugang zum Postfach.

  Eine Adresse darf ein BESTEHENDES Konto nur dann anschliessen, wenn BEIDE
  Seiten geprueft sind:
    (a) der Anbieter meldet sie mit `email_verified` als geprueft, UND
    (b) sie ist im eigenen Bestand ebenfalls als bestaetigt vermerkt.

  Fehlt eine der beiden Bedingungen, entsteht ein NEUES Konto. Der Nutzer kann
  die Wege spaeter aus dem angemeldeten Zustand heraus zusammenfuehren — dann
  hat er beide Seiten in der Hand, und das ist der Beweis, den wir an dieser
  Stelle nicht fuehren koennen.

  Das neue Konto beansprucht die Adresse dann NICHT als Kennung. Sonst
  kollidierte der Eintrag in `verweise`, wo eine Kennung auf genau eine kontoId
  zeigt — und schlimmer: Wer zuerst kaeme, mahlte zuerst und haette dem anderen
  die Adresse weggenommen.
*/
export async function verknuepfeAnbieterkennung({
  speicher,
  protokoll,
  anbieter,
  sub,
  adresse = null,
  adresseGeprueft = false,
  daten = {},
  bestehendesKonto = null,
}) {
  if (typeof sub !== 'string' || sub.length === 0) throw new FremdFehler('sub_fehlt', 401);

  const eigen = await speicher.findeKontoUeberKennung(anbieter, sub);

  /*
    Weg A — aus dem angemeldeten Zustand heraus verknuepfen ("zusammenfuehren").
    Nur hier darf ein bestehendes Konto einen neuen Weg dazubekommen, ohne dass
    Adressen verglichen werden: Der Nutzer sitzt nachweislich in beiden
    Sitzungen — in der eigenen, weil er ein gueltiges Plaetzchen hat, und in der
    des Anbieters, weil er sich dort gerade angemeldet hat.
  */
  if (bestehendesKonto) {
    if (eigen && eigen !== bestehendesKonto) {
      // Diese Anbieterkennung gehoert schon jemand anderem. Nicht wegnehmen.
      protokoll?.schreib?.('fremd_verknuepfung_belegt', {
        anbieter,
        kontoId: bestehendesKonto,
        ergebnis: 'abgelehnt',
      });
      throw new FremdFehler('kennung_gehoert_anderem_konto', 409);
    }
    if (!eigen) {
      await speicher.verknuepfeKennung(
        bestehendesKonto,
        anbieter,
        sub,
        bereiteDaten(normalisiereAdresse(adresse), adresseGeprueft, daten),
      );
    }
    protokoll?.schreib?.('fremd_verknuepft', { anbieter, kontoId: bestehendesKonto, ergebnis: 'ok' });
    return { kontoId: bestehendesKonto, neu: false, angeschlossen: !eigen };
  }

  // Weg B — der Normalfall: Die Anbieterkennung ist schon bekannt.
  if (eigen) {
    /*
      Daten auffrischen, Kennung nicht anfassen. Die Adresse kann sich aendern
      (Apple-Weiterleitung umgestellt, Google-Adresse gewechselt) — die
      Zuordnung zum Konto haengt aber am sub und nicht an ihr, deshalb ist das
      hier eine reine Aktualisierung ohne Sicherheitsfolge.
    */
    await speicher.verknuepfeKennung(
      eigen,
      anbieter,
      sub,
      bereiteDaten(normalisiereAdresse(adresse), adresseGeprueft, daten),
    );
    protokoll?.schreib?.('fremd_anmeldung', { anbieter, kontoId: eigen, ergebnis: 'bekannt' });
    return { kontoId: eigen, neu: false, angeschlossen: false };
  }

  // Weg C — unbekannte Anbieterkennung. Jetzt gilt die Regel von oben.
  const sauber = normalisiereAdresse(adresse);

  /*
    Die Suche nach dem Konto zur Adresse findet NUR statt, wenn der Anbieter
    die Adresse als geprueft meldet. Bedingung (a) steht also vor der Abfrage,
    nicht danach — so kann kein spaeterer Umbau sie versehentlich ueberspringen.
  */
  let kontoUeberAdresse = null;
  if (sauber && adresseGeprueft) {
    kontoUeberAdresse = await speicher.findeKontoUeberKennung('mail', sauber);
  }

  if (kontoUeberAdresse) {
    const vorhandene = await speicher.leseKennungen(kontoUeberAdresse);
    // Bedingung (b): Die Adresse muss auch im eigenen Bestand bestaetigt sein.
    const bestandGeprueft = (vorhandene ?? []).some(
      (k) => k.art === 'mail' && k.wert === sauber && Boolean(k.daten?.bestaetigtAm),
    );
    if (bestandGeprueft) {
      await speicher.verknuepfeKennung(kontoUeberAdresse, anbieter, sub, bereiteDaten(sauber, true, daten));
      protokoll?.schreib?.('fremd_angeschlossen', {
        anbieter,
        kontoId: kontoUeberAdresse,
        ergebnis: 'ueber_gepruefte_adresse',
      });
      return { kontoId: kontoUeberAdresse, neu: false, angeschlossen: true };
    }
    /*
      Die Adresse liegt im Bestand, ist dort aber NICHT bestaetigt. Anschliessen
      waere genau die Uebernahme, die verhindert werden soll: Jemand hat sich
      irgendwann mit einer fremden Adresse registriert, ohne sie zu bestaetigen
      — und bekaeme jetzt das Konto des rechtmaessigen Inhabers zugeschoben,
      oder umgekehrt. Es entsteht ein zweites Konto, die Adresse bleibt beim
      ersten.
    */
    protokoll?.schreib?.('fremd_getrennt_gehalten', {
      anbieter,
      kontoId: kontoUeberAdresse,
      ergebnis: 'bestand_ungeprueft',
    });
  }

  /*
    Neues Konto. Die Adresse wird nur dann als eigene Kennung beansprucht, wenn
    der Anbieter sie geprueft hat UND sie im Bestand noch niemandem gehoert.
    Sonst faehrt sie als blosse Angabe an der Anbieterkennung mit und taugt
    nicht zum Nachschlagen.
  */
  const adresseFrei = Boolean(sauber) && adresseGeprueft && !kontoUeberAdresse;

  const kennungen = [
    { art: anbieter, wert: sub, daten: bereiteDaten(sauber, adresseGeprueft, daten) },
  ];
  if (adresseFrei) {
    kennungen.push({
      art: 'mail',
      wert: sauber,
      daten: {
        adresse: sauber,
        /*
          Der Anbieter hat geprueft, also gilt sie als bestaetigt. Sonst
          muesste der Nutzer eine Adresse bestaetigen, die er soeben gegenueber
          Google oder Apple nachgewiesen hat — und bekaeme eine Mail, deren
          Sinn er nicht versteht.
        */
        bestaetigtAm: new Date().toISOString(),
        quelle: anbieter,
        weiterleitung: istWeiterleitungsadresse(sauber),
      },
    });
  }

  const kontoId = await speicher.legeKontoAn({ kennungen });
  protokoll?.schreib?.('fremd_konto_neu', {
    anbieter,
    kontoId,
    ergebnis: adresseFrei ? 'mit_adresse' : 'ohne_adresse',
  });
  return { kontoId, neu: true, angeschlossen: false };
}

/*
  Eine Fremdanmeldung wieder loesen.

  Steht hier und nicht doppelt in google.mjs und apple.mjs, weil die Regel
  dieselbe ist — und weil eine Regel, die an zwei Stellen steht, irgendwann an
  einer der beiden geaendert wird.

  DER LETZTE ANMELDEWEG DARF NICHT WEG. Wer seine einzige Google-Verknuepfung
  loest und weder Passkey noch bestaetigte Adresse hat, hat danach ein Konto,
  das ihm gehoert und das er nicht mehr betreten kann. Von aussen sieht das aus
  wie Datenverlust, und es ist auch einer. Deshalb 409 statt 204 — und der
  Nutzer legt erst einen zweiten Weg an.
*/
export function baueLoeseVerknuepfung({ speicher, sitzung, protokoll, einst, anbieter }) {
  return async function loese(anfrage, antwort) {
    pruefeUrsprung(anfrage, einst.urspruenge);
    const kontoId = await sitzung.pruefe(anfrage);
    if (!kontoId) throw new FremdFehler('nicht_angemeldet', 401);

    const kennungen = (await speicher.leseKennungen(kontoId)) ?? [];
    const betroffen = kennungen.filter((k) => k.art === anbieter);
    if (betroffen.length === 0) throw new FremdFehler('nicht_verknuepft', 404);

    if (zaehleAnmeldewege(kennungen) - betroffen.length < 1) {
      protokoll?.schreib?.('fremd_loesen', { anbieter, kontoId, ergebnis: 'letzter_weg' });
      throw new FremdFehler('letzter_anmeldeweg', 409);
    }

    for (const k of betroffen) {
      await speicher.loescheKennung(kontoId, anbieter, k.wert);
    }
    protokoll?.schreib?.('fremd_loesen', { anbieter, kontoId, ergebnis: 'ok' });
    leereAntwort(antwort, 204);
  };
}

function bereiteDaten(adresse, geprueft, zusatz) {
  const d = { ...zusatz };
  if (adresse) {
    d.adresse = adresse;
    d.adresseGeprueft = Boolean(geprueft);
    d.weiterleitung = istWeiterleitungsadresse(adresse);
  }
  d.gesehenAm = new Date().toISOString();
  return d;
}

// ── HTTP-Handgriffe ─────────────────────────────────────────────────

export const RUMPF_GRENZE = 32 * 1024; // dieselbe Grenze wie client_max_body_size in nginx

export async function lesRumpf(anfrage, grenze = RUMPF_GRENZE) {
  const stuecke = [];
  let laenge = 0;
  for await (const stueck of anfrage) {
    laenge += stueck.length;
    /*
      Abbrechen, sobald die Grenze reisst — nicht erst am Ende messen. Sonst
      haette ein Angreifer mit einem endlosen Rumpf den Arbeitsspeicher des
      Containers in der Hand, und der hat 0,5 GiB fuer Radio und Anmeldung
      zusammen.
    */
    if (laenge > grenze) throw new FremdFehler('rumpf_zu_gross', 413);
    stuecke.push(stueck);
  }
  return Buffer.concat(stuecke).toString('utf8');
}

export async function lesFormular(anfrage) {
  const art = String(anfrage.headers['content-type'] ?? '');
  if (!art.startsWith('application/x-www-form-urlencoded')) {
    throw new FremdFehler('falscher_inhaltstyp', 415);
  }
  const text = await lesRumpf(anfrage);
  return new URLSearchParams(text);
}

export async function lesJson(anfrage) {
  const art = String(anfrage.headers['content-type'] ?? '');
  /*
    Auf application/json bestehen. Ein Formular-POST von einer fremden Seite
    kann diesen Kopf ohne Vorabanfrage nicht setzen — die Pruefung ist damit
    zugleich ein zweiter Riegel gegen ortsfremde Anfragen, neben der
    Ursprungspruefung weiter unten.
  */
  if (!art.startsWith('application/json')) throw new FremdFehler('falscher_inhaltstyp', 415);
  const text = await lesRumpf(anfrage);
  if (text.trim() === '') return {};
  let wert;
  try {
    wert = JSON.parse(text);
  } catch {
    throw new FremdFehler('rumpf_unlesbar', 400);
  }
  if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) {
    throw new FremdFehler('rumpf_unlesbar', 400);
  }
  return wert;
}

/*
  Ursprungspruefung fuer alles, was etwas veraendert.

  Die Sitzung haengt an einem Plaetzchen. Ein Plaetzchen schickt der Browser
  auch dann mit, wenn eine fremde Seite die Anfrage ausloest. Der Origin-Kopf
  sagt, von wo — und den kann eine Seite nicht faelschen.

  Apples Rueckweg ist ausgenommen und muss es sein: Er kommt als form_post von
  appleid.apple.com. Dort schuetzt der einmal gueltige state, nicht der Ursprung.
*/
export function pruefeUrsprung(anfrage, erlaubteUrspruenge) {
  const ursprung = anfrage.headers.origin;
  if (ursprung) {
    if (!erlaubteUrspruenge.includes(ursprung)) throw new FremdFehler('ursprung_falsch', 403);
    return ursprung;
  }
  /*
    Kein Origin-Kopf. Ersatzweise der Verweiser — und wenn auch der fehlt, wird
    abgelehnt. Ein Browser, der `fetch` mit Content-Type application/json
    absetzt, schickt immer einen Origin; wer keinen schickt, ist kein Browser
    oder verbirgt etwas.
  */
  const verweiser = anfrage.headers.referer;
  if (!verweiser) throw new FremdFehler('ursprung_fehlt', 403);
  let u;
  try {
    u = new URL(verweiser);
  } catch {
    throw new FremdFehler('ursprung_falsch', 403);
  }
  if (!erlaubteUrspruenge.includes(u.origin)) throw new FremdFehler('ursprung_falsch', 403);
  return u.origin;
}

export function jsonAntwort(antwort, status, wert, koepfe = {}) {
  const text = JSON.stringify(wert ?? {});
  antwort.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(text),
    ...koepfe,
  });
  antwort.end(text);
}

export function leereAntwort(antwort, status, koepfe = {}) {
  antwort.writeHead(status, { 'cache-control': 'no-store', ...koepfe });
  antwort.end();
}

export function umleitung(antwort, ziel, koepfe = {}) {
  antwort.writeHead(302, {
    location: ziel,
    // Die Umleitung traegt oft ein frisches Sitzungsplaetzchen. Ein
    // Zwischenspeicher, der sie festhielte, gaebe sie dem Naechsten mit.
    'cache-control': 'no-store',
    pragma: 'no-cache',
    ...koepfe,
  });
  antwort.end();
}

export const PLAETZCHEN_NAME = 'hz_sitzung';
export const BINDUNG_NAME = 'hz_anmeldung';

/*
  ── Die Bindung des Anmeldevorgangs an DIESEN Browser ───────────────

  Der state ist einmal gueltig und liegt beim Server. Das schuetzt gegen
  Wiedereinspielen — aber NICHT gegen den umgekehrten Angriff, und der wird
  gern uebersehen:

  Der Angreifer meldet sich selbst bei Google an, bricht kurz vor dem Ende ab
  und haelt damit ein gueltiges Paar aus `code` und `state` in der Hand. Dann
  bringt er ein fremdes Opfer dazu, genau diesen Rueckweg aufzurufen — ein Bild
  mit dieser Adresse genuegt, bei Apple ein Formular, das sich selbst abschickt.
  Der Dienst sieht einen tadellosen Vorgang, legt eine Sitzung an und setzt sie
  im Browser des OPFERS. Das Opfer sitzt danach im Konto des ANGREIFERS, ohne
  es zu merken, und alles, was es hoert und merkt, landet dort.

  RFC 6749 nennt das in 10.12; die OAuth-2.0-Security-BCP verlangt deshalb,
  den state an den Browser zu binden. Genau das tut dieses Plaetzchen: Beim
  Start bekommt der Browser einen Zufallswert, im state liegt nur dessen
  Abdruck. Wer den Rueckweg bringt, muss auch das Plaetzchen mitbringen.

  SameSite=None, und das MUSS so sein: Apples Rueckweg ist ein ortsfremder
  POST, bei dem ein Lax-Plaetzchen nicht mitgeschickt wuerde. Es ist trotzdem
  kein Loch — der Wert ist HttpOnly, keine fremde Seite kann ihn lesen, und
  allein ist er wertlos: Ohne den passenden state im Server oeffnet er nichts.

  Path=/api/ und eine Viertelstunde: Es hat auf keiner anderen Seite etwas zu
  suchen und danach auch hier nichts mehr.
*/
/*
  `PLAETZCHEN_UNSICHER=1` ist die Notluke des Kerns fuer Versuche ueber http
  (siehe `baueSitzungsPlaetzchen` in sitzung.mjs). Sie wird hier mitgezogen,
  sonst haette man beim Ausprobieren zwei Plaetzchen mit verschiedenen Regeln.

  `SameSite=None` VERLANGT `Secure` — ohne Secure lehnt der Browser die
  Kombination ab. In der unsicheren Betriebsart faellt die Bindung deshalb auf
  `Lax` zurueck. Fuer Google reicht das (sein Rueckweg ist ein GET vom eigenen
  Ursprung aus gesehen ortsfremd, aber Lax laesst Navigations-GETs durch); fuer
  Apple nicht — Apple laesst sich ohnehin nicht ueber http ausprobieren, weil es
  keine http-Rueckkehradressen annimmt.
*/
function bindungsRegeln(unsicher) {
  return unsicher
    ? ['Path=/api/', 'HttpOnly', 'SameSite=Lax']
    : ['Path=/api/', 'HttpOnly', 'Secure', 'SameSite=None'];
}

export function erzeugeBindung({ unsicher = process.env.PLAETZCHEN_UNSICHER === '1' } = {}) {
  const wert = zufallText(32);
  return {
    wert,
    abdruck: crypto.createHash('sha256').update(wert).digest('base64url'),
    kopf: [`${BINDUNG_NAME}=${wert}`, ...bindungsRegeln(unsicher), 'Max-Age=900'].join('; '),
  };
}

export function bindungLoeschen({ unsicher = process.env.PLAETZCHEN_UNSICHER === '1' } = {}) {
  return [`${BINDUNG_NAME}=`, ...bindungsRegeln(unsicher), 'Max-Age=0'].join('; ');
}

// Bequemlichkeit fuer den Regelfall. Wer die unsichere Betriebsart braucht,
// ruft `bindungLoeschen()` selbst auf — sie liest die Umgebung bei JEDEM Aufruf,
// diese Konstante nur einmal beim Laden.
export const BINDUNG_LOESCHEN = bindungLoeschen();

export function lesPlaetzchen(anfrage, name) {
  const roh = anfrage?.headers?.cookie;
  if (typeof roh !== 'string') return null;
  for (const stueck of roh.split(';')) {
    const i = stueck.indexOf('=');
    if (i < 0) continue;
    if (stueck.slice(0, i).trim() === name) return stueck.slice(i + 1).trim();
  }
  return null;
}

/*
  Gibt zurueck, ob der Rueckweg aus demselben Browser kommt wie der Start.
  Wirft nicht: Der Aufrufer soll den Menschen freundlich zurueckschicken, nicht
  mit einem JSON-Fehler in einer Seite stehen lassen, die er nie sehen wollte.
*/
export function pruefeBindung(anfrage, eintrag) {
  if (!eintrag?.bindung) return false;
  const wert = lesPlaetzchen(anfrage, BINDUNG_NAME);
  if (!wert) return false;
  const abdruck = crypto.createHash('sha256').update(wert).digest('base64url');
  return gleichSicher(abdruck, eintrag.bindung);
}

/*
  Der Kern liefert aus `sitzung.erzeuge` ein Feld `plaetzchen`. Ob darin der
  reine Wert steht oder schon ein fertiger Set-Cookie-Kopf, entscheidet der
  Kern — deshalb wird hier beides erkannt, statt eine Annahme zu treffen, die
  im Betrieb still danebenliegt und niemandem auffaellt, weil eine Anmeldung
  ohne Plaetzchen wie ein Bedienfehler aussieht.

  Kein SameSite=None: Lax genuegt. Der Rueckweg von Apple SETZT das Plaetzchen
  nur; gesendet wird es erst danach, bei einer Navigation auf eigenem Grund.
*/
export function plaetzchenKopf(plaetzchen, ablauf) {
  if (plaetzchen && typeof plaetzchen === 'object') {
    if (typeof plaetzchen.kopf === 'string') return plaetzchen.kopf;
    return baueKopf(plaetzchen.name ?? PLAETZCHEN_NAME, plaetzchen.wert, plaetzchen.ablauf ?? ablauf);
  }
  const text = String(plaetzchen ?? '');
  if (text.includes(';') || /httponly/i.test(text)) return text; // schon ein fertiger Kopf
  return baueKopf(PLAETZCHEN_NAME, text, ablauf);
}

function baueKopf(name, wert, ablauf) {
  const teile = [`${name}=${wert}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (ablauf) {
    const d = ablauf instanceof Date ? ablauf : new Date(ablauf);
    if (!Number.isNaN(d.getTime())) teile.push(`Expires=${d.toUTCString()}`);
  }
  return teile.join('; ');
}

export function leseUmgebung(umgebung = process.env) {
  const urspruenge = String(umgebung.ERLAUBTE_URSPRUENGE ?? 'https://iyambae.fm,https://www.iyambae.fm')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    basis: String(umgebung.OEFFENTLICHE_ADRESSE ?? urspruenge[0] ?? 'https://iyambae.fm').replace(/\/+$/, ''),
    urspruenge,
    rpId: String(umgebung.WEBAUTHN_RP_ID ?? 'iyambae.fm'),
    rpName: String(umgebung.WEBAUTHN_RP_NAME ?? 'IYAMBAE FM'),
    nutzerpruefung: String(umgebung.PASSKEY_NUTZERPRUEFUNG ?? 'preferred'),
    // Aus, weil ein rueckwaerts laufender Zaehler ein Hinweis ist und kein
    // Beweis. Die Abwaegung steht in passkey.mjs und in FREMDANMELDUNG.md.
    zaehlerStreng: String(umgebung.PASSKEY_ZAEHLER_STRENG ?? '') === '1',
    google: {
      kennung: umgebung.GOOGLE_CLIENT_ID ?? '',
      geheimnis: umgebung.GOOGLE_CLIENT_SECRET ?? '',
    },
    apple: {
      teamId: umgebung.APPLE_TEAM_ID ?? '',
      keyId: umgebung.APPLE_KEY_ID ?? '',
      dienstId: umgebung.APPLE_SERVICE_ID ?? '',
      // Container-Apps-Geheimnisse tragen keine echten Zeilenumbrueche durch
      // jede Werkzeugkette. `\n` als zwei Zeichen wird deshalb zurueckgebogen.
      schluessel: String(umgebung.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    },
  };
}

/*
  Ziel nach dem Rueckweg. Die Sprache kommt aus dem state, nicht aus der
  Anfrage — und selbst dann noch einmal durch `saubereSprache`. Zwei Riegel vor
  einer offenen Weiterleitung sind hier keiner zu viel: Diese Adresse steht in
  einer Antwort, die ein frisches Sitzungsplaetzchen traegt.
*/
export function rueckkehrZiel(sprache, felder = {}) {
  const s = saubereSprache(sprache);
  const abfrage = new URLSearchParams(felder);
  const text = abfrage.toString();
  return `/${s}/${text ? `?${text}` : ''}`;
}

// ── Zusammenbau ─────────────────────────────────────────────────────

/*
  Was server.mjs braucht, ist genau das hier — ein Import und zwei Zeilen:

      import { erzeugeFremdanmeldung } from './fremd.mjs';
      const fremd = await erzeugeFremdanmeldung({ speicher, sitzung, protokoll });
      // im Anfragebehandler, VOR der eigenen Wegwahl:
      if (await fremd.behandle(anfrage, antwort)) return;
*/
export async function erzeugeFremdanmeldung({
  speicher,
  sitzung,
  protokoll,
  umgebung = process.env,
  zustand = new Zustandsspeicher(),
  jwks = new JwksSpeicher(),
  webauthn = null,
  holer = fetch,
  uhr = Date.now,
} = {}) {
  const einst = leseUmgebung(umgebung);
  const gemeinsam = { speicher, sitzung, protokoll, einst, zustand, jwks, holer, uhr };

  const { erzeugeGoogle } = await import('./google.mjs');
  const { erzeugeApple } = await import('./apple.mjs');
  const { erzeugePasskey } = await import('./passkey.mjs');

  const teile = {
    google: erzeugeGoogle(gemeinsam),
    apple: erzeugeApple(gemeinsam),
    passkey: erzeugePasskey({ ...gemeinsam, webauthn, zaehlerStreng: einst.zaehlerStreng }),
  };
  const routen = [...teile.google.routen, ...teile.apple.routen, ...teile.passkey.routen];

  async function behandle(anfrage, antwort) {
    const url = new URL(anfrage.url ?? '/', `https://${anfrage.headers?.host ?? einst.rpId}`);
    for (const route of routen) {
      if (route.methode !== anfrage.method) continue;
      const treffer = typeof route.pfad === 'string'
        ? (route.pfad === url.pathname ? [] : null)
        : url.pathname.match(route.pfad);
      if (!treffer) continue;
      try {
        await route.behandler(anfrage, antwort, { url, treffer });
      } catch (fehler) {
        beantworteFehler(antwort, fehler, protokoll, route);
      }
      return true;
    }
    return false;
  }

  return { routen, behandle, zustand, jwks, einst, teile };
}

export function beantworteFehler(antwort, fehler, protokoll, route) {
  const istBekannt = fehler instanceof FremdFehler;
  const status = istBekannt ? fehler.status : 500;
  const code = istBekannt ? fehler.code : 'unerwarteter_fehler';
  if (!istBekannt) {
    /*
      Nur auf stderr, nicht ins Protokoll: Ein unerwarteter Fehler traegt
      manchmal einen Ausschnitt der Eingabe im Text, und die Eingabe kann eine
      Adresse sein. Das Protokoll bleibt personenfrei.
    */
    console.error('[fremd] unerwarteter Fehler', route?.pfad, fehler);
  }
  protokoll?.schreib?.('fremd_fehler', { ergebnis: code });
  if (antwort.headersSent) {
    antwort.end();
    return;
  }
  jsonAntwort(antwort, status, { fehler: code });
}
