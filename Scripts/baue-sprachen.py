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
        self._namen = []           # Stapel der echten Tag-Schreibweisen

    def _leg_ab(self, art, roh, tag=None, attr=None):
        self.stuecke.append({"art": art, "roh": roh, "tag": tag, "attr": attr or {}})

    def handle_starttag(self, tag, attrs):
        art = "leer" if tag in LEER else "start"
        self._leg_ab(art, self.get_starttag_text(), tag, dict(attrs))
        # Die ECHTE Schreibweise merken, fuer den Schlusstag.
        #
        # html.parser schreibt Tagnamen klein. Fuer HTML ist das richtig, fuer
        # eingebettetes SVG nicht: Dort heisst es <linearGradient> und
        # </linearGradient>, und XML unterscheidet Gross und Klein.
        # get_starttag_text() rettet den OEFFNENDEN Tag woertlich; der
        # schliessende wird unten neu gebaut und war damit zwangslaeufig
        # klein. Ergebnis: </lineargradient>, die Vorlage verformt, und
        # pruefe_treue() bricht den ganzen Lauf ab — keine einzige
        # Sprachseite. Gemessen am 21.08.2026.
        if art == "start":
            roh = self.get_starttag_text() or ""
            echt = roh[1:len(tag) + 1]
            self._namen.append(echt if echt.lower() == tag else tag)
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
        # Die Schreibweise vom passenden Starttag zurueckholen. Siehe dort.
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


def erzeuge_seite(vorlage_quelle, kuerzel, texte, alle_kuerzel, katalog):
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

    # Die Textfassung des Katalogs an ihren Anker. Fehlt der Anker, ist die
    # Vorlage veraendert worden und der Block landete stillschweigend
    # nirgends — dann lieber laut abbrechen.
    if KATALOG_MARKE not in seite:
        raise ValueError(f"{KATALOG_MARKE} steht nicht in index.html")
    seite = seite.replace(KATALOG_MARKE, katalogtext(katalog, texte, kuerzel), 1)

    # Die strukturierten Daten ans Ende des Rumpfes. Warum dorthin und nicht
    # in den Kopf, steht als Kommentar an dieser Stelle in index.html.
    seite = seite.replace("</body>", katalog_jsonld(katalog, texte, kuerzel)
                          + "</body>", 1)

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


# ═══════════════════════════════════════════════════════════════════
# Auffindbarkeit — Textfassung, JSON-LD, sitemap.xml, robots.txt
#
# Alles hier Erzeugte hat einen einzigen Zweck: Was app.js zur Laufzeit aus
# data/sender.json zeichnet, soll auch dann lesbar sein, wenn niemand
# JavaScript ausfuehrt. Google tut es, GPTBot, ClaudeBot, PerplexityBot und
# Bing ueberwiegend nicht — fuer die war iyambae.fm eine Ueberschrift und
# achtzehn leere Skelettkarten.
#
# Die Begruendung fuer die gewaehlte Form (Textfassung statt vorgerendertem
# Raster, <details> statt <noscript>) steht in index.html an der Stelle, an
# der der Block landet. Sie gehoert dorthin, wo jemand sie beim Lesen der
# Vorlage findet.
# ═══════════════════════════════════════════════════════════════════

HAUS = "https://iyambae.fm"

# Der Anker in index.html. Fehlt er, bricht der Lauf ab — eine Sprachseite
# ohne Katalog waere genau der stille Rueckfall in den alten Zustand.
KATALOG_MARKE = "<!--KATALOGTEXT-->"

# Die Begruessungen, die bis zum 21.08.2026 als <h1> standen. Sie sind hier
# aufgefuehrt, damit pruefe_seite() merkt, wenn eine davon zurueckkehrt: Eine
# Ueberschrift, die "Willkommen" sagt, sagt nichts.
ALTE_H1 = {"Willkommen", "Welcome", "Bienvenue", "Bienvenida", "Benvenuto",
           "ようこそ", "أهلًا بك"}


