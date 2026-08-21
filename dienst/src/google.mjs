/*
  IYAMBAE FM — Anmeldung mit Google.

  OIDC Authorization Code Flow mit PKCE. Der Dienst ist ein VERTRAULICHER
  Client: Der Codetausch passiert im Container, nicht im Browser, deshalb gibt
  es ein Client-Geheimnis. PKCE kommt trotzdem dazu — es schuetzt den Code auf
  dem Weg durch den Browser, und das Geheimnis schuetzt ihn beim Tausch. Zwei
  verschiedene Wege, zwei verschiedene Angriffe.

  Es werden AUSSCHLIESSLICH `openid`, `email` und `profile` angefordert. Das ist
  keine Bescheidenheit, sondern der Unterschied zwischen einer App, die man
  veroeffentlichen kann, und einer, die im Warnbildschirm und hinter einer
  100-Nutzer-Grenze haengt — siehe FREMDANMELDUNG.md.
*/

import {
  BINDUNG_LOESCHEN,
  FremdFehler,
  baueLoeseVerknuepfung,
  erzeugePkce,
  istGeprueft,
  erzeugeBindung,
  plaetzchenKopf,
  pruefeBindung,
  pruefeIdToken,
  rueckkehrZiel,
  saubereSprache,
  umleitung,
  verknuepfeAnbieterkennung,
  zufallText,
} from './fremd.mjs';

/*
  Fest verdrahtet statt ueber das Discovery-Dokument geholt.

  Warum: Discovery waere ein Netzaufruf beim Start, der scheitern kann — und
  dann startet der Anmeldedienst nicht, waehrend das Radio danebensteht und
  laeuft. Diese vier Adressen haben sich seit Jahren nicht geaendert; aendern
  sie sich doch, ist das eine Zeile hier und keine Fehlersuche um drei Uhr
  nachts. Wer sie ueberschreiben will, kann es ueber die Umgebung tun.
*/
export const GOOGLE = {
  autorisierung: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs',
  /*
    Google stellt id_tokens historisch mit und ohne Schema aus. Beides gilt und
    ist in Googles eigener Doku so genannt — wer nur eines prueft, lehnt eines
    Tages gueltige Tokens ab.
  */
  iss: ['https://accounts.google.com', 'accounts.google.com'],
};

