# Nachricht an Sāmi-Ra

*Entwurf vom 21.08.2026. Micha schickt sie, nicht ich.*

---

Hallo Sāmi-Ra,

deine Arbeit von heute Morgen ist angekommen — die Wühlkiste, die sechs neuen
Sender und das Feld `kanal`. Ich habe alles übernommen, es läuft seit heute
auf iyambae.fm. Zwei Dinge musst du dabei wissen, und eines davon ist
unangenehm.

## Was ich an deinem Katalog ergänzt habe

Deine sechs neuen Sender hatten noch keine technischen Angaben — kein Format,
keine Datenrate, kein CORS. Das letzte ist wichtiger, als es klingt: Ohne
CORS-Freigabe darf der Browser den Ton nicht in den Web-Audio-Graphen holen,
und dann kann die Seite nicht wirklich umstimmen, sondern nur über
`playbackRate` raten. Ich habe alle sechs gemessen:

| Sender | Format | Datenrate | CORS |
|---|---|---|---|
| SomaFM Left Coast 70s | mp3 | 320 kbit/s | ja |
| R.SA Ostrock | mp3 | 192 kbit/s | ja |
| XRaydio 1 — Kaleidoscope | aac | 160 kbit/s | ja |
| XRaydio 2 — Vintage Jukebox | aac | 160 kbit/s | ja |
| Radio Cowabunga | aac | 128 kbit/s | ja |
| Wraith Vision | mp3 | 128 kbit/s | ja |

Alle sechs erreichbar, alle mit Freigabe. Gute Auswahl — damit sind jetzt
89 von 134 Sendern im Browser umstimmbar.

Zwei Logos hatte dein Stand nicht: **Caracas Salsa Brava** und
**Bamtaare FM 103.4**. Ich hatte sie geholt, nachdem du deinen Stand gezogen
hattest, deshalb konntest du sie nicht kennen. Sind wieder verknüpft.

Und eine Kennung: SomaFM Underground 80s hieß bei mir `soma-u80s`, bei dir
`somafm-u80s`. **Deine gilt** — du führst den Katalog, und zwei Kennungen für
denselben Sender wären der Anfang von Ärger.

Die Wühlkiste hat eine Regalfarbe bekommen, ein gedecktes Grün. Die Regalwand
und die Trennkarte am Regalkopf brauchen sie; ohne wären das zehnte Fach und
sein Reiter farblos. Wenn dir der Ton nicht gefällt, sag es — er steht an
genau einer Stelle in `assets/lib/senderbild.mjs`.

## Das Unangenehme: dein `main` geht nicht live

**Was auf iyambae.fm läuft, kommt nicht aus `main`.** Es kommt aus dem Zweig
`bruecke-einwilligung`, und dort liegt inzwischen einiges, das `main` nicht
kennt:

- Die Seite gibt es in **sieben Sprachen** unter `/de/ /en/ /fr/ /es/ /it/
  /ja/ /ar/`, Arabisch von rechts nach links. Wer `iyambae.fm` aufruft, wird
  anhand seines Browsers weitergeleitet.
- Die Regale sind **waagerechte Reihen** wie bei Netflix, der Filter fragt
  nach Anlässen statt nach Genres, und es gibt eine Regalwand mit Mosaiken
  aus echten Covern.
- **Impressum, Datenschutzerklärung und Verarbeitungsverzeichnis** stehen
  unter `/recht/`. Die brauchten wir: Ohne Impressum lief die Seite in eine
  Ordnungswidrigkeit, und die Schriften kamen von einem Google-Server, was
  die IP jedes Besuchers dorthin schickte. Beides ist erledigt.
- Ein **Anmeldedienst** ist gebaut und getestet, aber noch nicht ausgerollt.

Dein `main` hat genau **einen Commit** — den ganzen Laden zusammengefasst —
und er wurde heute mit `--force` über den Stand von gestern geschrieben. Das
ist der Spiegel-Push aus deinem getrennten Arbeitsstand.

Solange das so läuft, haben wir zwei Wahrheiten:

- Du kuratierst gegen einen Stand, der nie ausgeliefert wird.
- Ich baue auf einem Zweig, den dein Spiegel nicht kennt.

Deine sechs neuen Sender waren heute Morgen **nicht live**, obwohl du sie
gepusht hattest. Erst weil ich nachgeschaut habe, sind sie es jetzt.

## Zwei Wege, und du entscheidest

**Erstens: `main` wird der gemeinsame Zweig.** Dann muss der Spiegel-Push
aufhören — kein `--force` mehr auf `main`. Du arbeitest weiter nur an
`data/sender.json` und den Logos, ich am Rest, und wir stoßen uns nicht. Das
ist mein Vorschlag, weil es die Arbeitsteilung abbildet, die wir ohnehin
haben.

**Zweitens: dein Spiegel behält `main`, mein Code zieht dauerhaft um.** Dann
ist `main` dein Schaufenster, und wir brauchen eine feste Verabredung, wie
dein Katalog zu mir kommt — sonst schaue ich weiter jeden Tag nach, ob du
etwas gepusht hast.

Was ich in beiden Fällen brauche: **Sag mir Bescheid, wenn du am Katalog
gearbeitet hast.** Eine Zeile reicht. Dann ist es innerhalb einer Stunde
live, statt bis zum nächsten Zufall zu warten.

Und eine Bitte: **Wenn du mehrere Kanäle desselben Senders anlegst, hilft es
mir, wenn `kanal` immer gesetzt ist** — auch bei denen, die nur einen haben.
Dann kann ich sie zusammenfassen, ohne raten zu müssen, ob "NTS 1" und
"NTS 2" derselbe Sender sind.

Viele Grüße
Micha

---

## Anhang: was auf iyambae.fm gerade steht

134 Sender in 10 Regalen, 104 mit eigenem Bild, 30 mit gestalteter Hülle.
89 im Browser umstimmbar. Sieben Sprachen. Kein Sender ungeprüft, kein
verwaistes Logo, keine fehlende Datei.
