# „hören gerade“ — Live-Hörerzahl für iyambae.fm

Stand: 16.10.2026 · Auftrag: Micha · Gestaltung und Platz: Sāmi-Ra (letztes Wort)

## Ziel

Auf iyambae.fm (Webseite, installierte App) und in IYAMBAE FM für Google TV
steht dezent, wie viele Menschen gerade hören — **erst ab 3**. Darunter steht
nichts, auch keine Null.

Nicht Ziel: Hörerzahlen je Sender, Verlauf, Spitzenwerte, Dashboard. Die
vorhandene Reichweitenmessung (`assets/lib/messung.mjs`,
`infra/dashboard.bicep`) bleibt, wie sie ist.

## Was sich am Datenschutzversprechen ändert — und was nicht

Bisher gilt: „Nur der Start wird gemeldet, nie das Ende“ und „die Anfrage
erreicht unseren Server nie“. Eine Zahl „hören gerade“ ist ohne eine
Meldung *während* des Hörens nicht zu haben. Micha hat am 16.10.2026
entschieden, das Versprechen zu ändern.

**Neu gilt:** Solange Musik läuft, meldet die Seite einmal pro Minute
„läuft noch“. Die Meldung trägt **keinen Inhalt** — keine Kennung, kein
Cookie, keine Nummer, keinen Zufallswert, keinen Sender. Der Server macht
daraus eine einzige Zahl, die nach spätestens drei Minuten überschrieben
ist. Es entsteht kein Verlauf, keine Protokollzeile, nichts, woran sich zwei
Meldungen derselben Person aufreihen ließen.

**Unverändert gilt:** keine Adresse in Messdaten, keine Kennung, kein
Suchbegriff, keine Dritten. Der Schalter „nicht mitzählen“ im Fuß stoppt
auch den Pulsschlag.

Rechtliche Einordnung, gleiche Linie wie `messung.mjs`: Nichts wird auf dem
Endgerät gespeichert oder von dort gelesen (außer der Widerspruch, § 25
Abs. 2 Nr. 2 TDDDG), also bleibt die DSGVO; Grundlage berechtigtes
Interesse, Art. 6 Abs. 1 lit. f, mit Widerspruch nach Art. 21. Der
Pulsschlag ist eine Netzanfrage ohne Gerätedaten — dieselbe Einordnung wie
die bestehende Messung.

## Aufbau

```
Browser / Fernseher                Dienst (konto, je Exemplar)          Tabelle `hoerer`
──────────────────                 ──────────────────────────          ────────────────
spielt → POST /api/hoeren ──────▶  Minutenzähler im Speicher +1
         alle 60 s                 alle 30 s: Zeile des Exemplars ──▶  PK „jetzt“, RK Exemplar
                                   überschreiben {minute, anzahl}       {minute, anzahl}
         ◀── {hoeren: n|null} ───  liest alle Zeilen, summiert
spielt nicht, Seite sichtbar →     die der letzten zwei Minuten,
GET /api/hoeren alle 60 s          teilt durch 2, rundet
```

### Dienst: `dienst/src/hoerer.mjs` (neu)

Eine Einheit mit einer Aufgabe: Pulsschläge zählen, Zahl liefern.

- `erzeugeHoerer({ speicher, exemplar, uhr })` →
  `{ puls(), zahl(), schreibe(), stoppe() }`
- **Zählen:** Ein Zähler je Kalenderminute (UTC, `Math.floor(t/60000)`) im
  Arbeitsspeicher; gehalten werden nur die letzten drei Minuten.
- **Schreiben:** alle 30 s überschreibt das Exemplar **seine eine Zeile** in
  der Tabelle `hoerer`: `partitionKey: 'jetzt'`, `rowKey: exemplar`,
  Felder `minute` (laufende Minute, Zahl) und `zaehler` (JSON
  `{"<minute>": n}` für die letzten drei Minuten).
  Kein ETag nötig — jede Zeile hat genau einen Schreiber.
- **Exemplarname:** `process.env.CONTAINER_APP_REPLICA_NAME`, sonst eine beim
  Start gezogene UUID. Der Zufall entsteht auf dem Server, nicht beim Hörer.
