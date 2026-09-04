#!/usr/bin/env python3
"""Baut die Regalseiten: /<sprache>/regal/<regal-id>/ — 11 x 7 = 77 Seiten.

WOZU SIE DA SIND

Bis zum 04.09.2026 hatte das Radio sieben Adressen, eine je Sprache, fuer
165 Sender in 11 Regalen. Wer "Ambient Radio Stream" suchte, fand nichts —
nicht weil der Text fehlte, sondern weil er keine eigene Adresse hatte.

WAS AUF SO EINER SEITE STEHT

Der Regalname, die Regalbeschreibung, die Sender DIESES Regals mit ihren
Kaertchen — und ein Knopf, der ins Radio fuehrt und dort zu genau dieser
Regalreihe springt. Kein Plattenspieler, keine anderen Sender.

Saemi-Ras Entscheidung vom 04.09.2026, gegen die Fassung "das Radio, aufs
Regal gefiltert": Die haette auf 77 Seiten denselben Katalog mit allen 165
Sendern getragen. Fuer eine Suchmaschine waeren das 77 fast gleiche Seiten,
und genau das entwertet sie — der Vorschlag haette gegen seinen eigenen
Zweck gearbeitet.

WOHER DER INHALT KOMMT

    data/sender.json            Regale, Sender, Kaertchen (deutsch)
    data/sender-texte.<l>.json  dieselben, uebersetzt
    data/regal-texte.json       die zwoelf feststehenden Saetze der Seite
    regal.html                  der Aufbau, mit Marken in {{...}}

Alles Gemeinsame mit dem Radio — Sprachtabelle, HAUS, guete(), fuelle() —
wird aus baue-sprachen.py geholt und nicht wiederholt.
"""

import html
import importlib.util
import io
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _lade_geschwister():
    """baue-sprachen.py laden. Der Bindestrich verbietet ein schlichtes
    import, deshalb der Umweg ueber importlib."""
    p = ROOT / "Scripts" / "baue-sprachen.py"
    spec = importlib.util.spec_from_file_location("baue_sprachen", p)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


RADIO = _lade_geschwister()
SPRACHEN = RADIO.SPRACHEN
X_DEFAULT = RADIO.X_DEFAULT
HAUS = RADIO.HAUS
guete = RADIO.guete
fuelle = RADIO.fuelle

# Jede Marke muss in regal.html vorkommen. Die Liste ist die Pruefung:
# Fehlt eine, bricht der Bau ab, statt eine Seite mit einem sichtbaren
# {{PLATZHALTER}} auszuliefern. Mehrfach ist erlaubt — siehe
# pruefe_vorlage().
MARKEN = [
    "SPRACHE", "RICHTUNG", "TITEL", "BESCHREIBUNG", "ADRESSE",
    "SPRACHVERWEISE", "HEIM", "SPRACHWAHL_TITEL", "SPRACHWAHL",
    "AUGENBRAUE", "ZEICHEN", "NAME", "WAS", "ZAHL",
    "HOEREN_ZIEL", "HOEREN", "SATZ432", "SENDER",
    "ANDERE_TITEL", "ANDERE", "FUSS", "JSONLD",
]

# Google schneidet laengere Beschreibungen ab. Der Regaltext von "Klassik"
# ist allein schon 280 Zeichen lang — er wird gekuerzt, und zwar an einer
# Wortgrenze, nicht mitten im Wort.
BESCHREIBUNG_MAX = 155


def esc(text):
    return html.escape(str(text), quote=False)


def esc_attr(text):
    return html.escape(str(text), quote=True)


def kuerze(text, laenge):
    """Auf Laenge kuerzen, an der letzten Wortgrenze davor."""
    if len(text) <= laenge:
        return text
    schnitt = text[:laenge].rsplit(" ", 1)[0].rstrip(" ,;:—-")
    return schnitt + "…"


