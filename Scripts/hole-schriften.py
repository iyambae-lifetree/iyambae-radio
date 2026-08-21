#!/usr/bin/env python3
"""
Holt die Schriften von Google und legt sie ins Repository.

WARUM

Bisher standen zwei <link> auf fonts.googleapis.com im Kopf. Das heißt: Beim
Aufbau JEDER Seite, bevor der Besucher irgendetwas anklicken kann, geht seine
volle IP-Adresse an Google in die USA. Das LG München I hat dazu am
20.01.2022 entschieden (Az. 3 O 17493/20) — 100 Euro Schadensersatz und
Unterlassung.

Eine Einwilligung einzuholen wäre der falsche Weg: Ein Einwilligungsbanner
für etwas, das man in einer Stunde selbst hosten kann, ist Bürokratie statt
Datenschutz. Also umziehen.

Der Umzug räumt vier Dinge auf einmal weg:
  - den Drittlandtransfer beim Seitenaufbau
  - den Sonderzweig für fremde Herkünfte im Service Worker
  - zwei Verbindungen (preconnect) beim Start
  - die spätere CSP muss keine fremden Hosts durchlassen

WIE DIE AUSWAHL FUNKTIONIERT

Google liefert je Schrift ein Stylesheet mit mehreren @font-face-Blöcken,
einem je Zeichenbereich (latin, latin-ext, arabic …), jeweils mit
`unicode-range`. Diese Angabe wird mitgenommen. Der Browser lädt dann von
selbst nur, was er wirklich braucht — auf /de/ kommt keine arabische
Schriftdatei an, ohne dass irgendwo eine Weiche stehen muss.

Genau deshalb ist das besser als der bisherige Behelf, bei dem der Erzeuger
die arabische <link>-Zeile aus sechs von sieben Seiten geschnitten hat.

Aufruf:
    python3 Scripts/hole-schriften.py
"""
import io
import pathlib
import re
import sys
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZIEL = ROOT / "assets" / "schrift"

# Ohne einen modernen Browser-Ausweis liefert Google TTF statt WOFF2 — und
# damit das Fuenffache an Daten. Der Ausweis ist hier kein Trick, sondern die
# Angabe, welches Format wir verarbeiten koennen.
KENNUNG = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")

# Genau die Schnitte, die assets/styles.css benutzt — nicht mehr.
# Jeder ueberzaehlige Schnitt sind Daten, die jemand laedt und nie sieht.
FAMILIEN = [
    "Inter:wght@300;400;500;600;700",
    "Orbitron:wght@600;900",
    "JetBrains+Mono:wght@400;700",
    "IBM+Plex+Sans+Arabic:wght@400;500;600",
    "Noto+Kufi+Arabic:wght@600;700",
]

ADRESSE = re.compile(r"url\((https://fonts\.gstatic\.com/[^)]+)\)")

# Die Lizenzen.
#
# Alle fuenf Familien stehen unter der SIL Open Font License. Die verlangt in
# Abschnitt 2 ausdruecklich, dass Urhebervermerk und Lizenztext die
# Schriftdateien BEGLEITEN — nicht irgendwo stehen, sondern mitgeliefert
# werden. Solange sie nur von einem fremden Server kamen, stellte sich die
# Frage nicht. Seit sie im Repository liegen und an jeden Besucher
# ausgeliefert werden, ist es eine Pflicht.
#
# Geholt wird aus dem Bestand, aus dem auch die Schriften stammen.
LIZENZEN = {
    "Inter":                "ofl/inter/OFL.txt",
    "Orbitron":             "ofl/orbitron/OFL.txt",
    "JetBrains Mono":       "ofl/jetbrainsmono/OFL.txt",
    "IBM Plex Sans Arabic": "ofl/ibmplexsansarabic/OFL.txt",
    "Noto Kufi Arabic":     "ofl/notokufiarabic/OFL.txt",
}
LIZENZQUELLE = "https://raw.githubusercontent.com/google/fonts/main/"


def hole(url, kopf=None):
    anfrage = urllib.request.Request(url, headers=kopf or {"User-Agent": KENNUNG})
    with urllib.request.urlopen(anfrage, timeout=30) as antwort:
        return antwort.read()


