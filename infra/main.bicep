/*
  IYAMBAE — Auslieferung über Azure Container Apps.

  Ein Container, zwei Hostnamen: iyambae.fm liefert das Radio,
  apps.iyambae.fm die Seite für die Apps. Getrennt wird im nginx über
  server_name, siehe deploy/nginx.conf.

  Bewusst auf Kosten getrimmt:
  - Consumption-Profil, keine dedizierten Knoten
  - minReplicas 0, der Container schläft bei Stille ein
  - Image aus der GitHub Container Registry, öffentlich — spart eine
    Azure Container Registry (ACR Basic wären ~4,50 €/Monat für nichts)
  - Log Analytics mit 30 Tagen Aufbewahrung; die ersten 5 GB Aufnahme je
    Monat sind frei und für eine Seite dieser Größe reichlich

  Der Preis von minReplicas 0 ist der Kaltstart: Der erste Besucher nach
  einer Ruhephase wartet. Wer das nicht will, setzt `mindestExemplare` auf 1
  — das kostet dann aber laufend, siehe README in diesem Ordner.
*/

@description('Kurzname, geht in alle Ressourcennamen ein.')
param name string = 'iyambae'

@description('Region. Der übrige Bestand liegt in germanywestcentral.')
param location string = resourceGroup().location

@description('Vollständiger Bildname samt Marke.')
param abbild string = 'ghcr.io/iyambae-lifetree/iyambae-radio:latest'

@description('Wie viele Exemplare mindestens laufen. 0 = schläft ein, kein Dauerbetrieb, aber Kaltstart.')
@minValue(0)
@maxValue(5)
param mindestExemplare int = 0

@description('Obergrenze. Drei reichen weit für statische Auslieferung.')
@minValue(1)
@maxValue(30)
param hoechstExemplare int = 3

var marken = {
  anwendung: 'iyambae'
  umgebung: 'prod'
  verantwortlich: 'iyambae-lifetree'
  verwaltetVon: 'bicep'
}

// ── Protokolle ──────────────────────────────────────────────────────
resource protokolle 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${name}'
  location: location
  tags: marken
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    features: {
      // Keine dauerhafte Datensammlung über das Nötige hinaus.
      immediatePurgeDataOn30Days: true
    }
  }
}

// ── Umgebung ────────────────────────────────────────────────────────
resource umgebung 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${name}'
  location: location
  tags: marken
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: protokolle.properties.customerId
        sharedKey: protokolle.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

// ── Die Anwendung ───────────────────────────────────────────────────
resource seite 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${name}-web'
  location: location
  tags: marken
  identity: {
    // Für später: Zugriff auf Key Vault oder Datenhaltung ohne Passwörter.
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: umgebung.id
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      /*
        Keine `registries`-Angabe: Das Abbild liegt öffentlich in der GitHub
        Container Registry. Wird es später privat, gehören hier ein
        Registry-Eintrag und ein Geheimnis hin — dann aber über Key Vault,
        nicht als Klartext in dieser Datei.
      */
    }
    template: {
      containers: [
        {
          name: 'web'
          image: abbild
          resources: {
            // Kleinste zulässige Kombination im Consumption-Profil.
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Readiness'
              httpGet: { path: '/', port: 8080 }
              initialDelaySeconds: 2
              periodSeconds: 10
            }
            {
              type: 'Liveness'
              httpGet: { path: '/', port: 8080 }
              initialDelaySeconds: 5
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: mindestExemplare
        maxReplicas: hoechstExemplare
        rules: [
          {
            name: 'nach-anfragen'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

@description('Die von Azure vergebene Adresse. Ziel für den CNAME bei Cloudflare.')
output adresse string = seite.properties.configuration.ingress.fqdn

@description('Feste ausgehende und eingehende Adresse der Umgebung. Ziel für den A-Record am Apex.')
output statischeIP string = umgebung.properties.staticIp

@description('Wird für die TXT-Einträge asuid.<name> zur Domainprüfung gebraucht.')
output pruefkennung string = seite.properties.customDomainVerificationId
