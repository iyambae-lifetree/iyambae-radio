# Anmeldung einrichten — was nur Micha selbst tun kann

Diese Datei listet **ausschließlich** die Schritte, die in fremden Konsolen
passieren: Azure-Portal, Cloudflare, Google Cloud Console, Apple Developer.
Sie hängen an Konten, an Zahlungsdaten und an Bestätigungsmails. Kein Skript
und kein Bicep kann sie übernehmen.

Was die Vorlage übernimmt, steht in `infra/main.bicep`. Warum die Anmeldung so
gebaut ist, wie sie gebaut ist, steht in `dienst/FREMDANMELDUNG.md` — dort
liegen die Begründungen, hier die Reihenfolge.

**Die Reihenfolge ist nicht empfohlen, sie ist erzwungen.** Jeder Schritt
braucht ein Ergebnis aus dem vorigen. Wer springt, bekommt Fehlermeldungen, die
nicht sagen, was fehlt: Apple antwortet auf vier verschiedene Versäumnisse mit
demselben `invalid_client`, Azure lehnt eine Absenderdomäne ohne Begründung ab,
und Google verweigert den Codetausch mit `redirect_uri_mismatch`, auch wenn die
Adresse nur ein Zeichen abweicht.

---

## Überblick — sechs Etappen

| # | Wo | Was entsteht | Wartezeit |
|---|---|---|---|
| 1 | Azure (Bicep) | Speicher, ACS, Absenderdomäne, Rechte | — |
| 2 | Cloudflare | DNS-Einträge für `mail.iyambae.fm` | 15–30 min je Runde |
| 3 | Azure-Portal | ACS-Rollenzuweisung (bewusste Entscheidung) | — |
| 4 | Google Cloud Console | OAuth-Client, Branding-Prüfung | bis 7 Tage |
| 5 | Apple Developer | App ID, Service ID, Key, Absenderdomäne | — |
| 6 | Azure (Bicep) | Sidecar einschalten | — |

Etappe 4 und 5 sind voneinander unabhängig und können parallel laufen. Beide
setzen Etappe 2 voraus — Google prüft die Domain in der Search Console, Apple
prüft SPF an der Absenderdomäne.

---

## Etappe 1 — Azure anlegen, ohne den Sidecar

`mitAnmeldung` steht in `infra/main.bicep` mit Absicht auf `false`. Der erste
Lauf legt Speicherkonto, Tabellen, Communication Services, die Absenderdomäne
und die verwaltete Identität an — und **rührt den laufenden Web-Container
nicht an**, außer dass er ihm die zweite Identität anhängt.

```bash
az deployment group create \
  --resource-group iyambae \
  --name iyambae-anmeldung-1 \
  --template-file infra/main.bicep \
  --parameters abbild='ghcr.io/michaelfricke-sudo/iyambae-radio:<commit-sha>'
```

> **Das `abbild` unbedingt mitgeben.** Ohne den Parameter greift die Vorgabe
> `:latest` — und dann läuft am Ende womöglich ein anderer Stand als der, der
> gerade ausgeliefert ist. Der Grund steht ausführlich in `infra/README.md`.

Danach die Ausgaben holen. Sie werden in allen folgenden Etappen gebraucht:

```bash
az deployment group show -g iyambae -n iyambae-anmeldung-1 \
  --query properties.outputs -o json
```

Interessant sind:

- `mailDnsEintraege` — die Einträge für Etappe 2
- `acsRessource` — der Bereich für Etappe 3
- `dienstObjektId` — der Empfänger für Etappe 3
- `speicherKonto` — der Name des Speicherkontos, falls man hineinsehen will

