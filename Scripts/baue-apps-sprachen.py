#!/usr/bin/env python3
"""
Erzeugt je Sprache eine eigene Seite unter apps/<kuerzel>/ — aus
apps/index.html und apps/assets/lang/<kuerzel>.json.

WARUM EIN EIGENES SKRIPT UND NICHT Scripts/baue-sprachen.py ERWEITERT

Beide Seiten machen dasselbe, aber sie machen es an verschiedenen Dingen,
und die Unterschiede sind keine Kleinigkeiten:

  * Das Radio erzeugt zusaetzlich sieben Manifeste, sitemap.xml, robots.txt
    und einen Katalogtext aus data/sender.json. Der Tuner hat nichts davon:
    kein Manifest, keinen Katalog, keine 146 Sender.
  * Die strukturierten Daten sind andere. Dort ItemList aus RadioStation,
    hier SoftwareApplication mit einem Preis von null.
  * Die Adressen sind andere. iyambae.fm gegen apps.iyambae.fm — das
    betrifft jedes hreflang, jedes canonical und jeden @id im JSON-LD.

Ein gemeinsames Skript haette daraus eine Kette von "wenn Radio, dann …"
gemacht. Der schwerere Grund ist aber der Betrieb: Bricht der Erzeuger ab,
bricht der Docker-Bau ab, und dann geht KEINE der beiden Seiten raus. Ein
Tippfehler in einem Tunertext haette das Radio mit stillgelegt.

Was hier bewusst DOPPELT steht, ist der Zerleger — rund 150 Zeilen, die es
in Scripts/baue-sprachen.py fast gleichlautend gibt. Das ist ein bekannter
Preis, kein Versehen: Solange an beiden Seiten gleichzeitig gearbeitet wird,
ist eine Kopie billiger als eine gemeinsame Abhaengigkeit, die beim
Umbauen der einen Seite die andere zerlegt. Wenn beide Staende stehen,
gehoert der Zerleger in ein eigenes Scripts/zerleger.py und beide holen ihn
sich von dort.

WAS HIER ANDERS IST ALS BEIM RADIO — UND BESSER

Beim Radio steht der deutsche Text zweimal: in index.html und in
assets/lang/de.json. Niemand prueft, dass beide dasselbe sagen; laeuft
einer davon weg, faellt es erst im Browser auf.

Hier ist apps/index.html die einzige deutsche Wahrheit. de.json wird daraus
GEERNTET (`--ernte`), nicht von Hand gepflegt. Und der Erzeuger prueft bei
jedem Lauf, dass die deutsche Fassung mit dem Katalog zeichengenau dasselbe
Dokument ergibt wie ohne ihn. Weicht ein einziges Zeichen ab, bricht der
Bau ab.

AUFRUF

    python3 Scripts/baue-apps-sprachen.py            erzeugen
    python3 Scripts/baue-apps-sprachen.py --pruefe   nur pruefen, nichts schreiben
    python3 Scripts/baue-apps-sprachen.py --ernte    de.json aus der Vorlage erneuern
"""
import html
import io
import json
import pathlib
import re
import shutil
import sys
import urllib.parse
from html.parser import HTMLParser

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
APPS = ROOT / "apps"
LANG = APPS / "assets" / "lang"

HAUS = "https://apps.iyambae.fm"
RADIO = "https://iyambae.fm"

# ── Die Seiten, die dieses Skript traegt ────────────────────────────
#
# Bis zum 31.08.2026 war es genau eine, fest verdrahtet. 432hz-radio#16
# beschreibt, warum das nicht reichte: Ein Text, der eine eigene Adresse
# verdient, bekam keine — er wurde Abschnitt einer ohnehin langen Seite.
#
# Michas Assistent hat den Umbau ausdruecklich hierher gegeben: „Ich haenge
# mich nicht selbst an dein Skript, wenn du das lieber machst."
#
# DER SCHLUESSELRAUM BLEIBT GEMEINSAM. Ein Katalog je Sprache, nicht je
# Seite: Uebersetzen ist die teure Arbeit, und sieben Dateien sind schon
# genug. Die Namensraeume trennen die Seiten (`seite.`, `mess.`), und
# ernte() faellt ueber jeden Schluessel, der in zwei Vorlagen mit
# VERSCHIEDENEM Text steht.
#
# `pfad` ist der Ordner unter der Sprachwurzel, mit Schraegstrich am Ende
# oder leer fuer die Wurzel selbst. Er landet in jedem hreflang, jedem
# canonical, jeder @id im JSON-LD und in der Sitemap.
SEITEN = {
    "": {
        "vorlage": "index.html",
        # Diese Seite beschreibt ein Programm zum Herunterladen.
        "programm": "tuner",
        # Nur hier stehen die Saetze, die rechtlich tragen muessen.
        "rueckgrat": True,
    },
    "spotify/": {
        "vorlage": "spotify.html",
        "programm": "messwerkzeug",
        "rueckgrat": True,
    },
    "samplerate/": {
        "vorlage": "samplerate.html",
        "programm": "messwerkzeug",
        "rueckgrat": True,
    },
    "berichtigungen/": {
        "vorlage": "berichtigungen.html",
        "programm": "messwerkzeug",
        "rueckgrat": True,
    },
    # Thiemos Fassung. Der staerkste Aufhaenger darin ist der Kammerton der
    # Wiener Philharmoniker — das traegt in Wien und sonst nirgends. Sie
    # bleibt deshalb DEUTSCH und UNGELISTET: erreichbar ueber ihren Verweis,
    # in keiner Sitemap, in keinem Menue, mit noindex.
    #
    # Saemi-Ra am 05.09.2026: „Bitte, in Zukunft immer checken, wie relevant
    # etwas ist, was du veroeffentlichst, sonst wird es laecherlich."
    "eltern-wien/": {
        "vorlage": "eltern-wien.html",
        "programm": "text",
        "rueckgrat": True,
        "sprachen": ["de"],
        "gelistet": False,
    },
    "eltern/": {
        "vorlage": "eltern.html",
        # WEDER Programm zum Herunterladen NOCH Werkzeug im Browser: ein
        # Text. Ein SoftwareApplication- oder WebApplication-Knoten waere
        # hier schlicht falsch — die Seite ist nichts, was man bedient.
        "programm": "text",
        "rueckgrat": True,
    },
    "gitarre/": {
        "vorlage": "gitarre.html",
        "programm": "messwerkzeug",
        "rueckgrat": True,
    },
    "solfeggio/": {
        "vorlage": "solfeggio.html",
        "programm": "messwerkzeug",
        "rueckgrat": True,
    },
    "hoertest/": {
        "vorlage": "hoertest.html",
        # Auch kein Programm zum Herunterladen — ein Pruefstand im Browser.
        "programm": "messwerkzeug",
        "rueckgrat": True,
    },
    "stimmung/": {
        "vorlage": "stimmung.html",
        # Kein Programm zum Herunterladen — das Werkzeug laeuft im Browser.
        "programm": "messwerkzeug",
        # Der Merksatz und der Medizinprodukt-Satz stehen auch hier: Sie
        # gehoeren der Marke, nicht der einen Seite.
        "rueckgrat": True,
    },
}

def sprachen_fuer(pfad):
    """Welche Sprachfassungen diese Seite hat. Standard: alle sieben.

    Eingefuehrt am 05.09.2026 nach einer Ruege von Saemi-Ra. Ich hatte eine
    Seite, deren staerkstes Argument der Kammerton der Wiener
    Philharmoniker ist, in sieben Sprachen ausgeliefert — auf der
    japanischen Fassung stand damit ein Wiener Orchester als Hauptgrund.
    Eine gute Uebersetzung macht einen lokalen Text nicht international.

    Wer eine Seite fuer einen Ort oder einen Menschen baut, gibt ihr die
    Sprache dieses Ortes. Nur die.
    """
    return SEITEN[pfad].get("sprachen") or list(SPRACHEN)


def gelistet(pfad):
    """Gehoert die Seite in Sitemap, llms.txt und Menues?

    Eine ungelistete Seite bleibt ueber ihren Verweis erreichbar, wird aber
    nirgends beworben und traegt `noindex`. Fuer Texte, die jemandem
    persoenlich gehoeren.
    """
    return SEITEN[pfad].get("gelistet", True)


# Schreibrichtung und Zahlenformat je Sprache.
#
# Das dritte Feld ist die Kennung, mit der der Schwebungsmesser im Browser
# seine Zahlen setzt (toLocaleString). Es steht hier und nicht im Skript in
# der Seite, weil es zur Sprache gehoert und nicht zur Rechnung.
#
# WARUM ARABISCH "ar-u-nu-latn" BEKOMMT: Ohne den Zusatz setzt der Browser
# ostarabische Ziffern (٤٣٢). Auf dieser Seite stehen aber die Skala, die
# Stimmungsknoepfe und die Messwerte in der Beweisleiste als fester Text in
# westarabischen Ziffern — die Anzeige wuerde als einzige ausscheren, und
# zwar mitten in derselben Ablesung. Einheitlich schlaegt hier landesueblich.
SPRACHEN = {
    "de": ("Deutsch",  "ltr", "de"),
    "en": ("English",  "ltr", "en"),
    "fr": ("Français", "ltr", "fr"),
    "es": ("Español",  "ltr", "es"),
    "it": ("Italiano", "ltr", "it"),
    "ja": ("日本語",    "ltr", "ja"),
    "ar": ("العربية",   "rtl", "ar-u-nu-latn"),
}

