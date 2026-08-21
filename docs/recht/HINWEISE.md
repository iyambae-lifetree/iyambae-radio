# Was vor dem Livegang zu tun ist

Diese Datei ist die Übergabe. Sie sagt, was noch fehlt, warum es fehlt, und an
welchen Stellen ich mich auf eine Einschätzung beschränke, statt eine Antwort zu
behaupten.

Die drei Entwürfe daneben — `impressum.md`, `datenschutz.md`,
`verarbeitungsverzeichnis.md` — sind vollständig lesbar, aber sie enthalten
Platzhalter in eckigen Klammern. Solange auch nur einer davon offen ist, darf
nichts davon online.

---

## Teil A — Muss erledigt sein, bevor die Seite live geht

### 1. Die Rechtstexte müssen als Seiten ausgeliefert werden, nicht als Markdown

**Warum:** § 5 Abs. 1 DDG verlangt „leicht erkennbar, unmittelbar erreichbar und
ständig verfügbar". Eine Datei in `docs/` erfüllt keinen der drei Punkte —
`docs` steht in `.dockerignore` und landet **nicht einmal im Bau-Kontext**. Die
Texte sind im Container schlicht nicht vorhanden.

**Zu tun:**

- Aus den drei Markdown-Dateien werden zwei ausgelieferte Seiten:
  `/impressum/` und `/datenschutz/`. Das Verarbeitungsverzeichnis wird **nicht**
  veröffentlicht — es ist ein internes Dokument (Art. 30 Abs. 4 DSGVO: Vorlage
  auf Anforderung der Aufsichtsbehörde, nicht Veröffentlichung).
- Die Dateien müssen an eine Stelle, die im Abbild landet — also nicht unter
  `docs/`. Vorschlag: `recht/impressum.html` und `recht/datenschutz.html` im
  Wurzelverzeichnis, oder je Sprachordner, wenn `Scripts/baue-sprachen.py` sie
  mit erzeugen soll.
