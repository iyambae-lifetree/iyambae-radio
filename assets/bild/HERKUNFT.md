# Woher das Foto kommt

`plattenspieler.webp` — Technics SL-1200MK5 mit Ortofon-System, von oben.

| | |
|---|---|
| Quelle | Wikimedia Commons |
| Lizenz | **CC0** — Gemeinfreiheit, keine Namensnennung noetig |
| Datei | `Technics SL-1200MK5 Direct Drive Turntable System with Ortofon cartridge (2017-01-21 22.33.27 piqsels.com en).jpg` |
| Original | 3000 × 2308, hier auf 1400 verkleinert |

Vorher stand an dieser Stelle ein gezeichneter Plattenspieler mit erzeugten
Texturen — Filz, Rillen, ein SVG-Tonarm. Er sah gezeichnet aus, und das war
er auch.

**Bewegt wird nur das Etikett.** Auf einem echten Deck sieht man die Rillen
nicht laufen und den Tonarm nicht wandern; was sich sichtbar dreht, ist das
Etikett in der Mitte. Genau das dreht sich hier — und darauf liegt die
IYAMBAE-Marke oder das Logo des Senders.

## Zwei Dateien statt einer

| | |
|---|---|
| `plattenspieler.webp` | das Deck **ohne** Arm |
| `tonarm.webp` | nur der Arm, freigestellt |

**Zum Arm gehoert das Gegengewicht.** Sāmi-Ra hat es am 27.08.2026 in
einem Video gesehen und angemerkt: Es sitzt am hinteren Ende, dem Kopf
genau gegenueber, und schwenkt mit. In der ersten Fassung hatte ich es
weggelassen — es sei klein und liege auf schwarzem Grund. Es faellt auf.

Gefunden wurde es nicht ueber die Helligkeit (Gegengewicht und Lagerplatte
sind beide schwarz), sondern ueber die Geometrie: Es liegt auf der
Verlaengerung der Linie Nadel–Lager, bei −55,9°.

Der Arm liegt als eigene Ebene darueber und schwenkt um sein Lager — bei
85,33 % / 25,35 % der Bildbreite und -hoehe. **Wer das Foto tauscht, muss
diese Zahlen neu messen**, sonst dreht der Arm um einen falschen Punkt.

Was der Arm im Original verdeckte, ist ersetzt:

- **die Platte samt Tellerrand** durch eine um 60° gedrehte Kopie ihrer
  selbst. Beides ist kreisrund und konzentrisch, deshalb passt es fugenlos.
- **die Zarge** zeilenweise zwischen den Raendern interpoliert
- **der Lagerteller** weichgezeichnet, dort ist nur dunkle Flaeche

Die Spur des Arms wurde nicht geschaetzt, sondern gemessen: zeilenweise
nach dem hellen Grat mit dunklen Raendern gesucht.


## Berichtigt am 07.09.2026 — zwei Fehler, beide von der Sonarium-Sitzung gefunden

**1 · Der Geist des Arms lag noch im Deckbild.** Beim Freistellen wurde der
Arm entfernt, seine **Spiegelung auf dem Vinyl** und sein **Schatten auf der
Zarge** aber nicht. Sie lagen weiter dort, wo der Arm beim Fotografieren
lag — und passten deshalb zu genau einer Armstellung. Sichtbar wurde es in
der Ruhe (`rotate(-16deg)`), wo der Arm die Spuren nicht verdeckt.

Die Maske dafuer ist der Arm selbst: der Alphakanal von `tonarm.webp`, um
46 Punkte verbreitert. Genauer geht es nicht — dort und nur dort war er.
Gefuellt wurde in zwei Richtungen, jede nach der Form des Gegenstands:

| Auf der Platte | entlang von Kreisen um die Tellermitte — eine Schallplatte ist rotationssymmetrisch schattiert |
| Auf der Zarge | senkrecht, denn dort laeuft die Schattierung in Streifen |

