# IYAMBAE — Anmeldedienst

Der Kern: Anmeldung per Einmalcode oder Passwort, Sitzungen, Merkliste und
Hoerverlauf. Node 22, reine ES-Module, kein Framework.

Er laeuft als zweiter Container **neben** nginx in derselben Replik und hoert
auf `127.0.0.1:8081`. Von aussen kommt nichts direkt an ihn heran — nginx
reicht `/api/` weiter. Die dafuer noetigen Bloecke stehen als „NOCH ZU TUN"
am Ende von `../infra/konto.bicep.entwurf`; sie sind noch **nicht**
eingetragen.

---

## Aufbau

| Datei | Was darin entschieden wird |
|---|---|
| `src/server.mjs` | HTTP, Weiche, Ratenbegrenzung, Zeitboden, Fehlerbehandlung |
| `src/speicher.mjs` | Table Storage, ETag-Wiederholung, Konten und Verweise |
| `src/sitzung.mjs` | Plaetzchen erzeugen, pruefen, widerrufen; beilaeufiges Aufraeumen |
| `src/einmalcode.mjs` | sechsstelliger Code und Marke: erzeugen, pruefen, verbrauchen |
| `src/passwort.mjs` | Argon2id hinter einer Schranke, NIST-Regeln, Leak-Abgleich |
| `src/mail.mjs` | ACS-Versand mit Warteschlange und eigener Ratenbegrenzung |
| `src/abgleich.mjs` | Verschmelzen von Merkliste und Verlauf — reine Rechnung |
| `src/protokoll.mjs` | eine JSON-Zeile je Ereignis nach stdout, ohne Personenbezug |

Das Warum steht jeweils oben in der Datei, nicht hier. Diese Seite sagt, wie
man es startet, was gemessen wurde und was offen ist.

---

## Oertlich starten

Drei Stufen, von „geht sofort" bis „wie im Betrieb".

### 1. Ohne alles — nur zum Ausprobieren

```bash
cd dienst
npm install
MAIL_ART=konsole PLAETZCHEN_UNSICHER=1 HERKUNFT_LOCKER=1 npm start
```

Der Dienst warnt beim Start auf stderr und laeuft dann mit einem Speicher im
Arbeitsspeicher. **Alle Konten sind beim naechsten Neustart weg.** Die Mails
werden im Klartext auf die Konsole geschrieben — samt Einmalcode. Genau
deshalb haengt das an `MAIL_ART=konsole` und passiert nicht von selbst.

`PLAETZCHEN_UNSICHER=1` nimmt das `Secure`-Merkmal vom Plaetzchen, sonst
nimmt der Browser es ueber `http://localhost` nicht an.
`HERKUNFT_LOCKER=1` schaltet die Origin-Pruefung ab, damit `curl` durchkommt.
Beide gehoeren **niemals** in eine Umgebung, die von aussen erreichbar ist.

Ausprobieren:

```bash
curl -i -X POST localhost:8081/api/anmelden \
     -H 'Content-Type: application/json' -d '{"mail":"du@example.org"}'
# -> 204, und der Code steht in der Konsolenausgabe des Dienstes
curl -i -X POST localhost:8081/api/anmelden/code \
     -H 'Content-Type: application/json' -d '{"mail":"du@example.org","code":"123456"}'
```

### 2. Mit Azurite — echte Tabellen, echte ETags

```bash
npx azurite-table --location ./.azurite --silent &
node -e "const {TableServiceClient}=require('@azure/data-tables');
  const c=TableServiceClient.fromConnectionString('UseDevelopmentStorage=true',{allowInsecureConnection:true});
  Promise.all([c.createTable('konten'),c.createTable('verweise')]).catch(()=>{})"
AZURITE=1 MAIL_ART=konsole PLAETZCHEN_UNSICHER=1 npm start
```

`AZURITE=1` ist die **einzige** Stelle im ganzen Dienst, an der eine
Verbindungszeichenfolge vorkommt. Es ist die allgemein bekannte
Azurite-Kennung aus der Microsoft-Doku — eine Konstante, kein Geheimnis.
Gegen Azure faellt dieser Zweig nie an, weil `konto.bicep.entwurf` die
Kontoschluessel mit `allowSharedKeyAccess: false` abschaltet.

