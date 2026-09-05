#!/usr/bin/env python3
"""Misst nach, was wirklich live liegt — beide Haeuser, jede Adresse.

WOZU, WENN DER BAU SICH DOCH SELBST PRUEFT

Der Bau prueft den Quellbaum. Diese Datei prueft das Ergebnis im Netz, und
das ist etwas anderes: Zwischen beiden liegen ein Abbild, eine Auslieferung,
ein nginx und ein Zwischenspeicher.

Der Lauf in .github/workflows/ausliefern.yml misst bisher zwei Dateien
byte-genau nach und ob die sieben Werkzeugseiten antworten. Am 04.09.2026
sind an einem Tag 84 Radio-Adressen (davon 77 Regalseiten) und 63
Werkzeugadressen daraus geworden — von denen keine einzige geprueft wurde.

WAS GEPRUEFT WIRD

    1. robots.txt, sitemap.xml und llms.txt antworten auf beiden Haeusern
    2. JEDE Adresse aus beiden Sitemaps antwortet mit 200
    3. keine Seite traegt einen Schluesselnamen als sichtbaren Text
    4. keine Seite ist verdaechtig kurz
    5. die drei Rechtsseiten antworten

Die Liste der Adressen kommt aus den Sitemaps, nicht aus dieser Datei. Ein
neues Regal, eine neue Werkzeugseite: beide werden mitgeprueft, ohne dass
hier jemand etwas nachtraegt.

ZU PUNKT 3, weil er der Grund fuer diese Datei war

Am 04.09.2026 stand auf sechs von sieben Sprachseiten des Radios woertlich
`menue.eltern` im Menue — der Schluesselname selbst, weil der Schluessel im
deutschen Katalog fehlte. Der Bau liess es durch. `pruefe_seite()` in
baue-sprachen.py faengt es jetzt beim Bauen; hier wird zusaetzlich am
Ausgelieferten nachgesehen, denn ein Zwischenspeicher kann eine alte Seite
weiterreichen, die der neue Bau laengst nicht mehr erzeugen wuerde.

Aufruf:  python3 Scripts/pruefe-live.py
"""

import concurrent.futures
import io
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

HAEUSER = ("https://iyambae.fm", "https://apps.iyambae.fm")
RECHT = ("/recht/impressum/", "/recht/datenschutz/",
         "/recht/verarbeitungsverzeichnis/")

# Ungelistete Seiten stehen in keiner Sitemap und werden deshalb von der
# Schleife oben nicht erfasst. Erreichbar sein muessen sie trotzdem: Jemand
# hat ihren Verweis bekommen und wuerde sonst vor einer 404 stehen, ohne
# dass es irgendwo auffaellt.
UNGELISTET = ("https://apps.iyambae.fm/de/eltern-wien/",)
RAUM = "{http://www.sitemaps.org/schemas/sitemap/0.9}"

# Eine Seite unter dieser Groesse ist keine Seite. Die kleinste echte
# (eine Regalseite mit neun Sendern) liegt bei rund 17.000 Zeichen.
MINDESTLAENGE = 3000

# Was wie ein Schluesselname aussieht: zwei bis vier Wortteile mit Punkten,
# als alleiniger Inhalt eines Elements. Dateinamen und Hausadressen sehen
# genauso aus und sind keine — deshalb die Ausnahmen.
SCHLUESSELMUSTER = re.compile(r">\s*([a-z]{2,12}(?:\.[a-z0-9]+){1,3})\s*<")
KEINE_SCHLUESSEL = (".fm", ".com", ".org", ".net", ".at", ".de",
                    ".xsl", ".json", ".js", ".css", ".svg", ".webp",
                    ".mjs", ".py", ".txt", ".xml", ".webmanifest")


def hole(adresse, versuche=2):
    """Einmal wiederholen, bevor etwas als kaputt gilt.

    Ein einzelner Aussetzer im Netz ist kein Grund, eine gesunde
    Auslieferung als fehlerhaft zu melden — und diese Pruefung soll man
    ernst nehmen koennen, wenn sie einmal anschlaegt.
    """
    letzter = ""
    for _ in range(versuche):
        try:
            bitte = urllib.request.Request(
                adresse, headers={"User-Agent": "IYAMBAE-Nachmessung"})
            with urllib.request.urlopen(bitte, timeout=30) as antwort:
                return antwort.status, antwort.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as fehl:
            return fehl.code, ""
        except Exception as fehl:          # Zeitueberschreitung, DNS, TLS
            letzter = str(fehl)
    return 0, letzter


