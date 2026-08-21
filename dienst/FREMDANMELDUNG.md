# Fremdanmeldung und Passkeys — Einrichtung

Anmeldung mit Google, Anmeldung mit Apple, Passkeys. Diese Anleitung setzt
kein Vorwissen voraus. Sie ist in der Reihenfolge geschrieben, in der es
funktioniert — wer springt, sucht später.

Der Code liegt in `dienst/src/`:

| Datei | Inhalt |
|---|---|
| `fremd.mjs` | PKCE, `state`, Tokenprüfung, **die Regel zur Kontoverknüpfung**, HTTP-Handgriffe |
| `google.mjs` | OIDC mit Google |
| `apple.mjs` | OIDC mit Apple **plus die Erzeugung des Client-Geheimnisses** |
| `passkey.mjs` | WebAuthn: anlegen, anmelden, verwalten |
| `test/fremd.test.mjs` | 85 Tests, `node --test` |

---

## 0. Was zuerst passieren muss

### 0.1 Abhängigkeit

```bash
cd dienst
npm install @simplewebauthn/server@^13
```

Geprüft gegen **13.3.2**. Das ist die einzige Abhängigkeit, die diese Dateien
brauchen; JWT-Erzeugung und -Prüfung laufen über das eingebaute `node:crypto`.

> **`jose` wurde bewusst nicht genommen.** Was hier gebraucht wird — RS256 und
> ES256 prüfen, ein ES256-JWT signieren, JWKS holen und zwischenspeichern — kann
> `node:crypto` seit Node 15 vollständig: `crypto.createPublicKey({format:'jwk'})`
> baut den Schlüssel, `dsaEncoding: 'ieee-p1363'` löst das einzige Detail, an
> dem man sonst hängenbleibt (JWS legt ES256-Signaturen roh ab, node erwartet
> sonst DER). Eine Abhängigkeit weniger im Anmeldepfad ist eine Lieferkette
> weniger, die jemand angreifen kann.

`@simplewebauthn/server` dagegen **muss** sein. WebAuthn selbst zu prüfen hieße
CBOR zerlegen, COSE-Schlüssel bauen, Attestationsformate verstehen und ein
Dutzend Flaggen in einem Bytefeld richtig lesen — jede Stelle davon eine, an der
ein Fehler nicht auffällt, weil die Anmeldung ja funktioniert.

Die Bibliothek wird **träge** geladen (`await import` beim ersten Gebrauch).
Das spart Startzeit — bei dieser App der teuerste Moment, siehe die gemessenen
8,2 s Kaltstart in `infra/README.md` — und lässt die Tests ohne installierte
Abhängigkeit laufen.

### 0.2 Einhängen in `server.mjs`

Ein Import, zwei Zeilen:

```js
import { erzeugeFremdanmeldung } from './fremd.mjs';

const fremd = await erzeugeFremdanmeldung({ speicher, sitzung, protokoll });

// im Anfragebehandler, VOR der eigenen Wegwahl:
if (await fremd.behandle(anfrage, antwort)) return;
```

### 0.3 Was diese Dateien vom Kern erwarten — und was der Kern wirklich hat

Diese vier Dateien wurden gegen die **abgesprochene** Schnittstelle gebaut:

```js
speicher.findeKontoUeberKennung(art, wert) -> kontoId | null
speicher.legeKontoAn({ kennungen })        -> kontoId
speicher.verknuepfeKennung(kontoId, art, wert, daten)   // legt an ODER frischt auf
speicher.leseKennungen(kontoId)            -> [{ art, wert, daten }]
speicher.loescheKennung(kontoId, art, wert)
sitzung.erzeuge(kontoId)                   -> { plaetzchen, ablauf }
sitzung.pruefe(anfrage)                    -> kontoId | null
protokoll.schreib(art, felder)
```

> ### ⚠ Der Kern ist inzwischen anders gebaut. Ohne Zwischenstück läuft nichts.
>
> `src/speicher.mjs`, `src/sitzung.mjs` und `src/protokoll.mjs` sind parallel
> entstanden und exportieren **freie Funktionen mit `speicher` als erstem
> Argument**, nicht die oben vereinbarten Methodenobjekte. Das ist kein Fehler
> auf einer der beiden Seiten — es ist die Naht, an der zwei gleichzeitig
> gebaute Hälften aufeinandertreffen. Sie muss einmal von Hand geschlossen
> werden.
>
> **Gut daran:** `erzeugeFremdanmeldung` nimmt `speicher`, `sitzung` und
> `protokoll` als Argumente entgegen. Es genügt also ein Zwischenstück in
> `server.mjs`; an `fremd.mjs`, `google.mjs`, `apple.mjs` und `passkey.mjs`
> ändert sich **keine Zeile**.

Was im Einzelnen abweicht:

| erwartet | tatsächlich in `src/` | Anmerkung |
|---|---|---|
| `speicher.findeKontoUeberKennung(art, wert)` | `findeKonto(speicher, art, wert)` | gleiche Bedeutung |
| `speicher.legeKontoAn({kennungen})` | `holeOderLegeKontoAn(speicher, adresse)` | nur für **Mail**; kann keine Anbieterkennung anlegen |
| `speicher.verknuepfeKennung(...)` | — | **fehlt noch** |
| `speicher.leseKennungen(kontoId)` | — | **fehlt noch** |
| `speicher.loescheKennung(...)` | — | **fehlt noch** |
| `sitzung.erzeuge(kontoId)` | `erzeugeSitzung(speicher, kontoId)` → `{wert, abdruck}` | Plätzchen baut `baueSitzungsPlaetzchen(wert)` |
| `sitzung.pruefe(anfrage)` | `pruefeSitzung(speicher, plaetzchenWert)` → `{kontoId, abdruck}` | nimmt den **Wert**, nicht die Anfrage |
| `protokoll.schreib(art, felder)` | `protokolliere({art, ...})` | ein Objekt, kein Paar |

