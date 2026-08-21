# Verzeichnis von Verarbeitungstätigkeiten

nach Art. 30 Abs. 1 DSGVO — iyambae.fm und apps.iyambae.fm

> **Entwurf, Stand 21.08.2026.** Platzhalter in eckigen Klammern ausfüllen.
> Dieses Verzeichnis wird **nicht veröffentlicht**. Es ist ein internes
> Dokument, das auf Anforderung der Aufsichtsbehörde vorzulegen ist (Art. 30
> Abs. 4 DSGVO). Offene Punkte: [HINWEISE.md](HINWEISE.md).

---

## Verantwortlicher

| Feld | Inhalt |
|---|---|
| Name | [Vorname Nachname] |
| Anschrift | [Straße Hausnummer, PLZ Ort, Deutschland] |
| Kontakt | [adresse@iyambae.fm], [Telefon] |
| Vertreter nach Art. 27 DSGVO | entfällt — Niederlassung in der EU |
| Gemeinsam Verantwortliche (Art. 26) | keine |
| Datenschutzbeauftragter | keiner benannt; nicht erforderlich nach § 38 Abs. 1 BDSG (weniger als 20 ständig mit automatisierter Verarbeitung beschäftigte Personen, keine DSFA-Pflicht, keine geschäftsmäßige Übermittlung) |
| Zugriffsberechtigte Personen | zwei — [Name 1], [Name 2] |

---

## Warum die 250-Beschäftigten-Ausnahme hier nicht greift

Art. 30 Abs. 5 DSGVO nimmt Unternehmen und Einrichtungen mit weniger als 250
Beschäftigten von der Verzeichnispflicht aus. Hier arbeiten zwei Personen. Die
Ausnahme scheint also zu passen — sie tut es nicht.

Die Ausnahme steht nämlich unter drei Vorbehalten, und **jeder einzelne davon
lässt die Pflicht wieder aufleben**. Es genügt, dass einer greift:

**1. Die Verarbeitung erfolgt nicht nur gelegentlich.** Das ist hier eindeutig
und allein schon entscheidend. Zugriffsprotokolle entstehen bei **jedem**
Seitenaufruf, automatisiert, dauerhaft, im Regelbetrieb — nicht bei Gelegenheit.
Dasselbe gilt für das Laden der Schriftarten und für die Speicherung auf dem
Endgerät. Der Europäische Datenschutzausschuss und die deutschen
Aufsichtsbehörden legen „gelegentlich" eng aus: gemeint ist eine Verarbeitung,
die weder regelmäßig noch dauerhaft stattfindet, sondern anlassbezogen und
ausnahmsweise. Ein laufender Webdienst erfüllt das nie.

**2. Die Verarbeitung birgt ein Risiko für die Rechte und Freiheiten
betroffener Personen.** Ein Risiko genügt — nicht erst ein hohes. Beim geplanten
Konto liegen mit Zugangsdaten, Hörverlauf und E-Mail-Adresse Daten vor, deren
unbefugte Offenlegung spürbare Folgen hätte.

**3. Besondere Kategorien nach Art. 9 oder Daten nach Art. 10.** Trifft hier
nicht zu — es werden keine Gesundheits-, Religions-, Gewerkschafts- oder
Strafdaten verarbeitet. *Hinweis für später:* Ein Hörverlauf, aus dem sich eine
religiöse oder politische Ausrichtung ablesen ließe (ausschließlich religiöse
Sender, ausschließlich Sender einer politischen Bewegung), könnte in Randfällen
in Art. 9 hineinreichen. Der jetzige Katalog ist ein Musikkatalog; die Frage
stellt sich mit ihm nicht.

**Ergebnis:** Nummer 1 greift zweifelsfrei, Nummer 2 zusätzlich. Das Verzeichnis
ist zu führen. Es ist ohnehin die billigste Datenschutzmaßnahme überhaupt — es
zwingt dazu, einmal aufzuschreiben, was man eigentlich tut.

---

## Übersicht

