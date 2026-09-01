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
    "gitarre/": {
        "vorlage": "gitarre.html",
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


def sprachumschalter(kuerzel, pfad=""):
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
    zeilen = [f'<details class="sprachwahl">',
              f'<summary class="sprachwahl__knopf">{kuerzel.upper()}</summary>',
              f'<ul class="sprachwahl__liste">']
    for k, (name, _, _) in SPRACHEN.items():
        jetzt = ' aria-current="true"' if k == kuerzel else ""
        zeilen.append(f'<li><a href="/{k}/{pfad}" hreflang="{k}" lang="{k}"{jetzt}>'
                      f'{html.escape(name)}</a></li>')
    zeilen.append("</ul></details>")
    return "".join(zeilen)


def fassung_aus(quelle):
    """Die Fassungsnummer aus dem Ladeverweis der Vorlage lesen.

    WARUM NICHT FEST EINGETIPPT: Bis zum 01.09.2026 stand im JSON-LD
    `"softwareVersion": "0.1.0"` — waehrend die Seite laengst 0.21.1
    anbot. Eine Zahl, die nur eine Maschine liest, veraltet unbemerkt:
    Im Browser sieht man sie nicht, und niemand prueft sie.

    Jetzt kommt sie aus derselben Zeile wie der Knopf. Wer die Fassung
    wechselt, wechselt beides — oder gar nichts.
    """
    m = re.search(r"/herunterladen/IYAMBAE-Tuner-([0-9]+\.[0-9]+\.[0-9]+)\.dmg", quelle)
    return m.group(1) if m else None


def jsonld(kuerzel, texte, pfad="", programm="tuner", fassung="0.0.0"):
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
    if programm == "messwerkzeug":
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
    graph = {"@context": "https://schema.org", "@graph": [haus, webseite, anwendung]}
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
    verweise = "\n".join(
        f'<link rel="alternate" hreflang="{k}" href="{HAUS}/{k}/{pfad}">'
        for k in SPRACHEN)
    # x-default zeigt auf die Adresse OHNE Sprache — dort sitzt die
    # Spracherkennung von nginx. Fuer eine Unterseite ist das /stimmung/,
    # nicht die Startseite: Wer das Messwerkzeug sucht, soll dort landen
    # und nicht beim Tuner.
    verweise += f'\n<link rel="alternate" hreflang="x-default" href="{HAUS}/{pfad}">'
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
    seite = seite.replace(MARKE_SPRACHWAHL, sprachumschalter(kuerzel, pfad), 1)

    # Die strukturierten Daten ans Ende des Rumpfes, nicht in den Kopf: Der
    # Kopf soll klein bleiben, damit der erste Anblick frueh steht.
    seite = seite.replace("</body>", jsonld(kuerzel, texte, pfad, programm, fassung)
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
        for kuerzel in SPRACHEN:
            zeilen.append("  <url>")
            zeilen.append(f"    <loc>{HAUS}/{kuerzel}/{pfad}</loc>")
            for k in SPRACHEN:
                zeilen.append(f'    <xhtml:link rel="alternate" hreflang="{k}" '
                              f'href="{HAUS}/{k}/{pfad}"/>')
            zeilen.append('    <xhtml:link rel="alternate" hreflang="x-default" '
                          f'href="{HAUS}/{pfad}"/>')
            zeilen.append("  </url>")
    zeilen.append("</urlset>")
    return "\n".join(zeilen) + "\n"


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
    adressen = wurzel.findall(f"{raum}url")
    soll = len(SEITEN) * len(SPRACHEN)
    if len(adressen) != soll:
        fehler.append(f"{len(adressen)} Eintraege statt {soll}")

    gefunden = set()
    erwartet = set(SPRACHEN) | {"x-default"}
    for eintrag in adressen:
        ort = eintrag.findtext(f"{raum}loc")
        gefunden.add(ort)
        sprachen = {a.get("hreflang") for a in eintrag.findall(f"{xhtml}link")}
        if sprachen != erwartet:
            fehler.append(f"{ort}: Alternativen {sorted(sprachen)} "
                          f"statt {sorted(erwartet)}")
    fehlt = {f"{HAUS}/{k}/{p}" for k in SPRACHEN for p in SEITEN} - gefunden
    if fehlt:
        fehler.append(f"nicht aufgefuehrt: {', '.join(sorted(fehlt))}")

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

    for k in SPRACHEN:
        if f'hreflang="{k}" href="{HAUS}/{k}/{pfad}"' not in seite:
            fehler.append(f"hreflang {k} fehlt")
    if 'hreflang="x-default"' not in seite:
        fehler.append("hreflang x-default fehlt")
    if f'<link rel="canonical" href="{HAUS}/{kuerzel}/{pfad}">' not in seite:
        fehler.append("canonical zeigt nicht auf die eigene Adresse")

    # Nicht nur "steht irgendwo", sondern "steht in der Kopfleiste". Siehe
    # den Kommentar zur Marke in erzeuge_seite(): Er stand schon einmal im
    # Stilblatt, und dort sieht ihn niemand.
    kopf = seite.partition("</header>")[0]
    if 'class="sprachwahl"' not in kopf:
        fehler.append("kein Sprachumschalter in der Kopfleiste")
    for k in SPRACHEN:
        if f'<a href="/{k}/{pfad}" hreflang="{k}"' not in seite:
            fehler.append(f"Sprachumschalter ohne Weg nach /{k}/{pfad}")

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
            gefordert = ("Organization", "WebPage",
                         "WebApplication" if programm == "messwerkzeug"
                         else "SoftwareApplication")
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
        for kuerzel in SPRACHEN:
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

    for pfad in SEITEN:
        for kuerzel in SPRACHEN:
            seite = seiten[(pfad, kuerzel)]
            print(f"  ✔ apps/{kuerzel}/{pfad:<10} {len(seite):>6} Zeichen "
                  f"({len(seite.encode('utf-8')):>6} Bytes), "
                  f"dir={SPRACHEN[kuerzel][1]}, Zahlen {SPRACHEN[kuerzel][2]}")
    print(f"  ✔ apps/sitemap.xml  {len(sitemap):>6} Zeichen, "
          f"{len(SEITEN) * len(SPRACHEN)} Eintraege")
    print(f"  ✔ apps/robots.txt   {len(robots):>6} Zeichen")
    print(f"\n  {len(seiten)} Seiten fuer apps.iyambae.fm erzeugt "
          f"({len(SEITEN)} je {len(SPRACHEN)} Sprachen), dazu sitemap.xml "
          f"und robots.txt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