def kennzahlen(katalog):
    """Die Zahlen, die im Text stehen, aus den Daten rechnen.

    WARUM DAS NOETIG WURDE: Am 23.08.2026 stand "165 Sender aus 37 Laendern,
    in elf Regalen" an fuenf Stellen fest im Text — in index.html und in
    sieben Katalogen. Die Zahlen stimmten zufaellig noch. Wer einen Sender
    aufnimmt, muesste sie an acht Stellen nachziehen, und niemand merkt es,
    wenn er es vergisst: Die Seite sieht danach genauso aus.

    ZIFFERN STATT ZAHLWOERTERN. Deutsch schrieb "elf", Englisch "eleven",
    Franzoesisch "onze". Ein Zahlwort je Sprache liesse sich nur mit einer
    Tabelle fuer jede Sprache erzeugen — und ein ausgeschriebenes Zahlwort,
    das veraltet, ist schlimmer als eine Ziffer, die stimmt.
    """
    sender = katalog["sender"]
    return {
        "senderzahl":  len(sender),
        "laenderzahl": len({s["land"] for s in sender if s.get("land")}),
        "regalzahl":   len(katalog["regale"]),
    }


# Schluessel, in denen eine gerechnete Zahl stehen MUSS. Steht dort eine
# Ziffer statt des Platzhalters, hat jemand die Rechnung ueberschrieben —
# und der Bau bricht ab, statt eine veraltende Zahl auszuliefern.
GERECHNET = {
    "seite.beschreibung": ("{senderzahl}", "{laenderzahl}"),
    "hero.ort.start":     ("{senderzahl}", "{laenderzahl}", "{regalzahl}"),
}


def fuelle(satz, **werte):
    """{name} in einem Katalogsatz ersetzen.

    Dieselbe Schreibweise wie t() in assets/lib/sprache.mjs. str.format()
    scheidet aus: In den Saetzen stehen geschweifte Klammern, die keine
    Platzhalter sind, und die brechen dort den Aufruf ab.
    """
    for name, wert in werte.items():
        satz = satz.replace("{" + name + "}", str(wert))
    return satz


def guete(sender):
    """"mp3 · 256 kbit/s" — oder nur den Codec, wo keine Bitrate feststeht.

    Zehn Sender melden keine, meist verlustfreie mit veraenderlicher Rate.
    Eine erfundene Zahl waere schlimmer als keine.
    """
    codec = sender.get("codec", "")
    rate = sender.get("bitrate")
    return f"{codec} · {rate} kbit/s" if rate else codec


