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
# Bewusst nur auf `from '…'` gemustert, nicht auf die ganze import-Anweisung:
# Ein Import darf ueber mehrere Zeilen gehen, und ein zeilengebundener
# Ausdruck haette ihn dann still uebersehen — die Pruefung haette
# weitergemeldet, es sei alles in Ordnung. Genau das ist hier einmal
# passiert.
IMPORT = re.compile(r"""\bfrom\s+['"](\./[^'"]+)['"]""")
# Bis zum abschliessenden "];" am Zeilenanfang, nicht bis zur ersten
# schliessenden Klammer: Seit die Sprachseiten per flatMap entstehen, steht
# mitten in der Liste eine zweite eckige Klammer. Der bisherige nicht-gierige
# Ausdruck brach dort ab und sah nur die ersten drei Eintraege — die Pruefung
# meldete daraufhin neun Module als fehlend, die alle gelistet waren.
SHELL = re.compile(r"const\s+SHELL_FILES\s*=\s*\[(.*?)^\];", re.S | re.M)
EINTRAG = re.compile(r"""['"]([^'"]+)['"]""")


MANIFEST_ICON = re.compile(r'"src"\s*:\s*"([^"]+)"')

# Dieselbe Fehlerklasse, dritter Auesserungsort: Der AudioWorklet wird per
# addModule geladen und die .wasm per fetch — kein import weit und breit. Ohne
# diese beiden Muster faellt genau der Teil aus der Pruefung, der die
# Umstimmung traegt.
# Sowohl "./x" als auch "/x". Nach der Umstellung auf absolute Pfade
# passte das alte Muster (nur "./") auf keinen einzigen Aufruf mehr —
# der Worklet, die .wasm und der Katalog fielen still aus der Pruefung.
# Sie meldete weiter "alles vorhanden", pruefte aber drei Dateien
# weniger. Genau die Fehlerklasse, gegen die es dieses Skript gibt.
GELADEN = re.compile(r"""(?:addModule|fetch)\s*\(\s*['"](\.?/[^'"]+)['"]""")


def wurzelpfad(p):
    """Auf eine Schreibweise bringen: fuehrender Schraegstrich, kein './'.

    Seit die Seite unter /de/, /en/, /fr/ … liegt, stehen die Pfade absolut —
    ein dokumentrelatives './assets/…' suchte unter /de/assets/. In app.js
    stehen aber weiterhin modulrelative Importe ('./lib/x.mjs'), weil die sich
    auf die Modul-Adresse beziehen und richtig sind. Diese Pruefung muss
    beides auf denselben Nenner bringen, sonst meldet sie neun Module als
    fehlend, die alle da sind.
    """
    p = p.removeprefix("./")
    return "/" + p.lstrip("/")


def main():
    app = ROOT / "assets" / "app.js"
    sw = ROOT / "sw.js"
    manifest = ROOT / "manifest.webmanifest"

    block = SHELL.search(sw.read_text(encoding="utf-8"))
    if not block:
        print("  ✘ SHELL_FILES nicht gefunden in sw.js")
        return 1
    gelistet = {wurzelpfad(e) for e in EINTRAG.findall(block.group(1))}
    # Die Sprachseiten stehen als Ausdruck in sw.js, nicht als Zeichenkette —
    # der Zeichenkettenfinder sieht nur die Bausteine. Hier nachgetragen.
    for kuerzel in ('de', 'en', 'fr', 'es', 'it', 'ja', 'ar'):
        gelistet |= {f'/{kuerzel}/', f'/{kuerzel}/manifest.webmanifest',
                     f'/assets/lang/{kuerzel}.json'}

    # './lib/x.mjs' in app.js entspricht './assets/lib/x.mjs' im Worker,
    # weil der Worker im Wurzelverzeichnis liegt.
    quelltext = app.read_text(encoding="utf-8")
    importiert = {
        wurzelpfad("assets/" + treffer.removeprefix("./"))
        for treffer in IMPORT.findall(quelltext)
    }
    # addModule und fetch stehen in app.js mit Pfaden relativ zur Seite,
    # nicht relativ zu assets/ — deshalb ohne Praefix.
    importiert |= {wurzelpfad(x) for x in GELADEN.findall(quelltext)}

    # Dieselbe Fehlerklasse, anderer Auesserungsort: Ein Symbol, das das
    # Manifest verlangt, aber die Huelle nicht kennt, fehlt offline.
    symbole = {wurzelpfad(x)
               for x in MANIFEST_ICON.findall(manifest.read_text(encoding="utf-8"))}

    problem = False
    for was, erwartet in (("importierten Module", importiert),
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
    # Die Sprachordner entstehen erst beim Bauen (Scripts/baue-sprachen.py).
    # Wer nur pruefen will, hat sie vielleicht nicht — das ist kein Fehler.
    sprachseiten = re.compile(r"^/(de|en|fr|es|it|ja|ar)/")
    tote = sorted(p for p in gelistet
                  if not sprachseiten.match(p)
                  and not (ROOT / p.lstrip("/")).exists())
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
