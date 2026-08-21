#!/usr/bin/env python3
"""
Erzeugt je Sprache eine eigene Seite unter /<kuerzel>/ — aus index.html und
assets/lang/<kuerzel>.json.

WARUM ÜBERHAUPT EIGENE SEITEN

Bis hierher stand die Seite unter / und tauschte ihre Texte erst, wenn
Programmcode lief. Das hatte drei Folgen, und alle drei sind hier gemeint:

  1. Ein Suchmaschinen-Crawler ohne JavaScript sah durchgängig Deutsch —
     Titel, Beschreibung, Fließtext. Sieben Sprachen, eine Adresse, ein
     Eintrag im Index.
  2. Eine Adresse ließ sich nicht in einer Sprache teilen. Wer einem
     französischen Bekannten den Laden schickte, schickte ihm Deutsch.
  3. Der Installationsdialog des Browsers liest das Manifest, BEVOR
     Programmcode läuft. Es war deutsch, für alle.

Mit /de/, /en/, /fr/, /es/, /it/, /ja/, /ar/ ist jede Sprache eine Adresse.
nginx leitet von / aus anhand von Accept-Language dorthin — aber NUR von /,
niemals von einem Sprachpfad weg. Wer /en/ aufruft, bekommt Englisch, auch
mit deutschem Browser. Das ist der Unterschied zwischen Erkennen und
Bevormunden.

WAS HIER NICHT GEMACHT WIRD

Keine zweite Kopie von assets/, data/ oder sw.js. Die Sprachseiten sind
dünne Einstiege auf denselben Bestand; deshalb werden alle Pfade darin
absolut (/assets/…), sonst suchte /de/index.html unter /de/assets/.

TREUE DER ERZEUGUNG

Der Erzeuger prüft sich selbst: Mit dem deutschen Katalog muss er index.html
Zeichen für Zeichen reproduzieren — bis auf die Änderungen, die er
ausdrücklich vornimmt. Weicht sonst etwas ab, hat der Zerleger die Vorlage
missverstanden, und der Lauf bricht ab. Ohne diese Probe wäre jede stille
Verformung des HTML erst im Browser aufgefallen.

Aufruf:
    python3 Scripts/baue-sprachen.py            erzeugen
    python3 Scripts/baue-sprachen.py --pruefe   nur prüfen, nichts schreiben
"""
import html
import io
import json
import pathlib
import re
import shutil
import sys
from html.parser import HTMLParser

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Schreibrichtung je Sprache. Steht hier UND in assets/lib/sprache.mjs — der
# Erzeuger schreibt sie ins <html>, das Modul braucht sie zur Laufzeit fuer
# den Umschalter. Scripts/pruefe-sprachen.py haelt beide gegeneinander.
SPRACHEN = {
    "de": ("Deutsch",  "ltr"),
    "en": ("English",  "ltr"),
    "fr": ("Français", "ltr"),
    "es": ("Español",  "ltr"),
    "it": ("Italiano", "ltr"),
    "ja": ("日本語",    "ltr"),
    "ar": ("العربية",   "rtl"),
}

# Welche Sprache ein Crawler bekommt, der keine angibt. Englisch, nicht
# Deutsch: Die Seite hat Hoerer in 29 Laendern, und wer keine Sprache nennt,
# ist mit hoher Wahrscheinlichkeit kein deutscher Browser.
X_DEFAULT = "en"

# Elemente ohne Schlusstag. Ohne diese Liste zaehlt die Tiefenverfolgung
# falsch, und ein data-text-Element bekaeme den Text eines Nachbarn.
LEER = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr",
        # aus dem eingebetteten SVG
        "path", "circle", "ellipse", "line", "polygon", "polyline", "rect",
        "stop", "use"}

ATTRIBUT_VON_DATEN = {
    "data-platzhalter": "placeholder",
    "data-titel":       "title",
    "data-aria":        "aria-label",
    "data-inhalt":      "content",
}


