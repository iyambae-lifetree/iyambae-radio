# Was vor dem Livegang zu tun ist

Diese Datei ist die Übergabe. Sie sagt, was noch fehlt, warum es fehlt, und an
welchen Stellen ich mich auf eine Einschätzung beschränke, statt eine Antwort zu
behaupten.

Die drei Entwürfe daneben — `impressum.md`, `datenschutz.md`,
`verarbeitungsverzeichnis.md` — sind vollständig lesbar, aber sie enthalten
Platzhalter in eckigen Klammern. Solange auch nur einer davon offen ist, darf
nichts davon online.

> **Stand 21.08.2026, zweite Fassung.** Die erste ging von einer deutschen
> Privatperson als Betreiber aus. Betreiberin ist eine Gesellschaft in Wyoming
> mit einem EU-Vertreter auf Malta. Das war kein Suchen-und-Ersetzen: Es ändert
> die Begründung der Impressumspflicht, die Frage nach dem
> Datenschutzbeauftragten, die Frage nach der zuständigen Aufsichtsbehörde, den
> gesamten Umgang mit Kapitel V DSGVO und — indirekt, aber spürbar — die
> urheberrechtlichen Fragen in Teil D. Dazu ist mit der Reichweitenmessung eine
> Verarbeitung hinzugekommen, deren Gegenteil vorher an drei Stellen im Text
> stand.
>
> **Nachtrag vom selben Tag:** Die drei Bedingungen, unter denen Punkt 13 die
> Reichweitenmessung für tragfähig hielt, sind gebaut — Adressfeld weg,
> Sprachkürzel aus dem Pfad statt aus dem Cookie, Trefferzahl bei „gemerkte"
> weg. Punkte 13 und 15 sind entsprechend umgeschrieben; was von ihnen übrig
> ist, steht dort. Neu dazugekommen sind fünf Stellen im Programmtext, die den
> alten Stand noch behaupten — Punkt 25.

---

## Teil A — Muss erledigt sein, bevor die Seite live geht

### 1. Bestätigen, dass iyambae.fm wirklich ein Angebot dieser Gesellschaft ist

**Das ist der erste Punkt, weil alles andere davon abhängt.** Die Angaben, auf
die alle drei Texte jetzt umgeschrieben sind, stammen aus dem Impressum von
`ts-treppenlifte.de` — einer Treppenlift-Vermittlung. Ein Webradio unter
derselben Gesellschaft ist ohne weiteres möglich. Aber es ist eine Entscheidung,
und sie wurde bisher nirgends getroffen, sondern nur aus einer vorhandenen
Datenquelle übernommen.

**Was daran hängt — jeder Punkt einzeln nachprüfbar:**

- **Der Datenschutzbeauftragte.** Die Schwellen des § 38 Abs. 1 BDSG gelten für die Gesellschaft insgesamt, nicht für eine Website. Eine Vermittlungsplattform, die Kundenanfragen an Partnerbetriebe weitergibt, verarbeitet personenbezogene Daten möglicherweise „geschäftsmäßig zum Zweck der Übermittlung" — das löst nach § 38 Abs. 1 Satz 2 BDSG die Pflicht zum Datenschutzbeauftragten unabhängig von der Beschäftigtenzahl aus. Wenn das zutrifft, braucht **auch iyambae.fm** einen benannten Datenschutzbeauftragten in der Datenschutzerklärung. Siehe Punkt 9.
- **Die 250er-Grenze in Art. 30 Abs. 5 DSGVO** wird ebenfalls über die Gesellschaft gemessen. Am Ergebnis ändert das nichts (siehe Verzeichnis), aber die Begründung musste umgeschrieben werden.
- **Eine Datenpanne betrifft dieselbe Verantwortliche.** Ein Vorfall bei der einen Website ist ein Vorfall dieser Gesellschaft, mit allem, was Art. 33 DSGVO daran knüpft. Umgekehrt genauso.
- **Die Kontaktangaben sind gemeinsam.** `hello@infosys-consult.com` und die 0800-Nummer sind die Wege der Treppenlift-Vermittlung. Wer dort wegen eines toten Streams anruft, landet bei einer Service-Hotline für Treppenlifte. Das ist kein Rechtsmangel, aber es ist auch nicht das, was jemand erwartet.
- **Die urheberrechtlichen Fragen in Teil D werden schwerer.** Für die Übernahme fremder Senderlogos und die Einbettung fremder Streams gab es das Argument der nichtkommerziellen, identifizierenden Verwendung. Bei einer gewerblich tätigen Gesellschaft trägt dieses Argument weniger weit. Das ist die unangenehmste Folge des Wechsels, und sie steht in keinem Datenschutzdokument.
- **Steuerlich.** Ein US-Unternehmen, das digitale Dienste an Verbraucher in der EU erbringt, kann umsatzsteuerpflichtig werden, sobald etwas Geld kostet. Heute kostet nichts. Siehe Punkt 19.

**Zu tun:** Micha bestätigt — oder benennt eine andere Gesellschaft oder Person.
**Erst danach lohnt es sich, die übrigen Punkte abzuarbeiten**, denn ein Teil von
ihnen fällt bei einer anderen Antwort weg.

### 2. Die Rechtstexte als Seiten ausliefern — **erledigt am 21.08.2026**

**Was gebaut wurde:** `Scripts/baue-recht.py` erzeugt aus den Markdown-Dateien
die Seiten `/recht/impressum/`, `/recht/datenschutz/` und
`/recht/verarbeitungsverzeichnis/`. Sie tragen `noindex, follow`, sind aus der
Fußzeile aller sieben Sprachseiten verlinkt, und der Verweis trägt
`hreflang="de"`. `HINWEISE.md` wird bewusst nicht ausgeliefert — diese Datei ist
eine Arbeitsliste, kein Rechtstext.

**Was noch offen ist:**

- **`apps.iyambae.fm` hat weiterhin keine Rechtsverweise.** Eigener Hostname,
  eigener Dokumentenstamm (`/srv/apps`), eigenes Telemedium, eigene Pflicht.
  Zwei Verweise in der Fußzeile von `apps/index.html` genügen — sie dürfen auf
  `https://iyambae.fm/recht/…` zeigen.
- **Soll das Verarbeitungsverzeichnis wirklich öffentlich stehen?** Siehe
  Punkt 23. Die Antwort ist mit dem Betreiberwechsel eindeutiger geworden.
- **Kleinigkeit:** Sollen die Rechtsseiten offline verfügbar sein, gehören sie
  in `SHELL_FILES` in `sw.js`, und dann muss `SW_VERSION` hoch.

### 3. Eine vertretungsberechtigte Person namentlich benennen

**Das ist der greifbarste Mangel in den gelieferten Angaben.** Im Impressum der
Schwesterseite steht: „Vertretungsberechtigt: Das Management der Infosys
Consulting LLC". Das benennt niemanden.

**Warum das nicht reicht:** § 5 Abs. 1 Nr. 1 DDG verlangt bei juristischen
Personen zusätzlich zu Name und Anschrift „die Vertretungsberechtigten". Gemeint
sind Menschen mit Namen — dieselbe Angabe, die bei einer GmbH den
Geschäftsführer nennt. Eine Umschreibung wie „das Management", „die
Geschäftsleitung" oder „das Team" erfüllt das nicht; es ist ein häufiger und
leicht abmahnbarer Mangel.

**Und ein zweiter Name wird gebraucht:** für § 18 Abs. 2 MStV. Diese Person muss
ein Mensch mit ständigem Aufenthalt in Deutschland oder der EU sein, volljährig,
unbeschränkt geschäftsfähig, im Besitz der Fähigkeit zur Bekleidung öffentlicher
Ämter. Eine LLC in Wyoming erfüllt keine dieser Voraussetzungen — eine
Gesellschaft hat keinen Aufenthalt. Der EU-Vertreter nach Art. 27 DSGVO ist
dafür nicht automatisch der richtige: Sein Auftrag ist der Datenschutz, nicht die
inhaltliche Verantwortung. Es kann dieselbe Person sein, aber das muss man
wollen und aufschreiben, nicht annehmen.

**Zu tun:** Zwei Namen entscheiden (es dürfen derselbe sein) und in
`impressum.md` und `datenschutz.md` Abschnitt 1 eintragen.

### 4. Die Wyoming-Registernummer nachtragen

**Warum:** § 5 Abs. 1 Nr. 4 DDG nennt beim Register ausdrücklich Handels-,
Vereins-, Partnerschafts- und Genossenschaftsregister — alles deutsche Register,
in die eine Wyoming-LLC nicht eingetragen ist. Die Vorschrift setzt aber Art. 5
Abs. 1 lit. d der E-Commerce-Richtlinie um, und der spricht allgemein von einem
„Handelsregister oder einem vergleichbaren öffentlichen Register". Eine LLC ist
beim Wyoming Secretary of State eingetragen und hat dort eine Filing-ID.