def lade_texte():
    d = json.loads(io.open(ROOT / "data" / "regal-texte.json",
                           encoding="utf-8").read())
    return {k: v for k, v in d.items() if not k.startswith("_")}


def lade_uebersetzung(kuerzel):
    """Die uebersetzten Regalnamen, Regaltexte und Kaertchen.

    Fuer Deutsch gibt es keine Datei — data/sender.json IST die deutsche
    Fassung. Fehlt eine Sprache, faellt jedes Feld einzeln auf Deutsch
    zurueck; das ist dieselbe Regel wie zur Laufzeit in app.js.
    """
    if kuerzel == "de":
        return {}
    p = ROOT / "data" / f"sender-texte.{kuerzel}.json"
    if not p.exists():
        return {}
    return json.loads(io.open(p, encoding="utf-8").read())


def sprachmarke(uebersetzt, gruppe, schluessel, richtung):
    """lang="de" fuer Text, den es fuer diese Sprache nicht uebersetzt gibt.

    Ohne die Angabe stuende auf der japanischen Seite deutscher Text ohne
    Kennzeichnung — ein Sprachsignal gegen das eigene hreflang. Mit ihr ist
    es ein ausgewiesenes Zitat. Dieselbe Ueberlegung wie in katalogtext()
    im Radio; dort steht sie ausfuehrlich begruendet.
    """
    if uebersetzt.get(gruppe, {}).get(schluessel):
        return ""
    marke = ' lang="de"'
    # In der arabischen Fassung erbt ein deutscher Satz sonst die
    # Leserichtung der Seite, und sein Punkt stuende am Zeilenanfang.
    if richtung == "rtl":
        marke += ' dir="ltr"'
    return marke


def adresse(kuerzel, regal_id):
    return f"{HAUS}/{kuerzel}/regal/{regal_id}/"


def sprachverweise(regal_id):
    """hreflang fuer alle sieben Fassungen plus x-default.

    Jede Seite fuehrt ALLE Fassungen auf, sich selbst eingeschlossen — ohne
    den Selbstverweis verwirft Google die Gruppe. x-default zeigt auf die
    englische Fassung, wie bei den uebrigen Seiten des Hauses.
    """
    zeilen = []
    for k in SPRACHEN:
        zeilen.append(f'    <link rel="alternate" hreflang="{k}" '
                      f'href="{adresse(k, regal_id)}">')
    zeilen.append(f'    <link rel="alternate" hreflang="x-default" '
                  f'href="{adresse(X_DEFAULT, regal_id)}">')
    return "\n".join(zeilen)


def sprachwahl(kuerzel, regal_id):
    """Die Sprachwahl fuehrt auf DASSELBE Regal, nicht auf die Startseite.

    Wer auf der japanischen Fassung von "Tiefe" auf Deutsch umschaltet, will
    "Tiefe" auf Deutsch — nicht das Radio von vorn.
    """
    zeilen = []
    for k, (name, _) in SPRACHEN.items():
        if k == kuerzel:
            zeilen.append(f'        <span aria-current="true">{esc(name)}</span>')
        else:
            zeilen.append(f'        <a href="/{k}/regal/{regal_id}/" '
                          f'hreflang="{k}" lang="{k}">{esc(name)}</a>')
    return "\n".join(zeilen)


