/*
  Admin-Dashboard für iyambae.fm — als Azure-Arbeitsmappe.

  Warum so und nicht als Seite mit Anmeldung: Die Zahlen liegen bereits in
  Log Analytics, und wer sie sehen darf, regelt Azure über Rollen. Ein
  Admin-Bereich mit eigener Anmeldung wäre ein zweites Rechtesystem neben
  einem, das es schon gibt — mehr Code, mehr Angriffsfläche, kein Gewinn.

  Zugriff einrichten:

      az role assignment create --assignee <mail@samira> \
        --role "Monitoring Reader" \
        --scope /subscriptions/<abo>/resourceGroups/iyambae

  Damit sieht Sāmi-Ra die Zahlen, kann aber nichts ändern.

  WAS HIER NICHT STEHT, UND WARUM:

  Welcher Sender wie oft gehört wird. Die Ströme laufen direkt vom Browser
  zum Sender und berühren diesen Server nie — in keinem Protokoll steht, wer
  was hört. Messbar wäre das nur, wenn die Webseite es meldet, und das wäre
  Verfolgung mit Einwilligungspflicht. Bewusst nicht gebaut.

  Besucheradressen sind vor dem Schreiben gekürzt (siehe deploy/nginx.conf).
  "Besucher" unten ist deshalb eine Schätzung, kein Zählwert.
*/

@description('Name des Log-Analytics-Arbeitsbereichs.')
param protokolle string = 'log-iyambae'

@description('Region.')
param location string = resourceGroup().location

resource arbeitsbereich 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: protokolle
}

var abfragen = {
  besucheProTag: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| where isnotempty(E.pfad) and E.status == "200"\n| where E.pfad in ("/", "/index.html")\n| summarize Seitenaufrufe = count(), Besucher = dcount(tostring(E.besucher)) by bin(TimeGenerated, 1d)\n| render timechart'

  woherKommen: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| where isnotempty(E.verweis) and E.verweis !startswith "https://iyambae.fm"\n| summarize Aufrufe = count() by Verweisquelle = tostring(E.verweis)\n| top 15 by Aufrufe desc'

  geraete: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| where E.pfad in ("/", "/index.html")\n| extend Browser = case(\n    E.browser has "Firefox", "Firefox",\n    E.browser has "Edg/", "Edge",\n    E.browser has "Chrome", "Chrome",\n    E.browser has "Safari", "Safari",\n    E.browser has "curl", "Werkzeuge",\n    "Sonstige")\n| extend Art = iff(E.browser has_any ("Android", "iPhone", "Mobile"), "Handy", "Rechner")\n| summarize Aufrufe = count() by Browser, Art\n| order by Aufrufe desc'

  appsSeite: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| where E.pfad startswith "/apps" or E.pfad == "/"\n| summarize Aufrufe = count() by Seite = tostring(E.pfad), bin(TimeGenerated, 1d)\n| render columnchart'

  installiert: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| where E.pfad == "/manifest.webmanifest"\n| summarize Abrufe = count(), Geraete = dcount(tostring(E.besucher)) by bin(TimeGenerated, 1d)\n| render timechart'

  fehler: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| where Log_s has "fehlerbericht"\n| extend E = parse_json(Log_s)\n| extend B = parse_json(tostring(E.bericht))\n| summarize Anzahl = count(), Zuletzt = max(TimeGenerated) by Fehler = tostring(B.text), Fassung = tostring(B.fassung)\n| order by Anzahl desc'

  langsam: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(7d)\n| extend E = parse_json(Log_s)\n| where isnotempty(E.dauer)\n| summarize Mittel = avg(todouble(E.dauer)), P95 = percentile(todouble(E.dauer), 95), Aufrufe = count() by Pfad = tostring(E.pfad)\n| where Aufrufe > 20\n| order by P95 desc\n| take 15'
}

var inhalt = {
  version: 'Notebook/1.0'
  items: [
    {
      type: 1
      content: {
        json: '# IYAMBAE — Zahlen\n\nAlles aus den Zugriffsprotokollen des Containers. **Besucheradressen sind gekürzt**, „Besucher" ist deshalb eine Schätzung.\n\n**Nicht enthalten:** welcher Sender gehört wird. Die Ströme laufen direkt vom Browser zum Sender und berühren diesen Server nie.'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: abfragen.besucheProTag
        size: 0
        title: 'Seitenaufrufe und Besucher je Tag'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: abfragen.installiert
        size: 1
        title: 'Manifest-Abrufe — Hinweis auf Installationen der App'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: abfragen.woherKommen
        size: 1
        title: 'Woher die Besucher kommen'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: abfragen.geraete
        size: 1
        title: 'Browser und Geräteart'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: abfragen.appsSeite
        size: 1
        title: 'Radio gegen Apps-Seite'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 1
      content: {
        json: '## Was schiefgeht'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: abfragen.fehler
        size: 0
        title: 'Gemeldete Fehler, nach Häufigkeit'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: abfragen.langsam
        size: 1
        title: 'Langsamste Auslieferungen (P95, letzte 7 Tage)'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
  ]
}

resource mappe 'Microsoft.Insights/workbooks@2023-06-01' = {
  // Der Name muss eine GUID sein. Fest verdrahtet, damit ein erneutes
  // Ausrollen dieselbe Mappe aktualisiert statt eine zweite anzulegen.
  name: 'a7c3f1e2-9b4d-4e8a-b6c5-1f2e3d4c5b6a'
  location: location
  kind: 'shared'
  tags: {
    anwendung: 'iyambae'
    umgebung: 'prod'
    verwaltetVon: 'bicep'
  }
  properties: {
    displayName: 'IYAMBAE — Zahlen'
    category: 'workbook'
    serializedData: string(inhalt)
    sourceId: arbeitsbereich.id
    version: '1.0'
  }
}

output mappeId string = mappe.id
output hinweis string = 'Zugriff fuer weitere Personen: az role assignment create --role "Monitoring Reader" --scope der Ressourcengruppe'
