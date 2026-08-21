/*
  IYAMBAE FM — Tests fuer Fremdanmeldung und Passkeys.

  Was hier geprueft wird, ist bewusst NICHT "funktioniert der Normalfall".
  Der Normalfall faellt beim ersten Klick auf. Geprueft wird, was NICHT
  passieren darf — die Faelle, die im Betrieb nie auftreten, bis sie einmal
  auftreten und dann jemandem sein Konto kosten.

  Der Kern (speicher, sitzung, protokoll) wird durch Attrappen ersetzt. Die
  Schnittstelle dazu ist abgesprochen und steht in FREMDANMELDUNG.md; wenn der
  Kern sie aendert, brechen diese Tests, und das ist die Absicht.

  @simplewebauthn/server wird ebenfalls durch eine Attrappe ersetzt. Diese
  Tests pruefen nicht die Kryptografie der Bibliothek — die ist geprueft —,
  sondern das, was drumherum entschieden wird: Besitz, Zaehler, letzter Weg.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

import {
  FremdFehler,
  JwksSpeicher,
  Zustandsspeicher,
  b64u,
  erzeugePkce,
  gleichSicher,
  istGeprueft,
  istWeiterleitungsadresse,
  lesPlaetzchen,
  leseUmgebung,
  normalisiereAdresse,
  pruefeIdToken,
  pruefeUrsprung,
  rueckkehrZiel,
  saubereSprache,
  verknuepfeAnbieterkennung,
  zaehleAnmeldewege,
} from '../src/fremd.mjs';

import { APPLE, APPLE_HOECHSTLAUFZEIT_S, baueClientGeheimnis, erzeugeApple, erzeugeGeheimnisvorrat, leseErstangaben } from '../src/apple.mjs';
import { erzeugeGoogle } from '../src/google.mjs';
import { erzeugePasskey, normalisiereAnlegen, saubererName, waehleAnzeigenamen } from '../src/passkey.mjs';

// ════════════════════════════════════════════════════════════════════
//  Attrappen
// ════════════════════════════════════════════════════════════════════

function fakeSpeicher() {
  const konten = new Map(); // kontoId -> [{art, wert, daten}]
  const verweise = new Map(); // "art|wert" -> kontoId
  let zaehler = 0;

  return {
    konten,
    verweise,
    async findeKontoUeberKennung(art, wert) {
      return verweise.get(`${art}|${wert}`) ?? null;
    },
    async legeKontoAn({ kennungen = [] } = {}) {
      const id = `konto${++zaehler}`;
      konten.set(id, []);
      for (const k of kennungen) await this.verknuepfeKennung(id, k.art, k.wert, k.daten);
      return id;
    },
    async verknuepfeKennung(kontoId, art, wert, daten = {}) {
      const liste = konten.get(kontoId) ?? [];
      konten.set(kontoId, liste);
      const vorhanden = liste.find((k) => k.art === art && k.wert === wert);
      if (vorhanden) vorhanden.daten = daten;
      else liste.push({ art, wert, daten });
      verweise.set(`${art}|${wert}`, kontoId);
    },
    async leseKennungen(kontoId) {
      return (konten.get(kontoId) ?? []).map((k) => ({ ...k, daten: { ...k.daten } }));
    },
    async loescheKennung(kontoId, art, wert) {
      const liste = konten.get(kontoId) ?? [];
      const i = liste.findIndex((k) => k.art === art && k.wert === wert);
      if (i >= 0) liste.splice(i, 1);
      verweise.delete(`${art}|${wert}`);
    },
  };
}

function fakeSitzung(kontoId = null) {
  return {
    erzeugt: [],
    async erzeuge(id) {
      this.erzeugt.push(id);
      return { plaetzchen: `sitzung-${id}`, ablauf: new Date(Date.now() + 86_400_000) };
    },
    async pruefe() {
      return kontoId;
    },
  };
}

function fakeProtokoll() {
  const zeilen = [];
  return {
    zeilen,
    schreib(art, felder) {
      zeilen.push({ art, ...felder });
    },
    hat(art) {
      return zeilen.some((z) => z.art === art);
    },
  };
}

function fakeAnfrage({ method = 'GET', url = '/', headers = {}, rumpf = null } = {}) {
  const strom = Readable.from(rumpf === null ? [] : [Buffer.from(rumpf, 'utf8')]);
  strom.method = method;
  strom.url = url;
  strom.headers = { host: 'iyambae.fm', ...headers };
  return strom;
}

function fakeAntwort() {
  return {
    status: null,
    koepfe: null,
    text: '',
    headersSent: false,
    writeHead(status, koepfe) {
      this.status = status;
      this.koepfe = koepfe ?? {};
      this.headersSent = true;
      return this;
    },
    end(text) {
      if (text !== undefined) this.text = String(text);
    },
    get json() {
      return this.text ? JSON.parse(this.text) : null;
    },
    get ort() {
      return this.koepfe?.location ?? null;
    },
    // Alle gesetzten Plaetzchen, egal ob der Behandler eines oder mehrere
    // geschickt hat.
    get alleKekse() {
      return [].concat(this.koepfe?.['set-cookie'] ?? []);
    },
    // Nur das SITZUNGSplaetzchen. Die Bindung wird bei fast jeder Antwort
    // mitgesetzt oder weggeraeumt; wer beides in einen Topf wirft, prueft
    // versehentlich, dass "irgendein Plaetzchen kam" — und das ist keine
    // Aussage ueber eine Anmeldung.
    get plaetzchen() {
      return this.alleKekse.find((k) => k.startsWith('hz_sitzung=')) ?? null;
    },
  };
}

const EINST = leseUmgebung({});

/*
  Die Startantwort setzt das Bindungsplaetzchen. Ein echter Browser schickt es
  beim Rueckweg mit; die Tests muessen dasselbe tun, sonst pruefen sie nur noch,
  dass der Riegel klemmt.
*/
function bindungAus(antwort) {
  const koepfe = [].concat(antwort.koepfe?.['set-cookie'] ?? []);
  const treffer = koepfe.find((k) => k.startsWith('hz_anmeldung='));
  assert.ok(treffer, 'der Start muss eine Bindung setzen');
  return treffer.split(';')[0];
}

// ── Schluessel und Tokens fuer die JWT-Tests ──────────────────────

function rsaPaar() {
  return crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
}

function jwkVon(oeffentlich, kid, alg) {
  return { ...oeffentlich.export({ format: 'jwk' }), kid, alg, use: 'sig' };
}

function baueJwt(kopf, rumpf, privat) {
  const daten = `${b64u(JSON.stringify(kopf))}.${b64u(JSON.stringify(rumpf))}`;
  const unterschrift = kopf.alg === 'ES256'
    ? crypto.sign('sha256', Buffer.from(daten, 'utf8'), { key: privat, dsaEncoding: 'ieee-p1363' })
    : crypto.sign('sha256', Buffer.from(daten, 'utf8'), privat);
  return `${daten}.${b64u(unterschrift)}`;
}

const JWKS_ADRESSE = 'https://beispiel.test/jwks';
const ISS = 'https://accounts.google.com';
const AUD = 'unsere-kennung.apps.googleusercontent.com';

function gueltigerRumpf(zusatz = {}) {
  const jetzt = Math.floor(Date.now() / 1000);
  return { iss: ISS, aud: AUD, sub: 'sub-1', exp: jetzt + 300, iat: jetzt, nonce: 'nonce-1', ...zusatz };
}

/*
  Ein Holer, der eine JWKS ausliefert und mitzaehlt, wie oft er gefragt wurde.
  `fehler` laesst ihn scheitern — so laesst sich pruefen, was bei einem Ausfall
  passiert, ohne das Netz zu bemuehen.
*/
function jwksHoler(schluesselsatz) {
  const zustand = { anfragen: 0, fehler: false, satz: schluesselsatz };
  const holer = async () => {
    zustand.anfragen += 1;
    if (zustand.fehler) throw new Error('netz kaputt');
    return { ok: true, status: 200, async json() { return { keys: zustand.satz }; } };
  };
  holer.zustand = zustand;
  return holer;
}

// ════════════════════════════════════════════════════════════════════
//  PKCE, state, Kleinkram
// ════════════════════════════════════════════════════════════════════

test('PKCE benutzt S256 und der Abgleich ist wirklich der Hashwert', () => {
  const p = erzeugePkce();
  assert.equal(p.verfahren, 'S256');
  // RFC 7636 verlangt 43 bis 128 Zeichen.
  assert.ok(p.verifizierer.length >= 43 && p.verifizierer.length <= 128);
  const erwartet = b64u(crypto.createHash('sha256').update(p.verifizierer).digest());
  assert.equal(p.abgleich, erwartet);
  // Zwei Aufrufe duerfen nie denselben Wert liefern.
  assert.notEqual(p.verifizierer, erzeugePkce().verifizierer);
});

test('state ist genau EINMAL gueltig', () => {
  const z = new Zustandsspeicher();
  const s = z.lege({ sprache: 'fr' });
  assert.equal(z.hole(s).sprache, 'fr');
  assert.equal(z.hole(s), null, 'ein zweiter Rueckweg mit demselben state darf nichts finden');
});

test('state laeuft nach zehn Minuten ab', () => {
  let jetzt = 1_000_000;
  const z = new Zustandsspeicher({ uhr: () => jetzt });
  const s = z.lege({ sprache: 'de' });
  jetzt += 10 * 60 * 1000 + 1;
  assert.equal(z.hole(s), null);
});

test('state: erfundene und leere Werte finden nichts', () => {
  const z = new Zustandsspeicher();
  assert.equal(z.hole('ausgedacht'), null);
  assert.equal(z.hole(''), null);
  assert.equal(z.hole(null), null);
  assert.equal(z.hole({ toString: () => 'x' }), null);
});

test('state: die Obergrenze wirft die aeltesten hinaus, nicht die neuesten', () => {
  const z = new Zustandsspeicher({ hoechstzahl: 3 });
  const a = z.lege({ n: 1 });
  z.lege({ n: 2 });
  z.lege({ n: 3 });
  const d = z.lege({ n: 4 });
  assert.equal(z.groesse, 3);
  assert.equal(z.hole(a), null, 'der aelteste ist gefallen');
  assert.equal(z.hole(d).n, 4, 'der neueste lebt');
});

test('saubereSprache laesst nur die sieben Sprachen durch', () => {
  assert.equal(saubereSprache('fr'), 'fr');
  assert.equal(saubereSprache('ja'), 'ja');
  assert.equal(saubereSprache('kl'), 'de');
  assert.equal(saubereSprache('../../etc'), 'de');
  assert.equal(saubereSprache(undefined), 'de');
});

test('rueckkehrZiel kann keine offene Weiterleitung bauen', () => {
  assert.equal(rueckkehrZiel('fr', { anmeldung: 'ok' }), '/fr/?anmeldung=ok');
  // Egal was hereinkommt, heraus kommt ein Pfad auf eigenem Grund.
  for (const boese of ['https://angreifer.test', '//angreifer.test', '\\\\angreifer.test', '../..']) {
    const ziel = rueckkehrZiel(boese);
    assert.equal(ziel, '/de/');
    assert.ok(ziel.startsWith('/') && !ziel.startsWith('//'));
  }
});

test('gleichSicher vergleicht richtig, auch bei unterschiedlicher Laenge', () => {
  assert.equal(gleichSicher('abc', 'abc'), true);
  assert.equal(gleichSicher('abc', 'abd'), false);
  assert.equal(gleichSicher('abc', 'abcd'), false);
  assert.equal(gleichSicher(null, undefined), true); // beide leer
});

