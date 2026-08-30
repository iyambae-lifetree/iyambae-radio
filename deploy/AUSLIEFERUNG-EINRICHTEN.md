# Die Auslieferung einrichten — einmalig

`.github/workflows/ausliefern.yml` liegt bereit und läuft bei jedem Push auf
`main`. Damit sie sich bei Azure anmelden darf, fehlt noch **ein** Schritt, und
den muss ein Mensch gehen: Es entsteht dabei eine Kennung im Verzeichnis, und
das ist nichts, was eine Sitzung nebenbei anlegt.

Danach läuft die Auslieferung von selbst, und Vorgang `432hz-radio#14` ist
erledigt — nicht nur diesmal, sondern dauerhaft.

## Warum OIDC und kein hinterlegtes Passwort

Der gewohnte Weg wäre ein Dienstprinzipal mit Geheimnis, das als
`AZURE_CREDENTIALS` in den Repository-Einstellungen liegt. Dagegen sprechen
drei Dinge:

- **Es läuft ab.** Meist nach einem Jahr, und dann steht die Auslieferung
  wieder — genau der Zustand, den diese Datei abschaffen soll.
- **Es ist ein Geheimnis, das existiert.** Es kann in ein Protokoll geraten,
  in eine Fehlermeldung, in eine Zwischenablage.
- **Es gilt überall.** Ein Dienstprinzipal mit Geheimnis kann sich von jedem
  Rechner der Welt anmelden.

Mit OIDC stellt GitHub für jeden Lauf ein Token aus, das **Minuten** gültig
ist. Entra vertraut ihm nur, wenn es aus **diesem** Repository und von
**diesem** Zweig kommt. Es gibt kein Geheimnis, das man verlieren könnte.

## Die Befehle

Im Terminal, angemeldet als du selbst. In Claude Code geht das mit
vorangestelltem `!`, dann landet die Ausgabe gleich im Gespräch.

### 1 · Eine Kennung anlegen

```bash
az ad app create --display-name "iyambae-ausliefern" --query appId -o tsv
```

Die ausgegebene Kennung ist `AZURE_CLIENT_ID`. Sie im Folgenden als `$APP_ID`
verwenden.

```bash
APP_ID="<die Kennung von oben>"
az ad sp create --id "$APP_ID" --query id -o tsv
```

### 2 · Vertrauen für genau dieses Repository und diesen Zweig

```bash
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "iyambae-radio-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:iyambae-lifetree/iyambae-radio:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

`subject` ist die eigentliche Absicherung. Ein Lauf aus einem anderen
Repository, von einem anderen Zweig oder aus einem Fork bekommt kein Token —
Entra prüft die Zeichenkette genau.

**Wer `workflow_dispatch` auch von einem anderen Zweig auslösen will**, braucht
dafür eine zweite Zuordnung. Bewusst nicht vorbereitet: Eine Auslieferung, die
von jedem Zweig laufen darf, ist keine Absicherung mehr.

### 3 · Rechte geben — so wenig wie möglich

Zwei Rollen, beide nur auf der Ressourcengruppe `iyambae`, nicht auf dem Abo:

```bash
ABO="13783e3f-a143-4c31-a5b7-e0d41a4caacc"
BEREICH="/subscriptions/$ABO/resourceGroups/iyambae"

# bauen und in die Registrierung schieben
az role assignment create --assignee "$APP_ID" \
  --role "AcrPush" --scope "$BEREICH"

# die Ueberarbeitung der Container-App setzen
az role assignment create --assignee "$APP_ID" \
  --role "Contributor" --scope "$BEREICH"
