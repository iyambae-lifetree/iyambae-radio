/*
  IYAMBAE FM — Anmeldung mit Apple.

  Zwei Dinge machen Apple anders als jeden anderen OIDC-Anbieter, und beide
  sind der Grund, warum diese Datei nicht einfach eine Abschrift von google.mjs
  ist:

  1. DAS CLIENT-GEHEIMNIS IST KEIN WERT, SONDERN EIN JWT, das wir selbst
     signieren — und Apple erlaubt ihm hoechstens sechs Monate Laufzeit. Wer es
     einmal im Portal erzeugt und in ein Container-Apps-Geheimnis legt, hat
     eine Anmeldung gebaut, die an einem Dienstagmorgen aufhoert zu
     funktionieren, ohne dass jemand etwas geaendert hat. Deshalb wird es HIER
     erzeugt, bei Bedarf, mit kurzer Laufzeit. Von aussen kommen nur der
     .p8-Schluessel, die Team-ID, die Key-ID und die Service-ID — vier Werte,
     die nicht ablaufen.

  2. APPLE ANTWORTET PER form_post, NICHT MIT EINER UMLEITUNG AUF GET. Der
     Rueckweg ist ein POST mit application/x-www-form-urlencoded. Wer ihn als
     GET baut, bekommt in der Entwicklung nie einen Fehler zu sehen und im
     Betrieb einen 404 bei jedem Anmeldeversuch.

  Und ein drittes, das man nur einmal falsch macht: NAME UND ADRESSE SCHICKT
  APPLE NUR BEIM ALLERERSTEN MAL. Danach nie wieder, auch nicht, wenn man die
  App neu installiert. Was hier nicht sofort gespeichert wird, ist fort.
*/

import crypto from 'node:crypto';
import {
  BINDUNG_LOESCHEN,
  FremdFehler,
  b64u,
  baueLoeseVerknuepfung,
  erzeugeBindung,
  erzeugePkce,
  istGeprueft,
  lesFormular,
  plaetzchenKopf,
  pruefeBindung,
  pruefeIdToken,
  rueckkehrZiel,
  saubereSprache,
  umleitung,
  verknuepfeAnbieterkennung,
  zufallText,
} from './fremd.mjs';

export const APPLE = {
  autorisierung: 'https://appleid.apple.com/auth/authorize',
  token: 'https://appleid.apple.com/auth/token',
  jwks: 'https://appleid.apple.com/auth/keys',
  iss: ['https://appleid.apple.com'],
  // Das Client-Geheimnis-JWT ist an Apple selbst adressiert.
  geheimnisEmpfaenger: 'https://appleid.apple.com',
};

// Apples Obergrenze: 15777000 Sekunden, rund ein halbes Jahr.
export const APPLE_HOECHSTLAUFZEIT_S = 15_777_000;

/*
  Ein Client-Geheimnis fuer Apple bauen.

  Kurze Laufzeit mit Absicht. Ein JWT, das dreissig Minuten gilt, ist selbst
  dann fast wertlos, wenn es in einem Protokoll landet — und es kostet nichts,
  denn erzeugt wird es aus einem Schluessel, den wir ohnehin haben. Sechs
  Monate zu nehmen, nur weil Apple sie erlaubt, waere ein Geheimnis mit langer
  Reichweite ohne jeden Gegenwert.
*/
export function baueClientGeheimnis({ teamId, keyId, dienstId, schluessel, laufzeitS = 1800, uhr = Date.now }) {
  if (!teamId || !keyId || !dienstId || !schluessel) {
    throw new FremdFehler('apple_nicht_eingerichtet', 501);
  }
  const laufzeit = Math.min(Math.max(60, laufzeitS), APPLE_HOECHSTLAUFZEIT_S);

  let privat;
  try {
    privat = crypto.createPrivateKey(schluessel);
  } catch (f) {
    /*
      Der haeufigste Grund: Die .p8-Datei wurde als eine Zeile in eine
      Umgebungsvariable gelegt und die Zeilenumbrueche sind verlorengegangen.
      Deshalb hier ein eigener Fehlercode und kein blosses "ungueltig" — die
      Ursache steht in FREMDANMELDUNG.md.
    */
    throw new FremdFehler('apple_schluessel_unlesbar', 501, { ursache: f?.message });
  }
  /*
    Apple gibt einen EC-Schluessel auf P-256 aus. Wer versehentlich einen
    anderen einsetzt, bekaeme sonst eine Unterschrift, die Apple wortlos
    ablehnt — mit einer Fehlermeldung, die nur `invalid_client` sagt. Lieber
    hier scheitern, wo die Ursache noch im Text steht.
  */
  if (privat.asymmetricKeyType !== 'ec') {
    throw new FremdFehler('apple_schluessel_falscher_typ', 501, { typ: privat.asymmetricKeyType });
  }

  const jetzt = Math.floor(uhr() / 1000);
  const kopf = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const rumpf = {
    iss: teamId,
    iat: jetzt,
    exp: jetzt + laufzeit,
    aud: APPLE.geheimnisEmpfaenger,
    // `sub` ist die SERVICE-ID, nicht die App-ID. Die beiden sehen aehnlich
    // aus und werden staendig verwechselt; siehe FREMDANMELDUNG.md.
    sub: dienstId,
  };
  const daten = `${b64u(JSON.stringify(kopf))}.${b64u(JSON.stringify(rumpf))}`;
  // ES256 verlangt die rohe Form R||S; node liefert sonst DER, und Apple
  // lehnt das ab.
  const unterschrift = crypto.sign('sha256', Buffer.from(daten, 'utf8'), {
    key: privat,
    dsaEncoding: 'ieee-p1363',
  });
  return { geheimnis: `${daten}.${b64u(unterschrift)}`, ablauf: rumpf.exp };
}