class Zerleger(HTMLParser):
    """Zerlegt das Dokument in Stuecke, die sich wieder zusammensetzen lassen.

    convert_charrefs=False ist entscheidend: Sonst wuerde &amp; beim Lesen zu
    & und beim Schreiben nicht zurueckverwandelt — das Dokument waere nach
    einem Durchlauf kaputt, und zwar unauffaellig.
    """

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stuecke = []          # [{art, roh, tag, attr}]

    def _leg_ab(self, art, roh, tag=None, attr=None):
        self.stuecke.append({"art": art, "roh": roh, "tag": tag, "attr": attr or {}})

    def handle_starttag(self, tag, attrs):
        art = "leer" if tag in LEER else "start"
        self._leg_ab(art, self.get_starttag_text(), tag, dict(attrs))
        if art == "start":
            # Ein leerer Platzhalter fuer den Fall, dass das Element gar keinen
            # Text hat — ein Symbol-span etwa. Beim Zusammensetzen traegt er
            # nichts bei (leer bleibt leer). Ohne ihn muesste setze_text() ein
            # Stueck EINFUEGEN, und das verschoebe alle folgenden Indizes
            # mitten im Durchlauf. Genau daran ist der erste Lauf gescheitert:
            # nach dem ersten leeren Element zeigte jeder Index daneben.
            self._leg_ab("text", "")

    def handle_startendtag(self, tag, attrs):
        self._leg_ab("leer", self.get_starttag_text(), tag, dict(attrs))

    def handle_endtag(self, tag):
        # Ein Schlusstag zu einem Leerelement kommt in gueltigem HTML nicht
        # vor; taeuchte er auf, wuerde er die Tiefe verschieben.
        if tag in LEER:
            return
        self._leg_ab("ende", f"</{tag}>", tag)

    def handle_data(self, daten):        self._leg_ab("text", daten)
    def handle_entityref(self, name):    self._leg_ab("text", f"&{name};")
    def handle_charref(self, name):      self._leg_ab("text", f"&#{name};")
    def handle_comment(self, daten):     self._leg_ab("roh", f"<!--{daten}-->")
    def handle_decl(self, daten):        self._leg_ab("roh", f"<!{daten}>")
    def handle_pi(self, daten):          self._leg_ab("roh", f"<?{daten}>")
    def unknown_decl(self, daten):       self._leg_ab("roh", f"<![{daten}]>")


def zusammen(stuecke):
    return "".join(s["roh"] for s in stuecke)


def ende_von(stuecke, i):
    """Index des Schlusstags zum Startstueck i."""
    tiefe = 0
    for j in range(i + 1, len(stuecke)):
        art, tag = stuecke[j]["art"], stuecke[j]["tag"]
        if art == "start" and tag == stuecke[i]["tag"]:
            tiefe += 1
        elif art == "ende" and tag == stuecke[i]["tag"]:
            if tiefe == 0:
                return j
            tiefe -= 1
    raise ValueError(f"kein Schlusstag zu <{stuecke[i]['tag']}>")


def setze_text(stuecke, i, text):
    """Nur den ersten nicht-leeren Textknoten tauschen.

    Genau dieselbe Regel wie setzeText() in assets/lib/sprache.mjs — und aus
    demselben Grund: Knoepfe tragen neben ihrem Wort ein Zeichen oder einen
    Zaehler in eigenem <span>. Wer den ganzen Inhalt ersetzt, wirft beides
    weg. Der Abstand um den Text bleibt stehen, sonst klebt das Zeichen am
    Wort.

    Die beiden Fassungen MUESSEN uebereinstimmen: Die erzeugte Seite ist der
    erste Anblick, das Modul zeichnet danach dasselbe noch einmal. Faenden
    sie verschiedene Knoten, spraenge der Text beim Laden.
    """
    j = ende_von(stuecke, i)
    gefunden = False
    for k in range(i + 1, j):
        s = stuecke[k]
        if s["art"] != "text" or not s["roh"].strip():
            continue
        if not gefunden:
            vorn = re.match(r"\s*", s["roh"]).group(0)
            hint = re.search(r"\s*$", s["roh"]).group(0)
            s["roh"] = vorn + html.escape(text, quote=False) + hint
            gefunden = True
        else:
            s["roh"] = ""
    if not gefunden:
        # Element ohne eigenen Text — dann in den Platzhalter hinter dem
        # Starttag. Eingefuegt wird nichts, die Liste bleibt gleich lang.
        stuecke[i + 1]["roh"] = html.escape(text, quote=False)


def setze_html(stuecke, i, roh_html):
    """Fuer Saetze mit <em>/<strong> mittendrin: ganzer Inhalt raus, neuer rein."""
    j = ende_von(stuecke, i)
    for k in range(i + 1, j):
        stuecke[k]["roh"] = ""
    stuecke[i + 1]["roh"] = roh_html


def setze_attribut(stueck, name, wert):
    """Ein Attribut im Starttag ersetzen oder ergaenzen — nur an diesem Tag."""
    roh, tag = stueck["roh"], stueck["tag"]
    ersatz = f'{name}="{html.escape(wert, quote=True)}"'
    muster = re.compile(rf'\s{re.escape(name)}="[^"]*"')
    if muster.search(roh):
        stueck["roh"] = muster.sub(" " + ersatz, roh, count=1)
    else:
        stueck["roh"] = re.sub(rf"^<{re.escape(tag)}", f"<{tag} {ersatz}", roh, count=1)
    stueck["attr"][name] = wert