```

> **Warum `Contributor` und nicht enger:** `az acr build` legt einen Bau-Auftrag
> an, und `containerapp update` schreibt an der App. Eine engere eingebaute
> Rolle, die beides abdeckt, gibt es nicht. Wer es sauberer will, baut eine
> eigene Rollendefinition mit `Microsoft.App/containerApps/write` und
> `Microsoft.ContainerRegistry/registries/scheduleRun/action` — das ist die
> Kür, nicht die Pflicht, und `Contributor` auf **einer Ressourcengruppe** ist
> deutlich enger als das, was heute von diesem PC aus möglich ist.

### 4 · Die drei Werte im Repository hinterlegen

```bash
gh secret set AZURE_CLIENT_ID       -R iyambae-lifetree/iyambae-radio -b "$APP_ID"
gh secret set AZURE_TENANT_ID       -R iyambae-lifetree/iyambae-radio -b "d1715f28-e7e5-439c-8d29-3805440c45d5"
gh secret set AZURE_SUBSCRIPTION_ID -R iyambae-lifetree/iyambae-radio -b "13783e3f-a143-4c31-a5b7-e0d41a4caacc"
```

Keiner der drei Werte ist ein Geheimnis im engeren Sinn — Kennungen, keine
Passwörter. Sie liegen trotzdem als Secret, damit sie nicht in jedem
Protokoll stehen.

### 5 · Nachsehen, ob es geht

```bash
gh workflow run ausliefern.yml -R iyambae-lifetree/iyambae-radio
gh run watch -R iyambae-lifetree/iyambae-radio
```

Der Lauf endet mit der Byte-Probe gegen die live liegenden Dateien. Läuft er
durch, ist die Auslieferung nachgewiesen und nicht behauptet.

## Was der Lauf tut

| Schritt | |
|---|---|
| Anmelden | OIDC, kurzlebiges Token |
| Abbild bauen | `az acr build`, serverseitig; Stufe 1 des Dockerfiles bricht ab, wenn der Sprachzerleger die Vorlage nicht zeichengenau wiedergibt |
| Überarbeitung setzen | `az containerapp update --container-name web` |
| Gesund? | wartet, bis die neue Überarbeitung `Healthy` ist **und** 100 % Verkehr trägt |
| Nachsehen | holt Dateien von der Live-Seite und hält ihre **Byte-Zahl** gegen den Quellbaum |

Der letzte Schritt ist der wichtigste und der Grund, warum dieser Lauf mehr ist
als Bequemlichkeit: **Auf dieser Seite antworten fehlende Dateien mit 200 und
HTML** (Vorgang `#11`). Ein Statuscode beweist hier gar nichts. Die Byte-Zahl
schon.

## Was er nicht tut

- **Die Programmdateien anfassen.** DMG, EXE und DEB liegen im Blob-Speicher
  `stiyambaedateienynkjzroa`, nicht im Abbild — `/herunterladen/` leitet per
  302 dorthin um. Eine neue Tuner-Fassung wird hochgeladen, nicht ausgeliefert.
  **`PRUEFSUMMEN.txt` gehört jedes Mal mitgezogen.**
- **Bei Änderungen an `.md`-Dateien laufen.** `paths-ignore`. `OFFEN.md` zu
  ändern soll keine Überarbeitung kosten.
- **Zurückrollen.** Bleibt die neue Überarbeitung ungesund, schaltet Azure den
  Verkehr gar nicht erst um — live steht dann weiter die vorige. Der Lauf
  meldet es und listet die aktiven Überarbeitungen auf.

## Wenn es schiefgeht

**`AADSTS70021: No matching federated identity record found`** — der `subject`
aus Schritt 2 passt nicht zum Lauf. Bei einem Push auf `main` muss dort
`repo:iyambae-lifetree/iyambae-radio:ref:refs/heads/main` stehen, Zeichen für
Zeichen.

**`AuthorizationFailed` beim Bauen oder Setzen** — Schritt 3 fehlt oder greift
noch nicht. Rollenzuweisungen brauchen gelegentlich ein paar Minuten.

**Der Bau läuft, die Probe schlägt fehl** — dann liegt etwas anderes live als
gebaut wurde. Nicht den Lauf wiederholen, sondern nachsehen:

```bash
az acr task list-runs --registry criyambaejdgjecajzb --top 3 -o table
az containerapp revision list -n ca-iyambae-web -g iyambae \
  --query "[?properties.active].{Name:name,Gesund:properties.healthState,Verkehr:properties.trafficWeight}" -o table
```