def katalogtext(katalog, texte, kuerzel):
    """Die lesbare Textfassung des Katalogs, nach Regalen geordnet.

    MIT DEN KAERTCHEN-TEXTEN, UND ZWAR HIER UND NUR HIER.

    Sie sind das Einzige an diesem Katalog, was eine Frage wie "Internetradio
    fuer Spiritual Jazz" beantwortet — 146 Namen und Laenderkuerzel tun das
    nicht. Naheliegend waere gewesen, sie ins JSON-LD zu stecken; dort kosten
    sie dasselbe. Sie stehen trotzdem im Fliesstext, weil die Ausleser der
    KI-Abholer (Readability, trafilatura und ihre Verwandten) <script>
    verwerfen, bevor sie ueberhaupt hinsehen — ausgerechnet die
    Antwortmaschinen, um die es geht, laesen sie im JSON-LD nicht. Im Rumpf
    liest sie jeder: Suchmaschine, Antwortmaschine und Mensch.

    DIE SPRACHE: Die Kaertchen und die Regalbeschreibungen sind kuratierter
    deutscher Inhalt und stehen in data/sender.json in EINER Sprache — genau
    so zeichnet app.js sie heute schon in allen sieben Fassungen. Auf den
    sechs nicht-deutschen Seiten bekommen sie deshalb ein lang="de". Das ist
    kein Schmuck: Ohne die Angabe stuende auf der japanischen Seite ein
    Drittel deutscher Text ohne Kennzeichnung, und das ist ein Sprachsignal
    gegen das eigene hreflang. Mit der Angabe ist es ein ausgewiesenes Zitat.
    """
    def t(schluessel, rueckfall=None):
        return texte.get(schluessel, rueckfall if rueckfall is not None else schluessel)

    def esc(text):
        return html.escape(str(text), quote=False)

    # Auf der deutschen Seite waere lang="de" nur Ballast — 146-mal.
    #
    # dir="ltr" nur in der arabischen Fassung, und nicht als Schmuck: Ohne die
    # Angabe erbt ein deutscher Satz die Leserichtung der Seite, und sein
    # Punkt steht am Zeilenanfang. Das Aussehen richtet zwar schon styles.css,
    # aber die Leserichtung ist eine Eigenschaft des Textes — sie muss auch
    # dann stimmen, wenn kein Stylesheet geladen wird.
    deutsch = "" if kuerzel == "de" else ' lang="de"'
    if SPRACHEN[kuerzel][1] == "rtl":
        deutsch += ' dir="ltr"'

    sender = katalog["sender"]
    teile = ['<section class="katalogtext" id="katalogtext">',
             '<details class="katalogtext__auf">',
             '<summary class="katalogtext__knopf"><h2 class="katalogtext__titel">'
             + esc(fuelle(t("katalog.titel"), sender=len(sender)))
             + "</h2></summary>",
             f'<p class="katalogtext__hinweis">{esc(t("katalog.hinweis"))}</p>']

    for regal in katalog["regale"]:
        drin = [s for s in sender if s["regal"] == regal["id"]]
        if not drin:
            continue
        # Die Regalnamen sind Eigennamen und bleiben in jeder Sprachfassung
        # stehen — genauso, wie app.js sie zeichnet und wie sie in
        # seite.beschreibung stehen.
        teile.append('<div class="katalogtext__regal">')
        teile.append(f'<h3 class="katalogtext__name">{esc(regal["name"])} '
                     f'<span class="katalogtext__zahl">'
                     f'{esc(fuelle(t("regalwand.sender"), anzahl=len(drin)))}</span></h3>')
        teile.append(f'<p class="katalogtext__was"{deutsch}>'
                     f'{esc(regal["beschreibung"])}</p>')
        teile.append('<ul class="katalogtext__liste">')
        for s in drin:
            # Die Etiketten gibt es uebersetzt (etikett.*) — anders als die
            # Kaertchen. Sie tragen also in jeder Sprache etwas bei.
            etiketten = ", ".join(t(f"etikett.{e}", e) for e in s.get("etiketten", []))
            angaben = f'{s["betreiber"]}, {s["ort"]} ({s["land"]}) · {guete(s)}'
            if etiketten:
                angaben += f" · {etiketten}"
            teile.append(
                f'<li><a href="{html.escape(s["homepage"], quote=True)}" rel="noopener">'
                f"{esc(s['name'])}</a> — {esc(angaben)}"
                f'<span class="katalogtext__karte"{deutsch}>{esc(s["kaertchen"])}</span></li>')
        teile.append("</ul></div>")

    teile.append("</details></section>")
    return "\n".join(teile) + "\n"