# Pfade, die im Dokument dokumentrelativ stehen. Unter /de/index.html suchte
# "assets/app.js" nach /de/assets/app.js. Absolut machen, nicht kopieren.
RELATIV = re.compile(r'(\s(?:href|src)=")(?!https?:|/|#|data:|mailto:)')


def erzeuge_seite(vorlage_quelle, kuerzel, texte, alle_kuerzel):
    zerleger = Zerleger()
    zerleger.feed(vorlage_quelle)
    zerleger.close()
    stuecke = zerleger.stuecke

    def t(schluessel, rueckfall=None):
        return texte.get(schluessel, rueckfall if rueckfall is not None else schluessel)

    _, richtung = SPRACHEN[kuerzel]

    for i, s in enumerate(list(stuecke)):
        if s["art"] not in ("start", "leer"):
            continue
        attr = s["attr"]

        if s["tag"] == "html":
            setze_attribut(s, "lang", kuerzel)
            setze_attribut(s, "dir", richtung)
            # Damit sprache.mjs die Sprache nicht aus der Adresse raten muss.
            setze_attribut(s, "data-sprache", kuerzel)

        if s["tag"] == "title":
            setze_text(stuecke, i, t("seite.titel"))

        if s["tag"] == "meta" and attr.get("name") == "description":
            setze_attribut(s, "content", t("seite.beschreibung"))
        if s["tag"] == "meta" and attr.get("property") in ("og:title", "og:description"):
            setze_attribut(s, "content", t("seite.titel" if attr["property"].endswith("title")
                                           else "seite.beschreibung"))

        if s["tag"] == "link" and attr.get("rel") == "manifest":
            setze_attribut(s, "href", f"/{kuerzel}/manifest.webmanifest")

        # Das Logo fuehrt an den Anfang DIESER Sprache, nicht nach /.
        if s["tag"] == "a" and "logo" in attr.get("class", ""):
            setze_attribut(s, "href", f"/{kuerzel}/")

        for daten, ziel in ATTRIBUT_VON_DATEN.items():
            if daten in attr:
                setze_attribut(s, ziel, t(attr[daten]))

        if "data-text" in attr:
            setze_text(stuecke, i, t(attr["data-text"]))
        if "data-html" in attr:
            setze_html(stuecke, i, t(attr["data-html"]))

    seite = zusammen(stuecke)
    seite = RELATIV.sub(r"\1/", seite)

    # Die arabischen Schriften brauchen hier keine Sonderbehandlung mehr.
    # Frueher stand ein eigener <link> auf Google Fonts im Kopf, und diese
    # Stelle schnitt ihn aus sechs von sieben Seiten. Seit die Schriften im
    # eigenen Haus liegen, traegt jede @font-face-Regel ihre unicode-range —
    # der Browser laedt von selbst nur, was die Zeichen auf der Seite
    # verlangen. Eine Weiche im Erzeuger waere jetzt doppelt gemoppelt.

    # hreflang: sagt der Suchmaschine, dass dies sieben Fassungen EINER Seite
    # sind und nicht sieben duenne Seiten. Ohne das konkurrieren sie
    # gegeneinander. x-default zeigt auf /, wo die Erkennung sitzt.
    verweise = "\n".join(
        f'    <link rel="alternate" hreflang="{k}" href="https://iyambae.fm/{k}/">'
        for k in alle_kuerzel)
    verweise += '\n    <link rel="alternate" hreflang="x-default" href="https://iyambae.fm/">'
    verweise += f'\n    <link rel="canonical" href="https://iyambae.fm/{kuerzel}/">'
    seite = seite.replace("</head>", verweise + "\n</head>", 1)

    return seite


def erzeuge_manifest(vorlage, kuerzel, texte):
    m = json.loads(vorlage)
    _, richtung = SPRACHEN[kuerzel]

    def t(schluessel):
        return texte.get(schluessel, schluessel)

    # id bleibt "/" fuer ALLE Sprachen: Es ist eine App, nicht sieben. Wer
    # aus /fr/ installiert, bekommt sie mit franzoesischem Einstieg — aber
    # nicht ein zweites Symbol neben der deutschen Fassung.
    m["id"] = "/"
    m["scope"] = "/"
    m["start_url"] = f"/{kuerzel}/"
    m["lang"] = kuerzel
    m["dir"] = richtung
    # name und short_name sind die Marke und werden nicht uebersetzt.
    m["description"] = t("seite.beschreibung")

    kurz = m.get("shortcuts", [])
    if len(kurz) >= 2:
        kurz[0].update({"name": t("griff.nadel.titel"), "short_name": t("nav.zufall"),
                        "description": t("griff.nadel.unter"),
                        "url": f"/{kuerzel}/?los=nadel"})
        kurz[1].update({"name": t("griff.meine.titel"), "short_name": t("nav.meine"),
                        "description": t("meldung.meineLeer").rstrip("."),
                        "url": f"/{kuerzel}/?los=meine"})

    for symbol in m.get("icons", []):
        symbol["src"] = "/" + symbol["src"].lstrip("./")
    for k in kurz:
        for symbol in k.get("icons", []):
            symbol["src"] = "/" + symbol["src"].lstrip("./")

    return json.dumps(m, ensure_ascii=False, indent=4) + "\n"