# Wer keine Sprache angibt, bekommt Englisch. Dieselbe Wahl wie beim Radio,
# und hier mit noch mehr Grund: Die Seite wird in englischsprachigen Foren
# verlinkt.
X_DEFAULT = "en"

# Elemente ohne Schlusstag. Ohne diese Liste zaehlt die Tiefenverfolgung
# falsch, und ein data-text-Element bekaeme den Text eines Nachbarn.
LEER = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr",
        "path", "circle", "ellipse", "line", "polygon", "polyline", "rect",
        "stop", "use"}

# data-Attribut -> echtes Attribut. Der Wert im data-Attribut ist ein
# Schluessel; er wird nachgeschlagen und in das echte Attribut geschrieben.
ATTRIBUT_VON_DATEN = {
    "data-platzhalter": "placeholder",
    "data-titel":       "title",
    "data-aria":        "aria-label",
    "data-inhalt":      "content",
    "data-alt":         "alt",
}

# data-Attribute, deren Wert AN ORT UND STELLE uebersetzt wird — das
# Attribut behaelt seinen Namen, nur der Schluessel wird zum Satz.
#
# WARUM ES SIE GIBT: Der Schwebungsmesser schreibt zur Laufzeit Text in die
# Seite ("Ton ausschalten", "keine"). Diese Woerter koennen nicht im
# Programmtext stehen, sonst spraeche der Knopf auf allen sieben Seiten
# deutsch. Sie hier ans Element zu haengen ist der kleinste Weg: kein
# zweites Sprachmodul, kein globales Objekt, kein zweiter Zeichendurchlauf —
# das Wort steht bei dem Ding, das es braucht.
SCHLUESSEL_ATTRIBUTE = ("data-an", "data-aus", "data-ruhig", "data-einheit")


class Zerleger(HTMLParser):
    """Zerlegt das Dokument in Stuecke, die sich wieder zusammensetzen lassen.

    convert_charrefs=False ist entscheidend: Sonst wuerde &amp; beim Lesen zu
    & und beim Schreiben nicht zurueckverwandelt — das Dokument waere nach
    einem Durchlauf kaputt, und zwar unauffaellig.
    """

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stuecke = []          # [{art, roh, tag, attr}]
        self._namen = []           # Stapel der echten Tag-Schreibweisen

    def _leg_ab(self, art, roh, tag=None, attr=None):
        self.stuecke.append({"art": art, "roh": roh, "tag": tag, "attr": attr or {}})

    def handle_starttag(self, tag, attrs):
        art = "leer" if tag in LEER else "start"
        self._leg_ab(art, self.get_starttag_text(), tag, dict(attrs))
        if art == "start":
            # Die ECHTE Schreibweise merken. html.parser schreibt Tagnamen
            # klein; in eingebettetem SVG heisst es aber <linearGradient>,
            # und XML unterscheidet Gross und Klein.
            roh = self.get_starttag_text() or ""
            echt = roh[1:len(tag) + 1]
            self._namen.append(echt if echt.lower() == tag else tag)
            # Ein leerer Platzhalter fuer den Fall, dass das Element gar
            # keinen Text hat. Beim Zusammensetzen traegt er nichts bei.
            # Ohne ihn muesste setze_text() ein Stueck EINFUEGEN, und das
            # verschoebe alle folgenden Indizes mitten im Durchlauf.
            self._leg_ab("text", "")

    def handle_startendtag(self, tag, attrs):
        self._leg_ab("leer", self.get_starttag_text(), tag, dict(attrs))

    def handle_endtag(self, tag):
        if tag in LEER:
            return
        echt = self._namen.pop() if self._namen else tag
        self._leg_ab("ende", f"</{echt}>", tag)

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


def _rand(roh):
    """Fuehrende und schliessende Leerzeichen eines Stuecks."""
    return re.match(r"\s*", roh).group(0), re.search(r"\s*$", roh).group(0)


def setze_text(stuecke, i, text):
    """Nur den ersten nicht-leeren Textknoten tauschen.

    Der Abstand um den Text bleibt stehen, sonst klebt ein Zeichen oder ein
    Zaehler im Nachbar-<span> am Wort. Weitere Textknoten werden geleert —
    ein Element mit ZWEI Textlaeufen kann so nicht uebersetzt werden, und
    genau darauf besteht ernte_text() unten. Wo es zwei sind, gehoert
    data-html hin.
    """
    j = ende_von(stuecke, i)
    gefunden = False
    for k in range(i + 1, j):
        s = stuecke[k]
        if s["art"] != "text" or not s["roh"].strip():
            continue
        if not gefunden:
            vorn, hint = _rand(s["roh"])
            s["roh"] = vorn + html.escape(text, quote=False) + hint
            gefunden = True
        else:
            s["roh"] = ""
    if not gefunden:
        # Element ohne eigenen Text — dann in den Platzhalter hinter dem
        # Starttag. Eingefuegt wird nichts, die Liste bleibt gleich lang.
        stuecke[i + 1]["roh"] = html.escape(text, quote=False)


def setze_html(stuecke, i, roh_html):
    """Fuer Saetze mit <em>, <strong>, <a> oder <code> mittendrin.

    Der ganze Inhalt raus, der neue rein — aber der Abstand am Rand bleibt.
    Das ist der Unterschied zur Fassung im Radio-Erzeuger und der Grund,
    weshalb die Katalogwerte hier keine Einrueckung mitschleppen muessen:
    Eine Uebersetzung soll den Satz liefern, nicht die zwoelf Leerzeichen
    davor.
    """
    j = ende_von(stuecke, i)
    vorn, hint = "", ""
    erste, letzte = None, None
    for k in range(i + 1, j):
        if stuecke[k]["art"] == "text" and stuecke[k]["roh"].strip():
            if erste is None:
                erste = k
            letzte = k
    if erste is not None:
        vorn, _ = _rand(stuecke[erste]["roh"])
        _, hint = _rand(stuecke[letzte]["roh"])
        # Was zwischen Starttag und erstem Text steht, ist selbst schon
        # Auszeichnung — dann faengt der Inhalt dort an, nicht beim Text.
        if any(stuecke[k]["art"] in ("start", "leer") for k in range(i + 1, erste)):
            vorn, _ = _rand(zusammen(stuecke[i + 1:j]))
        if any(stuecke[k]["art"] in ("start", "leer", "ende")
               for k in range(letzte + 1, j)):
            _, hint = _rand(zusammen(stuecke[i + 1:j]))
    else:
        vorn, hint = _rand(zusammen(stuecke[i + 1:j]))
    for k in range(i + 1, j):
        stuecke[k]["roh"] = ""
    stuecke[i + 1]["roh"] = vorn + roh_html + hint


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


# ── Ernte: den deutschen Katalog aus der Vorlage lesen ──────────────

def ernte_text(stuecke, i, schluessel, fehler):
    """Der Text, den setze_text() an dieselbe Stelle zurueckschreiben wuerde."""
    j = ende_von(stuecke, i)
    laeufe = [stuecke[k] for k in range(i + 1, j)
              if stuecke[k]["art"] == "text" and stuecke[k]["roh"].strip()]
    if not laeufe:
        return ""
    if len(laeufe) > 1:
        # Zwei Textlaeufe heisst fast immer: dazwischen steht eine
        # Auszeichnung oder eine Entitaet (&amp;). setze_text() wuerde den
        # zweiten Lauf loeschen. Das laut melden statt still verstuemmeln.
        fehler.append(f'{schluessel}: {len(laeufe)} Textlaeufe im Element — '
                      f'hier gehoert data-html hin, nicht data-text')
    roh = laeufe[0]["roh"]
    vorn, hint = _rand(roh)
    return html.unescape(roh[len(vorn):len(roh) - len(hint)] if hint else roh[len(vorn):])


def ernte_html(stuecke, i):
    """Der Inhalt, den setze_html() an dieselbe Stelle zurueckschreiben wuerde."""
    j = ende_von(stuecke, i)
    return zusammen(stuecke[i + 1:j]).strip()


