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

  ── WAS GEMESSEN WIRD, seit es /messung gibt ──────────────────────────

  An dieser Stelle stand bis zur Reichweitenmessung, es werde NICHT gemessen,
  welcher Sender gehört wird. Das gilt nicht mehr, und der Satz durfte nicht
  stehenbleiben — ein Kommentar, der die Sache beschönigt, ist schlimmer als
  gar keiner.

  Die Webseite meldet über assets/lib/messung.mjs an den eigenen Endpunkt
  /messung (deploy/nginx.conf) sechs Ereignisse:

    start        welcher Sender GESTARTET wurde
    regal        welches Regal geöffnet wurde
    filter       welcher Filter mit wie vielen Treffern gegriffen hat
    suche        DASS gesucht wurde
    sprache      auf welche Sprache umgeschaltet wurde
    installiert  dass die App eingebaut wurde

  Das geht an den eigenen Server in derselben Ressourcengruppe. Es gibt
  keinen Dritten und keinen Einwilligungsbanner, weil nach § 25 TDDDG nichts
  auf dem Endgerät gespeichert und nichts von dort gelesen wird. Gespeichert
  wird einzig der WIDERSPRUCH, und der ist nach § 25 Abs. 2 Nr. 2 frei.

  ── WAS WEITERHIN NICHT GEMESSEN WIRD ─────────────────────────────────

  Diese Liste ist der wichtigere Teil, und sie ist verbindlich:

    Wer etwas hört. Keine Kennung, kein Plätzchen, keine Sitzungsnummer geht
      hinaus. Die Webseite schickt kein Feld, das eine Person benennt.
    Wie lange gehört wird. Nur der Start wird gemeldet, nie das Ende. Die
      Ströme laufen direkt vom Browser zum Sender und berühren diesen Server
      nie — die Hördauer wäre nur messbar, wenn die Seite mitzählte.
    Wonach gesucht wurde. Gezählt wird, DASS jemand sucht, niemals das Wort.
    Die volle Besucheradresse. nginx kürzt sie, bevor überhaupt etwas
      geschrieben wird (Karte für den Besucher in deploy/nginx.conf).

  ── UND WAS DIESE LISTE NICHT VERSPRICHT ──────────────────────────────

  Anonymität. Sie verspricht, dass nichts MITGESCHICKT wird, das eine Person
  benennt. Das ist etwas anderes als die Zusicherung, dass sich aus dem
  Ergebnis keine Person herauslesen lässt, und der Unterschied trägt die
  Warnungen weiter unten. Drei davon gehören in diesen Kopf:

  1. Messzeilen und Zugriffszeilen stehen in DERSELBEN Tabelle und tragen
     DASSELBE Feld für den Besucher gehabt. Ein Join über zwei Zeilen KQL
     hätte an jedes gemeldete Ereignis die Browserkennung und die
     Verweisquelle aus dem Zugriffsprotokoll gehängt. Die Messung hat keine
     eigene Kennung — sie hätte eine geerbt.

     BEHOBEN: Das Feld ist aus `log_format messung` entfernt. Die
     Startquote rechnet die Bezugsgröße aus dem Zugriffsprotokoll und zählt
     die Starts nur; sie braucht das Feld nicht.

  2. Gekürzte Adresse plus Zeitstempel auf die Sekunde hätten eine Sitzung
     ergeben, auch ohne dass eine mitgeschickt wird. Ein `summarize by
     besucher, bin(TimeGenerated, 30m)` hätte die Ereignisse einer halben
     Stunde zu einem Ablauf gereiht: Regal geöffnet, gefiltert, Sender
     gestartet. Das wäre ein Verhaltensbild gewesen, entstanden durch die
     AUSWERTUNG, nicht durch die Erhebung.

     BEHOBEN mit demselben Handgriff — ohne Adressfeld gibt es nichts zu
     gruppieren.

  3. Seltene Werte sind stärkere Kennungen als häufige. Ein "installiert" aus
     einem Adressblock, eine ungewöhnliche Sprache, eine ungewöhnliche Zahl
     gemerkter Sender — je seltener, desto eindeutiger. Deshalb steht bei den
     betroffenen Abfragen jeweils, was besser nicht ins Format gehört.

  Die Datenschutzerklärung behandelt beides daher weiterhin als
  personenbezogene Daten, gestützt auf Art. 6 Abs. 1 lit. f DSGVO, und die
  Aufbewahrung bleibt bei 30 Tagen (infra/main.bicep).

  Besucheradressen sind gekürzt. "Besucher" ist unten deshalb überall eine
  Schätzung, kein Zählwert — bei einem Anschluss mit vielen Geräten zu
  niedrig, bei wechselnden Mobilfunkadressen zu hoch.
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

