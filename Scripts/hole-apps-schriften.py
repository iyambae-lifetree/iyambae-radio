#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Schriften für apps.iyambae.fm ins eigene Haus holen.

Dieselbe Begründung wie bei Scripts/hole-schriften.py fürs Radio: Ein <link>
auf fonts.googleapis.com schickt beim Aufbau JEDER Seite die volle IP jedes
Besuchers in die USA, bevor er irgendetwas anklicken kann. LG München I,
20.01.2022, Az. 3 O 17493/20.

apps.iyambae.fm wird unter einem EIGENEN Hostnamen aus /srv/apps
ausgeliefert. Auf die Schriften des Radios kann es also nicht zeigen, ohne
eine Anfrage über Hostgrenzen zu machen — dieselbe Klasse Problem, nur mit
eigener Domain. Deshalb liegen sie hier noch einmal.

Inter und JetBrains Mono sind schon da und werden kopiert. Neu geholt wird
nur Instrument Serif.
"""
import io
import pathlib
import re
import shutil
import sys
import urllib.request

WURZEL = pathlib.Path(__file__).resolve().parent.parent
QUELLE = WURZEL / "assets" / "schrift"
ZIEL = WURZEL / "apps" / "assets" / "schrift"

KENNUNG = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")

# Nur die Schnitte, die apps/index.html wirklich benutzt.
NEU = ["Instrument+Serif:ital@0;1"]
UEBERNEHMEN = ["inter", "jetbrainsmono"]

ADRESSE = re.compile(r"url\((https://fonts\.gstatic\.com/[^)]+)\)")


def hole(url):
    a = urllib.request.Request(url, headers={"User-Agent": KENNUNG})
    with urllib.request.urlopen(a, timeout=30) as antwort:
        return antwort.read()


def dateiname(url):
    teile = url.rstrip("/").split("/")
    familie = teile[teile.index("s") + 1] if "s" in teile else "schrift"
    return f"{familie}-{teile[-1].split('.')[0][-12:]}.woff2"


def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    stuecke = []

    # 1. Was das Radio schon hat, herüberkopieren — samt seiner @font-face-Blöcke.
    radio_css = (QUELLE / "schriften.css").read_text(encoding="utf-8")
    kopiert = 0
    for p in QUELLE.glob("*.woff2"):
        if not any(p.name.startswith(f) for f in UEBERNEHMEN):
            continue
        ziel = ZIEL / p.name
        if not ziel.exists():
            shutil.copy2(p, ziel)
            kopiert += 1

    # Die passenden Blöcke aus dem Radio-Stylesheet übernehmen.
    for block in re.findall(r"@font-face\s*\{[^}]*\}", radio_css):
        if any(f"/{f}-" in block for f in UEBERNEHMEN):
            stuecke.append(block.replace("/assets/schrift/", "/assets/schrift/"))
    print(f"  Inter + JetBrains Mono: {kopiert} Dateien kopiert, "
          f"{len(stuecke)} Bloecke uebernommen")

    # 2. Instrument Serif frisch holen.
    for familie in NEU:
        url = f"https://fonts.googleapis.com/css2?family={familie}&display=swap"
        css = hole(url).decode("utf-8")
        name = familie.split(":")[0].replace("+", " ")
        geholt = 0

        def ersetze(treffer):
            nonlocal geholt
            fern = treffer.group(1)
            datei = ZIEL / dateiname(fern)
            if not datei.exists():
                datei.write_bytes(hole(fern))
                geholt += 1
            return f"url('/assets/schrift/{datei.name}')"

        stuecke.append(f"/* {name} */\n" + ADRESSE.sub(ersetze, css))
        print(f"  {name}: {css.count('@font-face')} Bloecke, {geholt} Dateien geholt")

    kopf = """/* ═══════════════════════════════════════════════════════════════════
   Schriften — aus dem eigenen Haus
   ERZEUGT VON Scripts/hole-apps-schriften.py. Nicht von Hand aendern.

   Kein <link> auf fonts.googleapis.com: Der wuerde beim Aufbau jeder Seite
   die volle IP jedes Besuchers an Google in die USA schicken, bevor er
   irgendetwas anklicken kann. LG Muenchen I, 20.01.2022, Az. 3 O 17493/20.

   apps.iyambae.fm laeuft unter einem eigenen Hostnamen aus /srv/apps und
   kann deshalb nicht auf die Schriften des Radios zeigen, ohne eine Anfrage
   ueber Hostgrenzen zu machen. Also liegen sie hier noch einmal.

   Die unicode-range-Angaben stehen noch drin — der Browser laedt selbst
   nur, was die Zeichen auf der Seite verlangen.
   ═══════════════════════════════════════════════════════════════════ */

"""
    ziel = ZIEL / "schriften.css"
    io.open(ziel, "w", encoding="utf-8", newline="\n").write(kopf + "\n".join(stuecke))

    # Lizenzhinweis: alle drei stehen unter der SIL OFL, deren Abschnitt 2
    # verlangt, dass er die Dateien BEGLEITET.
    shutil.copy2(QUELLE / "LIZENZEN.txt", ZIEL / "LIZENZEN.txt")

    dateien = list(ZIEL.glob("*.woff2"))
    gesamt = sum(p.stat().st_size for p in dateien)
    print(f"  {len(dateien)} Dateien, {gesamt/1024:.0f} KiB gesamt")
    print(f"  {ziel.relative_to(WURZEL)} geschrieben")
    return 0


if __name__ == "__main__":
    sys.exit(main())