def ernte(vorlage_quelle):
    """Den deutschen Katalog aus der ausgezeichneten Vorlage lesen.

    In Dokumentreihenfolge, damit die Datei der Seite folgt und ein Mensch
    beim Uebersetzen weiss, wo er ist.
    """
    z = Zerleger()
    z.feed(vorlage_quelle)
    z.close()
    stuecke = z.stuecke

    katalog, fehler = {}, []

    def leg_ab(schluessel, wert):
        if schluessel in katalog and katalog[schluessel] != wert:
            fehler.append(f'{schluessel}: zweimal vergeben, und mit '
                          f'verschiedenem Text ("{katalog[schluessel][:40]}…" '
                          f'gegen "{wert[:40]}…")')
        katalog[schluessel] = wert

    for i, s in enumerate(stuecke):
        if s["art"] not in ("start", "leer"):
            continue
        attr = s["attr"]
        for daten in ATTRIBUT_VON_DATEN:
            if daten in attr:
                leg_ab(attr[daten], html.unescape(attr.get(ATTRIBUT_VON_DATEN[daten], "")))
        for daten in SCHLUESSEL_ATTRIBUTE:
            if daten in attr:
                # Der Schluessel steht im Attribut; sein deutscher Text steht
                # NICHT im Dokument (er wird ja erst zur Laufzeit gebraucht).
                # Deshalb traegt er ihn selbst: data-an="probe.ton.an|Ton
                # einschalten". Vor dem Strich der Schluessel, dahinter der Satz.
                schluessel, _, satz = attr[daten].partition("|")
                if not satz:
                    fehler.append(f'{daten}="{attr[daten]}" ohne deutschen Text '
                                  f'nach dem senkrechten Strich')
                leg_ab(schluessel, satz)
        if "data-betreff" in attr:
            adr = attr.get("href", "")
            _, _, betreff = adr.partition("?subject=")
            leg_ab(attr["data-betreff"], urllib.parse.unquote(betreff))
        if "data-text" in attr:
            leg_ab(attr["data-text"], ernte_text(stuecke, i, attr["data-text"], fehler))
        if "data-html" in attr:
            leg_ab(attr["data-html"], ernte_html(stuecke, i))

    return katalog, fehler


# ── Erzeugen ────────────────────────────────────────────────────────

# Pfade, die im Dokument dokumentrelativ stehen. Unter /de/index.html suchte
# "assets/marke.svg" nach /de/assets/marke.svg. Absolut machen, nicht kopieren.
RELATIV = re.compile(r'(\s(?:href|src)=")(?!https?:|/|#|data:|mailto:)')

# Verweise von einer Seite dieser Sammlung zu einer anderen.
#
# In den Vorlagen stehen sie als /de/… — also so, wie sie auf der deutschen
# Seite richtig sind. Auf jeder anderen Sprachfassung wird das Kuerzel
# ausgetauscht.
#
# WARUM NICHT DOKUMENTRELATIV: „stimmung/" waere naheliegend, wird von
# RELATIV aber zu „/stimmung/" gemacht — und das ist die Wurzel ohne
# Sprache. Auf /de/ zeigte der Knopf zum Messwerkzeug dann an der
# Sprachwahl vorbei, und auf der Messseite zeigte „Zum Tuner" nach „/".
# Genau so gebaut und im ersten Durchlauf gesehen.
SEITENVERWEIS = re.compile(r'(\shref=")/de/')

# Anker in der Vorlage. Fehlt einer, bricht der Lauf ab: Eine Seite ohne
# Sprachumschalter oder ohne die Woerter fuer den Messer waere genau der
# stille Rueckfall, den niemand bemerkt.
MARKE_SPRACHWAHL = "<!--SPRACHWAHL-->"


def fuelle(satz, **werte):
    """{name} in einem Katalogsatz ersetzen.

    str.format() scheidet aus: In den Saetzen stehen geschweifte Klammern,
    die keine Platzhalter sind, und die brechen dort den Aufruf ab.
    """
    for name, wert in werte.items():
        satz = satz.replace("{" + name + "}", str(wert))
    return satz


def sprachumschalter(kuerzel, pfad="", vorhanden=None):
    """Echte Verweise, keine Auswahlliste.

    Sie sind fuer eine Suchmaschine die Bruecke zwischen den sieben
    Fassungen, sie funktionieren mit der mittleren Maustaste, und sie stehen
    auch dann da, wenn kein Programmcode laeuft. Angezeigt wird jede Sprache
    in sich selbst — wer kein Deutsch kann, findet "Deutsch" nicht unter
    "German".

    Anders als beim Radio baut kein Modul das hier zur Laufzeit nach. Diese
    Seite hat keinen zweiten Zeichendurchlauf, also kann auch nichts
    springen.
    """
    vorhanden = vorhanden or list(SPRACHEN)
    # Gibt es die Seite nur in einer Sprache, ist ein Umschalter ein Knopf,
    # der nirgendwohin fuehrt. Dann steht dort nichts.
    if len(vorhanden) < 2:
        return ""
    zeilen = [f'<details class="sprachwahl">',
              f'<summary class="sprachwahl__knopf">{kuerzel.upper()}</summary>',
              f'<ul class="sprachwahl__liste">']
    for k, (name, _, _) in SPRACHEN.items():
        if k not in vorhanden:
            continue
        jetzt = ' aria-current="true"' if k == kuerzel else ""
        zeilen.append(f'<li><a href="/{k}/{pfad}" hreflang="{k}" lang="{k}"{jetzt}>'
                      f'{html.escape(name)}</a></li>')
    zeilen.append("</ul></details>")
    return "".join(zeilen)


def lade_fassungen():
    """data/fassungen.json — die eine Stelle, an der die Nummern stehen.

    VORHER stand die Nummer im Ladeverweis der Vorlage, und der wurde von
    Hand gepflegt. Am 05.09.2026 bot die Seite 0.21.1 an, waehrend 0.27.1
    veroeffentlicht war. Beim Nachmessen war der Grund ein anderer als
    vermutet: 0.27.1 lag gar nicht im Speicher. Nicht die Nummer war alt,
    die Datei fehlte.

    Eine Zahl an einer Stelle loest das nicht allein — deshalb prueft
    Scripts/pruefe-live.py zusaetzlich, ob die angebotene Datei wirklich
    erreichbar ist.
    """
    roh = json.loads(io.open(ROOT / "data" / "fassungen.json",
                             encoding="utf-8").read())
    return {k: v for k, v in roh.items() if not k.startswith("_")}


def fassung_aus(quelle):
    """Die Fassungsnummer der Mac-Ausgabe — fuer JSON-LD und Ladeverweis.

    Das Argument bleibt stehen, damit die Aufrufstellen unveraendert
    bleiben; gelesen wird es nicht mehr.
    """
    return lade_fassungen()["tuner"]["macos"]["fassung"]


ANTWORTTEIL = re.compile(r"^\d+$")
# Nicht gierig: `[^"]+` haette `.titel` mitverschluckt und das Muster
# damit nie getroffen. Erst beim Nachsehen aufgefallen, nicht beim Lesen.
FRAGENGRIFF = re.compile(r'<summary[^>]*\sdata-text="(frage\.[^"]+?)\.titel"')


def _nur_text(roh):
    """Auszeichnung raus, Leerraum zusammen. Fuer strukturierte Daten.

    In den Antworten stehen <strong>, <em> und Verweise. In einer
    acceptedAnswer haben sie nichts zu suchen — dort steht Text, den eine
    Maschine vorliest oder zitiert.
    """
    ohne = re.sub(r"<[^>]+>", " ", roh)
    return re.sub(r"\s+", " ", ohne).strip()


def fragenknoten(vorlage_quelle, texte, seite):
    """Die aufklappbaren Fragen der Seite als FAQPage.

    GEBAUT AUS DER SEITE, NICHT AUS EINER LISTE. Gelesen werden die
    data-text-Marken der <summary>-Griffe in DIESER Vorlage, in ihrer
    Reihenfolge. Steht eine Frage nicht auf der Seite, steht sie auch
    nicht in den strukturierten Daten — das ist keine Vorsicht, es ist
    Googles Bedingung: Ausgezeichnet werden darf nur, was der Besucher
    auch sieht.

    Die Antwort setzt sich aus den durchnummerierten Teilen zusammen
    (frage.X.1, .2, .3 …). Teile mit anderen Namen — `aria`, `w1.zahl` —
    sind Bedienhilfen und Tabellenzellen, kein Antworttext.
    """
    marken = FRAGENGRIFF.findall(vorlage_quelle)
    fragen = []
    for stamm in marken:
        titel = texte.get(f"{stamm}.titel")
        if not titel:
            continue
        teile = []
        for schluessel, wert in texte.items():
            if not schluessel.startswith(stamm + "."):
                continue
            rest = schluessel[len(stamm) + 1:]
            if ANTWORTTEIL.match(rest):
                teile.append((int(rest), wert))
        if not teile:
            continue
        antwort = " ".join(_nur_text(w) for _, w in sorted(teile))
        if not antwort:
            continue
        fragen.append({
            "@type": "Question",
            "name": _nur_text(titel),
            "acceptedAnswer": {"@type": "Answer", "text": antwort},
        })
    if not fragen:
        return None
    return {
        "@type": "FAQPage",
        "@id": f"{seite}#fragen",
        "isPartOf": {"@id": f"{seite}#seite"},
        "mainEntity": fragen,
    }


