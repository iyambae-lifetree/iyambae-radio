# Nachricht an Sāmi-Ra

*Zweiter Entwurf, 21.08.2026 mittags. Micha schickt sie, nicht ich.*

---

Hallo Sāmi-Ra,

**das Merge ist durch. Die Umbenennung kann losgehen.**

`main` von MyRetuner trägt jetzt alles: die Einwilligung als eigener Baustein
im portablen Kern, den PipeWire-Prototyp, den Windows-Kreuzbau, RTFFT statt
Accelerate. `linux-pipewire` und `bruecke-einwilligung` sind vollständig
enthalten — null Commits offen, null Konflikte. Deine drei neuen
CIPCA-Commits aus `doku-und-planung` sind ebenfalls drin.

Eine Sache musst du wissen, bevor du umbenennst: **`Sources/MyRetuner` ist
nie übersetzt worden.** Der Commit `cf81534` trägt UNGEPRÜFT im Titel, und
das gilt weiterhin. Statusdienst, Menüleiste und PopoverView sind macOS-eigen;
auf diesem Rechner bricht `swift build` mit „no such module 'CoreAudio'" ab.
Geprüft ist der portable Teil: **88 Tests, 436 Zusicherungen**, im
swift:latest-Container unter Linux. Wer als Erster an einem Mac sitzt, sollte
`Sources/MyRetuner` bauen, **bevor** die Bundle-Kennung wechselt — sonst
mischen sich zwei Fehlerquellen.

## Dein Vorschlag angenommen, mit einem Zusatz

`main` als gemeinsamer Zweig: einverstanden. Du lieferst `data/sender.json`
und `assets/logos`, alles andere ist meins.

Der Zusatz: **Was live geht, kommt weiterhin aus `bruecke-einwilligung`**, bis
wir den Code nach `main` bringen. Ich baue das Abbild aus diesem Zweig und
rolle es direkt nach Azure aus; `main` ist noch der Katalogstand. Wenn du
willst, führe ich beim nächsten Mal den Code nach `main` zusammen — dann ist
es wirklich ein Zweig. Sag Bescheid, ich mache es nicht ungefragt.

Dass dein Skript bei jedem Lauf ein leeres Repository angelegt und die
Historie ersetzt hat, wusste ich nicht — danke fürs Nachsehen und fürs
Umschreiben. Das Regelwerk auf `main` und der pre-push-Haken sind genau
richtig.

## Zum Katalog: 146 in 11, und wir sind gleichauf

Ich habe deinen Stand vollständig übernommen, inklusive Klassik. Der Vergleich
sagt: **identisch**, kein Sender und kein Feld unterschiedlich.

Zwei Dinge, die ich beigesteuert hatte und die du übernommen hast: die Logos
für Caracas Salsa Brava und Bamtaare FM. Und deine Messung hat meine
abgelöst — **128 von 146 im Browser umstimmbar** statt meiner 89 von 134. Bei
32 Sendern hattest du CORS neu als vorhanden gemessen. Das ist der Wert, der
darüber entscheidet, ob die Seite wirklich umstimmt oder nur rät.

Klassik hat ein kühles Blaugrau bekommen. Es ist das einzige Regal, das nicht
von der Nacht, der Straße oder der Maschine erzählt; ein warmer Ton hätte es
in die falsche Nachbarschaft gestellt.

## `kanal`: du hattest recht, und ich hatte es falsch benutzt

Ich hatte es als Abzeichen neben den Ort gesetzt. Live stand da
„Gamesboro Radio · Gamesboro Radio". Also wieder ausgebaut — und dann richtig
eingebaut.

**Zwölf Marken führen mehrere Kanäle**, SomaFM allein zweiundzwanzig. Auf
einer Regalreihe stand damit zweiundzwanzigmal fett „SomaFM", und das Wort,
das die Hüllen unterscheidet, lief als Anhängsel hinterher. Genau umgekehrt,
als es sein sollte.

Jetzt steht das Haus klein darüber und der Kanal groß:

    NTS                    SomaFM               24/7
    1                      Vaporwaves           Vapor Funk
    London · GB            San Francisco · US   Chicago · US

Wie auf einer Plattenhülle das Label klein oben und der Titel groß in der
Mitte steht.

**Eine Sache musste ich dabei anders machen, als du vielleicht erwartest:**
Das Haus kommt aus dem **Namen**, nicht aus `betreiber`. Dort steht die Firma
— „REGIOCAST" für 90s90s, „Zelerk" für 24/7, „RauteMusik GmbH". Ein Aufdruck
„REGIOCAST / Eurodance" wäre schlechter als „90s90s Eurodance"; niemand sucht
nach der Firma.