78.017 Punkte ersetzt. Die Lagerplatte — der schwarze Kreis, in dem der
Kran sitzt — bleibt unberuehrt. Das Werkzeug liegt in
`iyambae-lifetree/apps`, Zweig `sonarium-a1-geruest`, als
`sonarium/Bauen/geist-herausrechnen.swift`; es lief hier unveraendert und
kam auf dieselbe Zahl.

**2 · Der Drehpunkt des Arms war falsch.** Hier stand 85,33 % / 25,35 %,
abgeschaetzt statt nachgerechnet. Richtig ist der sichtbare Lagerbolzen bei
**88,4 % / 20,0 %**:

```
Nadel im Alphakanal        (793, 855)
Plattenhalbmesser          519 Punkte = 151 mm  ->  3,44 Punkte je mm
SL-1200, effektive Laenge  230 mm = 791 Punkte
alter Punkt -> Nadel       707 Punkte  = 10,6 % zu kurz
neuer Punkt -> Nadel       779 Punkte  =  1,5 % daneben
```

An der Nadel faellt der Fehler kaum auf — sie wandert um zwanzig Punkte.
Hinten schon: Das Gegengewicht schwang um einen Halbmesser von 266 statt
197 Punkten, ein Drittel zu weit.

## Was NICHT geht: das Kardanlager freistellen

Sāmi-Ra wollte, dass der Kran mit dem Arm schwenkt — er gehoert dazu.
Versucht am 07.09.2026, am Original in 3000 x 2308, und **gescheitert**.

Der Grund ist nicht Faulheit, sondern der Gegenstand: Blankes Metall gegen
schwarze Grundplatte laesst sich nicht ueber die Helligkeit trennen. Bei
jeder Schwelle, die den aeusseren Ring und die eingravierten Skalen
draussen laesst, fallen die beschatteten Teile des Jochs mit heraus; bei
jeder, die sie mitnimmt, kommen die Anti-Skating-Beschriftung und der
Zargenrand mit. Es entstehen Fetzen, keine Form.

Dazu kaeme das schwerere Problem: Hinter dem geschwenkten Joch muesste die
Grundplatte stehen — mit Skalenring und Schrauben. Die gibt es dort nicht
zu sehen, sie muesste erfunden werden.

**Es braucht eine von Hand geschnittene Maske.** Bis es sie gibt, steht der
Kran still. Ein misslungener Ausschnitt waere schlechter als ein Lager, das
sich nicht dreht.


## Das Kardanlager schwenkt jetzt mit — `lager.webp`, 07.09.2026

Was oben als „geht nicht" stand, ist erledigt: **Olaf**, Berufsfotograf und
Freund Sāmi-Ras, hat den Kran von Hand freigestellt.

Zwei maschinelle Versuche waren daran gescheitert, und die Begruendung
bleibt richtig — blankes Metall gegen schwarze Grundplatte trennt keine
Helligkeitsschwelle. Was fehlte, war kein besserer Schwellwert, sondern ein
Auge und eine Hand.

| | |
|---|---|
| `lager.webp` | der Kran allein, 1400 x 1077 mit Alphakanal, 9,4 kB |
| Alpha-Kasten | (1096, 169) bis (1265, 331) — der Drehpunkt liegt darin |
| `plattenspieler.webp` | neu: ohne Kran, mit der Grundplatte dahinter |

**Warum eine eigene Ebene und nicht Teil von `tonarm.webp`:** Das Rohr
bewegt sich im Lager auch senkrecht — Auflegen und Abheben. Beides in einer
Datei liesse sich nur noch gemeinsam bewegen.

**Die drei Ebenen tragen dieselben zwei Zahlen:** Drehpunkt 88,4 % / 20,0 %,
Ruhe -16°, Spiel +2°. Wer eine davon aendert, aendert sie in `.lager` und
`.tonarm` gemeinsam — sonst haengt der Arm neben seinem Lager.

Geprueft vor dem Einbau, in allen drei Stellungen uebereinandergelegt
(0°, -16°, +2°): kein Loch, keine doppelte Kante.