**Gegenprobe, bevor es weitergeht:** Das Radio muss weiterlaufen.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://iyambae.fm/en/
```

Erwartet: `200`.

---

## Etappe 2 — Die Absenderdomäne nachweisen

Das ist die langwierigste Etappe, und sie besteht aus **zwei Runden**. Azure
prüft nicht auf Zuruf, sondern in Abständen von 15 bis 30 Minuten. Das ist
Azures Takt und hat nichts mit Cloudflare zu tun; Cloudflare hat die Einträge
in Sekunden draußen.

### 2.1 Warum `mail.iyambae.fm` und nicht `iyambae.fm`

Der SPF-Eintrag, den ACS vorgibt, endet auf `-all` — Hard Fail. Stünde er am
Apex, hieße das: **Nur ACS darf je für iyambae.fm senden.** Jeder andere
Absender — ein Mailhoster, GitHub-Benachrichtigungen, ein Kontaktformular —
würde ab dann hart abgelehnt. Ein Apex kann außerdem nur einen SPF-Eintrag
tragen; einen zweiten danebenzustellen geht nicht.

Das ist keine Vorsicht, sondern ein Weg ohne Rückfahrkarte. Die Unterdomäne
trennt außerdem die Reputation der Transaktionsmails vom Rest der Domain.

### 2.2 Runde 1 — der Prüfeintrag

Aus `mailDnsEintraege` den Abschnitt `Domain` nehmen. Er sieht so aus:

```json
"Domain": { "type": "TXT", "name": "mail", "value": "ms-domain-verification=…", "ttl": 3600 }
```

Bei Cloudflare in der Zone `iyambae.fm` eintragen:

| Typ | Name | Wert | Proxy |
|---|---|---|---|
| TXT | `mail` | der `value` aus der Ausgabe | **DNS only** (graue Wolke) |

**Alle Einträge dieser Etappe: DNS only.** Einen Proxy vor einem TXT-Eintrag
gibt es zwar nicht, aber wer eine Zone einmal umstellt, stellt sie gern ganz
um — und der Cloudflare-Proxy muss bei iyambae.fm ohnehin dauerhaft aus
bleiben, sonst bricht das Zertifikat der Container App bei der nächsten
Erneuerung (siehe `infra/README.md`).

Dann prüfen lassen:

```bash
az communication email domain initiate-verification \
  --resource-group iyambae \
  --email-service-name acs-iyambae-mail \
  --name mail.iyambae.fm \
  --verification-type Domain
```

Stand abfragen, bis `Verified` dasteht:

```bash
az communication email domain show \
  -g iyambae --email-service-name acs-iyambae-mail --name mail.iyambae.fm \
  --query verificationStates -o json
```

### 2.3 Runde 2 — SPF und die beiden DKIM-Einträge

Erst **nach** `Verified` aus Runde 1. Vorher lehnt Azure ab.

Aus derselben Ausgabe kommen jetzt `SPF`, `DKIM` und `DKIM2`:

| Typ | Name | Wert | Proxy |
|---|---|---|---|
| TXT | `mail` | `v=spf1 include:spf.protection.outlook.com -all` | DNS only |
| CNAME | `selector1-azurecomm-prod-net._domainkey.mail` | der `value` aus `DKIM` | DNS only |
| CNAME | `selector2-azurecomm-prod-net._domainkey.mail` | der `value` aus `DKIM2` | DNS only |

> **Die genauen Namen und Werte aus der Ausgabe abschreiben, nicht aus dieser
> Tabelle.** Microsoft hat die Selektornamen in der Vergangenheit geändert. Die
> Tabelle zeigt die Form; die Wahrheit steht in `mailDnsEintraege`.

> **Cloudflare-Falle beim SPF-Eintrag:** Der Name `mail` trägt jetzt zwei
> TXT-Einträge — den Prüfeintrag aus Runde 1 und SPF. Das ist richtig so.
> Cloudflares Oberfläche legt beim Bearbeiten gern den bestehenden Eintrag um,
> statt einen zweiten anzulegen. Danach nachzählen: Es müssen zwei sein.

Dann die drei Prüfungen anstoßen:

```bash
for art in SPF DKIM DKIM2; do
  az communication email domain initiate-verification \
    -g iyambae --email-service-name acs-iyambae-mail --name mail.iyambae.fm \
    --verification-type $art
