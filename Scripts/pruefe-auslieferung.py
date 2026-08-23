#!/usr/bin/env python3
"""
Prueft, ob die Downloadseite und der Blob-Speicher dasselbe sagen.

WARUM ES DIESES SKRIPT GIBT

Am 23.08.2026 bot apps.iyambae.fm dreimal an einem Tag eine aeltere Fassung
an, als es gab:

  * morgens  iyambae-tuner-0.1.0-test.dmg, waehrend v0.7.0-test lag
  * mittags  iyambae-tuner-1.0.0-windows-setup.exe, waehrend 1.1.0 gebaut war
  * abends   IYAMBAE-Tuner-0.7.0.dmg, waehrend v0.9.0-test seit 08:27 lag

Dreimal derselbe Fehler ist kein Zufall, sondern eine fehlende Verbindung:
Die GitHub-Veroeffentlichung, der Azure-Blob und der Verweis auf der Seite
sind drei Wahrheiten, und keine davon zieht die anderen nach. Der Fehler
faellt niemandem auf, weil die Seite danach genauso aussieht — nur laedt
sich jemand etwas Aelteres herunter, als es geben muesste.

WAS GEPRUEFT WIRD

  1. Jeder Ladeknopf auf der Seite fuehrt zu einer Datei, die es gibt.
  2. Zu jeder verlinkten Datei steht GENAU EINE Zeile in PRUEFSUMMEN.txt.
     Zwei Zeilen waeren eine Einladung, die falsche zu nehmen; keine Zeile
     nimmt dem Besucher die Moeglichkeit nachzurechnen.
  3. In PRUEFSUMMEN.txt steht keine Zeile fuer etwas, das niemand anbietet.
  4. Fuer macOS: die verlinkte Fassung ist die neueste veroeffentlichte.

WAS NICHT GEPRUEFT WIRD, UND WARUM

Windows und Linux haben keine GitHub-Veroeffentlichung — sie werden oertlich
gebaut und von Hand gespiegelt. Fuer sie kann dieses Skript nur sagen, dass
der Verweis traegt, nicht ob er der neueste ist. Das steht in der Ausgabe,
damit niemand die Stille fuer ein Ergebnis haelt.

Mit --gruendlich wird zusaetzlich jede Datei geladen und ihre Pruefsumme
nachgerechnet. Das kostet rund 70 MB und dauert; ohne die Angabe wird nur
verglichen, was ohne Laden zu haben ist.

AUFRUF

    python3 Scripts/pruefe-auslieferung.py
    python3 Scripts/pruefe-auslieferung.py --gruendlich

Exit-Code 0 = alles stimmig. Braucht `gh` (angemeldet) fuer Punkt 4;
fehlt es, wird Punkt 4 ausdruecklich uebersprungen statt stillschweigend
weggelassen.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import urllib.request

WURZEL = pathlib.Path(__file__).resolve().parent.parent
SEITE = WURZEL / "apps" / "index.html"
HAUS = "https://apps.iyambae.fm"
REPO = "iyambae-lifetree/MyRetuner"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

gut = True


def melde(zeichen, text):
    global gut
    print(f"  {zeichen} {text}")
    if zeichen == "✘":
        gut = False


def hole(pfad, kopf_genuegt=False):
    """Holt eine Adresse. Gibt (code, laenge, inhalt) zurueck."""
    anfrage = urllib.request.Request(HAUS + pfad,
                                     method="HEAD" if kopf_genuegt else "GET")
    try:
        with urllib.request.urlopen(anfrage, timeout=60) as antwort:
            laenge = antwort.headers.get("Content-Length")
            inhalt = b"" if kopf_genuegt else antwort.read()
            return antwort.status, int(laenge) if laenge else None, inhalt
    except Exception as fehler:                      # noqa: BLE001
        return None, None, str(fehler).encode()


def verlinkte_dateien():
    """Die Dateinamen, auf die die Seite zeigt — aus der Vorlage, nicht live.

    Aus der VORLAGE, weil dieses Skript vor dem Ausrollen laufen soll: Es
    muss sagen koennen, ob der Stand, der gleich hochgeht, traegt.
    """
    quelle = SEITE.read_text(encoding="utf-8")
    namen = re.findall(r'/herunterladen/([^"\'?#]+)', quelle)
    return sorted(set(n for n in namen if not n.endswith(".txt")))


def pruefsummen():
    code, _, inhalt = hole("/herunterladen/PRUEFSUMMEN.txt")
    if code != 200:
        melde("✘", "PRUEFSUMMEN.txt ist nicht erreichbar")
        return {}
    eintraege = {}
    for zeile in inhalt.decode("utf-8").splitlines():
        teile = zeile.split(None, 1)
        if len(teile) == 2:
            eintraege.setdefault(teile[1].lstrip("*").strip(), []).append(teile[0])
    return eintraege


def neueste_mac_fassung():
    """Die neueste veroeffentlichte macOS-Fassung, oder None."""
    try:
        roh = subprocess.run(
            ["gh", "release", "list", "--repo", REPO, "--limit", "1",
             "--json", "tagName"],
            capture_output=True, text=True, timeout=60, check=True).stdout
        marken = json.loads(roh)
        if not marken:
            return None
        marke = marken[0]["tagName"]
        anhang = subprocess.run(
            ["gh", "release", "view", marke, "--repo", REPO,
             "--json", "assets", "--jq", ".assets[].name"],
            capture_output=True, text=True, timeout=60, check=True).stdout
        for name in anhang.split():
            if name.endswith(".dmg"):
                return marke, name
        return marke, None
    except Exception:                                # noqa: BLE001
        return None


def main():
    gruendlich = "--gruendlich" in sys.argv
    dateien = verlinkte_dateien()

    print("==> Ladeknoepfe der Seite")
    if not dateien:
        melde("✘", "kein einziger Verweis auf /herunterladen/ gefunden")
        return 1
    groessen = {}
    for name in dateien:
        code, laenge, _ = hole("/herunterladen/" + name, kopf_genuegt=True)
        if code == 200 and laenge:
            groessen[name] = laenge
            melde("✔", f"{name} — {laenge:,} Bytes".replace(",", "."))
        else:
            melde("✘", f"{name} — nicht erreichbar (Code {code})")

    print("\n==> Pruefsummen")
    summen = pruefsummen()
    for name in dateien:
        zeilen = summen.get(name, [])
        if len(zeilen) == 1:
            melde("✔", f"{name} — genau eine Zeile")
        elif not zeilen:
            melde("✘", f"{name} — keine Pruefsumme hinterlegt")
        else:
            melde("✘", f"{name} — {len(zeilen)} Zeilen, eine davon ist falsch")
    for name in summen:
        if name not in dateien:
            melde("✘", f"{name} — Pruefsumme fuer etwas, das niemand anbietet")

    if gruendlich:
        print("\n==> Pruefsummen nachgerechnet")
        for name in dateien:
            zeilen = summen.get(name, [])
            if len(zeilen) != 1:
                continue
            code, _, inhalt = hole("/herunterladen/" + name)
            if code != 200:
                melde("✘", f"{name} — konnte nicht geladen werden")
                continue
            ist = hashlib.sha256(inhalt).hexdigest()
            if ist == zeilen[0]:
                melde("✔", f"{name} — {ist[:16]}… stimmt")
            else:
                melde("✘", f"{name} — hinterlegt {zeilen[0][:16]}…, "
                                f"geladen {ist[:16]}…")
    else:
        print("\n==> Pruefsummen nachgerechnet: uebersprungen (--gruendlich)")

    print("\n==> Ist die neueste Fassung verlinkt?")
    neu = neueste_mac_fassung()
    if neu is None:
        melde("!", "gh nicht verfuegbar oder nicht angemeldet — nicht geprueft")
    else:
        marke, anhang = neu
        if not anhang:
            melde("!", f"{marke} hat keinen DMG-Anhang — nicht geprueft")
        elif anhang in dateien:
            melde("✔", f"macOS: {anhang} aus {marke} ist verlinkt")
        else:
            verlinkt = [d for d in dateien if d.endswith(".dmg")]
            melde("✘", f"macOS: verlinkt ist {verlinkt or 'nichts'}, "
                            f"neueste Veroeffentlichung ist {anhang} ({marke})")
    melde("!", "Windows und Linux haben keine Veroeffentlichung — "
               "fuer sie ist nur geprueft, DASS der Verweis traegt")

    print()
    if gut:
        print("  Seite, Blob und Veroeffentlichung sagen dasselbe.")
        return 0
    print("  Es passt nicht zusammen. Oben steht, wo.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
