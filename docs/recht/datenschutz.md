# Datenschutz

> **Entwurf, Stand 21.08.2026.** Alles in eckigen Klammern muss Micha ausfüllen.
> Der Abschnitt „Wenn du ein Konto anlegst" beschreibt etwas, das es **heute noch
> nicht gibt** — er darf erst online, wenn die Konten es sind. Offene Punkte:
> [HINWEISE.md](HINWEISE.md).

---

## In drei Sätzen

Wir wissen nicht, welchen Sender du hörst — das steht in keinem Protokoll, weil
die Musik direkt vom Sender zu deinem Gerät läuft und unseren Server nie
berührt. Wir zählen Seitenaufrufe mit einer gekürzten Adresse, damit wir sehen,
ob die Seite funktioniert, und wir löschen das nach 30 Tagen. Es gibt keine
Werbung, kein Tracking, keine Reichweitenmessung durch Dritte und niemanden, an
den wir etwas verkaufen.

Zwei Dinge musst du trotzdem wissen, und sie stehen unten ausführlich: Die
Schriftarten der Seite kommen von einem Google-Server, und deine IP-Adresse geht
dabei an Google (Abschnitt 4). Und wenn du einen Sender startest, verbindet sich
dein Gerät direkt mit dessen Server — oft außerhalb der EU (Abschnitt 5).

---

## 1. Wer verantwortlich ist

Verantwortlicher im Sinne von Art. 4 Nr. 7 DSGVO:

    [Vorname Nachname]
    [Straße und Hausnummer]
    [PLZ Ort], Deutschland
    [adresse@iyambae.fm]

Diese Seite wird privat betrieben, nicht von einem Unternehmen. Zwei Personen
haben Verwaltungsrechte.

**Einen Datenschutzbeauftragten gibt es nicht, und es muss auch keinen geben.**
§ 38 Abs. 1 BDSG verlangt ihn erst, wenn in der Regel mindestens 20 Personen
ständig mit automatisierter Verarbeitung beschäftigt sind, oder wenn eine
Datenschutz-Folgenabschätzung nach Art. 35 DSGVO nötig ist, oder wenn
personenbezogene Daten geschäftsmäßig zur Übermittlung verarbeitet werden.
Keiner der drei Fälle trifft hier zu.

---

## 2. Zugriffsprotokolle

**Was passiert.** Jedes Mal, wenn dein Browser eine Datei von iyambae.fm holt,
schreibt der Webserver eine Zeile ins Protokoll. Sie sieht so aus:

    Zeitpunkt          2026-08-21T14:03:11+00:00
    Adresse (gekürzt)  93.184.216.0
    Verfahren          GET
    Pfad               /de/
    Status             200
    Bytes              23887
    Verweisquelle      https://example.org/blog
    Browserkennung     Mozilla/5.0 (Macintosh; …) Safari/…
    Dauer              0.083

**Deine IP-Adresse wird gekürzt, bevor irgendetwas geschrieben wird.** Bei IPv4
fällt der letzte Block weg (`93.184.216.34` wird zu `93.184.216.0`), bei IPv6
alles hinter den ersten beiden Blöcken (`2a02:8109:…` wird zu `2a02:8109::`).
Genau dort steckt die Angabe, die auf ein einzelnes Gerät oder einen einzelnen
Anschluss zeigt. Es gibt keinen Zwischenschritt, in dem die vollständige Adresse
gespeichert wird — die Kürzung passiert in dem Moment, in dem die Zeile
entsteht. Nachschauen kannst du das selbst, die Datei ist im Quelltext:
`deploy/nginx.conf`, Abschnitt „Zugriffsprotokoll ohne Personenbezug".

**Was ausdrücklich nicht im Protokoll steht:**

- **Welchen Sender du hörst.** Der Audiostrom läuft direkt vom Sender zu deinem
  Gerät. Unser Server erfährt davon nichts, also kann er es auch nicht
  aufschreiben.
- **Wonach du suchst.** Protokolliert wird nur der Pfad, nicht der Abfrageteil
  der Adresse. Ein Suchbegriff steht im Abfrageteil.
- **Deine Merkliste, dein Hörverlauf, deine Einstellungen.** Die liegen auf
  deinem Gerät und werden nirgendwohin geschickt (Abschnitt 6).
- **Dein Name, deine Kennungen, ein Cookie-Wert.** Nichts davon ist Teil des
  Protokollformats.

**Zweck.** Die Seite betreiben und betreiben können: Fehler finden (welcher Pfad
liefert 404, welche Auslieferung ist langsam), Missbrauch erkennen, grob sehen,
ob überhaupt jemand kommt und über welchen Weg.

**Rechtsgrundlage.** Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse. Unser
Interesse ist, einen funktionierenden Dienst anzubieten und zu wissen, wenn er
nicht funktioniert. Weil die Adresse vor dem Schreiben gekürzt wird und der
Inhalt der Nutzung gar nicht erfasst wird, ist der Eingriff gering.

