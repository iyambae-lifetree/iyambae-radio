#!/usr/bin/env python3
"""Baut den Feed „Neu im Laden“: /feed/<sprache>.xml — ein RSS je Sprache.

WOZU ER DA IST

Wer einmal im Laden war und einen Feedleser hat, soll merken, wenn neue
Platten im Regal stehen, ohne nachsehen zu müssen. Ein Wochenbrief per Mail
käme dem am nächsten, braucht aber einen Versanddienst und eine Einwilligung.
Ein Feed braucht nichts davon: Der Leser holt ihn selbst ab, die Seite
erfährt nicht, wer ihn liest, und es wird nichts auf einem Gerät abgelegt.

WAS DRINSTEHT

Die Sender, die nach der Eröffnung dazugekommen sind, die neuesten zuerst,
höchstens HOECHSTENS Stück. Jeder Eintrag trägt den Namen, das Kärtchen in
der Sprache des Feeds, das Regal und einen Link, der den Sender im Radio
auflegt (#platte=<id>, dieselbe Adresse wie „Weitergeben“).

Das Datum kommt aus dem Feld `seit` in data/sender.json. Für die Sender bis
15.10.2026 ist es aus der Geschichte des Repositorys nachgetragen: der erste
Stand, in dem die Kennung vorkommt. Die 142 Sender des ersten
veröffentlichten Standes (21.08.2026) gelten als Grundbestand und stehen
nicht im Feed. Ein Feed, der 142 Sender als „neu“ meldet, wäre bei der
ersten Abfrage eine Lawine und danach wertlos.

WAS ER NICHT TUT

Keine Uhrzeit von heute. `lastBuildDate` ist das Datum des jüngsten
Eintrags, nicht der Zeitpunkt des Baus. Sonst sähe jeder Feedleser bei jedem
Ausrollen einen geänderten Feed, ohne dass etwas Neues im Regal steht.

Alles Gemeinsame mit dem Radio (Sprachtabelle, fuelle()) kommt aus
baue-sprachen.py und wird nicht wiederholt.

Aufruf:
    python3 Scripts/baue-neu-im-laden.py            erzeugen
    python3 Scripts/baue-neu-im-laden.py --pruefe   nur prüfen, nichts schreiben
"""

import datetime
import importlib.util
import io
import json
import pathlib
import shutil
import sys
import xml.etree.ElementTree as ET
from email.utils import format_datetime
from xml.sax.saxutils import escape

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
ADRESSE = "https://iyambae.fm"
HOECHSTENS = 50


def _lade_geschwister():
    """baue-sprachen.py laden. Der Bindestrich verbietet ein schlichtes
    import, deshalb der Umweg über importlib (wie in baue-regale.py)."""
    p = ROOT / "Scripts" / "baue-sprachen.py"
    spec = importlib.util.spec_from_file_location("baue_sprachen", p)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


RADIO = _lade_geschwister()
SPRACHEN = RADIO.SPRACHEN
fuelle = RADIO.fuelle


def lies_json(pfad):
    return json.loads(io.open(pfad, encoding="utf-8").read())


def rfc822(tag):
    """2026-10-12 → „Mon, 12 Oct 2026 12:00:00 +0000“. Mittag statt
    Mitternacht: Ein Leser in Los Angeles zeigte sonst den Vortag."""
    d = datetime.date.fromisoformat(tag)
    return format_datetime(datetime.datetime(d.year, d.month, d.day, 12,
                                             tzinfo=datetime.timezone.utc))


def neue_sender(katalog):
    """Was nach dem Grundbestand dazukam, die neuesten zuerst."""
    lebend = [s for s in katalog["sender"] if s.get("status") != "tot"]
    eroeffnung = min(s["seit"] for s in katalog["sender"])
    neu = [s for s in lebend if s["seit"] > eroeffnung]
    # Gleiches Datum: nach Name, damit der Feed bei jedem Bau gleich aussieht.
    neu.sort(key=lambda s: s["name"].casefold())
    neu.sort(key=lambda s: s["seit"], reverse=True)
    return neu[:HOECHSTENS]


