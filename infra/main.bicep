/*
  IYAMBAE — Auslieferung über Azure Container Apps.

  Ein Container, zwei Hostnamen: iyambae.fm liefert das Radio,
  apps.iyambae.fm die Seite für die Apps. Getrennt wird im nginx über
  server_name, siehe deploy/nginx.conf.

  Seit dem Anmeldedienst sind es ZWEI Container in derselben Replik: nginx
  auf 8080 und der Anmeldedienst auf 8081. nginx reicht /api/ an 127.0.0.1
  weiter — deshalb gibt es dazwischen keinen fremden Ursprung, kein CORS und
  keinen Vorabflug. Der Anmeldedienst hat KEINEN eigenen Ingress; von außen
  ist er nicht erreichbar, und das ist die halbe Sicherheitsarchitektur.

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

/*
  Vollständiger Bildname samt Marke.

  Liegt im persönlichen Namensraum, nicht unter der Organisation: Das Anlegen
  von Paketen unter `iyambae-lifetree` ist eine Org-Berechtigung, die Micha
  nicht hat. Sobald sie erteilt ist, gehört das Abbild nach
  `ghcr.io/iyambae-lifetree/iyambae-radio` — dann hängt die Auslieferung an
  der Organisation statt an einem einzelnen Konto.

  Das Paket ist öffentlich, das Repository bleibt privat. Zwei getrennte
  Schalter: Im Abbild steckt nur die ausgelieferte Webseite, also genau das,
  was jeder Browser ohnehin lädt — `.dockerignore` hält Quellen, `docs/`,
  `Scripts/` und die Historie draußen. Öffentlich erspart ein Geheimnis in
  Azure, das ablaufen und gestohlen werden kann.
*/
param abbild string = 'ghcr.io/michaelfricke-sudo/iyambae-radio:latest'

@description('Wie viele Exemplare mindestens laufen. 0 = schläft ein, kein Dauerbetrieb, aber Kaltstart.')
@minValue(0)
@maxValue(5)
param mindestExemplare int = 0

@description('Obergrenze. Drei reichen weit für statische Auslieferung.')
@minValue(1)
@maxValue(30)
param hoechstExemplare int = 3

// ════════════════════════════════════════════════════════════════════
//  Anmeldedienst — Eingaben
// ════════════════════════════════════════════════════════════════════

/*
  DER SCHALTER, DER DIE REIHENFOLGE ERZWINGT — und er steht mit Absicht auf
  `false`.

  Grund, und er ist kein theoretischer: Die Datenhaltung, die Absenderdomäne
  und die Rechte müssen VOR dem Sidecar da sein, und die Absenderdomäne
  braucht dazwischen DNS-Einträge und eine Prüfung durch Azure, die 15 bis 30
  Minuten Takt hat. Dazwischen gehört das Konto-Abbild gebaut und
  hochgeschoben. Stünde dieser Schalter auf `true`, hieße der erste
  Ausrollversuch: eine Überarbeitung, die ein Abbild ziehen will, das es noch
  nicht gibt.

  Container Apps lässt die letzte gesunde Überarbeitung dann zwar weiterlaufen
  — aber darauf ist der laufende Betrieb des Radios nicht zu wetten. Die
  billigere Sicherheit ist, den Sidecar erst einzuschalten, wenn alles unter
  ihm steht.

  Der Weg in vier Schritten steht in docs/anmeldung-einrichten.md.
*/
@description('Die eigenen Domains am Ingress, mit dem von Azure verwalteten Zertifikat. Vorgaben entsprechen dem Stand vom 21.08.2026.')
param eigeneDomains array = [
  { name: 'iyambae.fm',      zertifikat: 'mc-cae-iyambae-iyambae-fm-1994' }
  { name: 'www.iyambae.fm',  zertifikat: 'mc-cae-iyambae-www-iyambae-fm-6973' }
  { name: 'apps.iyambae.fm', zertifikat: 'mc-cae-iyambae-apps-iyambae-fm-8964' }
]

@description('Erst auf true, wenn die DNS-Prüfung der Absenderdomäne durch ist (Status Verified). Vorher lehnt Azure die Verknüpfung ab.')
param mailBereit bool = false

@description('Erst einschalten, wenn Speicher, Absenderdomäne UND das Konto-Abbild stehen. Siehe docs/anmeldung-einrichten.md.')
param mitAnmeldung bool = false

/*
  Eigene Marke je Stand, niemals `:latest` — der Grund steht in der README
  dieses Ordners und hat zweimal lautlos zugeschlagen: Container Apps legt
  eine Überarbeitung nur an, wenn sich die SPEZIFIKATION ändert. Bleibt der
  Text gleich, passiert nichts, und `az` meldet trotzdem Erfolg.
*/
@description('Abbild des Anmeldedienstes. Commit-Kennung als Marke, nicht :latest.')
param kontoAbbild string = 'ghcr.io/michaelfricke-sudo/iyambae-konto:latest'

/*
  Absenderdomäne — bewusst eine Unterdomäne, NICHT der Apex.

  Der von ACS vorgegebene SPF-Eintrag endet auf `-all`, also Hard Fail. Stünde
  er auf iyambae.fm, wäre damit erklärt: NUR ACS darf je für iyambae.fm
  senden. Jeder andere Absender — ein Mailhoster, GitHub-Benachrichtigungen,
  ein Kontaktformular — würde ab dann hart abgelehnt. Ein Apex kann außerdem
  nur einen SPF-Eintrag tragen; man könnte ihn nicht sauber danebenstellen.

  Nebeneffekt, der zählt: Die Reputation der Transaktionsmails ist von der
  übrigen Nutzung der Domäne getrennt. Geht bei einer etwas schief, reißt sie
  die andere nicht mit.
*/
@description('Absenderdomäne für Transaktionsmails. Unterdomäne, nicht der Apex.')
param mailDomaene string = 'mail.iyambae.fm'

/*
  Datenhaltung der Kommunikationsdienste.

  „Germany" ist als eigene Geografie wählbar. Das ist die Einstellung, die
  zählt — die ARM-Ressource selbst liegt IMMER global, und die Region der
  Ressourcengruppe steuert hier gar nichts.

  Ehrlich dazugesagt, und es gehört in die Datenschutzerklärung: Microsoft
  schreibt, ruhende Daten blieben in der Geografie, Daten könnten aber in
  anderen Geografien übertragen oder verarbeitet werden. Die Zusage lautet
  also Ruhelage, nicht Verarbeitung.

  NACH DEM ANLEGEN NICHT MEHR ÄNDERBAR. Wer sich hier vertut, legt neu an.
*/
@allowed([
  'Germany'
  'Europe'
])
@description('Wo die Kommunikationsdaten ruhen. Nach dem Anlegen nicht mehr änderbar.')
param datenOrt string = 'Germany'