done
```

### 2.4 Zwei Einträge, die Azure NICHT vorgibt — und die trotzdem hingehören

Sie stehen in keiner Ausgabe, weil ACS sie nicht verlangt. Ohne sie landen die
Anmeldemails messbar häufiger im Spam-Ordner, und Microsoft nennt einen
fehlenden MX-Eintrag ausdrücklich als Grund, eine Kontingenterhöhung
abzulehnen.

| Typ | Name | Wert | Bemerkung |
|---|---|---|---|
| MX | `mail` | `0 .` | Null-MX: „Diese Domäne nimmt keine Post an" |
| TXT | `_dmarc.mail` | `v=DMARC1; p=none; rua=mailto:dmarc@iyambae.fm` | **erst `p=none`** |

**Warum `p=none` und nicht gleich `p=reject`:** `p=none` sagt „berichte mir,
lehne nichts ab". Damit sieht man ein bis zwei Wochen lang in den Berichten,
ob wirklich nur ACS für diese Unterdomäne sendet. Wer sofort auf `reject` geht
und dabei einen Absender übersehen hat, merkt es daran, dass Mails still
verschwinden — und ausgerechnet die Anmeldemail ist die, bei der niemand
nachfragt, sondern einfach weggeht.

Nach zwei ruhigen Wochen auf `p=quarantine`, danach auf `p=reject`.

Der Null-MX (`0 .`) ist Absicht: `mail.iyambae.fm` sendet nur. Ein
Punkt als Ziel heißt nach RFC 7505 „hier nimmt niemand Post an" — das ist
ehrlicher als ein MX, der auf einen Server zeigt, der die Post wegwirft.

> **Gemessen am 21.08.2026, und es kostet sonst einen halben Tag:** Domain
> und SPF geprüft reichen **nicht**. Solange DKIM und DKIM2 auf `NotStarted`
> stehen, lehnt Azure die Verknüpfung der Domäne mit der ACS-Ressource ab —
> mit derselben Meldung wie ganz ohne Prüfung
> (`Requested domain is not in a valid state for linking`). DKIM ist hier
> keine Kosmetik für die Zustellbarkeit, sondern harte Vorbedingung.
>
> Und: Azure prüft **nicht von selbst**. Die Einträge können seit Stunden im
> DNS stehen und der Status bleibt `NotStarted`, bis jemand anstößt:
>
> ```bash
> for art in Domain SPF DKIM DKIM2; do
>   az communication email domain initiate-verification >     --domain-name mail.iyambae.fm >     --email-service-name acs-iyambae-mail -g iyambae >     --verification-type $art
> done
> ```

### 2.5 Fertig, wenn das hier grün ist

```bash
az communication email domain show \
  -g iyambae --email-service-name acs-iyambae-mail --name mail.iyambae.fm \
  --query "{status:verificationStates, absender:mailFromSenderDomain}" -o json
```

Alle vier — `Domain`, `SPF`, `DKIM`, `DKIM2` — müssen auf `Verified` stehen.

---

## Etappe 3 — Die ACS-Rollenzuweisung

**Das ist eine Entscheidung, keine Handreichung.** Sie steht hier ungelöst,
weil sie unbequem ist.

### Der Befund

Am 21.08.2026 gegen Microsofts Berechtigungsliste geprüft: Der
Ressourcenanbieter `Microsoft.Communication` veröffentlicht **überhaupt keine
DataActions**. Es gibt also keine eingebaute Rolle nach dem Muster von
„Storage Table Data Contributor", die nur „darf Mail senden" bedeutete und
sonst nichts. Beim Speicherkonto gibt es sie, und deshalb ist der Zugriff dort
sauber eng. Bei ACS gibt es sie nicht.

Nachprüfen, ob sich das inzwischen geändert hat — es wäre die beste denkbare
Antwort auf diesen Abschnitt:

```bash
az role definition list --scope "<acsRessource aus Etappe 1>" \
  --query "[?contains(roleName,'Communication')].{Name:roleName, Id:name}" -o table
```

### Die drei Möglichkeiten

1. **`Contributor` auf die ACS-Ressource — und nur auf sie.** Funktioniert,
   ist mehr Recht als nötig. Die Identität könnte damit die ACS-Ressource
   ändern, ihre Zugriffsschlüssel lesen und sie löschen. Der Schaden bleibt
   auf diese eine Ressource beschränkt; an das Speicherkonto, an die Container
   App oder an die Ressourcengruppe kommt sie nicht.
2. **Eine eigene Rollendefinition** mit nur
   `Microsoft.Communication/CommunicationServices/Read`. Das Richtige — und es
   braucht das Recht, Rollendefinitionen anzulegen (`Owner` oder
   `User Access Administrator` auf dem Abonnement). Ob ein Gastkonto das hat,
   ist zu klären.
3. **Nichts zuweisen.** Der Dienst läuft, nimmt Anmeldungen an, und der
   Mailversand fällt mit `403` aus — sichtbar im Protokoll, nicht still. Wer
   nur Passkey- und Passwortanmeldung braucht, kann so leben.

### Was auf keinen Fall passieren darf

**Keine ACS-Verbindungszeichenfolge in eine Umgebungsvariable.** Sie trägt den
Zugriffsschlüssel im Klartext, läuft nicht ab, und wer sie einmal irgendwohin
kopiert hat, bekommt sie nicht zurück. Der Dienst kann sie ohnehin nicht
lesen: `dienst/src/mail.mjs` kennt ausschließlich `DefaultAzureCredential`.
Wer diesen Weg gehen wollte, müsste erst den Dienst schlechter machen.

### Wenn Möglichkeit 1 gewählt wird

```bash
az role assignment create \
  --assignee-object-id "<dienstObjektId aus Etappe 1>" \
  --assignee-principal-type ServicePrincipal \
  --role "b24988ac-6180-42a0-ab88-20f7382dd24c" \
  --scope "<acsRessource aus Etappe 1>"