def dateiname(url):
    """Sprechender Name statt der Google-Kennung.

    Aus …/s/inter/v20/UcC73Fw…woff2 wird inter-<letzte 12 Zeichen>.woff2.
    Die Kennung bleibt drin, damit zwei Schnitte derselben Familie nicht
    kollidieren; der Familienname davor macht das Verzeichnis lesbar.
    """
    teile = url.rstrip("/").split("/")
    familie = teile[teile.index("s") + 1] if "s" in teile else "schrift"
    return f"{familie}-{teile[-1].split('.')[0][-12:]}.woff2"


def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    stuecke = []
    geholt = 0
    uebersprungen = 0

    for familie in FAMILIEN:
        url = f"https://fonts.googleapis.com/css2?family={familie}&display=swap"
        css = hole(url).decode("utf-8")
        name = familie.split(":")[0].replace("+", " ")
        bloecke = css.count("@font-face")
        print(f"  {name:<24} {bloecke} Bloecke")

        def ersetze(treffer):
            nonlocal geholt, uebersprungen
            fern = treffer.group(1)
            datei = ZIEL / dateiname(fern)
            if datei.exists():
                uebersprungen += 1
            else:
                datei.write_bytes(hole(fern))
                geholt += 1
            return f"url('/assets/schrift/{datei.name}')"

        stuecke.append(f"/* {name} */\n" + ADRESSE.sub(ersetze, css))

    kopf = """/* ═══════════════════════════════════════════════════════════════════
   Schriften — aus dem eigenen Haus
   ERZEUGT VON Scripts/hole-schriften.py. Nicht von Hand aendern.

   Vorher kamen sie von fonts.googleapis.com. Damit ging die volle IP jedes
   Besuchers beim Seitenaufbau an Google, bevor er irgendetwas anklicken
   konnte — dazu gibt es ein Urteil des LG Muenchen I vom 20.01.2022
   (Az. 3 O 17493/20).

   Die unicode-range-Angaben stehen noch drin. Deshalb laedt ein deutscher
   Browser keine arabische Schriftdatei, ohne dass irgendwo eine Weiche
   steht — der Browser entscheidet das selbst anhand der Zeichen auf der
   Seite.
   ═══════════════════════════════════════════════════════════════════ */

"""
    ziel = ZIEL / "schriften.css"
    io.open(ziel, "w", encoding="utf-8", newline="\n").write(kopf + "\n".join(stuecke))

    # Und die Lizenzen dazu, in einer Datei neben den Schriften.
    teile = ["""SIL OPEN FONT LICENSE — die Schriften dieser Seite

Alle Schriften unter /assets/schrift/ stehen unter der SIL Open Font License
Version 1.1. Deren Abschnitt 2 verlangt, dass dieser Vermerk und der
Lizenztext die Schriftdateien begleiten. Genau dafuer gibt es diese Datei.

Geaendert wurde nichts: Es sind die unveraenderten woff2-Dateien, wie Google
Fonts sie ausliefert. Die Auswahl der Zeichenbereiche uebernimmt der Browser
anhand der unicode-range-Angaben in schriften.css.

Erzeugt von Scripts/hole-schriften.py.
"""]
    for name, pfad in LIZENZEN.items():
        try:
            text = hole(LIZENZQUELLE + pfad).decode("utf-8")
        except Exception as f:
            print(f"  ! Lizenz fuer {name} nicht erreichbar: {type(f).__name__}")
            continue
        strich = "=" * 70
        teile.append(f"{strich}\n{name}\n{strich}\n\n{text}")
    io.open(ZIEL / "LIZENZEN.txt", "w", encoding="utf-8",
            newline="\n").write("\n\n".join(teile))
    print(f"  {len(teile) - 1} Lizenztexte in LIZENZEN.txt")

    gesamt = sum(p.stat().st_size for p in ZIEL.glob("*.woff2"))
    dateien = len(list(ZIEL.glob("*.woff2")))
    print()
    print(f"  {geholt} Schriftdateien geholt, {uebersprungen} schon da")
    print(f"  {dateien} Dateien, {gesamt/1024:.0f} KiB gesamt — "
          f"davon laedt ein Besucher nur, was seine Sprache braucht")
    print(f"  {ziel.relative_to(ROOT)} geschrieben")
    return 0


if __name__ == "__main__":
    sys.exit(main())