@description('Erlaubte Ursprünge für den Anmeldedienst. Grundlage der Herkunftsprüfung UND des Passwortlinks.')
param erlaubteUrspruenge string = 'https://iyambae.fm,https://www.iyambae.fm'

/*
  Die RP-ID für Passkeys MUSS die registrierbare Domain sein, nicht der
  Hostname. `iyambae.fm` gilt auch für www.iyambae.fm; `www.iyambae.fm` gälte
  NICHT für iyambae.fm. Wer das verwechselt, merkt es erst, wenn ein am Apex
  angelegter Passkey auf der www-Adresse nicht angenommen wird — und dann
  sind die Passkeys der ersten Nutzer schon falsch gebunden.
*/
@description('WebAuthn-RP-ID. Die registrierbare Domain, nicht der Hostname.')
param passkeyDomain string = 'iyambae.fm'

@description('Wie lange gelöschte Merklisteneinträge als Grabstein liegen bleiben, in Tagen.')
@minValue(30)
@maxValue(365)
param grabsteinTage int = 90

/*
  Google und Apple — die Kennungen sind ÖFFENTLICH, die Geheimnisse nicht.

  Eine Client-ID steht bei jedem Anmeldevorgang im Browser des Nutzers; sie
  hier im Klartext zu führen verrät nichts. Das Client-Geheimnis und Apples
  privater Schlüssel dagegen stehen im KEY VAULT und kommen als Verweis an den
  Container — nirgends in dieser Datei, in keiner Ausgabe, in keinem
  `az deployment show` und in KEINER BEFEHLSZEILE.

  Der letzte Punkt ist der Grund für den Umbau. Solange der Wert ein
  Aufrufparameter war, stand er beim Ausrollen in der Befehlszeile, im
  Verlauf der Schale und in jedem Werkzeug dazwischen. Jetzt geht er einmal
  in den Tresor und danach nie wieder durch eine Kommandozeile.

  Die beiden Schalter sagen nur, OB dort etwas liegt. Stehen sie auf false,
  wird kein Geheimnis eingebunden, die Umgebungsvariable fehlt, und fremd.mjs
  schaltet den betroffenen Anbieter still ab — er antwortet dann mit 501.
  Anmeldung per Mail, Passwort und Passkey läuft davon unberührt weiter.
*/
@description('Google OAuth-Client-ID. Öffentlich, kein Geheimnis.')
param googleKennung string = ''

@description('Liegt das Google-Geheimnis im Tresor? Erst dann bindet der Container es ein.')
param mitGoogle bool = false

@description('Apple Team-ID (10 Zeichen).')
param appleTeamId string = ''

@description('Apple Key-ID des Sign-in-Schlüssels (10 Zeichen).')
param appleKeyId string = ''

@description('Apple Service-ID — die Kennung der Web-Anmeldung, NICHT die Bundle-ID.')
param appleDienstId string = ''

/*
  Der private Schlüssel aus der .p8-Datei, samt BEGIN/END-Zeilen.

  Zeilenumbrüche als \n in ZWEI Zeichen schreiben, nicht als echte Umbrüche:
  Container-Apps-Geheimnisse tragen echte Umbrüche nicht durch jede
  Werkzeugkette. fremd.mjs biegt sie beim Lesen zurück — siehe
  `leseUmgebung()` in dienst/src/fremd.mjs.
*/
@description('Liegt Apples Schlüssel im Tresor? Erst dann bindet der Container ihn ein.')
param mitApple bool = false

/*
  NICHT VORBELEGT, und das ist eine bewusst OFFENE Entscheidung.

  Am 21.08.2026 gegen die Berechtigungsliste von Microsoft.Communication
  geprüft: Der Ressourcenanbieter veröffentlicht ÜBERHAUPT KEINE DataActions
  — nur Steuerebene. Es gibt damit keine eingebaute Rolle nach dem Muster
  „Storage Table Data Contributor", die nur „Mail senden" erlaubte. Die
  einzige dokumentierte Möglichkeit ist eine Rolle mit Leserecht auf die
  ACS-Ressource, praktisch also `Contributor`
  (b24988ac-6180-42a0-ab88-20f7382dd24c), auf DIESE eine Ressource beschränkt.

  Das ist mehr Recht als nötig, und es soll niemand versehentlich vergeben.
  Deshalb steht hier nichts. Ohne Zuweisung startet der Dienst, nimmt
  Anmeldungen an — und der Mailversand fällt mit 403 aus. Das ist ein
  sichtbarer, im Protokoll stehender Ausfall, kein stiller.

  WAS HIER NICHT PASSIEREN DARF: eine ACS-Verbindungszeichenfolge in eine
  Umgebungsvariable schreiben, weil die Rolle Mühe macht. Sie enthält den
  Zugriffsschlüssel im Klartext, läuft nicht ab, und der Dienst kann sie
  ohnehin nicht lesen — mail.mjs kennt nur `DefaultAzureCredential`.

  Der Befehl zum Nachschlagen und die Abwägung stehen in
  docs/anmeldung-einrichten.md.
*/
@description('Rollenkennung für ACS-Datenzugriff. Leer = keine Zuweisung, dann fällt der Mailversand mit 403 aus. Siehe Kommentar.')
param acsRolleId string = ''

/*
  Die Objekt-IDs der Verwalter — NICHT die E-Mail-Adressen.

      az ad user show --id mail@example.org --query id -o tsv

  Leer lassen ist zulässig: Dann werden keine Leserechte vergeben. Das ist der
  Weg, wenn die IDs noch nicht feststehen — eine Rollenzuweisung mit falscher
  ID scheitert erst beim Ausrollen und reißt die ganze Bereitstellung mit.
*/
@description('Objekt-IDs der Personen, die Kontodaten LESEN dürfen. Höchstens zwei.')
@maxLength(2)
param verwalter array = []

/*
  Wer Geheimnisse in den Tresor legen und austauschen darf.

  Eine andere Liste als `verwalter`, mit Absicht: Kontodaten lesen und
  Anbieterschlüssel austauschen sind zwei verschiedene Befugnisse, und wer
  das eine braucht, braucht nicht zwangsläufig das andere.

  „Key Vault Secrets Officer" darf ablegen, austauschen und löschen — der
  Dienst selbst hat nur „Secrets User" und darf ausschließlich holen.

  Auch hier gilt: leer lassen ist zulässig, und eine falsche ID reißt die
  ganze Bereitstellung mit.

      az ad signed-in-user show --query id -o tsv
*/
@description('Objekt-IDs der Personen, die Geheimnisse im Tresor ablegen dürfen. Höchstens zwei.')
@maxLength(2)
param tresorwarte array = []