- **Verweise in die Fußzeile**, in `index.html` (heute stehen dort nur der
  MyRetuner-Hinweis und „powered by", Zeilen 249 bis 263). Aus `index.html`
  erzeugt `Scripts/baue-sprachen.py` alle sieben Sprachfassungen — ein Eintrag
  genügt also, wenn die Beschriftung über `data-text` läuft und die
  Übersetzungen in `assets/lang/*.json` nachgezogen werden.
- **Auch auf apps.iyambae.fm.** Eigener Hostname, eigener Dokumentenstamm
  (`/srv/apps`), eigenes Telemedium. Dort fehlt jede Fußzeile.
- Sollen die Seiten offline verfügbar sein, gehören sie in `SHELL_FILES` in
  `sw.js` — **dann `SW_VERSION` hochzählen**, sonst sehen bestehende Besucher
  sie nie. `Scripts/pruefe-shell-dateien.py` prüft die Liste.

### 2. Entscheiden, welche Anschrift im Impressum steht

**Warum:** Eine ladungsfähige Anschrift ist Pflicht — Straße und Hausnummer,
kein Postfach. Für eine Privatperson heißt das die Wohnanschrift. Das ist eine
persönliche Entscheidung, die niemand für Micha treffen kann, und sie hat
Folgen, die über das Recht hinausgehen: Die Adresse ist danach öffentlich und
wird von Adresssammlern erfasst.

**Die drei Wege, ehrlich gegenübergestellt:**

| Weg | Kosten | Haken |
|---|---|---|
| Eigene Wohnanschrift | 0 € | steht öffentlich im Netz |
| Ladungsfähige Anschrift über einen Dienstleister | laufend | muss echte Zustellung ermöglichen; reine „virtuelle Büros" ohne Zustellfähigkeit genügen nicht |
| Verein oder UG als Anbieter | Gründung, Buchführung | eigene Rechtsform mit eigenen Pflichten |

Ein Impressum ohne Anschrift ist kein vierter Weg.

### 3. Alle Platzhalter füllen

Vollständige Liste, damit keiner übersehen wird:

- **`impressum.md`:** Name, Straße/Hausnummer, PLZ/Ort, E-Mail, ggf. Telefon,
  Name und Anschrift des Verantwortlichen nach § 18 Abs. 2 MStV.
- **`datenschutz.md`:** Name/Anschrift/E-Mail des Verantwortlichen; Ort des
  Widerruf-Schalters für Fehlerberichte (Punkt 5); Aufsichtsbehörde (Punkt 7);
  Datum des Livegangs; im Kontoabschnitt die beiden offenen Fristen (Punkte 10
  und 11).
- **`verarbeitungsverzeichnis.md`:** Verantwortlicher; die beiden
  zugriffsberechtigten Personen; E-Mail-Anbieter samt Drittlandangabe und
  Löschfrist (V8); Aufbewahrungsdauer der ACS-Zustellprotokolle (V10); Datum der
  nächsten Durchsicht.

### 4. Google Fonts selbst ausliefern

**Warum:** Das ist der einzige Punkt in dieser Liste, zu dem es eine deutsche
Gerichtsentscheidung gibt — LG München I, Urteil vom 20.01.2022, Az. 3 O
17493/20: 100 € Schadensersatz und Unterlassung für die dynamische Einbindung
ohne Einwilligung. Die Entscheidung ist erstinstanzlich und kein höchstrichterlich
geklärtes Recht, sie hat aber eine anhaltende Abmahnwelle ausgelöst. Wichtiger
als die Rechtslage ist ohnehin: **Der Abfluss ist vermeidbar, und zwar in einer
Stunde.**

**Zu tun:**

1. Die fünf Familien als `.woff2` herunterladen: Inter, Orbitron, JetBrains Mono
   und — nur für `/ar/` — IBM Plex Sans Arabic sowie Noto Kufi Arabic. Nur die
   tatsächlich verwendeten Schnitte; die Gewichte stehen in `index.html` in den
   Adressen der beiden Stylesheets.
2. Nach `assets/fonts/` legen, `@font-face`-Regeln in `assets/styles.css`, mit
   `font-display: swap` (das entspricht dem heutigen `&display=swap`).
3. Zeilen 11, 12, 13 und 20 aus `index.html` entfernen — die beiden
   `preconnect`-Zeilen und die beiden Stylesheet-Verweise.
4. In `sw.js` den Zweig für fremde Herkünfte entfernen (`istSchriftart` und der
   `stale-while-revalidate`-Block am Ende). Die Schriften sind dann eigene
   Dateien und laufen über den bestehenden Weg. `SW_VERSION` hochzählen und die
   Schriftdateien in `SHELL_FILES` eintragen, sonst fehlen sie offline.
5. `Scripts/baue-sprachen.py` prüfen: Das Skript entfernt heute die
   Arabisch-Zeile aus allen Seiten außer `/ar/`. Fällt die Zeile weg, muss diese
   Sonderbehandlung mit — sonst bricht der Bau oder es bleibt toter Code.
6. In `datenschutz.md` Abschnitt 4 löschen und in
   `verarbeitungsverzeichnis.md` V4 streichen.

**Lizenzen:** Nach Angabe der jeweiligen Anbieter stehen alle fünf unter SIL
Open Font License bzw. Apache-Lizenz, die das Selbsthosten erlauben. **Ich habe
das nicht nachgeprüft** — vor dem Umzug je Schrift einmal in die
Lizenzdatei sehen und diese mit ins Repository legen.

### 5. Den Widerruf für Fehlerberichte anschließen

**Warum:** Art. 7 Abs. 3 Satz 4 DSGVO — der Widerruf muss so einfach sein wie
die Erteilung. Erteilt wird sie mit einem Klick im Dialog. Widerrufen lässt sie
sich derzeit **gar nicht**, außer durch Löschen aller Websitedaten.

**Der Befund im Programmtext:** `assets/lib/fehlerbericht.mjs` exportiert
`widerrufeEinwilligung()` und `einwilligungsstand()`. Beide werden **nirgends
aufgerufen** — geprüft über den gesamten Ordner `assets/`. Die Funktion ist
fertig, es fehlt nur die Schaltfläche.

**Zu tun:** In den Einstellungen einen Schalter „Fehlerberichte senden" zeigen,
der `einwilligungsstand()` liest und beim Ausschalten `widerrufeEinwilligung()`
aufruft. Danach in `datenschutz.md` Abschnitt 3 den Platzhalter durch den echten
Ort ersetzen („in den Einstellungen unter …").

### 6. Dasselbe für die MyRetuner-Abfrage

**Warum:** Auch das ist eine Einwilligung (Klick auf „Ich habe MyRetuner"), und
auch sie lässt sich nur durch Löschen der Websitedaten zurücknehmen. Der Zustand
steht in `hz_mr_zustand`; ein Schalter, der ihn auf `abgelehnt` setzt, ist eine
Zeile.

**Geringere Dringlichkeit als Punkt 5**, weil bei dieser Abfrage nichts an einen
Server geht — sie bleibt auf dem Gerät. Aber es ist derselbe Handgriff, und es
wäre schade, ihn zweimal anzufassen.

### 7. Zuständige Aufsichtsbehörde eintragen

**Warum:** Art. 13 Abs. 2 lit. d DSGVO verlangt den Hinweis auf das
Beschwerderecht. Die Behörde zu nennen, ist nicht vorgeschrieben, aber üblich
und hilfreich.

**Zu tun:** Zuständig ist die Landesdatenschutzbehörde des Bundeslands, in dem
der Verantwortliche seinen Sitz hat. Namen, Anschrift und Website von der Seite
der Behörde übernehmen und in `datenschutz.md`, Abschnitt 11, eintragen. **Ich
weiß nicht, wo Micha wohnt, und rate an dieser Stelle nicht.**

### 8. Auftragsverarbeitungsverträge dokumentieren

**Warum:** Art. 28 Abs. 3 DSGVO verlangt einen Vertrag mit jedem
Auftragsverarbeiter, und Art. 5 Abs. 2 verlangt, dass man das nachweisen kann.

**Zu tun:**

- **Microsoft:** Das „Products and Services Data Protection Addendum" (DPA) gilt
  für Azure-Kunden. Es kommt nicht automatisch zustande, ohne dass jemand die
  Vertragsbedingungen akzeptiert hat — Fassung und Datum feststellen, als PDF
  ablegen und in `verarbeitungsverzeichnis.md` in der Tabelle der
  Auftragsverarbeiter eintragen.
- **E-Mail-Anbieter:** Das Postfach, unter dem Betroffenenanfragen eingehen, ist
  eine Verarbeitung. Anbieter feststellen, AV-Vertrag abschließen, V8 im
  Verzeichnis vervollständigen.

### 9. Ablauf für den Fall einer Datenschutzverletzung aufschreiben

**Warum:** Art. 33 DSGVO — 72 Stunden ab Kenntnis, dann muss die Meldung an die
Aufsichtsbehörde raus. Das ist keine Zeit, in der man anfängt zu überlegen, wer
zuständig ist und wo das Formular liegt.

**Zu tun:** Eine Seite genügt: Wer entscheidet, welche Behörde, welches
Meldeformular, welche Angaben (Art der Verletzung, betroffene Kategorien und
ungefähre Zahl, Folgen, Maßnahmen), und wann zusätzlich die Betroffenen
informiert werden müssen (Art. 34: bei hohem Risiko). Ablage neben diesen
Dokumenten.

---

## Teil B — Erst nötig, wenn die Konten kommen

Diese Punkte sind kein Aufschub-Material: Die meisten stehen bereits als „NOCH
ZU TUN" in `infra/konto.bicep.entwurf`. Ich wiederhole hier nur, was eine
datenschutzrechtliche Seite hat.

### 10. Frist für inaktive Konten festlegen

**Warum:** Art. 5 Abs. 1 lit. e DSGVO — Speicherbegrenzung. Ein Konto, das
niemand mehr benutzt, darf nicht ewig liegen. Es gibt keine gesetzliche Zahl;
üblich und begründbar sind 24 bis 36 Monate ohne Anmeldung, mit einer Vorwarnung
per E-Mail vor der Löschung.

**Zu tun:** Frist entscheiden, in `datenschutz.md` Abschnitt 9 und in V9 des
Verzeichnisses eintragen, und den Räumdurchgang, der ohnehin täglich läuft, um
diese Prüfung erweitern. Das Feld dafür gibt es schon: `zuletztGesehen` in der
Zeile `'konto'`.

### 11. Klären, was ein „Grabstein" ist und was er enthält

**Warum:** `konto.bicep.entwurf` hat einen Parameter `grabsteinTage`
(Vorgabe 90, Minimum 30, Maximum 365) mit der Beschreibung „Wie lange gelöschte
Einträge als Grabstein liegen bleiben". Der Kommentar verweist auf „den
Kommentar bei der Tabelle" — dort steht aber nur, wie abgelaufene Sitzungen
weggeräumt werden, nichts über Grabsteine.

**Das ist eine echte Lücke, keine Formalie.** Wenn nach einer Löschung nach
Art. 17 DSGVO 90 Tage lang irgendetwas stehen bleibt, muss in der
Datenschutzerklärung stehen, **was** stehen bleibt und **warum**. Bleibt nur ein
inhaltsloser Marker stehen, damit ein verspäteter Schreibvorgang das Konto nicht
wiederbelebt, ist das begründbar und leicht erklärt. Bleibt die E-Mail-Adresse
stehen, ist es etwas ganz anderes.

**Zu tun:** Entscheiden, aufschreiben, in `datenschutz.md` Abschnitt 9 und in V9
eintragen — **vor** der ersten Zeile Programmcode, die Grabsteine schreibt.

### 12. Weitere Punkte zum Konto, kurz

- **Content-Security-Policy.** Fehlt heute vollständig. Ohne sie kann ein
  eingeschleustes Skript den Anmeldezustand mitlesen. Im Entwurf bereits
  vermerkt. Wird deutlich einfacher, wenn Punkt 4 erledigt ist.
- **Passwort-Hash-Verfahren festlegen.** Der Entwurf sagt „Passwort-Hash", nennt
  aber kein Verfahren. Art. 32 DSGVO verlangt den Stand der Technik; das heißt
  heute Argon2id oder scrypt, nicht SHA-256, nicht PBKDF2 mit niedriger
  Rundenzahl. Das gehört entschieden, bevor der erste Nutzer ein Passwort setzt
   — hinterher ist es eine Migration.
- **Mindestalter entscheiden (Art. 8 DSGVO).** Für Dienste der
  Informationsgesellschaft, die einem Kind direkt angeboten werden, ist die
  Einwilligung eines Kindes unter 16 Jahren nur mit Zustimmung der
  Sorgeberechtigten wirksam; Deutschland hat die Altersgrenze nicht abgesenkt.
  Das Konto stützt sich zwar auf Art. 6 Abs. 1 lit. b und nicht auf eine
  Einwilligung — die Frage der Geschäftsfähigkeit Minderjähriger beim
  Vertragsschluss stellt sich damit aber trotzdem. Eine Altersangabe bei der
  Registrierung und ein Satz in den Nutzungsbedingungen sind der übliche Weg.
  **Anwaltsfrage, siehe Teil C.**
- **ACS-Rollenkennung nachschlagen.** Steht im Entwurf; bleibt sie leer, läuft
  der Mailversand über eine Verbindungszeichenfolge — dann ist deren Rotation zu
  regeln, und das gehört als organisatorische Maßnahme ins Verzeichnis.
- **`/api/` nie zwischenspeichern.** Der Service Worker legt heute jede
  erfolgreiche Antwort eigener Herkunft ab. Eine Antwort mit fremder Merkliste im
  Zwischenspeicher eines Familiengeräts ist eine meldepflichtige Datenpanne, kein
  Schönheitsfehler. Der Entwurf beschreibt die Zeile, die das verhindert.

---

## Teil C — Wo ein Anwalt nötig ist

Ich schreibe hier deutlich, statt zu relativieren: Die folgenden neun Punkte
kann ich **nicht** abschließend beurteilen. Bei den ersten drei geht es um Geld
und Abmahnrisiko, bei den übrigen um Fragen, zu denen es keine gefestigte
Rechtsprechung gibt.

**1. Die Anschrift im Impressum (Punkt 2).** Ob eine Anschrift über einen
Dienstleister „ladungsfähig" ist, hängt von der konkreten Vereinbarung ab. Wer
das falsch macht, hat kein Impressum.

**2. Die Einordnung nach § 18 Abs. 2 MStV.** Meine Einschätzung steht in
`impressum.md` und lautet: eher nicht journalistisch-redaktionell, aber die
Angabe trotzdem machen. Das ist eine Wertung. Ein Anwalt, der die konkreten
Kärtchentexte gelesen hat, kann sie besser treffen — insbesondere, wenn
redaktionelle Inhalte hinzukommen sollen.

**3. Google Fonts, falls Micha sie behalten will.** Wenn Punkt 4 umgesetzt wird,
erledigt sich die Frage. Wenn nicht, braucht es eine anwaltliche Einschätzung, ob
Art. 6 Abs. 1 lit. f hier trägt — meine ist: angreifbar, und ich habe es in der
Erklärung genau so geschrieben.

**4. Die Audioströme und Kapitel V DSGVO.** Ob eine Verbindung, die das Endgerät
des Besuchers auf dessen eigenen Klick hin zu einem Server in den USA, Russland
oder Nigeria aufbaut, eine „Übermittlung in ein Drittland" durch den
Seitenbetreiber ist, ist ungeklärt. Ich halte die Antwort für „eher nein — der
Betreiber übermittelt nichts, er zeigt eine Adresse", aber das ist eine Meinung,
keine Rechtslage. Ich habe die Frage in der Erklärung offen benannt, statt sie zu
beantworten.

**5. Urheber- und Leistungsschutzrecht bei der Einbindung der Ströme.** Das ist
der Punkt, der in Datenschutzdokumenten regelmäßig fehlt und der teurer werden
kann als alles andere hier. Die Seite bettet fremde Livestreams in einen eigenen
Abspieler ein. Nach der Rechtsprechung des EuGH zur öffentlichen Wiedergabe
(Svensson, GS Media, VG Bild-Kunst) ist die Verlinkung frei zugänglicher, mit
Zustimmung des Rechteinhabers veröffentlichter Inhalte grundsätzlich zulässig —
bei Einbettung in eine fremde Oberfläche und bei Umgehung technischer
Schutzmaßnahmen wird es aber anders bewertet. **Anwalt.** Und unabhängig davon:
Wenn ein Sender darum bittet, nicht mehr eingebunden zu werden, fliegt er raus,
ohne Diskussion.

**6. Die Senderlogos.** 95 ausgelieferte Logos liegen unter `assets/logos/`
(plus 6 Rohdateien, die `.dockerignore` draußen hält). Nach den Feldern
`logoQuelle` in `data/sender.json` stammen 49 aus dem `apple-touch-icon` und 18
aus dem `og:image` der jeweiligen Senderseite, 21 von SomaFM, 4 direkt, 3 aus
Favicons — sie wurden also von fremden Seiten übernommen und werden vom eigenen
Server ausgeliefert. Das berührt Urheberrecht und Markenrecht. Für eine
nichtkommerzielle, identifizierende Verwendung gibt es gute Argumente
(Markennennung zur Beschreibung, § 23 MarkenG), aber sie sind eben Argumente.
**Anwalt.** Ein Rückfall auf die eigene Wortmarke je Sender ist technisch
vorbereitet (`senderbild.mjs`, `MARKE`) — die Seite funktioniert also auch ohne
die Logos.

**7. GEMA und GVL.** Meine Einschätzung: nicht betroffen, weil hier nicht
gesendet, sondern verlinkt wird, und die Vergütungspflicht den Sender trifft.
Wenn diese Einschätzung falsch ist, ist sie teuer falsch. **Ein Satz vom
Anwalt genügt.**

**8. Der Umfang von Art. 6 Abs. 1 lit. b beim Konto.** Die Merkliste ist der
Vertragsinhalt — ohne sie gäbe es keinen Grund für ein Konto. Beim **Hörverlauf**
ist das weniger klar: Ist er notwendiger Teil der versprochenen Leistung, oder
ist er ein Zusatz, der eine eigene Einwilligung bräuchte? Der EDSA legt lit. b
eng aus. Der saubere Weg wäre, den Verlauf als eigenständig abschaltbare
Funktion zu bauen. **Vor dem Bau des Kontos klären** — hinterher ist es eine
Datenmigration.

**9. Sobald etwas Geld kostet.** Eine kostenpflichtige Kontostufe löst einen
ganzen Block aus, der hier bewusst nicht steht: AGB, Widerrufsbelehrung und
Muster-Widerrufsformular, Preisangaben, Erklärung nach § 36 VSBG,
Buttonbeschriftung nach § 312j BGB, steuerliche und gewerberechtliche
Einordnung. Das ist kein Nachtrag zu diesen Dokumenten, sondern eine eigene
Runde.

---

## Teil D — Was ich nicht nachprüfen konnte

Ich habe in dieser Sitzung keinen Netzzugriff benutzt. Die folgenden Angaben
stammen aus meinem Wissensstand und müssen vor der Veröffentlichung **einzeln
nachgeprüft** werden. Ich habe sie im Text jeweils so formuliert, dass die
Nachprüfung leichtfällt.

1. **Der EU-US-Angemessenheitsbeschluss vom 10.07.2023.** Gilt er zum Zeitpunkt
   des Livegangs noch? Er ist Gegenstand laufender Verfahren. Und getrennt davon:
   Sind Google LLC und Apple Inc. aktuell zertifiziert? Das steht in der
   öffentlichen Liste des US-Handelsministeriums und kann sich ändern.
2. **Die Abschaltung der OS-Plattform zum 20.07.2025.** Ich bin mir dieser
   Angabe recht sicher, aber „recht sicher" reicht bei einer Pflichtangabe
   nicht. Kurz nachsehen; falls die Plattform doch weiterbesteht **und** eine
   entgeltliche Leistung angeboten wird, gehört der Verweis ins Impressum.
3. **Der Wortlaut des Microsoft-DPA.** Ich stütze mich auf die Zusagen, die
   Microsoft in seiner Dokumentation zur Datenresidenz macht — insbesondere die
   Formulierung, dass Daten in anderen Geografien übertragen oder verarbeitet
   werden können. Die geltende Fassung des Vertrags ist maßgeblich, nicht meine
   Wiedergabe.
4. **Die Lizenzen der fünf Schriftfamilien** (Punkt 4).
5. **Die Aufbewahrungsdauer der ACS-Zustellprotokolle** (V10 im Verzeichnis).
6. **Ob der AV-Vertrag mit Microsoft tatsächlich zustande gekommen ist.** Das
   ist eine Tatsachenfrage über Michas Abonnement, keine Rechtsfrage.
7. **Die zuständige Aufsichtsbehörde** — hängt vom Wohnsitz ab (Punkt 7).

---

## Teil E — Befunde aus dem Programmtext, die hierher gehören

Aufgefallen beim Lesen, mit Auswirkung auf die Texte:

1. **`widerrufeEinwilligung()` ist tot.** Exportiert in
   `assets/lib/fehlerbericht.mjs`, nirgends aufgerufen. Siehe Punkt 5. Das ist
   der einzige Befund mit unmittelbarer rechtlicher Wirkung.

2. **`deploy/nginx.conf` behauptet mehr, als sich halten lässt.** Der Kommentar
   zum Kürzen der IP sagt: „Der Personenbezug fällt weg." Das ist zu stark. Eine
   gekürzte Adresse zusammen mit Zeitpunkt, Browserkennung und Verweisquelle kann
   in Einzelfällen weiterhin zuordenbar sein. Die Datenschutzerklärung sagt
   deshalb bewusst das Gegenteil: Wir behandeln die Protokolle als
   personenbezogen. Der Kommentar sollte nachgezogen werden — nicht, weil ein
   Kommentar rechtlich zählt, sondern weil zwei Aussagen im selben Projekt nicht
   auseinanderlaufen sollten. Vorschlag: „Der Personenbezug wird so weit
   verringert, wie es ohne Verlust der Betriebsauswertung geht."

3. **Die Senderzahl steht an vier Stellen und stimmt nicht überein.**
   `data/sender.json` enthält 129 Sender in 9 Regalen; `index.html` sagt
   „129 Sender aus 29 Ländern"; `assets/lib/wochentipp.mjs` rechnet im Kommentar
   mit 117; die Projektbeschreibung nennt „117 Sender in 8 Regalen". Für die
   Rechtstexte habe ich die Werte aus `data/sender.json` genommen und selbst
   nachgezählt: **129 Sender, 29 Länder, 9 Regale, alle Ströme über HTTPS.**
   Wenn die Zahl in der Datenschutzerklärung stehen bleibt, muss sie bei jeder
   Katalogänderung mitgepflegt werden. Alternative: „aktuell rund 130 Sender aus
   29 Ländern" schreiben und die genaue Zahl der Katalogseite überlassen.

4. **`apps.iyambae.fm` hat keine Fußzeile mit Rechtsverweisen.** Eigener
   Hostname, eigenes Telemedium, eigene Pflicht. Siehe Punkt 1.

5. **Keine Content-Security-Policy in `deploy/nginx.conf`.** Heute kein
   Rechtsverstoß, ab dem Konto ein Problem. Siehe Punkt 12.

6. **Was gut gebaut ist und deshalb im Text vorkommen darf.** Die
   IP-Kürzung vor dem Schreiben, der fehlende Abfrageteil im Protokoll, das
   Fehlerberichtformat ohne Adressfeld, das abgeschaltete Öffnungs-Tracking in
   den Mails, die abgeschalteten Speicherkonto-Schlüssel, die bewusst nicht
   gebaute Auswertung „welcher Sender wird gehört" — das sind keine
   Selbstverständlichkeiten. Sie stehen in der Datenschutzerklärung mit
   Quellenangabe, damit jemand sie nachlesen kann, statt sie glauben zu müssen.
   Das ist der beste Teil dieser Unterlagen, und er ist nicht mein Verdienst.