> **Inzwischen geschrieben.** Es steht in `src/server.mjs` als
> `speicherSchnittstelle` und `baueFremdanmeldung`; die Weiche ruft
> `fremd.behandle` vor der eigenen Wegwahl auf. Der Entwurf unten bleibt
> stehen, weil er die Umrechnung erklärt — die Platzhalter `/* noch zu bauen */`
> heißen dort heute `legeKontoAn`, `verknuepfeKennung`, `leseKennungen` und
> `loescheKennung` aus `speicher.mjs`.

Das Zwischenstück, fertig zum Einsetzen in `server.mjs`:

```js
import { erzeugeFremdanmeldung } from './fremd.mjs';
import { findeKonto } from './speicher.mjs';
import { erzeugeSitzung, pruefeSitzung, baueSitzungsPlaetzchen, liesPlaetzchen } from './sitzung.mjs';
import { protokolliere } from './protokoll.mjs';

const fremd = await erzeugeFremdanmeldung({
  speicher: {
    findeKontoUeberKennung: (art, wert) => findeKonto(lager, art, wert),
    legeKontoAn:            ({ kennungen }) => /* noch zu bauen */,
    verknuepfeKennung:      (kontoId, art, wert, daten) => /* noch zu bauen */,
    leseKennungen:          (kontoId) => /* noch zu bauen */,
    loescheKennung:         (kontoId, art, wert) => /* noch zu bauen */,
  },
  sitzung: {
    async erzeuge(kontoId) {
      const { wert } = await erzeugeSitzung(lager, kontoId);
      // `plaetzchenKopf` erkennt den fertigen Kopf am Semikolon und
      // uebernimmt ihn unveraendert — siehe fremd.mjs.
      return { plaetzchen: baueSitzungsPlaetzchen(wert), ablauf: null };
    },
    async pruefe(anfrage) {
      const wert = liesPlaetzchen(anfrage.headers.cookie);
      const stand = await pruefeSitzung(lager, wert);
      return stand?.kontoId ?? null;
    },
  },
  protokoll: {
    // `art` und `ergebnis` stehen schon auf der Erlaubnisliste,
    // `kontoId` heisst dort `konto`.
    schreib: (art, { kontoId, ergebnis, anbieter } = {}) =>
      protokolliere({ art, konto: kontoId, ergebnis, anbieter }),
  },
});

// im Anfragebehandler, VOR der eigenen Wegwahl:
if (await fremd.behandle(anfrage, antwort)) return;
```

Drei Dinge fehlen dafür noch im Kern, und sie gehören dorthin, nicht hierher:

1. **`verknuepfeKennung`, `leseKennungen`, `loescheKennung`.** Die Zeilenform
   steht schon in `infra/konto.bicep.entwurf`: `kennung:google:<sub>`,
   `kennung:apple:<sub>`, `kennung:passkey:<credId>` in der Kontopartition, dazu
   je ein Eintrag in `verweise`. `holeOderLegeKontoAn` macht das für `mail`
   bereits vor — samt `If-None-Match` auf dem Verweis, das den Wettlauf
   entscheidet. Genau dieses Muster brauchen die drei anderen Arten auch.
2. **`legeKontoAn` mit mehreren Kennungen auf einmal.** `verknuepfeAnbieterkennung`
   legt ein Konto mit Anbieterkennung **und** (wenn zulässig) Mail-Kennung in
   einem Zug an. Ein Konto ohne Mail-Adresse muss dabei möglich sein — bei einer
   Apple-Anmeldung mit verborgener, aber noch nicht freigegebener Adresse ist
   genau das der Fall.
3. **`anbieter` auf der Erlaubnisliste in `protokoll.mjs`.** Ohne diesen einen
   Eintrag wirft `protokolliere` das Feld still weg, und dann steht in jeder
   Zeile, dass eine Fremdanmeldung passiert ist — aber nicht, bei wem. Die Werte
   sind `'google'` und `'apple'`, also weder personenbezogen noch frei
   belegbar.

Der Plätzchenname stimmt bereits auf beiden Seiten überein (`hz_sitzung`), und
`PLAETZCHEN_UNSICHER=1` wird auch vom Bindungsplätzchen aus 7.3 beachtet.

`kontoId` muss als UTF-8 **höchstens 64 Byte** ergeben: Das ist die WebAuthn-
Grenze für `user.id`. Eine UUID oder ein base64url-Zufallswert passt bequem.

---

## 1. Google Cloud Console

### 1.1 Muss die App durch eine Überprüfung? — Nachgeschlagen, hier die Antwort

**Nein, für das Veröffentlichen nicht.** Der Knopf *Publish app* wirkt sofort,
ohne Freigabe durch Google. Der Grund ist der Zuschnitt der Rechte: Wir fordern
ausschließlich `openid`, `email` und `profile` an — die drei nicht-sensiblen
Basis-Bereiche.

Belegt, nicht vermutet:

- **Kein 100-Nutzer-Deckel, kein 7-Tage-Ablauf.** Googles Seite *Manage App
  Audience* nennt die Ausnahme wörtlich: bei einer Teilmenge aus Name, Adresse
  und Profil „your users do not need to be in the trusted user list, they will
  not see a warning message, and their authorizations will not expire after 7
  days. If your app uses Sign in with Google to authenticate users then this
  exception also applies."
  (`support.google.com/cloud/answer/15549945`)
- **Kein Warnbildschirm.** Der „Google hasn't verified this app"-Schirm ist
  scope-getrieben und erscheint nur bei sensitive/restricted scopes.
  (`support.google.com/cloud/answer/7454865`, und die Matrix unter
  `developers.google.com/identity/protocols/oauth2/production-readiness/overview`)
- **Kein Deckel auf die Zahl der Zustimmungen.** Der *user cap* gilt
  ausdrücklich nur „when requesting unapproved sensitive or restricted scopes".