| Nr. | Tätigkeit | Status | Rechtsgrundlage |
|---|---|---|---|
| V1 | Auslieferung der Website, Zugriffsprotokollierung | aktiv | Art. 6 I f |
| V2 | Auswertung der Zugriffsprotokolle | aktiv | Art. 6 I f |
| V3 | Fehlerberichte | aktiv | Art. 6 I a; § 25 I TDDG |
| V4 | Einbindung von Schriftarten (Google Fonts) | **entfallen am 21.08.2026** | — |
| V5 | Vermittlung von Audioströmen Dritter | aktiv | Art. 6 I f |
| V6 | Speicherung auf dem Endgerät | aktiv | § 25 II Nr. 2 TDDG; Art. 6 I f |
| V7 | Abfrage der örtlichen MyRetuner-Schnittstelle | aktiv | Art. 6 I a; § 25 I TDDG |
| V8 | Kontaktaufnahme und Betroffenenanfragen | aktiv | Art. 6 I c, f |
| V9 | Benutzerkonten | **geplant** | Art. 6 I b |
| V10 | Versand von Transaktionsmails | **geplant** | Art. 6 I b |

---

## V1 — Auslieferung der Website und Zugriffsprotokollierung

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Betrieb des Webservers, Protokollierung der Zugriffe |
| **Zweck** | Auslieferung der Seiten; Erkennen von Störungen und Fehlern; Erkennen von Missbrauch; Nachvollziehen der Erreichbarkeit |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse am störungsfreien Betrieb eines angebotenen Dienstes |
| **Kategorien betroffener Personen** | Besucher von iyambae.fm, www.iyambae.fm und apps.iyambae.fm — einschließlich der Rechtsseiten unter `/recht/` und der Schriftdateien unter `/assets/schrift/`, die seit dem 21.08.2026 aus demselben Container kommen (vormals V4) |
| **Kategorien personenbezogener Daten** | gekürzte IP-Adresse (IPv4: letztes Oktett auf 0; IPv6: nur die ersten beiden Blöcke); Zeitstempel; HTTP-Verfahren; angefragter Pfad **ohne Abfrageteil**; Statuscode; übertragene Bytes; Referrer; User-Agent; Antwortdauer. Zusätzlich flüchtig im Arbeitsspeicher: die Proxy-Adresse für die Anfragedrosselung (nicht protokolliert) |
| **Nicht erhoben** | vollständige IP-Adresse; gehörter Sender; Suchbegriffe (stehen im Abfrageteil); Cookie-Inhalte; Name |
| **Empfänger** | Microsoft Ireland Operations Limited (Auftragsverarbeiterin, Art. 28 DSGVO) — Azure Container Apps, Azure Monitor / Log Analytics |
| **Drittlandübermittlung** | Speicherung: nein, Region Germany West Central. Nicht auszuschließen: Zugriffe im Rahmen von Support/Fernwartung durch Microsoft-Personal außerhalb der EU — abgedeckt durch Microsofts Auftragsverarbeitungsvertrag nebst EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO) |
| **Löschfrist** | 30 Tage; `retentionInDays: 30` und `immediatePurgeDataOn30Days: true` in `infra/main.bicep`. Automatisch, ohne Archivstufe |
| **TOM** | Kürzung der IP-Adresse **vor** dem Schreiben (`map $http_x_forwarded_for $besucher` in `deploy/nginx.conf`); ausschließlich HTTPS; Container läuft ohne root-Rechte (nginx-unprivileged, Port 8080); Rollenrechte in Azure statt geteilter Zugangsschlüssel; Anfragedrosselung; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin` |
| **Fundstellen** | `deploy/nginx.conf`, `infra/main.bicep` |

---

## V2 — Auswertung der Zugriffsprotokolle

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Betriebsauswertung („IYAMBAE — Zahlen", Azure-Arbeitsmappe) |
| **Zweck** | Feststellen, ob und wie die Seite genutzt wird und wo sie klemmt: Seitenaufrufe je Tag, geschätzte Besucherzahl, Verweisquellen, Browser- und Geräteart, Abrufe des Web-App-Manifests, gemeldete Fehler, langsamste Auslieferungen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. f DSGVO. Ausschließlich eigene Auswertung eigener Protokolle — keine Reichweitenmessung durch Dritte, kein Einsatz eines Analysedienstes, kein seitenübergreifendes Tracking |
| **Kategorien betroffener Personen** | wie V1 |
| **Kategorien personenbezogener Daten** | ausschließlich die unter V1 genannten Felder; keine zusätzliche Erhebung |
| **Empfänger** | Microsoft (wie V1); Leserechte („Monitoring Reader") für [Name 1], [Name 2] |
| **Drittlandübermittlung** | wie V1 |
| **Löschfrist** | keine eigene — die Auswertung greift live auf V1 zu und hält keine Kopie. Mit dem Ablauf der 30 Tage verschwindet die Grundlage |
| **TOM** | Rollenbasierter Zugriff auf Abonnementebene; ausdrücklich nur *lesende* Rolle; keine Abfrage zum gehörten Sender — technisch nicht möglich und im Quelltext als bewusste Entscheidung dokumentiert; „Besucher" ist eine Schätzung über gekürzte Adressen, kein Zählwert |
| **Fundstellen** | `infra/dashboard.bicep` |

---

## V3 — Fehlerberichte

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Freiwillige Übermittlung von Programmfehlern |
| **Zweck** | Programmfehler beheben, die nur auf bestimmten Geräten oder in bestimmten Browsern auftreten |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. a DSGVO (Einwilligung im Dialog, der erst im Fehlerfall erscheint); § 25 Abs. 1 TDDG für das Speichern der Entscheidung auf dem Endgerät |
| **Kategorien betroffener Personen** | Besucher, bei denen ein Programmfehler auftrat **und** die zugestimmt haben |
| **Kategorien personenbezogener Daten** | Fehlertext (max. 300 Zeichen); Aufrufliste (max. 6 Zeilen / 900 Zeichen); Quelldatei, Zeile, Spalte; Pfad **ohne Abfrageteil**; Katalogfassung; Zeitpunkt; Ursprung (`Origin`-Kopfzeile); Inhaltslänge |
| **Nicht erhoben** | IP-Adresse — auch keine gekürzte: Das Protokollformat `fehlerbericht` enthält kein Adressfeld; Suchbegriffe; Merkliste; Hörverhalten; Eingabefeldinhalte |
| **Mengenbegrenzung** | höchstens 5 Berichte je Sitzung; jeder Fehler nur einmal (Entprellung); serverseitig 1 Anfrage/Sekunde je Adresse, Rumpf max. 8 KB |
| **Empfänger** | keine Dritten. Ziel ist der eigene Server; von dort über die Containerausgabe nach Log Analytics im eigenen Mandanten. Microsoft als Auftragsverarbeiterin wie V1 |
| **Drittlandübermittlung** | wie V1 |
| **Löschfrist** | 30 Tage (derselbe Arbeitsbereich wie V1) |
| **TOM** | Einwilligung vor der ersten Übermittlung; Bereinigung des Berichts im Browser **vor** dem Senden; Abschneiden des Abfrageteils; Längenbegrenzung; Drosselung; JSON-Maskierung im Protokollformat (`escape=json`), damit Berichtsinhalte nicht aus der Protokollstruktur ausbrechen können |
| **Widerruf** | Knopf „Fehlerberichte nicht mehr senden" in der Fußzeile jeder Seite; er erscheint nur bei erteilter Einwilligung. Angeschlossen am 21.08.2026 — zuvor war `widerrufeEinwilligung()` zwar vorhanden, aber an keiner Oberfläche aufgerufen |
| **Fundstellen** | `assets/lib/fehlerbericht.mjs`, `assets/app.js` (`widerrufFehler`), `index.html` (Fußzeile), `deploy/nginx.conf` |

---

## V4 — Einbindung von Schriftarten (Google Fonts) — **entfallen am 21.08.2026**

Diese Tätigkeit gibt es nicht mehr. Der Eintrag bleibt als gestrichener Posten
stehen, weil ein Verzeichnis, aus dem Tätigkeiten spurlos verschwinden, seinen
Zweck verfehlt: Es soll auch belegen können, was einmal galt (Art. 5 Abs. 2
DSGVO).

**Was sie war:** Die fünf Schriftfamilien der Seite wurden von
`fonts.googleapis.com` und `fonts.gstatic.com` nachgeladen. Dabei ging die
vollständige, ungekürzte IP-Adresse jedes Besuchers beim Seitenaufbau an Google
in die USA — ohne Zutun und ohne Einwilligung. Rechtsgrundlage war Art. 6 Abs. 1
lit. f DSGVO, und diese Stütze war angreifbar: Das LG München I hat mit Urteil
vom 20.01.2022 (Az. 3 O 17493/20) für die dynamische Einbindung eine Einwilligung
verlangt und Schadensersatz zugesprochen.

**Was an ihre Stelle getreten ist:** Die Schriftdateien liegen als `woff2` unter
`assets/schrift/` im eigenen Container und werden über `assets/schrift/schriften.css`
eingebunden (erzeugt von `Scripts/hole-schriften.py`). Ihre Auslieferung ist damit
Teil von **V1** und keine eigene Tätigkeit mehr — sie unterscheidet sich in nichts
von der Auslieferung eines Bildes.

**Wirkung auf dieses Verzeichnis:** Der einzige regelmäßige, für jeden Besucher
unvermeidbare Drittlandtransfer ist damit ersatzlos weggefallen. Es besteht kein
Empfängerverhältnis zu Google mehr. Nachgemessen im Browser auf `/de/`, `/ar/`
und `/ja/`: keine Anfrage an einen fremden Host.

**Übrig geblieben ist eine Pflicht, die keine des Datenschutzrechts ist:** Die
Schriftdateien werden jetzt selbst verbreitet. Die zugehörigen Lizenztexte
gehören mit ins Repository und ins Abbild — siehe HINWEISE.md, Punkt 4.

## V5 — Vermittlung von Audioströmen Dritter

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Direktverbindung des Endgeräts zu Senderservern |
| **Zweck** | Abspielen des vom Besucher ausgewählten Radiosenders |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an der Erbringung der Kernfunktion; die Verbindung entsteht ausschließlich auf aktive Auswahl des Besuchers |
| **Kategorien betroffener Personen** | Besucher, die einen Sender starten |
| **Kategorien personenbezogener Daten** | **vollständige IP-Adresse**; User-Agent; Zeitpunkt und Dauer der Verbindung; Herkunft (`https://iyambae.fm`) — jeweils erhoben durch den **Sender**, nicht durch uns |
| **Beim Verantwortlichen entstehende Daten** | **keine.** Der Strom berührt den eigenen Server nicht; es existiert kein Protokoll, keine Tabelle und keine Auswertung darüber, wer welchen Sender hört |
| **Empfänger** | die Betreiber der jeweils angewählten Sender. 129 Sender aus 29 Ländern (Stand Katalogfassung 2.1.0 vom 21.08.2026) |
| **Drittlandübermittlung** | **Ja, und überwiegend.** 41 Sender in den USA, 12 in Japan, 11 im Vereinigten Königreich, 6 in Russland; weitere in Kanada, Mexiko, Peru, Kolumbien, Venezuela, Bolivien, der Ukraine, der Türkei, Aserbaidschan, Südkorea, Marokko, Ghana, Nigeria, Senegal, der Schweiz. Nur 16 Sender stehen in Deutschland. **Garantien nach Art. 46 DSGVO können nicht vorgelegt werden** — es besteht kein Vertragsverhältnis zu den Sendern. Ob Kapitel V DSGVO auf eine vom Endgerät des Betroffenen selbst und auf dessen Auswahl hin aufgebaute Verbindung anzuwenden ist, ist rechtlich ungeklärt (siehe HINWEISE.md, Teil D Nr. 4) |
| **Löschfrist** | entfällt — beim Verantwortlichen entstehen keine Daten |
| **TOM** | Transparenz vor dem Klick: Das Herkunftsland steht auf jedem Senderkärtchen; alle Ströme laufen über HTTPS (129 von 129 geprüft); `Referrer-Policy` begrenzt die Übermittlung auf die Herkunft; der Service Worker fängt Audioanfragen ausdrücklich nicht ab und speichert sie nicht zwischen; bewusster Verzicht auf einen eigenen Weiterleitungsserver, der die Hörhistorie beim Verantwortlichen entstehen ließe |
| **Fundstellen** | `data/sender.json`, `assets/app.js` (`AudioEngine`), `sw.js` |