/*
  DIE BEREITSCHAFTSSONDIERUNG DES SIDECARS — und der Satz, der dazugehört.

  Sie tut, was sie soll: Nach einem Kaltstart (mindestExemplare 0, der
  Regelfall hier) gilt die Replik erst als bereit, wenn AUCH der Anmeldedienst
  lauscht. Ohne sie ist nginx nach knapp einer Sekunde da, Node braucht länger
  — und der erste Mensch nach der Ruhephase klickt seinen Bestätigungslink aus
  der E-Mail in ein {"fehler":"dienst_schlaeft"}. Genau an der Stelle, an der
  jemand zum ersten Mal Vertrauen fasst.

  DER PREIS, ausdrücklich: Bereitschaft gilt für die REPLIK, nicht für den
  Container. Schlägt diese Sondierung im laufenden Betrieb an, wird die ganze
  Replik aus dem Verkehr genommen — samt nginx, samt Radio. Ein kaputter
  Anmeldedienst kann also die Musik abschalten.

  Deshalb, und beides ist Teil derselben Entscheidung:

  - KEINE Liveness-Sondierung. Die wäre die schlimmere: Sie startet neu, und
    zwar in einer Schleife. Der Anmeldedienst hat mit /api/leben einen
    Endpunkt dafür, und er wird bewusst nicht dafür benutzt.
  - `failureThreshold: 6` bei `periodSeconds: 10` — eine Minute Nachsicht,
    bevor die Replik fällt. Ein Neustart des Sidecars dauert Sekunden; er soll
    das Radio nicht mitreißen.
  - Abschaltbar, ohne die Datei zu ändern: `bereitschaftKonto=false`.

  /api/leben fasst weder Table Storage noch ACS an. Eine Sondierung, die die
  Datenhaltung mitprüft, macht aus einer Störung dort einen Ausfall hier.
*/
@description('Bereitschaftssondierung für den Anmeldedienst. Aus, wenn ein kaputtes /api/ das Radio nicht mitreißen darf.')
param bereitschaftKonto bool = true

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

// ════════════════════════════════════════════════════════════════════
//  Die verwaltete Identität des Anmeldedienstes
// ════════════════════════════════════════════════════════════════════
/*
  BENUTZERZUGEWIESEN, nicht systemzugewiesen — und die Begründung ist die
  Reihenfolge, nicht der Geschmack.

  Eine systemzugewiesene Identität entsteht ERST MIT der Anwendung. Ihre
  Objekt-ID gibt es also frühestens, wenn die Anwendung schon steht — und
  damit entsteht die Rollenzuweisung notwendig NACH dem ersten Start der
  Container. Der Sidecar läuft dann in ein 403 auf Table Storage und muss sich
  daraus herauswiederholen. Beim ersten Ausrollen ist das lästig; nach einem
  Wiederanlegen der Anwendung ist es schlimmer: Die systemzugewiesene
  Identität bekommt eine NEUE Objekt-ID, und jede bestehende Rollenzuweisung
  zeigt stillschweigend auf einen Empfänger, den es nicht mehr gibt. Im Portal
  steht dann „Identity not found", der Dienst bekommt 403, und niemand hat
  etwas geändert.

  Diese Identität hier lebt für sich. Die Rechte hängen an ihr, nicht an der
  Anwendung, und sie sind vergeben, BEVOR der erste Container startet.

  Der Preis: `DefaultAzureCredential` muss wissen, WELCHE Identität gemeint
  ist, sobald mehr als eine an der Anwendung hängt. Deshalb steht
  AZURE_CLIENT_ID unten ausdrücklich in der Umgebung des Sidecars. Ohne diese
  Zeile wählt die Bibliothek und wählt womöglich die andere.

  Die vorhandene systemzugewiesene Identität der Anwendung BLEIBT. Sie zu
  entfernen wäre eine Änderung an einer laufenden Ressource, die für den
  Sidecar nicht nötig ist.
*/
resource dienstIdentitaet 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${name}-konto'
  location: location
  tags: marken
}

// ════════════════════════════════════════════════════════════════════
//  Datenhaltung — Table Storage
// ════════════════════════════════════════════════════════════════════
/*
  Warum Table Storage und nicht Cosmos DB: Weil die Daten winzig sind und
  bleiben. Tausend Nutzer mit je vierzig gemerkten Sendern sind zusammen unter
  einem Megabyte.

  Preise am 21.08.2026 aus der Azure Retail Prices API, germanywestcentral,
  EUR. Gerechnet für 1.000 Nutzer, 20.000 Schreib- und 100.000 Lesevorgänge im
  Monat, 50 MB Bestand:

    Table Storage      0,0595 €/GB + 0,0003 €/10.000 Vorgänge  →  unter 0,01 €
    Cosmos serverless  0,2680 €/Mio. RU + 0,2197 €/GB          →  rund 0,07 €

  EHRLICH DAZUGESAGT: Das sind sechs Cent Unterschied. Der Preis entscheidet
  das hier NICHT.

  Was entscheidet: Table Storage kennt keinen Durchsatzbegriff, keine RU, keine
  Konsistenzstufen. Es gibt eine Zeile, einen ETag und If-Match. Für eine
  Merkliste ist das das ganze Werkzeug — und eines weniger, das jemand lernen
  muss.

  WAS COSMOS BESSER KÖNNTE, und es ist kein Nichts: eine eingebaute Ablaufzeit
  je Dokument. Sitzungen und Einmalcodes verfielen damit von selbst. Table
  Storage kann das nicht; der Dienst räumt selbst auf — beim Lesen und einmal
  je 24 Stunden, siehe AUFRAEUM_STUNDEN in dienst/src/sitzung.mjs.
*/

/*
  Speicherkontonamen sind WELTWEIT eindeutig, kleingeschrieben, höchstens
  24 Zeichen. `st iyambae konto` sind 14 — der Rest ist Streu aus der
  Ressourcengruppen-Kennung, damit ein zweites Ausrollen in einer anderen
  Gruppe nicht am Namen scheitert.
*/
var speicherName = take('st${name}konto${uniqueString(resourceGroup().id)}', 24)