**ABER — und das wird ständig mit „Verification" verwechselt:**

> **Ohne *Brand Verification* zeigt Google auf dem Zustimmungsbildschirm weder
> den App-Namen noch das Logo.** Kein Logo hochzuladen hilft nicht: Der
> *Anzeigename* hängt an derselben Prüfung. Googles Branding-Hilfe ist da
> eindeutig: „The app name will be displayed on the OAuth consent screen only if
> your app has been verified." (`support.google.com/cloud/answer/15549049`)

Brand Verification ist die kleine Prüfung — Name, Logo, Homepage, Datenschutz,
Domainbesitz. Sie läuft meist **automatisch in wenigen Minuten**, bei manueller
Prüfung 2–3 Werktage. Kein Demo-Video, keine Scope-Begründung, kein
CASA-Assessment — das betrifft nur sensitive/restricted scopes.

Die *OAuth 2.0 Policies* (Stand 05.08.2026) sagen zudem: „For production apps,
brand information must be verified." Technisch erzwungen wird das nicht, aber es
ist die Vertragslage. **Also einplanen, nicht weglassen.**

> **Einzige Unsicherheit aus der Recherche:** Die ältere Seite *When is
> verification not needed* (`support.google.com/cloud/answer/13464323`) sagt
> scope-unabhängig „Personal Use apps: fewer than 100 users […] will need to
> complete a verification, if they want to grow beyond 100". Das widerspricht
> dem Wortlaut der neueren Seiten. Einschätzung: veraltete, nicht
> scope-differenzierte Passage. Belegt ist es nicht. Da wir Brand Verification
> ohnehin machen, ist es praktisch kein Problem — aber es gehört gesagt.

### 1.2 Schritt für Schritt

Die Console-Seite heißt seit 2025 nicht mehr *APIs & Services → OAuth consent
screen*, sondern **Google Auth Platform**, mit den Reitern *Overview*,
*Branding*, *Audience*, *Clients*, *Data Access* und einem *Verification Center*.
Anleitungen im Netz, die noch vom alten Ort sprechen, sind älter als die Console.

1. **Projekt.** `console.cloud.google.com` → ein eigenes Projekt, z. B.
   `iyambae-fm`. Kein bestehendes mitbenutzen: Der Zustimmungsbildschirm gehört
   dem Projekt, nicht dem Client.
2. **Domain in der Search Console prüfen.** `search.google.com/search-console`,
   `iyambae.fm` als Property anlegen, per DNS-TXT bei Cloudflare bestätigen.
   **Wichtig:** Dasselbe Google-Konto muss GCP-Owner/Editor **und**
   verifizierter Search-Console-Owner sein. Liegen Cloud-Projekt und Domain auf
   verschiedenen Konten, ist genau das der Punkt, an dem es klemmt.
   (`support.google.com/cloud/answer/13464321`)
3. **Branding.** Auth Platform → *Branding*:
   - App name: `IYAMBAE FM`
   - User support email
   - App logo (optional, aber siehe oben: der Name allein löst die Prüfung ohnehin aus)
   - Application home page: `https://iyambae.fm` — **muss öffentlich erreichbar
     sein, die Funktion beschreiben und auf Datenschutz und Nutzungsbedingungen
     verlinken.** Eine reine Anmeldeseite genügt nicht.
   - Privacy policy: `https://iyambae.fm/de/datenschutz` (wortgleich mit dem,
     was auf der Seite steht)
   - Terms of service
   - **Authorized domains:** `iyambae.fm`
4. **Audience.** *External*, dann **Publish app**. Den *Testing*-Modus
   überspringen: Bei diesen Bereichen schützt er vor nichts und schränkt nichts
   ein, er ist schlicht überflüssig.
5. **Data Access.** Genau drei Bereiche: `openid`, `.../auth/userinfo.email`,
   `.../auth/userinfo.profile`. Die Console stuft sie automatisch als
   *non-sensitive* ein. **Jeder weitere Bereich kippt die App in Warnbildschirm
   und 100-Nutzer-Deckel.** Das ist die eine Zeile, die man nicht ändert.
6. **Clients** → *Create client* → **Web application**:
   - Authorized JavaScript origins: *leer lassen*. Der Browser spricht nie
     direkt mit Google — der Codetausch passiert im Container.
   - Authorized redirect URIs:
     `https://iyambae.fm/api/google/zurueck`
     (Für eine Testadresse zusätzlich deren `/api/google/zurueck`.)
   - **Nicht** `www.iyambae.fm` eintragen, solange nginx `www` auf den Apex
     umleitet — die Rückkehradresse muss wortgleich mit der beim Start sein,
     sonst lehnt Google den Tausch ab.
7. **Client-ID und Client-Secret kopieren.** Seit 2025 wird das Secret gehasht
   und ist **nur ein einziges Mal sichtbar**. Verloren heißt neu erzeugen.
8. **Verify Branding** drücken. Das Ergebnis ist **7 Tage gültig** — danach
   innerhalb dieser Frist **Publish branding** klicken, sonst von vorn. Jede
   spätere Änderung an Name, Logo, Homepage, Privacy-URL oder Redirect-URI löst
   die Prüfung erneut aus (ohne Warnbildschirm oder Deckel).

---

## 2. Apple Developer Portal

Apple braucht **vier** Dinge im Portal, und sie hängen aneinander. Wer eines
überspringt, bekommt beim Codetausch `invalid_client` — eine Meldung, die nie
sagt, welches der vier es war.

### 2.1 App ID

*Certificates, Identifiers & Profiles* → **Identifiers** → **+** → *App IDs* →
*App*.

- Description: `IYAMBAE FM`
- Bundle ID (explicit): `fm.iyambae.app`
- Unter *Capabilities*: **Sign in with Apple** anhaken.

Auch ohne iOS-App. Die App ID ist der Anker, an dem die Service ID hängt.

