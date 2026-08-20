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
  --parameters abbild='ghcr.io/iyambae-lifetree/iyambae-radio:latest'
```

Die Vorlage ist wiederholbar: Derselbe Aufruf mit geänderten Werten ändert nur,
was sich unterscheidet.

## Der eine Schalter, der Geld kostet

`mindestExemplare` steht auf **0**. Der Container schläft bei Stille ein, und
der erste Besucher danach wartet auf den Kaltstart — für ein kleines
nginx-Abbild grob **5 bis 10 Sekunden**. Microsofts Doku nennt dazu keine Zahl,
nur die Einflussgrößen; die Spanne stammt aus Messungen Dritter.

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
| CNAME | `apps` | dieselbe Adresse wie `www` |
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

Der Apex wird mit `HTTP` geprüft, Unterdomains mit `CNAME`.

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

```bash
docker build -t ghcr.io/iyambae-lifetree/iyambae-radio:latest .
docker push ghcr.io/iyambae-lifetree/iyambae-radio:latest
az containerapp update -n ca-iyambae-web -g iyambae \
  --image ghcr.io/iyambae-lifetree/iyambae-radio:latest
```

Der letzte Schritt ist nötig: Container Apps sucht **nicht** von selbst nach
einem neuen Abbild unter derselben Marke. Ohne `update` bleibt die alte
Fassung stehen.

Zum Hochschieben braucht das GitHub-Token das Recht `write:packages`:
`gh auth refresh -h github.com -s write:packages`.

## Was noch fehlt

Eine Auslieferung über GitHub Actions statt von Hand. Sie braucht eine
Anmeldung von GitHub nach Azure — sauber wäre OIDC über eine
Entra-App-Registrierung. Die verlangt Verzeichnisrechte, die ein Gastkonto
nicht ohne Weiteres hat; das ist mit Sāmi-Ra bzw. dem Verzeichnis-Admin zu
klären.
