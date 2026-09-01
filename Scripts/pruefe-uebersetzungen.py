#!/usr/bin/env python3
"""Prüft die Übersetzungen der Senderkärtchen gegen data/sender.json.

    python3 Scripts/pruefe-uebersetzungen.py

WOZU ES DAS GIBT
================

Die Kärtchen und Regalbeschreibungen sind kuratierter Text — 165 Sender, je
rund 200 Zeichen, in Sāmi-Ras Handschrift. Bis zum 01.09.2026 standen sie auf
allen sieben Sprachseiten auf Deutsch; `baue-sprachen.py` hat sie deshalb mit
`lang="de"` ausgewiesen und dazu vermerkt, das sei „auf der japanischen Seite
ein Drittel deutscher Text".

Seitdem liegt je Sprache eine Datei `data/sender-texte.<kuerzel>.json` daneben.
Der Erzeuger greift sie Satz für Satz und lässt das `lang="de"` genau dort
stehen, wo wirklich noch Deutsch steht.

**Der Haken daran:** Ein fehlender Schlüssel fällt still auf Deutsch zurück.
Das ist der richtige Rückfall — aber ohne diese Prüfung merkt es niemand. Wer
einen Sender hinzufügt, fügt ihn in EINER Sprache hinzu; die anderen sechs
bleiben zurück, und die Seite sieht trotzdem heil aus.

WAS GEPRÜFT WIRD, UND WARUM JEWEILS
===================================

1. **Vollständigkeit** — jeder Sender und jedes Regal aus `sender.json` hat
   einen Eintrag. Fehlt einer, steht dort Deutsch, ohne dass es auffällt.
2. **Kein Überschuss** — ein Schlüssel, den `sender.json` nicht kennt, ist ein
   Sender, den es nicht mehr gibt, oder ein Tippfehler.
3. **Nicht leer** — ein leerer Text ist schlechter als der deutsche.
4. **Nicht wortgleich** — wer den deutschen Satz übernimmt, hat nicht
   übersetzt. Kurze Texte dürfen das (Eigennamen), lange nicht.
5. **Dezimaltrenner** — `en`, `ja` und `ar` schreiben `432.0`, `fr`, `es` und
   `it` wie das Deutsche `432,0`. Ein Komma im englischen Text liest sich als
   Tausendertrenner.
6. **Richtungsklammern** — nur Arabisch: Jede Isolate (U+2066) braucht ihren
   Abschluss (U+2069). Fehlt einer, springt die Zeile ab dort, und zwar bis
   zum Ende des Absatzes.
7. **Länge** — wird eine Übersetzung mehr als doppelt so lang wie das
   Original, passt sie nicht mehr auf die Karte.

Rückgabewert 1, wenn etwas beanstandet wird — damit ein Bau daran scheitern
kann.
"""
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

SPRACHEN = ("en", "fr", "es", "it", "ja", "ar")
DEZIMALPUNKT = ("en", "ja", "ar")
DEZIMALKOMMA = ("fr", "es", "it")

ZAHL_MIT_KOMMA = re.compile(r"\d,\d")
ZAHL_MIT_PUNKT = re.compile(r"\d\.\d")

# Kurze Texte dürfen wortgleich sein — „Ambient" heißt überall Ambient.
WORTGLEICH_AB = 40


def lies(pfad):
    return json.loads(io.open(pfad, encoding="utf-8").read())


def main():
    katalog = lies(ROOT / "data" / "sender.json")
    quelle = {
        "regal": {r["id"]: r["beschreibung"]
                  for r in katalog["regale"] if r.get("beschreibung")},
        "sender": {s["id"]: s["kaertchen"]
                   for s in katalog["sender"] if s.get("kaertchen")},
    }
    print(f"  Quelle: {len(quelle['regal'])} Regale, {len(quelle['sender'])} Sender")

    beanstandet = 0
    for kuerzel in SPRACHEN:
        pfad = ROOT / "data" / f"sender-texte.{kuerzel}.json"
        if not pfad.exists():
            print(f"  {kuerzel}: keine Datei — alles fällt auf Deutsch zurück")
            beanstandet += 1
            continue

        roh = io.open(pfad, "rb").read()
        ziel = json.loads(roh.decode("utf-8"))
        meldungen = []

        if roh[:3] == b"\xef\xbb\xbf":
            meldungen.append("hat eine BOM — der Erzeuger stolpert darüber")

        for art in ("regal", "sender"):
            q = quelle[art]
            d = ziel.get(art, {})

            fehlt = sorted(set(q) - set(d))
            if fehlt:
                meldungen.append(f"{art}: {len(fehlt)} fehlen ({', '.join(fehlt[:5])})")

            zuviel = sorted(set(d) - set(q))
            if zuviel:
                meldungen.append(f"{art}: {len(zuviel)} kennt sender.json nicht "
                                 f"({', '.join(zuviel[:5])})")

            leer = sorted(s for s in d if not str(d[s]).strip())
            if leer:
                meldungen.append(f"{art}: {len(leer)} leer ({', '.join(leer[:5])})")

            gleich = sorted(s for s in d
                            if s in q and d[s] == q[s] and len(q[s]) > WORTGLEICH_AB)
            if gleich:
                meldungen.append(f"{art}: {len(gleich)} wortgleich mit dem Deutschen "
                                 f"({', '.join(gleich[:5])})")

            if kuerzel in DEZIMALPUNKT:
                falsch = sorted(s for s in d if ZAHL_MIT_KOMMA.search(str(d[s])))
                if falsch:
                    meldungen.append(f"{art}: {len(falsch)} mit Dezimalkomma statt Punkt "
                                     f"({', '.join(falsch[:3])})")
            if kuerzel in DEZIMALKOMMA:
                falsch = sorted(s for s in d if ZAHL_MIT_PUNKT.search(str(d[s])))
                if falsch:
                    meldungen.append(f"{art}: {len(falsch)} mit Dezimalpunkt statt Komma "
                                     f"({', '.join(falsch[:3])})")

            if kuerzel == "ar":
                offen = sorted(s for s in d
                               if str(d[s]).count("⁦") != str(d[s]).count("⁩"))
                if offen:
                    meldungen.append(f"{art}: {len(offen)} unpaarige Richtungsklammern "
                                     f"({', '.join(offen[:3])})")

            lang = sorted(s for s in d
                          if s in q and len(str(d[s])) > 2 * len(q[s]) + 20)
            if lang:
                meldungen.append(f"{art}: {len(lang)} mehr als doppelt so lang "
                                 f"({', '.join(lang[:3])})")

        anzahl = len(ziel.get("regal", {})) + len(ziel.get("sender", {}))
        if meldungen:
            beanstandet += 1
            print(f"  ✘ {kuerzel}: {anzahl} Eintraege")
            for m in meldungen:
                print(f"      {m}")
        else:
            print(f"  ✔ {kuerzel}: {anzahl} Eintraege, ohne Beanstandung")

    if beanstandet:
        print(f"\n  {beanstandet} Sprache(n) beanstandet.")
        return 1
    print("\n  Alle sieben Fassungen sagen dasselbe.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