### 2.2 Service ID — das ist die `client_id`

**Identifiers** → **+** → *Services IDs*.

- Description: `IYAMBAE FM Web`
- Identifier: `fm.iyambae.web` — **das ist die `client_id` und das `sub` im
  Client-Geheimnis.** Nicht die App ID. Die beiden sehen fast gleich aus und
  werden ständig verwechselt; es ist der häufigste Grund für `invalid_client`.

Speichern, dann **erneut öffnen** → *Sign in with Apple* → **Configure**:

- Primary App ID: die App ID aus 2.1
- **Domains and Subdomains:** `iyambae.fm`
- **Return URLs:** `https://iyambae.fm/api/apple/zurueck`

> **HTTPS ist Pflicht, `localhost` verboten.** Apple nimmt keine
> `http://localhost`-Rückkehradresse an — anders als Google. Zum Ausprobieren
> braucht es eine echte Adresse oder einen Tunnel mit gültigem Zertifikat.

### 2.3 Key mit "Sign in with Apple"

**Keys** → **+**:

- Key Name: `IYAMBAE Anmeldung`
- **Sign In with Apple** anhaken → *Configure* → Primary App ID wählen
- *Continue* → *Register* → **Download**

Es entsteht eine Datei `AuthKey_XXXXXXXXXX.p8`.

> **Nur ein einziges Mal herunterladbar.** Danach nie wieder. Verloren heißt:
> Key widerrufen, neuen anlegen, `APPLE_KEY_ID` und `APPLE_PRIVATE_KEY` neu
> setzen.

Notieren:

- **Key ID** — die zehn Zeichen im Dateinamen → `APPLE_KEY_ID`
- **Team ID** — oben rechts im Portal, unter *Membership* → `APPLE_TEAM_ID`

### 2.4 Das Client-Geheimnis — es gibt hier nichts einzurichten

**Genau das ist der Punkt.** Apples Client-Geheimnis ist kein Wert aus dem
Portal, sondern ein JWT, das man selbst mit dem `.p8`-Schlüssel signiert
(ES256). Apple erlaubt ihm **höchstens sechs Monate** Laufzeit.

Wer es einmal von Hand erzeugt und in ein Container-Apps-Geheimnis legt, hat
eine Anmeldung gebaut, die an irgendeinem Dienstagmorgen aufhört zu
funktionieren, ohne dass jemand etwas geändert hat. Man merkt es am
Beschwerdebrief.

`apple.mjs` erzeugt es deshalb **bei Bedarf im Dienst**, mit **30 Minuten**
Laufzeit, und hält es im Arbeitsspeicher bis zwei Minuten vor Ablauf. Nur die
vier Werte von oben kommen von außen — und die laufen nicht ab. **Es gibt nichts
zu erneuern und nichts einzutragen.**

### 2.5 Absenderdomäne für `@privaterelay.appleid.com`

Sehr viele Nutzer verbergen ihre Adresse hinter Apples Weiterleitung. Post
dorthin **kommt an** — aber nur, wenn der Absender bei Apple registriert ist.
Sonst verschwinden Bestätigungsmails wortlos.

*Certificates, Identifiers & Profiles* → **Services** → *Sign in with Apple for
Email Communication* → **Configure**:

- **Domains:** `mail.iyambae.fm` (dieselbe Unterdomäne wie in
  `infra/konto.bicep.entwurf` — nicht der Apex, der SPF-Eintrag dort endet auf
  Hard Fail)
- **Email Sources:** `konto@mail.iyambae.fm`
- SPF prüfen lassen

Reihenfolge: erst die ACS-Domäne bei Azure einrichten und die DNS-Einträge
setzen, **dann** hier registrieren. Apple prüft SPF und lehnt sonst ab.

Der Dienst merkt sich an jeder Weiterleitungsadresse `weiterleitung: true`.
Damit lässt sich später erklären, warum eine Mail unzustellbar zurückkommt:
Der Nutzer hat die Verknüpfung in seinen Apple-Einstellungen gelöst, und die
Adresse ist tot. Das ist kein Fehler des Dienstes.

---

## 3. Passkeys

### 3.1 RP-ID: `iyambae.fm`, nicht `www.iyambae.fm`

Die RP-ID muss die **registrierbare Domain** sein.

- `iyambae.fm` gilt auch für `www.iyambae.fm`. ✔
- `www.iyambae.fm` gälte **nicht** für `iyambae.fm`. ✘

Wer das verwechselt, merkt es erst, wenn ein auf dem Apex angelegter Passkey auf
der `www`-Adresse nicht angenommen wird. Die Ursprungsliste enthält deshalb
**beide** Adressen, die RP-ID nur eine.

### 3.2 ⚠ Auf `*.azurecontainerapps.io` wirft WebAuthn `SecurityError`

**Bevor jemand einen halben Tag in `@simplewebauthn/server` sucht:**

Auf einer Testadresse unter `*.azurecontainerapps.io` schlägt
`navigator.credentials.create()` mit einem **`SecurityError`** fehl. Das sieht
nach einem Bibliotheksfehler aus. Es ist keiner.

`azurecontainerapps.io` steht auf der **Public Suffix List**. Der Browser
behandelt jede Unterdomäne dort wie eine eigenständige Registrierungsebene und
lässt als RP-ID nur den vollen Hostnamen zu. Setzt man `iyambae.fm` als RP-ID —
oder auch nur `azurecontainerapps.io` —, verweigert er es.

Dasselbe gilt für `github.io`, `vercel.app`, `azurewebsites.net` und jeden
anderen Eintrag der Liste.

**Wege, die funktionieren:**

- `localhost` — als einziger unsicherer Ursprung von WebAuthn ausgenommen.
- Eine echte Domain oder Unterdomäne mit gültigem Zertifikat.
- Testadresse: `test.iyambae.fm` statt der `azurecontainerapps.io`-Adresse. Dann
  `WEBAUTHN_RP_ID=iyambae.fm` beibehalten und `ERLAUBTE_URSPRUENGE` um
  `https://test.iyambae.fm` erweitern.