/*
  Die Vorrede jeder Messabfrage.

  ZWEIMAL parse_json, und das ist die Falle, in die man genau einmal tappt:
  `escape=json` in nginx maskiert den Inhalt, setzt aber keine
  Anführungszeichen — deshalb stehen im Format alle Werte in eigenen
  Anführungszeichen, und der Rumpf landet als ZEICHENKETTE im Feld für das
  Ereignis. Er ist JSON im JSON. Wer nur einmal parst, bekommt keinen Fehler,
  sondern stumm leere Werte, und wundert sich über ein leeres Dashboard bei
  vollem Protokoll.

  Erst `has "messung"` als grobes Sieb — das läuft über den Volltextindex und
  ist billig —, dann der genaue Vergleich auf die Art. Ein Sender, der
  "messung" im Namen trüge, käme durch das Sieb, aber nicht durch den
  Vergleich.
*/
var ereignisse = 'let M = ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| where Log_s has "messung"\n| extend E = parse_json(Log_s)\n| where tostring(E.art) == "messung"\n| extend R = parse_json(tostring(E.ereignis))\n| extend Was = tostring(R.was);\n'

var messung = {
  /*
    Die eigentliche Kennzahl eines Radios. Wer nichts startet, hat nichts
    gefunden — alles andere in dieser Mappe erklärt nur, woran es lag.

    Bewusst OHNE dcount auf der Messseite: Die Bezugsgröße kommt aus dem
    Zugriffsprotokoll, die Starts sind eine reine Zählung. Diese Abfrage
    überlebt es also, wenn das Besucherfeld aus dem Messformat verschwindet —
    und das sollte es, siehe die Warnung bei `filterWirkung`.
  */
  startquoteGesamt: '${ereignisse}let besucher = toscalar(ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| where tostring(E.status) == "200"\n| extend P = tostring(E.pfad)\n| where P == "/" or P endswith "/index.html"\n| summarize dcount(tostring(E.besucher)));\nM\n| where Was == "start"\n| summarize Starts = count(), Verschiedene_Sender = dcount(tostring(R.sender))\n| extend Besucher_geschaetzt = besucher\n| extend Starts_je_Besuch = round(1.0 * Starts / besucher, 2)\n| project Besucher_geschaetzt, Starts, Starts_je_Besuch, Verschiedene_Sender'

  startquote: '${ereignisse}let besuche = ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| where tostring(E.status) == "200"\n| extend P = tostring(E.pfad)\n| where P == "/" or P endswith "/index.html"\n| summarize Seitenaufrufe = count(), Besucher = dcount(tostring(E.besucher)) by Tag = bin(TimeGenerated, 1d);\nlet starts = M\n| where Was == "start"\n| summarize Starts = count() by Tag = bin(TimeGenerated, 1d);\nbesuche\n| join kind=leftouter starts on Tag\n| extend Starts = coalesce(Starts, long(0))\n| extend Starts_je_Besuch = round(1.0 * Starts / Besucher, 2)\n| project Tag, Besucher, Seitenaufrufe, Starts, Starts_je_Besuch\n| order by Tag desc'

  /*
    129 Sender ergäben 129 Linien und ein unlesbares Bild. Deshalb die acht
    stärksten einzeln, der Rest gesammelt — man sieht dann auch, ob die Spitze
    wächst oder ob sich die Starts breit verteilen. Das zweite wäre für einen
    Laden mit acht Regalen die bessere Nachricht.
  */
  senderVerlauf: '${ereignisse}let spitze = M\n| where Was == "start"\n| summarize N = count() by S = tostring(R.sender)\n| top 8 by N\n| project S;\nM\n| where Was == "start"\n| extend Sender = tostring(R.sender)\n| extend Sender = iff(Sender in (spitze), Sender, "Übrige")\n| summarize Starts = count() by Sender, bin(TimeGenerated, 1d)\n| render timechart'

  /*
    Die vollständige Liste, und das Interessante daran ist, wer FEHLT: Ein
    Sender aus data/sender.json, der hier nicht auftaucht, wurde dreißig Tage
    lang von niemandem gestartet. Ein Regal, in dem drei von zwölf Sendern je
    angefasst werden, ist kein volles Regal, sondern ein schlecht sortiertes.
  */
  senderListe: '${ereignisse}M\n| where Was == "start"\n| where isnotempty(tostring(R.sender))\n| summarize Starts = count(), Tage_mit_Start = dcount(bin(TimeGenerated, 1d)), Zuletzt = max(TimeGenerated) by Sender = tostring(R.sender)\n| order by Starts desc\n| take 60'

  regale: '${ereignisse}M\n| where Was == "regal"\n| summarize Oeffnungen = count() by Regal = tostring(R.regal)\n| order by Oeffnungen desc\n| render barchart'

  /*
    Ein Filter, der immer null Treffer liefert, ist ein Gestaltungsfehler und
    kein Bedienfehler: Er steht sichtbar da, verspricht etwas und liefert
    nichts. Der Leerlaufanteil macht das zur Zahl. 100 heißt: dieser Chip hat
    noch nie funktioniert.

    ACHTUNG bei der Achse "gemerkte". Die Trefferzahl ist dort die Zahl der
    gemerkten Sender EINER PERSON — kein Befund über die Gestaltung, sondern
    ihr persönlicher Bestand. Eine Zahl zwischen 0 und 129, über Wochen
    stabil, ist zusammen mit der gekürzten Adresse eine bessere Wiedererkennung
    als die Adresse allein: Zwei Ereignisse aus demselben Adressblock mit
    derselben ungewöhnlichen Zahl sind mit hoher Sicherheit dieselbe Person.
    Auswertbar ist daran nichts — der Filter "gemerkte" findet immer genau
    das, was jemand gemerkt hat. Die Zeile gehört ins Messformat nicht hinein;
    solange sie ankommt, steht sie hier mit drin und fällt hoffentlich auf.
  */
  filterWirkung: '${ereignisse}M\n| where Was == "filter"\n| extend Treffer = toint(R.treffer)\n| summarize Anwendungen = count(), Treffer_Mittel = round(avg(Treffer), 1), Treffer_Kleinstes = min(Treffer), Leerlauf = countif(Treffer == 0) by Achse = tostring(R.achse), Wert = tostring(R.wert)\n| extend Leer_Prozent = round(100.0 * Leerlauf / Anwendungen, 1)\n| order by Leer_Prozent desc, Anwendungen desc'

  filterTot: '${ereignisse}M\n| where Was == "filter"\n| extend Treffer = toint(R.treffer)\n| summarize Anwendungen = count(), Bestes_Ergebnis = max(Treffer), Zuletzt = max(TimeGenerated) by Achse = tostring(R.achse), Wert = tostring(R.wert)\n| where Bestes_Ergebnis == 0\n| order by Anwendungen desc'

  /*
    Alle sechs Arten nebeneinander. Hier steckt auch die Suche, und zwar
    vollständig: gezählt wird, DASS gesucht wurde. Steigt die Suche, während
    die Regale liegenbleiben, findet die Regalwand ihre Sender nicht mehr.
  */
  ereignisarten: '${ereignisse}M\n| summarize Anzahl = count() by Was, bin(TimeGenerated, 1d)\n| render timechart'

  /*
    Die Sprachverteilung kommt aus den SEITENPFADEN, nicht aus dem Messformat.
    Zwei Gründe: Sie steht schon lange im Zugriffsprotokoll, und sie zählt die
    AUSGELIEFERTE Sprache — genau das, wonach gefragt ist. Für diese Frage
    bräuchte es das Sprachfeld in der Messzeile gar nicht.
  */
  sprachen: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend E = parse_json(Log_s)\n| extend P = tostring(E.pfad)\n| where P endswith "/index.html" or P endswith "/"\n| extend Sprache = tolower(substring(P, 1, 2))\n| where Sprache in ("de", "en", "fr", "es", "it", "ja", "ar")\n| summarize Aufrufe = count(), Besucher = dcount(tostring(E.besucher)) by Sprache\n| order by Aufrufe desc\n| render piechart'

  /*
    Die Gegenprobe aus dem Messformat. `substring(..., 0, 2)` schneidet die
    ersten zwei Zeichen ab und trifft damit sowohl "de" als auch
    "de-DE,de;q=0.9,en;q=0.8" — die Abfrage hält es aus, wenn nginx dort das
    eine oder das andere schreibt. Weicht sie vom Kreisdiagramm daneben ab,
    hat jemand eine Sprache eingestellt, die sein Browser nicht meldet; das
    ist der Umschalter bei der Arbeit.
  */
  sprachenGemeldet: '${ereignisse}M\n| extend Sprache = tolower(substring(tostring(R.sprache), 0, 2))\n| where Sprache in ("de", "en", "fr", "es", "it", "ja", "ar")\n| summarize Ereignisse = count() by Sprache, Was\n| order by Ereignisse desc'

  /*
    Umschaltvorgänge. Hält sich diese Art hartnäckig oben, ist nicht der
    Umschalter beliebt, sondern die Erstzuweisung falsch — dann schickt die
    Sprachweiche in nginx die Leute regelmäßig an die falsche Adresse.
  */
  sprachwechsel: '${ereignisse}M\n| where Was == "sprache"\n| summarize Wechsel = count() by Ziel = tostring(R.wert)\n| order by Wechsel desc'

  /*
    Prüfzahl, und die wichtigste Abfrage dieser Mappe.

    Im Messformat steht ein Sprachfeld. Ist es zwei Zeichen lang, kommt dort
    ein Sprachkürzel an — sieben mögliche Werte, unbedenklich. Ist es dreißig
    bis fünfzig Zeichen lang, kommt der volle Accept-Language-Kopf an, also
    eine gewichtete Liste wie "de-DE,de;q=0.9,en-US;q=0.8,ja;q=0.7". Die ist
    einer der stärksten passiven Fingerabdrücke, die ein Browser hergibt: Wer
    drei Sprachen in ungewöhnlicher Reihenfolge führt, ist in Deutschland
    häufig eindeutig, und zusammen mit der gekürzten Adresse wird aus zwei
    Halbheiten eine Kennung. Für die Frage, wie sich sieben Sprachen
    verteilen, trägt die Liste nichts bei, was das erste Kürzel nicht auch
    trüge.

    Steht hier eine Länge über 5, gehört im log_format für die Messung die
    Kopfzeile durch die Sprachvariable der Karte ersetzt. Die Karte gibt es in
    deploy/nginx.conf schon; sie liefert genau ein Kürzel aus sieben.
  */
  sprachkopfPruefung: '${ereignisse}M\n| mv-expand Feld = bag_keys(E) to typeof(string)\n| summarize Zeilen = count(), Zuletzt = max(TimeGenerated) by Feld\n| extend Bewertung = case(Feld in (\'art\', \'zeit\', \'ereignis\'), \'erwartet\', \'UNERWARTET — nachsehen\')\n| order by Bewertung asc, Feld asc'

  /*
    Manifest-Abrufe gab es schon; sie sind ein Hinweis, kein Beweis — jeder
    Browser holt das Manifest, auch ohne Einbau. Daneben jetzt die gemeldeten
    Einbauten. Der Abstand zwischen beiden Linien ist die Antwort auf die
    Frage, wie viel ein Manifest-Abruf je wert war.

    Der Einbau ist ein SELTENES Ereignis, und seltene Ereignisse sind starke
    Kennungen: Ein Adressblock, aus dem einmal "installiert" kommt, ist damit
    markiert. Ein Grund mehr, das Besucherfeld aus dem Messformat zu nehmen.
  */
  installiertVergleich: '${ereignisse}union\n  (ContainerAppConsoleLogs_CL\n   | where TimeGenerated > ago(30d)\n   | extend E = parse_json(Log_s)\n   | where tostring(E.pfad) == "/manifest.webmanifest"\n   | extend Art = "Manifest abgerufen"),\n  (M\n   | where Was == "installiert"\n   | extend Art = "Einbau gemeldet")\n| summarize Anzahl = count() by Art, bin(TimeGenerated, 1d)\n| render timechart'
}

