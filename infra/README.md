# Auslieferung nach Azure

`iyambae.fm` und `apps.iyambae.fm` laufen aus **einem** Container in Azure
Container Apps. Getrennt wird im nginx über `server_name`, siehe
`../deploy/nginx.conf`.

```
  Cloudflare DNS  (iyambae.fm)        graue Wolke, kein Proxy
        │
        ▼
  cae-iyambae            Container-Apps-Umgebung, germanywestcentral
   └── ca-iyambae-web    nginx, Port 8080, minReplicas 0
        ├── iyambae.fm        → /srv/radio
        ├── www.iyambae.fm    → /srv/radio
        └── apps.iyambae.fm   → /srv/apps

  log-iyambae            Log Analytics, 30 Tage
```

## Anlegen und aktualisieren

```bash
az deployment group create \
  --resource-group iyambae \
  --name iyambae-basis \
  --template-file infra/main.bicep \
  --parameters abbild='ghcr.io/michaelfricke-sudo/iyambae-radio:latest'
```

Die Vorlage ist wiederholbar: Derselbe Aufruf mit geänderten Werten ändert nur,
was sich unterscheidet.

## Der eine Schalter, der Geld kostet

`mindestExemplare` steht auf **0**. Der Container schläft bei Stille ein, und
der erste Besucher danach wartet auf den Kaltstart.

**Am 20.08.2026 gemessen, nicht geschätzt:**

| | Zeit |
|---|---|
| erste Anfrage nach Ruhe | **8,2 s** |
| danach | 0,08 – 0,10 s |

Faktor hundert. Microsofts Doku nennt dazu keine Zahl, nur die Einflussgrößen —
diese hier stammt aus einer echten Messung gegen genau dieses Abbild.

Das monatliche Freikontingent des Consumption-Plans beträgt 180.000
vCPU-Sekunden, 360.000 GiB-Sekunden und 2 Millionen Anfragen je Abonnement.
Mit `mindestExemplare: 0` bleibt eine Seite dieser Größe praktisch vollständig
darin — **rund 0 €**.

`mindestExemplare: 1` bei 0,25 vCPU und 0,5 GiB verbraucht dagegen rechnerisch
etwa 657.000 vCPU-Sekunden und 1.314.000 GiB-Sekunden im Monat und liegt damit
**sicher über** dem Freikontingent. Weil ein Exemplar bei wenig Verkehr die
meiste Zeit als „untätig" gilt und günstiger abgerechnet wird, dürfte der
Betrag im niedrigen einstelligen Euro-Bereich landen — die genauen Sätze je
Sekunde stehen nicht maschinenlesbar in der Preisliste, für eine belastbare
Zahl den Azure-Preisrechner benutzen.

Umstellen:

```bash
az deployment group create -g iyambae --template-file infra/main.bicep \
  --parameters mindestExemplare=1
```

Wer den Kaltstart ohne laufende Kosten mildern will: Es gibt bei Container Apps
**keine** Zwischenstufe. Der einzige von Microsoft dokumentierte Weg ist, die
Anwendung vor erwarteter Nutzung von außen anzustoßen — also ein geplanter
Aufruf, kein Plattformmerkmal.

## Eigene Domains

Reihenfolge zwingend: **erst DNS, dann binden.** Azure prüft beim Binden, und
die Prüfung wiederholt sich bei jeder Zertifikatserneuerung.

Die beiden Werte holen:

```bash
az containerapp env show -n cae-iyambae -g iyambae \
  --query properties.staticIp -o tsv
az containerapp show -n ca-iyambae-web -g iyambae \
  --query properties.customDomainVerificationId -o tsv
```

Bei Cloudflare eintragen — alle Einträge **DNS only**, graue Wolke:

| Typ | Name | Wert |
|---|---|---|
| A | `@` | die statische IP |
| TXT | `asuid` | die Prüfkennung |
| CNAME | `www` | die Adresse der Anwendung |
| TXT | `asuid.www` | dieselbe Prüfkennung |
| A **oder** CNAME | `apps` | die statische IP bzw. die Adresse der Anwendung |
| TXT | `asuid.apps` | dieselbe Prüfkennung |

Die Prüfkennung ist für alle Hostnamen dieselbe, sie hängt an der Anwendung.

Dann binden, je Hostname zweimal:

```bash
az containerapp hostname add  --hostname iyambae.fm -g iyambae -n ca-iyambae-web
az containerapp hostname bind --hostname iyambae.fm -g iyambae -n ca-iyambae-web \
  --environment cae-iyambae --validation-method HTTP

az containerapp hostname add  --hostname www.iyambae.fm -g iyambae -n ca-iyambae-web
az containerapp hostname bind --hostname www.iyambae.fm -g iyambae -n ca-iyambae-web \
  --environment cae-iyambae --validation-method CNAME
```