**Was nicht funktioniert:** die RP-ID auf den vollen
`*.azurecontainerapps.io`-Hostnamen setzen. Das lässt der Browser zwar zu, aber
die dort angelegten Passkeys gelten dann *nur* für diesen Hostnamen und sind auf
`iyambae.fm` wertlos.

### 3.3 Anmeldung ohne Benutzernamen

`allowCredentials` bleibt **leer**. Das Gerät bietet selbst an, welcher
Schlüssel passt. Zwei Gründe, und der zweite wiegt schwerer:

1. Man müsste sonst vorher wissen, wer sich anmeldet — also nach einem
   Benutzernamen fragen. Genau das soll wegfallen.
2. Eine gefüllte Liste wäre eine **Auskunft**: Wer eine Adresse eingibt und eine
   Liste zurückbekommt, weiß, dass diese Adresse ein Konto hat. Diese Lücke macht
   man nicht wieder zu.

Dafür wird bei der Anlage `residentKey: 'required'` verlangt — der Schlüssel muss
seine eigene Kennung mitbringen.

### 3.4 Der Signaturzähler

Ein rückwärts laufender Zähler ist ein **Hinweis** auf einen geklonten
Schlüssel, kein Beweis. Sehr viele Plattform-Passkeys zählen überhaupt nicht
(beide Werte bleiben 0), und bei manchen läuft er nach einer Wiederherstellung
aus dem Backup zurück, ohne dass etwas geschehen wäre.

Deshalb: **protokollieren, nicht abweisen** — als Ereignis
`passkey_zaehler_rueckwaerts` mit Ergebnis `gemeldet`. Der gespeicherte Zähler
wird dabei nie zurückgedreht, sonst wäre der Hinweis für alle folgenden
Anmeldungen stumm.

> **Umsetzungsdetail, das man kennen muss:** `@simplewebauthn/server` **wirft**
> ab Fassung 13 selbst einen Fehler, sobald der gemeldete Zähler nicht größer ist
> als der gespeicherte. Um die Abwägung zu behalten, übergibt `passkey.mjs` der
> Bibliothek bewusst `counter: 0` und führt den Vergleich selbst. Wer diese Zeile
> „aufräumt", schaltet damit unbemerkt auf hartes Abweisen um.

Strenger geht mit `PASSKEY_ZAEHLER_STRENG=1`. **Der Preis:** Ein Nutzer, dessen
Sicherheitsschlüssel nach einer Wiederherstellung zurückzählt, wird ausgesperrt,
ohne etwas getan zu haben.

### 3.5 BE und BS

Bei jeder Anlage und jeder Anmeldung werden zwei Flaggen gespeichert:

- **BE** (Backup Eligible) → `be`: Der Schlüssel *darf* geräteübergreifend
  gesichert werden.
- **BS** (Backup State) → `bs`: Er *ist* es gerade.

Warum das zählt: Ein Passkey mit `be: false` lebt auf genau einem Gerät. Geht das
Gerät verloren, ist der Anmeldeweg weg. Wer nur solche Schlüssel hat, sollte
gewarnt werden, **bevor** es passiert — und diese Warnung lässt sich ohne die
Flagge nicht schreiben. Rekonstruieren kann man sie später nicht.

---

## 4. Umgebungsvariablen

| Variable | Beispiel | Geheim? |
|---|---|---|
| `OEFFENTLICHE_ADRESSE` | `https://iyambae.fm` | nein |
| `ERLAUBTE_URSPRUENGE` | `https://iyambae.fm,https://www.iyambae.fm` | nein |
| `WEBAUTHN_RP_ID` | `iyambae.fm` | nein |
| `WEBAUTHN_RP_NAME` | `IYAMBAE FM` | nein |
| `PASSKEY_NUTZERPRUEFUNG` | `preferred` (oder `required`) | nein |
| `PASSKEY_ZAEHLER_STRENG` | leer (oder `1`) | nein |
| `GOOGLE_CLIENT_ID` | `…apps.googleusercontent.com` | nein |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-…` | **ja** |
| `APPLE_TEAM_ID` | `ABCDE12345` | nein |
| `APPLE_KEY_ID` | `XYZ9876543` | nein |
| `APPLE_SERVICE_ID` | `fm.iyambae.web` | nein |
| `APPLE_PRIVATE_KEY` | Inhalt der `.p8` | **ja** |

Fehlt die Einrichtung eines Anbieters, antwortet er mit **501**
(`google_nicht_eingerichtet` / `apple_nicht_eingerichtet`) — nicht mit 500. Der
Unterschied entscheidet, wo jemand zu suchen anfängt. Der jeweils andere
Anbieter und die Passkeys laufen davon unberührt weiter.

### 4.1 Die Geheimnisse gehören als Container-Apps-Geheimnisse hinein

**Nicht ins Repository, nicht ins Abbild, nicht in `main.bicep` als Klartext.**

```bash
az containerapp secret set -n ca-iyambae-web -g <gruppe> --secrets \
  google-secret="GOCSPX-…" \
  apple-p8="$(cat AuthKey_XYZ9876543.p8)"