def jsonld(kuerzel, texte, pfad="", programm="tuner", fassung="0.0.0",
           vorlage_quelle=""):
    """Organization, WebPage und SoftwareApplication.

    WAS HIER NICHT STEHT UND NIE STEHEN WIRD: aggregateRating, review,
    healthClaim. Es gibt keinen einzigen Nutzer — eine erfundene Bewertung
    waere irrefuehrende Werbung, und eine Wirkungsaussage in strukturierten
    Daten waere dieselbe Aussage wie im Fliesstext, nur maschinenlesbar.

    isAccessibleForFree und ein Offer mit price "0": Die Testausgabe kostet
    nichts, und das soll auch die Maschine wissen, damit niemand einen Preis
    dazuerfindet.
    """
    seite = f"{HAUS}/{kuerzel}/{pfad}"
    haus = {
        "@type": "Organization",
        "@id": f"{RADIO}/#haus",
        "name": "IYAMBAE",
        "url": f"{RADIO}/",
        "logo": f"{RADIO}/icon-512.png",
    }
    webseite = {
        "@type": "WebPage",
        "@id": f"{seite}#seite",
        "url": seite,
        "name": texte.get("seite.titel", ""),
        "description": texte.get("seite.beschreibung", ""),
        "inLanguage": kuerzel,
        "isPartOf": {"@id": f"{RADIO}/#haus"},
        "publisher": {"@id": f"{RADIO}/#haus"},
    }
    programm_knoten = {
        "@type": "SoftwareApplication",
        "@id": f"{HAUS}/#tuner",
        "name": "IYAMBAE Tuner",
        "url": seite,
        "applicationCategory": "MultimediaApplication",
        # Windows steht hier bewusst NICHT: operatingSystem beschreibt, wo
        # das Beschriebene laeuft, und beschrieben ist das Umstimmen des
        # Systemtons. Das kann die Windows-Fassung nicht. Wer sie hier
        # auffuehrt, gibt Suchmaschinen eine Zusage, die das Programm
        # nicht einloest.
        "operatingSystem": "macOS 14.4+, Linux (PipeWire 0.3.60+)",
        "softwareVersion": fassung,
        "description": texte.get("seite.beschreibung", ""),
        "inLanguage": kuerzel,
        "isAccessibleForFree": True,
        "author": {"@id": f"{RADIO}/#haus"},
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "EUR",
            "availability": "https://schema.org/InStock",
        },
    }
    if programm == "text":
        # Ein Artikel, kein Programm. `Article` sagt der Maschine, was die
        # Seite ist: ein Text mit Verfasser und Gegenstand. Bewusst OHNE
        # datePublished — ein erfundenes Datum waere schlechter als keines,
        # und ein echtes muesste jemand pflegen.
        anwendung = {
            "@type": "Article",
            "@id": f"{seite}#artikel",
            "headline": texte.get("elt.titel", texte.get("seite.titel", "")),
            "description": texte.get("seite.beschreibung", ""),
            "url": seite,
            "inLanguage": kuerzel,
            "isPartOf": {"@id": f"{seite}#seite"},
            "author": {"@id": f"{RADIO}/#haus"},
            "publisher": {"@id": f"{RADIO}/#haus"},
            "about": ["Kammerton", "432 Hz", "528 Hz", "Musikunterricht"],
        }
    elif programm == "messwerkzeug":
        # Ein Werkzeug, das IM BROWSER laeuft, ist keine SoftwareApplication
        # zum Herunterladen. WebApplication sagt der Maschine genau das —
        # und `browserRequirements` sagt, was sie braucht.
        anwendung = {
            "@type": "WebApplication",
            "@id": f"{HAUS}/#stimmungsmesser",
            "name": texte.get("mess.titel.klar", "Stimmung messen"),
            "url": seite,
            "applicationCategory": "MultimediaApplication",
            "operatingSystem": "Alle",
            "browserRequirements": "Web Audio API",
            "description": texte.get("seite.beschreibung", ""),
            "inLanguage": kuerzel,
            "isAccessibleForFree": True,
            "author": {"@id": f"{RADIO}/#haus"},
            "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "EUR",
                "availability": "https://schema.org/InStock",
            },
        }
    else:
        anwendung = programm_knoten
    knoten = [haus, webseite, anwendung]
    fragen = fragenknoten(vorlage_quelle, texte, seite)
    if fragen:
        knoten.append(fragen)
    graph = {"@context": "https://schema.org", "@graph": knoten}
    roh = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))
    # Jedes "<" maskieren, nicht nur "</script>". Ein Kleinerzeichen in einem
    # uebersetzten Satz beendete sonst im Zweifel das Skript-Element, und der
    # Rest der Seite waere Text.
    return f'<script type="application/ld+json">{roh.replace("<", chr(92) + "u003c")}</script>\n'


def erzeuge_seite(vorlage_quelle, kuerzel, texte, pfad="", programm="tuner",
                  ersetze=True, fassung="0.0.0"):
    """Eine Sprachfassung bauen.

    ersetze=False baut dieselbe Seite OHNE einen einzigen Griff in den
    Katalog — also mit dem deutschen Text, der in der Vorlage steht. Fuer
    Deutsch muessen beide Ergebnisse Zeichen fuer Zeichen gleich sein; das
    ist die Selbstpruefung, siehe pruefe_deutsch().
    """
    z = Zerleger()
    z.feed(vorlage_quelle)
    z.close()
    stuecke = z.stuecke

    def t(schluessel, rueckfall=None):
        return texte.get(schluessel, rueckfall if rueckfall is not None else schluessel)

    _, richtung, zahlformat = SPRACHEN[kuerzel]

    for i, s in enumerate(list(stuecke)):
        if s["art"] not in ("start", "leer"):
            continue
        attr = s["attr"]

        if s["tag"] == "html":
            setze_attribut(s, "lang", kuerzel)
            setze_attribut(s, "dir", richtung)
            setze_attribut(s, "data-zahlformat", zahlformat)

        # Die Marke fuehrt an den Anfang DIESER Sprache, nicht nach /.
        if s["tag"] == "a" and "marke" == attr.get("class", ""):
            setze_attribut(s, "href", f"/{kuerzel}/")

        if s["tag"] == "link" and attr.get("rel") == "canonical":
            setze_attribut(s, "href", f"{HAUS}/{kuerzel}/{pfad}")
        if s["tag"] == "meta" and attr.get("property") == "og:url":
            setze_attribut(s, "content", f"{HAUS}/{kuerzel}/{pfad}")
        if s["tag"] == "meta" and attr.get("property") == "og:locale":
            setze_attribut(s, "content", kuerzel)

        # Diese Attribute traegen "schluessel|deutscher Text". Der Strich
        # muss in JEDEM Fall verschwinden, auch im Vergleichslauf ohne
        # Katalog — sonst stuende er in der Seite und pruefe_deutsch()
        # meldete einen Unterschied, den es gar nicht gibt.
        for daten in SCHLUESSEL_ATTRIBUTE:
            if daten in attr:
                schluessel, _, deutsch = attr[daten].partition("|")
                setze_attribut(s, daten, t(schluessel) if ersetze else deutsch)

        if not ersetze:
            continue

        for daten, ziel in ATTRIBUT_VON_DATEN.items():
            if daten in attr:
                setze_attribut(s, ziel, t(attr[daten]))
        if "data-betreff" in attr:
            adresse = attr.get("href", "").partition("?")[0]
            betreff = urllib.parse.quote(t(attr["data-betreff"]))
            setze_attribut(s, "href", f"{adresse}?subject={betreff}")
        if "data-text" in attr:
            setze_text(stuecke, i, t(attr["data-text"]))
        if "data-html" in attr:
            setze_html(stuecke, i, t(attr["data-html"]))

    seite = zusammen(stuecke)
    seite = RELATIV.sub(r"\1/", seite)
    seite = SEITENVERWEIS.sub(rf'\g<1>/{kuerzel}/', seite)

    # hreflang: sagt der Suchmaschine, dass dies sieben Fassungen EINER Seite
    # sind und nicht sieben duenne Seiten. Ohne das konkurrieren sie
    # gegeneinander. x-default zeigt auf /, wo die Erkennung von nginx sitzt.
    #
    # Nur die Fassungen, die es fuer DIESE Seite gibt: Ein hreflang auf eine
    # Adresse, die niemand ausliefert, laesst Google die ganze Gruppe
    # verwerfen. Bei einer einsprachigen Seite entfaellt der Block ganz —
    # eine Seite ist keine Uebersetzungsgruppe.
    vorhanden = sprachen_fuer(pfad)
    if len(vorhanden) > 1:
        verweise = "\n".join(
            f'<link rel="alternate" hreflang="{k}" href="{HAUS}/{k}/{pfad}">'
            for k in vorhanden)
        # x-default zeigt auf die Adresse OHNE Sprache — dort sitzt die
        # Spracherkennung von nginx. Fuer eine Unterseite ist das /stimmung/,
        # nicht die Startseite: Wer das Messwerkzeug sucht, soll dort landen
        # und nicht beim Tuner.
        verweise += (f'\n<link rel="alternate" hreflang="x-default" '
                     f'href="{HAUS}/{pfad}">')
        seite = seite.replace("</head>", verweise + "\n</head>", 1)

    # GENAU EINMAL, nicht "mindestens einmal".
    #
    # Gemessen am 22.08.2026: Die Marke stand versehentlich ein zweites Mal
    # in einem CSS-Kommentar, der sie beschrieb. replace(…, 1) traf den
    # Kommentar — der Umschalter landete unsichtbar im Stilblatt, die
    # Kopfleiste blieb ohne Sprachwahl, und alle Pruefungen liefen durch,
    # weil class="sprachwahl" ja im Dokument stand. Nur eben an der
    # falschen Stelle.
    wie_oft = seite.count(MARKE_SPRACHWAHL)
    if wie_oft != 1:
        raise ValueError(f"{MARKE_SPRACHWAHL} steht {wie_oft}-mal in "
                         f"der Vorlage, erwartet wird genau einmal")
    seite = seite.replace(MARKE_SPRACHWAHL,
                          sprachumschalter(kuerzel, pfad, sprachen_fuer(pfad)), 1)

    # Das Reifewort je Plattformkachel. Es steht NICHT im Sprachkatalog als
    # feste Zeile, weil es je Plattform verschieden ist und sich mit der
    # Fassung aendert — die Wahrheit darueber steht in data/fassungen.json.
    stufen = lade_fassungen()["tuner"]
    for kachel, name in (("mac", "macos"), ("win", "windows"),
                         ("linux", "linux")):
        wort = texte.get(f"auf.reife.{stufen[name]['reife']}", "")
        seite = seite.replace(
            f'<span class="plattform__reife" data-reife="{kachel}"></span>',
            f'<span class="plattform__reife">{html.escape(wort, quote=False)}</span>', 1)

    # Ungelistete Seiten sagen es auch der Maschine. Nur aus Sitemap und
    # Menues herauszulassen genuegt nicht: Ein einziger Verweis von aussen,
    # und die Seite steht im Index.
    if not gelistet(pfad):
        alt = '<meta name="robots" content="index, follow'
        if alt in seite:
            ende = seite.index(alt) + len(alt)
            schluss = seite.index('>', ende) + 1
            seite = (seite[:seite.index(alt)]
                     + '<meta name="robots" content="noindex, follow">'
                     + seite[schluss:])
        else:
            seite = seite.replace(
                "</title>",
                '</title>\n<meta name="robots" content="noindex, follow">', 1)

    # Die strukturierten Daten ans Ende des Rumpfes, nicht in den Kopf: Der
    # Kopf soll klein bleiben, damit der erste Anblick frueh steht.
    seite = seite.replace("</body>", jsonld(kuerzel, texte, pfad, programm, fassung,
                                            vorlage_quelle)
                          + "</body>", 1)
    return seite


