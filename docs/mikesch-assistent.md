# Kater Mikesch auf iyambae.fm

Stand 23.10.2026. Zweig `claude/mikesch-assistent-9bee82`.

Unten rechts (auf der arabischen Seite links) schiebt Mikesch den Kopf ins
Bild, blinzelt, zuckt mit dem Ohr und bietet Hilfe an. Ein Klick öffnet ein
kleines Gespräch; darunter kann man sich für den Rundbrief anmelden.

**Nichts davon ist live.** Ohne `ANTHROPIC_API_KEY` auf dem Server sagt
Mikesch freundlich „ich halte gerade ein Nickerchen“, und die Seite
funktioniert wie bisher. Was zum Einschalten fehlt, steht unten unter
„Was entschieden werden muss“.

## Was gebaut ist

| Teil | Wo | Was es tut |
|---|---|---|
| Kopf, Blase, Fenster | `assets/lib/mikesch.mjs`, `assets/mikesch.css` | baut alles selbst, Texte aus `assets/lang/*.json` (Schlüssel `mikesch.*`) |
| Bilder | `assets/bild/mikesch/` | drei deckungsgleiche Ebenen (Kopf, Ohr, Lider), zusammen 28 KB, Herkunft in `assets/bild/HERKUNFT.md` |
| Gespräch | `dienst/src/mikesch.mjs`, `POST /api/mikesch` | schickt das Gespräch an Claude und gibt nur Text zurück |
| Wesen | `dienst/src/mikesch-wesen.md` | der Systemtext: wer Mikesch ist, was er weiß, was er nicht tut |
| Rundbrief | `dienst/src/rundbrief.mjs`, `POST /api/rundbrief/{anmelden,bestaetigen,abmelden}` | doppelte Bestätigung, eigene Tabelle `rundbrief` |
| Bestätigungsmail | `dienst/src/mail.mjs` (`RUNDBRIEF`) | in allen sieben Sprachen |
| Tests | `dienst/test/mikesch.test.mjs`, `dienst/test/rundbrief.test.mjs` | 17 neue, alle 321 grün; kein Test ruft die echte API |

### Entscheidungen, die ich selbst getroffen habe

- **Claude Haiku 5.5** (`claude-haiku-5-5`), ohne Nachdenken, Mühe „niedrig“,
  höchstens 700 Token Antwort. Für kurze Antworten auf Fragen, deren Antwort
  im Systemtext steht, ist mehr nur teurer und langsamer. Umstellbar ohne
  Code über `MIKESCH_MODELL`.
- **Der ganze Katalog steht im Systemtext** (190 Sender, rund 20.000 Token),
  fest und sortiert, damit Anthropics Zwischenspeicher greift. Dann kostet
  jeder weitere Zug den Katalog nur zu einem Zehntel. Mikesch kann so jeden
  Sender empfehlen; die Seite macht aus `[[sender:kennung]]` einen Knopf zum
  Auflegen. Erfundene Kennungen fallen still weg.
- **Kein Schlüssel im Browser.** Der Browser spricht nur mit `/api/mikesch`
  auf derselben Herkunft. Verträglich mit der geplanten CSP aus PR #6 (in
  der Vorschau mit genau dieser CSP geprüft, keine Verstöße).
- **Nichts wird gespeichert.** Kein Gespräch in einer Tabelle oder im
  Protokoll; im Protokoll stehen nur Tokenzahlen. Das Gespräch lebt im
  Arbeitsspeicher der Seite und ist nach dem Neuladen weg.
- **Drei Bremsen:** je Netz 30 Züge in 10 Minuten, insgesamt 120 je Minute,
  und eine **Tagesgrenze von 1.000 Zügen** (`MIKESCH_JE_TAG`). Danach
  „schläft“ Mikesch bis Mitternacht (UTC).
- **Schließen wird gemerkt** (`localStorage`). Danach schauen nur noch zwei
  Ohrenspitzen aus der Ecke; ein Klick holt ihn zurück. Die Begrüßungsblase
  kommt nur beim ersten Besuch und geht nach 15 Sekunden von selbst.