- **Lesen:** alle Zeilen der Partition `jetzt`; aus jeder Zeile die Zähler
  der beiden letzten **vollständigen** Minuten (m−1, m−2) nehmen und über alle
  Exemplare summieren. Hörerzahl = (Summe m−1 + Summe m−2) ÷ 2, gerundet. Die
  Mittelung glättet, wenn Taktabweichungen einen Puls in die Nachbarminute
  schieben.
  Ergebnis 5 s im Speicher halten, damit nicht jeder Puls die Tabelle liest.
- **Aufräumen:** Zeilen, deren `minute` älter als 10 Minuten ist (beendete
  Exemplare), löscht der Leser.
- **Schwelle im Dienst, nicht im Browser:** Die Antwort enthält die Zahl nur,
  wenn sie ≥ 3 ist, sonst `null`. So verrät auch die Antwort selbst keinen
  einzelnen Hörer.
- **Tabelle nicht erreichbar:** `{ hoeren: null }`, niemals eine erfundene
  Zahl. Der Puls zählt trotzdem im Speicher weiter.

### Dienst: Wege in `server.mjs`

| Weg | Drossel | Antwort |
|---|---|---|
| `POST /api/hoeren` | netz: 10 / 60 s; global: 6000 / 60 s | `200 {hoeren: n \| null}` |
| `GET /api/hoeren` | netz: 10 / 60 s | `200 {hoeren: n \| null}`, `Cache-Control: no-store` |

- **Kein Körper.** Ein mitgeschickter Körper wird nicht gelesen.
- **Keine Herkunftsprüfung** (`pruefeHerkunft`) für diese beiden Wege. Die
  Prüfung schützt Wege, die mit Cookies etwas im Namen eines Menschen tun.
  Hier gibt es kein Cookie und keine Wirkung außer +1, und die
  Fernseh-App sendet als native App keinen `Origin`-Kopf.
- **Kein Protokoll.** Der Puls erscheint nicht in `protokolliere`; nur eine
  Ablehnung durch die Drossel wird wie überall protokolliert.
- Drossel 10/min je Netz: Ein Haushalt mit mehreren Geräten wird richtig
  gezählt, Aufblähen bleibt begrenzt.

### Infrastruktur

- `infra/main.bicep`: Tabelle `hoerer` neben `hoertest` und `stimmung`.
- `deploy/nginx.conf`: kein neuer Block nötig — `location /api/` reicht
  weiter. Prüfen, dass `proxy_intercept_errors` die 200 nicht berührt.
- Service Worker: `/api/` ist bereits ausgenommen. Keine neue Fassung von
  `sw.js` nötig, außer für neue Dateien in `SHELL_FILES`.

### Webseite: `assets/lib/hoerer.mjs` (neu)

- `beobachteHoerer({ spieltGerade, ziel })`
- Spielt Musik und ist die Messung nicht abgeschaltet → `POST` sofort beim
  Start, dann alle 60 s. Endet die Wiedergabe → Pulse hören auf.
- Spielt nichts und ist die Seite sichtbar → `GET` alle 60 s; unsichtbar →
  Pause.
- Messung abgeschaltet → kein `POST`; die Zahl wird per `GET` trotzdem
  angezeigt, das Lesen meldet nichts.
- Anzeige: `t('hoerer.jetzt', {n})` in ein Element neben dem laufenden
  Sender; bei `null` oder Fehler wird das Element geleert und verborgen.
  Kein Flackern: Element erst nach der ersten Antwort einblenden.
- Den Widerspruch liest das Modul über eine kleine Ausfuhr aus
  `messung.mjs` (`messungErlaubt()`), nicht über eine zweite Kopie des
  Speicherschlüssels.
- Platz: Vorschlag ist eine kleine, gedämpfte Zeile unter dem Sendernamen im
  Abspieler (`· 7 hören gerade`). **Sāmi-Ra entscheidet Platz und Gestaltung.**
- Sprachschlüssel `hoerer.jetzt` in allen sieben `assets/lang/*.json`.
  Bei ≥ 3 genügt im Deutschen eine Pluralform; für Arabisch (Formen für
  3–10 und ab 11) über `Intl.PluralRules`, falls `sprache.mjs` das nicht
  schon kann — im Plan prüfen.
