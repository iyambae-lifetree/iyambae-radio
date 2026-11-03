# Mess-Abzeichen für Creator — Entwurf

Stand 03.11.2026. Anforderung: Vorgang `432hz-radio#27` samt Kommentaren
vom 01.10. (Micha, rechtliche Seite) und 02.10. (Sāmi-Ra: `/messung/` statt
`/geprueft/`, „gemessen" statt „geprüft", Selbstauskunft statt Beweis).

## Worum es geht

Nach einer Messung auf `apps.iyambae.fm/<sprache>/stimmung/` kann der
Besucher ein Abzeichen erzeugen. Der Browser schickt **nur den Befund** und
die SHA-256 der Datei; der Dienst legt ihn unter einer kurzen Kennung ab und
liefert dazu eine Seite und ein Bild. Wer dieselbe Datei hat, kann sie auf
`/stimmung/` nachmessen und die Prüfsumme vergleichen.

Was das Abzeichen sagt, und nur das: *Diese Datei (Prüfsumme) wurde am Tag X
bei Y Hz gemessen.* Es sagt **nicht**, dass das Video darunter dieselbe Datei
enthält. Es ist eine **Selbstauskunft mit Zeitstempel, kein Beweis** — dieser
Satz steht sichtbar auf der Seite, und das Bild selbst trägt das Wort
„Selbstauskunft".

## Schnittstellen

Alle vier Wege liefert der Anmeldedienst (`dienst/`), wie die übrigen
dynamischen Wege. nginx reicht sie auf **apps.iyambae.fm** weiter (dort
liegt `/stimmung/`; der Radio-Host kennt sie nicht).

### `POST /api/messung` — ablegen

| | |
|---|---|
| Kopf | `Content-Type: application/json` **Pflicht**, sonst `415 nur_json`. `Origin` aus `ERLAUBTE_URSPRUENGE` (wie alle schreibenden Wege) |
| Rumpf | `{ "a4": 432.1, "sicherheit": 0.87, "dauer": 222, "sha256": "<64 hex>" }` |
| Erfolg | `201 { "kennung": "…", "loeschschluessel": "…" }` |
| Fehler | `400 befund_ungueltig` (Feld fehlt, falscher Typ, außerhalb des Bereichs), `400 traegt_nicht` (Sicherheit unter 0,35), `429` Drossel, `503` Speicher |

Erlaubnisliste wie in `rueckmeldung.mjs`: Nur diese vier Felder werden
gelesen, alles andere fällt still weg (ein mitgeschickter `dateiname` landet
nirgends). Zahlen nur als `number`, nie als Zeichenkette.

| Feld | Bereich | gespeichert als |
|---|---|---|
| `a4` | 380 – 500 Hz | eine Nachkommastelle |
| `sicherheit` | 0,35 – 1 | zwei Nachkommastellen |
| `dauer` | 1 – 86 400 s (Länge der gemessenen Datei) | ganze Sekunden |
| `sha256` | genau 64 Zeichen `[0-9a-f]` | wie geliefert |

