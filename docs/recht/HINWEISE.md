# Was vor dem Livegang zu tun ist

Diese Datei ist die Übergabe. Sie sagt, was noch fehlt, warum es fehlt, und an
welchen Stellen ich mich auf eine Einschätzung beschränke, statt eine Antwort zu
behaupten.

Die drei Entwürfe daneben — `impressum.md`, `datenschutz.md`,
`verarbeitungsverzeichnis.md` — sind vollständig lesbar, aber sie enthalten
Platzhalter in eckigen Klammern. Solange auch nur einer davon offen ist, darf
nichts davon online.

> **Stand 21.08.2026 — drei Punkte sind erledigt, während diese Liste entstand:**
> Die Schriften kommen aus dem eigenen Haus (Punkt 4), der Widerruf für
> Fehlerberichte hängt an einem Knopf in der Fußzeile (Punkt 5), und die
> Rechtstexte werden unter `/recht/` ausgeliefert, statt nur im Repository zu
> liegen (Punkt 1). Die drei Punkte stehen weiterhin hier — mit dem, was von
> ihnen übrig ist. Ein als erledigt markierter Punkt sagt mehr als ein
> gelöschter. Alle drei Dokumente sind entsprechend nachgezogen.

---

## Teil A — Muss erledigt sein, bevor die Seite live geht

### 1. Die Rechtstexte als Seiten ausliefern — **erledigt am 21.08.2026**

**Warum es nötig war:** § 5 Abs. 1 DDG verlangt „leicht erkennbar, unmittelbar
erreichbar und ständig verfügbar". Eine Datei in `docs/` erfüllte keinen der drei
Punkte — `docs` stand in `.dockerignore` und landete nicht einmal im Bau-Kontext.

**Was gebaut wurde:** `Scripts/baue-recht.py` erzeugt aus den Markdown-Dateien die
Seiten `/recht/impressum/`, `/recht/datenschutz/` und
`/recht/verarbeitungsverzeichnis/`. Sie tragen `noindex, follow`, sind aus der
Fußzeile aller sieben Sprachseiten verlinkt, und der Verweis trägt `hreflang="de"`.
`.dockerignore` lässt `docs/` jetzt in den Bau-Kontext; das Dockerfile entfernt den
Ordner erst aus dem ausgelieferten Wurzelverzeichnis. `HINWEISE.md` wird bewusst
nicht ausgeliefert — diese Datei ist eine Arbeitsliste, kein Rechtstext.

**Was noch offen ist:**

- **`apps.iyambae.fm` hat weiterhin keine Rechtsverweise.** Eigener Hostname,
  eigener Dokumentenstamm (`/srv/apps`), eigenes Telemedium, eigene Pflicht. Zwei
  Verweise in der Fußzeile von `apps/index.html` genügen — sie dürfen auf
  `https://iyambae.fm/recht/…` zeigen, die Seiten müssen nicht doppelt existieren.
- **Übersetzungen** — siehe Punkt 14.
- **Soll das Verarbeitungsverzeichnis wirklich öffentlich stehen?** Siehe Punkt 13.
- **Kleinigkeit:** Sollen die Rechtsseiten offline verfügbar sein, gehören sie in
  `SHELL_FILES` in `sw.js`, und dann muss `SW_VERSION` hoch. Heute sind sie es
  nicht. Für ein Impressum ist das keine Pflicht — „ständig verfügbar" meint den
  Dienst, nicht das Endgerät ohne Netz.

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
- **`verarbeitungsverzeichnis.md`:** Verantwortlicher; die beiden zugriffsberechtigten Personen; E-Mail-Anbieter samt Drittlandangabe und Löschfrist (V8); Aufbewahrungsdauer der ACS-Zustellprotokolle (V10); Datum der nächsten Durchsicht.