- **Bewegung nur, wenn erwünscht.** Bei `prefers-reduced-motion` erscheint er
  ohne Einschieben, ohne Blinzeln, ohne Ohrzucken.
- **Platz:** Er sitzt immer über der Spielerleiste und auf dem Handy über
  der Navigationsleiste (gemessen, nicht geschätzt). Auf dem Handy wird das
  Fenster ein Blatt von unten, und der Kopf duckt sich so lange weg.
- **Rundbrief ohne IP-Adresse.** Als Nachweis der Einwilligung gespeichert
  werden Zeitpunkt der Anfrage, Zeitpunkt des Klicks, Sprache und die
  Fassung des Einwilligungstextes. Unbestätigte Adressen sind nach sieben
  Tagen weg, Abmelden löscht die Zeile ganz. Ob eine Adresse auf der Liste
  steht, verrät die Seite nie (immer dieselbe Antwort).
- **Links aus der Mail tragen die Marke im Fragment** (`#schnurrpost=…`),
  damit sie in keinem Serverprotokoll stehen — dieselbe Regel wie beim
  Passwort-Link.

## Der Name des Rundbriefs

Gewünscht war „Mikeschs Katzenjammer“. Ich habe **„Mikeschs Schnurrpost“**
eingebaut, weil „Katzenjammer“ im Deutschen der Kater nach dem Rausch und
die Reue danach ist — witzig, aber ein Rundbrief, auf den man sich freuen
soll, sollte nicht nach Kopfweh klingen. Umbenennen ist eine Zeile je
Sprache in `assets/lang/*.json` und `dienst/src/mail.mjs`.

| Vorschlag | Für | Gegen |
|---|---|---|
| **Mikeschs Schnurrpost** (eingebaut) | freundlich, sofort verständlich, Post = Rundbrief | etwas brav |
| Mikeschs Katzenjammer | Wortwitz, Wiedererkennung | heißt eigentlich Kater/Reue |
| Pfotenpost | kurz, niedlich | sagt nichts über Musik |
| Der Kratzbaum | Plattenkratzen + Katze | erklärungsbedürftig |
| Mikeschs Plattenkiste | sagt, was drin ist | wenig Katze |
| Tatzen & Takte | Musik und Katze | klingt nach Kinderprogramm |

In den anderen Sprachen: *Mikesch's Purr Post*, *la Ronron-Poste de
Mikesch*, *el Ronroneo de Mikesch*, *le Fusa di Mikesch*,
*ミケシュのゴロゴロ便り*, *خرخرة ميكش*.

## Was entschieden werden muss

### 1. Die Kosten der Claude-API

Preise Haiku 5.5: 0,10 $ je Million Eingabe-Token, 0,50 $ je Million
Ausgabe-Token; aus dem Zwischenspeicher gelesen ein Zehntel, ihn zu
schreiben das 1,25-Fache.

| Fall | je Zug | 100 Züge am Tag | Tagesgrenze 1.000 voll |
|---|---|---|---|
| Zwischenspeicher greift (Normalfall bei laufenden Gesprächen) | ≈ 0,0003 $ | ≈ 0,03 $ | ≈ 0,30 $ |
| Zwischenspeicher kalt (erster Zug nach 5 Minuten Ruhe) | ≈ 0,0026 $ | ≈ 0,26 $ | ≈ 2,60 $ |

Ehrlich dazugesagt: Bei wenig Betrieb ist fast jeder Zug „kalt“, weil der
Zwischenspeicher nach fünf Minuten verfällt. Realistisch für den Anfang:
**unter 10 $ im Monat.** Schlimmster Fall mit voller Tagesgrenze jeden Tag:
**etwa 80 $ im Monat.** Die Grenze lässt sich ohne Code über
`MIKESCH_JE_TAG` senken oder heben.

Zu entscheiden: ein API-Konto bei Anthropic (Rechnung an die LLC?), ein
Ausgabenlimit in der Anthropic-Konsole (empfohlen: 20 $ im Monat als
harte Obergrenze) und ob 1.000 Züge am Tag passen.

### 2. Der Versanddienst für den Rundbrief