**Unter 0,35 kein Abzeichen.** Die Seite zeigt unterhalb dieser Schwelle gar
keine Zahl (`stimmung.html`, „UNTER DER SCHWELLE WIRD KEINE ZAHL BEHAUPTET");
ein Abzeichen für eine Zahl, die nicht einmal angezeigt wurde, wäre genau
die Sorte Aussage, gegen die die Seite antritt.

### `DELETE /api/messung` — löschen

Rumpf `{ "kennung": "…", "loeschschluessel": "…" }`, `application/json`
Pflicht, `Origin` geprüft.

Die Kennung steht **im Rumpf, nicht im Pfad**: Das Zugriffsprotokoll von
nginx schreibt den Pfad mit der gekürzten Adresse. Mit der Kennung darin
stünde dort, aus welchem Netz der Ersteller gelöscht hat.

| Antwort | wann |
|---|---|
| `204` | gelöscht |
| `404 nicht_gefunden` | Kennung unbekannt, schon gelöscht oder abgelaufen |
| `403 schluessel_falsch` | Kennung da, Schlüssel passt nicht |
| `400 befund_ungueltig` | Kennung oder Schlüssel haben nicht die Form |

Das 403 verrät nichts: Ob eine Kennung existiert, zeigt ohnehin `GET`.

### `GET /messung/<kennung>` — die Seite

HTML mit Kammerton, Sicherheit, Länge, Prüfsumme, Zeitpunkt (UTC) und
Ablaufdatum, dem Pflichtsatz, der Anleitung zum Nachmessen und einem
Formular zum Löschen (Skript `/assets/lib/abzeichen-loeschen.mjs`, kein
Inline-Skript). `200`, `404` oder `410` jeweils mit Seite.

### `GET /messung/<kennung>.svg` — das Bild

Dieselbe Auskunft, 320 × 72, ohne Skript, ohne fremde Ressourcen, nur
Systemschriften. `200`, `404` oder `410` jeweils mit Bild — ein `<img>`
unter einem Video soll „abgelaufen" zeigen und nicht ein kaputtes Symbol.

### Sprache von Seite und Bild

`?sprache=de|en|fr|es|it|ja|ar` vor dem ersten Eintrag von
`Accept-Language` vor `en` — dieselbe Regel wie die Weiche in nginx.
`Vary: Accept-Language`. Gespeichert wird keine Sprache.

## Datenmodell

Eigene Tabelle **`abzeichen`**, neben `umfrage`, `hoertest`, `stimmung`,
`rundbrief` — nicht darin. Begründung wie dort: In `stimmung` hängt keine
Zeile an einer Person, hier hängt jede an einem Creator. Zwei solche
Zeilenarten in einer Tabelle bekommen früher oder später ein gemeinsames
Feld.

| Spalte | Inhalt |
|---|---|
| `PartitionKey` | die Kennung |
| `RowKey` | `'a'` |
| `a4`, `sicherheit`, `dauer`, `sha256` | der Befund |
| `angelegt` | ms seit 1970 |
| `ablauf` | `angelegt` + zwei Kalenderjahre, ms (Edm.Double) |
| `loeschHash` | SHA-256 (hex) des Löschschlüssels |

**Nicht gespeichert:** Datei, Dateiname, IP (auch keine gekürzte, auch kein
Abdruck), Konto, Sprache, Browserkennzeichen.

### Kennung

Zehn Zeichen aus `0123456789abcdefghjkmnpqrstvwxyz` (32 Zeichen, ohne
i, l, o, u — nichts zum Verwechseln beim Abtippen):

- **drei Zeichen Erstellungstag** (Tage seit 01.01.2026 UTC, Basis 32,
  reicht bis 2115),
- **sieben Zeichen Zufall** (35 bit je Tag, `crypto.randomBytes`).

Der Tag steht in der Kennung, damit der Dienst auch **nach dem Löschen**
noch weiß, dass ein Eintrag abgelaufen ist: Fehlt die Zeile und liegt der
Tag mehr als zwei Jahre zurück, antwortet er `410 abgelaufen` statt `404`.
Ohne das müsste er für jede gelöschte Kennung einen Grabstein aufheben, und
dann lebte der Eintrag länger als zwei Jahre. Der Tag verrät nichts, was die
Seite nicht ohnehin zeigt. Ein Tag in der Zukunft ist sofort `404`, ohne
Tabellenzugriff.

Kollision (zwei gleiche Kennungen an einem Tag): Angelegt wird mit
If-None-Match (`etag: '*'`); bei Konflikt neu ziehen, höchstens dreimal.

### Löschschlüssel

24 Zufallsbytes, base64url (32 Zeichen). Gespeichert nur als SHA-256. Ein
schneller Hash genügt, weil der Schlüssel 192 bit Zufall trägt — gegen ein
Passwort wäre das falsch, gegen diesen Schlüssel ist Argon2 Aufwand ohne
Gewinn. Vergleich zeitkonstant.

## Speicherdauer und Wegräumen

**Zwei Jahre ab Erstellung.** Danach:

- **Beim Zugriff:** Seite und Bild sagen „abgelaufen", Status `410`, und die
  Zeile wird im Hintergrund gelöscht.
- **Im Tagesdurchgang:** höchstens alle 24 Stunden (`AUFRAEUM_STUNDEN`),
  angestoßen von einer echten Anfrage, nach der Antwort — wie das Wegräumen
  der Rundbrief-Anmeldungen. Gefiltert wird im Tabellendienst
  (`ablauf lt …`), es kommen nur abgelaufene Zeilen über die Leitung.
  **Keine neue Grundlast**, kein Timer.

## Grenzen

| Weg | Netz (/24 bzw. /32, nur im Arbeitsspeicher) | global |
|---|---|---|
| `POST /api/messung` | 10 je 30 min | 60 je min |
| `DELETE /api/messung` | 10 je 10 min | — |
| `GET /messung/…` | 120 je min | — |

Die Zahlen bei `POST` sind die von `/api/umfrage`: unangemeldet, selten.
Beim Lesen keine globale Achse — wer sie leerschösse, schaltete alle
Abzeichen ab, ohne etwas zu können (dieselbe Überlegung wie bei
`/api/zusammenfassung`). Seite und Bild tragen `Cache-Control: public,
max-age=300`: Ein Abzeichen unter einem vielgesehenen Video soll nicht
jeden Aufruf bis in die Tabelle schicken, und ein Löschen wirkt trotzdem
nach höchstens fünf Minuten.

**Protokoll:** nur `art: 'abzeichen'`, `ergebnis`, `grund`, `dauer`. Keine
Kennung, kein Befund, keine Adresse. nginx schreibt für `/messung/`
**kein Zugriffsprotokoll** (`access_log off`) — sonst stünde dort, aus
welchem Netz wer welches Abzeichen angesehen hat.

## Kopfzeilen

| | Seite | Bild |
|---|---|---|
| `Content-Type` | `text/html; charset=utf-8` | `image/svg+xml; charset=utf-8` |
| `Content-Security-Policy` (scharf, vom Dienst) | `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` | `default-src 'none'; style-src 'unsafe-inline'` |
| `Cross-Origin-Resource-Policy` | — | `cross-origin` (nur hier) |
| `X-Robots-Tag` | `noindex` | `noindex` |

nginx legt wie überall `koepfe/apps.conf` darüber (Pflicht laut
`Scripts/test/sicherheitskoepfe.test.mjs`). `X-Frame-Options: DENY` und
`frame-ancestors 'none'` stören ein `<img>` nicht; eingebettet wird als
Bild, nicht als Rahmen.

## Die Seite `/stimmung/`

- Nach dem Dekodieren rechnet der Browser die SHA-256 der geladenen Datei
  (`crypto.subtle.digest`, **vor** `decodeAudioData`, das den Puffer
  übernimmt) und zeigt sie im Ergebnis. Rein örtlich; ohne sie gäbe es
  nichts, womit man nachmessen könnte.
- Trägt die Messung (Sicherheit ≥ 0,35), erscheint der Kasten
  „Mess-Abzeichen" mit dem Knopf **„Abzeichen erzeugen"** und dem Satz,
  was gesendet wird. Erst der Druck auf den Knopf sendet.
- Danach: Link, Einbettcode, Löschschlüssel, und deutlich **„Nur jetzt
  sichtbar"**. Dazu der Pflichtsatz in Kurzform.
- Hilfsfunktionen in `apps/assets/lib/abzeichen.mjs` (prüfbar unter
  `node --test`), Texte in allen sieben Sprachen über die Kataloge.

## Recht

- **V16** im Verarbeitungsverzeichnis (V12/V13 sind Mikesch, V14/V15 kommen
  in einem anderen Zweig für Blindtest und Messwerkzeug): Zweck
  überprüfbarer Nachweis einer Messung; Betroffene, wer ein Abzeichen
  erzeugt; Daten Hz, Sicherheit, Dauer, SHA-256, Zeitpunkt, Kennung;
  Empfänger die Öffentlichkeit und Microsoft als Auftragsverarbeiterin;
  Art. 6 Abs. 1 lit. b DSGVO; § 25 Abs. 2 Nr. 2 TDDDG; Frist zwei Jahre.
- Datenschutzerklärung (`docs/recht/datenschutz.md`, ausgeliefert unter
  `iyambae.fm/recht/datenschutz/`, verlinkt aus jeder Seite von
  apps.iyambae.fm): neuer Abschnitt 14.

## Offene Fragen

1. **Tabelle anlegen.** `infra/main.bicep` trägt `abzeichen` nach; bis zum
   nächsten Ausrollen der Vorlage gibt es sie im Speicherkonto nicht, und
   `POST /api/messung` antwortet 503. Der Dienst legt keine Tabellen selbst
   an.
2. **Nummer V16** setzt voraus, dass der Zweig mit V14/V15 zuerst oder
   gleichzeitig zusammengeführt wird; sonst klafft eine Lücke. Gleiches gilt
   für die Abschnittsnummer in der Datenschutzerklärung.
3. **Sprache des Bildes** folgt dem Betrachter, nicht dem Creator. Wer eine
   feste Sprache will, hängt `?sprache=` an.
4. **Plattformen ohne Bilder** (YouTube-, TikTok-Beschreibung) nehmen nur
   den Link. Der Einbettcode hilft auf eigenen Webseiten.
5. **Abhängigkeit von iyambae-radio#32** (`dienst-haertung-46`, noch nicht
   in main). Dort darf apps.iyambae.fm nur noch die Wege aus
   `RUECKMELDEWEGE` in `dienst/src/urspruenge.mjs` rufen. Nach dem
   Zusammenführen beider Zweige gehören `POST /api/messung` und
   `DELETE /api/messung` in diese Liste, sonst antworten sie von
   `/stimmung/` und von der Abzeichen-Seite mit 403. Den Kopf
   `application/json` schicken beide Wege schon immer mit, auch das
   Löschen. Der Kommentar dort („anonym, ohne Personenbezug") trifft auf das
   Abzeichen nicht zu: Es schreibt keine Mail und berührt kein Konto, ist
   aber personenbezogen (V16). Das gehört beim Eintragen dazugeschrieben.
6. **Rechtliche Einschätzung** stammt aus dem Vorgang (Micha, 01.10., „keine
   Rechtsberatung"); die Texte hier sind daraus abgeleitet, nicht geprüft.