/*
  Der Vorrat: ein Geheimnis im Arbeitsspeicher, das kurz vor seinem Ablauf neu
  gebaut wird. Nichts davon liegt auf der Platte, nichts muss erneuert werden,
  nichts kann vergessen werden.
*/
export function erzeugeGeheimnisvorrat({ apple, laufzeitS = 1800, vorlaufS = 120, uhr = Date.now }) {
  let stand = null;
  return function hole() {
    const jetzt = Math.floor(uhr() / 1000);
    if (stand && stand.ablauf - vorlaufS > jetzt) return stand.geheimnis;
    stand = baueClientGeheimnis({ ...apple, laufzeitS, uhr });
    return stand.geheimnis;
  };
}

export function erzeugeApple({ speicher, sitzung, protokoll, einst, zustand, jwks, holer = fetch, uhr = Date.now, ziele = APPLE }) {
  const rueckadresse = `${einst.basis}/api/apple/zurueck`;
  const holeGeheimnis = erzeugeGeheimnisvorrat({ apple: einst.apple, uhr });

  function pruefeEinrichtung() {
    const a = einst.apple;
    if (!a.teamId || !a.keyId || !a.dienstId || !a.schluessel) {
      throw new FremdFehler('apple_nicht_eingerichtet', 501);
    }
  }

  async function start(anfrage, antwort, { url }) {
    pruefeEinrichtung();

    const sprache = saubereSprache(url.searchParams.get('sprache'));

    /*
      Die kontoId zum Verknuepfen wird JETZT aus der Sitzung gelesen und in den
      state gelegt — und das ist bei Apple nicht nur bequem, sondern noetig:
      Der Rueckweg ist ein POST von appleid.apple.com, also ortsfremd. Ein
      Sitzungsplaetzchen mit SameSite=Lax wird bei einem ortsfremden POST NICHT
      mitgeschickt. Wer die Sitzung erst im Rueckweg lesen wollte, faende dort
      nichts und wuesste nicht, warum.
    */
    let verknuepfeMit = null;
    if (url.searchParams.get('verknuepfen') === '1') {
      verknuepfeMit = await sitzung.pruefe(anfrage);
      if (!verknuepfeMit) throw new FremdFehler('nicht_angemeldet', 401);
    }

    const pkce = erzeugePkce();
    const nonce = zufallText(16);
    /*
      Die Bindung an den Browser. Apple ist der Grund fuer SameSite=None in
      `erzeugeBindung`: Bei einem ortsfremden POST kaeme ein Lax-Plaetzchen
      nicht mit, und JEDER Rueckweg schluege fehl.
    */
    const bindung = erzeugeBindung();
    const state = zustand.lege({
      anbieter: 'apple',
      sprache,
      verifizierer: pkce.verifizierer,
      nonce,
      verknuepfeMit,
      bindung: bindung.abdruck,
    });

    const ziel = new URL(ziele.autorisierung);
    ziel.searchParams.set('client_id', einst.apple.dienstId);
    ziel.searchParams.set('redirect_uri', rueckadresse);
    ziel.searchParams.set('response_type', 'code');
    /*
      `form_post` ist bei `scope=name email` PFLICHT: Apple weigert sich, diese
      Angaben ueber eine GET-Umleitung zu schicken, weil sie sonst in
      Verlaeufen und Serverprotokollen landeten. Wer den scope weglaesst,
      bekommt nie einen Namen — und merkt es erst, wenn der erste Nutzer
      namenlos in der Tabelle steht.
    */
    ziel.searchParams.set('response_mode', 'form_post');
    ziel.searchParams.set('scope', 'name email');
    ziel.searchParams.set('state', state);
    ziel.searchParams.set('nonce', nonce);
    ziel.searchParams.set('code_challenge', pkce.abgleich);
    ziel.searchParams.set('code_challenge_method', pkce.verfahren);

    protokoll?.schreib?.('fremd_start', { anbieter: 'apple', ergebnis: verknuepfeMit ? 'verknuepfen' : 'anmelden' });
    umleitung(antwort, ziel.toString(), { 'set-cookie': bindung.kopf });
  }

  /*
    POST, nicht GET. Siehe den Kopf dieser Datei.

    Keine Ursprungspruefung: Der Ursprung IST fremd, naemlich Apple. Was hier
    schuetzt, ist der einmal gueltige state — er wurde von uns vergeben, liegt
    nur bei uns, und `zustand.hole` gibt ihn genau einmal heraus.
  */
  async function zurueck(anfrage, antwort) {
    pruefeEinrichtung();

    const formular = await lesFormular(anfrage);
    const eintrag = zustand.hole(formular.get('state'));
    if (!eintrag || eintrag.anbieter !== 'apple') {
      protokoll?.schreib?.('fremd_rueckweg', { anbieter: 'apple', ergebnis: 'state_unbekannt' });
      umleitung(antwort, '/?anmeldung=fehler&grund=abgelaufen');
      return;
    }

    /*
      Kommt der Rueckweg aus demselben Browser wie der Start? Bei Apple faellt
      die Ursprungspruefung weg — dies ist der Riegel, der sie ersetzt.
    */
    if (!pruefeBindung(anfrage, eintrag)) {
      protokoll?.schreib?.('fremd_rueckweg', { anbieter: 'apple', ergebnis: 'bindung_falsch' });
      umleitung(antwort, rueckkehrZiel(eintrag.sprache, { anmeldung: 'fehler' }), { 'set-cookie': BINDUNG_LOESCHEN });
      return;
    }

    if (formular.get('error')) {
      protokoll?.schreib?.('fremd_rueckweg', { anbieter: 'apple', ergebnis: 'abbruch' });
      umleitung(antwort, rueckkehrZiel(eintrag.sprache, { anmeldung: 'abgebrochen' }), { 'set-cookie': BINDUNG_LOESCHEN });
      return;
    }

    const code = formular.get('code');
    if (!code) throw new FremdFehler('code_fehlt', 400);

    /*
      DAS EINZIGE MAL. `user` steht nur in der allerersten Antwort, danach nie
      wieder. Wird hier zuerst gelesen — vor dem Codetausch —, damit ein
      Netzfehler beim Tausch die Angabe nicht mitnimmt.
    */
    const angaben = leseErstangaben(formular.get('user'));

    const token = await tauscheCode(code, eintrag.verifizierer);
    const anspruch = await pruefeIdToken(token.id_token, {
      jwks,
      jwksAdresse: ziele.jwks,
      iss: ziele.iss,
      aud: einst.apple.dienstId,
      nonce: eintrag.nonce,
      verfahren: ['RS256'],
      uhr,
    });

    /*
      DIE ADRESSE FUER DIE VERKNUEPFUNG KOMMT AUSSCHLIESSLICH AUS DEM
      GEPRUEFTEN id_token — niemals aus dem Formularfeld `user`.

      Das Feld `user` ist NICHT signiert. Wer einen eigenen Apple-Anmeldevorgang
      startet, haelt einen gueltigen state und einen gueltigen Code in der Hand
      und koennte den Rumpf vor dem Absenden umschreiben: derselbe Code, aber
      eine fremde Adresse im `user`-Feld. Wuerde die Verknuepfung danach gehen,
      waere das genau die Kontouebernahme, die die Regel in fremd.mjs
      verhindern soll — nur eine Etage tiefer eingeschleust.

      Der Name aus `user` ist harmlos, weil er nur angezeigt wird und ueber
      nichts entscheidet. Er wird gekuerzt gespeichert und sonst nicht beachtet.
    */
    const adresse = typeof anspruch.email === 'string' ? anspruch.email : null;
    const geprueft = istGeprueft(anspruch.email_verified);

    const ergebnis = await verknuepfeAnbieterkennung({
      speicher,
      protokoll,
      anbieter: 'apple',
      sub: anspruch.sub,
      adresse,
      adresseGeprueft: geprueft,
      daten: {
        name: angaben.name,
        /*
          Apple sagt selbst, ob die Adresse eine Weiterleitung ist. Der Wert
          wird uebernommen, aber nicht geglaubt: `istWeiterleitungsadresse`
          entscheidet in fremd.mjs anhand der Domaene noch einmal selbst,
          damit die Angabe und die Wirklichkeit nicht auseinanderlaufen.
        */
        appleWeiterleitung: istGeprueft(anspruch.is_private_email),
        // Nur zur Anzeige und zur Fehlersuche, NIE zur Verknuepfung.
        angegebeneAdresse: angaben.adresse,
      },
      bestehendesKonto: eintrag.verknuepfeMit ?? null,
    });

    if (eintrag.verknuepfeMit) {
      umleitung(antwort, rueckkehrZiel(eintrag.sprache, { verknuepfung: 'apple' }), { 'set-cookie': BINDUNG_LOESCHEN });
      return;
    }

    const neu = await sitzung.erzeuge(ergebnis.kontoId);
    umleitung(
      antwort,
      rueckkehrZiel(eintrag.sprache, { anmeldung: ergebnis.neu ? 'neu' : 'ok' }),
      { 'set-cookie': [plaetzchenKopf(neu.plaetzchen, neu.ablauf), BINDUNG_LOESCHEN] },
    );
  }

  async function tauscheCode(code, verifizierer) {
    const rumpf = new URLSearchParams({
      client_id: einst.apple.dienstId,
      // Frisch gebaut, wenn der Vorrat abgelaufen ist. Es gibt nichts zu
      // erneuern und nichts zu vergessen.
      client_secret: holeGeheimnis(),
      code,
      code_verifier: verifizierer,
      grant_type: 'authorization_code',
      redirect_uri: rueckadresse,
    });

    let antwort;
    try {
      antwort = await holer(ziele.token, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          /*
            Apple lehnt Anfragen ohne User-Agent gelegentlich mit einem
            HTML-Fehler ab. node schickt von sich aus keinen — eine der
            Eigenheiten, die man nur durch Hinfallen lernt.
          */
          'user-agent': 'iyambae-konto/1',
        },
        body: rumpf.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (f) {
      throw new FremdFehler('token_tausch_nicht_erreichbar', 502, { ursache: f?.message });
    }

    if (!antwort.ok) {
      /*
        `invalid_client` heisst bei Apple fast immer: Das Client-Geheimnis ist
        falsch gebaut — Team-ID und Service-ID vertauscht, falsche Key-ID, oder
        die Service-ID ist nicht mit der App-ID verknuepft. Der Text wird
        trotzdem nicht weitergereicht; er steht auf stderr, wenn es einen gibt.
      */
      throw new FremdFehler('token_tausch_abgelehnt', 502, { status: antwort.status });
    }

    const daten = await antwort.json();
    if (!daten || typeof daten.id_token !== 'string') throw new FremdFehler('id_token_fehlt', 502);
    return daten;
  }

  return {
    routen: [
      { methode: 'GET', pfad: '/api/apple/start', behandler: start },
      // POST. Nicht GET. Das ist keine Geschmacksfrage.
      { methode: 'POST', pfad: '/api/apple/zurueck', behandler: zurueck },
      {
        methode: 'DELETE',
        pfad: '/api/apple/verknuepfung',
        behandler: baueLoeseVerknuepfung({ speicher, sitzung, protokoll, einst, anbieter: 'apple' }),
      },
    ],
    _intern: { tauscheCode, holeGeheimnis, rueckadresse },
  };
}

/*
  Apples `user`-Feld ist eine JSON-Zeichenkette im Formularrumpf. Sie kommt aus
  dem Netz und wird entsprechend behandelt: kaputt heisst leer, nicht Absturz.
*/
export function leseErstangaben(roh) {
  const leer = { name: null, adresse: null };
  if (typeof roh !== 'string' || roh.length === 0 || roh.length > 4096) return leer;
  let wert;
  try {
    wert = JSON.parse(roh);
  } catch {
    return leer;
  }
  if (!wert || typeof wert !== 'object') return leer;

  const vorname = typeof wert.name?.firstName === 'string' ? wert.name.firstName.trim() : '';
  const nachname = typeof wert.name?.lastName === 'string' ? wert.name.lastName.trim() : '';
  const name = `${vorname} ${nachname}`.trim();

  return {
    // Gekuerzt, weil das Feld frei belegbar ist und die Tabellenzeile eine
    // Groessengrenze hat.
    name: name.length > 0 ? name.slice(0, 120) : null,
    adresse: typeof wert.email === 'string' ? wert.email.trim().toLowerCase().slice(0, 254) : null,
  };
}