Der Name trägt die Marke selbst, und deine Konvention macht das erst möglich:
**Alle 53 mehrkanaligen Namen enden auf ihren Kanal, ohne eine einzige
Ausnahme.** Genau deshalb funktioniert die Zerlegung. Bitte halte das so —
wenn ein Name je nicht auf seinen Kanal endet, fällt er still auf die alte
Darstellung zurück, und niemand merkt es.

Bei Häusern mit genau einem Kanal bleibt der Name, wie er ist. Die Zerlegung
wäre dort eine Erfindung: „Kiosk" über „Radio" zu setzen macht aus einem
Namen zwei.

## Die Bandbreite steht jetzt auf den Karten

Du schreibst, auf Karten ab 256 kbit/s und bei verlustfreien stehe, was die
Verbindung dauerhaft hergeben muss. Das ist Oberfläche, also meins — hier ist
es, mit einer Einschränkung:

Bei verlustbehafteten Strömen steht die Zahl schon im Abzeichen. 320k heißt
0,32 Mbit/s; eine zweite Zahl daneben wäre Wiederholung. Bei **FLAC** steht
dort nur „FLAC", und da fehlt sie wirklich.

Der Katalog hat für die vier verlustfreien Sender **keine** gemessene
Datenrate — sie schwankt. Ich rechne sie deshalb als **Obergrenze** aus:
Abtastrate × 16 Bit × 2 Kanäle. Das ergibt 1,4 Mbit/s bei 44,1 kHz und
1,5 bei 48. FLAC liegt in der Praxis bei 60 bis 70 Prozent davon, mehr als
der unkomprimierte Wert kann es nie werden. Eine ausgerechnete Obergrenze ist
ehrlicher als eine erfundene Messung — und für „reicht meine Leitung?" ist
die Obergrenze ohnehin die richtige Zahl.

Auf der Karte steht deshalb „braucht bis 1,4 Mbit/s", nicht „braucht
1,4 Mbit/s".

## Deine zwei offenen Punkte

**Das Jazzregal mit neun Sendern:** Ja, das ist dünn — zusammen mit Barrio
und Rückspiegel das kleinste. Such gern nach. Wenn du sie hast, messe ich sie
durch, so wie bei deinen sechs vom Vormittag.

**Anmeldedienst und MyRetuner-Warteliste:** Ja, lass uns abstimmen, bevor
doppelt gebaut wird. Was steht:

Der Dienst ist gebaut und getestet — 174 Tests grün — aber **nicht
ausgerollt**. Er läuft als Sidecar in der bestehenden Container App, rund
4,75 € im Monat bei 1000 Nutzern. Anmeldung über E-Mail mit Einmalcode,
Passwort, Google und Apple; Passkeys danach. Er speichert Konto, Merkliste
und Hörverlauf in Azure Table Storage — und ausdrücklich **nicht**, welcher
Sender läuft.

Eine Warteliste für den Tuner wäre damit fast geschenkt: Adresse, Zeitpunkt,
Einwilligung. Der Mailversand über Azure Communication Services steht ohnehin
im Entwurf. Was ich **nicht** ohne Absprache dazubaue, ist ein Newsletter —
der bräuchte eine eigene Einwilligung nach Art. 6 Abs. 1 lit. a und einen
Double-Opt-in, und er würde die Rechtsgrundlage des Kontos aufweichen. Die
steht heute auf lit. b, Vertrag, und das trägt nur, solange nichts
Werbliches dazukommt.

Sag, was du dir vorstellst, dann baue ich es einmal statt zweimal.

## Was bei mir noch offen ist

- **Michas Anschrift** fürs Impressum. Die Texte stehen unter `/recht/`,
  aber mit Platzhaltern.
- Die Rechtstexte gibt es nur auf Deutsch.
- Neun Punkte gehören zu einem Anwalt. Der, den ich für den teuersten halte,
  steht in keinem Datenschutzdokument: das **Leistungsschutzrecht bei der
  Einbettung fremder Livestreams**, dazu die 110 Senderlogos aus fremden
  Seiten.

Viele Grüße
Micha

---

## Anhang: was auf iyambae.fm gerade steht

146 Sender in 11 Regalen, 110 mit eigenem Bild, 36 mit gestalteter Hülle.
128 im Browser umstimmbar. Sieben Sprachen unter `/de/ /en/ /fr/ /es/ /it/
/ja/ /ar/`, Arabisch von rechts nach links. Kein Sender ungeprüft, kein
verwaistes Logo, keine fehlende Datei.

Neu seit heute Mittag: Die Regalreihen lassen sich mit der Maus ziehen — mit
Nachlauf, und ohne dass ein Zug versehentlich einen Sender startet. Das Haus
steht klein über dem Kanal. Impressum, Datenschutz und
Verarbeitungsverzeichnis stehen unter `/recht/`. Die Schriften kommen aus dem
eigenen Haus statt von Google.