def erzeuge_sitemap():
    """Die sieben Sprachwurzeln, jede mit allen Alternativen.

    Jeder Eintrag fuehrt ALLE sieben Fassungen auf, sich selbst
    eingeschlossen — so verlangt es die Spezifikation von hreflang, und ohne
    den Selbstverweis wird die Gruppe verworfen. x-default zeigt auf /, wo
    die Spracherkennung von nginx sitzt.

    Kein lastmod: Anders als beim Radio gibt es hier keinen gepflegten
    Pruefstand, aus dem sich ein ehrliches Datum ableiten liesse. Die Uhr
    des Bauservers waere kein Datum, sondern eine Behauptung — und eine
    taeglich neue noch dazu.
    """
    zeilen = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
              '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for pfad in SEITEN:
        # Ungelistete Seiten stehen nicht in der Sitemap. Sie dort zu nennen
        # und gleichzeitig auf noindex zu setzen, waeren zwei widerspruechliche
        # Ansagen an dieselbe Suchmaschine.
        if not gelistet(pfad):
            continue
        vorhanden = sprachen_fuer(pfad)
        for kuerzel in vorhanden:
            zeilen.append("  <url>")
            zeilen.append(f"    <loc>{HAUS}/{kuerzel}/{pfad}</loc>")
            for k in vorhanden:
                zeilen.append(f'    <xhtml:link rel="alternate" hreflang="{k}" '
                              f'href="{HAUS}/{k}/{pfad}"/>')
            zeilen.append('    <xhtml:link rel="alternate" hreflang="x-default" '
                          f'href="{HAUS}/{pfad}"/>')
            zeilen.append("  </url>")
    zeilen.append("</urlset>")
    return "\n".join(zeilen) + "\n"


# Was auf jeder Werkzeugseite steht, in einem Satz — fuer llms.txt.
# Absichtlich hier und nicht im Sprachkatalog: Die Datei ist einsprachig
# (Deutsch), weil sie eine Karte ist und keine Seite.
SEITENNAME = {
    "": "IYAMBAE Tuner",
    "spotify/": "Spotify in 432 Hz",
    "samplerate/": "Abtastrate und Tonhoehe",
    "berichtigungen/": "Berichtigungen",
    "eltern-wien/": "432 Hz erklaert fuer Eltern (Wiener Fassung)",
    "eltern/": "432 Hz erklaert fuer Eltern",
    "gitarre/": "Gitarre auf 432 Hz stimmen",
    "solfeggio/": "528 Hz und Solfeggio",
    "hoertest/": "Blindtest 432 gegen 440",
    "stimmung/": "Stimmungsmesser",
}

SEITENSATZ = {
    "": "Der IYAMBAE Tuner: stimmt den Systemton des Rechners auf 432 Hz, "
        "ohne eine Datei umzuwandeln. Kostenlose Testausgabe fuer macOS. "
        "Dazu 14 Fragen und Antworten zum Kammerton.",
    "spotify/": "Warum Spotify sich nicht umstimmen laesst und was stattdessen "
                "geht — gemessen, nicht behauptet.",
    "samplerate/": "Abtastrate und Tonhoehe: was beim Umstimmen wirklich "
                   "passiert und warum 44,1 kHz nichts damit zu tun hat.",
    "berichtigungen/": "Aussagen, die wir selbst berichtigt haben, mit Datum "
                       "und Grund. Auch die, die uns nicht gefallen.",
    "eltern-wien/": "Ungelistete Fassung fuer eine Wiener Musikschule.",
    "eltern/": "Was Eltern von Musikschuelern ueber 432 Hz und 528 Hz wissen "
               "sollten: Geschichte, Zahlen, Studienlage — und was ein "
               "anderer Kammerton fuer Streicher, Blaeser und Klavier "
               "praktisch bedeutet.",
    "gitarre/": "Gitarre auf 432 Hz stimmen: die sechs Saitenfrequenzen, der "
                "Unterschied zum halben Ton herunter (100 Cent gegen 31,8) "
                "und was am Hendrix-Argument dran ist.",
    "solfeggio/": "528 Hz und die Solfeggio-Frequenzen: woher die Zahlen "
                  "stammen, was sich nachrechnen laesst und was nicht.",
    "hoertest/": "Blindtest: Hoerst du den Unterschied zwischen 432 und "
                 "440 Hz? Fuenf Durchgaenge, ehrliche Auswertung, laeuft im "
                 "Browser.",
    "stimmung/": "Stimmungsmesser: misst, auf welchem Kammerton eine "
                 "laufende Aufnahme steht. Web Audio, ohne Hochladen.",
}


def erzeuge_llms(fassung):
    """llms.txt fuer apps.iyambae.fm — dieselbe Ueberlegung wie beim Radio.

    Die Liste kommt aus SEITEN, nicht aus einer zweiten Aufzaehlung. Eine
    neue Seite ohne Satz in SEITENSATZ faellt beim Bau auf, statt still zu
    fehlen — siehe die Pruefung unten.
    """
    fehlend = [p for p in SEITEN if p not in SEITENSATZ or p not in SEITENNAME]
    if fehlend:
        raise SystemExit(f"  ✘ SEITENNAME/SEITENSATZ fehlt fuer: {fehlend} — "
                         f"llms.txt waere unvollstaendig")
    zeilen = [
        "# IYAMBAE Tuner",
        "",
        "> Werkzeuge und Erklaerungen zum Kammerton. Der Tuner stimmt den "
        f"Systemton eines Rechners auf 432 Hz um (Testausgabe {fassung}, "
        "macOS, kostenlos); dazu gehoeren ein Blindtest, ein Stimmungsmesser "
        "und mehrere Erklaerseiten.",
        "",
        "Betreiber: IYAMBAE. Wir versprechen keine Wirkung von 432 Hz und "
        "verkaufen kein Medizinprodukt. Wo die Forschungslage unklar ist, "
        "steht das da — siehe die Seite Berichtigungen.",
        "",
        "## Seiten",
        "",
    ]
    for pfad in SEITEN:
        if not gelistet(pfad):
            continue
        zeilen.append(f"- [{SEITENNAME[pfad]}]({HAUS}/de/{pfad}): {SEITENSATZ[pfad]}")
    zeilen += [
        "",
        "Jede Seite gibt es in sieben Sprachen: de, en, fr, es, it, ja, ar — "
        "die Adresse traegt das Kuerzel, etwa /en/gitarre/.",
        "",
        "## Verwandtes",
        "",
        f"- [IYAMBAE FM]({RADIO}/): 165 Internet-Radiosender, jeder auf Wunsch "
        "in 432 Hz",
        f"- [Sitemap]({HAUS}/sitemap.xml)",
        f"- [Impressum]({RADIO}/recht/impressum/) · "
        f"[Datenschutz]({RADIO}/recht/datenschutz/)",
        "",
    ]
    return "\n".join(zeilen)