*Ehrlich dazugesagt:* Eine gekürzte IP-Adresse ist nicht dasselbe wie keine
IP-Adresse. In Kombination mit Zeitpunkt, Browserkennung und Verweisquelle lässt
sich in seltenen Fällen ein Bezug herstellen. Wir behaupten deshalb nicht, die
Protokolle seien anonym — wir behandeln sie als personenbezogene Daten und
wenden die DSGVO darauf an. Das ist der ehrlichere Weg.

**Empfänger.** Microsoft Ireland Operations Limited als Auftragsverarbeiterin
nach Art. 28 DSGVO. Die Seite läuft in Azure Container Apps, die Protokolle
landen in einem Log-Analytics-Arbeitsbereich desselben Kontos.

**Ort.** Region Germany West Central, also Deutschland. Kein Drittlandtransfer
bei der Speicherung. *Dazugesagt:* Bei Fernwartung durch Microsoft-Personal
außerhalb der EU sind Zugriffe nicht vollständig auszuschließen; dafür gilt der
Auftragsverarbeitungsvertrag von Microsoft mit den EU-Standardvertragsklauseln.

**Speicherdauer.** 30 Tage. Danach löscht Azure automatisch; die Einstellung
`immediatePurgeDataOn30Days` sorgt dafür, dass nach Ablauf sofort gelöscht wird
und nichts in einer Archivstufe liegen bleibt (`infra/main.bicep`).

**Was wir daraus ansehen.** Es gibt eine Auswertungsansicht mit sieben Abfragen:
Seitenaufrufe und geschätzte Besucherzahl je Tag, Abrufe der App-Beschreibung
(als Hinweis auf Installationen), Verweisquellen, Browser und Geräteart, Radio
gegen Apps-Seite, gemeldete Fehler, langsamste Auslieferungen. Mehr nicht. Was
dort ausdrücklich *nicht* steht, ist im Quelltext vermerkt (`infra/dashboard.bicep`):
welcher Sender gehört wird — „bewusst nicht gebaut".

---

## 3. Fehlerberichte

**Was passiert.** Wenn in der Seite ein Programmfehler auftritt, fragt sie dich
— erst dann, nicht vorher —, ob sie eine Fehlermeldung schicken darf. Sagst du
ja, geht ein kurzer Bericht an unseren eigenen Server. Sagst du nein, passiert
nichts, und du wirst nicht wieder gefragt.

**Was in so einem Bericht steht** (`assets/lib/fehlerbericht.mjs`):

| Feld | Inhalt | Grenze |
|---|---|---|
| Fehlertext | die Meldung des Browsers | 300 Zeichen |
| Aufrufliste | wo im Programm es passierte | 6 Zeilen, 900 Zeichen |
| Quelldatei, Zeile, Spalte | die Stelle im Programmtext | — |
| Pfad | die Seite, auf der du warst — **ohne Abfrageteil** | — |
| Fassung | welche Fassung des Katalogs geladen war | — |
| Zeitpunkt | — | — |

Der Abfrageteil wird abgeschnitten, weil dort dein Suchbegriff stehen könnte.
Nicht mitgeschickt werden: Suchbegriffe, Merkliste, Hörverhalten, Kennungen,
Inhalte von Eingabefeldern. Höchstens fünf Berichte je Sitzung, jeder Fehler nur
einmal.

**Die Protokollzeile eines Fehlerberichts enthält keine Besucheradresse** —
auch keine gekürzte. Das Format hat schlicht kein Feld dafür
(`deploy/nginx.conf`, `log_format fehlerbericht`).

**Zweck.** Fehler beheben, die wir sonst nie sehen, weil sie nur auf bestimmten
Geräten oder in bestimmten Browsern auftreten.

**Rechtsgrundlage.** Art. 6 Abs. 1 lit. a DSGVO — deine Einwilligung, gegeben
durch den Klick im Dialog. Zusätzlich § 25 Abs. 1 TDDG für das Speichern deiner
Antwort auf deinem Gerät.

**Widerruf.** Du kannst jederzeit widerrufen, mit Wirkung für die Zukunft. Die
Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt davon unberührt.
[**HIER MUSS STEHEN, WO DER SCHALTER IST — heute gibt es keinen, siehe
HINWEISE.md Punkt 5.** Ohne einfach zugänglichen Widerruf ist die Einwilligung
nach Art. 7 Abs. 3 Satz 4 DSGVO angreifbar.]

**Empfänger.** Niemand außer uns. Der Bericht geht an dieselbe Adresse, von der
die Seite kommt, und von dort ins Protokoll unseres eigenen Containers. Es gibt
keinen Fehlerdienst eines Dritten — kein Sentry, kein GlitchTip, keine
Weitergabe.

**Ort und Speicherdauer.** Wie die Zugriffsprotokolle: Germany West Central,
30 Tage, dann automatisch gelöscht.

---

## 4. Schriftarten von Google Fonts

**Das ist der Punkt, an dem wir am ehrlichsten sein müssen.**