def pruefe_treue(vorlage_quelle):
    """Reproduziert der Zerleger die Vorlage unveraendert?

    Ohne diese Probe koennte er still ein Attribut umsortieren, ein
    Sonderzeichen aufloesen oder einen Kommentar schlucken — und niemand
    saehe es, bis der Browser die Seite anders zeichnet.
    """
    z = Zerleger()
    z.feed(vorlage_quelle)
    z.close()
    zurueck = zusammen(z.stuecke)
    if zurueck != vorlage_quelle:
        for n, (a, b) in enumerate(zip(vorlage_quelle, zurueck)):
            if a != b:
                print(f"  ✘ Zerleger verformt die Vorlage ab Zeichen {n}:")
                print(f"    Vorlage:  {vorlage_quelle[max(0,n-60):n+60]!r}")
                print(f"    Zurueck:  {zurueck[max(0,n-60):n+60]!r}")
                return False
        print(f"  ✘ Zerleger verformt die Vorlage (Laenge {len(vorlage_quelle)} "
              f"gegen {len(zurueck)})")
        return False
    return True


def main():
    nur_pruefen = "--pruefe" in sys.argv
    vorlage_quelle = io.open(ROOT / "index.html", encoding="utf-8").read()
    manifest_quelle = io.open(ROOT / "manifest.webmanifest", encoding="utf-8").read()

    if not pruefe_treue(vorlage_quelle):
        return 1
    print("  ✔ Zerleger gibt index.html unveraendert zurueck")

    kataloge = {}
    for kuerzel in SPRACHEN:
        p = ROOT / "assets" / "lang" / f"{kuerzel}.json"
        if not p.exists():
            print(f"  ✘ assets/lang/{kuerzel}.json fehlt")
            return 1
        kataloge[kuerzel] = json.loads(io.open(p, encoding="utf-8").read())

    # Fehlt einer Uebersetzung ein Schluessel, steht dort der deutsche Satz —
    # dieselbe Regel wie zur Laufzeit. Gemeldet wird es trotzdem.
    grund = kataloge["de"]
    for kuerzel, katalog in kataloge.items():
        fehlend = [k for k in grund if k not in katalog]
        wenn_zuviel = [k for k in katalog if k not in grund]
        if fehlend:
            print(f"  ! {kuerzel}: {len(fehlend)} Schluessel fehlen, deutsch als Rueckfall: "
                  f"{', '.join(fehlend[:5])}")
        if wenn_zuviel:
            print(f"  ! {kuerzel}: {len(wenn_zuviel)} unbekannte Schluessel: "
                  f"{', '.join(wenn_zuviel[:5])}")

    if nur_pruefen:
        print("  ✔ nur geprueft, nichts geschrieben")
        return 0

    for kuerzel in SPRACHEN:
        texte = {**grund, **kataloge[kuerzel]}
        ordner = ROOT / kuerzel
        # Alten Stand raeumen, damit ein entfernter Schluessel keine Leiche
        # hinterlaesst.
        if ordner.exists():
            shutil.rmtree(ordner)
        ordner.mkdir()

        seite = erzeuge_seite(vorlage_quelle, kuerzel, texte, list(SPRACHEN))
        io.open(ordner / "index.html", "w", encoding="utf-8", newline="\n").write(seite)

        manifest = erzeuge_manifest(manifest_quelle, kuerzel, texte)
        io.open(ordner / "manifest.webmanifest", "w", encoding="utf-8",
                newline="\n").write(manifest)

        rest = len(re.findall(r'data-(?:text|html|aria|titel|platzhalter|inhalt)="', seite))
        print(f"  ✔ /{kuerzel}/  {len(seite):>6} Zeichen, {rest} Auszeichnungen "
              f"fuer den zweiten Durchlauf, dir={SPRACHEN[kuerzel][1]}")

    print(f"\n  {len(SPRACHEN)} Sprachseiten und {len(SPRACHEN)} Manifeste erzeugt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