### 3. Gegen Azure

```bash
az login   # DefaultAzureCredential nimmt die az-CLI-Anmeldung
TABELLEN_ENDPUNKT=https://st….table.core.windows.net/ \
ACS_ENDPUNKT=https://acs-iyambae.communication.azure.com \
ABSENDER=konto@mail.iyambae.fm \
npm start
```

Kein Kontoschluessel, keine Verbindungszeichenfolge, kein Geheimnis in einer
Umgebungsvariablen. `DefaultAzureCredential` nimmt im Container die
verwaltete Identitaet und oertlich die `az`-Anmeldung.

Wer oertlich `403` bekommt: Die Rollen `Storage Table Data Contributor` bzw.
`Reader` haengen an der Identitaet der Container App, nicht an der eigenen.
Fuer den eigenen Zugriff braucht es eine eigene Zuweisung — siehe den
Parameter `verwalter` in `konto.bicep.entwurf`.

---

## Pruefen

```bash
cd dienst && node --test
```

**88 Tests zu diesem Dienstkern**, in sieben Dateien:

```bash
node --test test/abgleich.test.mjs test/aufzaehlung.test.mjs \
            test/drossel.test.mjs test/einmalcode.test.mjs \
            test/passwort.test.mjs test/sitzung.test.mjs test/speicher.test.mjs
```

`node --test` ohne Argument nimmt zusaetzlich die Tests der Endpunkte, die
jemand anders baut (soziale Anmeldung, Passkeys). Ohne Netz, ohne Azurite, ohne
Anmeldung: Die Tests laufen gegen den Speicher im Arbeitsspeicher und starten
den Dienst dabei **wirklich** auf einem freien Port — Plaetzchen, Kopfzeilen
und Weiche werden also mitgeprueft und nicht nachgebaut.

> `node --test test/` schlaegt auf Windows fehl (der Pfad wird als Modulname
> gelesen). `node --test` ohne Argument findet dieselben Dateien.

`test/hilfe.mjs` enthaelt selbst keine Tests, nur das gemeinsame Werkzeug.

---

## Umgebungsvariablen

| Name | Vorgabe | Wofuer |
|---|---|---|
| `PORT` | `8081` | Lauschport |
| `TABELLEN_ENDPUNKT` | — | Table-Storage-Endpunkt; fehlt er, siehe `AZURITE` |
| `AZURITE` | — | `1` schaltet auf oertliches Azurite |
| `ACS_ENDPUNKT` | — | Communication Services |
| `ABSENDER` | — | volle Absenderadresse |
| `ERLAUBTE_URSPRUENGE` | `https://iyambae.fm,https://www.iyambae.fm` | Origin-Pruefung und Grundlage des Passwortlinks |
| `GRABSTEIN_TAGE` | `90` | wie lange geloeschte Merklisteneintraege liegen bleiben |
| `ARGON_GLEICHZEITIG` | `4` | Plaetze in der Argon2-Schranke — **siehe Messung** |
| `ARGON_WARTESCHLANGE` | `64` | Wartende, danach 503 mit `Retry-After` |
| `ARGON_SPEICHER_KIB` | `19456` | OWASP-Empfehlung, 19 MiB |
| `ARGON_DURCHGAENGE` | `2` | `t` |
| `ANTWORT_BODEN_MS` | `250` | Zeitboden gegen Aufzaehlung |
| `CODE_GUELTIG_MINUTEN` | `10` | Einmalcode |
| `CODE_VERSUCHE` | `5` | danach ist der Code verbrannt |
| `MARKE_GUELTIG_MINUTEN` | `60` | Passwortlink |
| `SITZUNGSDAUER_TAGE` | `365` | Plaetzchen und Tabellenzeile |
| `MAIL_JE_MINUTE` / `MAIL_JE_STUNDE` | `25` / `90` | unter Microsofts 30/100 |
| `MAIL_WARTESCHLANGE` | `500` | danach faellt die aelteste Mail weg |
| `HIBP_ZEITGRENZE_MS` | `1500` | Leak-Abgleich; laeuft er ab, wird durchgelassen |
| `HIBP` | — | `aus` schaltet den Leak-Abgleich ab (nur fuer Tests) |
| `AUFRAEUM_STUNDEN` | `24` | Abstand des grossen Durchgangs |
| `MAIL_ART` | — | `konsole` schreibt Mails auf stdout — **nur oertlich** |
| `PLAETZCHEN_UNSICHER` | — | `1` nimmt `Secure` vom Plaetzchen — **nur oertlich** |
| `HERKUNFT_LOCKER` | — | `1` schaltet die Origin-Pruefung ab — **nur oertlich** |
| `UV_THREADPOOL_SIZE` | `4` | **nicht anfassen, siehe Messung** |