resource speicher 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: speicherName
  location: location
  tags: marken
  sku: {
    /*
      Standard_LRS: drei Kopien in EINEM Rechenzentrum.

      Nicht ZRS, nicht GRS. GRS spiegelte die Daten nach germanynorth — immer
      noch Deutschland, aber rund das Doppelte an Kosten und eine zweite Kopie
      personenbezogener Daten, die ins Verzeichnis der
      Verarbeitungstätigkeiten müsste. Für eine Merkliste keine sinnvolle
      Abwägung.
    */
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true

    /*
      DER wichtigste Schalter in diesem Abschnitt.

      `false` schaltet die beiden Kontoschlüssel ab. Ohne sie gibt es keine
      Verbindungszeichenfolge, die jemand in eine Umgebungsvariable, in ein
      Repository oder in eine Chatnachricht kopieren könnte. Der einzige Weg
      an die Daten führt über Entra-Rollen.

      Der Preis: Werkzeuge, die nur Kontoschlüssel können (ältere
      Storage-Explorer-Fassungen, `azcopy` ohne --auth-mode login, so gut wie
      jedes Beispiel aus dem Netz), funktionieren nicht mehr. Gewollt.
    */
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true

    // Es gibt keine Blobs in diesem Konto. Trotzdem ausdrücklich zu: ein
    // leerer öffentlicher Container ist eine Einladung für später.
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      /*
        Offen, und das ist kein Versäumnis: Die Container App läuft im
        Consumption-Profil ohne eigenes Netz, ihre ausgehenden Adressen sind
        die der Umgebung und ändern sich. Eine IP-Sperrliste wäre eine Liste,
        die bei der nächsten Plattformänderung stillschweigend falsch wird —
        und der Zugang hängt durch `allowSharedKeyAccess: false` ohnehin an
        einer Identität, nicht an einer Adresse.

        Wer es dichter will, braucht ein Workload-Profil mit VNet und einen
        privaten Endpunkt. Das kostet ab dem ersten Tag Geld und ist für eine
        Merkliste nicht zu rechtfertigen.
      */
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource tabellendienst 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: speicher
  name: 'default'
  properties: {
    /*
      CORS bewusst LEER.

      Der Browser spricht nie mit dem Speicherkonto. Er spricht mit /api/ auf
      iyambae.fm — derselbe Ursprung — und dahinter steht der Anmeldedienst.
      Eine CORS-Regel hier wäre eine Tür, die niemand braucht.
    */
    cors: {
      corsRules: []
    }
  }
}

/*
  ERSTE TABELLE: alles zu einem Konto in EINER Partition.

  PartitionKey = kontoId, RowKey sagt, was die Zeile ist: 'konto',
  'kennung:mail', 'kennung:google:<sub>', 'platten', 'verlauf',
  'sitzung:<abdruck>', 'code:<abdruck>'. Die vollständige Liste steht in
  dienst/src/speicher.mjs.

  Warum eine Partition und nicht sechs Tabellen:

  1. LÖSCHEN. „Konto löschen" ist eine Abfrage auf eine Partition und ein
     Stapellöschen. Über sechs Tabellen verteilt wären es sechs Durchgänge,
     von denen der vierte scheitern kann — und dann liegen Reste herum, die
     niemand mehr findet. Bei einem Löschanspruch nach Art. 17 DSGVO ist
     „ein Rest ist liegengeblieben" die falsche Antwort.
  2. GESCHLOSSENE VORGÄNGE. Table Storage führt bis zu 100 Änderungen in
     EINER Partition als eine Einheit aus. Merkliste schreiben und Stand
     hochzählen wird damit ein Vorgang statt zwei, die halb misslingen können.
  3. LESEN. Anmelden heißt: eine Partition holen, fertig.

  Der Preis: Eine Partition ist die Einheit der Skalierung — rund 2.000
  Entitäten je Sekunde. Das ist eine Grenze JE KONTO. Ein einzelner Mensch,
  der zweitausend Mal in der Sekunde einen Sender merkt, existiert nicht.
*/
resource tabelleKonten 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tabellendienst
  name: 'konten'
}

/*
  ZWEITE TABELLE, und sie ist unvermeidlich.

  Beim Anmelden kennt der Server die kontoId noch nicht, sondern nur die
  Kennung — eine E-Mail-Adresse oder das `sub` von Google. Er braucht also
  einen Weg von der Kennung zur Partition.

    PartitionKey = SHA-256 der normalisierten Kennung
    RowKey       = 'v'
    kontoId      = die Partition in `konten`

  Der KLARTEXT der Adresse steht hier NICHT. Wer die Tabelle liest, kann nicht
  nach „wer ist bei euch angemeldet" durchsuchen, ohne die gesuchte Adresse
  schon zu kennen. Gegen einen gezielten Angriff auf eine bekannte Person
  hilft das nicht — gegen das massenhafte Auslesen eines Adressbestands schon.
*/
resource tabelleVerweise 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tabellendienst
  name: 'verweise'
}

// ════════════════════════════════════════════════════════════════════
//  Mailversand — Azure Communication Services
// ════════════════════════════════════════════════════════════════════
/*
  Zwei Ressourcen plus eine Verknüpfung — der Email Communication Service
  entsteht NICHT automatisch mit dem Communication Service. Das muss man
  wissen, sonst sucht man lange.

  Die Azure-verwaltete Domäne (…azurecomm.net) ist bewusst nicht gewählt.
  Nicht wegen der Zustellbarkeit, sondern wegen einer harten Zahl: Sie ist auf
  5 Mails je Minute und 10 je STUNDE gedeckelt, und diese Grenze lässt sich
  laut Microsofts Tabelle „Service limits" NICHT per Ticket anheben — die
  Spalte „Higher limits available" steht auf „No". Zehn Mails in der Stunde
  reichen für den ersten Funktionstest und sonst für nichts.

  Für die eigene Domäne gelten ab Werk 30 je Minute und 100 je Stunde, je
  ABONNEMENT — nicht je Ressource, nicht je Domäne. Das trägt 20.000 Mails im
  Monat im Schnitt (rund 28 je Stunde), aber es trägt keine SPITZE. Deshalb
  hat mail.mjs eine Warteschlange und bleibt mit 25/90 unter Microsofts 30/100.
*/
resource maildienst 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: 'acs-${name}-mail'
  // Immer 'global'. Die Datenhaltung steuert `dataLocation`, nicht der Ort.
  location: 'global'
  tags: marken
  properties: {
    dataLocation: datenOrt
  }
}

resource maildomaene 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: maildienst
  name: mailDomaene
  location: 'global'
  tags: marken
  properties: {
    // 'CustomerManaged' = eigene Domäne mit eigenen DNS-Einträgen.
    domainManagement: 'CustomerManaged'
    /*
      Öffnungs- und Klickverfolgung AUS.

      Sie ginge technisch, sobald die Domäne eigen ist. Sie einzuschalten
      hieße aber, in jede Bestätigungsmail ein Zählpixel und umgeschriebene
      Verweise zu setzen — also genau die Verfolgung, die diese Seite an jeder
      anderen Stelle unterlässt. Für Transaktionsmails bringt sie nichts, was
      eine Entscheidung trüge: Ob eine Bestätigungsmail ankam, sagt der
      Zustellbericht, und ob sie gewirkt hat, sagt die Anmeldung selbst.
    */
    userEngagementTracking: 'Disabled'
  }
}