Gebaut ist die **Liste mit doppelter Bestätigung**. Die Bestätigungsmail
geht über denselben Weg wie die Anmeldecodes (Azure Communication Services).
**Nicht gebaut ist der Versand der eigentlichen Rundbriefe** — das hängt an
der Wahl des Dienstes:

| Weg | Für | Gegen |
|---|---|---|
| Azure Communication Services (schon da) | kein neuer Vertrag, Daten bleiben bei uns | Grenze rund 100 Mails je Stunde, keine Vorlagen, keine Statistik; Versand müsste ich bauen |
| Ein EU-Rundbriefdienst (z. B. Brevo oder CleverReach) | Vorlagen, Abmeldelinks, Zustellbarkeit fertig | neuer Auftragsverarbeitungsvertrag, Liste liegt dann auch dort |

Meine Empfehlung für den Anfang: bei ACS bleiben, solange die Liste unter
ein paar hundert Lesern ist. Die Abmeldelinks dafür sind schon vorbereitet
(`abmeldeVerweis` in `dienst/src/rundbrief.mjs`).

### 3. Rechtliche Texte

Bevor Mikesch live geht, muss die **Datenschutzerklärung** zwei neue
Abschnitte bekommen. Entwurf zum Prüfen, nicht zum Übernehmen ohne
Prüfung:

> **Kater Mikesch (Gesprächsassistent).** Wenn du Mikesch eine Frage
> schickst, übermitteln wir den Text des Gesprächs und die Sprache der
> Seite an Anthropic PBC, USA, damit das Sprachmodell Claude eine Antwort
> schreibt. Wir speichern das Gespräch nicht; es liegt nur in deinem
> Browser und ist nach dem Neuladen der Seite weg. Anthropic verarbeitet
> die Daten als Auftragsverarbeiter; die Übermittlung in die USA stützt
> sich auf [EU-US Data Privacy Framework / Standardvertragsklauseln —
> prüfen]. Rechtsgrundlage: Art. 6 Abs. 1 lit. b bzw. f DSGVO. Bitte
> schreibe Mikesch keine persönlichen Daten.
>
> **Mikeschs Schnurrpost (Rundbrief).** Wenn du dich anmeldest, speichern
> wir deine E-Mail-Adresse, die Sprache, den Zeitpunkt der Anmeldung und
> der Bestätigung sowie die Fassung des Einwilligungstextes. Erst nach dem
> Klick auf den Link in unserer Bestätigungsmail bist du eingetragen;
> unbestätigte Anmeldungen löschen wir nach sieben Tagen. Abmelden kannst
> du dich jederzeit über den Link in jeder Mail; dann löschen wir deine
> Adresse vollständig. Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO, § 7
> Abs. 2 UWG. Versand über [Dienst eintragen].

Dazu: Eintrag im **Verarbeitungsverzeichnis** (`docs/recht/
verarbeitungsverzeichnis.md`) für beides, und der Auftragsverarbeitungs-
vertrag mit Anthropic (ist in den kommerziellen Bedingungen enthalten —
prüfen). Der Einwilligungstext neben dem Häkchen steht in
`assets/lang/*.json` unter `mikesch.post.einwilligung`; ändert sich sein
Sinn, muss `EINWILLIGUNG_FASSUNG` in `dienst/src/rundbrief.mjs` hoch.

## Was Micha tun muss

Eigener Vorgang, siehe PR-Beschreibung. Kurz:

1. `ANTHROPIC_API_KEY` als Geheimnis für den Container `konto` setzen
   (erst, wenn Sāmi-Ra das Konto entschieden hat).
2. Tabelle `rundbrief` im Speicherkonto anlegen (wie `umfrage`,
   `hoertest`, `stimmung`).
3. Ausrollen: Seite und Dienst zusammen. nginx reicht `/api/` schon weiter;
   neue Wege: `/api/mikesch`, `/api/rundbrief/*`.

## Gefunden nebenbei

Auf der arabischen Seite ist das Dokument auf dem Handy 10.000 px breit:
Die Sprungmarke steht mit `left: -9999px` außerhalb, und in
Rechts-nach-links-Schrift ist links scrollbar (`assets/styles.css`,
`.sprungmarke`). Nicht Teil dieses Zweigs.