**Was passiert.** Die Seite lädt ihre Schriften (Inter, Orbitron, JetBrains Mono;
auf der arabischen Fassung zusätzlich IBM Plex Sans Arabic und Noto Kufi Arabic)
von den Servern `fonts.googleapis.com` und `fonts.gstatic.com`. Dein Browser
baut dafür eine Verbindung zu Google auf. Das geschieht automatisch beim
Aufbauen der Seite, **bevor du irgendetwas anklicken kannst**.

**Was Google dabei erfährt:** deine **vollständige, ungekürzte IP-Adresse**, den
Zeitpunkt, deine Browserkennung, und über den Referrer-Header die Herkunft der
Anfrage (`https://iyambae.fm`). Welchen Sender du hörst, erfährt Google nicht.
Was Google mit diesen Angaben tut, entzieht sich unserer Kenntnis und unserem
Einfluss.

**Google LLC sitzt in den USA** — einem Drittland im Sinne von Kapitel V DSGVO.
Für die USA besteht seit dem 10.07.2023 ein Angemessenheitsbeschluss der
Europäischen Kommission (EU-US Data Privacy Framework), auf den sich zertifizierte
Unternehmen berufen können. Dieser Beschluss ist Gegenstand laufender rechtlicher
Auseinandersetzungen; ob er dauerhaft Bestand hat, ist offen.

**Die Rechtslage in Deutschland, unverblümt.** Das Landgericht München I hat am
20.01.2022 entschieden (Az. 3 O 17493/20): Wer Google Fonts dynamisch einbindet,
also von Googles Servern nachlädt, ohne die Einwilligung des Besuchers
einzuholen, verletzt dessen Persönlichkeitsrecht. Das Gericht sprach dem Kläger
100 Euro Schadensersatz zu und verurteilte den Seitenbetreiber zur Unterlassung.
Das Urteil ist eine erstinstanzliche Einzelfallentscheidung und keine höchstrichterliche
Klärung — es hat aber eine Welle von Abmahn- und Zahlungsaufforderungsschreiben
ausgelöst und gilt seither als der Bezugspunkt für diese Frage.

**Auf welche Rechtsgrundlage wir uns heute stützen.** Bis die Schriften örtlich
ausgeliefert werden (siehe Kasten), lautet die ehrliche Antwort: Art. 6 Abs. 1
lit. f DSGVO, berechtigtes Interesse an einer einheitlichen Darstellung in sieben
Sprachen und zwei Schriftsystemen. **Diese Begründung ist angreifbar**, und wir
schreiben es lieber selbst hin, als so zu tun, als wäre die Frage entschieden:
Das LG München I hat in einem vergleichbaren Fall gerade nicht auf lit. f
abgestellt, sondern eine Einwilligung verlangt. Wer das Risiko nicht tragen will,
hat nur eine saubere Lösung, und die steht hier:

> ### ⚠ EMPFEHLUNG AN DEN BETREIBER
>
> **Die Schriften selbst ausliefern. Nicht die Einwilligung einholen — die
> Schriften umziehen.**
>
> Es gibt drei Wege, und nur einer ist gut:
>
> 1. **Selbst hosten (empfohlen).** Die fünf Schriftfamilien als `.woff2` nach
>    `assets/fonts/` legen, die `@font-face`-Regeln in `assets/styles.css`
>    schreiben und die drei Zeilen mit `fonts.googleapis.com` aus `index.html`
>    entfernen (Zeilen 11, 12, 13 und 20). Damit ist der Abfluss weg — nicht
>    verringert, nicht rechtfertigbar gemacht, sondern weg. Es gibt dann keinen
>    Drittlandtransfer, keinen Einwilligungsdialog, keinen Absatz in diesem
>    Dokument und keine Angriffsfläche.
>
>    **Was dabei zusätzlich in Ordnung kommt:**
>    - nginx kennt den MIME-Typ `font/woff2` bereits (`deploy/nginx.conf`,
>      `types`-Block) — es ist nichts zu konfigurieren.
>    - Der Service Worker braucht seine Sonderbehandlung für fremde Herkünfte
>      nicht mehr (`sw.js`, `istSchriftart` und der
>      `stale-while-revalidate`-Zweig am Ende). Ein Zweig weniger.
>    - Die Content-Security-Policy, die spätestens mit dem Konto nötig wird
>      (vermerkt in `infra/konto.bicep.entwurf`, „NOCH ZU TUN", Punkt 2), wird
>      deutlich strenger und einfacher: kein `style-src https://fonts.googleapis.com`,
>      kein `font-src https://fonts.gstatic.com`.
>    - Die Seite wird schneller. Zwei DNS-Auflösungen, zwei TLS-Handshakes und
>      zwei Verbindungen zu einem fremden Host fallen weg. Die `preconnect`-Zeilen
>      in `index.html` sind da, weil dieser Umweg Zeit kostet.
>
>    **Der Preis, ehrlich:** Die Schriftdateien liegen dann im Repository und im
>    Container-Abbild und müssen von Hand aktualisiert werden, wenn eine neue
>    Fassung erscheint. Bei den fünf genannten Familien ist das ein Vorgang alle
>    paar Jahre. **Lizenzen prüfen**: Inter, Orbitron, JetBrains Mono, IBM Plex
>    Sans Arabic und Noto Kufi Arabic stehen — nach Angabe ihrer jeweiligen
>    Anbieter — unter der SIL Open Font License bzw. der Apache-Lizenz, die das
>    Selbsthosten ausdrücklich erlauben. Die Lizenzdatei gehört mit ins
>    Repository. Vor dem Umzug je Schrift einmal nachlesen.
>
> 2. **Einwilligungsdialog vor dem Laden der Schriften.** Rechtlich vertretbar,
>    praktisch schlecht: Es bräuchte ein Banner, das *vor* dem ersten Aufbau der
>    Seite erscheint — genau das, was diese Seite an keiner anderen Stelle tut.
>    Und die Seite müsste ohne die Schriften funktionieren und aussehen, für
>    jeden, der ablehnt. Doppelte Arbeit für ein schlechteres Ergebnis.
>
> 3. **So lassen und hoffen.** Das ist die Lage von heute. Sie ist beschreibbar,
>    wie hier geschehen, aber sie bleibt ein bekanntes, benanntes, vermeidbares
>    Risiko. Solange sie besteht, muss dieser Abschnitt genau so stehen bleiben,
>    wie er dasteht.
>
> **Empfehlung: Weg 1, und zwar vor dem Livegang.** Der Aufwand liegt bei einer
> knappen Stunde. Danach kann dieser ganze Abschnitt aus dem Dokument
> verschwinden, und das ist der beste Datenschutzhinweis: einer, der kürzer wird.

**Wenn du die Seite installiert hast.** Der Service Worker legt die Schriftdateien
nach dem ersten Abruf in einem Zwischenspeicher auf deinem Gerät ab und erneuert
sie im Hintergrund (`sw.js`). Der **erste** Abruf geht in jedem Fall an Google.

---

## 5. Die Audioströme — dein Gerät spricht direkt mit dem Sender

**Was passiert.** Wenn du einen Sender startest, verbindet sich dein Browser
**unmittelbar** mit dem Server dieses Senders. Die Musik läuft nicht über unseren
Server. Wir schalten uns nicht dazwischen, wir leiten nicht weiter, wir speichern
nichts davon.

Das hat zwei Seiten, und beide gehören hierher:

**Die gute Seite:** Wir wissen nicht, was du hörst. Wir können es nicht wissen.
Es gibt keine Protokollzeile, keine Datenbank und keine Auswertung dazu, weil die
Anfrage unseren Server nie erreicht. Das ist kein Versprechen, das man uns
glauben muss — es folgt aus dem Aufbau.

**Die Seite, die du kennen musst:** Der Sender sieht dich. Beim Abspielen erfährt
sein Server:

- deine **vollständige IP-Adresse** — ungekürzt, wir können daran nichts ändern,
- deine Browserkennung und die Fähigkeiten deines Geräts,
- Zeitpunkt und Dauer des Zuhörens,
- in der Regel, dass du von `https://iyambae.fm` kommst. (Die Seite setzt
  `Referrer-Policy: strict-origin-when-cross-origin`, siehe `deploy/nginx.conf`:
  Übermittelt wird nur die Herkunft, nicht die vollständige Adresse mit deinem
  Suchbegriff.)

Was der Sender damit macht, richtet sich nach **seinen** Datenschutzhinweisen,
nicht nach unseren. Manche Sender werten Hörerzahlen aus, manche nicht, manche
setzen eigene Analysewerkzeuge ein. Wir haben darauf keinen Einfluss und keine
Einsicht.

**Wo diese Sender stehen.** Der Katalog umfasst 129 Sender aus 29 Ländern.
41 stehen in den USA, 16 in Deutschland, 12 in Japan, 11 im Vereinigten
Königreich, 8 in Frankreich, 6 in Russland; die übrigen verteilen sich auf
Spanien, Italien, die Schweiz, Österreich, Mexiko, Peru, Finnland, Belgien,
Kroatien, die Ukraine, Rumänien, Griechenland, Südkorea, Kolumbien, Venezuela,
Bolivien, Kanada, Ghana, Nigeria, Marokko, Aserbaidschan, die Türkei und den
Senegal. **Die Mehrzahl liegt außerhalb der EU.** Bei jedem Sender steht das Land
am Kärtchen — du siehst vor dem Klick, wohin die Verbindung geht.

Alle Ströme im Katalog laufen über HTTPS; die Verbindung ist also verschlüsselt.
Das schützt den Inhalt der Verbindung, nicht die Tatsache, dass sie zustande
kommt.

**Zweck.** Musik abspielen. Genau das, wozu du auf die Seite gekommen bist.

**Rechtsgrundlage.** Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse ist
es, Radio hörbar zu machen; deines, es zu hören. Die Verbindung entsteht erst,
wenn du einen Sender anklickst — nie vorher, nie automatisch.

**Zum Drittlandtransfer, ohne Beschönigung.** Für diese Verbindungen können wir
keine Garantien nach Art. 46 DSGVO vorlegen. Wir haben mit keinem der Sender
einen Vertrag; wir zeigen dir öffentlich zugängliche Adressen, die dein Browser
aufruft. Ob Kapitel V DSGVO auf eine Verbindung anzuwenden ist, die dein eigenes
Gerät auf deinen eigenen Klick hin aufbaut, ist eine ungeklärte Rechtsfrage. Wir
erfinden dazu keine Antwort. Was wir tun können, tun wir: dir vorher sagen, was
passiert, und dir das Land des Senders anzeigen.

**Technisch unvermeidbar.** Der einzige Weg, den direkten Kontakt zu verhindern,
wäre, jeden Strom über unseren Server zu leiten. Das würde bedeuten: Wir sähen
dann, wer wann was hört — genau die Angabe, die es heute nirgends gibt. Der
Schutz vor dem Sender wäre mit einer vollständigen Hörhistorie bei uns bezahlt.
Wir halten den jetzigen Zustand für den besseren, und du sollst wissen, warum.

**Speicherdauer bei uns:** keine, weil bei uns nichts entsteht.

---

## 6. Was auf deinem Gerät gespeichert wird

Fast alles, was diese Seite über dich „weiß", liegt auf deinem Gerät und geht
nirgendwohin.

### Örtlicher Speicher (localStorage)

| Schlüssel | Inhalt |
|---|---|
| `hz_favoriten` | deine gemerkten Sender |
| `hz_zuletzt` | die letzten 20 gehörten Sender |
| `hz_gehoert` | wie oft du welchen Sender gestartet hast |
| `hz_fehlschlaege` | welche Sender nicht ansprangen (ab dem dritten Mal rutscht ein Sender ans Regalende) |
| `hz_lautstaerke` | die Stellung des Reglers |
| `hz_pitch432` | ob die Umstimmung im Browser an ist |
| `hz_myretuner`, `hz_mr_zustand` | ob MyRetuner erkannt wurde und wie du auf die Frage geantwortet hast |
| `hz_fehlerbericht` | deine Antwort auf die Fehlerbericht-Frage |
| `hz_sprache` | deine gewählte Sprache |

Diese Angaben werden **nicht** an uns übertragen. Solange du kein Konto hast,
verlassen sie dein Gerät nicht. Du löschst sie, indem du in deinem Browser die
Websitedaten für iyambae.fm löschst.

### Ein Cookie

Genau eines: `hz_sprache`, mit dem Sprachkürzel als Inhalt (`de`, `en`, `fr`,
`es`, `it`, `ja`, `ar`), einer Laufzeit von einem Jahr und `SameSite=Lax`. Es
muss ein Cookie sein und kann kein Eintrag im örtlichen Speicher sein, weil der
Server es lesen können muss: Wer `iyambae.fm` ohne Sprachpfad aufruft, wird
anhand dieses Cookies auf die richtige Sprachfassung geleitet. Es enthält keine
Kennung, keine Nummer und nichts, woran man dich wiedererkennen könnte —
nur zwei Buchstaben. Es dient keiner Analyse und keiner Werbung.

### Der Service Worker

Wenn du die Seite besuchst, richtet dein Browser einen Service Worker ein
(`sw.js`). Er legt die Seite selbst auf deinem Gerät ab — Sprachseiten,
Programmdateien, Symbole, Sendlogos, die Senderliste —, damit sie ohne Netz
funktioniert und schneller startet. Dazu kommen die Schriftdateien von Google
(Abschnitt 4).

**Die Audioströme fängt er ausdrücklich nicht ab und speichert er nicht.** Es
liegt keine Musik in diesem Zwischenspeicher, und es liegt nichts darin, was auf
dich zeigt. Du wirst ihn los, indem du die Websitedaten löschst oder die App
deinstallierst.

**Rechtsgrundlage für all das.** § 25 Abs. 2 Nr. 2 TDDG: Speichern und Auslesen
sind unbedingt erforderlich, damit der von dir ausdrücklich gewünschte Dienst
funktioniert — eine Merkliste ohne Speicher ist keine Merkliste, ein Sprachwähler,
der die Sprache vergisst, ist keiner, und eine App, die offline laufen soll, muss
etwas zwischenspeichern. Deshalb gibt es hier auch **kein Cookie-Banner**: Es
gäbe nichts, wozu wir dich fragen müssten. Für den einen Fall, in dem es etwas zu
fragen gibt — den Fehlerbericht —, wird gefragt, und zwar erst dann, wenn er
eintritt.

Soweit in diesen Angaben personenbezogene Daten liegen, ist die Rechtsgrundlage
für die Verarbeitung Art. 6 Abs. 1 lit. f DSGVO — mit dem Zusatz, dass wir sie
nicht sehen.

---

## 7. Die Abfrage an deinen eigenen Rechner (MyRetuner)

**Was passiert.** MyRetuner ist ein Programm für macOS, das die Systemwiedergabe
in Echtzeit umstimmt. Läuft es, kann diese Seite ihre eigene, ungenauere
Umstimmung abschalten und MyRetuner das Feld überlassen. Um das zu erkennen,
fragt die Seite eine Adresse auf **deinem eigenen Rechner** ab:
`http://127.0.0.1:47432/status`, mit einer halben Sekunde Zeitlimit.

`127.0.0.1` ist dein Gerät selbst. Diese Anfrage verlässt deinen Rechner nicht.
Sie geht nicht ins Internet, nicht an uns, an niemanden.

**Wann sie stattfindet.** Nur, wenn du vorher auf „Ich habe MyRetuner" geklickt
hast und die Abfrage einmal erfolgreich war. Ist das der Fall, wird beim Laden
der Seite und danach alle fünf Sekunden nachgefragt, solange Musik läuft — damit
die Anzeige stimmt, auch wenn du MyRetuner zwischendurch beendest. Hast du nicht
geklickt oder abgelehnt, wird **nicht** gefragt. Deine Antwort steht in
`hz_mr_zustand` auf deinem Gerät.

Ein Browser kann nicht von sich aus sehen, welche Programme auf deinem Rechner
laufen — das wäre eine Sicherheitslücke. Deshalb dieser Umweg: Die App muss sich
melden, und du musst das beiden Seiten erlauben — erst dem Browser, dann der App
selbst, die noch einmal nachfragt.

**Was die Seite dabei erfährt.** Ob MyRetuner läuft, die eingestellte Zielstimmung
(etwa „432" oder „528"), die gemessene Ausgangsstimmung des laufenden Stücks und
wie sicher die App bei dieser Messung ist. Mehr gibt die App nicht heraus.

**Was damit geschieht.** Es wird auf der Seite angezeigt und beeinflusst, ob die
Seite selbst umstimmt. **Nichts davon wird an unseren Server geschickt.** Die
einzige Spur ist der Zustand in deinem örtlichen Speicher.

**Rechtsgrundlage.** Art. 6 Abs. 1 lit. a DSGVO für den Klick, mit dem du das
freischaltest, und § 25 Abs. 1 TDDG für den Zugriff auf Informationen in deinem
Endgerät. Zurücknehmen kannst du es, indem du MyRetuner beendest oder die
Websitedaten für iyambae.fm löschst. [Ein Schalter dafür in den Einstellungen
wäre der bessere Weg — siehe HINWEISE.md, Punkt 6.]

**Empfänger, Drittland, Speicherdauer:** keine, keins, keine. Es verlässt dein
Gerät nicht.

---

## 8. Die Sprachweiche

Rufst du `iyambae.fm` ohne Sprachpfad auf, liest der Server den ersten Eintrag
deiner Browsereinstellung `Accept-Language` und leitet dich auf die passende
Sprachfassung weiter — oder auf die, die im Cookie `hz_sprache` steht, falls du
schon einmal gewählt hast. Der gelesene Wert wird für die Weiterleitung benutzt
und nicht gespeichert; im Protokoll steht er nicht. Rechtsgrundlage: Art. 6
Abs. 1 lit. f DSGVO.

Umgeleitet wird nur von der Wurzeladresse. Rufst du `/en/` auf, bekommst du
Englisch — auch mit deutschem Browser.

---

## 9. Wenn du ein Konto anlegst

> **Dieser Abschnitt beschreibt eine geplante Funktion.** Solange es auf
> iyambae.fm keine Anmeldung gibt, gilt er nicht. Er steht hier, damit er fertig
> ist, wenn es so weit ist — und damit du vorher lesen kannst, worauf du dich
> einlässt.

Ein Konto brauchst du für nichts, was die Seite heute kann. Es gibt es nur für
eine Sache: damit deine Merkliste und dein Hörverlauf auf deinem Telefon und
deinem Rechner dieselben sind.

### Was gespeichert wird

| Was | Wann |
|---|---|
| Kontonummer (eine Zufallskennung) | immer |
| E-Mail-Adresse | bei Anmeldung mit E-Mail |
| Passwort — **nur als Hash**, nie im Klartext | bei Anmeldung mit Passwort |
| Kennung von Google bzw. Apple (`sub`) | bei Anmeldung über Google oder Apple |
| Öffentlicher Schlüssel und Zähler deines Passkeys | bei Anmeldung mit Passkey |
| Merkliste | wenn du Sender merkst |
| Hörverlauf: welche Sender wie oft, was zuletzt | wenn du hörst |
| Datum des Anlegens und des letzten Besuchs — **nur das Datum, nicht die Uhrzeit** | immer |
| Angemeldete Sitzungen: **nur ein SHA-256-Abdruck** des Sitzungswerts, mit Ablaufdatum | solange du angemeldet bist |
| Einmalcodes: ebenfalls nur als Abdruck, mit Ablaufdatum | beim Anmelden per Mail |

**Mit einem Konto wissen wir dann doch, was du hörst.** Das ist der Preis für den
Abgleich zwischen deinen Geräten, und es ist der ehrlichste Satz in diesem
Abschnitt. Ohne Konto steht das nirgends; mit Konto steht es in einer Tabelle in
Deutschland, weil es sonst nicht auf zwei Geräten sein kann. Du entscheidest.

**Wie der Verweis von deiner Adresse auf dein Konto funktioniert.** In der
Zuordnungstabelle steht die E-Mail-Adresse **nicht** im Klartext, sondern nur ihr
SHA-256-Abdruck. Wer diese Tabelle liest, kann nicht nach Adressen durchsuchen,
ohne sie schon zu kennen. Die Adresse selbst muss in der Kontotabelle im Klartext
liegen — anders lässt sich kein Bestätigungscode zustellen. Verschlüsseln wäre
Theater, weil der Dienst den Schlüssel ohnehin halten müsste.

### Zweck und Rechtsgrundlage

**Zweck:** dein Konto führen, dich anmelden, Merkliste und Verlauf zwischen
deinen Geräten abgleichen.

**Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO** — Erfüllung des
Nutzungsvertrags, den du mit dem Anlegen des Kontos schließt. **Keine
Einwilligung.** Das ist Absicht und kein Zufall: Eine Einwilligung wäre jederzeit
frei widerruflich, und ein widerrufenes Konto wäre ein Konto, das seine eigene
Funktion nicht mehr erfüllen darf. Was du stattdessen hast, ist besser: Du kannst
das Konto jederzeit löschen, und dann ist es weg (siehe unten).

Für Sicherheitsmaßnahmen rund um die Anmeldung — Begrenzung der Anmeldeversuche
je Adresse, Erkennen von Missbrauch — ist die Rechtsgrundlage Art. 6 Abs. 1 lit. f
DSGVO.

### Wo die Daten liegen

In Azure Table Storage, Region **Germany West Central**, dreifach in **einem**
Rechenzentrum gespiegelt (`Standard_LRS`). Bewusst keine geografisch verteilte
Spiegelung: Die brächte eine zweite Kopie deiner Daten an einem zweiten Ort, und
dafür gibt es bei einer Merkliste keinen guten Grund.

**Auftragsverarbeiterin** ist Microsoft Ireland Operations Limited nach Art. 28
DSGVO.

### E-Mails

Bestätigungsmails und Anmeldecodes verschickt Azure Communication Services von
`konto@mail.iyambae.fm`. Die Datenhaltung dieses Dienstes ist auf die Geografie
**Deutschland** eingestellt.

**Dazugesagt, weil es zur Wahrheit gehört:** Microsoft sagt für diesen Dienst zu,
dass ruhende Daten in der gewählten Geografie bleiben; Daten könnten aber „in
anderen Geografien übertragen oder verarbeitet werden". Die Zusage betrifft also
die Ruhelage, nicht jeden Verarbeitungsschritt. Wir schreiben das hin, statt
„Ihre Daten bleiben in Deutschland" zu behaupten.

**Kein Öffnungs- und kein Klick-Tracking.** In unseren Mails stecken keine
Zählpixel und keine umgeschriebenen Verweise; die entsprechende Einstellung ist
abgeschaltet (`userEngagementTracking: 'Disabled'`). Ob eine Mail ankam, sagt der
Zustellbericht; ob sie gewirkt hat, sagt die Anmeldung selbst.

### Anmeldung über Google oder Apple

Wenn du diesen Weg wählst, erfährt der jeweilige Anbieter, dass du dich bei
iyambae.fm anmeldest. Wir erhalten von dort eine dauerhafte Kennung und, je nach
Verfahren, deine E-Mail-Adresse. Google LLC und Apple Inc. sitzen in den USA;
es gilt das zu Abschnitt 4 Gesagte zum Angemessenheitsbeschluss vom 10.07.2023.
Für die Verarbeitung bei diesen Anbietern gelten deren eigene
Datenschutzhinweise. **Wenn du das nicht willst, nimm E-Mail und Passwort oder
einen Passkey** — beides funktioniert ohne jeden Dritten. [Vor dem Livegang: die
Zertifizierung beider Anbieter prüfen und hier verlinken — HINWEISE.md, Punkt 9.]

### Wer die Daten sehen kann

Zwei Personen mit Verwaltungsrechten. Sie haben **Leserechte**, keine
Schreibrechte — ausdrücklich so eingerichtet: Wer schreiben darf, könnte fremde
Merklisten verändern; zum Nachsehen, ob ein gemeldetes Problem echt ist, reicht
Lesen.

**Auch Lesen heißt: jede Merkliste, jede Adresse und jeden Hörverlauf einsehen zu
können.** Das ist kein technischer Mangel, sondern eine Befugnis, und sie gehört
benannt. Genau deshalb haben sie zwei Personen und nicht drei.

### Speicherdauer und Löschung

- **Sitzungen und Einmalcodes** tragen ein Ablaufdatum und werden weggeräumt,
  sobald sie abgelaufen sind — beim nächsten Zugriff, und zusätzlich durch einen
  Durchgang alle 24 Stunden, damit auch die Sitzung eines Menschen verschwindet,
  der nicht wiederkommt.
- **Das Konto selbst** bleibt, bis du es löschst. Es gibt eine Löschfunktion in
  der App; sie entfernt in einem Vorgang alles: Merkliste, Verlauf, Sitzungen,
  Kennungen und den Eintrag in der Zuordnungstabelle. Alle Daten eines Kontos
  liegen zu diesem Zweck in einer einzigen Partition — damit kein Rest
  liegenbleibt, den später niemand mehr findet.
- **[Frist für inaktive Konten: noch festzulegen — HINWEISE.md, Punkt 10.]**
- **[Was nach dem Löschen wie lange als „Grabstein" bestehen bleibt: noch zu
  klären — HINWEISE.md, Punkt 11.]**

---

## 10. Was hier nicht passiert

Damit es einmal in einer Liste steht:

- **Keine Werbung.** Kein Werbenetzwerk, kein Werbeplatz, keine Verkaufsdaten.
- **Kein Tracking über Seiten hinweg.** Keine Zählpixel, keine Wiedererkennungs-
  merkmale, kein Fingerprinting.
- **Keine Reichweitenmessung durch Dritte.** Kein Google Analytics, kein Matomo,
  kein Plausible, kein sonstiger Dienst.
- **Kein Profiling und keine automatisierte Entscheidungsfindung** im Sinne von
  Art. 22 DSGVO. Die Gewichtung, mit der die Auslage Sender vorschlägt, läuft in
  deinem Browser aus deinen eigenen Daten und hat keine rechtliche Wirkung.
- **Kein Verkauf und keine Weitergabe** von Daten an Dritte zu deren eigenen
  Zwecken.
- **Keine Aufzeichnung, welcher Sender gehört wird** — solange du kein Konto
  hast. Mit Konto siehe Abschnitt 9.
- **Kein Cookie-Banner**, weil es nichts gibt, wozu wir dich fragen müssten
  (Abschnitt 6).

---

## 11. Deine Rechte

Du hast uns gegenüber die folgenden Rechte. Alle kosten nichts, und für alle
reicht eine formlose Nachricht an [adresse@iyambae.fm].

- **Auskunft** (Art. 15 DSGVO): Wir sagen dir, welche Daten wir über dich
  gespeichert haben.
- **Berichtigung** (Art. 16 DSGVO): Ist etwas falsch, korrigieren wir es.
- **Löschung** (Art. 17 DSGVO): Wir löschen, was wir nicht mehr brauchen dürfen.
- **Einschränkung der Verarbeitung** (Art. 18 DSGVO).
- **Datenübertragbarkeit** (Art. 20 DSGVO): Deine Kontodaten bekommst du in einem
  maschinenlesbaren Format.
- **Widerspruch** (Art. 21 DSGVO): Gegen jede Verarbeitung, die auf Art. 6 Abs. 1
  lit. f gestützt ist — also Zugriffsprotokolle, Schriftauslieferung, das Starten
  von Audioströmen — kannst du aus Gründen, die sich aus deiner besonderen
  Situation ergeben, Widerspruch einlegen.
- **Widerruf einer Einwilligung** (Art. 7 Abs. 3 DSGVO): jederzeit, mit Wirkung
  für die Zukunft. Betrifft die Fehlerberichte und die MyRetuner-Abfrage.

**Bei den Rechten gibt es eine ehrliche Grenze.** Für die Zugriffsprotokolle
können wir dir kaum Auskunft geben — wir wissen nicht, welche der gekürzten
Adressen deine war, und wir dürfen und wollen es nicht herausfinden. Art. 11
Abs. 2 DSGVO sieht genau diesen Fall vor: Wo eine Zuordnung nicht möglich ist,
müssen wir sie nicht herstellen, nur um Auskunft geben zu können. Wenn du
Auskunft willst, teil uns mit, wann du die Seite besucht hast; mehr als eine
grobe Prüfung wird daraus aber nicht.

**Beschwerderecht** (Art. 77 DSGVO): Du kannst dich bei einer
Datenschutz-Aufsichtsbehörde beschweren, insbesondere bei der Behörde deines
gewöhnlichen Aufenthaltsorts, deines Arbeitsplatzes oder des Orts des
mutmaßlichen Verstoßes. Für uns zuständig ist:

    [Aufsichtsbehörde des Bundeslandes des Betreibers — Name, Anschrift, Website]

---

## 12. Änderungen an diesem Hinweis

Ändert sich, was die Seite tut, ändert sich dieser Text. Die jeweils geltende
Fassung steht immer hier. Wesentliche Änderungen — etwa der Start der Konten —
kündigen wir auf der Seite an.

**Stand: [Datum des Livegangs].**