def senderliste(drin, uebersetzt, richtung):
    zeilen = []
    for s in drin:
        kaertchen = uebersetzt.get("sender", {}).get(s["id"]) or s.get("kaertchen", "")
        marke = sprachmarke(uebersetzt, "sender", s["id"], richtung)
        angaben = f'{s["betreiber"]} · {s["ort"]}, {s["land"]} · {guete(s)}'
        zeilen.append('        <li class="sender__eintrag">')
        zeilen.append('            <div class="sender__kopf">')
        zeilen.append(f'                <h2 class="sender__name">'
                      f'<a href="{esc_attr(s["homepage"])}" rel="noopener">'
                      f'{esc(s["name"])}</a></h2>')
        if s.get("codec") == "flac":
            zeilen.append('                <span class="sender__guete">FLAC</span>')
        zeilen.append('            </div>')
        zeilen.append(f'            <p class="sender__ort">{esc(angaben)}</p>')
        if kaertchen:
            zeilen.append(f'            <p class="sender__was"{marke}>'
                          f'{esc(kaertchen)}</p>')
        etiketten = s.get("etiketten") or []
        if etiketten:
            zeilen.append('            <p class="sender__etiketten">')
            for e in etiketten:
                zeilen.append(f'                <span class="sender__etikett">'
                              f'{esc(e)}</span>')
            zeilen.append('            </p>')
        zeilen.append('        </li>')
    return "\n".join(zeilen)


def andere_regale(katalog, kuerzel, regal_id, uebersetzt):
    zeilen = ['        <ul>']
    for r in katalog["regale"]:
        if r["id"] == regal_id:
            continue
        name = uebersetzt.get("regalname", {}).get(r["id"]) or r["name"]
        zeilen.append(f'            <li><a href="/{kuerzel}/regal/{r["id"]}/">'
                      f'{esc(r.get("icon", ""))} {esc(name)}</a></li>')
    zeilen.append('        </ul>')
    return "\n".join(zeilen)


def fusszeile(t, kuerzel):
    return "\n".join([
        '    <ul>',
        f'        <li><a href="/{kuerzel}/">{esc(t["zumRadio"])}</a></li>',
        f'        <li><a href="https://apps.iyambae.fm/{kuerzel}/">'
        f'{esc(t["zumTuner"])}</a></li>',
        f'        <li><a href="/recht/impressum/">{esc(t["impressum"])}</a></li>',
        f'        <li><a href="/recht/datenschutz/">{esc(t["datenschutz"])}</a></li>',
        '    </ul>',
    ])


def jsonld(katalog, regal, drin, kuerzel, uebersetzt, name, was):
    """CollectionPage mit der ItemList DIESES Regals — mit description.

    DAS IST DER GEGENFALL ZUR GROSSEN KATALOGSEITE. Dort steht in
    katalog_jsonld() begruendet, warum die Kaertchen NICHT ins JSON-LD
    gehoeren: 165 Wiederholungen von Text, der zwei Bildschirme weiter oben
    im Rumpf steht, fuer rund 31 kB je Sprachseite.

    Hier sind es zehn bis sechsundzwanzig Eintraege, und die Seite handelt
    von nichts anderem. Die Wiederholung ist also klein und der Zusammenhang
    eindeutig.
    """
    eintraege = []
    for platz, s in enumerate(drin, start=1):
        stelle = {
            "@type": "RadioStation",
            "name": s["name"],
            "url": s["homepage"],
            "address": {
                "@type": "PostalAddress",
                "addressLocality": s["ort"],
                "addressCountry": s["land"],
            },
            "knowsAbout": name,
        }
        kaertchen = uebersetzt.get("sender", {}).get(s["id"]) or s.get("kaertchen")
        if kaertchen:
            stelle["description"] = kaertchen
        eintraege.append({"@type": "ListItem", "position": platz, "item": stelle})

    seite = adresse(kuerzel, regal["id"])
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": f"{HAUS}/#haus",
                "name": "IYAMBAE",
                "url": f"{HAUS}/",
                "logo": f"{HAUS}/icon-512.png",
            },
            {
                "@type": "CollectionPage",
                "@id": f"{seite}#seite",
                "url": seite,
                "name": name,
                "description": was,
                "inLanguage": kuerzel,
                "isPartOf": {"@id": f"{HAUS}/#haus"},
                "publisher": {"@id": f"{HAUS}/#haus"},
                "mainEntity": {"@id": f"{seite}#liste"},
            },
            {
                "@type": "ItemList",
                "@id": f"{seite}#liste",
                "name": name,
                "numberOfItems": len(drin),
                "itemListOrder": "https://schema.org/ItemListUnordered",
                "itemListElement": eintraege,
            },
        ],
    }
    roh = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))
    # Jedes "<" maskieren, nicht nur "</script>". Ein Kleinerzeichen in einem
    # Sendertext beendete sonst im Zweifel das Skript-Element, und der Rest
    # der Seite waere Text.
    roh = roh.replace("<", "\\u003c")
    return f'<script type="application/ld+json">{roh}</script>'