```

Dann dieselbe Kennung in die Vorlage geben, damit sie beim nächsten Ausrollen
nicht verlorengeht:

```
--parameters acsRolleId='b24988ac-6180-42a0-ab88-20f7382dd24c'
```

---

## Etappe 4 — Google Cloud Console

Ausführlich mit allen Begründungen: `dienst/FREMDANMELDUNG.md`, Abschnitt 1.
Hier die Reihenfolge und die Werte.

Die Seite heißt seit 2025 **Google Auth Platform**, nicht mehr
*APIs & Services → OAuth consent screen*. Jede Anleitung, die vom alten Ort
spricht, ist älter als die Console.

### 4.1 Vorbedingung, die man leicht übersieht

`iyambae.fm` muss in der **Google Search Console** als Property bestätigt sein
(`search.google.com/search-console`, per DNS-TXT bei Cloudflare) — und zwar
**mit demselben Google-Konto**, das im Cloud-Projekt Owner oder Editor ist.
Liegen Cloud-Projekt und Domainbestätigung auf verschiedenen Konten, klemmt es
genau hier, und die Fehlermeldung sagt es nicht.

### 4.2 Die Schritte

1. **Eigenes Projekt** anlegen, z. B. `iyambae-fm`. Kein bestehendes
   mitbenutzen: Der Zustimmungsbildschirm gehört dem Projekt, nicht dem Client.
2. **Branding:**
   - App name: `IYAMBAE FM`
   - Application home page: `https://iyambae.fm`
   - Privacy policy: `https://iyambae.fm/de/datenschutz`
   - Terms of service: die Nutzungsbedingungen unter `/de/`
   - Authorized domains: `iyambae.fm`
   - Die Startseite **muss** öffentlich erreichbar sein, die Funktion
     beschreiben und auf Datenschutz und Nutzungsbedingungen verlinken. Eine
     reine Anmeldemaske genügt Google nicht.
3. **Audience:** *External*, dann **Publish app**. Den Testing-Modus
   überspringen — bei diesen Bereichen schützt er vor nichts.
4. **Data Access:** genau drei Bereiche, nicht mehr:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`

   **Jeder weitere Bereich kippt die App in den Warnbildschirm und den
   100-Nutzer-Deckel.** Das ist die eine Zeile, an der man nichts ändert.
5. **Clients → Create client → Web application:**
   - Authorized JavaScript origins: **leer lassen.** Der Browser spricht nie
     direkt mit Google; der Codetausch passiert im Container.
   - Authorized redirect URIs: **`https://iyambae.fm/api/google/zurueck`**

   **Nur der Apex, nicht `www`.** Der Dienst baut die Rückkehradresse aus dem
   ersten Eintrag von `ERLAUBTE_URSPRUENGE` — das ist `https://iyambae.fm`.
   Wer auf `www.iyambae.fm` beginnt, kommt auf dem Apex zurück, und das ist
   gewollt. Google verlangt, dass die Adresse beim Tausch **zeichengenau**
   dieselbe ist wie beim Start; ein zusätzlicher `www`-Eintrag hilft nicht,
   sondern verwirrt nur.
6. **Client-ID und Client-Secret kopieren.** Seit 2025 wird das Secret gehasht
   und ist **genau einmal sichtbar**. Verloren heißt: neu erzeugen.
7. **Verify Branding** drücken. Das Ergebnis gilt **7 Tage** — innerhalb dieser
   Frist **Publish branding** klicken, sonst von vorn.

### 4.3 Was danach in die Vorlage geht