def erzeuge_robots():
    """robots.txt fuer apps.iyambae.fm — dieselbe Entscheidung wie beim Radio.

    Sie steht als Kommentar in der Datei selbst und nicht nur hier: Wer
    robots.txt prueft, liest die Datei, nicht dieses Skript.
    """
    kopf = f"""# robots.txt fuer apps.iyambae.fm
#
# Erzeugt von Scripts/baue-apps-sprachen.py. Eine von Hand geaenderte
# Fassung ueberschreibt der naechste Bau.
#
# DIE ENTSCHEIDUNG: Kein einziges Verbot gegen einen KI-Abholer — dieselbe
# wie fuer das Radio, und aus demselben Grund. Wer eine KI fragt, wie er
# Systemton auf 432 Hz umstimmt, soll diesen Tuner genannt bekommen. Es
# gibt hier auch nichts zu schuetzen: Die Seite ist eine Verkaufsseite,
# und ihr ganzer Zweck ist, gelesen zu werden.
#
# Auch kein Disallow gegen /herunterladen/: Dort steht nur eine Umleitung
# in den Blob-Speicher. Ein Abholer, der ihr folgt, findet eine Datei, die
# ohnehin oeffentlich ist.
"""
    gruppen = ["*", "Googlebot", "Google-Extended", "Bingbot", "GPTBot",
               "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot",
               "CCBot", "Applebot", "Applebot-Extended"]
    teile = [kopf]
    for name in gruppen:
        teile.append(f"\nUser-agent: {name}\nAllow: /\n")
    teile.append(f"\nSitemap: {HAUS}/sitemap.xml\n")
    return "".join(teile)


# ── Pruefungen ──────────────────────────────────────────────────────
#
# Sie laufen bei JEDEM Bau, auch bei --pruefe, und sie brechen ihn ab. Eine
# Sprachseite, die ihren Rueckgratsatz still verloren hat, faellt sonst
# niemandem auf — sie sieht im Browser genauso aus wie vorher.

# Saetze, an denen nicht gewackelt werden darf. Sie stehen hier, damit ein
# Lauf abbricht, wenn eine Uebersetzung einen davon vergisst.
#
#   fuss.merksatz   "Wir versprechen dir keine Wirkung. Wir geben dir einen
#                   Regler." — das Rueckgrat der ganzen Seite.
#   fuss.recht      "kein Medizinprodukt", im vollen Wortlaut.
#   frage.medizin.* die Antwort, die dasselbe ausfuehrt.
#   frage.forschung.* der Studienabschnitt: unentschieden, nicht mehr.
#
# Betreiberin ist eine gewerbliche US-Gesellschaft. Eine Wirkungsaussage in
# einer der sieben Fassungen waere Heilmittelwerbung und ein Verstoss gegen
# das Lauterkeitsrecht — in JEDER dieser Sprachen, nicht nur auf Deutsch.
RUECKGRAT = ("fuss.merksatz", "fuss.recht",
             "frage.medizin.titel", "frage.medizin.1", "frage.medizin.2",
             "frage.forschung.titel", "frage.forschung.1", "frage.forschung.2",
             "frage.forschung.3", "frage.forschung.4")


def pruefe_ladeverweis(quellen):
    """Nennt die Vorlage dieselbe Datei wie data/fassungen.json?

    Zwei Stellen, die dasselbe sagen muessen, laufen frueher oder spaeter
    auseinander. Hier faellt es beim Bauen auf statt beim Besucher.
    """
    stand = lade_fassungen()["tuner"]["macos"]
    datei = stand.get("datei")
    quelle = quellen.get("", "")
    im_verweis = re.search(r"/herunterladen/(IYAMBAE-Tuner-[^\"]+\.dmg)", quelle)
    if datei and not im_verweis:
        print(f"  ✘ fassungen.json bietet {datei} an, die Vorlage verlinkt nichts")
        return False
    if not datei and im_verweis:
        print(f"  ✘ die Vorlage verlinkt {im_verweis.group(1)}, "
              f"fassungen.json sagt: nichts zum Laden")
        return False
    if datei and im_verweis.group(1) != datei:
        print(f"  ✘ Vorlage verlinkt {im_verweis.group(1)}, "
              f"fassungen.json nennt {datei}")
        return False
    if datei:
        print(f"  ✔ Ladeverweis und fassungen.json nennen dieselbe Datei: {datei}")
    return True


def pruefe_treue(vorlage_quelle):
    """Reproduziert der Zerleger die Vorlage unveraendert?"""
    z = Zerleger()
    z.feed(vorlage_quelle)
    z.close()
    zurueck = zusammen(z.stuecke)
    if zurueck == vorlage_quelle:
        return True
    for n, (a, b) in enumerate(zip(vorlage_quelle, zurueck)):
        if a != b:
            print(f"  ✘ Zerleger verformt die Vorlage ab Zeichen {n}:")
            print(f"    Vorlage:  {vorlage_quelle[max(0, n - 60):n + 60]!r}")
            print(f"    Zurueck:  {zurueck[max(0, n - 60):n + 60]!r}")
            return False
    print(f"  ✘ Zerleger verformt die Vorlage (Laenge {len(vorlage_quelle)} "
          f"gegen {len(zurueck)})")
    return False


def pruefe_deutsch(vorlage_quelle, deutsch, pfad="", programm="tuner"):
    fassung = fassung_aus(vorlage_quelle) or "0.0.0"
    """Sagt de.json zeichengenau dasselbe wie die Vorlage?

    Zweimal dieselbe deutsche Seite bauen: einmal mit dem Katalog, einmal
    ohne einen einzigen Griff hinein. Sind beide gleich, dann hat de.json
    jeden Satz der Vorlage richtig — und zwar bis auf das letzte Leerzeichen.
    Weichen sie ab, ist entweder ein Schluessel falsch geerntet oder ein
    Satz von Hand nachgebessert worden. Beides waere ein stiller Fehler:
    Die deutsche Seite saehe im Browser fast richtig aus.
    """
    mit  = erzeuge_seite(vorlage_quelle, "de", deutsch, pfad, programm,
                         ersetze=True, fassung=fassung)
    ohne = erzeuge_seite(vorlage_quelle, "de", deutsch, pfad, programm,
                         ersetze=False, fassung=fassung)
    if mit == ohne:
        return True
    for n, (a, b) in enumerate(zip(ohne, mit)):
        if a != b:
            print(f"  ✘ de.json weicht ab Zeichen {n} von der Vorlage ab:")
            print(f"    Vorlage:  {ohne[max(0, n - 80):n + 80]!r}")
            print(f"    Katalog:  {mit[max(0, n - 80):n + 80]!r}")
            print(f"    Abhilfe:  python3 Scripts/baue-apps-sprachen.py --ernte")
            return False
    print(f"  ✘ de.json ergibt eine andere Laenge ({len(mit)} gegen {len(ohne)}). "
          f"Abhilfe: python3 Scripts/baue-apps-sprachen.py --ernte")
    return False


def pruefe_schluessel(kataloge):
    """Dieselben Schluessel ueberall, dieselben Platzhalter ueberall."""
    grund = kataloge["de"]
    fehler = []
    muster = re.compile(r"\{(\w+)\}")
    for kuerzel, katalog in kataloge.items():
        fehlend = [k for k in grund if k not in katalog]
        zuviel = [k for k in katalog if k not in grund]
        if fehlend:
            fehler.append(f"{kuerzel}: {len(fehlend)} Schluessel fehlen — "
                          f"{', '.join(fehlend[:6])}")
        if zuviel:
            fehler.append(f"{kuerzel}: {len(zuviel)} unbekannte Schluessel — "
                          f"{', '.join(zuviel[:6])}")
        for k, satz in katalog.items():
            if k not in grund:
                continue
            hier, dort = set(muster.findall(satz)), set(muster.findall(grund[k]))
            if hier != dort:
                fehler.append(f"{kuerzel}/{k}: Platzhalter {sorted(hier)} "
                              f"statt {sorted(dort)}")
    for satz in fehler:
        print(f"  ✘ {satz}")
    return not fehler