test('normalisiereAdresse und die Apple-Weiterleitung', () => {
  assert.equal(normalisiereAdresse('  MICHA@Example.ORG '), 'micha@example.org');
  assert.equal(normalisiereAdresse('keinaffe'), null);
  assert.equal(normalisiereAdresse('a@b'), null, 'ohne Punkt in der Domaene keine Adresse');
  assert.equal(normalisiereAdresse(42), null);
  assert.equal(istWeiterleitungsadresse('xyz@privaterelay.appleid.com'), true);
  assert.equal(istWeiterleitungsadresse('xyz@example.org'), false);
});

test('istGeprueft nimmt nur echtes Ja — auch Apples Zeichenkette', () => {
  assert.equal(istGeprueft(true), true);
  assert.equal(istGeprueft('true'), true);
  assert.equal(istGeprueft('false'), false);
  assert.equal(istGeprueft(1), false);
  assert.equal(istGeprueft(undefined), false);
});

// ════════════════════════════════════════════════════════════════════
//  id_token pruefen
// ════════════════════════════════════════════════════════════════════

test('gueltiges id_token wird angenommen', async () => {
  const { publicKey, privateKey } = rsaPaar();
  const holer = jwksHoler([jwkVon(publicKey, 'k1', 'RS256')]);
  const jwks = new JwksSpeicher({ holer });
  const token = baueJwt({ alg: 'RS256', kid: 'k1' }, gueltigerRumpf(), privateKey);

  const rumpf = await pruefeIdToken(token, { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' });
  assert.equal(rumpf.sub, 'sub-1');
});

test('ANGRIFF: gueltige Signatur, aber falsches aud — abgelehnt', async () => {
  const { publicKey, privateKey } = rsaPaar();
  const holer = jwksHoler([jwkVon(publicKey, 'k1', 'RS256')]);
  const jwks = new JwksSpeicher({ holer });
  /*
    Das Token ist ECHT von diesem Aussteller signiert — nur eben fuer eine
    andere App ausgestellt. Wer aud nicht prueft, laesst jeden herein, der
    irgendwo eine App bei demselben Anbieter betreibt.
  */
  const token = baueJwt({ alg: 'RS256', kid: 'k1' }, gueltigerRumpf({ aud: 'fremde-app.apps.googleusercontent.com' }), privateKey);

  await assert.rejects(
    () => pruefeIdToken(token, { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' }),
    (f) => f instanceof FremdFehler && f.code === 'aud_falsch' && f.status === 401,
  );
});

test('aud als Liste ohne passendes azp — abgelehnt', async () => {
  const { publicKey, privateKey } = rsaPaar();
  const jwks = new JwksSpeicher({ holer: jwksHoler([jwkVon(publicKey, 'k1', 'RS256')]) });
  const token = baueJwt({ alg: 'RS256', kid: 'k1' }, gueltigerRumpf({ aud: [AUD, 'noch-eine'], azp: 'noch-eine' }), privateKey);
  await assert.rejects(
    () => pruefeIdToken(token, { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' }),
    (f) => f.code === 'azp_falsch',
  );
});

test('falsches iss, falsche nonce, abgelaufen — jeweils abgelehnt', async () => {
  const { publicKey, privateKey } = rsaPaar();
  const jwks = new JwksSpeicher({ holer: jwksHoler([jwkVon(publicKey, 'k1', 'RS256')]) });
  const grund = { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' };

  const faelle = [
    [gueltigerRumpf({ iss: 'https://angreifer.test' }), 'iss_falsch'],
    [gueltigerRumpf({ nonce: 'andere' }), 'nonce_falsch'],
    [gueltigerRumpf({ nonce: undefined }), 'nonce_falsch'],
    [gueltigerRumpf({ exp: Math.floor(Date.now() / 1000) - 3600 }), 'token_abgelaufen'],
    [gueltigerRumpf({ exp: undefined }), 'token_abgelaufen'],
    [gueltigerRumpf({ sub: '' }), 'sub_fehlt'],
  ];
  for (const [rumpf, code] of faelle) {
    const token = baueJwt({ alg: 'RS256', kid: 'k1' }, rumpf, privateKey);
    await assert.rejects(() => pruefeIdToken(token, grund), (f) => f.code === code, `erwartet: ${code}`);
  }
});

test('ANGRIFF: alg "none" — abgelehnt', async () => {
  const jwks = new JwksSpeicher({ holer: jwksHoler([]) });
  const kopf = b64u(JSON.stringify({ alg: 'none', kid: 'k1' }));
  const rumpf = b64u(JSON.stringify(gueltigerRumpf()));
  await assert.rejects(
    () => pruefeIdToken(`${kopf}.${rumpf}.`, { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' }),
    (f) => f.code === 'alg_nicht_erlaubt',
  );
});

test('ANGRIFF: HS256 mit dem oeffentlichen Schluessel als Geheimnis — abgelehnt', async () => {
  /*
    Der Klassiker. Der Angreifer kennt den oeffentlichen Schluessel (er steht
    in der JWKS), signiert damit per HMAC und behauptet im Kopf, es sei HS256.
    Eine Bibliothek, die das Verfahren aus dem Kopf uebernimmt, prueft
    anschliessend gegen genau dieses Geheimnis und sagt Ja.
  */
  const { publicKey } = rsaPaar();
  const jwks = new JwksSpeicher({ holer: jwksHoler([jwkVon(publicKey, 'k1', 'RS256')]) });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const daten = `${b64u(JSON.stringify({ alg: 'HS256', kid: 'k1' }))}.${b64u(JSON.stringify(gueltigerRumpf()))}`;
  const hmac = crypto.createHmac('sha256', pem).update(daten).digest();

  await assert.rejects(
    () => pruefeIdToken(`${daten}.${b64u(hmac)}`, { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' }),
    (f) => f.code === 'alg_nicht_erlaubt',
  );
});

test('ANGRIFF: mit einem fremden Schluessel signiert — abgelehnt', async () => {
  const echt = rsaPaar();
  const fremd = rsaPaar();
  const jwks = new JwksSpeicher({ holer: jwksHoler([jwkVon(echt.publicKey, 'k1', 'RS256')]) });
  const token = baueJwt({ alg: 'RS256', kid: 'k1' }, gueltigerRumpf(), fremd.privateKey);
  await assert.rejects(
    () => pruefeIdToken(token, { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' }),
    (f) => f.code === 'unterschrift_falsch',
  );
});

test('ANGRIFF: Rumpf nachtraeglich geaendert — abgelehnt', async () => {
  const { publicKey, privateKey } = rsaPaar();
  const jwks = new JwksSpeicher({ holer: jwksHoler([jwkVon(publicKey, 'k1', 'RS256')]) });
  const token = baueJwt({ alg: 'RS256', kid: 'k1' }, gueltigerRumpf({ sub: 'sub-harmlos' }), privateKey);
  const [k, , s] = token.split('.');
  const gefaelscht = `${k}.${b64u(JSON.stringify(gueltigerRumpf({ sub: 'sub-opfer' })))}.${s}`;
  await assert.rejects(
    () => pruefeIdToken(gefaelscht, { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' }),
    (f) => f.code === 'unterschrift_falsch',
  );
});

test('unbekannte kid loest genau eine Erneuerung aus, dann geht es', async () => {
  const alt = rsaPaar();
  const neu = rsaPaar();
  const holer = jwksHoler([jwkVon(alt.publicKey, 'alt', 'RS256')]);
  let jetzt = 1_000_000;
  const jwks = new JwksSpeicher({ holer, uhr: () => jetzt });
  const grund = { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' };

  await pruefeIdToken(baueJwt({ alg: 'RS256', kid: 'alt' }, gueltigerRumpf(), alt.privateKey), grund);
  assert.equal(holer.zustand.anfragen, 1);

  // Der Anbieter hat gedreht. Neue kid, neuer Schluessel.
  holer.zustand.satz = [jwkVon(neu.publicKey, 'neu', 'RS256')];
  jetzt += 61_000; // die Bremse ist abgelaufen
  const rumpf = await pruefeIdToken(baueJwt({ alg: 'RS256', kid: 'neu' }, gueltigerRumpf(), neu.privateKey), grund);
  assert.equal(rumpf.sub, 'sub-1');
  assert.equal(holer.zustand.anfragen, 2, 'genau eine Erneuerung, nicht mehr');
});

test('erfundene kid im Sekundentakt bringt den Anbieter nicht zum Gluehen', async () => {
  const { publicKey, privateKey } = rsaPaar();
  const holer = jwksHoler([jwkVon(publicKey, 'k1', 'RS256')]);
  let jetzt = 1_000_000;
  const jwks = new JwksSpeicher({ holer, uhr: () => jetzt });
  const grund = { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' };

  await pruefeIdToken(baueJwt({ alg: 'RS256', kid: 'k1' }, gueltigerRumpf(), privateKey), grund);
  assert.equal(holer.zustand.anfragen, 1);

  for (let i = 0; i < 25; i += 1) {
    jetzt += 100; // eine Zehntelsekunde
    await assert.rejects(
      () => pruefeIdToken(baueJwt({ alg: 'RS256', kid: `erfunden-${i}` }, gueltigerRumpf(), privateKey), grund),
      (f) => f.code === 'unbekannter_schluessel',
    );
  }
  assert.equal(holer.zustand.anfragen, 1, '25 Angriffe, keine einzige zusaetzliche Abfrage');
});

test('JWKS faellt aus, aber wir haben noch Schluessel — die Anmeldung laeuft weiter', async () => {
  const { publicKey, privateKey } = rsaPaar();
  const holer = jwksHoler([jwkVon(publicKey, 'k1', 'RS256')]);
  let jetzt = 1_000_000;
  const jwks = new JwksSpeicher({ holer, uhr: () => jetzt });
  const grund = { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' };

  await pruefeIdToken(baueJwt({ alg: 'RS256', kid: 'k1' }, gueltigerRumpf(), privateKey), grund);

  holer.zustand.fehler = true;
  jetzt += 7 * 60 * 60 * 1000; // aelter als hoechstalterMs, es wird erneuert versucht
  const rumpf = await pruefeIdToken(baueJwt({ alg: 'RS256', kid: 'k1' }, gueltigerRumpf(), privateKey), grund);
  assert.equal(rumpf.sub, 'sub-1', 'alter Schluessel ist immer noch ein echter Schluessel');
});

test('JWKS faellt aus und wir haben nichts — 503, nicht 401', async () => {
  const holer = jwksHoler([]);
  holer.zustand.fehler = true;
  const jwks = new JwksSpeicher({ holer });
  const { privateKey } = rsaPaar();
  await assert.rejects(
    () => pruefeIdToken(baueJwt({ alg: 'RS256', kid: 'k1' }, gueltigerRumpf(), privateKey), {
      jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1',
    }),
    // 503 heisst: unser Problem. 401 hiesse: dein Problem. Der Unterschied
    // entscheidet, ob jemand seine Anmeldedaten fuer kaputt haelt.
    (f) => f.code === 'jwks_nicht_erreichbar' && f.status === 503,
  );
});

test('ES256 wird ebenso geprueft wie RS256', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwks = new JwksSpeicher({ holer: jwksHoler([jwkVon(publicKey, 'e1', 'ES256')]) });
  const token = baueJwt({ alg: 'ES256', kid: 'e1' }, gueltigerRumpf(), privateKey);
  const rumpf = await pruefeIdToken(token, { jwks, jwksAdresse: JWKS_ADRESSE, iss: ISS, aud: AUD, nonce: 'nonce-1' });
  assert.equal(rumpf.sub, 'sub-1');
});

// ════════════════════════════════════════════════════════════════════
//  Kontoverknuepfung — die gefaehrlichste Stelle
// ════════════════════════════════════════════════════════════════════

test('bekannter sub fuehrt immer in dasselbe Konto', async () => {
  const speicher = fakeSpeicher();
  const protokoll = fakeProtokoll();
  const erst = await verknuepfeAnbieterkennung({
    speicher, protokoll, anbieter: 'google', sub: 'g-1', adresse: 'a@example.org', adresseGeprueft: true,
  });
  const zweit = await verknuepfeAnbieterkennung({
    speicher, protokoll, anbieter: 'google', sub: 'g-1', adresse: 'ganz@andere.org', adresseGeprueft: true,
  });
  assert.equal(zweit.kontoId, erst.kontoId, 'die Adresse aendert nichts, der sub entscheidet');
  assert.equal(zweit.neu, false);
});

test('UEBERNAHME-VERSUCH: ungepruefte Anbieteradresse auf ein bestehendes Konto — neues Konto', async () => {
  const speicher = fakeSpeicher();
  const protokoll = fakeProtokoll();

  // Das Opfer: bestaetigte Adresse, ordentliches Konto.
  const opfer = await speicher.legeKontoAn({
    kennungen: [{ art: 'mail', wert: 'opfer@example.org', daten: { adresse: 'opfer@example.org', bestaetigtAm: '2026-01-01T00:00:00Z' } }],
  });

  /*
    Der Angreifer meldet sich bei einem Anbieter an, der Adressen NICHT prueft,
    und traegt dort die Adresse des Opfers ein. email_verified bleibt aus.
  */
  const ergebnis = await verknuepfeAnbieterkennung({
    speicher, protokoll, anbieter: 'google', sub: 'angreifer-sub',
    adresse: 'opfer@example.org', adresseGeprueft: false,
  });

  assert.notEqual(ergebnis.kontoId, opfer, 'das fremde Konto bleibt fremd');
  assert.equal(ergebnis.neu, true);
  // Und die Adresse bleibt beim Opfer.
  assert.equal(await speicher.findeKontoUeberKennung('mail', 'opfer@example.org'), opfer);
  const angreiferKennungen = await speicher.leseKennungen(ergebnis.kontoId);
  assert.equal(angreiferKennungen.filter((k) => k.art === 'mail').length, 0, 'das neue Konto beansprucht die Adresse nicht');
});

test('UEBERNAHME-VERSUCH: Anbieter prueft, aber der Bestand ist unbestaetigt — neues Konto', async () => {
  const speicher = fakeSpeicher();
  const protokoll = fakeProtokoll();
  /*
    Die Gegenrichtung: Jemand hat sich irgendwann mit einer fremden Adresse
    registriert und sie nie bestaetigt. Wuerde jetzt angeschlossen, bekaeme der
    rechtmaessige Inhaber der Adresse dessen Konto — mitsamt allem, was darin
    steht.
  */
  const unbestaetigt = await speicher.legeKontoAn({
    kennungen: [{ art: 'mail', wert: 'strittig@example.org', daten: { adresse: 'strittig@example.org' } }],
  });

  const ergebnis = await verknuepfeAnbieterkennung({
    speicher, protokoll, anbieter: 'google', sub: 'g-neu',
    adresse: 'strittig@example.org', adresseGeprueft: true,
  });

  assert.notEqual(ergebnis.kontoId, unbestaetigt);
  assert.equal(ergebnis.neu, true);
  assert.ok(protokoll.hat('fremd_getrennt_gehalten'));
});

test('BEIDE Seiten geprueft — jetzt darf angeschlossen werden', async () => {
  const speicher = fakeSpeicher();
  const protokoll = fakeProtokoll();
  const bestand = await speicher.legeKontoAn({
    kennungen: [{ art: 'mail', wert: 'micha@example.org', daten: { adresse: 'micha@example.org', bestaetigtAm: '2026-01-01T00:00:00Z' } }],
  });

  const ergebnis = await verknuepfeAnbieterkennung({
    speicher, protokoll, anbieter: 'google', sub: 'g-7',
    adresse: 'micha@example.org', adresseGeprueft: true,
  });

  assert.equal(ergebnis.kontoId, bestand);
  assert.equal(ergebnis.angeschlossen, true);
  assert.equal(ergebnis.neu, false);
  const kennungen = await speicher.leseKennungen(bestand);
  assert.ok(kennungen.some((k) => k.art === 'google' && k.wert === 'g-7'));
});

test('erstes Konto ueberhaupt: gepruefte Adresse wird als Kennung beansprucht', async () => {
  const speicher = fakeSpeicher();
  const ergebnis = await verknuepfeAnbieterkennung({
    speicher, protokoll: fakeProtokoll(), anbieter: 'apple', sub: 'a-1',
    adresse: 'Neu@Example.ORG', adresseGeprueft: true,
  });
  const kennungen = await speicher.leseKennungen(ergebnis.kontoId);
  const mail = kennungen.find((k) => k.art === 'mail');
  assert.equal(mail.wert, 'neu@example.org', 'kleingeschrieben abgelegt');
  assert.ok(mail.daten.bestaetigtAm, 'der Anbieter hat geprueft, also gilt sie als bestaetigt');
  assert.equal(mail.daten.quelle, 'apple');
});

test('ungepruefte Adresse wird nie als Kennung beansprucht', async () => {
  const speicher = fakeSpeicher();
  const ergebnis = await verknuepfeAnbieterkennung({
    speicher, protokoll: fakeProtokoll(), anbieter: 'google', sub: 'g-9',
    adresse: 'lose@example.org', adresseGeprueft: false,
  });
  const kennungen = await speicher.leseKennungen(ergebnis.kontoId);
  assert.equal(kennungen.filter((k) => k.art === 'mail').length, 0);
  // Als blosse Angabe darf sie mitfahren, aber als ungeprueft gekennzeichnet.
  const anbieter = kennungen.find((k) => k.art === 'google');
  assert.equal(anbieter.daten.adresse, 'lose@example.org');
  assert.equal(anbieter.daten.adresseGeprueft, false);
});

test('Zusammenfuehren aus der Sitzung: Anbieterkennung eines anderen wird NICHT weggenommen', async () => {
  const speicher = fakeSpeicher();
  const protokoll = fakeProtokoll();
  const fremdesKonto = await speicher.legeKontoAn({ kennungen: [{ art: 'google', wert: 'g-fremd', daten: {} }] });
  const meins = await speicher.legeKontoAn({ kennungen: [{ art: 'passkey', wert: 'p-1', daten: {} }] });

  await assert.rejects(
    () => verknuepfeAnbieterkennung({
      speicher, protokoll, anbieter: 'google', sub: 'g-fremd', bestehendesKonto: meins,
    }),
    (f) => f instanceof FremdFehler && f.code === 'kennung_gehoert_anderem_konto' && f.status === 409,
  );
  assert.equal(await speicher.findeKontoUeberKennung('google', 'g-fremd'), fremdesKonto);
});

test('Zusammenfuehren aus der Sitzung: der eigene neue Weg wird angeschlossen', async () => {
  const speicher = fakeSpeicher();
  const meins = await speicher.legeKontoAn({ kennungen: [{ art: 'passkey', wert: 'p-1', daten: {} }] });
  const ergebnis = await verknuepfeAnbieterkennung({
    speicher, protokoll: fakeProtokoll(), anbieter: 'apple', sub: 'a-neu', bestehendesKonto: meins,
    // Ganz andere Adresse als im Konto. Beim Zusammenfuehren spielt sie keine
    // Rolle: Der Nachweis ist die laufende Sitzung, nicht die Adresse.
    adresse: 'irgendwas@example.org', adresseGeprueft: false,
  });
  assert.equal(ergebnis.kontoId, meins);
  assert.equal(ergebnis.angeschlossen, true);
});

test('sub fehlt oder ist leer — abgelehnt', async () => {
  const speicher = fakeSpeicher();
  for (const sub of ['', null, undefined, 42]) {
    await assert.rejects(
      () => verknuepfeAnbieterkennung({ speicher, protokoll: fakeProtokoll(), anbieter: 'google', sub }),
      (f) => f.code === 'sub_fehlt',
    );
  }
});

test('Anmeldewege werden richtig gezaehlt', () => {
  assert.equal(zaehleAnmeldewege([]), 0);
  assert.equal(zaehleAnmeldewege([{ art: 'mail', wert: 'a@b.c', daten: {} }]), 0, 'unbestaetigte Adresse traegt keine Anmeldung');
  assert.equal(zaehleAnmeldewege([{ art: 'mail', wert: 'a@b.c', daten: { bestaetigtAm: 'x' } }]), 1);
  assert.equal(zaehleAnmeldewege([
    { art: 'passkey', wert: 'p1', daten: {} },
    { art: 'google', wert: 'g1', daten: {} },
    { art: 'platten', wert: 'x', daten: {} },
  ]), 2, 'die Merkliste ist kein Anmeldeweg');
});

test('Protokollzeilen tragen keinen Personenbezug', async () => {
  const speicher = fakeSpeicher();
  const protokoll = fakeProtokoll();
  await verknuepfeAnbieterkennung({
    speicher, protokoll, anbieter: 'google', sub: 'geheimer-sub-12345',
    adresse: 'micha@example.org', adresseGeprueft: true,
  });
  const alles = JSON.stringify(protokoll.zeilen);
  assert.ok(!alles.includes('micha@example.org'), 'keine Adresse im Protokoll');
  assert.ok(!alles.includes('geheimer-sub-12345'), 'kein sub im Protokoll');
  const erlaubt = new Set(['art', 'anbieter', 'kontoId', 'ergebnis']);
  for (const zeile of protokoll.zeilen) {
    for (const feld of Object.keys(zeile)) {
      assert.ok(erlaubt.has(feld), `unerlaubtes Protokollfeld: ${feld}`);
    }
  }
});

// ════════════════════════════════════════════════════════════════════
//  Apple
// ════════════════════════════════════════════════════════════════════

function appleSchluessel() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, pem: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}

const APPLE_EINST = {
  teamId: 'TEAM123456',
  keyId: 'KEY7654321',
  dienstId: 'fm.iyambae.web',
};

test('Apple: das Client-Geheimnis ist ein selbst signiertes ES256-JWT', () => {
  const { publicKey, pem } = appleSchluessel();
  const { geheimnis, ablauf } = baueClientGeheimnis({ ...APPLE_EINST, schluessel: pem });

  const [k, r, s] = geheimnis.split('.');
  const kopf = JSON.parse(Buffer.from(k, 'base64url').toString());
  const rumpf = JSON.parse(Buffer.from(r, 'base64url').toString());

  assert.equal(kopf.alg, 'ES256');
  assert.equal(kopf.kid, APPLE_EINST.keyId, 'kid ist die Key-ID aus dem Portal');
  assert.equal(rumpf.iss, APPLE_EINST.teamId, 'iss ist die TEAM-ID');
  assert.equal(rumpf.sub, APPLE_EINST.dienstId, 'sub ist die SERVICE-ID, nicht die App-ID');
  assert.equal(rumpf.aud, APPLE.geheimnisEmpfaenger);

  // Und die Unterschrift haelt.
  const echt = crypto.verify(
    'sha256',
    Buffer.from(`${k}.${r}`, 'utf8'),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(s, 'base64url'),
  );
  assert.ok(echt);
  assert.equal(ablauf, rumpf.exp);
});

test('Apple: die Laufzeit ist kurz und ueberschreitet Apples sechs Monate nie', () => {
  const { pem } = appleSchluessel();
  const jetzt = Math.floor(Date.now() / 1000);

  const kurz = baueClientGeheimnis({ ...APPLE_EINST, schluessel: pem });
  assert.ok(kurz.ablauf - jetzt <= 1800 + 2, 'Vorgabe ist eine halbe Stunde');

  // Wer eine Ewigkeit verlangt, bekommt Apples Obergrenze und keinen Fehler
  // im Betrieb.
  const gierig = baueClientGeheimnis({ ...APPLE_EINST, schluessel: pem, laufzeitS: 999_999_999 });
  assert.ok(gierig.ablauf - jetzt <= APPLE_HOECHSTLAUFZEIT_S);
});

test('Apple: der Vorrat baut erst neu, wenn es noetig ist — nichts laeuft je ab', () => {
  const { pem } = appleSchluessel();
  let jetzt = 1_700_000_000_000;
  const hole = erzeugeGeheimnisvorrat({
    apple: { ...APPLE_EINST, schluessel: pem },
    laufzeitS: 1800,
    vorlaufS: 120,
    uhr: () => jetzt,
  });

  const a = hole();
  jetzt += 60_000;
  assert.equal(hole(), a, 'innerhalb der Laufzeit dasselbe');

  jetzt += 1800 * 1000; // ueber den Ablauf hinaus
  const b = hole();
  assert.notEqual(b, a, 'danach ein frisches — ohne dass jemand etwas erneuern muss');
});

test('Apple: unbrauchbarer .p8-Schluessel scheitert mit klarer Ursache, nicht mit invalid_client', () => {
  assert.throws(
    () => baueClientGeheimnis({ ...APPLE_EINST, schluessel: 'das ist keine PEM-Datei' }),
    (f) => f instanceof FremdFehler && f.code === 'apple_schluessel_unlesbar' && f.status === 501,
  );
  // Ein RSA-Schluessel statt EC ist der zweithaeufigste Griff daneben.
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(
    () => baueClientGeheimnis({ ...APPLE_EINST, schluessel: rsa }),
    (f) => f.code === 'apple_schluessel_falscher_typ',
  );
  assert.throws(
    () => baueClientGeheimnis({ ...APPLE_EINST, schluessel: '' }),
    (f) => f.code === 'apple_nicht_eingerichtet',
  );
});

test('Apple: das user-Feld wird gelesen, aber nie geglaubt', () => {
  const gut = leseErstangaben(JSON.stringify({ name: { firstName: 'Micha', lastName: 'Fricke' }, email: 'X@Example.ORG' }));
  assert.equal(gut.name, 'Micha Fricke');
  assert.equal(gut.adresse, 'x@example.org');

  // Kaputt heisst leer, nicht Absturz.
  for (const boese of ['{kaputt', '', null, 'null', '[]', JSON.stringify({ name: 'kein objekt' })]) {
    const r = leseErstangaben(boese);
    assert.equal(r.name, null, `sollte leer sein: ${boese}`);
  }
  // Ein riesiges Feld wird gar nicht erst zerlegt.
  assert.deepEqual(leseErstangaben('x'.repeat(5000)), { name: null, adresse: null });
  // Und ein sehr langer Name wird gekuerzt.
  const lang = leseErstangaben(JSON.stringify({ name: { firstName: 'a'.repeat(500), lastName: '' } }));
  assert.equal(lang.name.length, 120);
});

test('Apple: der Rueckweg ist POST, nicht GET', () => {
  const apple = erzeugeApple({
    speicher: fakeSpeicher(), sitzung: fakeSitzung(), protokoll: fakeProtokoll(),
    einst: { ...EINST, apple: { ...APPLE_EINST, schluessel: appleSchluessel().pem } },
    zustand: new Zustandsspeicher(), jwks: new JwksSpeicher(),
  });
  const rueckweg = apple.routen.filter((r) => r.pfad === '/api/apple/zurueck');
  assert.equal(rueckweg.length, 1);
  assert.equal(rueckweg[0].methode, 'POST', 'Apple antwortet per form_post — ein GET-Weg waere ein 404 im Betrieb');
  assert.ok(apple.routen.some((r) => r.pfad === '/api/apple/start' && r.methode === 'GET'));
});

/*
  Ein vollstaendiger Apple-Rueckweg mit echten Schluesseln: Start, Codetausch,
  Tokenpruefung, Kontoanlage — und dann derselbe state ein zweites Mal.
*/
async function appleAufbau({ email = 'apple@example.org', emailGeprueft = 'true', sub = 'apple-sub-1' } = {}) {
  const rsa = rsaPaar();
  const speicher = fakeSpeicher();
  const sitzung = fakeSitzung();
  const protokoll = fakeProtokoll();
  const zustand = new Zustandsspeicher();
  const holerJwks = jwksHoler([jwkVon(rsa.publicKey, 'apple-k1', 'RS256')]);
  const jwks = new JwksSpeicher({ holer: holerJwks });
  const einst = { ...EINST, apple: { ...APPLE_EINST, schluessel: appleSchluessel().pem } };

  const zaehler = { tausch: 0 };
  const holer = async (adresse) => {
    if (adresse === APPLE.token) {
      zaehler.tausch += 1;
      const jetzt = Math.floor(Date.now() / 1000);
      const id = baueJwt(
        { alg: 'RS256', kid: 'apple-k1' },
        {
          iss: 'https://appleid.apple.com',
          aud: APPLE_EINST.dienstId,
          sub,
          exp: jetzt + 300,
          iat: jetzt,
          nonce: zaehler.nonce,
          email,
          email_verified: emailGeprueft,
          is_private_email: 'false',
        },
        rsa.privateKey,
      );
      return { ok: true, status: 200, async json() { return { id_token: id }; } };
    }
    return holerJwks(adresse);
  };

  const apple = erzeugeApple({ speicher, sitzung, protokoll, einst, zustand, jwks, holer });
  return { apple, speicher, sitzung, protokoll, zustand, zaehler };
}

test('Apple: ein vollstaendiger Rueckweg legt ein Konto an und setzt ein Plaetzchen', async () => {
  const { apple, speicher, sitzung, zustand, zaehler } = await appleAufbau();

  // Start: die Umleitung muss form_post und PKCE tragen.
  const start = apple.routen.find((r) => r.pfad === '/api/apple/start');
  const a1 = fakeAnfrage({ url: '/api/apple/start?sprache=fr' });
  const r1 = fakeAntwort();
  await start.behandler(a1, r1, { url: new URL('https://iyambae.fm/api/apple/start?sprache=fr') });

  assert.equal(r1.status, 302);
  const ziel = new URL(r1.ort);
  assert.equal(ziel.searchParams.get('response_mode'), 'form_post');
  assert.equal(ziel.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(ziel.searchParams.get('code_challenge'));
  assert.equal(ziel.searchParams.get('scope'), 'name email');
  const state = ziel.searchParams.get('state');
  assert.equal(Buffer.from(state, 'base64url').length, 32, 'state sind 32 Zufallsbytes');

  // Die nonce kennen wir nur ueber den Speicher — die Attrappe muss sie ins
  // Token schreiben, sonst schlaegt die Pruefung zu Recht fehl.
  zaehler.nonce = zustand.eintraege.get(state).nonce;

  const zurueck = apple.routen.find((r) => r.pfad === '/api/apple/zurueck');
  const rumpf = new URLSearchParams({
    code: 'apple-code',
    state,
    user: JSON.stringify({ name: { firstName: 'Sami', lastName: 'Ra' }, email: 'apple@example.org' }),
  }).toString();

  const a2 = fakeAnfrage({
    method: 'POST',
    url: '/api/apple/zurueck',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://appleid.apple.com',
      cookie: bindungAus(r1),
    },
    rumpf,
  });
  const r2 = fakeAntwort();
  await zurueck.behandler(a2, r2, { url: new URL('https://iyambae.fm/api/apple/zurueck') });

  assert.equal(r2.status, 302);
  assert.equal(r2.ort, '/fr/?anmeldung=neu', 'die Sprache kommt aus dem state');
  assert.match(r2.plaetzchen, /^hz_sitzung=sitzung-konto1;/);
  assert.match(r2.plaetzchen, /HttpOnly/);
  assert.match(r2.plaetzchen, /Secure/);
  assert.match(r2.plaetzchen, /SameSite=Lax/);
  assert.equal(sitzung.erzeugt.length, 1);

  // Der Name aus dem einmaligen user-Feld ist angekommen und liegt fest.
  const kennungen = await speicher.leseKennungen('konto1');
  const apfel = kennungen.find((k) => k.art === 'apple');
  assert.equal(apfel.daten.name, 'Sami Ra');
  assert.equal(zaehler.tausch, 1);
});

test('Apple schickt denselben state ein zweites Mal — der zweite prallt ab', async () => {
  const { apple, zustand, zaehler, speicher } = await appleAufbau();

  const start = apple.routen.find((r) => r.pfad === '/api/apple/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/apple/start' }), r1, { url: new URL('https://iyambae.fm/api/apple/start') });
  const state = new URL(r1.ort).searchParams.get('state');
  zaehler.nonce = zustand.eintraege.get(state).nonce;

  const zurueck = apple.routen.find((r) => r.pfad === '/api/apple/zurueck');
  const baue = () => fakeAnfrage({
    method: 'POST',
    url: '/api/apple/zurueck',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: bindungAus(r1) },
    rumpf: new URLSearchParams({ code: 'apple-code', state }).toString(),
  });

  const r2 = fakeAntwort();
  await zurueck.behandler(baue(), r2, { url: new URL('https://iyambae.fm/api/apple/zurueck') });
  assert.equal(r2.ort, '/de/?anmeldung=neu');

  const r3 = fakeAntwort();
  await zurueck.behandler(baue(), r3, { url: new URL('https://iyambae.fm/api/apple/zurueck') });
  assert.equal(r3.status, 302);
  assert.equal(r3.ort, '/?anmeldung=fehler&grund=abgelaufen', 'kein zweites Mal, und keine Auskunft warum');
  assert.equal(r3.plaetzchen, null, 'vor allem: kein zweites Plaetzchen');
  assert.equal(zaehler.tausch, 1, 'der Code wurde kein zweites Mal getauscht');
  assert.equal(speicher.konten.size, 1, 'und kein zweites Konto');
});

test('ANGRIFF: das ungezeichnete user-Feld kann keine fremde Adresse unterschieben', async () => {
  /*
    Der Angreifer haelt einen echten eigenen Apple-Vorgang in der Hand und
    schreibt vor dem Absenden eine fremde Adresse in das user-Feld. Das Feld
    ist nicht signiert — nur das id_token ist es. Wuerde die Verknuepfung dem
    Feld folgen, waere die ganze Regel aus fremd.mjs umgangen.
  */
  const { apple, speicher, zustand, zaehler } = await appleAufbau({ email: 'angreifer@example.org', sub: 'apple-angreifer' });

  const opfer = await speicher.legeKontoAn({
    kennungen: [{ art: 'mail', wert: 'opfer@example.org', daten: { adresse: 'opfer@example.org', bestaetigtAm: '2026-01-01T00:00:00Z' } }],
  });

  const start = apple.routen.find((r) => r.pfad === '/api/apple/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/apple/start' }), r1, { url: new URL('https://iyambae.fm/api/apple/start') });
  const state = new URL(r1.ort).searchParams.get('state');
  zaehler.nonce = zustand.eintraege.get(state).nonce;

  const zurueck = apple.routen.find((r) => r.pfad === '/api/apple/zurueck');
  const r2 = fakeAntwort();
  await zurueck.behandler(
    fakeAnfrage({
      method: 'POST',
      url: '/api/apple/zurueck',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: bindungAus(r1) },
      rumpf: new URLSearchParams({
        code: 'apple-code',
        state,
        user: JSON.stringify({ name: { firstName: 'Wer', lastName: 'Auchimmer' }, email: 'opfer@example.org' }),
      }).toString(),
    }),
    r2,
    { url: new URL('https://iyambae.fm/api/apple/zurueck') },
  );

  assert.equal(r2.status, 302);
  // Das Opferkonto hat keine Apple-Kennung dazubekommen.
  const opferKennungen = await speicher.leseKennungen(opfer);
  assert.equal(opferKennungen.filter((k) => k.art === 'apple').length, 0);
  // Die Anmeldung lief in ein eigenes Konto, gebunden an die GEPRUEFTE Adresse
  // aus dem Token.
  assert.equal(await speicher.findeKontoUeberKennung('apple', 'apple-angreifer'), 'konto2');
  assert.equal(await speicher.findeKontoUeberKennung('mail', 'opfer@example.org'), opfer);
});

test('Apple: falscher Inhaltstyp am Rueckweg wird abgewiesen', async () => {
  const { apple } = await appleAufbau();
  const zurueck = apple.routen.find((r) => r.pfad === '/api/apple/zurueck');
  await assert.rejects(
    () => zurueck.behandler(
      fakeAnfrage({ method: 'POST', url: '/api/apple/zurueck', headers: { 'content-type': 'application/json' }, rumpf: '{}' }),
      fakeAntwort(),
      { url: new URL('https://iyambae.fm/api/apple/zurueck') },
    ),
    (f) => f.code === 'falscher_inhaltstyp' && f.status === 415,
  );
});

// ════════════════════════════════════════════════════════════════════
//  Google
// ════════════════════════════════════════════════════════════════════

function googleAufbau({ sub = 'g-sub-1', email = 'g@example.org', emailVerified = true, sitzungKonto = null } = {}) {
  const rsa = rsaPaar();
  const speicher = fakeSpeicher();
  const sitzung = fakeSitzung(sitzungKonto);
  const protokoll = fakeProtokoll();
  const zustand = new Zustandsspeicher();
  const holerJwks = jwksHoler([jwkVon(rsa.publicKey, 'g-k1', 'RS256')]);
  const jwks = new JwksSpeicher({ holer: holerJwks });
  const einst = { ...EINST, google: { kennung: AUD, geheimnis: 'geheim' } };
  const zaehler = { tausch: 0, nonce: null, letzterRumpf: null };

  const holer = async (adresse, optionen) => {
    if (adresse === 'https://oauth2.googleapis.com/token') {
      zaehler.tausch += 1;
      zaehler.letzterRumpf = new URLSearchParams(optionen.body);
      const jetzt = Math.floor(Date.now() / 1000);
      const id = baueJwt(
        { alg: 'RS256', kid: 'g-k1' },
        { iss: ISS, aud: AUD, sub, exp: jetzt + 300, iat: jetzt, nonce: zaehler.nonce, email, email_verified: emailVerified, name: 'Micha' },
        rsa.privateKey,
      );
      return { ok: true, status: 200, async json() { return { id_token: id, access_token: 'egal' }; } };
    }
    return holerJwks(adresse);
  };

  const google = erzeugeGoogle({ speicher, sitzung, protokoll, einst, zustand, jwks, holer });
  return { google, speicher, sitzung, protokoll, zustand, zaehler };
}

test('Google: der Start fordert nur openid, email und profile', async () => {
  const { google } = googleAufbau();
  const start = google.routen.find((r) => r.pfad === '/api/google/start');
  const r = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/google/start?sprache=ja' }), r, {
    url: new URL('https://iyambae.fm/api/google/start?sprache=ja'),
  });

  const ziel = new URL(r.ort);
  assert.equal(ziel.origin + ziel.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(ziel.searchParams.get('scope'), 'openid email profile');
  assert.equal(ziel.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(ziel.searchParams.get('response_type'), 'code');
  // Kein Refresh-Token anfordern: Wir wollen nur wissen, wer da klickt.
  assert.equal(ziel.searchParams.get('access_type'), 'online');
  assert.ok(ziel.searchParams.get('nonce'));
});

test('Google: der Rueckweg tauscht mit code_verifier und meldet an', async () => {
  const { google, zustand, zaehler, speicher } = googleAufbau();
  const start = google.routen.find((r) => r.pfad === '/api/google/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/google/start?sprache=es' }), r1, {
    url: new URL('https://iyambae.fm/api/google/start?sprache=es'),
  });
  const state = new URL(r1.ort).searchParams.get('state');
  const abgleichGesendet = new URL(r1.ort).searchParams.get('code_challenge');
  zaehler.nonce = zustand.eintraege.get(state).nonce;

  const zurueck = google.routen.find((r) => r.pfad === '/api/google/zurueck');
  const r2 = fakeAntwort();
  await zurueck.behandler(
    fakeAnfrage({ url: `/api/google/zurueck?code=abc&state=${encodeURIComponent(state)}`, headers: { cookie: bindungAus(r1) } }),
    r2,
    { url: new URL(`https://iyambae.fm/api/google/zurueck?code=abc&state=${encodeURIComponent(state)}`) },
  );

  assert.equal(r2.status, 302);
  assert.equal(r2.ort, '/es/?anmeldung=neu');
  assert.ok(r2.plaetzchen);

  // Der gesendete verifier muss zum Abgleich vom Start passen.
  const verifizierer = zaehler.letzterRumpf.get('code_verifier');
  assert.equal(b64u(crypto.createHash('sha256').update(verifizierer).digest()), abgleichGesendet);
  assert.equal(zaehler.letzterRumpf.get('grant_type'), 'authorization_code');
  assert.equal(speicher.konten.size, 1);
});

test('Google: ein Abbruch fuehrt zurueck, ohne Konto und ohne Plaetzchen', async () => {
  const { google, zustand, speicher } = googleAufbau();
  const start = google.routen.find((r) => r.pfad === '/api/google/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/google/start?sprache=it' }), r1, {
    url: new URL('https://iyambae.fm/api/google/start?sprache=it'),
  });
  const state = new URL(r1.ort).searchParams.get('state');
  assert.ok(zustand.eintraege.has(state));

  const zurueck = google.routen.find((r) => r.pfad === '/api/google/zurueck');
  const r2 = fakeAntwort();
  const adresse = `/api/google/zurueck?error=access_denied&state=${encodeURIComponent(state)}`;
  await zurueck.behandler(fakeAnfrage({ url: adresse, headers: { cookie: bindungAus(r1) } }), r2, { url: new URL(`https://iyambae.fm${adresse}`) });

  assert.equal(r2.ort, '/it/?anmeldung=abgebrochen');
  assert.equal(r2.plaetzchen, null);
  assert.equal(speicher.konten.size, 0);
});

test('Google: unbekannter state fuehrt auf /, damit nginx die Sprache waehlt', async () => {
  const { google } = googleAufbau();
  const zurueck = google.routen.find((r) => r.pfad === '/api/google/zurueck');
  const r = fakeAntwort();
  await zurueck.behandler(fakeAnfrage({ url: '/api/google/zurueck?code=x&state=ausgedacht' }), r, {
    url: new URL('https://iyambae.fm/api/google/zurueck?code=x&state=ausgedacht'),
  });
  assert.equal(r.ort, '/?anmeldung=fehler&grund=abgelaufen');
});

test('Google: nicht eingerichtet meldet 501, nicht 500', async () => {
  const google = erzeugeGoogle({
    speicher: fakeSpeicher(), sitzung: fakeSitzung(), protokoll: fakeProtokoll(),
    einst: EINST, zustand: new Zustandsspeicher(), jwks: new JwksSpeicher(),
  });
  const start = google.routen.find((r) => r.pfad === '/api/google/start');
  await assert.rejects(
    () => start.behandler(fakeAnfrage({ url: '/api/google/start' }), fakeAntwort(), { url: new URL('https://iyambae.fm/api/google/start') }),
    (f) => f.code === 'google_nicht_eingerichtet' && f.status === 501,
  );
});

test('Google: Verknuepfen ohne Sitzung ist 401', async () => {
  const { google } = googleAufbau({ sitzungKonto: null });
  const start = google.routen.find((r) => r.pfad === '/api/google/start');
  await assert.rejects(
    () => start.behandler(fakeAnfrage({ url: '/api/google/start?verknuepfen=1' }), fakeAntwort(), {
      url: new URL('https://iyambae.fm/api/google/start?verknuepfen=1'),
    }),
    (f) => f.code === 'nicht_angemeldet' && f.status === 401,
  );
});

test('Google-Verknuepfung loesen: der letzte Anmeldeweg bleibt', async () => {
  const speicher = fakeSpeicher();
  const kontoId = await speicher.legeKontoAn({ kennungen: [{ art: 'google', wert: 'g-1', daten: {} }] });
  const protokoll = fakeProtokoll();
  const google = erzeugeGoogle({
    speicher, sitzung: fakeSitzung(kontoId), protokoll, einst: EINST,
    zustand: new Zustandsspeicher(), jwks: new JwksSpeicher(),
  });
  const loesen = google.routen.find((r) => r.methode === 'DELETE');

  await assert.rejects(
    () => loesen.behandler(fakeAnfrage({ method: 'DELETE', url: '/api/google/verknuepfung', headers: { origin: 'https://iyambae.fm' } }), fakeAntwort(), { treffer: [] }),
    (f) => f.code === 'letzter_anmeldeweg' && f.status === 409,
  );
  assert.equal((await speicher.leseKennungen(kontoId)).length, 1, 'nichts geloescht');

  // Mit einem zweiten Weg geht es.
  await speicher.verknuepfeKennung(kontoId, 'passkey', 'p-1', {});
  const r = fakeAntwort();
  await loesen.behandler(fakeAnfrage({ method: 'DELETE', url: '/api/google/verknuepfung', headers: { origin: 'https://iyambae.fm' } }), r, { treffer: [] });
  assert.equal(r.status, 204);
  assert.equal((await speicher.leseKennungen(kontoId)).filter((k) => k.art === 'google').length, 0);
});

test('ANGRIFF (Anmelde-CSRF): ein fremder Rueckweg im Browser des Opfers meldet niemanden an', async () => {
  /*
    Der Angreifer startet die Anmeldung bei SICH, bricht vor dem letzten Schritt
    ab und haelt ein gueltiges Paar aus `code` und `state`. Dann bringt er das
    Opfer dazu, genau diesen Rueckweg aufzurufen — ein Bild mit dieser Adresse
    genuegt. Ohne Bindung an den Browser saesse das Opfer danach im Konto des
    Angreifers, und alles, was es hoert und merkt, landete dort.
  */
  const { google, zaehler, speicher, zustand } = googleAufbau();
  const start = google.routen.find((r) => r.pfad === '/api/google/start');

  // Der Browser des ANGREIFERS.
  const angreifer = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/google/start' }), angreifer, {
    url: new URL('https://iyambae.fm/api/google/start'),
  });
  const state = new URL(angreifer.ort).searchParams.get('state');
  zaehler.nonce = zustand.eintraege.get(state).nonce;

  // Derselbe Rueckweg, aber im Browser des OPFERS — ohne die Bindung.
  const zurueck = google.routen.find((r) => r.pfad === '/api/google/zurueck');
  const opfer = fakeAntwort();
  const adresse = `/api/google/zurueck?code=abc&state=${encodeURIComponent(state)}`;
  await zurueck.behandler(fakeAnfrage({ url: adresse }), opfer, { url: new URL(`https://iyambae.fm${adresse}`) });

  assert.equal(opfer.status, 302);
  assert.equal(opfer.ort, '/de/?anmeldung=fehler');
  const gesetzt = [].concat(opfer.koepfe['set-cookie'] ?? []);
  assert.ok(!gesetzt.some((k) => k.startsWith('hz_sitzung=')), 'KEINE Sitzung im Browser des Opfers');
  assert.equal(zaehler.tausch, 0, 'der Code wurde nicht einmal getauscht');
  assert.equal(speicher.konten.size, 0);
});

test('ANGRIFF (Anmelde-CSRF): auch bei Apple, wo der Ursprungsschutz fehlt', async () => {
  const { apple, zustand, zaehler, speicher } = await appleAufbau();
  const start = apple.routen.find((r) => r.pfad === '/api/apple/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/apple/start' }), r1, { url: new URL('https://iyambae.fm/api/apple/start') });
  const state = new URL(r1.ort).searchParams.get('state');
  zaehler.nonce = zustand.eintraege.get(state).nonce;

  const zurueck = apple.routen.find((r) => r.pfad === '/api/apple/zurueck');
  const r2 = fakeAntwort();
  await zurueck.behandler(
    fakeAnfrage({
      method: 'POST', url: '/api/apple/zurueck',
      // Kein Bindungsplaetzchen: ein Formular von einer fremden Seite.
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      rumpf: new URLSearchParams({ code: 'apple-code', state }).toString(),
    }),
    r2, { url: new URL('https://iyambae.fm/api/apple/zurueck') },
  );

  assert.equal(r2.ort, '/de/?anmeldung=fehler');
  assert.ok(!(([].concat(r2.koepfe['set-cookie'] ?? [])).some((k) => k.startsWith('hz_sitzung='))));
  assert.equal(zaehler.tausch, 0);
  assert.equal(speicher.konten.size, 0);
});

test('Bindung: ein GEFAELSCHTES Bindungsplaetzchen hilft auch nicht', async () => {
  const { google, zaehler, zustand } = googleAufbau();
  const start = google.routen.find((r) => r.pfad === '/api/google/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/google/start' }), r1, { url: new URL('https://iyambae.fm/api/google/start') });
  const state = new URL(r1.ort).searchParams.get('state');
  zaehler.nonce = zustand.eintraege.get(state).nonce;

  const zurueck = google.routen.find((r) => r.pfad === '/api/google/zurueck');
  const r2 = fakeAntwort();
  const adresse = `/api/google/zurueck?code=abc&state=${encodeURIComponent(state)}`;
  await zurueck.behandler(
    fakeAnfrage({ url: adresse, headers: { cookie: 'hz_anmeldung=ausgedacht; hz_sitzung=egal' } }),
    r2, { url: new URL(`https://iyambae.fm${adresse}`) },
  );
  assert.equal(r2.ort, '/de/?anmeldung=fehler');
  assert.equal(zaehler.tausch, 0);
});