/*
  Die Absenderadresse. Ein Anzeigename geht NUR bei eigener Domäne — bei einer
  Azure-verwalteten lassen sich Sender-Benutzernamen gar nicht erst anlegen.

  `konto@` und nicht `noreply@`: ACS nimmt ohnehin keine eingehende Post an.
  Aber „noreply" sagt dem Leser, er sei nicht gemeint. Wer auf eine
  Anmeldemail antworten möchte, soll wenigstens eine Adresse sehen, die nach
  einem Menschen klingt — und im Text steht dann, wohin er sich stattdessen
  wenden kann.
*/
/*
  DIESE BEIDEN WARTEN AUF DIE DNS-PRÜFUNG.

  Gemessen, nicht vermutet: Der erste Lauf am 21.08.2026 brach ab mit
  „Requested domain is not in a valid state for linking to
  CommunicationServices resource". Die Domäne war angelegt — aber unbestätigt,
  und bestätigt werden kann sie erst, wenn die vier DNS-Einträge stehen.

  Das ist keine Schwäche der Vorlage, sondern eine Reihenfolge, die außerhalb
  von Azure liegt: Der Prüfeintrag muss bei Cloudflare stehen, Azure fragt im
  Takt von 15 bis 30 Minuten nach. Solange läuft nichts.

  Deshalb ein Schalter statt eines Abbruchs. Mit `mailBereit=false` legt der
  Lauf alles an, was ohne DNS geht, und hört genau dort auf. Danach:

      az communication email domain show \
        --domain-name mail.iyambae.fm \
        --email-service-name acs-iyambae-mail -g iyambae \
        --query "properties.verificationStates.Domain.status" -o tsv

  Steht dort bei ALLEN VIER `Verified`, läuft derselbe Befehl noch einmal mit
  `mailBereit=true` — und erst dann entsteht die Verknüpfung.

  ALLE VIER, und das ist gemessen, nicht abgeschrieben: Am 21.08.2026 waren
  Domain und SPF geprüft, DKIM und DKIM2 nicht. Die Verknüpfung schlug mit
  demselben `DomainValidationError` fehl wie ganz ohne Prüfung. DKIM ist hier
  also keine Kosmetik für die Zustellbarkeit, sondern eine harte Vorbedingung
  — die beiden CNAMEs müssen stehen, bevor irgendetwas weitergeht.
*/
resource absender 'Microsoft.Communication/emailServices/domains/senderUsernames@2023-04-01' = if (mailBereit) {
  parent: maildomaene
  name: 'konto'
  properties: {
    username: 'konto'
    displayName: 'IYAMBAE FM'
  }
}

resource kommunikation 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: 'acs-${name}'
  location: 'global'
  tags: marken
  properties: {
    dataLocation: datenOrt
    // Ohne diese Verknüpfung kennt der Dienst die Domäne nicht und lehnt
    // jeden Sendeversuch als nicht autorisierten Absender ab. Vor der
    // DNS-Prüfung lässt Azure sie nicht zu — siehe oben.
    linkedDomains: mailBereit ? [ maildomaene.id ] : []
  }
}

// ════════════════════════════════════════════════════════════════════
//  Wer darf was
// ════════════════════════════════════════════════════════════════════
/*
  Eingebaute Rollen mit ihren festen Kennungen. Beide am 21.08.2026 gegen die
  von Microsoft erzeugte Rollenliste geprüft.
*/
var rolleTabellenSchreiben = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3' // Storage Table Data Contributor
var rolleTabellenLesen = '76199698-9eea-4c19-bc75-cec21354c6b6' // Storage Table Data Reader

/*
  Der Dienst darf Zeilen schreiben — und zwar NUR Zeilen.

  „Storage Table Data Contributor" ist eine DATENebenen-Rolle. Sie erlaubt
  lesen, schreiben und löschen in Tabellen; sie erlaubt NICHT, das
  Speicherkonto zu ändern, Schlüssel zu lesen (die es nicht gibt) oder es zu
  löschen. Wer den Container übernimmt, kommt an die Merklisten — er kommt
  nicht an das Konto.

  `guid(...)` erzeugt einen stabilen Namen aus Bereich, Empfänger und Rolle.
  Stabil heißt: Ein zweites Ausrollen ändert dieselbe Zuweisung, statt eine
  zweite anzulegen — sonst sammeln sich Karteileichen an, die niemand mehr
  zuordnen kann.
*/
/*
  ════════════════════════════════════════════════════════════════════
   Die Registry
  ════════════════════════════════════════════════════════════════════

  WARUM NICHT GHCR, WO DOCH DAS RADIO DORT LIEGT

  Das Abbild des Radios ist öffentlich, und das ist richtig: Es enthält eine
  Webseite, die ohnehin jeder abrufen kann. Beim Anmeldedienst liegt es
  anders. Kein Geheimnis steckt darin — geprüft, die Werte kommen zur
  Laufzeit aus dem Tresor — aber der ganze Quelltext: Drosselungsschwellen,
  Sitzungsbindung, Argon2-Parameter, die Lebensdauer der Einmalcodes. Das ist
  kein Loch, es macht Angriffe nur billiger. Für den Dienst, der Konten hält,
  ist das der falsche Handel.

  Die Alternative wäre ein GitHub-Token als Registry-Zugang gewesen. Der
  läuft ab, will erneuert werden und ist ein weiteres Geheimnis, das jemand
  pflegen muss. Die Registry hier zieht dieselbe Identität heran, mit der der
  Dienst schon an Tabellen und Tresor geht — kein Token, nichts, was abläuft.

  Basic reicht: 10 GiB, ein Abbild, kein Georeplikat. Rund 5 € im Monat.

  adminUserEnabled bleibt aus. Der Administratorzugang ist ein Benutzername
  mit Passwort, für alle gleich und nicht nachvollziehbar, wer ihn benutzt
  hat. Genau das, was eine verwaltete Identität ersetzt.
*/
resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: 'cr${name}${take(uniqueString(resourceGroup().id, 'registry'), 10)}'
  location: location
  tags: marken
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    anonymousPullEnabled: false
  }
}