**Die Prüfmethode richtet sich nach dem Record-Typ, nicht nach der Ebene.**
Zeigt ein Name per CNAME auf die Anwendung, gilt `--validation-method CNAME`;
zeigt er per A-Record auf die statische IP, gilt `HTTP` — auch bei einer
Unterdomain. `apps.iyambae.fm` läuft hier über einen A-Record und wurde mit
`HTTP` gebunden. Die Doku legt für Unterdomains CNAME nahe; nötig ist es
nicht.

### Drei Fallstricke

**Der Cloudflare-Proxy muss dauerhaft aus bleiben.** Nicht nur zur
Einrichtung. Microsofts Doku nennt Cloudflare namentlich als Zwischenstation,
die „certificate issuance **and renewal**" blockiert, und verlangt, dass die
Bedingungen „at all times" erfüllt sind. Ein Proxy, den man nur zum Binden
ausschaltet, bricht das Zertifikat bei der nächsten Erneuerung.

**Am Apex geht kein CNAME-Flattening.** Azure verlangt dort einen echten
A-Record auf die statische IP.

**CAA-Records.** Existiert auf der Domain ein CAA-Eintrag, muss
`0 issue digicert.com` enthalten sein — das kostenlose verwaltete Zertifikat
kommt von DigiCert.

## Das Abbild

Es liegt öffentlich in der GitHub Container Registry, damit keine Azure
Container Registry nötig ist (ACR Basic kostet rund 4,50 € im Monat für
nichts). Öffentliche Abbilder zieht Container Apps ohne hinterlegte
Zugangsdaten.

**Paket öffentlich, Repository privat — das sind zwei getrennte Schalter.**
Im Abbild steckt nur die ausgelieferte Webseite: genau das, was jeder Browser
beim Öffnen von iyambae.fm ohnehin lädt. Quellen, `docs/`, `Scripts/` und die
Git-Historie hält `.dockerignore` draußen. Die Alternative wäre ein privates
Paket samt Lesetoken als Geheimnis in Azure — ein Geheimnis mehr, das ablaufen
und gestohlen werden kann, für keinen Gewinn.

**Der Namensraum ist vorläufig.** Das Abbild liegt unter `michaelfricke-sudo`,
weil das Anlegen von Paketen unter `iyambae-lifetree` eine Org-Berechtigung
verlangt. Sobald sie erteilt ist, gehört es unter die Organisation — sonst
hängt die Auslieferung an einem einzelnen Konto.

```bash
SHA=$(git rev-parse --short HEAD)
docker build -t ghcr.io/michaelfricke-sudo/iyambae-radio:$SHA .
docker push ghcr.io/michaelfricke-sudo/iyambae-radio:$SHA
az containerapp update -n ca-iyambae-web -g iyambae \
  --image ghcr.io/michaelfricke-sudo/iyambae-radio:$SHA
```

### Immer eine eigene Marke je Stand — niemals `:latest`

Das ist kein Stilhinweis, sondern die Behebung eines Fehlers, der zweimal
zugeschlagen hat und dabei **völlig lautlos** war.

Container Apps legt eine neue Überarbeitung nur an, wenn sich die
**Spezifikation** ändert. Wird immer nach `:latest` geschoben und dann
`--image …:latest` gesetzt, ändert sich am Text nichts — kein neuer Stand,
keine Fehlermeldung. `az` meldet `provisioningState: Succeeded`, und die
Anwendung liefert weiter das alte Abbild aus.

Aufgefallen ist es erst, als eine neu hinzugefügte Datei mit `200 text/html`
antwortete statt mit ihrem Inhalt: Der Service-Worker-Rückfall lieferte die
`index.html`, weil die Datei im laufenden Abbild gar nicht existierte. Eine
zuvor ausgelieferte Manifest-Änderung hing zu dem Zeitpunkt schon eine Stunde
unbemerkt fest.

Mit der Commit-Kennung als Marke ändert sich der Text bei jedem Stand, die
Überarbeitung entsteht zuverlässig — und man sieht im Portal, welcher Commit
gerade läuft.

**Nach jeder Auslieferung prüfen, nicht annehmen:**

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  https://iyambae.fm/assets/wasm/retuner.wasm
```

`text/html` bedeutet: Die Datei fehlt, der SPA-Rückfall antwortet.

Zum Hochschieben braucht das GitHub-Token das Recht `write:packages`:
`gh auth refresh -h github.com -s write:packages`.

## Was noch fehlt

Eine Auslieferung über GitHub Actions statt von Hand. Sie braucht eine
Anmeldung von GitHub nach Azure — sauber wäre OIDC über eine
Entra-App-Registrierung. Die verlangt Verzeichnisrechte, die ein Gastkonto
nicht ohne Weiteres hat; das ist mit Sāmi-Ra bzw. dem Verzeichnis-Admin zu
klären.
