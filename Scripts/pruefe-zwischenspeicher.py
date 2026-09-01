#!/usr/bin/env python3
"""
Prueft, ob SW_VERSION gestiegen ist, wenn sich eine zwischengespeicherte
Datei geaendert hat.

WARUM ES DIESES SKRIPT GIBT

Ganz oben in sw.js steht seit jeher: „Bei JEDER Aenderung an SHELL_FILES
hochzaehlen." Der Satz stimmt, und er wurde trotzdem zweimal uebersehen —
zuletzt am 01.09.2026, als 97250be die Katalogtexte in sechs Sprachen
uebersetzte und die Fassung auf v29 stehen liess.

Die Folge sieht niemand, der die Seite frisch aufruft. Sie trifft nur
BESTEHENDE Besucher, die ihren alten Zwischenspeicher behalten — dauerhaft.
Gemeldet hat es Saemi-Ra, nicht eine Pruefung: „Die internationalen Seiten
ergeben keinen Sinn, wenn der meiste Text immer noch auf deutsch ist."
Frisch aufgerufen war die Uebersetzung laengst da; er sah seinen eigenen
Zwischenspeicher.

Ein Satz in einem Kommentar ist keine Sicherung. Dieses Skript ist eine.

WIE ES ARBEITET

Es merkt sich in Scripts/zwischenspeicher-stand.json, welche Fassung zu
welchen Dateiinhalten gehoerte. Weicht heute etwas davon ab, bricht es ab
und nennt die Dateien beim Namen.

    python3 Scripts/pruefe-zwischenspeicher.py                 pruefen
    python3 Scripts/pruefe-zwischenspeicher.py --uebernehmen   Stand neu schreiben

Der uebliche Ablauf, wenn die Pruefung meckert:

    1. SW_VERSION in sw.js hochzaehlen und in den Kommentar schreiben, warum
    2. python3 Scripts/pruefe-zwischenspeicher.py --uebernehmen
    3. beide Dateien zusammen committen

MUSS NACH DEM BAU LAUFEN. Die Sprachseiten entstehen erst dabei; vorher gibt
es sie nicht. Im Dockerfile steht es deshalb hinter baue-sprachen.py.
"""
import hashlib
import json
import pathlib
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
STAND = ROOT / "Scripts" / "zwischenspeicher-stand.json"

FASSUNG = re.compile(r"const\s+SW_VERSION\s*=\s*['\"]([^'\"]+)['\"]")
SPRACHLISTE = re.compile(r"const\s+SPRACHEN\s*=\s*\[(.*?)\]", re.S)
# Bis zum abschliessenden "];" am Zeilenanfang — mitten in der Liste steht
# seit den Sprachseiten eine zweite eckige Klammer. Derselbe Fallstrick wie
# in pruefe-shell-dateien.py, dieselbe Loesung.
SHELL = re.compile(r"const\s+SHELL_FILES\s*=\s*\[(.*?)^\];", re.S | re.M)
EINTRAG = re.compile(r"""['\"`]([^'\"`]+)['\"`]""")
# Kommentare zuerst herausnehmen. In SHELL_FILES steht der Satz „Die Wurzel
# '/' steht bewusst NICHT hier" — und die Anfuehrungszeichen darin sahen fuer
# EINTRAG aus wie ein Eintrag. Die Pruefung meldete daraufhin eine Datei als
# fehlend, die absichtlich fehlt.
KOMMENTAR = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)


def gelistete_pfade(quelle):
    """Die Eintraege aus SHELL_FILES, mit ${s} zu je sieben aufgeloest."""
    block = SHELL.search(quelle)
    if not block:
        return None
    sprachen = EINTRAG.findall(KOMMENTAR.sub("", SPRACHLISTE.search(quelle).group(1)))

    pfade = []
    for roh in EINTRAG.findall(KOMMENTAR.sub("", block.group(1))):
        if "${s}" in roh:
            pfade.extend(roh.replace("${s}", s) for s in sprachen)
        else:
            pfade.append(roh)
    # Reihenfolge egal, doppelte auch — verglichen wird eine Abbildung.
    return sorted(set("/" + p.removeprefix("./").lstrip("/") for p in pfade))