def pruefe_ruecken(kataloge):
    """Steht das Rueckgrat in jeder Sprache?"""
    fehler = []
    for kuerzel, katalog in kataloge.items():
        for schluessel in RUECKGRAT:
            wert = katalog.get(schluessel, "").strip()
            if not wert:
                fehler.append(f"{kuerzel}: {schluessel} fehlt oder ist leer")
            elif wert == schluessel:
                fehler.append(f"{kuerzel}: {schluessel} traegt nur den "
                              f"Schluesselnamen, keinen Satz")
        # "kein Medizinprodukt" traegt im Deutschen eine Hervorhebung. Sie
        # muss in jeder Sprache stehen bleiben — nicht als Schmuck, sondern
        # damit der Satz auch beim Ueberfliegen gelesen wird.
        recht = katalog.get("fuss.recht", "")
        if "<strong>" not in recht or "</strong>" not in recht:
            fehler.append(f"{kuerzel}: fuss.recht ohne Hervorhebung — "
                          f'"kein Medizinprodukt" muss betont bleiben')
    for satz in fehler:
        print(f"  ✘ {satz}")
    return not fehler


def pruefe_sitemap(quelle):
    """Wohlgeformtes XML, jede Seite in jeder Sprache, mit allen Alternativen."""
    import xml.etree.ElementTree as ET
    fehler = []
    try:
        wurzel = ET.fromstring(quelle)
    except ET.ParseError as fehl:
        print(f"  ✘ sitemap.xml ist kein wohlgeformtes XML: {fehl}")
        return False

    raum = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    xhtml = "{http://www.w3.org/1999/xhtml}"
    # Erwartet wird, was es wirklich gibt: gelistete Seiten in ihren
    # Sprachen. Vorher stand hier SEITEN mal SPRACHEN — das galt, solange
    # jede Seite alle sieben Fassungen hatte und keine ungelistet war.
    soll_adressen = {f"{HAUS}/{k}/{p}"
                     for p in SEITEN if gelistet(p)
                     for k in sprachen_fuer(p)}
    adressen = wurzel.findall(f"{raum}url")
    if len(adressen) != len(soll_adressen):
        fehler.append(f"{len(adressen)} Eintraege statt {len(soll_adressen)}")

    gefunden = set()
    for eintrag in adressen:
        ort = eintrag.findtext(f"{raum}loc")
        gefunden.add(ort)
        pfad = ort[len(HAUS):].split("/", 2)[2]
        erwartet = set(sprachen_fuer(pfad)) | {"x-default"}
        sprachen = {a.get("hreflang") for a in eintrag.findall(f"{xhtml}link")}
        if sprachen != erwartet:
            fehler.append(f"{ort}: Alternativen {sorted(sprachen)} "
                          f"statt {sorted(erwartet)}")
    fehlt = soll_adressen - gefunden
    if fehlt:
        fehler.append(f"nicht aufgefuehrt: {', '.join(sorted(fehlt))}")
    zuviel = gefunden - soll_adressen
    if zuviel:
        fehler.append(f"steht drin, soll aber nicht: {', '.join(sorted(zuviel))}")

    for satz in fehler:
        print(f"  ✘ sitemap.xml: {satz}")
    return not fehler


def pruefe_robots(quelle):
    """Die Sitemap ist angemeldet, und nichts ist versehentlich gesperrt."""
    fehler = []
    if f"Sitemap: {HAUS}/sitemap.xml" not in quelle:
        fehler.append("die Sitemap ist nicht angemeldet")
    # "Disallow: /" allein sperrt die ganze Seite. Ein Tippfehler an dieser
    # Stelle macht alles andere in dieser Datei wertlos — und niemand
    # bemerkt ihn, weil die Seite im Browser tadellos aussieht.
    if re.search(r"^Disallow:\s*/?\s*$", quelle, re.M):
        fehler.append("ein Disallow sperrt die ganze Seite")
    for name in ("GPTBot", "ClaudeBot", "PerplexityBot", "CCBot",
                 "Google-Extended"):
        if not re.search(rf"^User-agent:\s*{name}\s*$", quelle, re.M):
            fehler.append(f"{name} ist nicht ausdruecklich erlaubt")
    for satz in fehler:
        print(f"  ✘ robots.txt: {satz}")
    return not fehler


def pruefe_seite(kuerzel, seite, texte, pfad="", rueckgrat=True,
                 programm="tuner"):
    """Traegt die erzeugte Seite, was sie tragen soll?"""
    fehler = []

    ueberschriften = re.findall(r"<h1\b[^>]*>(.*?)</h1>", seite, re.S)
    if len(ueberschriften) != 1:
        fehler.append(f"{len(ueberschriften)} <h1> statt genau einer")

    if f'lang="{kuerzel}"' not in seite:
        fehler.append(f'kein lang="{kuerzel}" am <html>')
    if f'dir="{SPRACHEN[kuerzel][1]}"' not in seite:
        fehler.append(f'kein dir="{SPRACHEN[kuerzel][1]}" am <html>')

    # Nur die Sprachen, die es fuer DIESE Seite gibt. Ein hreflang auf eine
    # Adresse, die niemand ausliefert, waere ein Verweis ins Leere — und
    # Google verwirft dann die ganze Gruppe.
    vorhanden = sprachen_fuer(pfad)
    for k in (vorhanden if len(vorhanden) > 1 else ()):
        if f'hreflang="{k}" href="{HAUS}/{k}/{pfad}"' not in seite:
            fehler.append(f"hreflang {k} fehlt")
    for k in set(SPRACHEN) - set(vorhanden):
        if f'hreflang="{k}" href="{HAUS}/{k}/{pfad}"' in seite:
            fehler.append(f"hreflang {k} zeigt auf eine Fassung, die es "
                          f"fuer diese Seite nicht gibt")
    if len(vorhanden) > 1 and 'hreflang="x-default"' not in seite:
        fehler.append("hreflang x-default fehlt")
    if f'<link rel="canonical" href="{HAUS}/{kuerzel}/{pfad}">' not in seite:
        fehler.append("canonical zeigt nicht auf die eigene Adresse")

    # Nicht nur "steht irgendwo", sondern "steht in der Kopfleiste". Siehe
    # den Kommentar zur Marke in erzeuge_seite(): Er stand schon einmal im
    # Stilblatt, und dort sieht ihn niemand.
    #
    # Eine Seite, die es nur in einer Sprache gibt, hat keinen Umschalter —
    # ein Knopf, der nirgendwohin fuehrt, ist schlechter als keiner.
    kopf = seite.partition("</header>")[0]
    if len(vorhanden) > 1:
        if 'class="sprachwahl"' not in kopf:
            fehler.append("kein Sprachumschalter in der Kopfleiste")
        for k in vorhanden:
            if f'<a href="/{k}/{pfad}" hreflang="{k}"' not in seite:
                fehler.append(f"Sprachumschalter ohne Weg nach /{k}/{pfad}")
    elif 'class="sprachwahl"' in kopf:
        fehler.append("Sprachumschalter auf einer einsprachigen Seite")

    # Der Rueckgratsatz und der Medizinprodukt-Satz stehen wirklich im HTML —
    # nicht nur im Katalog. Ein Schluessel, den die Vorlage nicht mehr
    # auszeichnet, faellt hier auf.
    for schluessel in (("fuss.merksatz", "fuss.recht") if rueckgrat else ()):
        stueck = texte.get(schluessel, "")
        probe = html.escape(stueck, quote=False) if schluessel == "fuss.merksatz" else stueck
        if probe and probe not in seite:
            fehler.append(f"{schluessel} steht nicht in der Seite")

    bloecke = re.findall(r'<script type="application/ld\+json">(.*?)</script>',
                         seite, re.S)
    if len(bloecke) != 1:
        fehler.append(f"{len(bloecke)} JSON-LD-Bloecke statt genau einem")
    else:
        try:
            daten = json.loads(bloecke[0])
        except ValueError as fehl:
            fehler.append(f"JSON-LD ist kein gueltiges JSON: {fehl}")
        else:
            knoten = {k.get("@type"): k for k in daten.get("@graph", [])}
            # Welcher dritte Knoten gefordert ist, haengt davon ab, WAS die
            # Seite ist: ein Programm zum Herunterladen, ein Werkzeug im
            # Browser — oder ein Text. Die dritte Art kam am 04.09.2026 dazu
            # und stand hier zuerst nicht; die Pruefung hat es sofort
            # gemeldet, statt eine Seite mit falscher Auszeichnung
            # durchzulassen.
            dritter = {"messwerkzeug": "WebApplication",
                       "text": "Article"}.get(programm, "SoftwareApplication")
            gefordert = ("Organization", "WebPage", dritter)
            for art in gefordert:
                if art not in knoten:
                    fehler.append(f"JSON-LD ohne {art}")
            if knoten.get("WebPage", {}).get("inLanguage") != kuerzel:
                fehler.append("WebPage meldet die falsche Sprache")
            # Keine erfundene Bewertung. Siehe jsonld().
            for art, stelle in knoten.items():
                for verboten in ("aggregateRating", "review"):
                    if verboten in stelle:
                        fehler.append(f"JSON-LD/{art} traegt {verboten} — "
                                      f"es gibt keinen einzigen Nutzer")

    # Kein Schluessel ist als Text durchgerutscht. Ein "frage.medizin.1"
    # mitten auf der Seite waere im Browser sofort sichtbar — aber nur dem,
    # der die Sprache liest.
    durchgerutscht = re.findall(r">\s*((?:frage|probe|beweis|holen|auf|fuss|"
                                r"karte|fremd|tut|kopf|seite|schritte|pruefung|"
                                r"sprache)\.[a-zA-Z0-9.]+)\s*<", seite)
    if durchgerutscht:
        fehler.append(f"Schluessel statt Text im HTML: "
                      f"{', '.join(sorted(set(durchgerutscht))[:6])}")

    for satz in fehler:
        print(f"  ✘ /{kuerzel}/: {satz}")
    return not fehler