def katalog_jsonld(katalog, texte, kuerzel):
    """Organization, WebSite und die ItemList aller Sender als RadioStation.

    WARUM inLanguage AM WebSite UND NICHT AN DER ItemList: inLanguage ist eine
    Eigenschaft von CreativeWork. ItemList ist ein Intangible und hat sie
    nicht — sie dort hinzuschreiben waere kein Schoenheitsfehler, sondern
    schlicht falsch, und ein Pruefwerkzeug meldet es.

    WARUM knowsAbout FUERS REGAL: RadioStation erbt ueber LocalBusiness von
    Organization, und knowsAbout ist dort zu Hause. `genre` waere das
    naheliegende Wort, gilt aber fuer CreativeWork und nicht fuer eine
    Organisation.

    WARUM OHNE description JE SENDER: Die Kaertchen stehen im Fliesstext, ein
    paar Zeilen weiter oben im selben Dokument. Sie hier zu wiederholen
    kostete 31 kB je Sprachseite fuer nichts — der Block hier trueg dann
    dieselben Saetze ein zweites Mal, und zwar an der Stelle, die die
    Ausleser der KI-Abholer verwerfen. Siehe katalogtext().
    """
    def t(schluessel):
        return texte.get(schluessel, schluessel)

    sender = katalog["sender"]
    regalname = {r["id"]: r["name"] for r in katalog["regale"]}
    seite = f"{HAUS}/{kuerzel}/"

    haus = {
        "@type": "Organization",
        "@id": f"{HAUS}/#haus",
        "name": "IYAMBAE",
        "url": f"{HAUS}/",
        # Das Markenlogo, nicht das App-Symbol. icon-512.png ist der Kachel-
        # Anstrich der PWA und traegt den Rand, den ein Startbildschirm
        # braucht; als Logo einer Organisation ist die Marke gemeint.
        # Uebernommen aus dem festen Block, den der Zweig
        # plattenspieler-und-logo in den Kopf gesetzt hatte — die Marke
        # gehoert Saemi-Ra, also seine Datei.
        "logo": f"{HAUS}/assets/logo/iyambae-radio.svg",
    }

    website = {
        "@type": "WebSite",
        "@id": f"{seite}#seite",
        "url": seite,
        "name": "IYAMBAE FM",
        "alternateName": "IYAMBAE Radio",
        "description": t("seite.beschreibung"),
        "inLanguage": kuerzel,
        "publisher": {"@id": f"{HAUS}/#haus"},
        "about": [
            {"@type": "Thing", "name": "432 Hz"},
            {"@type": "Thing", "name": "Internet radio"},
        ],
        # Die Suche, die Google als Suchfeld unter dem Treffer anbieten kann.
        #
        # SPRACHABHAENGIG, und das ist der Grund, warum sie hier steht und
        # nicht mehr fest im Kopf von index.html: Der feste Block zeigte auf
        # HAUS/?suche=…, also auf die Wurzel. Wer auf Japanisch gesucht
        # haette, waere auf der Sprachweiche gelandet und von dort — je nach
        # Browsereinstellung — irgendwo. Hier zeigt sie auf die Fassung, in
        # der jemand tatsaechlich liest.
        "potentialAction": {
            "@type": "SearchAction",
            "target": {
                "@type": "EntryPoint",
                "urlTemplate": f"{seite}?suche={{search_term_string}}",
            },
            "query-input": "required name=search_term_string",
        },
    }

    eintraege = []
    for platz, s in enumerate(sender, start=1):
        stelle = {
            "@type": "RadioStation",
            "name": s["name"],
            "url": s["homepage"],
            "address": {
                "@type": "PostalAddress",
                "addressLocality": s["ort"],
                "addressCountry": s["land"],
            },
            "knowsAbout": regalname.get(s["regal"], s["regal"]),
        }
        eintraege.append({"@type": "ListItem", "position": platz, "item": stelle})

    liste = {
        "@type": "ItemList",
        "@id": f"{seite}#katalog",
        "name": fuelle(t("katalog.titel"), sender=len(sender)),
        "numberOfItems": len(sender),
        "itemListOrder": "https://schema.org/ItemListUnordered",
        "mainEntityOfPage": seite,
        "itemListElement": eintraege,
    }

    graph = {"@context": "https://schema.org", "@graph": [haus, website, liste]}
    # separators ohne Leerzeichen: bei 146 Eintraegen sind das rund 4 kB je
    # Sprachseite, die niemand liest.
    roh = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))
    # Jedes "<" maskieren, nicht nur "</script>". Ein Kleinerzeichen in einem
    # Sendertext beendete sonst im Zweifel das Skript-Element, und der Rest
    # der Seite waere Text. < ist innerhalb einer JSON-Zeichenkette
    # gueltig; ausserhalb kommt "<" in JSON gar nicht vor.
    roh = roh.replace("<", "\\u003c")
    return f'<script type="application/ld+json">{roh}</script>\n'


def erzeuge_sitemap(alle_kuerzel, stand):
    """Die sieben Sprachwurzeln, jede mit allen Alternativen.

    Jeder Eintrag fuehrt ALLE sieben Fassungen auf, sich selbst
    eingeschlossen — so verlangt es die Spezifikation von hreflang, und ohne
    den Selbstverweis wird die Gruppe verworfen. x-default zeigt auf /, wo
    die Spracherkennung von nginx sitzt.

    lastmod kommt aus data/sender.json (_geprueft_am), nicht aus der Uhr:
    Was hier steht, soll dem Stand entsprechen, den die Seite ausliefert.
    """
    zeilen = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
              '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for kuerzel in alle_kuerzel:
        zeilen.append("  <url>")
        zeilen.append(f"    <loc>{HAUS}/{kuerzel}/</loc>")
        for k in alle_kuerzel:
            zeilen.append(f'    <xhtml:link rel="alternate" hreflang="{k}" '
                          f'href="{HAUS}/{k}/"/>')
        zeilen.append(f'    <xhtml:link rel="alternate" hreflang="x-default" '
                      f'href="{HAUS}/"/>')
        zeilen.append(f"    <lastmod>{stand}</lastmod>")
        zeilen.append("  </url>")
    zeilen.append("</urlset>")
    return "\n".join(zeilen) + "\n"