---

## Gemessene Zahlen

Alles am 21.08.2026 gemessen, Node 24, nicht geschaetzt.

### Speicher je Argon2-Pruefung

`memoryCost: 19456` (19 MiB), `timeCost: 2`, `parallelism: 1`.

Eine einzelne Pruefung belegt **19,1 MiB RSS** und dauert auf einem freien
Kern **13 ms**. Die 19,1 sind kein Zufall — es ist genau der Parameter.

Die Zahl, auf die es ankommt, ist aber nicht die je Pruefung, sondern die
Spitze unter Last. Und die haengt an etwas, das man leicht uebersieht:
`@node-rs/argon2` rechnet im **Thread-Pool von libuv**, und der hat ab Werk
vier Plaetze.

Spitzenwert RSS bei 200 gleichzeitigen Anfragen:

| `UV_THREADPOOL_SIZE` | Schranke `N` | Spitze RSS | Ergebnis im Container mit 0,5 GiB |
|---|---|---|---|
| 4 | 4 | **+89 MiB** | laeuft |
| 4 | 200 (keine Schranke) | +85 MiB | laeuft — der Thread-Pool deckelt |
| 32 | 4 | **+89 MiB** | laeuft — die Schranke deckelt |
| 32 | 200 (keine Schranke) | **+644 MiB**, Spitze 1081 MiB | **OOM-Kill der ganzen Replik** |

Zwei Dinge daran sind wichtig, und das zweite ist unbequem:

1. **Zwei Deckel, und einer allein genuegt.** Solange `UV_THREADPOOL_SIZE`
   auf 4 steht, bliebe der Speicher auch ohne Schranke im Rahmen. Solange die
   Schranke auf 4 steht, bliebe er es auch bei erhoehtem Thread-Pool. Beide
   gleichzeitig zu verlieren ist der Ausfall — und genau das passiert, wenn
   jemand `UV_THREADPOOL_SIZE` hochsetzt, um „mehr Durchsatz" zu bekommen,
   und ein anderer die Schranke lockert, weil sie 503 wirft.
2. **Was die Schranke wirklich leistet**, ist deshalb nicht in erster Linie
   der Speicherschutz, sondern die **ehrliche Absage**. Ohne sie warten alle
   200 in einer unsichtbaren Warteschlange in libuv, von der niemand weiss,
   wie lang sie ist, und der Letzte bekommt nach 1,4 s eine Antwort — oder
   laeuft in eine Zeitgrenze und weiss nicht, warum.

Die theoretische Grenze aus der Aufgabenstellung — 0,5 GiB geteilt durch
19 MiB, also rund 26 — ist damit **nicht** die richtige Zahl. Gemessen sind
72 MiB Grundlast von Node allein; es blieben rund 20 Pruefungen, und ohne
Puffer fuer nginx, Anfragepuffer und den Allokator waere das zu knapp.
Der Wert 4 ist mit Absicht weit darunter: Bei 0,25 vCPU ist der Durchsatz
ohnehin durch die Rechenzeit gedeckelt, nicht durch die Plaetze.

**Fuer das Abbild** gehoert deshalb beides zusammen in den Container:
`ARGON_GLEICHZEITIG=4` und `UV_THREADPOOL_SIZE=4`. Wer eines aendert,
aendert das andere mit.

### 200 gleichzeitige Passwortanmeldungen