**Meine Einschätzung:** Die Angabe ist nicht sicher erzwungen, aber sie kostet
eine Zeile und nimmt einer Abmahnung den Anlass. Ich habe sie in `impressum.md`
vorgesehen.

**Zu tun:** Filing-ID beim Wyoming Secretary of State nachschlagen und
eintragen. Wenn Micha sie nicht eintragen will, die Zeile ersatzlos streichen —
aber nicht mit „siehe Registerauszug" oder Ähnlichem füllen.

**Nicht verwechseln:** Die EIN 88-2269126 ist eine US-Steuernummer. Sie ist
**keine** Umsatzsteuer-Identifikationsnummer nach § 27a UStG. In den Texten steht
sie deshalb ausdrücklich als das, was sie ist. Sie unter „USt-IdNr." zu
schreiben wäre eine falsche Pflichtangabe und schlimmer als gar keine.

### 5. Name und Erreichbarkeit des EU-Vertreters

Die gelieferten Angaben nennen für Malta **nur eine Anschrift**. Das reicht
nicht.

**Warum:** Art. 13 Abs. 1 lit. a DSGVO verlangt „den Namen und die Kontaktdaten
des Verantwortlichen sowie gegebenenfalls **seines Vertreters**". Eine Anschrift
ohne Namen ist kein Name, und ohne einen Weg, den Vertreter zu erreichen, kann
niemand sich an ihn wenden — was nach Art. 27 Abs. 4 DSGVO gerade sein Zweck
ist.

**Zu tun:**

- Namen des Vertreters (natürliche oder juristische Person) feststellen und in
  `impressum.md`, `datenschutz.md` Abschnitt 1 und im Verzeichnis eintragen.
- Eine E-Mail-Adresse für ihn angeben. Eine Postanschrift allein genügt formal,
  ist aber für Betroffenenrechte mit Monatsfrist (Art. 12 Abs. 3 DSGVO)
  unpraktisch.
- **Die schriftliche Beauftragung nach Art. 27 Abs. 1 DSGVO ablegen** und ihr
  Datum im Verzeichnis vermerken. Ohne sie gibt es keinen Vertreter, sondern nur
  eine Adresse.
- **Klären, ob die beauftragte Person weiß, was sie übernommen hat.** Sie muss
  das Verarbeitungsverzeichnis führen (Art. 30 Abs. 1) und Anfragen von
  Betroffenen und Behörden entgegennehmen. Siehe Punkt 11.

**Und eine Frage, die ich nicht beantworten kann:** Art. 27 Abs. 3 DSGVO
verlangt, dass der Vertreter in einem Mitgliedstaat niedergelassen ist, in dem
sich betroffene Personen befinden. Malta erfüllt das dem Wortlaut nach, solange
es maltesische Besucher gibt. Die Aufsichtsbehörden empfehlen allerdings den
Mitgliedstaat, in dem die meisten Betroffenen sind — bei einer
deutschsprachigen Seite mit deutscher Hotline wäre das Deutschland.
**Anwaltsfrage, Teil D Nr. 4.**

### 6. Den Verweis auf die OS-Plattform herausnehmen — auch nebenan

Im gelieferten Impressumstext steht ein Verweis auf die
Online-Streitbeilegungsplattform der EU-Kommission. **Diese Plattform ist zum
20.07.2025 eingestellt worden**, die zugrundeliegende Verordnung (EU)
Nr. 524/2013 wurde aufgehoben.

Ein Verweis auf einen Streitbeilegungsweg, den es nicht mehr gibt, ist keine
harmlose Altlast: Er verspricht Verbrauchern eine Möglichkeit, die nicht
besteht. In `impressum.md` steht er deshalb nicht.