def erzeuge_robots():
    """robots.txt — und die Entscheidung, die darin steckt.

    Sie steht als Kommentar in der Datei selbst und nicht nur hier: Wer
    robots.txt prueft, liest die Datei, nicht dieses Skript.
    """
    kopf = """# robots.txt fuer iyambae.fm
#
# Erzeugt von Scripts/baue-sprachen.py. Eine von Hand geaenderte Fassung
# ueberschreibt der naechste Bau.
#
# DIE ENTSCHEIDUNG: Kein einziges Verbot gegen einen KI-Abholer.
#
# Wir wollen gefunden werden — von Suchmaschinen UND von Antwortmaschinen.
# Wer heute eine KI nach "Radio in 432 Hz" oder nach "Internetradio fuer
# Spiritual Jazz" fragt, soll diesen Laden genannt bekommen. Ein Laden, den
# niemand nennt, ist ein leerer Laden. Es gibt hier auch nichts zu schuetzen:
# Der Katalog ist kuratierte Empfehlung, kein Bestand, der durch Nennung
# weniger wert wird.
#
# Die grossen Abholer stehen einzeln da, obwohl "User-agent: *" sie schon
# einschliesst. Der Grund ist nicht Technik, sondern Lesbarkeit: Wer diese
# Datei prueft, soll sehen, dass die Frage gestellt und beantwortet wurde —
# und nicht, dass sie vergessen wurde.
#
#   GPTBot           ChatGPT (OpenAI)
#   OAI-SearchBot    die Suche in ChatGPT
#   ChatGPT-User     was ChatGPT auf Zuruf eines Menschen abholt
#   ClaudeBot        Claude (Anthropic)
#   PerplexityBot    Perplexity
#   CCBot            Common Crawl — die Quelle, aus der fast alles lernt
#   Google-Extended  steuert NICHT das Krabbeln, sondern ob Gemini und die
#                    KI-Uebersichten den Inhalt verwenden duerfen
#   Applebot-Extended  dasselbe fuer Apple
#   Bingbot          Bing und Copilot
#
# DAS EINZIGE VERBOT ist /api/: der Anmeldedienst. Er liefert JSON hinter
# einer Anmeldung, keine Seiten, und antwortet ohne laufenden Sidecar mit
# 503. Ihn zu krabbeln findet nichts und kostet beide Seiten Abrufe.
"""
    gruppen = ["*", "Googlebot", "Google-Extended", "Bingbot", "GPTBot",
               "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot",
               "CCBot", "Applebot", "Applebot-Extended"]
    teile = [kopf]
    for name in gruppen:
        teile.append(f"\nUser-agent: {name}\nAllow: /\nDisallow: /api/\n")
    teile.append(f"\nSitemap: {HAUS}/sitemap.xml\n")
    return "".join(teile)


# ── Die neuen Pruefungen ────────────────────────────────────────────
#
# Sie laufen bei JEDEM Bau, auch bei --pruefe, und sie brechen ihn ab. Der
# Grund ist derselbe wie bei pruefe_treue(): Eine Sprachseite, die ihren
# Katalog still verloren hat, faellt sonst niemandem auf — sie sieht im
# Browser genauso aus wie vorher.