---

## V6 — Speicherung auf dem Endgerät

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Örtlicher Speicher, Sprachcookie, Service Worker |
| **Zweck** | Merkliste, zuletzt gehörte Sender, Hörzähler, Fehlschlagzähler, Lautstärke, Umstimmung, Sprachwahl, Einwilligungsstände; Offline-Betrieb der Web-App |
| **Rechtsgrundlage** | § 25 Abs. 2 Nr. 2 TDDG — unbedingt erforderlich für den vom Nutzer ausdrücklich gewünschten Dienst; soweit personenbezogen zusätzlich Art. 6 Abs. 1 lit. f DSGVO |
| **Kategorien betroffener Personen** | alle Besucher |
| **Kategorien personenbezogener Daten** | `hz_favoriten`, `hz_zuletzt`, `hz_gehoert`, `hz_fehlschlaege`, `hz_lautstaerke`, `hz_pitch432`, `hz_myretuner`, `hz_mr_zustand`, `hz_fehlerbericht`, `hz_sprache` (örtlicher Speicher); Cookie `hz_sprache` (Sprachkürzel, Laufzeit 1 Jahr, `SameSite=Lax`, `path=/`); Zwischenspeicher des Service Workers (eigene Programmdateien, Sprachdateien, Symbole, Senderlogos, Senderliste, eigene Schriftdateien) |
| **Empfänger** | **keine.** Nichts davon wird an den Server übertragen. Ausnahme: Das Sprachcookie wird mit jeder Anfrage mitgesendet, weil der Server die Sprachweiche stellen muss — protokolliert wird es nicht (V1 hat kein Cookie-Feld) |
| **Drittlandübermittlung** | nein |
| **Löschfrist** | Cookie: 1 Jahr. Örtlicher Speicher und Zwischenspeicher: unbefristet, jederzeit vom Nutzer über die Browsereinstellungen löschbar. Alter Zwischenspeicher wird bei jeder neuen Fassung des Service Workers automatisch entfernt (`SW_VERSION`) |
| **TOM** | Kein Wiedererkennungsmerkmal im Cookie (nur ein Sprachkürzel); `SameSite=Lax`; Audioströme werden nicht zwischengespeichert; die Wurzeladresse `/` steht bewusst nicht im Zwischenspeicher, damit keine Sprachentscheidung einfriert |
| **Fundstellen** | `assets/app.js` (`SCHLUESSEL`), `assets/lib/sprache.mjs`, `sw.js` |