def baue_feed(kuerzel, sender, katalog, texte, uebersetzt):
    def t(schluessel, **werte):
        return fuelle(texte.get(schluessel, schluessel), **werte)

    regalname = {r["id"]: uebersetzt.get("regalname", {}).get(r["id"]) or r["name"]
                 for r in katalog["regale"]}
    kanal = f"{ADRESSE}/{kuerzel}/"
    selbst = f"{ADRESSE}/feed/{kuerzel}.xml"
    zuletzt = sender[0]["seit"] if sender else katalog.get("_geprueft_am")

    z = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
         '<channel>',
         f'  <title>{escape(t("fuss.rss.titel"))}</title>',
         f'  <link>{kanal}</link>',
         f'  <atom:link href="{selbst}" rel="self" type="application/rss+xml"/>',
         f'  <description>{escape(t("feed.beschreibung"))}</description>',
         f'  <language>{kuerzel}</language>',
         f'  <lastBuildDate>{rfc822(zuletzt)}</lastBuildDate>',
         f'  <image><url>{ADRESSE}/icon-192.png</url>'
         f'<title>{escape(t("fuss.rss.titel"))}</title><link>{kanal}</link></image>']
    for s in sender:
        kaertchen = uebersetzt.get("sender", {}).get(s["id"]) or s["kaertchen"]
        regal = regalname.get(s["regal"], s["regal"])
        # „unbekannt“ steht im Katalog auf Deutsch; im Feed lieber nur das Land.
        ort = ", ".join(x for x in (s.get("ort"), s.get("land")) if x and x != "unbekannt")
        beschreibung = f"{kaertchen}\n\n{ort} · {t('feed.regal', regal=regal)}"
        z += ['  <item>',
              f'    <title>{escape(s["name"])}</title>',
              f'    <link>{kanal}#platte={s["id"]}</link>',
              f'    <guid isPermaLink="false">iyambae-fm-{s["id"]}</guid>',
              f'    <pubDate>{rfc822(s["seit"])}</pubDate>',
              f'    <category>{escape(regal)}</category>',
              f'    <description>{escape(beschreibung)}</description>',
              '  </item>']
    z += ['</channel>', '</rss>', '']
    return "\n".join(z)


def pruefe_feed(kuerzel, quelle, erwartet):
    """Der Feed muss als XML lesbar sein und genau die erwarteten Einträge
    tragen. Ein kaputter Feed fällt sonst erst im Leser eines Fremden auf."""
    try:
        wurzel = ET.fromstring(quelle.encode("utf-8"))
    except ET.ParseError as e:
        print(f"  ✘ /feed/{kuerzel}.xml ist kein gültiges XML: {e}")
        return False
    eintraege = wurzel.findall("./channel/item")
    gut = True
    if len(eintraege) != erwartet:
        print(f"  ✘ /feed/{kuerzel}.xml: {len(eintraege)} Einträge statt {erwartet}")
        gut = False
    for e in eintraege:
        for feld in ("title", "link", "guid", "pubDate", "description"):
            if not (e.findtext(feld) or "").strip():
                print(f"  ✘ /feed/{kuerzel}.xml: ein Eintrag ohne {feld}")
                gut = False
        if not e.findtext("link", "").startswith(f"{ADRESSE}/{kuerzel}/#platte="):
            print(f"  ✘ /feed/{kuerzel}.xml: Link zeigt nicht ins Radio: {e.findtext('link')}")
            gut = False
    return gut


def main():
    nur_pruefen = "--pruefe" in sys.argv
    katalog = lies_json(ROOT / "data" / "sender.json")

    ohne = [s["id"] for s in katalog["sender"] if not s.get("seit")]
    if ohne:
        print(f"  ✘ {len(ohne)} Sender ohne `seit` in data/sender.json: {', '.join(ohne[:5])}")
        return 1

    grund = lies_json(ROOT / "assets" / "lang" / "de.json")
    sender = neue_sender(katalog)
    feeds, gut = {}, True
    for kuerzel in SPRACHEN:
        texte = {**grund, **lies_json(ROOT / "assets" / "lang" / f"{kuerzel}.json")}
        q = ROOT / "data" / f"sender-texte.{kuerzel}.json"
        uebersetzt = lies_json(q) if kuerzel != "de" and q.exists() else {}
        feeds[kuerzel] = baue_feed(kuerzel, sender, katalog, texte, uebersetzt)
        if not pruefe_feed(kuerzel, feeds[kuerzel], len(sender)):
            gut = False

    if not gut:
        print("\n  Nichts geschrieben — der alte Stand bleibt stehen.")
        return 1
    print(f"  ✔ {len(SPRACHEN)} Feeds mit je {len(sender)} Einträgen bestehen die Prüfung"
          + (f", der jüngste vom {sender[0]['seit']}" if sender else ""))
    if nur_pruefen:
        print("  ✔ nur geprüft, nichts geschrieben")
        return 0

    ordner = ROOT / "feed"
    # Alten Stand räumen, damit eine entfernte Sprache keine Leiche hinterlässt.
    if ordner.exists():
        shutil.rmtree(ordner)
    ordner.mkdir()
    for kuerzel, quelle in feeds.items():
        io.open(ordner / f"{kuerzel}.xml", "w", encoding="utf-8", newline="\n").write(quelle)
        print(f"  ✔ /feed/{kuerzel}.xml  {len(quelle):>6} Zeichen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