/*
  Holen darf der Dienst, mehr nicht.

  AcrPull (7f951dda-…) darf Abbilder ZIEHEN. Nicht schieben, nicht löschen,
  keine Marke überschreiben. Wer baut und hochlädt, ist ein Mensch mit
  eigenen Rechten — das ist eine andere Rolle und eine andere Gelegenheit.
*/
resource dienstDarfHolen 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, dienstIdentitaet.id, 'acrpull')
  properties: {
    principalId: dienstIdentitaet.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

/*
  ════════════════════════════════════════════════════════════════════
   Der Tresor
  ════════════════════════════════════════════════════════════════════

  enableRbacAuthorization: Zugriffsrichtlinien am Tresor selbst sind der alte
  Weg. Sie leben neben dem übrigen Rechtemodell, tauchen in keiner
  Rollenübersicht auf und werden beim Aufräumen übersehen. Rollen gelten
  überall gleich.

  softDelete und Löschschutz: Ein versehentlich gelöschter Tresor nimmt die
  Anmeldung mit, und ohne Wiederherstellungsfrist wäre sie fort. 90 Tage sind
  die Vorgabe; der Löschschutz verhindert zusätzlich, dass jemand die Frist
  abkürzt.

  Keine Netzsperre: Container Apps greift von wechselnden Adressen zu, und
  eine Sperre, die man dafür weit genug öffnen müsste, wäre Zierde. Die
  Grenze zieht hier die Rolle, nicht das Netz.
*/
resource tresor 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${name}-${take(uniqueString(resourceGroup().id, 'tresor'), 8)}'
  location: location
  tags: marken
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

/*
  Lesen darf nur der Dienst, und nur lesen.

  "Key Vault Secrets User" (4633458b-…) darf Werte HOLEN, aber keine
  schreiben, keine auflisten, die es nicht kennt, und keine löschen. Wer
  Geheimnisse ablegt, ist ein Mensch mit "Secrets Officer" — das ist eine
  andere Rolle und eine andere Gelegenheit.
*/
resource dienstDarfLesen 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: tresor
  name: guid(tresor.id, dienstIdentitaet.id, 'secrets-user')
  properties: {
    principalId: dienstIdentitaet.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

resource warteDuerfenAblegen 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for id in tresorwarte: {
  scope: tresor
  name: guid(tresor.id, id, 'secrets-officer')
  properties: {
    // Key Vault Secrets Officer — ablegen, austauschen, löschen.
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
    principalId: id
    principalType: 'User'
  }
}]

resource dienstDarfSchreiben 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: speicher
  name: guid(speicher.id, dienstIdentitaet.id, rolleTabellenSchreiben)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', rolleTabellenSchreiben)
    principalId: dienstIdentitaet.properties.principalId
    // Ohne diese Zeile scheitert die Zuweisung sporadisch: Eine gerade erst
    // angelegte Identität ist im Verzeichnis noch nicht überall sichtbar,
    // und Azure prüft sonst, ob der Empfänger ein Mensch ist.
    principalType: 'ServicePrincipal'
  }
}

// Nur wenn die Rollenkennung bewusst gesetzt wurde — siehe den Vorbehalt oben
// bei `acsRolleId`. Der Bereich ist ausdrücklich NUR die ACS-Ressource, nicht
// die Ressourcengruppe: Was auch immer die Rolle erlaubt, sie erlaubt es
// nirgendwo sonst.
resource dienstDarfSenden 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(acsRolleId)) {
  scope: kommunikation
  name: guid(kommunikation.id, dienstIdentitaet.id, acsRolleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acsRolleId)
    principalId: dienstIdentitaet.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

/*
  Die Verwalter dürfen LESEN, nicht schreiben.

  Bewusst „Reader" und nicht „Contributor", obwohl Contributor bequemer wäre —
  dann könnte man im Portal eine Zeile löschen. Aber:

  - Kontolöschung gehört in die App (DELETE /api/konto), damit der Nutzer sie
    selbst auslösen kann und ALLE Zeilen mitgehen: Merkliste, Verlauf,
    Sitzungen, Kennungen UND der Eintrag in `verweise`. Von Hand im Portal
    löscht man die eine Zeile, die man sieht, und übersieht den Rest.
  - Wer schreiben darf, kann fremde Merklisten verändern. Für das, wofür die
    beiden das Recht brauchen — nachsehen, ob ein gemeldetes Problem echt ist
    — reicht Lesen.

  ZU BEDENKEN, und es gehört ins Verzeichnis der Verarbeitungstätigkeiten:
  Auch Lesen heißt, jede Merkliste, jede Adresse und jeden Hörverlauf einsehen
  zu können. Das ist kein technischer Mangel, sondern eine Befugnis, die
  benannt gehört — und ein Grund, sie zwei Personen zu geben und nicht dreien.
*/
resource verwalterDuerfenLesen 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for id in verwalter: {
  scope: speicher
  name: guid(speicher.id, id, rolleTabellenLesen)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', rolleTabellenLesen)
    principalId: id
    principalType: 'User'
  }
}]

// ════════════════════════════════════════════════════════════════════
//  Der Sidecar
// ════════════════════════════════════════════════════════════════════
/*
  CPU UND SPEICHER WERDEN ÜBER ALLE CONTAINER EINER REPLIK ADDIERT, und die
  Summe muss auf eine erlaubte Kombination fallen: Speicher in GiB = 2 × vCPU,
  in Schritten von 0,25 vCPU.

    web    0,25 vCPU   0,5 GiB    (unverändert, wie seit dem ersten Tag)
    konto  0,25 vCPU   0,5 GiB
    ────────────────────────────
    Summe  0,50 vCPU   1,0 GiB    ← gültige Kombination

  0,25/0,5 für den Anmeldedienst ist nicht geraten, sondern gemessen: Bei 200
  gleichzeitigen Passwortanmeldungen liegt die Spitze bei +89 MiB über der
  Grundlast von 72 MiB, solange UV_THREADPOOL_SIZE und die Argon2-Schranke
  beide auf 4 stehen. Die Zahlen und der Fall, in dem es schiefgeht, stehen in
  dienst/README.md.

  WAS DIE VERDOPPLUNG KOSTET: Das monatliche Freikontingent des
  Consumption-Plans (180.000 vCPU-Sekunden, 360.000 GiB-Sekunden je Abonnement)
  reicht bei 0,25/0,5 für 200 Stunden wache Replik im Monat, bei 0,50/1,0 nur
  noch für 100. Solange `mindestExemplare` auf 0 steht, bleibt eine Seite
  dieser Größe deutlich darunter — es bleibt bei rund 0 €.
*/
var kontoUmgebung = concat([
  { name: 'PORT', value: '8081' }
  // Der Tabellenendpunkt, nicht das Konto: Der Dienst spricht ausschließlich
  // mit dem Tabellendienst, nie mit Blobs oder Queues.
  { name: 'TABELLEN_ENDPUNKT', value: speicher.properties.primaryEndpoints.table }
  // `hostName` kommt OHNE Schema. Der EmailClient will eine Adresse, keinen
  // Hostnamen — ohne das https:// scheitert er beim Aufbau, nicht erst beim
  // Senden.
  { name: 'ACS_ENDPUNKT', value: 'https://${kommunikation.properties.hostName}' }
  { name: 'ABSENDER', value: 'konto@${mailDomaene}' }
  { name: 'ERLAUBTE_URSPRUENGE', value: erlaubteUrspruenge }
  { name: 'WEBAUTHN_RP_ID', value: passkeyDomain }
  { name: 'WEBAUTHN_RP_NAME', value: 'IYAMBAE FM' }
  { name: 'GRABSTEIN_TAGE', value: string(grabsteinTage) }
  /*
    Die Kennung der benutzerzugewiesenen Identität. Sie MUSS hier stehen: An
    der Anwendung hängen zwei Identitäten (die alte systemzugewiesene und
    diese), und `DefaultAzureCredential` kann sonst nicht wissen, welche
    gemeint ist. Die Rechte auf Table Storage hat nur diese.
  */
  { name: 'AZURE_CLIENT_ID', value: dienstIdentitaet.properties.clientId }
  /*
    Beide Deckel, und sie gehören zusammen — der Grund steht im Dockerfile und
    ausführlich in dienst/README.md. Sie stehen hier ZUSÄTZLICH zum Abbild,
    weil eine Umgebungsvariable im Portal sichtbar ist und eine ENV-Zeile im
    Dockerfile nicht. Wer im Portal nachsieht, warum der Dienst bei 0,25 vCPU
    nicht mehr durchsetzt, soll die Antwort dort finden.
  */
  { name: 'UV_THREADPOOL_SIZE', value: '4' }
  { name: 'ARGON_GLEICHZEITIG', value: '4' }
], empty(googleKennung) ? [] : [
  // Öffentlich — steht bei jedem Anmeldevorgang im Browser des Nutzers.
  { name: 'GOOGLE_CLIENT_ID', value: googleKennung }
], empty(appleDienstId) ? [] : [
  { name: 'APPLE_TEAM_ID', value: appleTeamId }
  { name: 'APPLE_KEY_ID', value: appleKeyId }
  { name: 'APPLE_SERVICE_ID', value: appleDienstId }
], !mitGoogle ? [] : [
  // `secretRef`, nicht `value`: Der Wert steht in `configuration.secrets` und
  // taucht in keinem `az containerapp show` und in keiner Ausgabe auf.
  { name: 'GOOGLE_CLIENT_SECRET', secretRef: 'google-geheimnis' }
], !mitApple ? [] : [
  { name: 'APPLE_PRIVATE_KEY', secretRef: 'apple-schluessel' }
])