def pruefe_seite(kuerzel, seite, katalog, texte):
    """Traegt die erzeugte Seite, was sie tragen soll?"""
    fehler = []
    anzahl = len(katalog["sender"])

    # 1 · Genau eine <h1>, und nicht mehr die alte Begruessung.
    ueberschriften = re.findall(r"<h1\b[^>]*>(.*?)</h1>", seite, re.S)
    if len(ueberschriften) != 1:
        fehler.append(f"{len(ueberschriften)} <h1> statt genau einer")
    elif ueberschriften[0].strip() in ALTE_H1:
        fehler.append(f'<h1> sagt wieder "{ueberschriften[0].strip()}"')
    elif ueberschriften[0].strip() != html.escape(texte["hero.name.start"], quote=False):
        fehler.append(f'<h1> steht nicht auf hero.name.start: '
                      f'"{ueberschriften[0].strip()}"')

    # 2 · Die Textfassung ist da und zaehlt so viele Sender wie der Katalog.
    block = re.search(r'<section class="katalogtext".*?</section>', seite, re.S)
    if not block:
        fehler.append("keine Textfassung des Katalogs im HTML")
    else:
        gezaehlt = block.group(0).count("<li>")
        if gezaehlt != anzahl:
            fehler.append(f"Textfassung listet {gezaehlt} Sender, "
                          f"data/sender.json kennt {anzahl}")

    # 3 · JSON-LD: gueltiges JSON, und die erwarteten Felder stehen darin.
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
            for art in ("Organization", "WebSite", "ItemList"):
                if art not in knoten:
                    fehler.append(f"JSON-LD ohne {art}")
            if daten.get("@context") != "https://schema.org":
                fehler.append("JSON-LD ohne @context auf schema.org")
            netz = knoten.get("WebSite", {})
            if netz.get("inLanguage") != kuerzel:
                fehler.append(f'WebSite meldet inLanguage '
                              f'"{netz.get("inLanguage")}" statt "{kuerzel}"')
            if netz.get("url") != f"{HAUS}/{kuerzel}/":
                fehler.append(f'WebSite zeigt auf {netz.get("url")}')
            liste = knoten.get("ItemList", {})
            eintraege = liste.get("itemListElement", [])
            if liste.get("numberOfItems") != anzahl:
                fehler.append(f"ItemList meldet {liste.get('numberOfItems')} "
                              f"Eintraege, data/sender.json kennt {anzahl}")
            if len(eintraege) != anzahl:
                fehler.append(f"ItemList enthaelt {len(eintraege)} Eintraege, "
                              f"data/sender.json kennt {anzahl}")
            unvollstaendig = [e for e in eintraege
                              if e.get("item", {}).get("@type") != "RadioStation"
                              or not e.get("item", {}).get("name")
                              or not e.get("item", {}).get("url")]
            if unvollstaendig:
                fehler.append(f"{len(unvollstaendig)} ItemList-Eintraege ohne "
                              f"RadioStation, Namen oder Adresse")

    for satz in fehler:
        print(f"  ✘ /{kuerzel}/: {satz}")
    return not fehler