```
--parameters googleKennung='<Client-ID>.apps.googleusercontent.com'
--parameters googleGeheimnis='<Client-Secret>'
```

Das Geheimnis landet als Container-Apps-Geheimnis, nicht als Klartext — siehe
`configuration.secrets` in `infra/main.bicep`. Wer es auf der Kommandozeile
übergibt, sollte daran denken, dass es in der Shell-Historie steht; besser
über eine Parameterdatei außerhalb des Repositories oder interaktiv.

---

## Etappe 5 — Apple Developer

Ausführlich: `dienst/FREMDANMELDUNG.md`, Abschnitt 2. **Vier Dinge, und sie
hängen aneinander.** Wer eines überspringt, bekommt beim Codetausch
`invalid_client` — eine Meldung, die nie sagt, welches der vier es war.

### 5.1 App ID

*Certificates, Identifiers & Profiles* → **Identifiers** → **+** → *App IDs* →
*App*

- Description: `IYAMBAE FM`
- Bundle ID (explicit): `fm.iyambae.app`
- Capabilities: **Sign in with Apple** anhaken

Auch ohne iOS-App. Die App ID ist der Anker, an dem alles Weitere hängt.

### 5.2 Service ID — das ist die `client_id`

**Identifiers** → **+** → *Services IDs*

- Description: `IYAMBAE FM Web`
- Identifier: **`fm.iyambae.web`**

**Das ist die `client_id`, nicht die App ID.** Die beiden sehen fast gleich aus
und werden ständig verwechselt; es ist der häufigste Grund für
`invalid_client`.

Speichern, dann **erneut öffnen** → *Sign in with Apple* → **Configure**:

- Primary App ID: die aus 5.1
- Domains and Subdomains: `iyambae.fm`
- Return URLs: **`https://iyambae.fm/api/apple/zurueck`**

> **HTTPS ist Pflicht, `localhost` verboten** — anders als bei Google. Zum
> Ausprobieren braucht es eine echte Adresse oder einen Tunnel mit gültigem
> Zertifikat.

> Der Rückweg von Apple ist ein **POST**, kein GET (`response_mode=form_post`).
> Das ist bei `scope=name email` Pflicht und der Grund, warum die Route in
> `dienst/src/apple.mjs` als POST registriert ist.

#### Der Domainnachweis — hier bricht es ab, wenn man ihn übergeht

Sobald `iyambae.fm` unter *Domains and Subdomains* steht, erscheint neben der
Domain ein **Download**-Knopf. Dahinter liegt eine Datei:

```
apple-developer-domain-association.txt
```

Apple holt sie unter genau dieser Adresse ab:

```
https://iyambae.fm/.well-known/apple-developer-domain-association.txt
```

**Die Reihenfolge ist zwingend, und sie ist nicht die, die der Knopf nahelegt:**

1. Datei bei Apple herunterladen
2. Datei nach `.well-known/` im Repository legen
3. Abbild neu bauen, hochschieben, **ausrollen**
4. Selbst nachsehen, dass sie wirklich ankommt:
   ```bash
   curl -i https://iyambae.fm/.well-known/apple-developer-domain-association.txt
   ```
   Erwartet: **200** und der blanke Inhalt.
5. **Erst jetzt** bei Apple auf *Verify* drücken

Wer in Schritt 5 drückt, bevor 3 durch ist, bekommt eine Fehlermeldung, die
nicht sagt, was fehlt.

> **Warum das eine eigene Weiche in nginx brauchte:** Ohne sie fiele
> `/.well-known/…` in `location /`, von dort in die Sprachweiche — und Apple
> bekäme eine **302 auf `/de/`** statt der Datei. Der Block steht seit dem
> 21.08.2026 in `deploy/nginx.conf` (`location ^~ /.well-known/`) und
> antwortet auf eine fehlende Datei mit **404**, nicht mit einer Umleitung:
> Eine Umleitung sähe nach Erfolg aus.
>
> Nachprüfen lässt sich das schon jetzt, ohne Apple — `curl` auf denselben
> Pfad muss **404** liefern, nicht 302. Kommt 302, ist ein alter Stand
> ausgerollt.

### 5.3 Key mit „Sign in with Apple"

**Keys** → **+**

- Key Name: `IYAMBAE Anmeldung`
- **Sign In with Apple** anhaken → *Configure* → Primary App ID wählen
- *Continue* → *Register* → **Download**