def erzeuge_seite(vorlage, katalog, regal, kuerzel, texte):
    _, richtung = SPRACHEN[kuerzel]
    uebersetzt = lade_uebersetzung(kuerzel)
    drin = [s for s in katalog["sender"] if s["regal"] == regal["id"]]

    def t(schluessel):
        return texte[schluessel][kuerzel]

    name = uebersetzt.get("regalname", {}).get(regal["id"]) or regal["name"]
    was = uebersetzt.get("regal", {}).get(regal["id"]) or regal.get("beschreibung", "")
    zahl = fuelle(t("zahl"), zahl=len(drin))
    beschreibung = kuerze(
        fuelle(t("beschreibung"), was=was, zahl=len(drin)).replace("  ", " "),
        BESCHREIBUNG_MAX)

    werte = {
        "SPRACHE": kuerzel,
        "RICHTUNG": richtung,
        "TITEL": esc_attr(fuelle(t("titel"), name=name)),
        "BESCHREIBUNG": esc_attr(beschreibung),
        "ADRESSE": adresse(kuerzel, regal["id"]),
        "SPRACHVERWEISE": sprachverweise(regal["id"]),
        "HEIM": f"/{kuerzel}/",
        "SPRACHWAHL_TITEL": esc_attr(t("sprachwahl")),
        "SPRACHWAHL": sprachwahl(kuerzel, regal["id"]),
        "AUGENBRAUE": esc(t("augenbraue")),
        "ZEICHEN": esc(regal.get("icon", "")),
        "NAME": esc(name),
        "WAS": esc(was),
        "ZAHL": esc(zahl),
        # Der Tiefverweis, den assets/app.js liest.
        "HOEREN_ZIEL": f'/{kuerzel}/#regal={regal["id"]}',
        "HOEREN": esc(t("hoeren")),
        "SATZ432": esc(t("satz432")),
        "SENDER": senderliste(drin, uebersetzt, richtung),
        "ANDERE_TITEL": esc(t("andere")),
        "ANDERE": andere_regale(katalog, kuerzel, regal["id"], uebersetzt),
        "FUSS": fusszeile({k: v[kuerzel] for k, v in texte.items()}, kuerzel),
        "JSONLD": jsonld(katalog, regal, drin, kuerzel, uebersetzt, name, was),
    }

    seite = vorlage
    for marke in MARKEN:
        seite = seite.replace("{{" + marke + "}}", werte[marke])
    return seite


def pruefe_vorlage(vorlage):
    """Jede Marke muss vorkommen — mehrfach ist erlaubt und richtig.

    Erst als "genau einmal" geschrieben, und die Pruefung schlug sofort an:
    {{TITEL}} steht im <title> UND in og:title, {{ADRESSE}} in canonical UND
    in og:url, {{SPRACHE}} in lang UND data-sprache. Das sind keine
    Versehen, sondern derselbe Wert an zwei Stellen, die ihn beide brauchen.

    Dass nichts Unersetztes uebrigbleibt, prueft pruefe_seite() am fertigen
    Ergebnis — dort gehoert es hin.
    """
    gut = True
    for marke in MARKEN:
        if "{{" + marke + "}}" not in vorlage:
            print(f"  ✘ Marke {{{{{marke}}}}} fehlt in regal.html")
            gut = False
    return gut