def pruefe_sitemap(quelle, alle_kuerzel):
    """Wohlgeformtes XML, sieben Eintraege, jeder mit allen Alternativen."""
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
    if len(adressen) != len(alle_kuerzel):
        fehler.append(f"{len(adressen)} Eintraege statt {len(alle_kuerzel)}")

    gefunden = set()
    for eintrag in adressen:
        ort = eintrag.findtext(f"{raum}loc")
        gefunden.add(ort)
        # Alle sieben plus x-default, der Selbstverweis eingeschlossen.
        alternativen = eintrag.findall(f"{xhtml}link")
        sprachen = {a.get("hreflang") for a in alternativen}
        erwartet = set(alle_kuerzel) | {"x-default"}
        if sprachen != erwartet:
            fehler.append(f"{ort}: Alternativen {sorted(sprachen)} "
                          f"statt {sorted(erwartet)}")
    fehlt = {f"{HAUS}/{k}/" for k in alle_kuerzel} - gefunden
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
    # Stelle macht alles andere in dieser Datei wertlos.
    if re.search(r"^Disallow:\s*/\s*$", quelle, re.M):
        fehler.append("ein Disallow sperrt die ganze Seite")
    for name in ("GPTBot", "ClaudeBot", "PerplexityBot", "CCBot", "Google-Extended"):
        if not re.search(rf"^User-agent:\s*{name}\s*$", quelle, re.M):
            fehler.append(f"{name} ist nicht ausdruecklich erlaubt")
    for satz in fehler:
        print(f"  ✘ robots.txt: {satz}")
    return not fehler


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

    senderkatalog = json.loads(
        io.open(ROOT / "data" / "sender.json", encoding="utf-8").read())

    # Erst alles bauen und pruefen, dann schreiben. Ein halber Stand auf der
    # Platte waere schlimmer als gar keiner: Die Sprachordner werden vorher
    # geraeumt, und ein Abbruch mitten im Lauf liesse einige leer zurueck.
    seiten, manifeste, gemessen = {}, {}, []
    gut = True
    zahlen = kennzahlen(senderkatalog)

    # Bevor irgendein Text benutzt wird: pruefen, dass die gerechneten
    # Stellen noch Platzhalter tragen. Danach einsetzen.
    for kuerzel in SPRACHEN:
        for schluessel, noetig in GERECHNET.items():
            wert = kataloge[kuerzel].get(schluessel, grund.get(schluessel, ""))
            fehlend = [pl for pl in noetig if pl not in wert]
            if fehlend:
                print(f"  ✘ {kuerzel}: {schluessel} traegt keine Rechnung mehr — "
                      f"es fehlt {', '.join(fehlend)}")
                gut = False

    for kuerzel in SPRACHEN:
        texte = {**grund, **kataloge[kuerzel]}
        texte = {k: fuelle(v, **zahlen) if isinstance(v, str) else v
                 for k, v in texte.items()}
        seite = erzeuge_seite(vorlage_quelle, kuerzel, texte, list(SPRACHEN),
                              senderkatalog)
        seiten[kuerzel] = seite
        manifeste[kuerzel] = erzeuge_manifest(manifest_quelle, kuerzel, texte)
        if not pruefe_seite(kuerzel, seite, senderkatalog, texte):
            gut = False

        # Wie viel kostet die Auffindbarkeit? Gemessen, nicht geschaetzt: Die
        # Textfassung und das JSON-LD werden aus der fertigen Seite
        # herausgerechnet, statt eine zweite Seite ohne sie zu bauen.
        block = re.search(r'<section class="katalogtext".*?</section>\n?', seite, re.S)
        daten = re.search(r'<script type="application/ld\+json">.*?</script>\n?',
                          seite, re.S)
        zusatz = (len(block.group(0)) if block else 0) + \
                 (len(daten.group(0)) if daten else 0)
        gemessen.append((kuerzel, len(seite.encode("utf-8")),
                         len(seite) - zusatz, zusatz))

    sitemap = erzeuge_sitemap(list(SPRACHEN), senderkatalog.get("_geprueft_am", ""))
    robots = erzeuge_robots()
    if not pruefe_sitemap(sitemap, list(SPRACHEN)):
        gut = False
    if not pruefe_robots(robots):
        gut = False

    if not gut:
        print("\n  Nichts geschrieben — der alte Stand bleibt stehen.")
        return 1
    print(f"  ✔ {len(SPRACHEN)} Sprachseiten, sitemap.xml und robots.txt "
          f"bestehen die Pruefungen")

    if nur_pruefen:
        print("  ✔ nur geprueft, nichts geschrieben")
        return 0

    for kuerzel in SPRACHEN:
        ordner = ROOT / kuerzel
        # Alten Stand raeumen, damit ein entfernter Schluessel keine Leiche
        # hinterlaesst.
        if ordner.exists():
            shutil.rmtree(ordner)
        ordner.mkdir()
        io.open(ordner / "index.html", "w", encoding="utf-8",
                newline="\n").write(seiten[kuerzel])
        io.open(ordner / "manifest.webmanifest", "w", encoding="utf-8",
                newline="\n").write(manifeste[kuerzel])

    # robots.txt und sitemap.xml liegen in der Wurzel, nicht im Sprachordner:
    # Es sind Dateien, keine Sprachfassungen. Sie stehen aus demselben Grund
    # in .gitignore wie /de/ und /recht/ — sie sind erzeugt, nicht
    # geschrieben, und im Repository waeren sie eine zweite Wahrheit.
    io.open(ROOT / "sitemap.xml", "w", encoding="utf-8", newline="\n").write(sitemap)
    io.open(ROOT / "robots.txt", "w", encoding="utf-8", newline="\n").write(robots)

    for kuerzel, bytes_, ohne, zusatz in gemessen:
        seite = seiten[kuerzel]
        rest = len(re.findall(
            r'data-(?:text|html|aria|titel|platzhalter|inhalt)="', seite))
        print(f"  ✔ /{kuerzel}/  {len(seite):>6} Zeichen "
              f"({bytes_:>6} Bytes), davon {zusatz:>5} fuer Katalogtext und "
              f"JSON-LD — vorher {ohne}, also +{zusatz * 100 // ohne} %; "
              f"{rest} Auszeichnungen fuer den zweiten Durchlauf, "
              f"dir={SPRACHEN[kuerzel][1]}")

    print(f"  ✔ /sitemap.xml  {len(sitemap):>6} Zeichen, {len(SPRACHEN)} Eintraege")
    print(f"  ✔ /robots.txt   {len(robots):>6} Zeichen")
    print(f"\n  {len(SPRACHEN)} Sprachseiten und {len(SPRACHEN)} Manifeste erzeugt, "
          f"dazu sitemap.xml und robots.txt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