Es entsteht `AuthKey_XXXXXXXXXX.p8`.

> **Nur ein einziges Mal herunterladbar.** Danach nie wieder. Verloren heißt:
> Key widerrufen, neuen anlegen, `appleKeyId` und `appleSchluessel` neu setzen.

Notieren:

- **Key ID** — die zehn Zeichen im Dateinamen → `appleKeyId`
- **Team ID** — oben rechts im Portal unter *Membership* → `appleTeamId`

### 5.4 Absenderdomäne für `@privaterelay.appleid.com`

**Erst nach Etappe 2.** Apple prüft SPF und lehnt sonst ab.

Sehr viele Nutzer verbergen ihre Adresse hinter Apples Weiterleitung. Post
dorthin kommt an — aber nur, wenn der Absender bei Apple registriert ist.
Sonst verschwinden die Bestätigungsmails wortlos, und der Nutzer sieht nur,
dass nichts passiert.

*Certificates, Identifiers & Profiles* → **Services** →
*Sign in with Apple for Email Communication* → **Configure**:

- Domains: `mail.iyambae.fm`
- Email Sources: `konto@mail.iyambae.fm`
- SPF prüfen lassen

### 5.5 Es gibt kein Apple-Client-Geheimnis einzutragen

Apples Client-Geheimnis ist kein Wert aus dem Portal, sondern ein JWT, das man
selbst mit dem `.p8`-Schlüssel signiert. Apple erlaubt ihm höchstens sechs
Monate Laufzeit. `dienst/src/apple.mjs` erzeugt es **bei Bedarf im Dienst**,
mit 30 Minuten Laufzeit. Die vier Werte von oben laufen nicht ab.

**Es gibt hier nichts zu erneuern** — und genau darum ist es so gebaut. Ein
von Hand erzeugtes Halbjahres-JWT hört an irgendeinem Dienstagmorgen auf zu
funktionieren, ohne dass jemand etwas geändert hat.

### 5.6 Was danach in die Vorlage geht

```
--parameters appleTeamId='<10 Zeichen>'
--parameters appleKeyId='<10 Zeichen aus dem Dateinamen>'
--parameters appleDienstId='fm.iyambae.web'
--parameters appleSchluessel='-----BEGIN PRIVATE KEY-----\nMIGT…\n-----END PRIVATE KEY-----\n'
```