**Die Erklärung zur Verbraucherschlichtung** („nicht verpflichtet und nicht
bereit") habe ich dagegen übernommen. Sie ist auch dann unschädlich, wenn die
Pflicht aus § 36 VSBG hier gar nicht besteht — und ob sie besteht, hängt an der
Beschäftigtenzahl (§ 36 Abs. 3 VSBG: nicht bei zehn oder weniger Beschäftigten)
und daran, ob überhaupt Verbraucherverträge geschlossen werden. Auf iyambae.fm
werden heute keine geschlossen.

**Zu tun:** Prüfen (Teil E Nr. 1) und **denselben Verweis auf
`ts-treppenlifte.de` entfernen**. Dort ist die Lage ernster als hier: Dort
werden Verbraucherverträge angebahnt.

### 7. Ist die Anschrift in Sheridan eine Niederlassung?

Der alte Punkt „Welche Anschrift steht im Impressum?" ist erledigt — eine
Anschrift steht. Der neue ist schwerer.

**Was das Gesetz verlangt:** § 5 Abs. 1 Nr. 1 DDG nennt „die Anschrift, unter der
sie niedergelassen sind" — die Anschrift der tatsächlichen Niederlassung, an der
die Gesellschaft ihre Tätigkeit ausübt. Ein Postfach genügt nicht. Eine reine
Zustelladresse eines Dienstleisters, an der niemand arbeitet, nach verbreiteter
Auffassung ebenfalls nicht.

**Was ich weiß und was nicht:** Ich weiß nicht, ob unter 30 N Gould St, Suite N
Geschäftsräume der Gesellschaft liegen oder ob es die Anschrift eines Registered
Agent ist. Ich rate an dieser Stelle nicht. Was ich sagen kann: Wenn es eine
reine Agentenanschrift ist, ist die Impressumsangabe angreifbar, und dann gibt
es genau zwei ehrliche Wege — eine echte Geschäftsanschrift nennen, oder die
Anschrift der Stelle, von der aus der Dienst tatsächlich betrieben wird.

**Was die maltesische Anschrift daran ändert: nichts.** Sie ist die Anschrift des
Vertreters nach Art. 27 DSGVO. Dieser Auftrag reicht so weit wie die DSGVO und
keinen Schritt weiter. Für das Impressum ist sie keine zweite Anbieteranschrift.
Sie darf dort stehen — sie muss sogar, siehe Punkt 5 —, aber sie beantwortet die
Frage nach der ladungsfähigen Anschrift nicht.

**Was gut gelöst ist:** Die deutsche 0800-Nummer erfüllt die Anforderung des
EuGH (Rs. C-298/07) an einen zweiten, schnellen Kommunikationsweg mühelos. Diese
Frage ist vom Tisch. Der einzige Haken ist die Erreichbarkeit aus dem Ausland —
eine deutsche 0800-Nummer ist von Österreich, der Schweiz oder Frankreich aus in
der Regel nicht wählbar. Bei einem Dienst in sieben Sprachen ist das erwähnenswert;
im Impressum steht deshalb ein Satz dazu.

### 8. Klären, ob es eine Niederlassung in der EU gibt — die Frage mit der größten Hebelwirkung

Alle Texte gehen davon aus, dass die Gesellschaft **keine** Niederlassung in der
Union hat. Daraus folgt: Art. 3 Abs. 2 lit. a DSGVO, ein Vertreter nach Art. 27,
kein One-Stop-Shop, keine federführende Aufsichtsbehörde.

**Wenn das nicht stimmt, ändert sich fast alles.** Der Begriff der
„Niederlassung" ist weit: Der EuGH lässt eine feste Einrichtung mit stabilen
Personal- und Sachmitteln genügen, und schon eine sehr kleine Präsenz kann
ausreichen. Eine **in Deutschland betriebene Service-Hotline** ist genau die Art
von Umstand, die diese Frage aufwirft. Wer bedient die 0800-Nummer, und von wo?

**Wenn eine Niederlassung in der EU besteht:**

- Es gilt Art. 3 Abs. 1 DSGVO, nicht Abs. 2.
- Ein Vertreter nach Art. 27 ist dann **nicht erforderlich** (Art. 27 Abs. 1 nimmt Verantwortliche mit Niederlassung ausdrücklich aus). Er darf bleiben, aber die Texte müssten anders formuliert werden.
- Es gibt eine Hauptniederlassung und damit eine **federführende Aufsichtsbehörde** — bei einer Niederlassung in Deutschland die Landesbehörde des betreffenden Bundeslands nach § 40 Abs. 2 BDSG.
- Das Impressum müsste die Anschrift dieser Niederlassung nennen.
- Und gewerberechtlich, steuerlich und arbeitsrechtlich stellen sich weitere Fragen, die weit über diese Dokumente hinausreichen.

**Zu tun:** Micha beantwortet: Gibt es in Deutschland oder einem anderen
EU-Staat Personal, Räume oder eine dauerhafte Einrichtung dieser Gesellschaft?
Wird die Hotline von einem eigenen oder einem beauftragten Team bedient? Bei
„beauftragt" ist es in der Regel keine Niederlassung; bei „eigenes Personal" ist
es eine Anwaltsfrage. **Teil D Nr. 3.**

### 9. Die Frage nach dem Datenschutzbeauftragten beantworten

In der ersten Fassung stand: „Einen Datenschutzbeauftragten gibt es nicht, und
es muss auch keinen geben." Diese Aussage kann ich nicht mehr treffen.

**Was sicher ist:** Art. 37 Abs. 1 DSGVO greift für iyambae.fm nicht. Keine
Behörde; keine Kerntätigkeit, die in umfangreicher regelmäßiger und
systematischer Überwachung besteht (die Reichweitenmessung ohne Kennung ist
keine Überwachung von Personen); keine umfangreiche Verarbeitung besonderer
Kategorien.

**Was gilt, aber offen ist:** § 38 Abs. 1 BDSG ist anwendbar, auch auf eine
Gesellschaft ohne Niederlassung in der EU — § 1 Abs. 4 BDSG erstreckt das Gesetz
ausdrücklich auf Verantwortliche, die über Art. 3 Abs. 2 DSGVO erfasst sind.
Seine drei Auslöser sind auf die **Gesellschaft insgesamt** zu beziehen:

1. **20 Personen, die ständig mit automatisierter Verarbeitung beschäftigt sind.** Zählt Beschäftigte im weiten Sinn, auch Teilzeit. Wie viele sind es?
2. **Pflicht zu einer Datenschutz-Folgenabschätzung.** Für iyambae.fm nein (siehe Verzeichnis). Für andere Tätigkeiten der Gesellschaft: unbekannt.
3. **Geschäftsmäßige Verarbeitung zum Zweck der Übermittlung.** Das ist der Auslöser, den ich für den wahrscheinlichsten halte. Eine Vermittlungsplattform, die Interessentenanfragen an Partnerbetriebe weiterreicht, tut genau das, was diese Nummer beschreibt. Wenn sie greift, ist ein Datenschutzbeauftragter **unabhängig von jeder Personenzahl** Pflicht.

**Was daran hängt:** Ist einer zu benennen, gehören Name und Kontaktdaten nach
Art. 13 Abs. 1 lit. b DSGVO in die Datenschutzerklärung — auch in die von
iyambae.fm, denn der Datenschutzbeauftragte ist einer der Verantwortlichen und
nicht einer der Website.

**Und noch etwas:** Der Vertreter nach Art. 27 kann diese Rolle **nicht**
übernehmen. Die beiden Funktionen sind nach Auffassung des Europäischen
Datenschutzausschusses unvereinbar — der Vertreter handelt für den
Verantwortlichen, der Datenschutzbeauftragte muss unabhängig sein.

**Zu tun:** Beantworten, in `datenschutz.md` Abschnitt 1 und im Verzeichnis
eintragen. **Teil D Nr. 5.**

### 10. Festlegen, wer Zugriff hat

Die erste Fassung sagte „zwei Personen mit Verwaltungsrechten, Leserechte, keine
Schreibrechte" und begründete das ausführlich. Bei einer Privatperson mit einem
Mitstreiter war das eine Tatsache. Bei einer Gesellschaft ist es eine
Festlegung, die getroffen und aufgeschrieben werden muss — sonst wächst der
Kreis, ohne dass es jemand entscheidet.

**Zu tun:** Namen und Zahl der Personen mit Zugriff auf die Betriebsauswertung
(heute) und auf die Kontodaten (später) festlegen und in `datenschutz.md`
Abschnitt 11 und im Verzeichnis eintragen. **Die Regel „Anwendung schreibt,
Menschen lesen" beibehalten** — sie ist gut und kostet nichts.

### 11. Das Verzeichnis dem EU-Vertreter zuleiten — und übersetzen

**Warum:** Art. 30 Abs. 1 Satz 1 DSGVO verpflichtet „jeder Verantwortliche und
gegebenenfalls sein Vertreter" zur Führung des Verzeichnisses. Der Vertreter auf
Malta muss es also haben, führen und auf Anforderung vorlegen können. Ein
Verzeichnis, das nur im Repository einer deutschen Website liegt, erfüllt das
nicht.

**Und es ist nur auf Deutsch da.** Die maltesische Aufsichtsbehörde arbeitet auf
Maltesisch und Englisch. Ein deutschsprachiges Verzeichnis dort vorzulegen, ist
im besten Fall unhöflich und im schlechteren unbrauchbar.

**Zu tun:** Verzeichnis ins Englische übersetzen, dem Vertreter zuleiten, Datum
der Zuleitung im Verzeichnis vermerken (die Zeile ist vorgesehen), und
festlegen, wer ihm Änderungen nachreicht. Das ist eine laufende Pflicht, kein
einmaliger Vorgang.

### 12. Aufsichtsbehörde: was jetzt in den Texten steht

Der alte Punkt lautete „Zuständige Aufsichtsbehörde eintragen — ich weiß nicht,
wo Micha wohnt". Er ist gegenstandslos, und die neue Lage ist anders, als man
vermuten würde. **Meine Antwort steht im Text und lautet: Es gibt keine
federführende Behörde.**

Die Begründung, kurz:

- Das Verfahren der einheitlichen Anlaufstelle (Art. 56 DSGVO) setzt eine **Hauptniederlassung in der Union** voraus.
- **Ein Vertreter nach Art. 27 begründet keine Niederlassung** und löst den One-Stop-Shop nicht aus. Das ist keine Randmeinung, sondern die ausdrückliche Position der Aufsichtsbehörden.
- Also bleibt es bei Art. 55 Abs. 1: Jede Aufsichtsbehörde ist in ihrem Hoheitsgebiet zuständig. Für einen Verantwortlichen nach Art. 3 Abs. 2 heißt das: **alle**, in deren Zuständigkeitsbereich betroffene Personen sind.
- Innerhalb Deutschlands richtet sich die Zuständigkeit dann nicht nach einem Sitz — es gibt keinen —, sondern nach dem Ort der Auswirkung. Praktisch: die Landesbehörde des Bundeslands, in dem die beschwerdeführende Person wohnt.
- Die maltesische Behörde (Office of the Information and Data Protection Commissioner, Floriana) ist die Behörde am Sitz des Vertreters. Auch sie ist **eine** mögliche Adresse, nicht **die** zuständige.

**Deshalb steht in `datenschutz.md` kein einzelner Behördenname als „für uns
zuständig", sondern die Erklärung plus der Verweis auf die Behörde am Wohnort
der betroffenen Person.** Das ist die Angabe, die Art. 13 Abs. 2 lit. d DSGVO
verlangt, und sie ist hier zugleich die einzige, die stimmt.

**Wenn Punkt 8 anders ausgeht** — es gibt doch eine Niederlassung in der EU —,
ist das hinfällig, und dann gehört genau eine Behörde in den Text.

### 13. Reichweitenmessung — die drei Bedingungen sind gebaut

**Stand nach dem Nachtrag: Die Einschätzung trägt, und sie trägt jetzt ohne
Vorbehalt.** Dieser Punkt stand vorher unter drei Bedingungen. Alle drei sind
umgesetzt. Ich lasse ihn stehen, statt ihn zu löschen, weil die Begründungen
auch die künftige Pflege binden — wer eines dieser Felder wieder einbaut, soll
hier nachlesen können, warum es draußen war.

**Zu § 25 TDDDG:** Die Vorschrift betrifft das *Speichern* auf dem Endgerät und
den *Zugriff* auf dort Gespeichertes. Eine Meldung, die aus dem besteht, was der
Nutzer im selben Augenblick selbst getan hat, tut weder das eine noch das
andere. Damit bleibt die DSGVO, und die kennt neben der Einwilligung das
berechtigte Interesse.

**Zu Art. 6 Abs. 1 lit. f:** Die Abwägung geht deutlich auf, und sie geht jetzt
deutlicher auf als vorher. Der Widerspruchsschalter ist dabei nicht Zierrat — er
ist der Grund, warum sie aufgeht.

**Bedingung 1 — kein Feld aus Gerätespeicher oder Cookie. Erledigt, und das war
der echte Riss.** Das Sprachfeld stand serverseitig kurzzeitig als `$sprache` in
der Zeile; diese nginx-Variable liest zuerst `$cookie_hz_sprache`. Das Cookie
ist für die Sprachweiche unbedingt erforderlich und deshalb nach § 25 Abs. 2
Nr. 2 TDDDG einwilligungsfrei — für die Messung wäre es ein **zweiter Zweck**,
und dafür trägt die Ausnahme nicht. Jetzt gibt es serverseitig gar kein
Sprachfeld; der Browser schickt das Kürzel im Rumpf mit, gewonnen über
`sprache()` aus `assets/lib/sprache.mjs`. Nachgeprüft, nicht angenommen: Die
Funktion liest der Reihe nach `data-sprache` am `<html>` (vom Erzeuger aus dem
Pfad gesetzt), den ersten Pfadabschnitt, `?sprache=` — kein `localStorage`, kein
Cookie.

*Ein Restposten, den ich der Vollständigkeit halber benenne:* Als **letzten**
Rückfall liest `sprache()` `navigator.languages`. Auf einer erzeugten Seite
greift bereits die erste Quelle, der Rückfall läuft also praktisch nie — aber
er ist der einzig verbliebene Weg, auf dem eine Angabe aus dem Browser statt aus
der Adresse in eine Meldung geraten könnte. Ob das Lesen von
`navigator.languages` ein „Zugriff auf Informationen im Endgerät" ist, ist genau
die Auslegungsfrage aus Teil D Nr. 6. **Kein Handlungsbedarf, aber ein Satz für
den Anwalt**, falls er ohnehin gefragt wird. Wer das Modul umbaut, sollte die
Reihenfolge nicht ändern.

**Bedingung 2 — keine Kennung, auch keine kurzlebige. War schon erfüllt und ist
es geblieben.** `assets/lib/messung.mjs` führt eine abschließende
Erlaubnisliste der Ereignisarten und der je Art zulässigen Felder. Wer etwas
Neues messen will, muss dort eintragen und kommt am Kommentar vorbei. Das ist
die richtige Bauart.

**Bedingung 3 — keine Adresse in der Protokollzeile, auch keine gekürzte.
Erledigt.** `log_format messung` hat jetzt genau drei Felder: `art`, `zeit`,
`ereignis`. Meine Begründung war der Inhalt (ein Senderstart kann auf
Sprachgemeinschaft, Herkunft, in Einzelfällen Glaubensrichtung deuten). Der
zweite Grund, den der Bau selbst gefunden hat, ist der schwerere und gehört
festgehalten: **Mess- und Zugriffszeilen liegen in derselben Tabelle.** Ein
gemeinsames Adressfeld hätte beide verbindbar gemacht — zwei Zeilen
Abfragesprache, und an jedem Ereignis hinge die volle Browserkennung und die
Verweisquelle aus V1. Die Messung hätte keine eigene Kennung gebraucht, sie
hätte eine geerbt. Das ist der Punkt, an dem eine für sich harmlose Angabe durch
bloße Nachbarschaft gefährlich wird.

**Was ich außerdem gut finde, ohne es verlangt zu haben:**

- **Die Suche meldet nur, DASS gesucht wurde**, einmal je Suche, beim ersten Zeichen. Bei jedem Tastendruck zu melden hätte aus „j", „ja", „jaz", „jazz" das Wort rekonstruierbar gemacht, obwohl keine einzelne Zeile es enthält. Das ist ein Angriff, den man erst sieht, wenn man ihn einmal gesehen hat.
- **Die Trefferzahl fällt bei der Achse „gemerkte" weg.** Sie zählt genau den eigenen Bestand einer Person, ist über Wochen stabil und wäre damit ein besserer Wiedererkennungswert gewesen als eine gekürzte Adresse. Analytisch ist sie bei dieser einen Achse ohnehin wertlos.
- **Gespeichert wird nur die Ablehnung.** Wer die Messung anlässt, hinterlässt keinen Eintrag — ein `hz_messung = ja` wäre eine Spur ohne Zweck.

**Was die Texte deshalb sagen:** `datenschutz.md` Abschnitt 3 ist auf den
heutigen Stand gebracht und benennt die Berichtigung, statt sie stillschweigend
einzuarbeiten; im Verzeichnis ist V11 neu gefasst und der Posten „Erkennbare
Restfrage" durch die Begründung ersetzt.

**Die eine Frage, die offen bleibt** — die weite Auslegung des Zugriffsbegriffs
durch den Europäischen Datenschutzausschuss — steht unverändert in Teil D Nr. 6.
Sie ist durch die drei Maßnahmen so klein geworden, wie sie werden kann.

### 14. Der Einstellungsbereich statt eines Banners — was er können muss

**Ich halte den Weg für richtig**, und zwar aus dem Grund, den du selbst nennst:
Ein Banner, der Einwilligung erfragt, wo keine nötig ist, behauptet etwas
Falsches über die Rechtsgrundlage — und ein Widerruf liefe dann ins Leere. Die
Aufsichtsbehörden warnen vor dieser Gestaltung, und der Europäische
Datenschutzausschuss führt sie unter irreführenden Gestaltungsmustern. **Ein
Banner ist heute für nichts auf dieser Seite erforderlich.**

Die vier Bausteine, jeder mit seiner eigenen Begründung:

| Was | Braucht es eine Einwilligung? | Warum |
|---|---|---|
| Örtlicher Speicher, Sprachcookie, Service Worker | nein | § 25 Abs. 2 Nr. 2 TDDDG — unbedingt erforderlich |
| Zugriffsprotokolle | nein | passiert auf dem Server; § 25 TDDDG gar nicht berührt |
| Reichweitenmessung | nein | kein Speichern, kein Auslesen; Art. 6 Abs. 1 lit. f mit Widerspruch |
| Fehlerbericht, MyRetuner-Abfrage | **ja** | wird im Moment des Anlasses erfragt, nicht vorab |

**Gebaut ist er inzwischen** (`index.html`, `#einstellungen`, angeschlossen in
`assets/app.js`): ein Dialog aus der Fußzeile, mit einem festen Eintrag
„Notwendig" ohne Schalter und zwei Schiebern für Reichweitenmessung und
Fehlerberichte. Der Aufbau stimmt. Zwei Dinge fehlen noch, und eines davon ist
inhaltlich falsch — siehe unten und Punkt 25.

**Was der Einstellungsbereich können muss, damit das trägt:**

- **Auffindbar sein.** Fußzeile jeder Seite, eindeutig benannt. Art. 12 Abs. 1 DSGVO verlangt „leicht zugänglich" — das ist erfüllt, wenn man ihn ohne Suchen findet, und nicht erfüllt, wenn er hinter zwei Klicks in einem Untermenü liegt.
- **In allen sieben Sprachen.** Die Oberfläche ist übersetzt, die Rechtstexte sind es nicht (Punkt 24). Ein Schalter, den man nicht liest, ist keiner. Das ist der eine Punkt, an dem die fehlende Übersetzung heute schon weh tut.
- **Die Abschaltung muss im Browser wirken, nicht erst auf dem Server.** Wer abschaltet, soll nicht darauf vertrauen müssen, dass die Meldung serverseitig verworfen wird — sie soll gar nicht erst abgeschickt werden.
- **Alle drei Schalter beieinander:** Fehlerberichte, Reichweitenmessung, MyRetuner-Abfrage. **Der dritte fehlt noch** — der Dialog hat heute zwei Schieber. Die MyRetuner-Abfrage ist eine Einwilligung nach Art. 6 Abs. 1 lit. a und § 25 Abs. 1 TDDDG, und Art. 7 Abs. 3 Satz 4 DSGVO verlangt, dass der Widerruf so einfach ist wie die Erteilung. Erteilt wird sie mit einem Klick auf „Ich habe MyRetuner"; zurückzunehmen ist sie heute nur durch Löschen aller Websitedaten. Der Zustand steht in `hz_mr_zustand`; ein Schieber, der ihn auf `abgelehnt` setzt, ist derselbe Aufbau wie die beiden vorhandenen. `datenschutz.md` Abschnitt 9 nennt den Einstellungsbereich bereits als Weg — solange der Schalter fehlt, verspricht der Text etwas, das die Seite nicht hält.
- **Ehrlich beschriften.** Nicht „Alles ablehnen", sondern was es tut. Und keine voreingestellte Zustimmung dort, wo eine Einwilligung nötig ist (Fehlerberichte, MyRetuner) — dort bleibt der Zustand „nicht gefragt", bis gefragt wird.
- **Der gespeicherte Zustand braucht keine Einwilligung.** `hz_messung` und `hz_fehlerbericht` auf dem Gerät abzulegen ist nach § 25 Abs. 2 Nr. 2 TDDDG unbedingt erforderlich: Eine Abschaltung, die beim nächsten Besuch vergessen wäre, wäre keine. Das steht so in `datenschutz.md` Abschnitt 5 und 8.

**Wofür ein Banner nötig würde — damit die Grenze festliegt:** eine Kennung in
der Reichweitenmessung; ein Analysedienst eines Dritten; Werbung oder
Werbemessung; Wiedererkennung über Seiten hinweg; das Auslesen von Angaben aus
dem Endgerät zu einem anderen Zweck als dem, für den sie dort liegen. Heute
trifft nichts davon zu. Genauer als „Banner" wäre dann übrigens: eine echte
Einwilligung **vor** der ersten Verarbeitung — die Form ist zweitrangig, der
Zeitpunkt nicht.

### 15. `infra/dashboard.bicep` und `deploy/nginx.conf` — **erledigt am 21.08.2026**

Beide Dateien behaupteten den alten Stand. Beide sind nachgezogen, und in beiden
Fällen ist die eingesetzte Fassung besser als mein Vorschlag.

**`infra/dashboard.bicep`:** Der Satz „nicht enthalten: welcher Sender gehört
wird" ist raus. An seiner Stelle stehen die sechs Ereignisarten mit je einer
Zeile, der Hinweis, dass es weiterhin keine Hördauer gibt — weil der Strom den
Server nicht berührt —, und die entfernten Felder mit Begründung und dem
Vermerk „BEHOBEN". Genau so gehört ein Quelltextkommentar geführt: Er sagt
nicht nur, was gilt, sondern was einmal galt und warum es nicht mehr gilt.

**`deploy/nginx.conf`:** Der Absatz „Der Personenbezug fällt weg." ist durch die
vorgeschlagene Fassung ersetzt. Damit sagen Quelltext und Datenschutzerklärung
dasselbe: Die Kürzung verringert den Personenbezug, sie beseitigt ihn nicht.

**Was in `deploy/nginx.conf` noch aufzuräumen ist — Kleinigkeit, aber sichtbar:**
Im Abschnitt „Reichweitenmessung" steht eine abgebrochene Zeile aus der alten
Fassung, unmittelbar vor der Überschrift „WARUM HIER WEDER DIE ADRESSE NOCH DER
SPRACHKOPF STEHT":

    # Die Besucheradresse ist gekürzt, bevor sie geschrieben wird — dieselbe Karte

Der Satz endet mitten im Wort, und er behauptet obendrein das Gegenteil dessen,
was zwanzig Zeilen darunter steht. Er gehört ersatzlos gelöscht.

**Und eine Zahl, die dort veraltet ist:** Ein Kommentar in
`infra/dashboard.bicep` rechnet mit „129 Sender ergäben 129 Linien". Es sind
146. Ohne Wirkung auf die Abfrage, aber siehe Teil F Nr. 2 — dieselbe Zahl
wandert im ganzen Projekt.

### 16. Alle Platzhalter füllen

Vollständige Liste, damit keiner übersehen wird:

- **`impressum.md`:** vertretungsberechtigte Person (Punkt 3); Wyoming-Filing-ID
  (Punkt 4); Name des EU-Vertreters (Punkt 5); Name und Anschrift des
  Verantwortlichen nach § 18 Abs. 2 MStV (Punkt 3).
- **`datenschutz.md`:** vertretungsberechtigte Person; Name und E-Mail des
  EU-Vertreters; Datenschutzbeauftragter ja/nein (Punkt 9); Zugriffsberechtigte
  im Kontoabschnitt (Punkt 10); die beiden offenen Kontofristen (Punkte 20
  und 21); Datum des Livegangs.
- **`verarbeitungsverzeichnis.md`:** vertretungsberechtigte Person; Filing-ID;
  Name und Kontakt des Vertreters; Datum der schriftlichen Beauftragung;
  Datenschutzbeauftragter; Zugriffsberechtigte; E-Mail-Anbieter samt
  Drittlandangabe und Löschfrist (V8); Fundstellen für V11; Aufbewahrungsdauer
  der ACS-Zustellprotokolle (V10); Datum der nächsten Durchsicht; Datum der
  Zuleitung an den Vertreter.

**Und der Kasten ganz oben in jeder der drei Dateien**, der „Entwurf, Stand …"
sagt: Er wird **nicht mitveröffentlicht**. `Scripts/baue-recht.py` überspringt
jedes Blockzitat, das mit `**Entwurf` beginnt. Alle drei Kästen sind entsprechend
gebaut. Wer einen neuen Hinweiskasten schreibt, muss diese Anfangsworte treffen,
sonst steht er auf der Seite.

**Dasselbe Mittel habe ich in dieser Fassung noch für etwas anderes benutzt, und
das ist erklärungsbedürftig.** Die erste Fassung hat ihre eigenen Zweifel
mitveröffentlicht: Auf der fertigen Impressumsseite hätte gestanden, dass unklar
ist, ob die Anschrift trägt, dass ein Pflichtname fehlt und dass `apps.iyambae.fm`
noch keine Rechtsverweise hat. Offenheit ist die Stärke dieser Texte — aber ein
Impressum, das öffentlich anzweifelt, ob es selbst wirksam ist, ist kein offenes
Impressum, sondern ein Geständnis mit Fußnote. Und ein Abmahner liest es zuerst.

Die Trennlinie, die ich gezogen habe:

- **Bleibt öffentlich:** jede Begründung, *warum* etwas so ist, wie es ist — warum ein Impressum Pflicht ist, warum kein Disclaimer dasteht, warum es kein Banner gibt, warum die Reichweitenmessung ohne Einwilligung läuft, warum die Schriften umgezogen sind. Das ist die Offenheit, die dem Projekt gut steht, und sie ist vollständig erhalten.
- **Wandert in `> **Entwurfsnotiz`-Kästen:** jede Aussage der Form „das könnte falsch sein", „das fehlt noch", „hier ist ein Mangel". Sie steht damit weiter in der Markdown-Datei, wird aber nicht ausgeliefert. Betroffen sind vier Stellen in `impressum.md` und eine in `datenschutz.md`.

**Die eckigen Klammern innerhalb der Texte werden dagegen ausgeliefert.** Sie
dürfen nicht in einer geltenden Fassung stehen. Entweder gefüllt oder der
Abschnitt raus. Das gilt besonders für die Klammer beim
Datenschutzbeauftragten — dort steht in eckigen Klammern *beides*: der Satz für
den Fall „ist benannt" und der für den Fall „ist keiner nötig". Einer von beiden
bleibt, die Klammern fallen weg.

### 17. Auftragsverarbeitungsverträge dokumentieren

**Zu tun:**

- **Microsoft:** Fassung und Datum des „Products and Services Data Protection
  Addendum" feststellen, als PDF ablegen, im Verzeichnis eintragen.
- **E-Mail-Anbieter — jetzt zwei.** Das Postfach `hello@infosys-consult.com` und
  das Postfach des EU-Vertreters. Beide sind Verarbeitungen, beide brauchen
  einen AV-Vertrag, und beim Postfach ist die Drittlandfrage **echt**: Liegt es
  bei einem US-Anbieter, ist das eine Übermittlung nach Kapitel V — anders als
  der bloße Sitz der Verantwortlichen (siehe den entsprechenden Abschnitt im
  Verzeichnis). V8 ist entsprechend erweitert.

### 18. Ablauf für den Fall einer Datenschutzverletzung aufschreiben

**Warum:** Art. 33 DSGVO — 72 Stunden ab Kenntnis. **Mit dem Betreiberwechsel ist
das schwieriger geworden:** Ohne federführende Behörde ist im Ernstfall zu
klären, welchen Behörden gemeldet wird, und der EU-Vertreter ist einzubinden.
Das ist nichts, was man in 72 Stunden nebenbei herausfindet.

**Zu tun:** Eine Seite genügt: Wer entscheidet, welche Behörden, welche
Meldeformulare, welche Angaben, wann zusätzlich die Betroffenen informiert
werden (Art. 34), und welche Rolle der Vertreter dabei hat. Ablage neben diesen
Dokumenten.

### 19. Steuerliche Einordnung — nur zur Kenntnis, nicht für diese Texte

Solange nichts Geld kostet, stellt sich die Frage nicht. Sobald es eine
kostenpflichtige Kontostufe gibt, erbringt ein US-Unternehmen elektronische
Dienstleistungen an Verbraucher in der EU, und das hat umsatzsteuerliche Folgen
(Stichwort One-Stop-Shop für Nicht-EU-Unternehmer). **Das ist eine Frage für
einen Steuerberater, nicht für einen Anwalt und erst recht nicht für mich.** Sie
steht hier nur, damit sie nicht erst auffällt, wenn der erste Betrag geflossen
ist.

### 25. Fünf Stellen im Programm behaupten noch den alten Stand

Dieselbe Sorte Befund wie der alte Punkt 15, nur diesmal an der Oberfläche —
und die erste Stelle ist die, die Besucher wirklich lesen.

**1. Der Einstellungsdialog sagt „mit gekürzter Adresse" — das stimmt nicht
mehr.** In `index.html` und in allen sieben Sprachdateien
(`assets/lang/*.json`, Schlüssel `einstellungen.messung.was`) steht sinngemäß:
„ohne Kennung, ohne Plätzchen, mit gekürzter Adresse". Es wird **gar keine**
Adresse geschrieben. Das ist keine Untertreibung zum Vorteil des Besuchers,
sondern eine falsche Angabe über eine Schutzmaßnahme — und sie verschenkt genau
das Argument, das diesen Bau von einer üblichen Reichweitenmessung
unterscheidet. **Vorschlag für den deutschen Schlüssel:**

    Welcher Sender gestartet wird und welche Filter greifen — ohne Kennung,
    ohne Plätzchen und ohne deine Adresse. Auf dem eigenen Server, nicht bei
    einem Dritten.

Die sechs Übersetzungen entsprechend. Das ist die eine Textänderung, die vor
dem Livegang wirklich sein muss: `datenschutz.md` Abschnitt 3 und der Dialog
dürfen nicht auseinanderlaufen.

**2. Der Kopfkommentar von `assets/lib/messung.mjs` widerspricht sich selbst.**
Oben steht: „Verarbeitet wird: was passiert ist, wann, und die schon von nginx
gekürzte Besucheradresse." Vierzig Zeilen tiefer steht in derselben Datei
richtig: „Die Adresse. Überhaupt keine, auch keine gekürzte." Der obere Satz ist
ein Rest der ersten Fassung.

**3. Die abgebrochene Kommentarzeile in `deploy/nginx.conf`.** Siehe Punkt 15.

**4. Die Senderzahl in `infra/dashboard.bicep`.** Siehe Punkt 15 und Teil F
Nr. 2.

**5. Der MyRetuner-Schieber fehlt im Einstellungsdialog.** Siehe Punkt 14.

*Warum das eine eigene Nummer bekommt und nicht in Teil F verschwindet:* Punkt 1
ist ein Text, den Besucher lesen und der etwas Unwahres über den Datenschutz
sagt. Solche Stellen sind es, die eine Aufsichtsbehörde zuerst findet — nicht,
weil sie schlimm sind, sondern weil sie zeigen, dass Text und Bau nicht
gemeinsam gepflegt werden.

---

## Teil B — Erst nötig, wenn die Konten kommen

> **Stand 23.08.2026: Teil B ist keine Zukunftsmusik mehr.** Die Anmeldung ist in
> der Seite angeschlossen (`assets/lib/konto.mjs` an `assets/app.js`), und der
> Dienst antwortet unter `https://iyambae.fm/api/`. Was hier steht, wird mit der
> nächsten Auslieferung fällig, nicht später.

### 26. Was mit dem Anschließen der Anmeldung sofort fällig wird

Nachgezogen ist, was sich aus dem Programmtext ergibt:

- `datenschutz.md` Abschnitt 11 gilt jetzt und sagt das auch.
- `datenschutz.md` Abschnitt 8 nennt `hz_favoriten_zeit` und `hz_konto_frage`
  sowie das Sitzungscookie `hz_sitzung`.
- `verarbeitungsverzeichnis.md` V6 nennt dieselben und sagt beim Feld
  „Empfänger" nicht mehr **keine**, sondern nennt die eine Ausnahme.

Offen und **nicht** von hier aus entscheidbar:

- **Angeboten werden heute zwei Wege**, Google und E-Mail (Einmalcode oder
  Passwort). `GET /api/apple/start` antwortet `501 apple_nicht_eingerichtet`,
  Passkey ist betriebsbereit, aber in der Oberfläche nicht angeschlossen.
  Kommen sie dazu, sind Abschnitt 11 und V9 daraufhin zu lesen — der Text
  beschreibt beide schon.
- **Auftragsverarbeitung Google.** Abschnitt 11 nennt Google LLC in den USA.
  Punkt 17 (AV-Verträge) ist dafür noch offen.
- **Punkt 20 (Frist für inaktive Konten) und Punkt 21 (Grabsteine)** sind jetzt
  dringlich: Grabsteine werden ab sofort wirklich geschrieben — auf dem Gerät in
  `hz_favoriten_zeit`, im Dienst über `raeumeGrabsteine()` mit 90 Tagen.
- **Der Hörverlauf geht heute nicht mit.** `POST /api/verlauf/abgleich` gibt es
  im Dienst, die Seite ruft ihn nicht. Abschnitt 11 sagt das jetzt so.

### 20. Frist für inaktive Konten festlegen

Art. 5 Abs. 1 lit. e DSGVO — Speicherbegrenzung. Es gibt keine gesetzliche Zahl;
üblich und begründbar sind 24 bis 36 Monate ohne Anmeldung, mit einer Vorwarnung
per E-Mail. Frist entscheiden, in `datenschutz.md` Abschnitt 11 und in V9
eintragen, und den täglichen Räumdurchgang um diese Prüfung erweitern. Das Feld
`zuletztGesehen` gibt es schon.

### 21. Klären, was ein „Grabstein" ist und was er enthält

`konto.bicep.entwurf` hat einen Parameter `grabsteinTage` (Vorgabe 90) mit der
Beschreibung „Wie lange gelöschte Einträge als Grabstein liegen bleiben". Der
Kommentar verweist auf „den Kommentar bei der Tabelle" — dort steht aber nur,
wie abgelaufene Sitzungen weggeräumt werden.

**Das ist eine echte Lücke.** Wenn nach einer Löschung nach Art. 17 DSGVO 90 Tage
lang etwas stehen bleibt, muss in der Datenschutzerklärung stehen, **was** und
**warum**. Ein inhaltsloser Marker gegen verspätete Schreibvorgänge ist
begründbar und leicht erklärt. Eine stehengebliebene E-Mail-Adresse ist etwas
ganz anderes. Entscheiden, aufschreiben, eintragen — **vor** der ersten Zeile
Programmcode, die Grabsteine schreibt.

### 22. Weitere Punkte zum Konto, kurz

- **Content-Security-Policy.** Fehlt heute vollständig. Ohne sie kann ein
  eingeschleustes Skript den Anmeldezustand mitlesen. Seit dem Umzug der
  Schriften ist `default-src 'self'` ein realistischer Ausgangspunkt.
- **Passwort-Hash-Verfahren festlegen.** Art. 32 DSGVO verlangt den Stand der
  Technik: Argon2id oder scrypt, nicht SHA-256, nicht PBKDF2 mit niedriger
  Rundenzahl. Vor dem ersten Passwort entscheiden, hinterher ist es eine
  Migration.
- **Mindestalter entscheiden (Art. 8 DSGVO).** Deutschland hat die Altersgrenze
  von 16 Jahren nicht abgesenkt. Das Konto stützt sich auf Art. 6 Abs. 1 lit. b,
  die Frage der Geschäftsfähigkeit Minderjähriger beim Vertragsschluss stellt
  sich trotzdem. **Anwaltsfrage, Teil D.**
- **ACS-Rollenkennung nachschlagen.** Bleibt sie leer, läuft der Mailversand
  über eine Verbindungszeichenfolge — dann ist deren Rotation zu regeln.
- **`/api/` nie zwischenspeichern — erledigt.** Der Service Worker legte
  einmal jede erfolgreiche Antwort eigener Herkunft ab; eine fremde Merkliste
  im Zwischenspeicher eines Familiengeräts wäre eine meldepflichtige
  Datenpanne. `sw.js` reicht `/api/` und `/messung` heute ausdrücklich durch,
  und `Scripts/pruefe-konto.mjs` hält diese Zeile fest.

---

## Teil C — Zwei Entscheidungen zur Veröffentlichung

### 23. Soll das Verarbeitungsverzeichnis öffentlich stehen?

`Scripts/baue-recht.py` erzeugt drei Seiten, darunter
`/recht/verarbeitungsverzeichnis/`. **Verboten ist das nicht** — Art. 30 Abs. 4
DSGVO verlangt nur die Vorlage gegenüber der Aufsichtsbehörde. Und Offenheit
steht dieser Seite gut.

**Was dagegen spricht, ist mit dieser Fassung mehr geworden:**

1. Das Verzeichnis nennt (künftig) die zugriffsberechtigten Personen namentlich.
2. Es enthält den Abschnitt **„Erkennbare Lücken"** — eine öffentlich lesbare
   Liste der eigenen Schwachstellen.
3. Es beschreibt Sicherheitsmaßnahmen im Einzelnen: Drosselungsgrenzen,
   Rollenmodell, Aufbau der Sitzungsgeheimnisse.
4. **Neu:** Es enthält offene Rechtsfragen zur eigenen Aufstellung — ob die
   Anschrift in Wyoming trägt, ob ein Datenschutzbeauftragter fehlt, ob es eine
   Niederlassung in der EU gibt. Das sind ehrliche Einträge in einem internen
   Dokument. Öffentlich gelesen sind es Angriffsflächen.

**Meine Empfehlung ist jetzt eindeutiger als vorher: nicht veröffentlichen.**
`verarbeitungsverzeichnis` aus `SEITEN` in `Scripts/baue-recht.py` entfernen und
den Verweis aus der Fußzeile der Rechtsseiten nehmen. Impressum und Datenschutz
bleiben — sie sagen den Besuchern alles, was sie brauchen, und sie sagen es
verständlicher.

**Falls doch veröffentlicht wird:** Dann gehört der Verweis auch in die Fußzeile
der sieben Sprachseiten, sonst findet ihn nur, wer schon auf einer Rechtsseite
steht. Und dann müssen die Punkte 1 bis 4 vorher heraus — was bedeutet, dass es
ab dann zwei Fassungen gibt und die für die Behörde die vollständige ist.

### 24. Die Rechtstexte übersetzen — mindestens ins Englische

**Warum:** Art. 12 Abs. 1 DSGVO verlangt „präzise, transparente, verständliche
und leicht zugängliche Form". Ein Text, den der Leser nicht lesen kann, erfüllt
davon keinen Punkt. Diese Seite spricht sieben Sprachen.

**Was sich mit dieser Fassung verschärft hat, in zwei Punkten:**

- **Der Einstellungsbereich (Punkt 14)** ist ein Bedienelement mit rechtlicher
  Wirkung. Ein Widerspruchsschalter, dessen Beschriftung jemand nicht versteht,
  ist kein wirksamer Widerspruchsweg. Die **Oberflächentexte** dieses Bereichs
  müssen in allen sieben Sprachen da sein — das ist keine Übersetzung der
  Rechtstexte, sondern der Schalterbeschriftung, und es ist billig.
- **Das Verzeichnis braucht ohnehin eine englische Fassung** für den Vertreter
  auf Malta (Punkt 11). Wer sie erstellt, hat die Hälfte der Arbeit für die
  englische Datenschutzerklärung schon getan.

**Empfehlung:** Schalterbeschriftungen sofort, Englisch vor dem Livegang, die
übrigen fünf vor den Konten. Reihenfolge nach den tatsächlichen Zahlen aus der
Betriebsauswertung — und die Sprachfassung steht jetzt in jeder
Reichweitenmeldung, also liegen die Zahlen wirklich vor.

**Zwei Warnungen zur Umsetzung, unverändert gültig:** Fachbegriffe wie
„Verantwortlicher", „Auftragsverarbeiter", „berechtigtes Interesse" haben in
jeder Amtssprache der EU eine feste Entsprechung — die liefert die DSGVO in der
jeweiligen Sprachfassung, nicht ein Übersetzungswerkzeug. Und sieben Fassungen
sind sieben Dokumente, die bei jeder Änderung mitmüssen.

---

## Teil D — Wo ein Anwalt nötig ist

Die Liste ist gegenüber der ersten Fassung gewachsen, und drei alte Punkte haben
mit dem Betreiberwechsel an Gewicht gewonnen. Ich schreibe deutlich, statt zu
relativieren: Das Folgende kann ich **nicht** abschließend beurteilen.

**1. Ist die Anschrift in Sheridan eine Niederlassung im Sinne des § 5 DDG?**
(Punkt 7.) Wenn nein, hat die Seite kein wirksames Impressum. Der Anwalt braucht
dafür die Tatsachen: Was findet an dieser Anschrift statt?

**2. Die Einordnung nach § 18 Abs. 2 MStV.** Meine Einschätzung steht in
`impressum.md`: eher nicht journalistisch-redaktionell, aber die Angabe trotzdem
machen. Das ist eine Wertung. Unverändert gegenüber der ersten Fassung — die
Rechtsform des Anbieters ändert daran nichts.

**3. Besteht eine Niederlassung in der EU?** (Punkt 8.) Der Punkt mit der
größten Hebelwirkung. Von der Antwort hängen ab: Art. 3 Abs. 1 oder Abs. 2
DSGVO, ob ein Vertreter nach Art. 27 überhaupt nötig ist, ob es eine
federführende Aufsichtsbehörde gibt, und welche Anschrift ins Impressum gehört.
Die deutsche Service-Hotline ist der Umstand, der die Frage aufwirft.

**4. Ist die Benennung des Vertreters wirksam, und ist Malta der richtige
Mitgliedstaat?** Art. 27 Abs. 3 verlangt einen Mitgliedstaat, in dem sich
betroffene Personen befinden; die Aufsichtsbehörden empfehlen den mit den
meisten Betroffenen. Bei einem deutschsprachigen Angebot mit deutscher Hotline
ist Malta zumindest erklärungsbedürftig. Dazu: Liegt eine schriftliche
Beauftragung vor, und weiß der Vertreter von seiner Verzeichnispflicht nach
Art. 30 Abs. 1?

**5. Braucht die Gesellschaft einen Datenschutzbeauftragten?** (Punkt 9.)
Insbesondere: Greift § 38 Abs. 1 Satz 2 BDSG — „geschäftsmäßige Verarbeitung zum
Zweck der Übermittlung" — bei einer Vermittlungsplattform, die Anfragen an
Partnerbetriebe weiterreicht? Wenn ja, ist der Datenschutzbeauftragte Pflicht,
unabhängig von jeder Beschäftigtenzahl, und er gehört auch in die
Datenschutzerklärung von iyambae.fm.

**6. Die Reichweitenmessung und § 25 TDDDG.** (Punkt 13.) Meine Einschätzung:
greift nicht, weil nichts gespeichert und nichts ausgelesen wird. Die
Gegenposition folgt aus der weiten Auslegung des Europäischen
Datenschutzausschusses zum technischen Anwendungsbereich der ePrivacy-Regel. Ein
Satz vom Anwalt, und die Sache ist entweder erledigt oder man baut eine
Einwilligung. Die drei Bedingungen in Punkt 13 sind so gewählt, dass sie die
Frage klein halten.

**7. Die Audioströme und Kapitel V DSGVO.** Ob eine Verbindung, die das Endgerät
des Besuchers auf dessen eigenen Klick hin zu einem Server in den USA, Russland
oder Nigeria aufbaut, eine „Übermittlung in ein Drittland" durch den
Seitenbetreiber ist, ist ungeklärt. Ich halte die Antwort für „eher nein — der
Betreiber übermittelt nichts, er zeigt eine Adresse", aber das ist eine Meinung.
Die Frage ist in der Erklärung offen benannt.

**8. Urheber- und Leistungsschutzrecht bei der Einbindung der Ströme.**
**Dieser Punkt ist durch den Betreiberwechsel schwerer geworden.** Nach der
Rechtsprechung des EuGH zur öffentlichen Wiedergabe (Svensson, GS Media, VG
Bild-Kunst) spielt eine Rolle, ob mit Gewinnerzielungsabsicht gehandelt wird —
bei gewerblichen Anbietern wird eine Kenntnis der Rechtswidrigkeit eher
vermutet. Was bei einer privaten Senderliste ein Randargument war, ist bei einer
Gesellschaft eines. **Anwalt.** Und unabhängig davon: Wenn ein Sender darum
bittet, nicht mehr eingebunden zu werden, fliegt er raus, ohne Diskussion.

**9. Die Senderlogos.** Die ausgelieferten Logos unter `assets/logos/` stammen
nach den Feldern `logoQuelle` in `data/sender.json` überwiegend aus
`apple-touch-icon` und `og:image` fremder Senderseiten. Das berührt Urheber- und
Markenrecht. **Das bisherige Hauptargument — nichtkommerzielle, identifizierende
Verwendung — trägt bei einer gewerblichen Betreiberin deutlich weniger.**
Übrig bleibt § 23 MarkenG (beschreibende Benutzung), und der deckt die Marke,
nicht unbedingt die Bilddatei. **Anwalt.** Ein Rückfall auf die eigene Wortmarke
je Sender ist technisch vorbereitet (`senderbild.mjs`, `MARKE`) — die Seite
funktioniert also auch ohne die Logos.

**10. GEMA und GVL.** Meine Einschätzung: nicht betroffen, weil hier nicht
gesendet, sondern verlinkt wird, und die Vergütungspflicht den Sender trifft.
**Auch hier verschiebt der gewerbliche Betrieb die Ausgangslage**, weil
Verwertungsgesellschaften bei gewerblichen Angeboten genauer hinsehen. Wenn
diese Einschätzung falsch ist, ist sie teuer falsch. **Ein Satz vom Anwalt
genügt.**

**11. Der Umfang von Art. 6 Abs. 1 lit. b beim Konto.** Die Merkliste ist der
Vertragsinhalt. Beim **Hörverlauf** ist das weniger klar: notwendiger Teil der
Leistung oder Zusatz mit eigener Einwilligung? Der Europäische
Datenschutzausschuss legt lit. b eng aus. Der saubere Weg wäre, den Verlauf als
eigenständig abschaltbare Funktion zu bauen. **Vor dem Bau klären.**

**12. Fällt iyambae.fm unter den Digital Services Act?** Meine Einschätzung:
nein — die Seite ist kein Vermittlungsdienst, sie hostet keine fremden Inhalte
auf Veranlassung von Nutzern, sondern zeigt eigene Texte und verlinkt. Damit
greifen auch die Pflichten zum Kontaktpunkt und zum gesetzlichen Vertreter
(Art. 11 bis 13 DSA) nicht. **Ein Satz vom Anwalt**, weil ein Anbieter ohne
EU-Sitz bei falscher Einordnung einen Vertreter benennen müsste, den es hier
nicht gibt.

**13. Mindestalter beim Konto (Art. 8 DSGVO und Geschäftsfähigkeit).** Siehe
Punkt 22.

**14. Sobald etwas Geld kostet.** AGB, Widerrufsbelehrung und
Muster-Widerrufsformular, Preisangaben, Erklärung nach § 36 VSBG,
Buttonbeschriftung nach § 312j BGB, Umsatzsteuer (Punkt 19). Das ist kein
Nachtrag zu diesen Dokumenten, sondern eine eigene Runde — und bei einem
US-Anbieter mit EU-Verbrauchern eine größere als bei einem deutschen.

---

## Teil E — Was ich nicht nachprüfen konnte

Ich habe in dieser Sitzung keinen Netzzugriff benutzt. Die folgenden Angaben
stammen aus meinem Wissensstand und müssen vor der Veröffentlichung **einzeln
nachgeprüft** werden. Ich habe sie im Text jeweils so formuliert, dass die
Nachprüfung leichtfällt.

1. **Die Abschaltung der OS-Plattform zum 20.07.2025** und die Aufhebung der
   Verordnung (EU) Nr. 524/2013. Ich bin mir recht sicher, aber „recht sicher"
   reicht bei einer Pflichtangabe nicht. Betrifft `impressum.md` und die
   Schwesterseite (Punkt 6).
2. **Die Auslegung des Europäischen Datenschutzausschusses zu Kapitel V** — dass
   die Erhebung unmittelbar bei der betroffenen Person keine „Übermittlung" ist
   und dass es dafür einen Exporteur und einen davon verschiedenen Importeur
   braucht. Darauf stützt sich der ganze Abschnitt „Der Sitz in den USA" in
   `datenschutz.md` und der entsprechende Abschnitt im Verzeichnis. Fundstelle
   sind die Leitlinien zum Zusammenspiel von Art. 3 und Kapitel V.
3. **Dass ein Vertreter nach Art. 27 keine Niederlassung begründet und den
   One-Stop-Shop nicht auslöst.** Trägt die gesamte Aussage zur Aufsichtsbehörde
   (Punkt 12). Ich halte sie für gesichert, aber sie ist zentral genug, um sie
   zu belegen.
4. **Die Zuständigkeit innerhalb Deutschlands für Verantwortliche ohne
   deutsche Niederlassung** — meine Angabe „Behörde am Wohnort der betroffenen
   Person" folgt der Praxis der Datenschutzkonferenz. Nachlesen.
5. **Die weite Auslegung des Zugriffsbegriffs** in den Leitlinien des
   Europäischen Datenschutzausschusses zum technischen Anwendungsbereich der
   ePrivacy-Regel. Trägt Punkt 13 und Teil D Nr. 6.
   **Und die Warnung vor unnötigen Bannern:** Der Kopfkommentar von
   `assets/lib/messung.mjs` nennt dafür eine genaue Fundstelle — die
   DSK-Orientierungshilfe „Digitale Dienste" vom November 2024, Randziffer 116.
   Das ist präziser als meine Angabe, und wenn die Stelle stimmt, gehört sie
   auch in `datenschutz.md` Abschnitt 5, statt dass dort allgemein von „den
   Aufsichtsbehörden" die Rede ist. **Randziffer nachschlagen, dann
   eintragen** — eine falsche Fundstelle ist schlimmer als keine.
6. **Der EU-US-Angemessenheitsbeschluss vom 10.07.2023** — gilt er zum Zeitpunkt
   des Livegangs noch? Und sind Google LLC und Apple Inc. aktuell zertifiziert?
7. **Der Wortlaut des Microsoft-DPA** und die Zusagen zur Datenresidenz.
8. **Die Lizenzen der fünf Schriftfamilien** — die Dateien werden bereits
   verbreitet, die Lizenztexte fehlen (siehe Teil F Nr. 4).
9. **Die Aufbewahrungsdauer der ACS-Zustellprotokolle** (V10).
10. **Ob der AV-Vertrag mit Microsoft tatsächlich zustande gekommen ist.**
11. **Die Natur der Anschrift in Sheridan** (Punkt 7) und die Filing-ID beim
    Wyoming Secretary of State (Punkt 4). Beides sind Tatsachenfragen, die Micha
    schneller beantwortet als jede Recherche.

---

## Teil F — Befunde aus dem Programmtext, die hierher gehören

1. **~~`infra/dashboard.bicep` und `deploy/nginx.conf` widersprechen den
   Texten.~~ Behoben am 21.08.2026.** Beide sind nachgezogen, siehe Punkt 15.
   Was an ihre Stelle getreten ist, steht in **Punkt 25**: fünf kleinere
   Stellen, die den alten Stand noch behaupten — darunter eine, die Besucher
   lesen.

   **Und ein Befund, der ohne die Reichweitenmessung nie aufgefallen wäre:**
   Die Bereitschaftsprüfung von Azure fragte die Wurzeladresse `/` ab, alle
   zehn Sekunden je Replikat, und stand als gewöhnlicher Besuch im
   Zugriffsprotokoll — bei drei Replikaten rund **26 000 erfundene Besuche am
   Tag**. Sie liegt jetzt auf `/gesund` und wird nicht protokolliert. Das ist
   kein Datenschutzverstoß, sondern das Gegenteil eines Datenschutzproblems:
   Es standen Zeilen im Protokoll, hinter denen kein Mensch war. Rechtlich
   berührt es trotzdem etwas, nämlich Art. 5 Abs. 1 lit. d DSGVO
   (Richtigkeit), und praktisch berührt es alles, was aus diesen Zahlen
   abgeleitet wird. **Alle Besucherzahlen vor dem 21.08.2026 sind unbrauchbar
   und dürfen nicht mit späteren verglichen werden.** In V1 und V2 des
   Verzeichnisses steht es jetzt.

2. **Die Katalogzahlen sind schon wieder gewandert.** Die erste Fassung stand
   auf 129 Sendern aus 29 Ländern in 9 Regalen. `data/sender.json` (Fassung
   2.1.0, geprüft 21.08.2026) enthält nachgezählt **146 Sender aus 31 Ländern in
   11 Regalen, alle 146 Ströme über HTTPS**. Ich habe die Zahlen in
   `datenschutz.md` Abschnitt 7 und in V5 auf diesen Stand gebracht, samt
   Länderverteilung (44 USA, 21 DE, 12 JP, 11 GB, 9 FR, 6 RU, je 5 ES/IT/CH,
   3 AT, Rest einzeln).

   **Dass sie binnen weniger Tage zweimal falsch waren, ist der eigentliche
   Befund.** Zwei Wege: entweder die Zahlen aus `data/sender.json` erzeugen
   lassen — `Scripts/pruefe-sender.py` zählt ohnehin schon — und in die
   Markdown-Dateien einsetzen, oder im Text „aktuell rund 145 Sender aus gut
   30 Ländern" schreiben. **Die Länderverteilung würde ich behalten**: Sie ist
   die Angabe, die den Drittlandtransfer greifbar macht, und ohne sie ist
   Abschnitt 7 eine Behauptung.

3. **„TDDG" war durchgängig falsch geschrieben.** Das Gesetz heißt seit dem
   14.05.2024 Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz, kurz
   **TDDDG** (drei D). Alle drei Dokumente sind berichtigt. Wenn das Kürzel
   irgendwo im Programmtext oder in Kommentaren steht, gehört es dort ebenfalls
   nachgezogen.

4. **Die Lizenztexte der Schriften fehlen weiterhin.** Kein Datenschutzthema,
   sondern die Bedingung, unter der die Dateien weitergegeben werden dürfen — und
   weitergegeben werden sie: Sie liegen im Repository, im Container-Abbild und
   gehen an jeden Besucher. Die SIL Open Font License verlangt, dass
   Urhebervermerk und Lizenztext die Schriftdateien begleiten. In
   `assets/schrift/` liegen 31 `woff2` und eine CSS-Datei, sonst nichts.
   **Zu tun:** Je Familie Lizenztext und Urhebervermerk mitholen, als
   `assets/schrift/LIZENZ-<familie>.txt` ablegen, `hole-schriften.py`
   entsprechend erweitern, Kopfkommentar in `schriften.css`. Und dabei je
   Familie **einmal nachlesen**, welche Lizenz tatsächlich gilt.

5. **`apps.iyambae.fm` hat keine Fußzeile mit Rechtsverweisen.** Eigener
   Hostname, eigenes Telemedium, eigene Pflicht. Siehe Punkt 2.

6. **Keine Content-Security-Policy in `deploy/nginx.conf`.** Heute kein
   Rechtsverstoß, ab dem Konto ein Problem. Seit dem Umzug der Schriften ist
   `default-src 'self'` ein realistischer Ausgangspunkt.

7. **Was gut gebaut ist und deshalb im Text vorkommen darf.** Die IP-Kürzung vor
   dem Schreiben, der fehlende Abfrageteil im Protokoll, das Fehlerberichtformat
   ohne Adressfeld, das abgeschaltete Öffnungs-Tracking in den Mails, die
   abgeschalteten Speicherkonto-Schlüssel, eine Seite, die beim Aufbau keinen
   einzigen fremden Host kontaktiert — und jetzt eine Reichweitenmessung, die
   ohne jede Kennung auskommt, obwohl es einfacher gewesen wäre, eine zu setzen.

   **Mit dem Betreiberwechsel sind diese Punkte von Sparsamkeit zu
   Schutzmaßnahmen geworden.** Solange die Verantwortliche in Deutschland saß,
   war „wir speichern wenig" eine Haltung. Jetzt, mit einer Gesellschaft unter
   US-Recht, ist es die einzige Maßnahme, die gegen einen Zugriff aus dem
   Drittland überhaupt etwas ausrichtet — und sie war zufällig schon da. Das
   sollte man nicht wieder aufgeben, wenn es einmal unbequem wird.