/*
  ══ WAS DIE MESSUNG KOSTET ═══════════════════════════════════════════

  Preise am 21.08.2026 aus der Azure Retail Prices API geholt, nicht von den
  Preisseiten — die rendern per JavaScript und liefern einem Abruf nur
  Platzhalter:

      https://prices.azure.com/api/retail/prices
        ?currencyCode='EUR'
        &[filter]=serviceName eq 'Log Analytics'
                  and armRegionName eq 'germanywestcentral'

  Ergebnis für Germany West Central, SKU "Analytics Logs":

      Aufnahme, erste 5 GB je Monat ........  0,0000 EUR / GB
      Aufnahme darüber .....................  2,6271 EUR / GB   (2,99 USD)
      Aufbewahrung über 31 Tage hinaus .....  0,1142 EUR / GB / Monat
      Nachträgliche Auswertung .............  2,0208 EUR / GB

  Die Aufbewahrung kostet hier nichts: main.bicep steht auf 30 Tagen, und die
  ersten 31 sind im Aufnahmepreis enthalten. Die 5 GB sind ein Freibetrag JE
  ABRECHNUNGSKONTO, nicht je Arbeitsbereich — ein zweiter Arbeitsbereich im
  selben Konto isst mit.

  ── Wie groß eine Zeile wirklich ist ─────────────────────────────────

  Bezahlt wird nicht nur, was nginx schreibt. ContainerAppConsoleLogs_CL hängt
  an jede Zeile Containerkennung, Abbildname, Revision, Umgebung und
  Datenstrom — rund 260 Byte, die mitlaufen und die man durch Kürzen des
  Formats nicht wegbekommt.

      Messzeile, JSON von nginx ............ 125 bis 185 Byte (nachgezählt)
      Spaltenlast der Tabelle .............. rund 260 Byte
      zusammen ............................. rund 450 Byte je Ereignis

      Zugriffszeile, mit Browserkennung
      und Verweisquelle .................... rund 600 Byte je ANFRAGE

  Geschätzt ist das nur bis zum ersten echten Tag: Die Abfragen im Abschnitt
  "Was das kostet" lesen die tatsächliche Größe aus `_BilledSize`. Weichen die
  dort angezeigten Byte je Zeile stark von 450 ab, gilt die Anzeige und nicht
  dieser Kommentar.

  ── Wie viele Ereignisse in 5 GB passen ──────────────────────────────

      5 GB / 450 Byte = rund 12,0 Millionen Ereignisse im Monat

  Ein Besuch löst grob vier Ereignisse aus (ein Start, ein Regal, ein Filter,
  eine Suche). Die Messung ALLEIN reißt das Kontingent also erst bei rund
  3,0 Millionen Besuchen im Monat, also 100 000 am Tag.

  ── Der Kostentreiber ist aber nicht die Messung ─────────────────────

  Ein Erstbesuch der PWA holt gut 25 Dateien, ein Wiederbesuch drei bis fünf,
  weil der Service Worker den Rest hält. Im Mittel rund 14 Anfragen, jede mit
  einer eigenen 600-Byte-Zeile:

      je Besuch   Zugriffsprotokoll  8,4 KB        Messung  1,8 KB
      zusammen    rund 10 KB                       davon Messung 16 %

      Das Kontingent reißt bei rund 520 000 Besuchen im Monat = 17 000 am Tag.

        100 000 Besuche/Monat ...  0,9 GB ... frei
        250 000 Besuche/Monat ...  2,4 GB ... frei
        500 000 Besuche/Monat ...  4,7 GB ... frei, knapp
      1 000 000 Besuche/Monat ...  9,4 GB ... 4,4 GB darüber  = 11,56 EUR
      2 000 000 Besuche/Monat ... 18,8 GB ... 13,8 GB darüber = 36,26 EUR

  ── Braucht es eine Stichprobe oder eine kürzere Frist? ──────────────

  Nein, und bei den heutigen Zahlen auf absehbare Zeit nicht. Falls es doch
  eng wird, entscheidet die Reihenfolge der Hebel — und die Messung ist der
  letzte davon:

  1. Anlagen nicht protokollieren: `access_log off;` in den Blöcken für
     /assets/logos und /assets/schrift. Das sind rund 20 der 25 Anfragen eines
     Erstbesuchs, und sie tragen zur Auswertung nichts bei; niemand fragt, wie
     oft eine Schriftdatei geholt wurde. Danach reicht das Freikontingent für
     rund 1,1 Millionen Besuche im Monat — mehr als doppelt so weit, ohne dass
     eine einzige Frage unbeantwortet bliebe.
  2. Die Browserkennung im Zugriffsprotokoll kürzen. Sie ist mit Abstand das
     längste Feld und zugleich das, was den Personenbezug am stärksten erhöht.
     Zwei Fliegen mit einer Klappe.
  3. Die Aufbewahrung von 30 auf 14 Tage senken. Für DIESE Rechnung bringt das
     nichts — abgerechnet wird beim Schreiben, nicht beim Liegen. Sinnvoll
     allein aus Datenschutzgründen.
  4. Erst dann eine Stichprobe der Messung, etwa jedes zweite Ereignis. Der
     schlechteste Hebel: Er verzerrt genau die Liste der seltenen Sender, für
     die die Messung überhaupt gebaut wurde.
*/
var kosten = {
  /*
    Woher die Daten wirklich kommen. Erwartung nach der Rechnung oben: das
    Zugriffsprotokoll trägt gut vier Fünftel. Steht die Messung hier weit
    vorn, stimmt eine der Annahmen nicht — dann gilt diese Tabelle.
  */
  herkunft: 'ContainerAppConsoleLogs_CL\n| where TimeGenerated > ago(30d)\n| extend Herkunft = case(\n    Log_s has "fehlerbericht", "Fehlerberichte",\n    Log_s has "messung", "Reichweitenmessung",\n    "Zugriffsprotokoll")\n| summarize MB = round(sum(_BilledSize) / 1048576.0, 2), Zeilen = count() by Herkunft\n| extend Byte_je_Zeile = round(MB * 1048576.0 / Zeilen, 0)\n| order by MB desc'

  jeEreignisart: '${ereignisse}M\n| summarize Zeilen = count(), MB = round(sum(_BilledSize) / 1048576.0, 2) by Was\n| extend Byte_je_Zeile = round(MB * 1048576.0 / Zeilen, 0)\n| order by MB desc'

  taeglich: 'Usage\n| where TimeGenerated > ago(30d)\n| where IsBillable == true\n| summarize GB = round(sum(Quantity) / 1024.0, 3) by Tag = bin(TimeGenerated, 1d), DataType\n| render columnchart'

  /*
    Der Preis steht fest verdrahtet, weil KQL ihn nirgends herbekommt. Quelle
    und Datum stehen im Kommentarblock darüber — wer ihn hier ändert, ändert
    ihn dort mit, sonst lügt einer von beiden.
  */
  monat: 'Usage\n| where TimeGenerated > startofmonth(now())\n| where IsBillable == true\n| summarize Aufgenommen_GB = round(sum(Quantity) / 1024.0, 3)\n| extend Frei_GB = 5.0\n| extend Ueber_dem_Freien_GB = round(max_of(Aufgenommen_GB - 5.0, 0.0), 3)\n| extend Kosten_EUR = round(Ueber_dem_Freien_GB * 2.6271, 2)'
}