def pruefe_seite(adresse):
    """Eine Adresse. Gibt eine Liste von Beanstandungen zurueck."""
    code, seite = hole(adresse)
    if code != 200:
        return [f"{adresse} → HTTP {code}"]

    schlecht = []
    if len(seite) < MINDESTLAENGE:
        schlecht.append(f"{adresse}: nur {len(seite)} Zeichen")

    gefunden = [k for k in SCHLUESSELMUSTER.findall(seite)
                if not k.endswith(KEINE_SCHLUESSEL)]
    if gefunden:
        schlecht.append(f"{adresse}: Schluesselname sichtbar — "
                        f"{', '.join(sorted(set(gefunden))[:3])}")
    return schlecht


def adressen_aus_sitemap(haus):
    code, roh = hole(f"{haus}/sitemap.xml")
    if code != 200:
        return None
    return [e.text for e in ET.fromstring(roh).iter(f"{RAUM}loc")]


def main():
    beanstandet = []

    for haus in HAEUSER:
        print(f"\n══ {haus} ══")
        for datei in ("robots.txt", "sitemap.xml", "llms.txt"):
            code, _ = hole(f"{haus}/{datei}")
            zeichen = "✔" if code == 200 else "✘"
            print(f"  {zeichen} {datei:<14} {code}")
            if code != 200:
                beanstandet.append(f"{haus}/{datei} → HTTP {code}")

        adressen = adressen_aus_sitemap(haus)
        if adressen is None:
            beanstandet.append(f"{haus}/sitemap.xml nicht lesbar")
            continue

        # Nebenlaeufig, sonst dauert die Pruefung laenger als die
        # Auslieferung. Acht gleichzeitig ist hoeflich gegen den eigenen
        # Server und trotzdem schnell.
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as gruppe:
            ergebnisse = list(gruppe.map(pruefe_seite, adressen))
        schlecht = [x for liste in ergebnisse for x in liste]

        print(f"  {'✔' if not schlecht else '✘'} {len(adressen)} Adressen aus "
              f"der Sitemap, {len(schlecht)} beanstandet")
        for satz in schlecht[:8]:
            print(f"      ✘ {satz}")
        beanstandet += schlecht

    print("\n══ Was zum Laden angeboten wird ══")
    #
    # Am 05.09.2026 bot die Seite 0.21.1 an, waehrend 0.27.1 veroeffentlicht
    # war. Der Grund war nicht die alte Nummer: 0.27.1 lag gar nicht im
    # Speicher. Eine Nummer laesst sich pflegen — dass die Datei WIRKLICH
    # DA IST, sagt nur ein Abruf.
    import json as _json
    stand = _json.loads(io.open("data/fassungen.json", encoding="utf-8").read())
    for name, wie in stand["tuner"].items():
        datei = wie.get("datei")
        if not datei:
            print(f"  · {name:<8} nichts zum Laden ({wie['reife']})")
            continue
        adresse = f"https://apps.iyambae.fm/herunterladen/{datei}"
        code, _ = hole(adresse)
        zeichen = "✔" if code == 200 else "✘"
        print(f"  {zeichen} {name:<8} {wie['fassung']:<9} {code}  {datei}")
        if code != 200:
            beanstandet.append(f"{adresse} → HTTP {code} — angeboten, aber nicht da")

    print("\n══ Ungelistete Seiten ══")
    for adresse in UNGELISTET:
        beanstandet += pruefe_seite(adresse)
        code, seite = hole(adresse)
        hat_noindex = "noindex" in seite
        zeichen = "✔" if code == 200 and hat_noindex else "✘"
        print(f"  {zeichen} {adresse}  {code}, noindex: {hat_noindex}")
        if code == 200 and not hat_noindex:
            beanstandet.append(f"{adresse} ist ungelistet, traegt aber kein noindex")

    print("\n══ Rechtstexte ══")
    for pfad in RECHT:
        code, _ = hole(f"{HAEUSER[0]}{pfad}")
        zeichen = "✔" if code == 200 else "✘"
        print(f"  {zeichen} {pfad:<36} {code}")
        if code != 200:
            beanstandet.append(f"{pfad} → HTTP {code}")

    print()
    if beanstandet:
        print(f"  ✘ {len(beanstandet)} Beanstandungen.")
        return 1
    print("  ✔ Alles ausgeliefert, nichts zu beanstanden.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