def pruefe_seite(seite, drin, kuerzel, regal_id):
    """Was fertig sein muss, bevor etwas geschrieben wird."""
    gut = True
    if "{{" in seite:
        rest = seite[seite.index("{{"):seite.index("{{") + 40]
        print(f"  ✘ {kuerzel}/regal/{regal_id}: unersetzte Marke — {rest!r}")
        gut = False
    for s in drin:
        if html.escape(s["name"], quote=False) not in seite:
            print(f"  ✘ {kuerzel}/regal/{regal_id}: Sender {s['name']} fehlt")
            gut = False
            break
    if f'hreflang="x-default"' not in seite:
        print(f"  ✘ {kuerzel}/regal/{regal_id}: x-default fehlt")
        gut = False
    if f'#regal={regal_id}' not in seite:
        print(f"  ✘ {kuerzel}/regal/{regal_id}: der Knopf zeigt nicht aufs Regal")
        gut = False
    return gut


def main():
    vorlage = io.open(ROOT / "regal.html", encoding="utf-8").read()
    katalog = json.loads(io.open(ROOT / "data" / "sender.json",
                                 encoding="utf-8").read())
    texte = lade_texte()

    gut = pruefe_vorlage(vorlage)

    # Jeder Satz in jeder Sprache, sonst faellt eine Fassung still auf
    # Deutsch zurueck und niemand merkt es.
    for schluessel, fassungen in texte.items():
        fehlend = [k for k in SPRACHEN if k not in fassungen]
        if fehlend:
            print(f"  ✘ regal-texte.json: {schluessel} fehlt fuer {fehlend}")
            gut = False

    # Jeder Sender muss in genau einem Regal liegen — sonst zeigen die
    # Seiten zusammen nicht den ganzen Katalog.
    bekannte = {r["id"] for r in katalog["regale"]}
    heimatlos = [s["id"] for s in katalog["sender"] if s["regal"] not in bekannte]
    if heimatlos:
        print(f"  ✘ {len(heimatlos)} Sender liegen in keinem bekannten Regal: "
              f"{', '.join(heimatlos[:5])}")
        gut = False

    # Erst alles bauen und pruefen, dann schreiben. Ein halber Stand auf der
    # Platte ist schlimmer als der alte.
    seiten = {}
    summe = 0
    for regal in katalog["regale"]:
        drin = [s for s in katalog["sender"] if s["regal"] == regal["id"]]
        summe += len(drin)
        for kuerzel in SPRACHEN:
            seite = erzeuge_seite(vorlage, katalog, regal, kuerzel, texte)
            if not pruefe_seite(seite, drin, kuerzel, regal["id"]):
                gut = False
            seiten[(regal["id"], kuerzel)] = seite

    if summe != len(katalog["sender"]):
        print(f"  ✘ die Regale zusammen zeigen {summe} Sender, der Katalog "
              f"hat {len(katalog['sender'])}")
        gut = False

    if not gut:
        print("\n  Nichts geschrieben — der alte Stand bleibt stehen.")
        return 1

    for (regal_id, kuerzel), seite in seiten.items():
        ordner = ROOT / kuerzel / "regal" / regal_id
        ordner.mkdir(parents=True, exist_ok=True)
        io.open(ordner / "index.html", "w", encoding="utf-8",
                newline="\n").write(seite)

    for regal in katalog["regale"]:
        drin = sum(1 for s in katalog["sender"] if s["regal"] == regal["id"])
        beispiel = seiten[(regal["id"], "de")]
        print(f"  ✔ regal/{regal['id']:<14} {drin:>3} Sender, "
              f"{len(SPRACHEN)} Sprachen, {len(beispiel):>6} Zeichen (de)")

    print(f"\n  {len(seiten)} Regalseiten erzeugt "
          f"({len(katalog['regale'])} Regale je {len(SPRACHEN)} Sprachen), "
          f"zusammen {summe} Sender.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