Gegen den echten Dienst, echtes HTTP, 200 gleichzeitige Anfragen auf
`/api/anmelden/passwort`, die Haelfte mit richtigem Passwort:

| Fall | Antworten | Gesamtdauer | Median / p95 | RSS |
|---|---|---|---|---|
| **wie im Betrieb** (Drossel an, N=4, Schlange 64) | 5×200, 5×401, **190×429** | 387 ms | 179 / 195 ms | +107 MiB |
| Drossel aus, N=4, Schlange 64 | 38×200, 38×401, **124×503** | 654 ms | 141 / 603 ms | +87 MiB |
| Drossel aus, Schlange 500 | 100×200, 100×401 | 1378 ms | 860 / 1119 ms | +90 MiB |
| ohne Schranke (N=200) | 100×200, 100×401 | 1382 ms | 845 / 1366 ms | +85 MiB |

Im Betrieb greift also **die Drossel zuerst**, nicht die Schranke — 190 von
200 Anfragen bekommen `429` mit `Retry-After: 60`, weil sie alle dieselbe
Adresse betreffen (10 Versuche je 10 Minuten). Die Schranke ist die zweite
Reihe fuer den Fall, dass die 200 Anfragen 200 **verschiedene** Adressen
betreffen; dann greift die Achse „Netz" oder „global", und was noch
durchkommt, laeuft in die Warteschlange.

Der Container faellt in keinem der vier Faelle. Auch nicht im letzten.

---

## Was die Antworten sagen

Der Dienst gibt **maschinenlesbare Gruende** zurueck, keine deutschen Saetze.
Das hat einen Grund, der nicht Bequemlichkeit ist: Die Webseite kann sieben
Sprachen, der Dienst keine. Ein deutscher Satz aus dem Server waere auf
`/ja/` ein Fremdkoerper. Die Uebersetzung gehoert in `assets/lib/sprache.mjs`.

| Endpunkt | Status | Rumpf |
|---|---|---|
| `POST /api/anmelden` | 204 · 429 | — |
| `POST /api/anmelden/code` | 200 · 401 · 429 | `{kontoId, neu}` / `{fehler:'code_ungueltig', grund}` |
| `POST /api/anmelden/passwort` | 200 · 401 · 429 · 503 | `{kontoId, neu}` / `{fehler:'anmeldung_fehlgeschlagen'}` |
| `POST /api/passwort/setzen` | 204 · 400 · 401 | `{fehler:'passwort_abgelehnt', gruende:[…]}` |
| `POST /api/passwort/vergessen` | 204 · 429 | — |
| `POST /api/passwort/neu` | 204 · 400 · 410 | wie oben, bzw. `{fehler:'marke_ungueltig', grund}` |
| `GET /api/konto` | 200 | `{angemeldet:false}` oder `{angemeldet:true, kontoId, adresse, bestaetigt, hatPasswort, angelegt}` |
| `POST /api/abmelden` | 204 | — |
| `POST /api/platten/abgleich` | 200 · 401 · 409 · 503 | `{stand, eintraege, serverzeit}` |
| `GET /api/platten` | 200 · 401 | dito |
| `POST /api/verlauf/abgleich` | 200 · 401 | dito |
| `GET /api/konto/ausfuhr` | 200 · 401 | Anhang `iyambae-konto.json` |
| `DELETE /api/konto` | 204 · 400 · 401 | verlangt `{bestaetigung:"loeschen"}` |
| `GET /api/leben` | 204 | ohne Sitzung, ohne Protokolleintrag |

**Gruende bei `code_ungueltig`:** `form` (keine sechs Ziffern — zaehlt nicht
gegen die fuenf Versuche), `kein_code`, `abgelaufen`, `falsch` (mit `uebrig`),
`zu_oft`.

**Gruende bei `passwort_abgelehnt`** — jeder sagt, *was* fehlt, nicht nur
*dass* etwas fehlt:

| Grund | Zusatz | Bedeutung |
|---|---|---|
| `leer` | — | nichts eingegeben |
| `zu_kurz` | `mindestens`, `fehlt` | „noch drei Zeichen" laesst sich daraus bauen |
| `zu_lang` | `hoechstens`, `zuviel` | nicht gekuerzt, sondern abgelehnt |
| `nur_wiederholung` | — | fuenfzehnmal derselbe Buchstabe |
| `nur_fortlaufend` | — | `abcdefghijklmno` |
| `enthaelt_adresse` | — | der Teil vor dem `@` steckt im Passwort |
| `bekannt_geleakt` | `funde` | steht `funde`-mal in bekannten Leaks |

Keine Komplexitaetsregeln. Kein erzwungener Wechsel. Mindestens 15 Zeichen,
bis 256 ohne Kuerzung, Unicode erlaubt, NFKC vor dem Hashen — so verlangt es
NIST SP 800-63B-4, und die Regel „mindestens ein Sonderzeichen" verlangt es
ausdruecklich **nicht**.

---

## Abhaengigkeiten

Vier, alle unvermeidlich:

| Paket | Warum es ohne nicht geht |
|---|---|
| `@azure/data-tables` | Table Storage ueber die REST-Schnittstelle mit Entra-Token selbst zu sprechen waere eine Signaturbibliothek von Hand |
| `@azure/identity` | `DefaultAzureCredential` — die verwaltete Identitaet holt sich das Token ueber einen Endpunkt, dessen Vertrag Microsoft aendern darf |
| `@azure/communication-email` | dito fuer ACS |
| `@node-rs/argon2` | Argon2id ist in Node nicht eingebaut. `crypto.scrypt` waere die Alternative ohne Abhaengigkeit — aber scrypt ist nicht das, was OWASP und NIST fuer neue Systeme empfehlen, und der Unterschied ist gerade bei GPU-Angriffen der Punkt |

**Keine weitere.** Kein Express, kein Fastify, kein Test-Werkzeug, kein
Uhrzeit-, Validierungs- oder Protokollpaket. `node:http`, `node:crypto` und
`node:test` decken alles ab, und jede Abhaengigkeit an einer Anmeldestrecke
ist eine, die man bei jeder Sicherheitsmeldung neu bewerten muss.

Zu `@node-rs/argon2` gegenueber `argon2` (node-gyp): Ersteres bringt fertige
Binaerdateien mit und braucht beim Bau keinen Compiler. Das haelt das
Container-Abbild klein und den Bau ohne Werkzeugkette.

---

## Angriff auf die eigene Arbeit

### Wo koennte jemand aus einer Antwort ableiten, ob eine Adresse existiert?

**Aus dem Rumpf: nirgends.** `/api/anmelden` und `/api/passwort/vergessen`
antworten immer 204. `/api/anmelden/passwort` antwortet immer
`{"fehler":"anmeldung_fehlgeschlagen"}`, ob das Konto fehlt, kein Passwort
hat oder das Passwort falsch ist.

**Aus der Arbeit dahinter: auch nicht**, und das ist der eigentliche Kniff.
`/api/anmelden` schaut gar nicht nach, ob es das Konto gibt: Der Code landet
in einer Partition, die nach dem **Abdruck der Adresse** heisst, nicht nach
der kontoId — und die gibt es fuer jede Adresse. Ein Schreibvorgang, eine
Mail, kein Unterschied. Das Konto entsteht erst beim Einloesen des Codes.
Dasselbe bei `/api/passwort/vergessen`: Die Marke wird immer geschrieben, und
es geht immer eine Mail hinaus — an eine Adresse ohne Konto eben die mit dem
Text „hier gibt es nichts zurueckzusetzen".

**Aus der Dauer: durch den quantisierten Zeitboden abgedeckt.** Ein fester
Boden reichte nicht — steht Table Storage unter Last, ragt die echte Arbeit
darueber hinaus und der Unterschied ist wieder da. Deshalb wird auf ein
**Vielfaches** von 250 ms aufgerundet. Gemessen ueber je 8 Anfragen: Median
mit Konto und ohne Konto unterscheiden sich um weniger als 40 ms, also weit
unter einer Stufe. Der Test steht in `test/aufzaehlung.test.mjs` und schlaegt
fehl, wenn jemand den Boden entfernt.

**Vier Stellen, an denen trotzdem etwas durchscheint** — benannt, nicht
weggeredet:

1. **Das Protokoll weiss mehr als die Antwort.** Eine gescheiterte
   Passwortanmeldung schreibt `grund:"falsch"` (Konto existiert, Passwort
   war es nicht) oder `grund:"kein_passwort"` (kein Konto, oder Konto ohne
   Passwort). Die Zeile traegt keine Adresse und keine kontoId, ist also fuer
   sich genommen kein Personenbezug — aber wer das Protokoll lesen kann und
   die Anfrage zeitlich zuordnet, weiss es. Das ist Absicht: Ohne diese
   Unterscheidung liesse sich „ich kann mich nicht anmelden" nicht klaeren.
   Lesen duerfen es die zwei Verwalter.
2. **Die Mail selbst.** Wer eine fremde Adresse eintippt, erfaehrt vom
   Dienst nichts — aber der Besitzer der Adresse bekommt Post. Das ist
   gewollt: Es ist eine Auskunft, die ihm zusteht. Es ist zugleich ein Weg,
   Fremde zu belaestigen; dagegen steht die Drossel (3 Anfragen je 30 Minuten
   je Adresse fuer „vergessen", 5 je 10 Minuten fuer „anmelden").
3. **Die Drossel je Adresse.** Ein `429` sagt: Diese Adresse wurde in den
   letzten Minuten schon angefragt. Es sagt **nicht**, ob es sie gibt — der
   Zaehler laeuft fuer jede Zeichenkette gleichermassen, und die Antwort ist
   dieselbe.