---

## V7 — Abfrage der örtlichen MyRetuner-Schnittstelle

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Erkennung einer auf dem Endgerät laufenden Anwendung |
| **Zweck** | Feststellen, ob MyRetuner läuft, um die eigene, ungenauere Umstimmung im Browser abzuschalten und die gemessene Stimmung anzuzeigen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. a DSGVO (Klick auf „Ich habe MyRetuner"); § 25 Abs. 1 TDDG für den Zugriff auf Informationen im Endgerät |
| **Kategorien betroffener Personen** | Besucher, die MyRetuner installiert haben **und** die Abfrage freigeschaltet haben |
| **Kategorien personenbezogener Daten** | Laufzustand der Anwendung; eingestellte Zielstimmung; gemessene Ausgangsstimmung; Vertrauenswert der Messung. Auf dem Endgerät gespeichert: `hz_mr_zustand` (einer von drei Werten) |
| **Empfänger** | **keine.** Die Anfrage geht an `http://127.0.0.1:47432/status`, also an das Gerät des Besuchers selbst, und verlässt es nicht. Es wird nichts an den Server übertragen |
| **Drittlandübermittlung** | nein |
| **Löschfrist** | keine Speicherung beim Verantwortlichen. Auf dem Endgerät bis zum Löschen der Websitedaten |
| **TOM** | Keine automatische Abfrage vor Freischaltung; doppelte Zustimmung (Browserberechtigung und Nachfrage der Anwendung selbst); Zeitlimit 500 ms, damit die Seite nicht hängt; jede Fehlerantwort wird gleich behandelt („nicht installiert"), damit kein Ausspähkanal entsteht |
| **Fundstellen** | `assets/lib/myretuner.mjs`, `assets/app.js` (`starteMyRetunerErkennung`) |

---

## V8 — Kontaktaufnahme und Betroffenenanfragen

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | E-Mail-Verkehr mit Besuchern, Bearbeitung von Anfragen nach Art. 15 bis 21 DSGVO |
| **Zweck** | Anfragen beantworten; gesetzliche Pflichten aus Kapitel III DSGVO erfüllen; Hinweise auf Probleme im Katalog entgegennehmen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung zur Beantwortung von Betroffenenanfragen); Art. 6 Abs. 1 lit. f DSGVO für sonstige Korrespondenz |
| **Kategorien betroffener Personen** | Personen, die schreiben |
| **Kategorien personenbezogener Daten** | E-Mail-Adresse; Name, soweit angegeben; Inhalt der Nachricht; ggf. Angaben zur Identitätsprüfung bei Auskunftsverlangen |
| **Empfänger** | [E-Mail-Anbieter des Betreibers — **einzutragen**, siehe HINWEISE.md, Punkt 8]; Auftragsverarbeitungsvertrag mit diesem Anbieter erforderlich |
| **Drittlandübermittlung** | [abhängig vom Anbieter — einzutragen] |
| **Löschfrist** | Bearbeitete Anfragen werden nach [X Monaten] gelöscht. Für den Nachweis der Erfüllung von Betroffenenrechten ist eine Aufbewahrung von bis zu drei Jahren (Regelverjährung) vertretbar — **festzulegen und hier einzutragen** |
| **TOM** | Zugriff nur durch die beiden Verwalter; Identitätsprüfung bei Auskunfts- und Löschverlangen im Zweifel über die im Konto hinterlegte Adresse |

---

## V9 — Benutzerkonten *(geplant, noch nicht in Betrieb)*

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Konto, Anmeldung, Abgleich von Merkliste und Hörverlauf |
| **Zweck** | Führung des Kontos; Authentifizierung; geräteübergreifender Abgleich von Merkliste und Hörverlauf; Abwehr von Missbrauch bei der Anmeldung |
| **Rechtsgrundlage** | **Art. 6 Abs. 1 lit. b DSGVO** — Erfüllung des Nutzungsvertrags. Ausdrücklich **nicht** Einwilligung. Für Anmeldedrosselung und Missbrauchsabwehr Art. 6 Abs. 1 lit. f DSGVO |
| **Kategorien betroffener Personen** | registrierte Nutzer |
| **Kategorien personenbezogener Daten** | Kontokennung; E-Mail-Adresse (Klartext in der Kontotabelle, als SHA-256-Abdruck in der Zuordnungstabelle); Passwort **ausschließlich als Hash**; Anbieterkennung (`sub`) bei Google-/Apple-Anmeldung; öffentlicher Passkey-Schlüssel nebst Zähler und Flags; Merkliste; Hörverlauf (Zähler je Sender, zuletzt Gehörtes); Anlagedatum und Datum des letzten Besuchs (**nur Datum, keine Uhrzeit**); Sitzungen und Einmalcodes **nur als SHA-256-Abdruck** mit Ablaufdatum |
| **Empfänger** | Microsoft Ireland Operations Limited (Azure Table Storage, Auftragsverarbeiterin); bei sozialer Anmeldung: Google Ireland Limited / Google LLC bzw. Apple Inc. / Apple Distribution International; lesender Zugriff der beiden Verwalter |
| **Drittlandübermittlung** | Speicherung: nein — Germany West Central, `Standard_LRS` (drei Kopien in **einem** Rechenzentrum, bewusst keine geografische Spiegelung). Bei Google-/Apple-Anmeldung: USA, gestützt auf den Angemessenheitsbeschluss vom 10.07.2023, soweit der Anbieter zertifiziert ist — **vor Livegang zu prüfen** |
| **Löschfristen** | Sitzungen und Einmalcodes: mit Ablauf des Ablaufdatums, durchgesetzt beim nächsten Zugriff und zusätzlich durch einen Räumdurchgang alle 24 Stunden. Konto: bis zur Löschung durch den Nutzer (`DELETE /api/konto`, entfernt Merkliste, Verlauf, Sitzungen, Kennungen und den Eintrag in der Zuordnungstabelle in einem Vorgang). Inaktive Konten: **Frist noch festzulegen**. Grabsteine gelöschter Einträge: Parameter `grabsteinTage`, Vorgabe 90 Tage — **Wirkung noch zu klären**, siehe HINWEISE.md Punkte 10 und 11 |
| **TOM** | Kontozugangsschlüssel des Speicherkontos abgeschaltet (`allowSharedKeyAccess: false`) — Zugriff ausschließlich über verwaltete Identität, es existiert keine Verbindungszeichenfolge, die abfließen könnte; TLS mindestens 1.2, ausschließlich HTTPS; kein öffentlicher Blobzugriff, keine mandantenübergreifende Replikation; Rollentrennung: die Anwendung schreibt, die Verwalter lesen nur; alle Daten eines Kontos in einer Partition, damit die Löschung nach Art. 17 DSGVO vollständig und in einem Vorgang gelingt; Sitzungsgeheimnisse nur als Abdruck gespeichert; Anmeldedrosselung 5 Versuche je Minute und Adresse; `no-store` für alle `/api/`-Antworten; Service Worker speichert `/api/`-Antworten nicht zwischen |
| **Vor Inbetriebnahme offen** | Content-Security-Policy fehlt (im Quelltext vermerkt); ACS-Rollenkennung nicht belegt; Löschfristen (siehe oben) |
| **Fundstellen** | `infra/konto.bicep.entwurf` |

---

## V10 — Versand von Transaktionsmails *(geplant, noch nicht in Betrieb)*

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Bestätigungs- und Anmeldemails über Azure Communication Services |
| **Zweck** | Bestätigung der E-Mail-Adresse; Zustellung von Einmalcodes zur Anmeldung; Mitteilungen, die den Vertrag betreffen (z. B. Bestätigung einer Kontolöschung) |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO |
| **Kategorien betroffener Personen** | registrierte Nutzer und Personen, die eine Registrierung beginnen |
| **Kategorien personenbezogener Daten** | E-Mail-Adresse; Zeitpunkt; Zustellstatus; Inhalt der Nachricht (Einmalcode bzw. Bestätigungslink) |
| **Empfänger** | Microsoft Ireland Operations Limited (Azure Communication Services, Auftragsverarbeiterin); der E-Mail-Anbieter des Empfängers |
| **Drittlandübermittlung** | Datenhaltung auf die Geografie „Germany" eingestellt (`dataLocation: 'Germany'`). **Einschränkung, die dokumentiert gehört:** Microsoft sagt für ruhende Daten den Verbleib in der Geografie zu, behält sich aber Übertragung und Verarbeitung in anderen Geografien vor. Die Zusage betrifft die Ruhelage, nicht jeden Verarbeitungsschritt |
| **Löschfrist** | Zustellprotokolle nach Vorgabe des Dienstes; im eigenen Bestand entsteht keine Kopie der Nachricht. **[Aufbewahrungsdauer der ACS-Zustellprotokolle vor Livegang nachschlagen und hier eintragen.]** |
| **TOM** | Öffnungs- und Klickverfolgung abgeschaltet (`userEngagementTracking: 'Disabled'`) — keine Zählpixel, keine umgeschriebenen Verweise; eigene Absenderdomäne `mail.iyambae.fm` mit SPF und DKIM, getrennt vom Apex, damit ein harter SPF-Eintrag nicht die übrige Post der Domain sperrt; Zugriff über verwaltete Identität statt Verbindungszeichenfolge (**abhängig davon, dass die ACS-Rollenkennung nachgetragen wird** — sonst Rückfall auf ein Geheimnis, dessen Rotation dann zu regeln ist) |
| **Fundstellen** | `infra/konto.bicep.entwurf` |

---

## Auftragsverarbeiter (Art. 28 DSGVO)

| Auftragsverarbeiter | Leistung | Ort | Vertrag |
|---|---|---|---|
| Microsoft Ireland Operations Limited | Azure Container Apps, Log Analytics | Germany West Central | Microsoft Products and Services Data Protection Addendum (DPA) nebst EU-Standardvertragsklauseln — **Bezug und Fassung dokumentieren** |
| Microsoft Ireland Operations Limited | Azure Table Storage *(geplant)* | Germany West Central | wie oben |
| Microsoft Ireland Operations Limited | Azure Communication Services *(geplant)* | Datenhaltung „Germany", Ressource global | wie oben |
| [E-Mail-Anbieter des Betreibers] | Postfach für Kontakt und Betroffenenanfragen | [einzutragen] | **[AV-Vertrag erforderlich]** |
| Cloudflare, Inc. | **nur autoritatives DNS**, kein Proxy („graue Wolke") | — | Kein Auftragsverarbeitungsverhältnis für Besucherdaten: Ohne Proxy fließt kein Besucherverkehr über Cloudflare. Cloudflare beantwortet Namensauflösungen gegenüber den Auflösern der Zugangsanbieter, sieht dabei nicht die IP-Adresse des Besuchers. **Wird der Proxy je eingeschaltet, ändert sich das grundlegend** — dann läuft der gesamte Verkehr über einen US-Anbieter und braucht einen eigenen Eintrag hier und einen Absatz in der Datenschutzerklärung |

**Kein Auftragsverarbeitungsverhältnis** besteht zu den Senderbetreibern (V5):
Der Browser des Besuchers baut die Verbindung selbst auf, ein Vertrag existiert
nicht. Zu Google bestand bis zum 21.08.2026 dasselbe Verhältnis für die
Schriftarten — seit dem Umzug der Schriften auf den eigenen Server besteht es
nicht mehr (V4).

---

## Allgemeine technische und organisatorische Maßnahmen (Art. 32 DSGVO)

**Vertraulichkeit**

- Ausschließlich HTTPS; unverschlüsselte Verbindungen sind abgewiesen (`allowInsecure: false`).
- Der Container läuft ohne root-Rechte (nginx-unprivileged, Port 8080).
- Kein geteilter Zugangsschlüssel in der Datenhaltung (geplant); Zugriff nur über verwaltete Identität und Azure-Rollen.
- Rollentrennung: Anwendung schreibt, Menschen lesen. Zugriff auf die Betriebsauswertung nur mit der Rolle „Monitoring Reader".
- Zwei Personen mit Zugriff — nicht mehr. Jede weitere Person ist eine Entscheidung, kein Nebeneffekt.
- Beim Aufbau der Seite wird **kein fremder Host** kontaktiert: Schriften, Symbole, Logos und Programmdateien kommen aus demselben Container. Damit gibt es keinen Kanal, über den eine Besucheradresse ungewollt abfließen könnte.

**Datenminimierung**

- IP-Adressen werden vor dem Schreiben gekürzt.
- Der Abfrageteil der Adresse wird weder protokolliert noch in Fehlerberichten übertragen.
- Der gehörte Sender wird nicht erhoben (ohne Konto technisch nicht erhebbar).
- Zeitangaben im Konto auf Tagesgenauigkeit reduziert („zuletztGesehen").
- Sitzungsgeheimnisse und Einmalcodes nur als Abdruck.

**Integrität und Verfügbarkeit**

- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Anfragedrosselung für Fehlerberichte (1/s) und Anmeldung (5/min, geplant).
- Rumpfgrößen begrenzt (8 KB für Fehlerberichte, 32 KB für `/api/`).
- Wiederholbare Infrastruktur als Quelltext (Bicep); Änderungen sind nachvollziehbar und wiederherstellbar.
- Bereitschafts- und Lebendigkeitsprüfungen am Auslieferungscontainer.

**Erkennbare Lücken — sie gehören in ein ehrliches Verzeichnis**

- **Keine Content-Security-Policy.** Vor der Einführung von Konten zwingend nachzuholen; im Quelltext bereits vermerkt. Seit dem Wegfall der fremden Schriftquellen ist sie deutlich einfacher zu schreiben — sie kann jetzt ohne Ausnahmen für `fonts.googleapis.com` und `fonts.gstatic.com` auskommen.
- **Kein dokumentiertes Vorgehen für Datenschutzverletzungen** (Art. 33, 34 DSGVO): 72 Stunden sind kurz, wenn man erst dann anfängt zu überlegen.
- **Kein Löschkonzept für inaktive Konten** (geplant, Frist offen).
- **Keine dokumentierte Prüfung der Wirksamkeit** nach Art. 32 Abs. 1 lit. d DSGVO. Für einen Betrieb dieser Größe genügt eine jährliche Durchsicht dieses Verzeichnisses, sie muss aber stattfinden und datiert werden.

---

## Datenschutz-Folgenabschätzung (Art. 35 DSGVO)

**Nicht erforderlich.** Es findet keine systematische umfangreiche Überwachung
öffentlich zugänglicher Bereiche statt, keine umfangreiche Verarbeitung
besonderer Datenkategorien und keine systematische, umfassende Bewertung
persönlicher Aspekte mit rechtlicher Wirkung. Der Hörverlauf im Konto ist ein
Verhaltensdatum, wird aber weder zu Bewertungen noch zu Entscheidungen über die
betroffene Person verwendet.

**Neu zu prüfen**, wenn: Empfehlungen aus dem Hörverhalten anderer Nutzer
berechnet werden, Hörverhalten ausgewertet oder an Dritte übermittelt wird, oder
eine Werbe- oder Reichweitenmessung hinzukommt.

---

## Änderungen an diesem Verzeichnis

| Datum | Änderung |
|---|---|
| 21.08.2026 | Erstfassung |
| 21.08.2026 | **V4 (Google Fonts) entfallen** — Schriften auf den eigenen Server umgezogen, Drittlandtransfer weggefallen. V1 und V6 entsprechend nachgezogen |
| 21.08.2026 | V3: Widerruf der Einwilligung an die Oberfläche angeschlossen |

**Stand: 21.08.2026 · Nächste Durchsicht: [Datum eintragen, spätestens in einem
Jahr] · Geführt von: [Name]**