def datei_zu(pfad):
    """Aus einer Adresse die Datei machen. '/de/' liegt in de/index.html."""
    p = pfad.lstrip("/")
    return ROOT / (p + "index.html" if p.endswith("/") else p)


def fingerabdruecke(pfade):
    abdruck, fehlend = {}, []
    for pfad in pfade:
        datei = datei_zu(pfad)
        if not datei.is_file():
            fehlend.append(pfad)
            continue
        abdruck[pfad] = hashlib.sha256(datei.read_bytes()).hexdigest()[:16]
    return abdruck, fehlend


def main():
    uebernehmen = "--uebernehmen" in sys.argv
    quelle = (ROOT / "sw.js").read_text(encoding="utf-8")

    treffer = FASSUNG.search(quelle)
    if not treffer:
        print("  ✘ SW_VERSION nicht gefunden in sw.js")
        return 1
    fassung = treffer.group(1)

    pfade = gelistete_pfade(quelle)
    if pfade is None:
        print("  ✘ SHELL_FILES nicht gefunden in sw.js")
        return 1

    jetzt, fehlend = fingerabdruecke(pfade)
    if fehlend:
        # Das ist die Zustaendigkeit von pruefe-shell-dateien.py. Hier wuerde
        # es nur zu einem zweiten, schlechteren Fehlerbild fuehren.
        print("  ! nicht vorhanden, deshalb nicht mitgezaehlt:")
        for p in fehlend:
            print(f"      {p}")
        print("    Ist der Bau gelaufen? Sonst sagt pruefe-shell-dateien.py mehr.")

    if uebernehmen:
        STAND.write_text(
            json.dumps({"fassung": fassung, "dateien": jetzt},
                       ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8")
        print(f"  ✔ Stand geschrieben — {fassung}, {len(jetzt)} Dateien")
        return 0

    if not STAND.is_file():
        print("  ✘ Scripts/zwischenspeicher-stand.json fehlt.")
        print("    Einmalig anlegen: python3 Scripts/pruefe-zwischenspeicher.py --uebernehmen")
        return 1

    stand = json.loads(STAND.read_text(encoding="utf-8"))
    vorher = stand.get("dateien", {})

    geaendert = sorted(p for p in jetzt if p in vorher and jetzt[p] != vorher[p])
    neu       = sorted(p for p in jetzt if p not in vorher)
    weg       = sorted(p for p in vorher if p not in jetzt)
    bewegung  = geaendert or neu or weg

    if not bewegung and fassung == stand.get("fassung"):
        print(f"  ✔ {fassung} — {len(jetzt)} zwischengespeicherte Dateien unveraendert")
        return 0

    if bewegung and fassung == stand.get("fassung"):
        print(f"  ✘ Zwischengespeicherte Dateien haben sich geaendert, "
              f"SW_VERSION steht weiter auf {fassung}.")
        print()
        for titel, liste in (("geaendert", geaendert), ("neu", neu), ("entfallen", weg)):
            if liste:
                print(f"    {titel}:")
                for p in liste:
                    print(f"      {p}")
        print()
        print("    Bestehende Besucher behielten ihren alten Stand — dauerhaft.")
        print("    Abhilfe:  SW_VERSION in sw.js hochzaehlen, dann")
        print("              python3 Scripts/pruefe-zwischenspeicher.py --uebernehmen")
        return 1

    # Fassung gestiegen. Richtig gehandelt — aber der Stand muss mit, sonst
    # veraltet er und die naechste Aenderung faellt durch das Netz.
    print(f"  ✘ SW_VERSION ist von {stand.get('fassung')} auf {fassung} gestiegen, "
          f"der festgehaltene Stand nicht.")
    print("    Abhilfe:  python3 Scripts/pruefe-zwischenspeicher.py --uebernehmen")
    print("              und die Datei mit demselben Commit ablegen.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