var kontoSondierungen = bereitschaftKonto ? [
  {
    type: 'Readiness'
    httpGet: { path: '/api/leben', port: 8081 }
    initialDelaySeconds: 3
    periodSeconds: 10
    timeoutSeconds: 3
    failureThreshold: 6
    successThreshold: 1
  }
] : []

var kontoContainer = mitAnmeldung ? [
  {
    name: 'konto'
    image: kontoAbbild
    resources: {
      cpu: json('0.25')
      memory: '0.5Gi'
    }
    env: kontoUmgebung
    probes: kontoSondierungen
  }
] : []

// ── Die Anwendung ───────────────────────────────────────────────────
resource seite 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${name}-web'
  location: location
  tags: marken
  /*
    AUSDRÜCKLICH, weil Bicep es nicht von selbst erkennt — und weil genau das
    der Gewinn der benutzerzugewiesenen Identität ist.

    Die Umgebungsvariable TABELLEN_ENDPUNKT verweist auf das Speicherkonto;
    daraus schließt Bicep eine Abhängigkeit auf das KONTO, nicht auf die
    Tabellen darin und nicht auf die Rollenzuweisung. Beides wird aber
    gebraucht, BEVOR der Sidecar startet:

    - Die Tabellen legt der Dienst NICHT selbst an. speicher.mjs baut nur
      einen `TableClient` je Name; ein fehlender Name ist ein 404 bei jeder
      Anmeldung, nicht ein einmaliger Fehler beim Start.
    - Ohne die Rollenzuweisung ist jeder Zugriff ein 403. Der Dienst hält das
      aus und wiederholt, aber der erste Mensch nach dem Ausrollen soll nicht
      derjenige sein, an dem sich das zeigt.

    Eine Abhängigkeit auf eine Ressource mit `false`-Bedingung ist zulässig
    und gilt sofort als erfüllt — `dienstDarfSenden` darf deshalb hier stehen,
    auch wenn `acsRolleId` leer ist.
  */
  dependsOn: [
    tabelleKonten
    tabelleVerweise
    dienstDarfSchreiben
    dienstDarfSenden
  ]
  identity: {
    // Die systemzugewiesene Identität bleibt, wie sie war — sie zu entfernen
    // wäre eine Änderung an einer laufenden Ressource ohne Not. Dazu kommt
    // die benutzerzugewiesene, die der Anmeldedienst benutzt; die Begründung
    // für die Bauart steht oben bei `dienstIdentitaet`.
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${dienstIdentitaet.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: umgebung.id
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        // Weiterhin 8080, also nginx. Der Anmeldedienst auf 8081 hat KEINEN
        // Ingress und ist von außen nicht erreichbar — er ist nur über
        // 127.0.0.1 aus derselben Replik zu sprechen. Das ist Absicht und
        // erspart eine ganze Klasse von Zugriffsschutz.
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]

        /*
          DIE DREI EIGENEN DOMAINS — und warum sie hier stehen müssen.

          Sie waren von Hand über das Portal angelegt und standen in dieser
          Vorlage nicht. Das ist keine Schönheitsfrage: ARM ersetzt bei einer
          erklärten Ressource die Eigenschaften VOLLSTÄNDIG. Ein Lauf ohne
          diesen Block hätte alle drei Domains vom Ingress genommen, und
          iyambae.fm, www.iyambae.fm und apps.iyambae.fm wären in dem Moment
          nicht mehr erreichbar gewesen.

          Aufgefallen ist es nur, weil vor dem Ausrollen ein
          `az deployment group what-if` lief und
          `ingress.customDomains` als Änderung auswies. Ohne diesen Zwischen-
          schritt wäre es beim ersten Anlegen des Anmeldedienstes passiert —
          also genau dann, wenn niemand mit einem Ausfall des Radios rechnet.

          Die Zertifikate verwaltet Azure selbst; sie werden hier nur
          referenziert, nicht erzeugt. Deshalb `existing` — die Vorlage legt
          sie nicht an und fasst sie nicht an, sie zeigt nur darauf.
        */
        customDomains: [
          for d in eigeneDomains: {
            name: d.name
            bindingType: 'SniEnabled'
            certificateId: resourceId(
              'Microsoft.App/managedEnvironments/managedCertificates',
              umgebung.name, d.zertifikat)
          }
        ]
      }
      /*
        Keine `registries`-Angabe: Das Abbild liegt öffentlich in der GitHub
        Container Registry. Wird es später privat, gehören hier ein
        Registry-Eintrag und ein Geheimnis hin — dann aber über Key Vault,
        nicht als Klartext in dieser Datei.
      */
      /*
        Die Geheimnisse der Anbieter.

        Sie entstehen nur, wenn ein Wert übergeben wurde. Ein leeres Geheimnis
        anzulegen wäre nicht bloß nutzlos — Container Apps nimmt es nicht an,
        und ein `secretRef` auf einen nicht vorhandenen Namen lässt die
        Bereitstellung scheitern. Deshalb hängen Geheimnis und
        Umgebungsvariable an DERSELBEN Bedingung.

        HIER STAND EINMAL DER WERT. Jetzt steht hier ein Verweis.

        Die frühere Fassung legte die Geheimnisse als Container-Apps-Secret
        ab, mit der Begründung, das sei die kleinere Maschinerie: kein zweiter
        Dienst, keine Rollenzuweisung, kein Zugriffsentgelt. Das stimmte und
        wog trotzdem zu leicht.

        Erstens: Solange der Wert ein Aufrufparameter ist, steht er beim
        Ausrollen in der Befehlszeile und im Verlauf der Schale. Ein Geheimnis,
        das man nur ablegen kann, indem man es durch eine Kommandozeile
        schiebt, ist an genau der Stelle offen, an der man es für sicher hält.

        Zweitens, und den Punkt notierte die frühere Fassung selbst: Apples
        Geheimnis ist ein JWT mit HÖCHSTENS SECHS MONATEN Laufzeit. Es läuft
        ab, ohne dass sich etwas geändert hätte, und dann steht die
        Apple-Anmeldung still. Der Tresor führt ein Ablaufdatum je Geheimnis
        und kann davor warnen. Ein Container-Apps-Secret kann das nicht.

        Der Container holt den Wert über die Identität, die oben "Key Vault
        Secrets User" bekommen hat — dieselbe, mit der er auch an die Tabellen
        geht. Ohne Versionsnummer im Pfad: Dann zieht ein Austausch im Tresor
        beim nächsten Neustart von selbst nach.
      */
      /*
        Woher das Abbild des Dienstes kommt.

        Kein Geheimnis, kein Benutzername: `identity` verweist auf dieselbe
        verwaltete Identität, die oben AcrPull bekommen hat. Container Apps
        holt sich damit selbst ein Zugriffszeichen, wenn es zieht.

        Nur wenn der Dienst überhaupt läuft — sonst zöge die Plattform ein
        Abbild, das niemand braucht, und ein Fehler dabei risse das Radio mit.
      */
      registries: !mitAnmeldung ? [] : [
        {
          server: registry.properties.loginServer
          identity: dienstIdentitaet.id
        }
      ]
      secrets: concat(!mitGoogle ? [] : [
        {
          name: 'google-geheimnis'
          keyVaultUrl: '${tresor.properties.vaultUri}secrets/google-geheimnis'
          identity: dienstIdentitaet.id
        }
      ], !mitApple ? [] : [
        {
          name: 'apple-schluessel'
          keyVaultUrl: '${tresor.properties.vaultUri}secrets/apple-schluessel'
          identity: dienstIdentitaet.id
        }
      ])
    }
    template: {
      containers: concat([
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
              httpGet: { path: '/gesund', port: 8080 }
              initialDelaySeconds: 2
              periodSeconds: 10
            }
            {
              type: 'Liveness'
              httpGet: { path: '/gesund', port: 8080 }
              initialDelaySeconds: 5
              periodSeconds: 30
            }
          ]
        }
      ], kontoContainer)
      /*
        HIER STEHT ETWAS UNGELÖSTES, und es wird bewusst NICHT hier gelöst.

        `state`, `nonce`, der PKCE-Verifier und die WebAuthn-Herausforderungen
        liegen im ARBEITSSPEICHER des Anmeldedienstes (siehe Abschnitt 7.1 in
        dienst/FREMDANMELDUNG.md). Bei mehr als einer Replik muss der Rückweg
        von Google oder Apple dieselbe Replik treffen wie der Start — sonst
        scheitert ein Teil der Anmeldungen scheinbar zufällig.

        `hoechstExemplare` steht auf 3, und die Regel unten skaliert ab 50
        gleichzeitigen Anfragen. Sobald also viel los ist, kann genau das
        passieren. FREMDANMELDUNG.md geht an dieser Stelle noch davon aus,
        main.bicep fahre eine Replik — das stimmt seit der Obergrenze 3 nicht
        mehr.

        Drei Wege, und keiner gehört in diese Änderung:

        1. `affinity: sticky` am Ingress. Wirkt sofort, setzt aber JEDEM
           Besucher ein Plätzchen — auch dem, der nie ein Konto anlegt. Für
           eine Seite, die heute ohne Einwilligung auskommt, weil sie nichts
           auf dem Endgerät ablegt, ist das keine Kleinigkeit, sondern eine
           Frage an § 25 TDDDG.
        2. Den Vorgangsspeicher in die Tabelle `konten` legen. Sauber, kostet
           eine Zeile je Anmeldeversuch und ist Arbeit am Dienst.
        3. `hoechstExemplare` auf 1. Billig, aber es deckelt das Radio wegen
           der Anmeldung.

        Bis das entschieden ist, bleibt die Skalierung, wie sie war. Mail-,
        Passwort- und Codeanmeldung sind davon nicht betroffen — sie halten
        nichts im Arbeitsspeicher.
      */
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