- Neue Datei → `SHELL_FILES` und `SW_VERSION` in `sw.js` hochzählen.

### Fernseher: `MyRetuner/fm-tv` (zweiter PR, Repo `apps`)

- `wiedergabe/Hoerer.kt`: Solange `WiedergabeDienst` spielt, alle 60 s
  `POST https://iyambae.fm/api/hoeren` (Coroutine, ohne Körper, Zeitlimit
  10 s, Fehler still). Ohne Wiedergabe kein Puls.
- `ui/Oberflaeche.kt`: Zahl dezent im Kopf, nur wenn nicht `null`.
- Die Fernseh-App hat keinen Schalter „nicht mitzählen“. Für die erste
  Fassung gilt: Der Fernseher zählt mit, die Datenschutzerklärung sagt das.
  Ein Schalter wäre ein eigener Schritt.
- **Bauen und Prüfen nur auf dem Mac** (kein Android SDK auf Michas
  Windows-Rechner). Bis Sāmi-Ra am Gerät geprüft hat, gilt der TV-Teil als
  ungeprüft.

## Texte, die sich ändern

- `recht/datenschutz/index.html` (nur Deutsch vorhanden): Abschnitt 3 und
  die Stellen „Nicht, wie lange du hörst“, „berührt unseren Server nie“,
  „Das steht in keinem Protokoll …“ neu fassen; neuer Absatz zum Pulsschlag
  mit den Punkten oben. Der Fernseher wird erwähnt.
- `recht/verarbeitungsverzeichnis/index.html`: neue Verarbeitung „Live-
  Hörerzahl“ — Zweck, Daten (keine), Speicherdauer (≤ 3 min, eine Zeile je
  Exemplar), Empfänger (keine).
- Kopfkommentare in `assets/lib/messung.mjs` und `infra/dashboard.bicep`, die
  das alte Versprechen wiederholen, mit Verweis auf diesen Spec berichtigen.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Kaltstart (8,2 s) | Erster Puls wartet; Anzeige bleibt leer bis zur Antwort |
| Tabelle aus | `null`, Anzeige verschwindet; Zählen im Speicher läuft weiter |
| Gedrosselt (429) | Anzeige unverändert, nächster Versuch nach 60 s |
| Offline | Anfrage scheitert still, Anzeige verschwindet |
| Exemplar beendet | Seine Zeile veraltet, zählt nach 3 min nicht mehr, nach 10 min gelöscht |

## Prüfen

- `dienst/test/hoerer.test.mjs` mit `speicherImArbeitsspeicher` und
  gestellter Uhr: Zählen je Minute; Summe über zwei Exemplare; Schwelle
  (2 → `null`, 3 → 3); Mittelung über m−1 und m−2; veraltete Zeilen zählen nicht und werden gelöscht;
  Tabelle gestört → `null`; Körper wird ignoriert.
- Wegetest: `POST` ohne `Origin` → 200; Drossel greift beim 11. Puls je Netz;
  kein Protokolleintrag beim Puls.
- `Scripts/test/`: Sprachschlüssel in allen sieben Katalogen vorhanden;
  `SHELL_FILES` enthält `hoerer.mjs`.
- Im Browser (Chrome DevTools): Puls nur bei laufender Musik, keiner nach
  Stopp, keiner bei abgeschalteter Messung; Anzeige erst ab 3.
- Nach der Auslieferung: drei Fenster abspielen lassen, Zahl erscheint.

## Kosten

Solange jemand hört, schläft der Container nicht ein (bisher schlief er,
weil die Ströme ihn nie berühren). Bei Dauerbetrieb grob 10–15 €/Monat über
dem Freikontingent — Schätzung, nicht gemessen. Tabellenzugriffe: je Exemplar
2 Schreibvorgänge/min, Lesen höchstens alle 5 s — vernachlässigbar.

## Ablauf

1. Dieser Spec → Plan → Umsetzung im Zweig `hoerer-jetzt` (`iyambae-radio`)
2. PR in `iyambae-radio`; TV-Teil als eigener Zweig und PR in `apps`
3. Vorgang an Sāmi-Ra in `432hz-radio`: Platz, Gestaltung, Text der
   Datenschutzerklärung, TV-Prüfung am Gerät