**Und ein Fund aus der gerenderten Fassung, der leicht durchrutscht:** Ganz oben
in jeder der drei Dateien steht ein eingerückter Kasten „Entwurf, Stand
21.08.2026 — Platzhalter ausfüllen, HINWEISE.md lesen". Dieser Kasten **wird
mitveröffentlicht**. Auf der fertigen Seite steht dann, dass sie ein Entwurf sei,
und der Verweis darauf zeigt ins Leere: `HINWEISE.md` wird nicht ausgeliefert, der
Link landet auf `/recht/datenschutz/HINWEISE.md` und damit auf einer Umleitung zur
Startseite.

Zwei Wege: die Kästen vor dem Livegang aus den drei Markdown-Dateien entfernen —
dann ist diese Datei hier die einzige Stelle, an der noch „Entwurf" steht — oder
`Scripts/baue-recht.py` beibringen, einen Block, der mit `> **Entwurf` beginnt, zu
überspringen. Das zweite ist stabiler, weil es beim nächsten Entwurf wieder
greift.

Dasselbe gilt für die eckigen Klammern **innerhalb** der Texte, etwa im
Kontoabschnitt der Datenschutzerklärung („[Frist für inaktive Konten: noch
festzulegen]"). Sie stehen dort mit Absicht, solange die Konten nicht existieren —
aber sie dürfen nicht in einer Fassung stehen, die als geltender Text
ausgeliefert wird. Entweder der Abschnitt geht raus, bis es die Konten gibt, oder
die Klammern werden gefüllt.

### 4. Google Fonts selbst ausliefern — **erledigt am 21.08.2026**

**Warum es nötig war:** Der einzige Punkt in dieser Liste, zu dem es eine deutsche
Gerichtsentscheidung gibt — LG München I, Urteil vom 20.01.2022, Az. 3 O 17493/20:
100 € Schadensersatz und Unterlassung für die dynamische Einbindung ohne
Einwilligung. Und der einzige Drittlandtransfer, der jeden Besucher traf, bevor er
etwas anklicken konnte.

**Was gebaut wurde:** `Scripts/hole-schriften.py` holt Inter, Orbitron, JetBrains
Mono, IBM Plex Sans Arabic und Noto Kufi Arabic als `woff2` nach `assets/schrift/`
— 31 Dateien — und erzeugt `assets/schrift/schriften.css` mit den
`unicode-range`-Angaben. `index.html` trägt nur noch einen Verweis auf diese eine
örtliche Datei; die beiden `preconnect` sind weg. In `sw.js` ist der Zweig für
fremde Herkünfte entfallen, `SW_VERSION` steht auf `v18`, und `/assets/schrift/`
läuft über dieselbe Regel wie die Logos: erst Zwischenspeicher, dann Netz.

Nachgemessen im Browser auf `/de/`, `/ar/` und `/ja/`: **null fremde Anfragen.** Ein
deutscher Browser lädt 12 Schriftdateien, ein arabischer 22 — die `unicode-range`
sorgt dafür, dass `/de/` keine arabische Datei anfasst. Das ist obendrein sauberer
als der alte Behelf, bei dem der Erzeuger die Arabisch-Zeile aus sechs von sieben
Seiten schneiden musste.

**Was dadurch neu offen ist:**

> **Die Lizenztexte der Schriften fehlen.** Das ist kein Datenschutzthema, sondern
> die Bedingung, unter der die Dateien überhaupt weitergegeben werden dürfen — und
> weitergegeben werden sie jetzt: Sie liegen im Repository und im Container-Abbild
> und gehen an jeden Besucher.
>
> Die SIL Open Font License verlangt, dass Urhebervermerk und Lizenztext die
> Schriftdateien begleiten. In `assets/schrift/` liegen heute 31 `woff2` und eine
> CSS-Datei, sonst nichts; weder `hole-schriften.py` noch `schriften.css` erwähnen
> eine Lizenz.
>
> **Zu tun:** Je Familie den Lizenztext samt Urhebervermerk mitholen und als
> `assets/schrift/LIZENZ-<familie>.txt` ablegen; `hole-schriften.py` so erweitern,
> dass das automatisch geschieht — sonst fehlt es beim nächsten Nachladen wieder.
> Ein Kopfkommentar in `schriften.css` mit Familie, Urheber und Lizenz je Block ist
> die halbe Miete. Und dabei **je Familie einmal nachlesen**, welche Lizenz
> tatsächlich gilt: Ich habe das nicht geprüft, ich kenne nur die übliche Angabe
> (SIL OFL bzw. Apache-Lizenz).

**Miterledigt:** Abschnitt 4 der Datenschutzerklärung beschreibt jetzt eigene
Schriften statt Google, im Verarbeitungsverzeichnis ist V4 als entfallen vermerkt,
und die Content-Security-Policy (Punkt 12) wird einfacher — sie braucht keine
Ausnahmen für `fonts.googleapis.com` und `fonts.gstatic.com` mehr.

### 5. Den Widerruf für Fehlerberichte anschließen — **erledigt am 21.08.2026**

**Warum es nötig war:** Art. 7 Abs. 3 Satz 4 DSGVO — der Widerruf muss so einfach
sein wie die Erteilung. Erteilt wurde sie mit einem Klick im Dialog; widerrufen
ließ sie sich gar nicht, außer durch Löschen sämtlicher Websitedaten. Das ist nicht
„so einfach wie". `widerrufeEinwilligung()` war in `assets/lib/fehlerbericht.mjs`
vorhanden, im ganzen Ordner `assets/` aber nirgends aufgerufen.

**Was gebaut wurde:** In der Fußzeile steht der Knopf „Fehlerberichte nicht mehr
senden" (`index.html`, `#widerrufFehler`; angeschlossen in `assets/app.js`). Er
bleibt verborgen, solange `einwilligungsstand()` nicht `erlaubt` liefert — ein
Angebot, etwas zurückzunehmen, das niemand gegeben hat, wäre selbst wieder ein
Ärgernis.

**Nachgezogen in den Texten:** `datenschutz.md` Abschnitt 3 nennt den Knopf statt
eines Platzhalters, Abschnitt 11 verweist darauf, und im Verarbeitungsverzeichnis
ist aus dem „offenen Punkt" bei V3 eine Zeile „Widerruf" geworden.

### 6. Dasselbe für die MyRetuner-Abfrage

**Warum:** Auch das ist eine Einwilligung (Klick auf „Ich habe MyRetuner"), und
auch sie lässt sich nur durch Löschen der Websitedaten zurücknehmen. Der Zustand
steht in `hz_mr_zustand`; ein Schalter, der ihn auf `abgelehnt` setzt, ist eine
Zeile.

**Geringere Dringlichkeit als Punkt 5**, weil bei dieser Abfrage nichts an einen
Server geht — sie bleibt auf dem Gerät. Aber seit Punkt 5 steht das Muster
daneben: derselbe Platz in der Fußzeile, dieselbe Sichtbarkeitsregel (nur zeigen,
wenn der Zustand `erlaubt` ist), derselbe Aufbau in `assets/app.js`. Zwanzig
Minuten, und die Datenschutzerklärung verliert ihre letzte eckige Klammer in
Abschnitt 7.

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
  **Anwaltsfrage, siehe Teil D.**
- **ACS-Rollenkennung nachschlagen.** Steht im Entwurf; bleibt sie leer, läuft
  der Mailversand über eine Verbindungszeichenfolge — dann ist deren Rotation zu
  regeln, und das gehört als organisatorische Maßnahme ins Verzeichnis.
- **`/api/` nie zwischenspeichern.** Der Service Worker legt heute jede
  erfolgreiche Antwort eigener Herkunft ab. Eine Antwort mit fremder Merkliste im
  Zwischenspeicher eines Familiengeräts ist eine meldepflichtige Datenpanne, kein
  Schönheitsfehler. Der Entwurf beschreibt die Zeile, die das verhindert.

---

## Teil C — Zwei Entscheidungen, die am 21.08.2026 dazugekommen sind

Beide entstanden erst dadurch, dass die Texte jetzt wirklich ausgeliefert werden.
Solange sie im Repository lagen, stellten sie sich nicht.

### 13. Entscheiden, ob das Verarbeitungsverzeichnis öffentlich stehen soll

`Scripts/baue-recht.py` erzeugt drei Seiten, darunter
`/recht/verarbeitungsverzeichnis/`, und verlinkt sie in der Fußzeile der
Rechtsseiten. **Verboten ist das nicht** — Art. 30 Abs. 4 DSGVO verlangt nur die
Vorlage gegenüber der Aufsichtsbehörde, er verbietet die Veröffentlichung nicht.
Und Offenheit steht dieser Seite gut; das ganze Projekt lebt davon, dass man
nachlesen kann, was es tut.

**Drei Dinge sprechen trotzdem dagegen, und sie sind konkret:**

1. Das Verzeichnis nennt die beiden zugriffsberechtigten Personen **namentlich**.
   Für die Behörde ist das die richtige Angabe; für das offene Netz ist es eine
   Einladung an jeden, der ein Ziel für einen Anruf beim Support sucht.
2. Es enthält den Abschnitt **„Erkennbare Lücken"** — eine öffentlich lesbare
   Liste der eigenen Schwachstellen: keine Content-Security-Policy, kein
   dokumentiertes Vorgehen bei Datenpannen, kein Löschkonzept für inaktive
   Konten. Genau diese Liste legt man einem Angreifer nicht hin.
3. Es beschreibt Sicherheitsmaßnahmen im Einzelnen: Drosselungsgrenzen,
   Rollenmodell, Aufbau der Sitzungsgeheimnisse.

**Drei Wege:**

- **(a) Nicht veröffentlichen.** `verarbeitungsverzeichnis` aus `SEITEN` in
  `Scripts/baue-recht.py` entfernen und den Verweis aus der Fußzeile der
  Rechtsseiten nehmen. Impressum und Datenschutz bleiben.
- **(b) Veröffentlichen, aber entschärft.** Die drei genannten Stellen heraus und
  nach `HINWEISE.md` verschieben. Kostet Pflegeaufwand: Ab dann gibt es zwei
  Fassungen desselben Dokuments, und die für die Behörde ist die vollständige.
- **(c) So lassen.**

**Meine Empfehlung: (a).** Die Datenschutzerklärung sagt den Besuchern bereits
alles, was sie brauchen, und sie sagt es verständlicher. Das Verzeichnis ist ein
Dokument für die Aufsichtsbehörde — es ist nicht dafür geschrieben, gelesen zu
werden, sondern dafür, vollständig zu sein. Wer Offenheit zeigen will, hat sie im
Datenschutztext schon gezeigt.

**Falls (c):** Dann gehört der Verweis auch in die Fußzeile der sieben
Sprachseiten. Heute steht er nur im Fuß der Rechtsseiten selbst — das Dokument ist
also öffentlich, aber nur findet, wer schon auf einer Rechtsseite steht. Das ist
die unentschiedenste aller Varianten.

### 14. Die Rechtstexte übersetzen — mindestens ins Englische

**Warum:** Art. 12 Abs. 1 DSGVO verlangt „präzise, transparente, verständliche und
leicht zugängliche Form, in einer klaren und einfachen Sprache". Ein Text, den der
Leser nicht lesen kann, erfüllt davon keinen einzigen Punkt. Diese Seite spricht
sieben Sprachen und richtet sich damit ausdrücklich auch an Menschen, die kein
Deutsch können. Die Aufsichtsbehörden erwarten die Pflichtinformationen in der
Sprache, in der das Angebot auftritt.

**Wie schlimm ist es heute?** Der Verweis trägt `hreflang="de"`, die Sprache ist
also ausgewiesen, und niemand wird über den Inhalt getäuscht. Für den jetzigen
Stand — keine Konten, kein Eingabefeld, kein Vertrag, kaum eine Verarbeitung, die
über das Ausliefern der Seite hinausgeht — halte ich das für vertretbar. Für
richtig halte ich es nicht.

**Zwingend spätestens:** bevor die Konten kommen. Ab dann schließt jemand einen
Vertrag, dessen Bedingungen er nicht lesen kann, und gibt dabei eine E-Mail-Adresse
heraus.

**Empfehlung:** Englisch vor dem Livegang, die übrigen fünf vor den Konten.
Reihenfolge nach den tatsächlichen Besucherzahlen aus der Betriebsauswertung, nicht
nach Bauchgefühl — die Zahlen liegen vor, und genau dafür ist die Auswertung da.

**Zwei Warnungen zur Umsetzung:**

- **Rechtstexte übersetzt man nicht wie Oberflächentexte.** Fachbegriffe wie
  „Verantwortlicher", „Auftragsverarbeiter", „berechtigtes Interesse" haben in
  jeder Amtssprache der EU eine feste Entsprechung — die liefert die DSGVO in der
  jeweiligen Sprachfassung, nicht ein Übersetzungswerkzeug. Wer hier frei
  übersetzt, erzeugt einen Text, der etwas anderes verspricht als der deutsche.
- **Sieben Fassungen sind sieben Dokumente, die bei jeder Änderung mitmüssen.**
  Das ist der eigentliche Preis, nicht die Übersetzung selbst. `baue-recht.py`
  sieht `/recht/<kuerzel>/…` bereits vor; was fehlt, ist die Disziplin, den
  deutschen Text nie allein zu ändern.

---

## Teil D — Wo ein Anwalt nötig ist

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

**3. ~~Google Fonts~~ — gegenstandslos seit dem 21.08.2026.** Die Frage lautete,
ob Art. 6 Abs. 1 lit. f die dynamische Einbindung trägt. Sie stellt sich nicht
mehr: Die Schriften kommen vom eigenen Server (Punkt 4). Der Posten bleibt hier
stehen, damit niemand ihn beim nächsten Durchgang neu erfindet. **Was an seine
Stelle tritt, ist keine Anwaltsfrage, sondern eine Hausaufgabe:** die Lizenztexte
der Schriften mit ausliefern.

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

## Teil E — Was ich nicht nachprüfen konnte

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
4. **Die Lizenzen der fünf Schriftfamilien.** Das war vor dem 21.08.2026 eine
   Frage für den Fall, dass umgezogen wird. Seit dem Umzug ist es eine offene
   Pflicht: Die Dateien werden bereits verbreitet, die Lizenztexte fehlen. Siehe
   Punkt 4.
5. **Die Aufbewahrungsdauer der ACS-Zustellprotokolle** (V10 im Verzeichnis).
6. **Ob der AV-Vertrag mit Microsoft tatsächlich zustande gekommen ist.** Das
   ist eine Tatsachenfrage über Michas Abonnement, keine Rechtsfrage.
7. **Die zuständige Aufsichtsbehörde** — hängt vom Wohnsitz ab (Punkt 7).

---

## Teil F — Befunde aus dem Programmtext, die hierher gehören

Aufgefallen beim Lesen, mit Auswirkung auf die Texte:

1. **~~`widerrufeEinwilligung()` ist tot.~~ Behoben am 21.08.2026.** Die Funktion
   war exportiert und nirgends aufgerufen; jetzt hängt der Knopf „Fehlerberichte
   nicht mehr senden" in der Fußzeile daran. Das war der einzige Befund mit
   unmittelbarer rechtlicher Wirkung. Siehe Punkt 5.

2. **`deploy/nginx.conf` behauptet mehr, als sich halten lässt.** Der Kommentar
   zum Kürzen der IP sagt: „Der Personenbezug fällt weg." Das ist zu stark. Eine
   gekürzte Adresse zusammen mit Zeitpunkt, Browserkennung und Verweisquelle kann
   in Einzelfällen weiterhin zuordenbar sein. Die Datenschutzerklärung sagt
   deshalb bewusst das Gegenteil: Wir behandeln die Protokolle als
   personenbezogen. Der Kommentar sollte nachgezogen werden — nicht, weil ein
   Kommentar rechtlich zählt, sondern weil zwei Aussagen im selben Projekt nicht
   auseinanderlaufen sollten.

   **Vorschlag zum Einsetzen** — ersetzt in `deploy/nginx.conf` den Absatz, der
   heute mit „Deshalb wird das letzte Oktett" beginnt und mit „Der Personenbezug
   fällt weg." endet:

   ```
   # Deshalb wird das letzte Oktett auf Null gesetzt, bevor überhaupt etwas
   # geschrieben wird. Für die Statistik — wie viele Besuche, welches Land,
   # welcher Browser — ändert das nichts.
   #
   # Was es NICHT tut: die Zeile anonym machen. Eine gekürzte Adresse zusammen
   # mit Zeitpunkt, Browserkennung und Verweisquelle kann im Einzelfall immer
   # noch auf eine Person zurückführen. Der Personenbezug wird so weit
   # verringert, wie es ohne Verlust der Betriebsauswertung geht — mehr
   # verspricht diese Zeile nicht, und die Datenschutzerklärung verspricht es
   # auch nicht: Sie behandelt die Protokolle weiterhin als personenbezogene
   # Daten und stützt sie auf Art. 6 Abs. 1 lit. f DSGVO.
   ```

   Der alte Text nannte als Beispiel „welcher Sender" — das war schon damals
   falsch, denn der Sender steht in keinem Protokoll. Deshalb steht im Vorschlag
   „welcher Browser".

3. **~~Die Senderzahl stimmt an vier Stellen nicht überein.~~ Berichtigt am
   21.08.2026.** `wochentipp.mjs` und die Projektbeschreibung standen auf 117
   Sendern in 8 Regalen, `data/sender.json` und `index.html` auf 129 in 9. Die
   nachgezählten Werte stimmten: **129 Sender, 29 Länder, 9 Regale, alle 129
   Ströme über HTTPS.** Sie stehen jetzt überall gleich.

   **Was bleibt:** Die Zahl steht damit auch in der Datenschutzerklärung
   (Abschnitt 5) und im Verarbeitungsverzeichnis (V5) und muss bei jeder
   Katalogänderung mit. Wer das nicht will, schreibt dort „aktuell rund 130
   Sender aus 29 Ländern" und überlässt die genaue Zahl der Katalogseite. Die
   Länderverteilung im Text (41 USA, 16 DE, 12 JP …) hat dasselbe Problem —
   sie ist aber die Angabe, die den Drittlandtransfer greifbar macht, und
   deshalb würde ich sie behalten und lieber pflegen.

4. **`apps.iyambae.fm` hat keine Fußzeile mit Rechtsverweisen.** Eigener
   Hostname, eigenes Telemedium, eigene Pflicht. Siehe Punkt 1.

5. **Keine Content-Security-Policy in `deploy/nginx.conf`.** Heute kein
   Rechtsverstoß, ab dem Konto ein Problem. Siehe Punkt 12. Seit dem Umzug der
   Schriften ist sie einfacher geworden: Es gibt keinen fremden Host mehr, den
   die Regel durchlassen müsste — `default-src 'self'` ist jetzt ein
   realistischer Ausgangspunkt statt einer Wunschvorstellung.

6. **Was gut gebaut ist und deshalb im Text vorkommen darf.** Die IP-Kürzung vor
   dem Schreiben, der fehlende Abfrageteil im Protokoll, das Fehlerberichtformat
   ohne Adressfeld, das abgeschaltete Öffnungs-Tracking in den Mails, die
   abgeschalteten Speicherkonto-Schlüssel, die bewusst nicht gebaute Auswertung
   „welcher Sender wird gehört" — und seit dem 21.08.2026 eine Seite, die beim
   Aufbau **keinen einzigen fremden Host** kontaktiert. Das sind keine
   Selbstverständlichkeiten. Sie stehen in der Datenschutzerklärung mit
   Quellenangabe, damit jemand sie nachlesen kann, statt sie glauben zu müssen.
   Das ist der beste Teil dieser Unterlagen, und er ist nicht mein Verdienst.