test('Bindung: das Plaetzchen ist HttpOnly, Secure und SameSite=None', async () => {
  const { google } = googleAufbau();
  const start = google.routen.find((r) => r.pfad === '/api/google/start');
  const r = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/google/start' }), r, { url: new URL('https://iyambae.fm/api/google/start') });
  const kopf = [].concat(r.koepfe['set-cookie']).find((k) => k.startsWith('hz_anmeldung='));
  assert.match(kopf, /HttpOnly/);
  assert.match(kopf, /Secure/);
  // None, sonst kaeme es bei Apples ortsfremdem POST nicht mit.
  assert.match(kopf, /SameSite=None/);
  assert.match(kopf, /Path=\/api\//);
  assert.match(kopf, /Max-Age=900/);
});

test('Bindung: nach erfolgreicher Anmeldung wird sie weggeraeumt', async () => {
  const { google, zustand, zaehler } = googleAufbau();
  const start = google.routen.find((r) => r.pfad === '/api/google/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ url: '/api/google/start' }), r1, { url: new URL('https://iyambae.fm/api/google/start') });
  const state = new URL(r1.ort).searchParams.get('state');
  zaehler.nonce = zustand.eintraege.get(state).nonce;

  const zurueck = google.routen.find((r) => r.pfad === '/api/google/zurueck');
  const r2 = fakeAntwort();
  const adresse = `/api/google/zurueck?code=abc&state=${encodeURIComponent(state)}`;
  await zurueck.behandler(
    fakeAnfrage({ url: adresse, headers: { cookie: bindungAus(r1) } }),
    r2, { url: new URL(`https://iyambae.fm${adresse}`) },
  );
  const gesetzt = [].concat(r2.koepfe['set-cookie']);
  assert.ok(gesetzt.some((k) => k.startsWith('hz_sitzung=')), 'die Sitzung kommt');
  assert.ok(gesetzt.some((k) => k.startsWith('hz_anmeldung=') && k.includes('Max-Age=0')), 'die Bindung geht');
});

test('lesPlaetzchen liest genau das richtige und nichts daneben', () => {
  const a = fakeAnfrage({ headers: { cookie: 'a=1; hz_anmeldung=abc; hz_anmeldungX=falsch' } });
  assert.equal(lesPlaetzchen(a, 'hz_anmeldung'), 'abc');
  assert.equal(lesPlaetzchen(a, 'gibtsnicht'), null);
  assert.equal(lesPlaetzchen(fakeAnfrage({}), 'hz_anmeldung'), null);
});

test('Ursprungspruefung: fremder Ursprung wird abgewiesen', () => {
  assert.equal(pruefeUrsprung(fakeAnfrage({ headers: { origin: 'https://www.iyambae.fm' } }), EINST.urspruenge), 'https://www.iyambae.fm');
  assert.throws(
    () => pruefeUrsprung(fakeAnfrage({ headers: { origin: 'https://angreifer.test' } }), EINST.urspruenge),
    (f) => f.code === 'ursprung_falsch' && f.status === 403,
  );
  assert.throws(
    () => pruefeUrsprung(fakeAnfrage({}), EINST.urspruenge),
    (f) => f.code === 'ursprung_fehlt',
  );
  // Ersatzweise der Verweiser, wenn kein Origin da ist.
  assert.equal(
    pruefeUrsprung(fakeAnfrage({ headers: { referer: 'https://iyambae.fm/de/' } }), EINST.urspruenge),
    'https://iyambae.fm',
  );
});

// ════════════════════════════════════════════════════════════════════
//  Passkeys
// ════════════════════════════════════════════════════════════════════

/*
  Die Attrappe fuer @simplewebauthn/server.

  Die Funktionen merken sich ihre Aufrufe ueber eine Abschlussvariable und
  NICHT ueber `this`. Das ist kein Stil, sondern noetig: passkey.mjs holt sie
  einzeln aus dem Modulobjekt heraus (`const { ... } = await bibliothek()`),
  genau wie es bei einem echten ES-Modul der Fall waere — dabei geht jede
  `this`-Bindung verloren. Eine Attrappe mit `this` wuerde also etwas pruefen,
  das es im Betrieb gar nicht gibt.
*/
function fakeWebauthn(ueber = {}) {
  const merk = {};
  const grund = {
    async generateRegistrationOptions(o) {
      merk.letzteAnlegeoptionen = o;
      return { challenge: 'herausforderung-anlegen', rp: { id: o.rpID, name: o.rpName }, excludeCredentials: o.excludeCredentials };
    },
    async generateAuthenticationOptions(o) {
      merk.letzteAnmeldeoptionen = o;
      return { challenge: 'herausforderung-anmelden', allowCredentials: o.allowCredentials, rpId: o.rpID };
    },
    async verifyRegistrationResponse(o) {
      merk.letzteAnlegepruefung = o;
      return {
        verified: true,
        registrationInfo: {
          aaguid: 'aaguid-1',
          credential: { id: o.response?.id ?? 'schluessel-1', publicKey: new Uint8Array([1, 2, 3, 4]), counter: 0, transports: ['internal'] },
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          userVerified: true,
        },
      };
    },
    async verifyAuthenticationResponse(o) {
      merk.letzteAnmeldepruefung = o;
      return {
        verified: true,
        authenticationInfo: {
          credentialID: o.credential.id,
          newCounter: 5,
          userVerified: true,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
        },
      };
    },
  };
  return Object.defineProperties({ ...grund, ...ueber }, {
    letzteAnlegeoptionen: { get: () => merk.letzteAnlegeoptionen },
    letzteAnmeldeoptionen: { get: () => merk.letzteAnmeldeoptionen },
    letzteAnlegepruefung: { get: () => merk.letzteAnlegepruefung },
    letzteAnmeldepruefung: { get: () => merk.letzteAnmeldepruefung },
  });
}

function passkeyAufbau({ kontoId = 'konto1', webauthn = fakeWebauthn(), zaehlerStreng = false } = {}) {
  const speicher = fakeSpeicher();
  const sitzung = fakeSitzung(kontoId);
  const protokoll = fakeProtokoll();
  const passkey = erzeugePasskey({ speicher, sitzung, protokoll, einst: EINST, webauthn, zaehlerStreng });
  const route = (methode, pfad) => passkey.routen.find((r) => r.methode === methode && String(r.pfad) === String(pfad));
  return { passkey, speicher, sitzung, protokoll, webauthn, route };
}

const URSPRUNG = { origin: 'https://iyambae.fm', 'content-type': 'application/json' };

test('Passkey anmelden/start: allowCredentials bleibt LEER', async () => {
  const { passkey, webauthn } = passkeyAufbau();
  const start = passkey.routen.find((r) => r.pfad === '/api/passkey/anmelden/start');
  const r = fakeAntwort();
  await start.behandler(fakeAnfrage({ method: 'POST', url: '/api/passkey/anmelden/start', headers: URSPRUNG }), r, {});

  assert.equal(r.status, 200);
  assert.deepEqual(r.json.optionen.allowCredentials, [], 'sonst muesste man vorher nach dem Namen fragen');
  assert.equal(webauthn.letzteAnmeldeoptionen.rpID, 'iyambae.fm');
  assert.ok(r.json.vorgang, 'die Herausforderung bleibt beim Server, der Browser bekommt nur eine Nummer');
});

test('Passkey anlegen: RP-ID ist die registrierbare Domain, beide Urspruenge gelten', async () => {
  const { passkey, speicher, webauthn } = passkeyAufbau();
  await speicher.legeKontoAn({ kennungen: [{ art: 'mail', wert: 'm@example.org', daten: { bestaetigtAm: 'x' } }] });

  const start = passkey.routen.find((r) => r.pfad === '/api/passkey/anlegen/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ method: 'POST', url: '/api/passkey/anlegen/start', headers: URSPRUNG }), r1, {});
  assert.equal(webauthn.letzteAnlegeoptionen.rpID, 'iyambae.fm');
  assert.equal(webauthn.letzteAnlegeoptionen.authenticatorSelection.residentKey, 'required');

  const fertig = passkey.routen.find((r) => r.pfad === '/api/passkey/anlegen/fertig');
  const r2 = fakeAntwort();
  await fertig.behandler(
    fakeAnfrage({
      method: 'POST', url: '/api/passkey/anlegen/fertig', headers: URSPRUNG,
      rumpf: JSON.stringify({ vorgang: r1.json.vorgang, antwort: { id: 'schluessel-1' }, name: 'iPhone' }),
    }),
    r2, {},
  );

  assert.equal(r2.status, 201);
  assert.equal(r2.json.schluesselId, 'schluessel-1');
  assert.deepEqual(webauthn.letzteAnlegepruefung.expectedOrigin, ['https://iyambae.fm', 'https://www.iyambae.fm']);
  assert.equal(webauthn.letzteAnlegepruefung.expectedRPID, 'iyambae.fm');

  // BE und BS sind gespeichert — spaeter rekonstruiert sie niemand mehr.
  const kennung = (await speicher.leseKennungen('konto1')).find((k) => k.art === 'passkey');
  assert.equal(kennung.daten.be, true);
  assert.equal(kennung.daten.bs, true);
  assert.equal(kennung.daten.geraeteart, 'multiDevice');
  assert.equal(kennung.daten.name, 'iPhone');
  assert.equal(kennung.daten.oeffentlicherSchluessel, b64u(new Uint8Array([1, 2, 3, 4])));
});

test('Passkey anlegen: ein fremder Vorgang kann nicht abgeschlossen werden', async () => {
  const { passkey } = passkeyAufbau({ kontoId: 'konto1' });
  const start = passkey.routen.find((r) => r.pfad === '/api/passkey/anlegen/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ method: 'POST', url: '/api/passkey/anlegen/start', headers: URSPRUNG }), r1, {});

  // Derselbe Vorgang, aber jetzt sitzt jemand anderes in der Sitzung.
  const zweiter = passkeyAufbau({ kontoId: 'konto2' });
  zweiter.passkey._intern.vorgaenge.eintraege.set(
    r1.json.vorgang,
    { art: 'anlegen', kontoId: 'konto1', herausforderung: 'x', angelegt: Date.now() },
  );
  const fertig = zweiter.passkey.routen.find((r) => r.pfad === '/api/passkey/anlegen/fertig');
  await assert.rejects(
    () => fertig.behandler(
      fakeAnfrage({
        method: 'POST', url: '/api/passkey/anlegen/fertig', headers: URSPRUNG,
        rumpf: JSON.stringify({ vorgang: r1.json.vorgang, antwort: { id: 's' } }),
      }),
      fakeAntwort(), {},
    ),
    (f) => f.code === 'vorgang_fremd' && f.status === 403,
  );
});

test('Passkey anlegen: ein bereits vergebener Schluessel wird nicht uebernommen', async () => {
  const { passkey, speicher } = passkeyAufbau({ kontoId: 'konto1' });
  await speicher.legeKontoAn({ kennungen: [] }); // konto1
  await speicher.legeKontoAn({ kennungen: [{ art: 'passkey', wert: 'schluessel-1', daten: {} }] }); // konto2

  const start = passkey.routen.find((r) => r.pfad === '/api/passkey/anlegen/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ method: 'POST', url: '/api/passkey/anlegen/start', headers: URSPRUNG }), r1, {});

  const fertig = passkey.routen.find((r) => r.pfad === '/api/passkey/anlegen/fertig');
  await assert.rejects(
    () => fertig.behandler(
      fakeAnfrage({
        method: 'POST', url: '/api/passkey/anlegen/fertig', headers: URSPRUNG,
        rumpf: JSON.stringify({ vorgang: r1.json.vorgang, antwort: { id: 'schluessel-1' } }),
      }),
      fakeAntwort(), {},
    ),
    (f) => f.code === 'schluessel_bereits_vergeben' && f.status === 409,
  );
});

test('Passkey anmelden: unbekannter Schluessel gibt 401 ohne Auskunft', async () => {
  const { passkey } = passkeyAufbau({ kontoId: null });
  const start = passkey.routen.find((r) => r.pfad === '/api/passkey/anmelden/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ method: 'POST', url: '/api/passkey/anmelden/start', headers: URSPRUNG }), r1, {});

  const fertig = passkey.routen.find((r) => r.pfad === '/api/passkey/anmelden/fertig');
  const r2 = fakeAntwort();
  await fertig.behandler(
    fakeAnfrage({
      method: 'POST', url: '/api/passkey/anmelden/fertig', headers: URSPRUNG,
      rumpf: JSON.stringify({ vorgang: r1.json.vorgang, antwort: { id: 'kenne-ich-nicht' } }),
    }),
    r2, {},
  );
  assert.equal(r2.status, 401);
  assert.equal(r2.json.fehler, 'anmeldung_fehlgeschlagen');
  assert.equal(r2.plaetzchen, null);
});

async function anmeldeAufbau({ zaehler = 2, webauthn = fakeWebauthn(), zaehlerStreng = false } = {}) {
  const aufbau = passkeyAufbau({ kontoId: null, webauthn, zaehlerStreng });
  await aufbau.speicher.legeKontoAn({
    kennungen: [{
      art: 'passkey',
      wert: 'schluessel-1',
      daten: { oeffentlicherSchluessel: b64u(new Uint8Array([1, 2, 3, 4])), zaehler, transporte: ['internal'] },
    }],
  });
  const start = aufbau.passkey.routen.find((r) => r.pfad === '/api/passkey/anmelden/start');
  const r1 = fakeAntwort();
  await start.behandler(fakeAnfrage({ method: 'POST', url: '/api/passkey/anmelden/start', headers: URSPRUNG }), r1, {});
  return { ...aufbau, vorgang: r1.json.vorgang };
}

async function meldeAn(aufbau, { vorgang, antwort = { id: 'schluessel-1' } } = {}) {
  const fertig = aufbau.passkey.routen.find((r) => r.pfad === '/api/passkey/anmelden/fertig');
  const r = fakeAntwort();
  await fertig.behandler(
    fakeAnfrage({
      method: 'POST', url: '/api/passkey/anmelden/fertig', headers: URSPRUNG,
      rumpf: JSON.stringify({ vorgang: vorgang ?? aufbau.vorgang, antwort }),
    }),
    r, {},
  );
  return r;
}

test('Passkey anmelden ohne Benutzernamen: gelingt und setzt ein Plaetzchen', async () => {
  const aufbau = await anmeldeAufbau({ zaehler: 2 });
  const r = await meldeAn(aufbau);
  assert.equal(r.status, 200);
  assert.equal(r.json.kontoId, 'konto1');
  assert.match(r.plaetzchen, /^hz_sitzung=sitzung-konto1;/);

  const kennung = (await aufbau.speicher.leseKennungen('konto1')).find((k) => k.art === 'passkey');
  assert.equal(kennung.daten.zaehler, 5, 'der Zaehler wurde fortgeschrieben');
  assert.ok(kennung.daten.zuletztAm);
});

test('Passkey: rueckwaerts laufender Zaehler wird gemeldet, aber nicht abgewiesen', async () => {
  /*
    Das ist der Kompromiss aus der Anforderung: ein Hinweis auf einen geklonten
    Schluessel, aber kein Beweis — und sehr viele Plattform-Passkeys zaehlen
    ueberhaupt nicht. Wer hier abweist, sperrt Menschen aus, die nichts getan
    haben.
  */
  const webauthn = fakeWebauthn({
    async verifyAuthenticationResponse(o) {
      return { verified: true, authenticationInfo: { credentialID: o.credential.id, newCounter: 3, userVerified: true, credentialDeviceType: 'singleDevice', credentialBackedUp: false } };
    },
  });
  const aufbau = await anmeldeAufbau({ zaehler: 99, webauthn });
  const r = await meldeAn(aufbau);

  assert.equal(r.status, 200, 'die Anmeldung geht durch');
  const zeile = aufbau.protokoll.zeilen.find((z) => z.art === 'passkey_zaehler_rueckwaerts');
  assert.ok(zeile, 'aber es steht im Protokoll');
  assert.equal(zeile.ergebnis, 'gemeldet');

  const kennung = (await aufbau.speicher.leseKennungen('konto1')).find((k) => k.art === 'passkey');
  assert.equal(kennung.daten.zaehler, 99, 'der Zaehler wird nie zurueckgedreht');
});

test('Passkey: mit dem strengen Schalter wird derselbe Fall abgewiesen', async () => {
  const webauthn = fakeWebauthn({
    async verifyAuthenticationResponse(o) {
      return { verified: true, authenticationInfo: { credentialID: o.credential.id, newCounter: 3, userVerified: true, credentialDeviceType: 'singleDevice', credentialBackedUp: false } };
    },
  });
  const aufbau = await anmeldeAufbau({ zaehler: 99, webauthn, zaehlerStreng: true });
  const r = await meldeAn(aufbau);
  assert.equal(r.status, 401);
  assert.equal(aufbau.protokoll.zeilen.find((z) => z.art === 'passkey_zaehler_rueckwaerts').ergebnis, 'abgewiesen');
});

test('Passkey: ein Schluessel, der gar nicht zaehlt, loest keinen Alarm aus', async () => {
  const webauthn = fakeWebauthn({
    async verifyAuthenticationResponse(o) {
      return { verified: true, authenticationInfo: { credentialID: o.credential.id, newCounter: 0, userVerified: true, credentialDeviceType: 'multiDevice', credentialBackedUp: true } };
    },
  });
  const aufbau = await anmeldeAufbau({ zaehler: 0, webauthn });
  const r = await meldeAn(aufbau);
  assert.equal(r.status, 200);
  assert.equal(aufbau.protokoll.hat('passkey_zaehler_rueckwaerts'), false);
});

test('Passkey: der gespeicherte Zaehler wird der Bibliothek NICHT untergeschoben', async () => {
  const aufbau = await anmeldeAufbau({ zaehler: 42 });
  await meldeAn(aufbau);
  assert.equal(
    aufbau.webauthn.letzteAnmeldepruefung.credential.counter,
    0,
    'sonst wuerfe die Bibliothek, und wir kaemen zu unserer eigenen Abwaegung gar nicht',
  );
});

test('Passkey: ein userHandle, der nicht zum Konto passt, meldet niemanden an', async () => {
  const aufbau = await anmeldeAufbau({ zaehler: 1 });
  const r = await meldeAn(aufbau, {
    antwort: { id: 'schluessel-1', response: { userHandle: b64u('konto-ganz-anders') } },
  });
  assert.equal(r.status, 401);
  assert.equal(r.plaetzchen, null);
  assert.equal(aufbau.protokoll.zeilen.find((z) => z.art === 'passkey_anmelden').ergebnis, 'nutzerkennung_passt_nicht');
});

test('Passkey: ein passender userHandle stoert nicht', async () => {
  const aufbau = await anmeldeAufbau({ zaehler: 1 });
  const r = await meldeAn(aufbau, { antwort: { id: 'schluessel-1', response: { userHandle: b64u('konto1') } } });
  assert.equal(r.status, 200);
});

test('Passkey: derselbe Vorgang laesst sich nicht zweimal abschliessen', async () => {
  /*
    Wie beim state: Wer liest, verbraucht. Ein mitgeschnittener Abschluss laesst
    sich nicht ein zweites Mal einspielen.

    Hier wird der Behandler direkt aufgerufen, deshalb kommt der Fehler als
    Ausnahme heraus; ueber `behandle` wuerde daraus eine 400-Antwort — das
    prueft der Test "behandle laesst fremde Wege durch".
  */
  const aufbau = await anmeldeAufbau({ zaehler: 1 });
  assert.equal((await meldeAn(aufbau)).status, 200);
  await assert.rejects(
    () => meldeAn(aufbau),
    (f) => f instanceof FremdFehler && f.code === 'vorgang_unbekannt' && f.status === 400,
  );
  assert.equal(aufbau.sitzung.erzeugt.length, 1, 'kein zweites Plaetzchen');
});

test('DER LETZTE ANMELDEWEG: der einzige Passkey laesst sich nicht loeschen', async () => {
  const speicher = fakeSpeicher();
  const kontoId = await speicher.legeKontoAn({ kennungen: [{ art: 'passkey', wert: 'nur-dieser', daten: {} }] });
  const protokoll = fakeProtokoll();
  const passkey = erzeugePasskey({ speicher, sitzung: fakeSitzung(kontoId), protokoll, einst: EINST, webauthn: fakeWebauthn() });
  const loesche = passkey.routen.find((r) => r.methode === 'DELETE');

  await assert.rejects(
    () => loesche.behandler(
      fakeAnfrage({ method: 'DELETE', url: '/api/passkey/nur-dieser', headers: { origin: 'https://iyambae.fm' } }),
      fakeAntwort(),
      { treffer: [null, 'nur-dieser'] },
    ),
    (f) => f.code === 'letzter_anmeldeweg' && f.status === 409,
  );
  assert.equal((await speicher.leseKennungen(kontoId)).length, 1, 'der Schluessel ist noch da');
  assert.equal(protokoll.zeilen.find((z) => z.art === 'passkey_loeschen').ergebnis, 'letzter_weg');
});

test('Mit einem zweiten Weg darf derselbe Passkey weg', async () => {
  const speicher = fakeSpeicher();
  const kontoId = await speicher.legeKontoAn({
    kennungen: [
      { art: 'passkey', wert: 'dieser', daten: {} },
      { art: 'mail', wert: 'm@example.org', daten: { bestaetigtAm: '2026-01-01T00:00:00Z' } },
    ],
  });
  const passkey = erzeugePasskey({ speicher, sitzung: fakeSitzung(kontoId), protokoll: fakeProtokoll(), einst: EINST, webauthn: fakeWebauthn() });
  const loesche = passkey.routen.find((r) => r.methode === 'DELETE');

  const r = fakeAntwort();
  await loesche.behandler(
    fakeAnfrage({ method: 'DELETE', url: '/api/passkey/dieser', headers: { origin: 'https://iyambae.fm' } }),
    r,
    { treffer: [null, 'dieser'] },
  );
  assert.equal(r.status, 204);
  assert.equal((await speicher.leseKennungen(kontoId)).filter((k) => k.art === 'passkey').length, 0);
  assert.equal(await speicher.findeKontoUeberKennung('passkey', 'dieser'), null, 'auch der Verweis ist weg');
});

test('Eine UNBESTAETIGTE Adresse rettet den letzten Passkey nicht', async () => {
  const speicher = fakeSpeicher();
  const kontoId = await speicher.legeKontoAn({
    kennungen: [
      { art: 'passkey', wert: 'dieser', daten: {} },
      // Ohne bestaetigtAm kommt kein Einmalcode an — das ist kein Anmeldeweg.
      { art: 'mail', wert: 'm@example.org', daten: { adresse: 'm@example.org' } },
    ],
  });
  const passkey = erzeugePasskey({ speicher, sitzung: fakeSitzung(kontoId), protokoll: fakeProtokoll(), einst: EINST, webauthn: fakeWebauthn() });
  const loesche = passkey.routen.find((r) => r.methode === 'DELETE');
  await assert.rejects(
    () => loesche.behandler(
      fakeAnfrage({ method: 'DELETE', url: '/api/passkey/dieser', headers: { origin: 'https://iyambae.fm' } }),
      fakeAntwort(), { treffer: [null, 'dieser'] },
    ),
    (f) => f.code === 'letzter_anmeldeweg',
  );
});

test('Ein fremder Schluessel laesst sich nicht loeschen — und die Antwort verraet nichts', async () => {
  const speicher = fakeSpeicher();
  const meins = await speicher.legeKontoAn({ kennungen: [{ art: 'passkey', wert: 'meiner', daten: {} }, { art: 'google', wert: 'g', daten: {} }] });
  await speicher.legeKontoAn({ kennungen: [{ art: 'passkey', wert: 'fremder', daten: {} }] });

  const passkey = erzeugePasskey({ speicher, sitzung: fakeSitzung(meins), protokoll: fakeProtokoll(), einst: EINST, webauthn: fakeWebauthn() });
  const loesche = passkey.routen.find((r) => r.methode === 'DELETE');

  for (const id of ['fremder', 'gibt-es-nicht']) {
    await assert.rejects(
      () => loesche.behandler(
        fakeAnfrage({ method: 'DELETE', url: `/api/passkey/${id}`, headers: { origin: 'https://iyambae.fm' } }),
        fakeAntwort(), { treffer: [null, id] },
      ),
      // Beide Male 404: "gehoert einem anderen" und "gibt es nicht" duerfen
      // von aussen nicht unterscheidbar sein.
      (f) => f.code === 'schluessel_unbekannt' && f.status === 404,
      id,
    );
  }
  assert.equal(await speicher.findeKontoUeberKennung('passkey', 'fremder'), 'konto2');
});

test('Passkey-Verwaltung: ohne Sitzung geht nichts', async () => {
  const passkey = erzeugePasskey({ speicher: fakeSpeicher(), sitzung: fakeSitzung(null), protokoll: fakeProtokoll(), einst: EINST, webauthn: fakeWebauthn() });
  const geschuetzt = passkey.routen.filter((r) => r.pfad !== '/api/passkey/anmelden/start' && r.pfad !== '/api/passkey/anmelden/fertig');
  for (const route of geschuetzt) {
    await assert.rejects(
      () => route.behandler(
        fakeAnfrage({ method: route.methode, url: '/api/passkey/x', headers: URSPRUNG, rumpf: route.methode === 'POST' ? '{}' : null }),
        fakeAntwort(), { treffer: [null, 'x'] },
      ),
      (f) => f.code === 'nicht_angemeldet' && f.status === 401,
      String(route.pfad),
    );
  }
});

test('Passkey: ein ortsfremder Ursprung kommt an keinen veraendernden Weg', async () => {
  const { passkey } = passkeyAufbau();
  /*
    Das Auflisten ist ausgenommen: Es veraendert nichts, und eine fremde Seite
    kann die Antwort ohnehin nicht lesen. Die Begruendung steht bei `liste` in
    passkey.mjs — sie hat mit der Referrer-Policy zu tun.
  */
  const veraendernd = passkey.routen.filter((r) => r.methode !== 'GET');
  assert.ok(veraendernd.length >= 5);
  for (const route of veraendernd) {
    await assert.rejects(
      () => route.behandler(
        fakeAnfrage({ method: route.methode, url: '/api/passkey/x', headers: { origin: 'https://angreifer.test', 'content-type': 'application/json' }, rumpf: '{}' }),
        fakeAntwort(), { treffer: [null, 'x'] },
      ),
      (f) => f.code === 'ursprung_falsch',
      String(route.pfad),
    );
  }
});

test('Passkey: das Loeschmuster laesst keinen Pfad in den Pfad', () => {
  const { passkey } = passkeyAufbau();
  const muster = passkey.routen.find((r) => r.methode === 'DELETE').pfad;
  assert.ok(muster.test('/api/passkey/AbC-123_xyz'));
  for (const boese of ['/api/passkey/../konto', '/api/passkey/a/b', '/api/passkey/', '/api/passkey/a.b', '/api/passkey/' + 'a'.repeat(600)]) {
    assert.equal(muster.test(boese), false, boese);
  }
});

test('normalisiereAnlegen versteht die alte und die neue Form der Bibliothek', () => {
  const neu = normalisiereAnlegen({
    credential: { id: 'x', publicKey: new Uint8Array([9]), counter: 3, transports: ['usb'] },
    credentialDeviceType: 'singleDevice', credentialBackedUp: false, aaguid: 'g', userVerified: false,
  });
  assert.equal(neu.id, 'x');
  assert.equal(neu.zaehler, 3);
  assert.equal(neu.be, false);

  const alt = normalisiereAnlegen({
    credentialID: 'y', credentialPublicKey: new Uint8Array([8]), counter: 1,
    credentialDeviceType: 'multiDevice', credentialBackedUp: true,
  });
  assert.equal(alt.id, 'y');
  assert.equal(alt.be, true);
  assert.equal(alt.bs, true);

  assert.throws(() => normalisiereAnlegen({}), (f) => f.code === 'passkey_ungueltig');
});

test('Passkey-Name: Steuerzeichen fliegen raus, Laenge wird begrenzt', () => {
  assert.equal(saubererName('  iPhone von Micha  '), 'iPhone von Micha');
  assert.equal(saubererName('erste\nzweite'), 'erstezweite');
  assert.equal(saubererName('x'.repeat(200)).length, 60);
  assert.equal(saubererName('   '), null);
  assert.equal(saubererName(42), null);
});

test('Anzeigename fuer den Schluesselbund nimmt die Adresse, wenn es eine gibt', () => {
  assert.deepEqual(
    waehleAnzeigenamen([{ art: 'mail', wert: 'm@example.org', daten: {} }], 'konto-abcdef123456'),
    { name: 'm@example.org', anzeige: 'm@example.org' },
  );
  const ohne = waehleAnzeigenamen([{ art: 'google', wert: 'g', daten: { name: 'Micha' } }], 'konto-abcdef123456');
  assert.equal(ohne.anzeige, 'Micha');
  assert.ok(!ohne.name.includes('abcdef123456'), 'nie die volle kontoId');
});

// ════════════════════════════════════════════════════════════════════
//  Zusammenbau
// ════════════════════════════════════════════════════════════════════

test('erzeugeFremdanmeldung stellt genau die versprochenen Endpunkte bereit', async () => {
  const { erzeugeFremdanmeldung } = await import('../src/fremd.mjs');
  const fremd = await erzeugeFremdanmeldung({
    speicher: fakeSpeicher(),
    sitzung: fakeSitzung(),
    protokoll: fakeProtokoll(),
    umgebung: {},
    webauthn: fakeWebauthn(),
  });

  const vorhanden = new Set(fremd.routen.map((r) => `${r.methode} ${r.pfad}`));
  const versprochen = [
    'GET /api/google/start',
    'GET /api/google/zurueck',
    'GET /api/apple/start',
    'POST /api/apple/zurueck',
    'POST /api/passkey/anlegen/start',
    'POST /api/passkey/anlegen/fertig',
    'POST /api/passkey/anmelden/start',
    'POST /api/passkey/anmelden/fertig',
  ];
  for (const weg of versprochen) assert.ok(vorhanden.has(weg), `fehlt: ${weg}`);
  assert.ok(fremd.routen.some((r) => r.methode === 'DELETE' && r.pfad instanceof RegExp));
});

test('behandle laesst fremde Wege durch und faengt eigene ab', async () => {
  const { erzeugeFremdanmeldung } = await import('../src/fremd.mjs');
  const fremd = await erzeugeFremdanmeldung({
    speicher: fakeSpeicher(), sitzung: fakeSitzung(), protokoll: fakeProtokoll(),
    umgebung: {}, webauthn: fakeWebauthn(),
  });

  // Was uns nicht gehoert, geben wir dem Kern zurueck.
  assert.equal(await fremd.behandle(fakeAnfrage({ url: '/api/platten' }), fakeAntwort()), false);
  assert.equal(await fremd.behandle(fakeAnfrage({ method: 'GET', url: '/api/apple/zurueck' }), fakeAntwort()), false);

  // Was uns gehoert, beantworten wir — auch wenn es scheitert.
  const r = fakeAntwort();
  assert.equal(await fremd.behandle(fakeAnfrage({ url: '/api/google/start' }), r), true);
  assert.equal(r.status, 501, 'ohne Einrichtung: nicht eingerichtet, nicht kaputt');
});

test('ein unerwarteter Fehler wird zu 500 ohne Innenleben in der Antwort', async () => {
  const { erzeugeFremdanmeldung } = await import('../src/fremd.mjs');
  const protokoll = fakeProtokoll();
  const kaputt = {
    async findeKontoUeberKennung() { throw new Error('geheime interne Meldung mit micha@example.org'); },
  };
  const fremd = await erzeugeFremdanmeldung({
    speicher: kaputt, sitzung: fakeSitzung('konto1'), protokoll,
    umgebung: {}, webauthn: fakeWebauthn(),
  });

  const r = fakeAntwort();
  const still = console.error;
  console.error = () => {};
  try {
    await fremd.behandle(
      fakeAnfrage({
        method: 'POST', url: '/api/passkey/anmelden/fertig', headers: URSPRUNG,
        rumpf: JSON.stringify({ vorgang: 'x', antwort: { id: 'y' } }),
      }),
      r,
    );
  } finally {
    console.error = still;
  }
  assert.ok(r.status === 400 || r.status === 500);
  assert.ok(!r.text.includes('micha@example.org'), 'nichts Internes nach draussen');
  assert.ok(!JSON.stringify(protokoll.zeilen).includes('micha@example.org'), 'und nichts davon ins Protokoll');
});

test('leseUmgebung: sinnvolle Vorgaben, Zeilenumbrueche im .p8 werden zurueckgebogen', () => {
  const e = leseUmgebung({ APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----' });
  assert.equal(e.rpId, 'iyambae.fm');
  assert.deepEqual(e.urspruenge, ['https://iyambae.fm', 'https://www.iyambae.fm']);
  assert.equal(e.basis, 'https://iyambae.fm');
  assert.equal(e.zaehlerStreng, false);
  assert.ok(e.apple.schluessel.includes('\n'), 'aus \\n wird ein echter Umbruch');
  assert.ok(!e.apple.schluessel.includes('\\n'));

  const streng = leseUmgebung({ PASSKEY_ZAEHLER_STRENG: '1', OEFFENTLICHE_ADRESSE: 'https://test.example/' });
  assert.equal(streng.zaehlerStreng, true);
  assert.equal(streng.basis, 'https://test.example', 'kein Schraegstrich am Ende');
});