// ── Ausgaben für den Anmeldedienst ──────────────────────────────────

@description('Läuft der Sidecar? Bei false stehen Speicher und ACS bereits, der Container aber nicht.')
output anmeldungLaeuft bool = mitAnmeldung

@description('Speicherkontoname, für az-Befehle.')
output speicherKonto string = speicher.name

@description('Ressourcen-ID der ACS-Ressource. Bereich für die Rollenzuweisung, siehe acsRolleId.')
output acsRessource string = kommunikation.id

@description('Objekt-ID der Dienstidentität. Empfänger der Rollenzuweisung für ACS.')
output dienstObjektId string = dienstIdentitaet.properties.principalId

/*
  Die DNS-Einträge für die Absenderdomäne — direkt aus der Ressource, damit
  niemand sie abtippt.

  Reihenfolge zwingend, wie bei den eigenen Domänen: erst DNS, dann prüfen
  lassen. Azure prüft in Abständen von 15 bis 30 Minuten; das ist Azures Takt,
  nicht Cloudflares Trägheit. Zwei Runden: erst der Domain-Eintrag, dann SPF
  und die beiden DKIM-Einträge.

  Alle Einträge DNS only — graue Wolke. Dieselbe Regel wie beim Zertifikat der
  Container App, aus einem anderen Grund: Einen Proxy vor einem TXT-Eintrag
  gibt es nicht, aber wer die Zone einmal umstellt, stellt sie gern ganz um.

  Zusätzlich nötig, aber von Azure nicht vorgegeben und deshalb NICHT in dieser
  Ausgabe: ein MX-Eintrag auf `mail` und ein DMARC-Eintrag auf `_dmarc.mail`.
  Beides steht in docs/anmeldung-einrichten.md.
*/
@description('SPF-, DKIM- und Prüfeinträge für die Absenderdomäne. Bei Cloudflare eintragen, alle DNS only.')
output mailDnsEintraege object = maildomaene.properties.verificationRecords

@description('Der Tresor. Geheimnisse legt man dort ab, nicht über Aufrufparameter.')
output tresorName string = tresor.name

@description('Adresse des Tresors, für az keyvault secret set --vault-name.')
output tresorAdresse string = tresor.properties.vaultUri

@description('Die Registry. Dorthin gehoert das Abbild des Anmeldedienstes.')
output registryName string = registry.name

@description('Anmeldeadresse der Registry, fuer docker tag und docker push.')
output registryAdresse string = registry.properties.loginServer