> **Die Zeilenumbrüche im Schlüssel als zwei Zeichen schreiben** (`\` und `n`),
> nicht als echte Umbrüche. Container-Apps-Geheimnisse tragen echte Umbrüche
> nicht durch jede Werkzeugkette; `leseUmgebung()` in `dienst/src/fremd.mjs`
> biegt sie beim Lesen zurück.

---

> **Achtung bei der Etappenfolge:** Etappe 5 verlangt mittendrin ein
> Ausrollen — Apples Domainnachweis muss ausgeliefert werden, bevor die
> Prüfung bei Apple gedrückt wird (5.2). Das ist das einzige Ausrollen vor
> Etappe 6, und es geht ohne `mitAnmeldung`; es liefert nur eine Datei aus.

## Etappe 6 — Den Sidecar einschalten

### 6.1 Erst das Abbild bauen und hochschieben

```bash
cd dienst
SHA=$(git rev-parse --short HEAD)
docker build -t ghcr.io/michaelfricke-sudo/iyambae-konto:$SHA .
docker push ghcr.io/michaelfricke-sudo/iyambae-konto:$SHA
```

Das Paket muss **öffentlich** sein, sonst braucht Container Apps ein
Registry-Geheimnis. Nach dem ersten Push in den GitHub-Paketeinstellungen
umstellen. Zum Hochschieben braucht das Token `write:packages`:
`gh auth refresh -h github.com -s write:packages`.

**Niemals `:latest`.** Container Apps legt eine Überarbeitung nur an, wenn sich
die Spezifikation ändert — bleibt der Text gleich, passiert nichts, und `az`
meldet trotzdem Erfolg. Das hat beim Web-Container zweimal lautlos
zugeschlagen; die Geschichte steht in `infra/README.md`.

### 6.2 Dann ausrollen

```bash
az deployment group create \
  --resource-group iyambae \
  --name iyambae-anmeldung-2 \
  --template-file infra/main.bicep \
  --parameters \
      abbild='ghcr.io/michaelfricke-sudo/iyambae-radio:<web-sha>' \
      kontoAbbild="ghcr.io/michaelfricke-sudo/iyambae-konto:$SHA" \
      mitAnmeldung=true \
      googleKennung='…' \
      appleTeamId='…' appleKeyId='…' appleDienstId='fm.iyambae.web' \
      acsRolleId='…'
```

Die beiden Geheimnisse (`googleGeheimnis`, `appleSchluessel`) sind mit
`@secure()` ausgezeichnet. Sie erscheinen weder in der Ausgabe noch in
`az deployment show`.

### 6.3 Nachsehen, ob es läuft

```bash
# Beide Container in der Replik?
az containerapp replica list -n ca-iyambae-web -g iyambae \
  --query "[].properties.containers[].{name:name, ready:ready, restarts:restartCount}" -o table

# Antwortet der Dienst durch nginx hindurch?
curl -s -o /dev/null -w "%{http_code}\n" https://iyambae.fm/api/leben
```

Erwartet: `204`. Kommt `503` mit `{"fehler":"dienst_schlaeft"}`, läuft der
Sidecar nicht — dann in die Protokolle:

```bash
az containerapp logs show -n ca-iyambae-web -g iyambae --container konto --tail 100
```

### 6.4 Die eine Zeile, die der Dienst beim Start schreibt

Steht im Protokoll `speicher_nur_im_arbeitsspeicher`, ist `TABELLEN_ENDPUNKT`
nicht angekommen — **alle Konten liegen dann im Arbeitsspeicher und sind beim
nächsten Neustart weg.** Das ist kein Betriebszustand, sondern ein Testmodus,
der versehentlich in Produktion gelandet ist. Sofort nachsehen, bevor sich
jemand anmeldet.

Steht dort `start` mit `grund: azure`, ist alles richtig.

---

## Was danach noch offen ist

Diese Punkte sind **nicht** Teil der Konsolen-Arbeit und stehen hier nur,
damit sie nicht verschwinden.

- **Mehr als eine Replik.** `state`, `nonce`, PKCE-Verifier und die
  WebAuthn-Herausforderungen liegen im Arbeitsspeicher. `hoechstExemplare`
  steht auf 3, die Skalierungsregel greift ab 50 gleichzeitigen Anfragen — dann
  kann der Rückweg von Google oder Apple eine andere Replik treffen als der
  Start, und die Anmeldung scheitert scheinbar zufällig. Die drei möglichen
  Wege stehen als Kommentar im `scale`-Block von `infra/main.bicep`. Mail-,
  Code- und Passwortanmeldung sind nicht betroffen.
- **Content-Security-Policy.** In `deploy/nginx.conf` steht heute keine. Mit
  einer Anmeldung gehört eine hin, sonst kann ein eingeschleustes Skript den
  Anmeldezustand mitlesen.
- **Drosselung der Anmeldewege in nginx.** `/api/` ist heute nicht gedrosselt.
  `dienst/FREMDANMELDUNG.md`, Abschnitt 7.2, nennt die Wege und den
  Sonderfall: Apples Rückweg darf **nicht** nach IP gedrosselt werden, er
  kommt von Apples Adressen.
- **`/api/` im Service Worker — schon erledigt, hier nur zur Bestätigung.**
  `sw.js` reicht `/api/` und `/messung` unangetastet durch (Zeile 136). Das
  muss so bleiben: Eine zwischengespeicherte Antwort von `/api/platten` gehört
  einem angemeldeten Menschen und bekäme sonst der Nächste vorgesetzt, der an
  diesem Gerät die Seite öffnet — auf einem Familien-Tablett keine
  Unschönheit, sondern eine Datenpanne.
- **`mindestExemplare`.** Steht auf 0. Der Kaltstart wurde am 20.08.2026 mit
  **8,2 s** gemessen. Sobald ein Bestätigungslink aus einer E-Mail auf einen
  schlafenden Container trifft, ist das die teuerste Stelle im ganzen Ablauf —
  ausgerechnet dort, wo jemand zum ersten Mal Vertrauen fasst. Umstellen
  kostet laufend Geld; die Rechnung steht in `infra/README.md`.
- **DMARC von `p=none` auf `p=reject`.** Siehe Etappe 2.4. In den Kalender,
  zwei Wochen nach der ersten echten Mail.