4. **Die Argon2-Schranke.** Ein `503` unter Last kommt fuer unbekannte
   Adressen genauso wie fuer bekannte, weil der Blindlauf einen echten Platz
   in der Schranke nimmt. Das ist getestet (`test/passwort.test.mjs`,
   „eine unbekannte Adresse kostet einen Platz wie eine bekannte").

### Was passiert bei 200 gleichzeitigen Passwortanmeldungen?

Gemessen, nicht geraten — die Tabelle steht oben. Kurz: Im Betrieb greift die
Drossel, 190 von 200 bekommen `429` mit `Retry-After: 60`, alles ist nach
387 ms vorbei, RSS steigt um 107 MiB. Ohne Drossel bekommen 124 ein `503`
mit `Retry-After: 1`, nach 654 ms. Der Container faellt in keinem Fall.

Der gefaehrliche Fall ist ein anderer und steht ebenfalls oben: erhoehter
`UV_THREADPOOL_SIZE` **und** aufgehobene Schranke — 1081 MiB Spitze, OOM-Kill
der Replik, und damit ist auch das Radio weg.

### Was steht im Protokoll, wenn eine Anmeldung scheitert?

Echte Zeilen, mitgeschnitten mit `lieselotte.mueller@gmx.de` und dem Passwort
`Sommer2019!`:

```json
{"zeit":"2026-08-21T04:08:30.630Z","art":"anmeldung.passwort","ergebnis":"abgelehnt","grund":"falsch"}
{"zeit":"2026-08-21T04:08:30.909Z","art":"anmeldung.passwort","ergebnis":"abgelehnt","grund":"kein_passwort"}
{"zeit":"2026-08-21T04:08:31.450Z","art":"anmeldung.code","ergebnis":"abgelehnt","grund":"falsch"}
{"zeit":"2026-08-21T04:08:32.548Z","art":"drossel","ergebnis":"gedrosselt","achse":"adresse"}
```

Zum Vergleich eine **gelungene** Anmeldung:

```json
{"zeit":"2026-08-21T04:08:30.178Z","art":"konto.angelegt","konto":"ac8ddfffa56d","ergebnis":"ok"}
{"zeit":"2026-08-21T04:08:30.178Z","art":"anmeldung.code","ergebnis":"ok","konto":"ac8ddfffa56d","dauer":1}
```

Keine Adresse, kein Passwort, kein Code, kein Sitzungswert, keine IP, kein
Sendername. Die Kontokennung steht nur dort, wo sie gilt — bei einer
gescheiterten Anmeldung ist sie **nicht** dabei, denn dann waere sie die
Antwort auf die Frage, ob es das Konto gibt.

Erzwungen wird das nicht durch Disziplin, sondern durch `protokoll.mjs`:
Alles, was nicht auf einer Erlaubnisliste steht, faellt weg — auch wenn ein
Aufrufer es mitgibt. Zusaetzlich werden erlaubte Felder auf Adressmuster und
lange Zufallsketten geprueft. Getestet in
`test/aufzaehlung.test.mjs` („das Protokoll einer gescheiterten Anmeldung
enthaelt keine Adresse").

Eine gemessene Ueberraschung dabei: Der Geheimnisfilter schwaerzte anfangs
`speicher_nur_im_arbeitsspeicher` in der eigenen Startwarnung. Ein Filter,
der die Meldung unlesbar macht, wird beim naechsten Mal abgeschaltet —
deshalb erkennt er jetzt Namen an ihren Trennzeichen. Ein durchgehender Block
aus 32 Hexzeichen bleibt geschwaerzt.

### Welcher Aufruf koennte den Container ueber 0,01 vCPU im Leerlauf halten?

**Keiner aus diesem Dienst.** Im Leerlauf laeuft hier nichts:

- **Kein Timer im Sekundentakt.** Es gibt genau zwei `setTimeout` im ganzen
  Dienst. Der eine steht im Mailversand und wird nur gesetzt, solange etwas
  in der Schlange liegt; er traegt `unref()`. Der andere ist der Zeitboden
  und laeuft nur waehrend einer Anfrage.
- **Kein Aufraeumtimer.** Der Durchgang ueber abgelaufene Sitzungen wird von
  einer echten Anfrage angestossen, hoechstens alle 24 Stunden. Kommt
  tagelang niemand, laeuft er tagelang nicht — dann liegt aber auch nichts an.
- **Kein Nachfassen bei ACS.** `beginSend` liefert einen Abfrager; auf
  `pollUntilDone` wird verzichtet, sonst waere jede Mail eine Abfrageschleife.
- **`/api/leben` ist gratis**: kein Tabellenzugriff, keine Protokollzeile.
  Es steht vor der Weiche.

Was den Leerlauf **doch** reissen wuerde, kommt von aussen und steht schon in
`main.bicep`: Die Liveness- und Readiness-Proben des `web`-Containers fragen
alle 10 bzw. 30 Sekunden `/` ab. Das ist bestehende Last und nicht diese
Datei — aber wer die Leerlaufrechnung nachrechnet, muss sie mitzaehlen. Fuer
den `konto`-Container gehoert **keine Probe** eingerichtet; die Begruendung
steht in `konto.bicep.entwurf` und ist wichtiger als die Kosten: Eine
Liveness-Probe hier kann die ganze Replik neu starten, und dann ist wegen des
Anmeldedienstes auch das Radio weg.

### Was passiert, wenn Table Storage zeitweise nicht antwortet?

1. **Wiederholt wird**, aber nur bei voruebergehenden Fehlern (500/502/503/
   504/408, `ECONNRESET`, Zeitgrenzen). Zwei Zusatzversuche nach 0,2 s und
   0,6 s — zusammen unter einer Sekunde, damit ein wackelnder Tabellendienst
   die Antwort nicht ueber die Geduld des Browsers schiebt. Ein `403` wird
   nicht wiederholt; es waere beim zweiten Mal dasselbe.
2. **Dann kommt `503` mit `Retry-After: 5`** und `{"fehler":"speicher_nicht_erreichbar"}`.

   Die **schlimmste** aller Antworten waere hier eine leere Merkliste mit
   Status 200: Der Browser hielte sie fuer die Wahrheit und schriebe sie beim
   naechsten Abgleich zurueck. Aus zwei Minuten Ausfall wuerde dauerhafter
   Datenverlust. Genau dafuer gibt es einen Test.
3. **Eine Sitzung wird bei einem Ausfall nicht als ungueltig ausgelegt.**
   `pruefeSitzung` gibt `null` nur zurueck, wenn die Zeile wirklich fehlt
   oder abgelaufen ist; ein Tabellenfehler wird durchgereicht und wird 503.
   Wer abgemeldet wuerde, weil eine Tabelle klemmt, verlaere seine Sitzung
   fuer einen Fehler, den er nicht gemacht hat.
4. **`/api/leben` antwortet weiter mit 204.** Es beweist damit nur, dass der
   Prozess laeuft — mehr soll es nicht.
5. **Beim Abgleich gehen keine Daten verloren.** Der Browser behaelt seinen
   oertlichen Stand und schickt ihn beim naechsten Mal wieder; das
   Verschmelzen ist wiederholbar, ein spaeterer Abgleich holt alles nach.
6. **Nach drei ETag-Kollisionen** kommt `409 gleichzeitig_geaendert` statt
   einer Endlosschleife. Das ist kein Serverfehler, sondern ein Aufrufer, der
   sich mit sich selbst ins Gehege kommt.

---

## Was offen bleibt

- **Der Ratenzaehler gilt je Replik.** `main.bicep` laesst bis zu drei zu;
  aus „5 Versuche je Minute" werden dann 15. Ein gemeinsamer Zaehler kostete
  einen Schreibvorgang je Anfrage und damit die Leerlaufabrechnung. Solange
  `mindestExemplare` auf 1 steht und die Last klein ist, ist es keine echte
  Luecke — sobald skaliert wird, schon.
- **`deploy/nginx.conf` nimmt in der Karte `$besucher` den ERSTEN Eintrag aus
  `X-Forwarded-For`.** Fuers Protokoll ist das eine Ungenauigkeit; als
  Drosselschluessel waere es ein Loch, denn der Browser darf die Liste selbst
  mitschicken und der Ingress haengt nur hinten an. Dieser Dienst nimmt
  deshalb den **letzten** Eintrag. Die nginx-Karte gehoert angeglichen —
  fremde Datei, nicht angefasst.
- **Die nginx- und Bicep-Bloecke aus „NOCH ZU TUN" sind nicht eingetragen.**
  Ohne sie ist `/api/` von aussen nicht erreichbar. Ebenso fehlt die
  Content-Security-Policy, die mit einer Anmeldung faellig wird.
- **Mailtexte nur auf Deutsch und Englisch.** Die Webseite kann sieben
  Sprachen. Den Katalog aus `assets/lib/sprache.mjs` hierher zu kopieren
  waere falsch — zwei Kataloge laufen auseinander. Ein gemeinsamer Katalog
  ist ein eigener Arbeitsschritt.
- **Wartende Mails ueberleben einen Neustart nicht.** Beim `SIGTERM` faellt
  die Schlange weg. Wer dann gerade einen Code angefordert hat, fordert ihn
  noch einmal an. Eine dauerhafte Schlange waere eine Tabelle und ein
  Abfragetakt — beides fuer diesen Fall zu teuer.
- **Der Hoerverlauf verschmilzt mit Maximum, nicht mit Summe.** Wer denselben
  Sender am selben Tag auf zwei Geraeten je fuenfmal hoert, sieht am Ende 5
  statt 10. Sauber loesen liesse sich das nur mit einer dauerhaften
  Geraetekennung — fuer eine Anzeige „am meisten gehoert" die falsche
  Abwaegung. Steht ausfuehrlich in `abgleich.mjs`.
- **Ein Geraet, das laenger als `GRABSTEIN_TAGE` offline war**, kann einen
  geloeschten Sender wieder mitbringen. 90 Tage sind die Abwaegung gegen
  unbegrenzt wachsende Grabsteine.
- **`konto.bicep.entwurf` skizziert `code:<abdruck>` als Zeilenschluessel;
  hier steht `code:<zweck>`.** Bewusste Abweichung: Mit dem Code im
  Schluessel findet ein falscher Code die Zeile nicht, und dann laesst sich
  der Versuchszaehler nicht fuehren. Das Praefix `code:` bleibt, damit der
  Bereichsdurchgang aus dem Entwurf weiter greift.
- **Der Speicher im Arbeitsspeicher ist kein Betriebsmodus.** Er existiert,
  damit `node --test` ohne Azure laeuft. Der Dienst warnt beim Start laut,
  wenn er ihn benutzt.