# ── Hauptlauf ───────────────────────────────────────────────────────

def schreibe_katalog(pfad, katalog):
    io.open(pfad, "w", encoding="utf-8", newline="\n").write(
        json.dumps(katalog, ensure_ascii=False, indent=2) + "\n")


def main():
    nur_pruefen = "--pruefe" in sys.argv
    nur_ernten = "--ernte" in sys.argv

    # Alle Vorlagen lesen, jede fuer sich pruefen, dann EINEN Katalog daraus
    # ernten. Ein Schluessel, der in zwei Vorlagen mit verschiedenem Text
    # steht, faellt beim Zusammenlegen auf — leg_ab() in ernte() meldet das.
    quellen = {}
    for pfad, wie in SEITEN.items():
        datei = APPS / wie["vorlage"]
        if not datei.exists():
            print(f"  ✘ {datei} fehlt")
            return 1
        quellen[pfad] = io.open(datei, encoding="utf-8").read()

    for pfad, quelle in quellen.items():
        if not pruefe_treue(quelle):
            print(f"    (in apps/{SEITEN[pfad]['vorlage']})")
            return 1
    print(f"  ✔ Zerleger gibt {len(quellen)} Vorlage(n) unveraendert zurueck")

    geerntet, ernte_fehler = {}, []
    for pfad, quelle in quellen.items():
        teil, fehl = ernte(quelle)
        for schluessel, wert in teil.items():
            if schluessel in geerntet and geerntet[schluessel] != wert:
                fehl.append(f'{schluessel}: steht in zwei Vorlagen mit '
                            f'verschiedenem Text')
            geerntet[schluessel] = wert
        ernte_fehler += [f"apps/{SEITEN[pfad]['vorlage']}: {f}" for f in fehl]
    if ernte_fehler:
        for satz in ernte_fehler:
            print(f"  ✘ Ernte: {satz}")
        return 1

    if nur_ernten:
        LANG.mkdir(parents=True, exist_ok=True)
        schreibe_katalog(LANG / "de.json", geerntet)
        print(f"  ✔ apps/assets/lang/de.json neu geerntet — "
              f"{len(geerntet)} Schluessel")
        return 0

    kataloge = {}
    for kuerzel in SPRACHEN:
        p = LANG / f"{kuerzel}.json"
        if not p.exists():
            print(f"  ✘ apps/assets/lang/{kuerzel}.json fehlt")
            return 1
        kataloge[kuerzel] = json.loads(io.open(p, encoding="utf-8").read())

    # Die Fassungsnummer steht genau einmal im Haus: im Ladeverweis der
    # Landeseite. Von dort holt sie sich auch das JSON-LD.
    fassung = fassung_aus(quellen.get("", ""))
    if not fassung:
        print("  ✘ kein Ladeverweis auf eine DMG in apps/index.html gefunden — "
              "das JSON-LD haette keine Fassungsnummer")
        return 1
    print(f"  ✔ Fassung aus dem Ladeverweis gelesen: {fassung}")

    gut = True
    for pfad, quelle in quellen.items():
        wie = SEITEN[pfad]
        if not pruefe_deutsch(quelle, kataloge["de"], pfad, wie["programm"]):
            print(f"    (in apps/{wie['vorlage']})")
            gut = False
    if gut:
        print(f"  ✔ de.json gibt {len(quellen)} Vorlage(n) zeichengenau wieder")
    if not pruefe_schluessel(kataloge):
        gut = False
    if not pruefe_ruecken(kataloge):
        gut = False
    if not pruefe_ladeverweis(quellen):
        gut = False
    if not gut:
        print("\n  Nichts geschrieben — der alte Stand bleibt stehen.")
        return 1
    print(f"  ✔ {len(SPRACHEN)} Kataloge, je {len(kataloge['de'])} Schluessel, "
          f"gleiche Namen und gleiche Platzhalter")

    # Erst alles bauen und pruefen, dann schreiben. Ein halber Stand auf der
    # Platte waere schlimmer als gar keiner.
    seiten = {}
    for pfad, quelle in quellen.items():
        wie = SEITEN[pfad]
        for kuerzel in sprachen_fuer(pfad):
            texte = {**kataloge["de"], **kataloge[kuerzel]}
            seite = erzeuge_seite(quelle, kuerzel, texte, pfad, wie["programm"],
                                  fassung=fassung)
            seiten[(pfad, kuerzel)] = seite
            if not pruefe_seite(kuerzel, seite, texte, pfad,
                                wie["rueckgrat"], wie["programm"]):
                print(f"    (in apps/{kuerzel}/{pfad})")
                gut = False

    sitemap = erzeuge_sitemap()
    robots = erzeuge_robots()
    llms = erzeuge_llms(fassung)
    if not pruefe_sitemap(sitemap):
        gut = False
    if not pruefe_robots(robots):
        gut = False

    if not gut:
        print("\n  Nichts geschrieben — der alte Stand bleibt stehen.")
        return 1
    print(f"  ✔ {len(seiten)} Sprachseiten, sitemap.xml und robots.txt "
          f"bestehen die Pruefungen")

    if nur_pruefen:
        print("  ✔ nur geprueft, nichts geschrieben")
        return 0

    for kuerzel in SPRACHEN:
        # Alten Stand raeumen, damit ein entfernter Schluessel keine Leiche
        # hinterlaesst. Der ganze Sprachordner faellt, mitsamt den
        # Unterseiten — sonst bliebe eine geloeschte Seite fuer immer stehen.
        ordner = APPS / kuerzel
        if ordner.exists():
            shutil.rmtree(ordner)
        for pfad in SEITEN:
            if kuerzel not in sprachen_fuer(pfad):
                continue
            ziel = ordner / pfad
            ziel.mkdir(parents=True, exist_ok=True)
            io.open(ziel / "index.html", "w", encoding="utf-8",
                    newline="\n").write(seiten[(pfad, kuerzel)])

    # robots.txt und sitemap.xml liegen in apps/ selbst, nicht im
    # Sprachordner: Es sind Dateien des Hostes, keine Sprachfassungen.
    io.open(APPS / "sitemap.xml", "w", encoding="utf-8",
            newline="\n").write(sitemap)
    io.open(APPS / "robots.txt", "w", encoding="utf-8",
            newline="\n").write(robots)
    io.open(APPS / "llms.txt", "w", encoding="utf-8",
            newline="\n").write(llms)

    for pfad in SEITEN:
        for kuerzel in sprachen_fuer(pfad):
            seite = seiten[(pfad, kuerzel)]
            print(f"  ✔ apps/{kuerzel}/{pfad:<10} {len(seite):>6} Zeichen "
                  f"({len(seite.encode('utf-8')):>6} Bytes), "
                  f"dir={SPRACHEN[kuerzel][1]}, Zahlen {SPRACHEN[kuerzel][2]}")
    eintraege = sum(len(sprachen_fuer(p)) for p in SEITEN if gelistet(p))
    print(f"  ✔ apps/sitemap.xml  {len(sitemap):>6} Zeichen, "
          f"{eintraege} Eintraege")
    print(f"  ✔ apps/robots.txt   {len(robots):>6} Zeichen")
    print(f"  ✔ apps/llms.txt    {len(llms):>6} Zeichen")
    ungelistet = [p for p in SEITEN if not gelistet(p)]
    print(f"\n  {len(seiten)} Seiten fuer apps.iyambae.fm erzeugt "
          f"({len(SEITEN)} Vorlagen), dazu sitemap.xml und robots.txt."
          + (f" Ungelistet: {', '.join(ungelistet)}." if ungelistet else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
