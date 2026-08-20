#!/usr/bin/env python3
"""
Prueft, ob der Service Worker jedes Modul kennt, das die App importiert.

Warum das noetig ist: Fehlt ein Modul in SHELL_FILES, faellt das online nie
auf — der Worker holt es dann einfach aus dem Netz. Offline scheitert der
Start dagegen vollstaendig, weil ein fehlendes ES-Modul das ganze Skript
abbricht. Genau das war der Fall bei myretuner.mjs, wochentipp.mjs und
senderbild.mjs.
"""
import pathlib
import re
import sys

# Auf Windows spricht die Konsole cp1252 und das Haekchen unten braechte den
# Lauf zum Absturz — nach bestandener Pruefung, was besonders irrefuehrend
# waere. An diesem Projekt arbeitet ein Windows-Rechner mit.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMPORT = re.compile(r"""^\s*import\s.*?from\s+['"](\./[^'"]+)['"]""", re.M)
SHELL = re.compile(r"const\s+SHELL_FILES\s*=\s*\[(.*?)\]", re.S)
EINTRAG = re.compile(r"""['"]([^'"]+)['"]""")


MANIFEST_ICON = re.compile(r'"src"\s*:\s*"([^"]+)"')


def main():
    app = ROOT / "assets" / "app.js"
    sw = ROOT / "sw.js"
    manifest = ROOT / "manifest.webmanifest"

    block = SHELL.search(sw.read_text(encoding="utf-8"))
    if not block:
        print("  ✘ SHELL_FILES nicht gefunden in sw.js")
        return 1
    gelistet = set(EINTRAG.findall(block.group(1)))

    # './lib/x.mjs' in app.js entspricht './assets/lib/x.mjs' im Worker,
    # weil der Worker im Wurzelverzeichnis liegt.
    importiert = {
        "./assets/" + treffer.removeprefix("./")
        for treffer in IMPORT.findall(app.read_text(encoding="utf-8"))
    }

    # Dieselbe Fehlerklasse, anderer Auesserungsort: Ein Symbol, das das
    # Manifest verlangt, aber die Huelle nicht kennt, fehlt offline.
    symbole = set(MANIFEST_ICON.findall(manifest.read_text(encoding="utf-8")))

    problem = False
    for was, erwartet in (("importierte Module", importiert),
                          ("Symbole aus dem Manifest", symbole)):
        fehlend = sorted(erwartet - gelistet)
        if fehlend:
            problem = True
            print(f"  Der Service Worker kennt diese {was} nicht:")
            for pfad in fehlend:
                print(f"    ✘ {pfad}")
            print()

    # Und was gelistet ist, muss es auch geben — ein Tippfehler laesst
    # addAll() fehlschlagen und damit die ganze Installation.
    verzeichnisse = {"./"}
    tote = sorted(p for p in gelistet
                  if p not in verzeichnisse and not (ROOT / p.removeprefix("./")).exists())
    if tote:
        problem = True
        print("  In SHELL_FILES gelistet, aber nicht vorhanden:")
        for pfad in tote:
            print(f"    ✘ {pfad}")
        print()

    if problem:
        print("  Online faellt das nicht auf. Offline bricht der Start ab.")
        return 1

    print(f"  ✔ {len(importiert)} Module, {len(symbole)} Symbole, "
          f"{len(gelistet)} Eintraege in SHELL_FILES — alles vorhanden")
    return 0


if __name__ == "__main__":
    sys.exit(main())