```

Im Container `konto` aus `infra/konto.bicep.entwurf`, Abschnitt „NOCH ZU TUN (1)":

```bicep
env: [
  { name: 'GOOGLE_CLIENT_SECRET', secretRef: 'google-secret' }
  { name: 'APPLE_PRIVATE_KEY',    secretRef: 'apple-p8' }
  // die übrigen als value
]
```

> **Der `.p8`-Schlüssel und die Zeilenumbrüche.** Der häufigste Griff daneben:
> Die Datei landet als eine einzige Zeile in der Variablen, weil eine
> Werkzeugkette dazwischen die Umbrüche geschluckt hat. `crypto.createPrivateKey`
> scheitert dann. `leseUmgebung` biegt deshalb ein literales `\n` (zwei Zeichen)
> zu einem echten Umbruch zurück — beide Schreibweisen funktionieren.
>
> Scheitert es trotzdem, kommt **nicht** `invalid_client` von Apple, sondern
> `apple_schluessel_unlesbar` (501) aus dem eigenen Dienst. Ein RSA-Schlüssel
> statt EC gibt `apple_schluessel_falscher_typ`. Beides absichtlich früh und
> laut, damit die Ursache noch im Text steht.

---

## 5. Die Endpunkte

| Methode | Pfad | Antwort |
|---|---|---|
| GET | `/api/google/start` | 302 zu Google (PKCE + `state`) |
| GET | `/api/google/zurueck` | 302 auf `/<sprache>/` + Plätzchen |
| GET | `/api/apple/start` | 302 zu Apple |
| **POST** | `/api/apple/zurueck` | 302 auf `/<sprache>/` + Plätzchen |
| POST | `/api/passkey/anlegen/start` | 200 `{optionen, vorgang}` — Sitzung nötig |
| POST | `/api/passkey/anlegen/fertig` | 201 `{schluesselId, gesichert, geraeteuebergreifend}` |
| POST | `/api/passkey/anmelden/start` | 200 `{optionen, vorgang}` — `allowCredentials: []` |
| POST | `/api/passkey/anmelden/fertig` | 200 `{kontoId}` + Plätzchen \| 401 |
| GET | `/api/passkey` | 200 `{schluessel[], anmeldewege}` |
| DELETE | `/api/passkey/{id}` | 204 \| **409** wenn es der letzte Anmeldeweg wäre |
| DELETE | `/api/google/verknuepfung` | 204 \| **409** dito |
| DELETE | `/api/apple/verknuepfung` | 204 \| **409** dito |

### 5.1 Apple antwortet per `form_post` — **POST, nicht GET**

Apple schickt den Autorisierungscode **nicht** als GET-Umleitung zurück, sondern
als HTML-Formular, das der Browser per `POST` mit
`application/x-www-form-urlencoded` an die Rückkehradresse sendet.

Wer den Rückweg als GET baut, sieht in der Entwicklung nie einen Fehler und im
Betrieb einen 404 bei jedem einzelnen Anmeldeversuch. Ein Test hält das fest.

Das ist bei `scope=name email` auch keine Wahl: Apple weigert sich, diese Angaben
über eine GET-Umleitung zu schicken, weil sie sonst in Verläufen und
Serverprotokollen landeten.

### 5.2 Name und Adresse kommen **nur beim allerersten Mal**

Apple schickt das Feld `user` — mit Vorname, Nachname und Adresse — in der
allerersten Antwort und **nie wieder**, auch nicht nach einer Neuinstallation.
Was dort nicht sofort gespeichert wird, ist fort. `apple.mjs` liest es **vor**
dem Codetausch, damit ein Netzfehler es nicht mitnimmt.

> **Das Feld `user` ist NICHT signiert.** Es wird gespeichert, aber es entscheidet
> über nichts. Die Adresse für die Kontoverknüpfung kommt **ausschließlich** aus
> dem geprüften `id_token`. Sonst könnte jemand seinen eigenen Apple-Vorgang
> starten und vor dem Absenden eine fremde Adresse in den Rumpf schreiben — die
> Regel aus Abschnitt 6 wäre eine Etage tiefer umgangen. Ein Test greift genau
> das an.

### 5.3 Der Vorgang bei Passkeys

`.../start` liefert `{optionen, vorgang}`. Der `vorgang` ist ein undurchsichtiger
Wert; die **Herausforderung bleibt beim Server**. Der Browser schickt ihn beim
`.../fertig` zurück:

```js
const { optionen, vorgang } = await (await fetch('/api/passkey/anmelden/start',
  { method: 'POST', headers: { 'content-type': 'application/json' } })).json();
