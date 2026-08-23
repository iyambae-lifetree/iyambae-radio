# Landeseite für den IYAMBAE Tuner — Entwurf

Stand 23.08.2026. Entschieden von Micha, gebaut in dieser Sitzung.

## Ausgangslage, gemessen

`apps/index.html`: **2.624 Zeilen, rund 2.940 sichtbare Wörter**, vier
Abschnitte (Beweis, Holen, Fragen, Umfrage). Michas Urteil: „das muss eine
typische Landeseite werden, viel einfacher, weniger Text."

Dazu ein Befund, der beim Nachsehen auffiel und die Sache größer macht:

**Die Seite trägt noch die Messing-Palette** — `--messing: #B8862B`,
`--blech`, `--gravur`, `--papier`, `--tinte`. Die Windows-Fassung ist am
23.08. auf den Regenbogen gewechselt (`docs/erscheinungsbild.md` im
MyRetuner-Repo), die macOS-Fassung trug ihn ohnehin. **Damit ist jetzt die
Webseite der Ausreißer, nicht mehr Windows.**

Sāmi-Ras Vorgabe gilt also auch hier:

> „Mir wäre sehr recht, wenn alle drei Tuner optisch so nah beieinander
> liegen wie möglich."

Plattform-Symbole gibt es bisher **gar keine** — nur CSS-Klassen
(`fuer--mac`, `fuer--win`, `fuer--linux`), die je nach erkanntem System
Textblöcke ein- und ausblenden.

## Entscheidungen

Getroffen von Micha, nachdem die Möglichkeiten mit ihren Kosten vorlagen:

| Frage | Entscheidung |
|---|---|
| Was wird aus den Vorbehalten (SmartScreen, Gatekeeper, virtuelles Gerät, Frist)? | **Kurz oben, Details eine Ebene tiefer.** Nichts verschwindet. |
| Wohin mit Beweis, Fragen, Umfrage? | **Aufklappen auf derselben Seite.** Keine neuen Adressen, keine Änderung an Sitemap oder Sprachweiche. |
| Plattform-Symbole | **Echte Logos** — Apfel, Windows-Fenster, Tux. |

### Zum Markenrecht, festgehalten

Tux ist frei verwendbar (Larry Ewing, mit Namensnennung). **Der Apfel und
das Windows-Fenster sind eingetragene Marken; Apple untersagt die Verwendung
seines Logos auf fremden Seiten ausdrücklich, Microsoft lizenziert seines.**
In der Praxis wird beides auf Downloadseiten geduldet.

Micha wurde vor der Entscheidung darauf hingewiesen und hat sich dafür
entschieden. Weil die Webseiten Sāmi-Ra gehören und hinter iyambae mit der
Infosys LLC eine gewerbliche US-Gesellschaft steht, wird er im Vorgang
darüber unterrichtet. Die Entscheidung bleibt umkehrbar: ein Austausch der
drei SVG-Dateien.

## Gestaltung

### Die These

**„Es gab nie ein richtiges A."**

Kein Werbespruch, sondern der Inhalt des Produkts. Die App trägt die Belege
bereits: 415 Barock · 432 Mailand 1880 · 435 Paris 1859 · 440 ISO 16 ·
443 Deutschland heute · 445 Karajan. Das ist eine echte Chronologie — der
Kammerton ist über Jahrhunderte nach oben gewandert.

### Das Erkennungsmerkmal: das Kammerton-Lineal

Eine waagerechte Achse von 415 bis 445 Hz. Die historischen Marken stehen an
ihrer **wirklichen** Position auf der Skala, nicht gleichmäßig verteilt. 432
ist im Regenbogen hervorgehoben.

Es ist das Bedienelement der App, zur Argumentation der Seite vergrößert —
und es erklärt das Produkt ohne einen Werbesatz. Die Abstände tragen dabei
Information: dass zwischen 440 und 443 weniger liegt als zwischen 415 und
432, sieht man, statt es zu lesen.

**Das ist zugleich das bewusst eingegangene Risiko:** Oben steht weder ein
Produktbild noch ein Versprechen, sondern das Lineal.

### Farben

Übernommen aus `docs/erscheinungsbild.md` (MyRetuner), damit die drei
Fassungen und die Seite denselben Farbklang tragen:

```
Regenbogen, 45°   #FF5252  #FABF33  #4CD973  #4C9EFA  #B866FA
Grund, oben→unten #38393F → #121216
```

Die Messing-Marken werden ersetzt, nicht ergänzt. Zwei Paletten nebeneinander
wären genau der Zustand, den diese Änderung beendet.

### Schrift

**Bleibt unverändert.** Instrument Serif (Anzeige), Inter (Text),
JetBrains Mono (Zahlen). Alle drei liegen selbst gehostet unter
`apps/assets/schrift/` — das war eine Rechtsentscheidung (keine
Google-Fonts-Einbindung), und sie wird hier nicht angefasst.

Die Zahlen des Lineals setzt JetBrains Mono: Hertzwerte sind Daten, keine
Prosa.

### Aufbau

```
┌──────────────────────────────────────────────────┐
│  ⟡ IYAMBAE Tuner                                 │
│                                                  │
│  Es gab nie ein richtiges A.        Serif, groß  │
│  Stimm deinen ganzen Rechner um.    Inter        │
│                                                  │
│  415        432      435  440  443 445           │
│  ├──────────▓▓───────┼────┼────┼───┼──►          │  Lineal
│  Barock   Mailand  Paris  ISO  DE  Karajan       │
│           1880     1859    16  heute             │
│                                                  │
│   ⌘ macOS      ⊞ Windows      🐧 Linux           │
│    1,3 MB        68 MB         43 KB             │
│                                                  │
│  ▸ Was du vor dem Laden wissen musst             │
└──────────────────────────────────────────────────┘
        ↓
   [ echtes Bild der App ]
        ↓
   ▸ Nachgemessen  ▸ Fragen  ▸ Umfrage    zugeklappt
```

### App-Bilder — was echt ist und was fehlt

- **Windows:** vorhanden. Am 23.08. mit `PrintWindow` vom laufenden
  Programm abgenommen, 1024×712.
- **macOS:** hier nicht herstellbar, es fehlt der Rechner. Die Stelle bleibt
  frei, bis Sāmi-Ras Sitzung eines liefert.
- **Linux:** nur ein Leistensymbol, es gibt kaum etwas zu zeigen.

**Es wird kein Bild erfunden.** Eine gezeichnete Oberfläche, die es so nicht
gibt, wäre dieselbe Sorte Angabe, gegen die diese Seite sonst antritt.

## Was nicht geändert wird

- Die sieben Sprachen und ihr Erzeuger (`Scripts/baue-apps-sprachen.py`).
  Jeder neue Schlüssel muss in allen sieben Katalogen stehen; das Skript
  bricht sonst ab.
- Sitemap, `robots.txt`, Sprachweiche im nginx.
- Die Umfrage und ihre Erlaubnisliste — sie läuft und sammelt Antworten.
- Die Rechtstexte unter `recht/`.
- `apps/assets/schrift/` und `apps/assets/iyambae-marke.svg`.

## Prüfkriterien

Erfüllt, wenn:

1. `python3 Scripts/baue-apps-sprachen.py --pruefe` bestätigt: sieben
   Kataloge, gleiche Schlüssel, `de.json` gibt `apps/index.html`
   zeichengenau wieder.
2. Kein `--messing`/`--blech`/`--gravur` mehr im wirksamen Quelltext von
   `apps/`.
3. Die fünf Regenbogenwerte und beide Grundtöne kommen vor.
4. Der sichtbare Text ist **unter 1.000 Wörtern** im aufgeklappten Zustand
   der Kopfzone (gemessen wie oben: Auszeichnung entfernen, Wörter zählen).
5. Die drei Ladeknöpfe zeigen auf die Dateien, die wirklich im Blob liegen —
   nachgeprüft mit einer Kopfabfrage, nicht durch Ansehen.
6. `docker build` läuft durch (das Bau-Gate führt die Prüfskripte aus).
7. Tastaturbedienung: Die aufklappbaren Blöcke sind mit der Tastatur zu
   öffnen und tragen sichtbaren Fokus.
8. `prefers-reduced-motion` wird beachtet.

## Offen

Die Frage, ob das Radio künftig selbst misst, liegt bei Sāmi-Ra
(MyRetuner-Vorgang #2). Sie berührt diese Seite nicht — hier geht es um den
Tuner, nicht um `iyambae.fm`.
