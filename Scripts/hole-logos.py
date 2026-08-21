#!/usr/bin/env python3
"""
Holt fehlende Senderlogos von den Senderseiten.

Derselbe Weg wie beim Bestand: Die meisten Sender hinterlegen ein
`apple-touch-icon` oder ein `og:image` — das sind Bilder, die sie selbst für
die Darstellung durch andere vorgesehen haben.

Aufruf:
    python3 Scripts/hole-logos.py            nur fehlende
    python3 Scripts/hole-logos.py --alle     auch vorhandene erneuern

Was NICHT geholt wird: irgendein Bild von der Seite. Nur ausdrücklich als
Symbol oder Vorschaubild ausgezeichnete. Ein Zufallsbild aus dem Inhalt wäre
schlechter als gar keins — die Hausmarke ist besser als ein Werbebanner.

Ergebnisse unter 256 px werden verworfen. Eine Kachel wird auf Bildschirmen
mit doppelter Dichte größer dargestellt als sie misst; kleiner sieht matschig
aus, und matschig ist schlimmer als gestaltet.
"""
import concurrent.futures
import io
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOGOS = ROOT / "assets" / "logos"
KENNUNG = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
ZEITLIMIT = 15
MINDESTKANTE = 256
ZIELKANTE = 512


def hole(url, grenze=400_000):
    anfrage = urllib.request.Request(url, headers={"User-Agent": KENNUNG})
    with urllib.request.urlopen(anfrage, timeout=ZEITLIMIT) as antwort:
        return antwort.read(grenze), antwort.url


def finde_bildadresse(html, basis):
    """Nur ausdrücklich ausgezeichnete Symbole und Vorschaubilder."""
    kandidaten = []

    # apple-touch-icon: meist quadratisch und in guter Auflösung
    for treffer in re.finditer(
            r'<link[^>]+rel=["\']?apple-touch-icon[^"\'>]*["\']?[^>]*>', html, re.I):
        m = re.search(r'href=["\']([^"\']+)', treffer.group(0), re.I)
        groesse = re.search(r'sizes=["\'](\d+)', treffer.group(0), re.I)
        if m:
            kandidaten.append((int(groesse.group(1)) if groesse else 180,
                               "apple-touch-icon", m.group(1)))

    # og:image: für die Darstellung durch andere gedacht, oft groß
    for treffer in re.finditer(
            r'<meta[^>]+property=["\']og:image["\'][^>]*>', html, re.I):
        m = re.search(r'content=["\']([^"\']+)', treffer.group(0), re.I)
        if m:
            kandidaten.append((600, "og:image", m.group(1)))

    # icon als letzte Wahl — oft nur ein Favicon
    for treffer in re.finditer(
            r'<link[^>]+rel=["\'][^"\']*\bicon\b[^"\']*["\'][^>]*>', html, re.I):
        m = re.search(r'href=["\']([^"\']+)', treffer.group(0), re.I)
        groesse = re.search(r'sizes=["\'](\d+)', treffer.group(0), re.I)
        if m:
            kandidaten.append((int(groesse.group(1)) if groesse else 32,
                               "icon", m.group(1)))

    kandidaten.sort(reverse=True)
    return [(quelle, urllib.parse.urljoin(basis, adresse))
            for _, quelle, adresse in kandidaten]


def verarbeite(sender):
    name, kennung, seite = sender["name"], sender["id"], sender.get("homepage")
    if not seite:
        return (kennung, name, None, "keine Senderseite hinterlegt")

    try:
        roh, endgueltig = hole(seite, 300_000)
        html = roh.decode("utf-8", "replace")
    except Exception as f:
        return (kennung, name, None, f"Seite nicht erreichbar: {type(f).__name__}")

    for quelle, adresse in finde_bildadresse(html, endgueltig)[:4]:
        try:
            bilddaten, _ = hole(adresse)
            bild = Image.open(io.BytesIO(bilddaten))
            bild.load()
        except Exception:
            continue

        if min(bild.size) < MINDESTKANTE:
            continue

        # Quadratisch beschneiden, dann auf Zielkante bringen.
        kante = min(bild.size)
        links = (bild.width - kante) // 2
        oben = (bild.height - kante) // 2
        bild = bild.crop((links, oben, links + kante, oben + kante))
        if kante > ZIELKANTE:
            bild = bild.resize((ZIELKANTE, ZIELKANTE), Image.LANCZOS)
        if bild.mode not in ("RGB", "RGBA"):
            bild = bild.convert("RGBA")

        ziel = LOGOS / f"{kennung}.webp"
        bild.save(ziel, "WEBP", quality=88, method=6)
        return (kennung, name, {"logo": f"assets/logos/{kennung}.webp",
                                "logoQuelle": quelle,
                                "kante": bild.size[0]}, None)

    return (kennung, name, None, f"nichts Brauchbares gefunden (unter {MINDESTKANTE} px oder keins)")


def main():
    alle = "--alle" in sys.argv
    p = ROOT / "data" / "sender.json"
    d = json.loads(p.read_text(encoding="utf-8"))
    LOGOS.mkdir(parents=True, exist_ok=True)

    offen = [s for s in d["sender"] if alle or not s.get("logo")]
    print(f"  {len(offen)} Sender ohne Bild, hole von den Senderseiten")
    print()

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        ergebnisse = list(pool.map(verarbeite, offen))

    nach_id = {s["id"]: s for s in d["sender"]}
    geholt = 0
    for kennung, name, treffer, grund in ergebnisse:
        if treffer:
            nach_id[kennung]["logo"] = treffer["logo"]
            nach_id[kennung]["logoQuelle"] = treffer["logoQuelle"]
            geholt += 1
            print(f"  ✔ {name[:34]:<34} {treffer['kante']}px  {treffer['logoQuelle']}")
        else:
            print(f"  · {name[:34]:<34} {grund}")

    if geholt:
        p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    ohne = sum(1 for s in d["sender"] if not s.get("logo"))
    print()
    print(f"  {geholt} geholt. Jetzt {len(d['sender']) - ohne} von {len(d['sender'])} "
          f"Sendern mit Bild, {ohne} bekommen eine gestaltete Huelle.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