const antwort = await startAuthentication({ optionsJSON: optionen });
await fetch('/api/passkey/anmelden/fertig', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ vorgang, antwort }),
});
```

Ein `vorgang` ist **genau einmal** gültig und lebt fünf Minuten.

### 5.4 Zusammenführen

Wer angemeldet ist, hängt `?verknuepfen=1` an `/api/google/start` oder
`/api/apple/start`. Der Anbieter wird dann dem **bestehenden** Konto
hinzugefügt, ohne dass Adressen verglichen werden — der Nachweis ist die
laufende Sitzung. Gehört die Anbieterkennung bereits einem anderen Konto, gibt
es **409**; weggenommen wird nichts.

Die `kontoId` wird dabei **beim Start** aus der Sitzung gelesen und im `state`
hinterlegt. Bei Apple ist das nicht bequem, sondern nötig: Der Rückweg ist ein
ortsfremder POST, und ein `SameSite=Lax`-Plätzchen wird dabei nicht mitgeschickt.

---

## 6. Die Regel zur Kontoverknüpfung

Die gefährlichste Stelle des ganzen Dienstes. Sie steht als Kommentar direkt an
`verknuepfeAnbieterkennung` in `fremd.mjs`.

> **Verknüpft wird über die stabile Anbieterkennung — Google `sub`, Apple `sub`
> —, NIEMALS über die E-Mail-Adresse allein.**

Es gibt Anbieter, die eine Adresse ins Token schreiben, ohne je geprüft zu
haben, ob sie dem Anmelder gehört. Würde allein nach der Adresse verknüpft,
genügte es, dort ein Konto mit der Adresse eines fremden IYAMBAE-Nutzers
anzulegen — und die Anmeldung landete in dessen Konto, mitsamt Merkliste und
Hörverlauf. Weder Passwort noch Postfachzugang nötig.

Eine Adresse darf ein **bestehendes** Konto nur dann anschließen, wenn **beide**
Seiten geprüft sind:

- **(a)** Der Anbieter meldet sie mit `email_verified` als geprüft, **und**
- **(b)** sie ist im eigenen Bestand ebenfalls als bestätigt vermerkt
  (`bestaetigtAm` gesetzt).

Fehlt eine der beiden Bedingungen, entsteht ein **neues Konto**. Der Nutzer kann
die Wege später aus dem angemeldeten Zustand heraus zusammenführen — dann hat er
beide Seiten in der Hand.

Das neue Konto beansprucht die Adresse dann **nicht** als Kennung. Sonst
kollidierte der Eintrag in `verweise` — und schlimmer: Wer zuerst käme, hätte dem
anderen die Adresse weggenommen.

`email_verified` gilt als Ja bei `true` **und** bei der Zeichenkette `"true"` —
Apple schickt Letzteres. Alles andere, auch `undefined`, gilt als **nicht**
geprüft. Im Zweifel nicht geprüft.

---

## 7. Was noch drumherum gehört

### 7.1 Nur eine Replik — oder klebende Sitzungen

`state`, `nonce`, PKCE-verifier und die WebAuthn-Herausforderungen liegen im
**Arbeitsspeicher**. Bei mehr als einer Replik muss der Rückweg dieselbe Replik
treffen wie der Start.

`main.bicep` fährt heute eine Replik, also passt es. Wer hochskaliert, braucht
`affinity: sticky` am Ingress **oder** diesen Speicher in der Tabelle. Sonst
scheitert ein Teil der Anmeldungen scheinbar zufällig — der schlechteste Fehler,
den es gibt.

Ein Neustart macht angefangene Anmeldungen ungültig. Der Nutzer klickt noch
einmal. Das ist der günstigere Fehler als eine Tabellenzeile je Anmeldeversuch.

### 7.2 Drosselung in nginx

`konto.bicep.entwurf` sieht `limit_req` bisher nur für `/api/anmelden` vor. Die
folgenden Wege gehören dazu, sonst sind sie ein kostenloser Hebel gegen Google
und Apple:

```nginx
location = /api/passkey/anmelden/fertig { limit_req zone=anmeldung burst=2 nodelay; proxy_pass http://127.0.0.1:8081; }
location = /api/google/start           { limit_req zone=anmeldung burst=2 nodelay; proxy_pass http://127.0.0.1:8081; }
location = /api/apple/start            { limit_req zone=anmeldung burst=2 nodelay; proxy_pass http://127.0.0.1:8081; }
```

Der Rückweg von Apple darf **nicht** so eng gedrosselt werden: Er kommt von
Apples Adressen, nicht von der des Nutzers — eine Drosselung nach IP träfe dort
alle gleichzeitig.

### 7.3 Die Bindung des Anmeldevorgangs an den Browser

Beim Start setzt der Dienst ein zweites, kurzlebiges Plätzchen:

```
hz_anmeldung=<32 Zufallsbytes>; Path=/api/; HttpOnly; Secure; SameSite=None; Max-Age=900
```

Im `state` liegt nur dessen SHA-256-Abdruck. Wer den Rückweg bringt, muss auch
das Plätzchen mitbringen.

**Wogegen das schützt** — der Angriff wird gern übersehen, weil er
rückwärts läuft: Der Angreifer meldet sich *selbst* bei Google an, bricht kurz
vor dem Ende ab und hält damit ein gültiges Paar aus `code` und `state`. Dann
bringt er ein Opfer dazu, genau diesen Rückweg aufzurufen — ein `<img>` mit
dieser Adresse genügt, bei Apple ein Formular, das sich selbst abschickt. Der
Dienst sähe einen tadellosen Vorgang, legte eine Sitzung an und setzte sie im
Browser des **Opfers**. Das Opfer säße danach im Konto des **Angreifers**, ohne
es zu merken, und alles, was es hört und merkt, landete dort.

RFC 6749 nennt das in §10.12 („login CSRF"); die OAuth-2.0-Security-BCP verlangt
deshalb ausdrücklich, den `state` an den Browser zu binden.

> **`SameSite=None` ist hier kein Versehen, sondern Voraussetzung.** Apples
> Rückweg ist ein ortsfremder POST — ein `Lax`-Plätzchen käme dabei nicht mit,
> und *jede* Apple-Anmeldung schlüge fehl. Ein Loch ist es nicht: Der Wert ist
> `HttpOnly`, keine fremde Seite kann ihn lesen, und allein ist er wertlos —
> ohne den passenden, einmal gültigen `state` im Server öffnet er nichts.
>
> Es handelt sich um eine **Top-Level-Navigation**, nicht um einen eingebetteten
> Drittkontext; Safaris ITP und Chromes Drittanbieter-Sperren greifen dort nicht.

Nach jedem Rückweg — gelungen, abgebrochen oder abgewiesen — wird das Plätzchen
mit `Max-Age=0` weggeräumt.

### 7.4 Schutz vor ortsfremden Anfragen

Jeder verändernde Weg prüft den `Origin`-Kopf gegen `ERLAUBTE_URSPRUENGE` und
besteht bei JSON-Wegen auf `content-type: application/json` — den kann ein
Formular-POST von einer fremden Seite ohne Vorabanfrage nicht setzen.

**Ausgenommen ist genau ein Weg:** `POST /api/apple/zurueck`. Dort *ist* der
Ursprung fremd, nämlich Apple. Was dort schützt, ist der einmal gültige `state`.

### 7.5 Das Protokoll bleibt personenfrei

Geschrieben werden nur **Ereignisart, Anbieter, Kontokennung, Ergebnis**. Keine
Adresse, kein Token, kein `sub` — auch nicht gehasht. Ein Test prüft das, indem
er alle Protokollzeilen nach Adresse und `sub` durchsucht **und** jedes einzelne
Feld gegen eine Erlaubnisliste hält.

Unerwartete Fehler gehen nur auf `stderr`, nie ins Protokoll: Ihr Text trägt
manchmal einen Ausschnitt der Eingabe, und die Eingabe kann eine Adresse sein.

### 7.6 In `sw.js` und der CSP

Aus `konto.bicep.entwurf` (3): `/api/` darf der Service Worker **niemals**
abfangen oder zwischenspeichern. Eine Antwort von `/api/passkey` gehört einem
angemeldeten Menschen; läge sie im Speicher, bekäme sie der nächste an diesem
Gerät auch nach dem Abmelden.

Eine Content-Security-Policy fehlt in `deploy/nginx.conf` noch. Mit Anmeldung
gehört eine hin. Die Umleitungen zu Google und Apple sind Navigationen und von
`form-action` nicht betroffen — die Regel muss aber Google Fonts aushalten.

---

## 8. Prüfen

```bash
cd dienst
node --test test/fremd.test.mjs
```

**85 Tests, alle grün** (Node 24.18.0; die Zielfassung ist Node 22, der Code
benutzt nichts darüber hinaus).

Die Tests ersetzen `speicher`, `sitzung`, `protokoll` und
`@simplewebauthn/server` durch Attrappen. Für die JWT-Prüfung werden **echte**
RSA- und EC-Schlüsselpaare erzeugt und echte Tokens signiert — dort ist nichts
vorgetäuscht.

Was angegriffen wird, nicht nur was funktioniert:

- gültige Signatur, aber falsches `aud` → abgelehnt
- `alg: none` → abgelehnt
- `HS256` mit dem öffentlichen Schlüssel als HMAC-Geheimnis → abgelehnt
- Rumpf nachträglich ausgetauscht → abgelehnt
- 25 erfundene `kid` in 2,5 Sekunden → **keine einzige zusätzliche JWKS-Abfrage**
- JWKS fällt aus, Schlüssel im Speicher → läuft weiter; nichts im Speicher → 503
- ungeprüfte Anbieteradresse auf ein fremdes Konto → neues Konto
- geprüfter Anbieter, unbestätigter Bestand → neues Konto
- Apples ungezeichnetes `user`-Feld mit fremder Adresse → wirkungslos
- derselbe `state` zweimal → kein zweiter Codetausch, kein zweites Konto,
  kein zweites Plätzchen
- **Anmelde-CSRF**: fremder Rückweg im Browser des Opfers → keine Sitzung, kein
  Codetausch, kein Konto — bei Google **und** bei Apple
- gefälschtes Bindungsplätzchen → dasselbe
- fremder Passkey-Vorgang, fremder Passkey → 403 bzw. 404
- letzter Anmeldeweg → 409, in allen vier Spielarten

Zusätzlich einmal von Hand gegen die **echte** Bibliothek geprüft (13.3.2):
`generateRegistrationOptions` und `generateAuthenticationOptions` nehmen die
übergebenen Formen an, liefern `rp.id = iyambae.fm`, eine 32-Byte-Herausforderung
und `allowCredentials: []`.

---

## 9. Was offen bleibt

1. ~~Das Zwischenstück zum Kern aus 0.3~~ **erledigt.** Es steht als
   `speicherSchnittstelle` und `baueFremdanmeldung` in `src/server.mjs`, die
   fünf fehlenden Speicherfunktionen (`legeKontoAn`, `verknuepfeKennung`,
   `leseKennungen`, `loescheKennung`, dazu `kennungAusZeile` im Inneren) in
   `src/speicher.mjs`. `test/kennung.test.mjs` prüft die Naht gegen den
   echten Speicher statt gegen eine Attrappe.
2. ~~`@simplewebauthn/server@^13` in `dienst/package.json`~~ **erledigt**,
   eingetragen als `^13.3.2`.
3. **Der Widerspruch in Googles Doku** zum 100-Nutzer-Deckel (1.1). Einschätzung:
   veraltete Passage. Nicht belegt.
4. **Ein echter Ende-zu-Ende-Lauf** mit Browser und Authenticator steht aus. Die
   Tests decken alles ab, was ohne Gerät prüfbar ist.
5. ~~Kontolöschung nach Art. 17~~ **erledigt.** `loescheKonto` in
   `speicher.mjs` liest jetzt alle `kennung:`-Zeilen der Partition und
   löscht zu jeder den Verweis — nicht mehr nur den der Adresse.
6. **Die Content-Security-Policy** (7.6) ist ein eigener Arbeitsschritt.

7. **Ein Wettlauf beim erstmaligen Beanspruchen einer Adresse.** Melden sich
   zwei Vorgänge *gleichzeitig* zum ersten Mal mit derselben geprüften Adresse
   an (dieselbe Person über Google und Apple in zwei Tabs), sehen beide
   „Adresse noch frei" und legen je ein Konto mit dieser Mail-Kennung an.

   Keine Kontoübernahme — beide Vorgänge gehören demselben nachgewiesenen
   Adressinhaber. Aber Datenwirrwarr. Der Ort dafür ist der Kern: Das Schreiben
   in `verweise` muss ein **Einfügen-wenn-nicht-vorhanden** sein
   (`If-None-Match: *`, also Konflikt statt Überschreiben).

   `holeOderLegeKontoAn` in `speicher.mjs` macht das für `mail` bereits genau so
   und begründet es auch — `verknuepfeKennung` und `legeKontoAn` müssen es
   ebenso tun, und bei einem Konflikt einen Fehler melden statt zu
   überschreiben. `verknuepfeAnbieterkennung` behandelt einen solchen Fehler
   dann wie jeden anderen: kein Konto, keine Sitzung, 500 — der laute Ausgang
   ist hier der richtige.

8. **Der `hz_anmeldung`-Pfad und nginx.** Das Plätzchen hat `Path=/api/`. Das
   passt zu `location /api/` in `deploy/nginx.conf`, aber wenn dort je ein
   Präfix davorkommt, muss der Pfad mitwandern.