var inhalt = {
  version: 'Notebook/1.0'
  items: [
    {
      type: 1
      content: {
        json: '# IYAMBAE — Zahlen\n\nAlles aus den Protokollen des eigenen Containers. Kein Dritter, keine Kennung, kein Plätzchen. **Besucheradressen sind gekürzt**, „Besucher" ist deshalb überall eine Schätzung.\n\n**Neu gemessen:** welcher Sender gestartet, welches Regal geöffnet und welcher Filter benutzt wird.\n\n**Weiterhin nicht gemessen:** wer hört, wie lange gehört wird, und wonach gesucht wurde — gezählt wird nur, *dass* gesucht wurde.'
      }
    }
    {
      type: 1
      content: {
        json: '## Kommen sie an, und finden sie etwas?'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.startquoteGesamt
        size: 4
        title: 'Die Kennzahl: Starts je Besuch, 30 Tage'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
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
        query: messung.startquote
        size: 0
        title: 'Besuche und Starts je Tag — wer nichts startet, hat nichts gefunden'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.ereignisarten
        size: 1
        title: 'Was überhaupt passiert — die sechs Ereignisarten je Tag'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 1
      content: {
        json: '## Was gestartet wird'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.senderVerlauf
        size: 0
        title: 'Die acht meistgestarteten Sender im Tagesverlauf'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.senderListe
        size: 0
        title: 'Alle gestarteten Sender — wer hier fehlt, wurde 30 Tage nicht angefasst'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.regale
        size: 1
        title: 'Welche Regale geöffnet werden'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 1
      content: {
        json: '## Ob die Filter etwas taugen\n\nEin Filter, der nie etwas findet, ist ein Gestaltungsfehler — er steht sichtbar da, verspricht etwas und liefert nichts. `Leer_Prozent = 100` heißt: dieser Chip hat noch nie funktioniert.\n\nDie Achse `gemerkte` gehört hier eigentlich nicht her: Ihre Trefferzahl ist der persönliche Bestand eines Menschen, nicht ein Befund über die Gestaltung — und über Wochen stabil genug, um jemanden wiederzuerkennen. Wenn sie unten auftaucht, sollte sie aus dem Messformat verschwinden.'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.filterTot
        size: 0
        title: 'Filter, die NIE einen Treffer hatten — hier ansetzen'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.filterWirkung
        size: 0
        title: 'Alle Filter, nach Leerlaufanteil'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 1
      content: {
        json: '## Die sieben Sprachen'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.sprachen
        size: 1
        title: 'Verteilung nach ausgelieferter Seite'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.sprachwechsel
        size: 1
        title: 'Umschaltvorgänge — wohin gewechselt wird'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.sprachenGemeldet
        size: 1
        title: 'Gegenprobe aus den Messzeilen'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 1
      content: {
        json: '### Riegelprobe: was steht wirklich in einer Messzeile?\n\nErwartet sind genau drei Felder: `art`, `zeit`, `ereignis`. Mehr nicht.\n\nFrüher standen dort auch `besucher` (die gekürzte Adresse) und `sprache` (der volle `Accept-Language`-Kopf, eine gewichtete Liste wie `de-DE,de;q=0.9,en-US;q=0.8,ja;q=0.7` — ein Fingerabdruck, in Deutschland häufig eindeutig). Beide sind aus `log_format messung` entfernt: die Adresse, weil Mess- und Zugriffszeilen dieselbe Tabelle und dasselbe Feld teilten und damit verbindbar waren; der Sprachkopf, weil die Sprache jetzt aus dem **Pfad** kommt und im Rumpf mitreist — der Umweg über `$cookie_hz_sprache` wäre ein Zugriff auf den Gerätespeicher gewesen und damit nach § 25 Abs. 1 TDDDG einwilligungspflichtig.\n\n**Taucht unten eine Zeile mit `UNERWARTET` auf, ist ein Feld zurückgekommen.** Dann gehört `log_format messung` in `deploy/nginx.conf` nachgesehen, bevor irgendetwas anderes passiert.'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.sprachkopfPruefung
        size: 4
        title: 'Felder in den Messzeilen — erwartet sind nur art, zeit, ereignis'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 1
      content: {
        json: '## Wird die App eingebaut?'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: messung.installiertVergleich
        size: 0
        title: 'Manifest-Abrufe gegen gemeldete Einbauten'
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
        title: 'Manifest-Abrufe je Tag'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 1
      content: {
        json: '## Woher sie kommen, womit sie kommen'
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
    {
      type: 1
      content: {
        json: '## Was das kostet\n\n5 GB Aufnahme im Monat sind frei, danach **2,6271 EUR je GB** (Germany West Central, Analytics Logs, Stand 21.08.2026, Azure Retail Prices API). Die Aufbewahrung ist bei 30 Tagen im Preis enthalten.\n\nGerechnet: rund 10 KB je Besuch, davon **16 % Messung und 84 % Zugriffsprotokoll**. Das Kontingent reißt bei rund **520 000 Besuchen im Monat**. Wenn es eng wird, ist der erste Hebel `access_log off` für Logos und Schriften — nicht eine Stichprobe der Messung. Die vollständige Rechnung steht im Kopf von `infra/dashboard.bicep`.'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: kosten.monat
        size: 4
        title: 'Laufender Monat: aufgenommen, über dem Freikontingent, Kosten'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: kosten.herkunft
        size: 0
        title: 'Wer das Kontingent aufbraucht — gemessen, nicht geschätzt'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: kosten.jeEreignisart
        size: 1
        title: 'Datenmenge je Ereignisart'
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: kosten.taeglich
        size: 1
        title: 'Aufgenommene Datenmenge je Tag'
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