export function erzeugeGoogle({ speicher, sitzung, protokoll, einst, zustand, jwks, holer = fetch, ziele = GOOGLE }) {
  const rueckadresse = `${einst.basis}/api/google/zurueck`;

  function pruefeEinrichtung() {
    if (!einst.google.kennung || !einst.google.geheimnis) {
      // 501 und nicht 500: Es ist kein Fehler, sondern eine fehlende
      // Einrichtung. Der Unterschied entscheidet, wo jemand zu suchen anfaengt.
      throw new FremdFehler('google_nicht_eingerichtet', 501);
    }
  }

  async function start(anfrage, antwort, { url }) {
    pruefeEinrichtung();

    const sprache = saubereSprache(url.searchParams.get('sprache'));

    /*
      Wer schon angemeldet ist und `verknuepfen=1` mitschickt, will Google zu
      seinem bestehenden Konto dazulegen — der Weg, der aus zwei getrennt
      entstandenen Konten wieder eines macht. Die Sitzung wird JETZT geprueft
      und die kontoId in den state gelegt; beim Rueckweg noch einmal aus dem
      Plaetzchen zu lesen waere unnoetig, denn der state ist ohnehin an diesen
      einen Vorgang gebunden.
    */
    let verknuepfeMit = null;
    if (url.searchParams.get('verknuepfen') === '1') {
      verknuepfeMit = await sitzung.pruefe(anfrage);
      if (!verknuepfeMit) throw new FremdFehler('nicht_angemeldet', 401);
    }

    const pkce = erzeugePkce();
    const nonce = zufallText(16);
    // Bindet den Vorgang an DIESEN Browser. Begruendung bei `erzeugeBindung`.
    const bindung = erzeugeBindung();
    const state = zustand.lege({
      anbieter: 'google',
      sprache,
      verifizierer: pkce.verifizierer,
      nonce,
      verknuepfeMit,
      bindung: bindung.abdruck,
    });

    const ziel = new URL(ziele.autorisierung);
    ziel.searchParams.set('client_id', einst.google.kennung);
    ziel.searchParams.set('redirect_uri', rueckadresse);
    ziel.searchParams.set('response_type', 'code');
    // Genau diese drei. Jedes weitere Recht kippt die App in die
    // Verifizierungspflicht — und wir wollen von Google nichts als die Auskunft,
    // wer da gerade klickt.
    ziel.searchParams.set('scope', 'openid email profile');
    ziel.searchParams.set('state', state);
    ziel.searchParams.set('nonce', nonce);
    ziel.searchParams.set('code_challenge', pkce.abgleich);
    ziel.searchParams.set('code_challenge_method', pkce.verfahren);
    /*
      `online` und NICHT `offline`: Wir wollen kein Refresh-Token. Der
      Zugriffs-Token wird nach dem Tausch nicht ein einziges Mal benutzt — alles,
      was wir brauchen, steht im id_token. Ein Refresh-Token waere ein Geheimnis,
      das wir aufbewahren muessten, um es nie zu gebrauchen.
    */
    ziel.searchParams.set('access_type', 'online');
    // Damit jemand mit zwei Google-Konten waehlen kann, welches er anschliesst.
    ziel.searchParams.set('prompt', 'select_account');

    protokoll?.schreib?.('fremd_start', { anbieter: 'google', ergebnis: verknuepfeMit ? 'verknuepfen' : 'anmelden' });
    umleitung(antwort, ziel.toString(), { 'set-cookie': bindung.kopf });
  }

  async function zurueck(anfrage, antwort, { url }) {
    pruefeEinrichtung();

    const eintrag = zustand.hole(url.searchParams.get('state'));
    /*
      Kein state gefunden: abgelaufen, schon verbraucht, erfunden — der
      Unterschied ist von aussen nicht sichtbar und soll es auch nicht sein.
      Umleitung auf `/`, damit nginx die Sprache waehlt: Ohne state wissen wir
      nicht, in welcher Sprache der Mensch losgegangen ist.
    */
    if (!eintrag || eintrag.anbieter !== 'google') {
      protokoll?.schreib?.('fremd_rueckweg', { anbieter: 'google', ergebnis: 'state_unbekannt' });
      umleitung(antwort, '/?anmeldung=fehler&grund=abgelaufen');
      return;
    }

    /*
      Kommt der Rueckweg aus demselben Browser wie der Start? Wenn nicht, hat
      jemand einen fremden Vorgang untergeschoben — nichts anmelden, nichts
      setzen, zurueck auf die Seite.
    */
    if (!pruefeBindung(anfrage, eintrag)) {
      protokoll?.schreib?.('fremd_rueckweg', { anbieter: 'google', ergebnis: 'bindung_falsch' });
      umleitung(antwort, rueckkehrZiel(eintrag.sprache, { anmeldung: 'fehler' }), { 'set-cookie': BINDUNG_LOESCHEN });
      return;
    }

    const fehler = url.searchParams.get('error');
    if (fehler) {
      // Der haeufigste Fall ist `access_denied` — jemand hat abgebrochen. Das
      // ist kein Fehler, sondern eine Entscheidung.
      protokoll?.schreib?.('fremd_rueckweg', { anbieter: 'google', ergebnis: 'abbruch' });
      umleitung(antwort, rueckkehrZiel(eintrag.sprache, { anmeldung: 'abgebrochen' }), { 'set-cookie': BINDUNG_LOESCHEN });
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) throw new FremdFehler('code_fehlt', 400);

    const token = await tauscheCode(code, eintrag.verifizierer);
    const anspruch = await pruefeIdToken(token.id_token, {
      jwks,
      jwksAdresse: ziele.jwks,
      iss: ziele.iss,
      aud: einst.google.kennung,
      nonce: eintrag.nonce,
      verfahren: ['RS256'],
    });

    const ergebnis = await verknuepfeAnbieterkennung({
      speicher,
      protokoll,
      anbieter: 'google',
      sub: anspruch.sub,
      adresse: anspruch.email ?? null,
      adresseGeprueft: istGeprueft(anspruch.email_verified),
      daten: {
        // Nur, was die Seite spaeter anzeigen soll. Kein Bild, keine Sprache,
        // kein Domainname — was nicht gebraucht wird, wird nicht gespeichert.
        name: typeof anspruch.name === 'string' ? anspruch.name.slice(0, 120) : null,
      },
      bestehendesKonto: eintrag.verknuepfeMit ?? null,
    });

    if (eintrag.verknuepfeMit) {
      // Beim Verknuepfen laeuft die bestehende Sitzung weiter. Ein neues
      // Plaetzchen waere ueberfluessig und wuerde die Sitzung ohne Not drehen.
      umleitung(antwort, rueckkehrZiel(eintrag.sprache, { verknuepfung: 'google' }), { 'set-cookie': BINDUNG_LOESCHEN });
      return;
    }

    const neu = await sitzung.erzeuge(ergebnis.kontoId);
    umleitung(
      antwort,
      rueckkehrZiel(eintrag.sprache, { anmeldung: ergebnis.neu ? 'neu' : 'ok' }),
      // Zwei Plaetzchen: die frische Sitzung setzen, die Bindung wegraeumen.
      { 'set-cookie': [plaetzchenKopf(neu.plaetzchen, neu.ablauf), BINDUNG_LOESCHEN] },
    );
  }

  async function tauscheCode(code, verifizierer) {
    const rumpf = new URLSearchParams({
      client_id: einst.google.kennung,
      client_secret: einst.google.geheimnis,
      code,
      code_verifier: verifizierer,
      grant_type: 'authorization_code',
      // Muss wortgleich mit der Adresse beim Start sein, sonst lehnt Google ab.
      redirect_uri: rueckadresse,
    });

    let antwort;
    try {
      antwort = await holer(ziele.token, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: rumpf.toString(),
        // Ohne Zeitgrenze haengt eine Anfrage im schlechtesten Fall, bis der
        // Browser aufgibt — und der Container haelt so lange Speicher fest.
        signal: AbortSignal.timeout(10_000),
      });
    } catch (f) {
      throw new FremdFehler('token_tausch_nicht_erreichbar', 502, { ursache: f?.message });
    }

    if (!antwort.ok) {
      /*
        Der Fehlertext von Google wird NICHT weitergereicht. Er enthaelt
        gelegentlich den Code oder Teile der Anfrage, und beides gehoert weder
        in eine Antwort an den Browser noch ins Protokoll.
      */
      throw new FremdFehler('token_tausch_abgelehnt', 502, { status: antwort.status });
    }

    const daten = await antwort.json();
    if (!daten || typeof daten.id_token !== 'string') throw new FremdFehler('id_token_fehlt', 502);
    return daten;
  }

  return {
    routen: [
      { methode: 'GET', pfad: '/api/google/start', behandler: start },
      { methode: 'GET', pfad: '/api/google/zurueck', behandler: zurueck },
      // Nicht in der Endpunktliste, aber die Kehrseite von Nummer 9: Wer
      // verknuepfen kann, muss auch loesen koennen — mit derselben Sperre.
      {
        methode: 'DELETE',
        pfad: '/api/google/verknuepfung',
        behandler: baueLoeseVerknuepfung({ speicher, sitzung, protokoll, einst, anbieter: 'google' }),
      },
    ],
    _intern: { tauscheCode, rueckadresse },
  };
}
