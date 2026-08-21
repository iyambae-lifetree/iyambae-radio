#!/usr/bin/env python3
"""
Macht aus docs/recht/*.md ausgelieferte Seiten unter /recht/.

WARUM DAS EIN EIGENES SKRIPT IST

Die Rechtstexte liegen als Markdown im Repository — dort gehören sie hin, weil
sie sich ändern, wenn sich die Seite ändert, und weil man Änderungen daran im
Verlauf sehen können muss. Ausgeliefert werden können sie so aber nicht:
`docs` steht in `.dockerignore` und landet nicht einmal im Bau-Kontext.

Ein Impressum, das nur im Repository liegt, ist kein Impressum.

WARUM /recht/ UND NICHT /de/recht/

Die Sprachordner werden von Scripts/baue-sprachen.py bei jedem Lauf gelöscht
und neu angelegt. Was dort hineingeschrieben wird, ist beim nächsten Lauf weg.

Vor allem aber: Die Texte gibt es heute nur auf Deutsch. Sie unter /fr/ zu
verlinken wäre eine Zusage, die die Seite nicht hält. Ein Rechtstext in einer
Sprache, die der Leser nicht versteht, erfüllt Art. 12 Abs. 1 DSGVO nicht
(»in präziser, transparenter, verständlicher und leicht zugänglicher Form«).
Deshalb ein eigener, sprachneutraler Pfad, und der Verweis darauf trägt
hreflang="de" — dann weiß der Browser und die Suchmaschine, woran sie sind.

Wenn die Übersetzungen kommen, wird daraus /recht/<kuerzel>/impressum/.

Aufruf:
    python3 Scripts/baue-recht.py
"""
import html
import io
import pathlib
import re
import shutil
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUELLE = ROOT / "docs" / "recht"
ZIEL = ROOT / "recht"

# HINWEISE.md ist die Arbeitsliste für den Betreiber, kein Rechtstext für
# Besucher. Sie bleibt im Repository.
SEITEN = {
    "impressum":                ("Impressum", "Impressum und Verantwortlicher für iyambae.fm."),
    "datenschutz":              ("Datenschutz", "Was iyambae.fm speichert, wie lange und warum."),
    "verarbeitungsverzeichnis": ("Verarbeitungsverzeichnis",
                                 "Verzeichnis der Verarbeitungstätigkeiten nach Art. 30 DSGVO."),
}

FETT     = re.compile(r"\*\*(.+?)\*\*")
KURSIV   = re.compile(r"(?<![\*\w])\*([^*\n]+)\*(?!\*)")
CODE     = re.compile(r"`([^`]+)`")
VERWEIS  = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def inline(text):
    """Fett, kursiv, Code und Verweise — in dieser Reihenfolge.

    Zuerst maskieren, dann auszeichnen. Andersherum wuerde das erste `<`
    einer erzeugten Auszeichnung im naechsten Schritt selbst maskiert.
    """
    t = html.escape(text, quote=False)
    t = CODE.sub(lambda m: f"<code>{m.group(1)}</code>", t)
    t = FETT.sub(lambda m: f"<strong>{m.group(1)}</strong>", t)
    t = KURSIV.sub(lambda m: f"<em>{m.group(1)}</em>", t)
    t = VERWEIS.sub(lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>', t)
    return t


def zerlege_zeile(zeile):
    """Eine Tabellenzeile in ihre Zellen — ohne die leeren Raender."""
    return [z.strip() for z in zeile.strip().strip("|").split("|")]


def nach_html(text):
    zeilen = text.split("\n")
    raus = []
    i = 0
    while i < len(zeilen):
        z = zeilen[i]
        strich = z.strip()

        if not strich:
            i += 1
            continue

        if strich.startswith("#"):
            stufe = min(len(strich) - len(strich.lstrip("#")), 6)
            raus.append(f"<h{stufe}>{inline(strich.lstrip('# ').strip())}</h{stufe}>")
            i += 1
            continue

        if re.fullmatch(r"-{3,}|\*{3,}|_{3,}", strich):
            raus.append("<hr>")
            i += 1
            continue

        # Tabelle: Kopfzeile, Trennzeile, Rumpf. Die Trennzeile muss da sein,
        # sonst ist es keine Tabelle, sondern Text mit Strichen darin.
        if strich.startswith("|") and i + 1 < len(zeilen) \
                and re.fullmatch(r"\|[\s:|-]+\|?", zeilen[i + 1].strip()):
            kopf = zerlege_zeile(z)
            i += 2
            koerper = []
            while i < len(zeilen) and zeilen[i].strip().startswith("|"):
                koerper.append(zerlege_zeile(zeilen[i]))
                i += 1
            kopfzeile = "".join(f"<th>{inline(c)}</th>" for c in kopf)
            rumpf = "".join(
                "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in reihe) + "</tr>"
                for reihe in koerper)
            # Der Kasten scrollt, nicht die Seite: Ein Verarbeitungsverzeichnis
            # hat breite Tabellen, und ein waagerecht scrollender Seitenkoerper
            # waere auf dem Handy unbedienbar.
            raus.append('<div class="tabellenkasten"><table><thead><tr>'
                        + kopfzeile + "</tr></thead><tbody>" + rumpf + "</tbody></table></div>")
            continue

        # Ein eingerueckter Block ist vorformatierter Text — eine Anschrift,
        # eine Protokollzeile, ein Befehl. Ihn zu einem Fliesstextabsatz
        # zusammenzuziehen macht aus einer dreizeiligen Anschrift eine Zeile.
        # Genau das ist im ersten Entwurf passiert.
        if z.startswith(("    ", "	")) and strich:
            block = []
            while i < len(zeilen) and (zeilen[i].startswith(("    ", "	"))
                                       or not zeilen[i].strip()):
                if not zeilen[i].strip() and not block:
                    i += 1
                    continue
                block.append(re.sub(r"^(?:    |	)", "", zeilen[i]))
                i += 1
            while block and not block[-1].strip():
                block.pop()
            raus.append("<pre>" + html.escape("\n".join(block), quote=False) + "</pre>")
            continue

        if strich.startswith(">"):
            block = []
            while i < len(zeilen) and zeilen[i].strip().startswith(">"):
                block.append(zeilen[i].strip().lstrip("> ").strip())
                i += 1
            text = " ".join(block)
            # Ein Kasten, der mit "**Entwurf" beginnt, richtet sich an den
            # Betreiber, nicht an den Besucher — und verweist auf HINWEISE.md,
            # die bewusst nicht ausgeliefert wird. Auf der Seite stuende sonst
            # "Platzhalter ausfuellen" und darunter ein Verweis ins Leere.
            if not text.lstrip().startswith("**Entwurf"):
                raus.append("<blockquote>" + inline(text) + "</blockquote>")
            continue

        if re.match(r"^\s*(?:[-*+]\s|\d+[.)]\s)", z):
            geordnet = bool(re.match(r"^\s*\d+[.)]\s", z))
            punkte = []
            while i < len(zeilen) and re.match(r"^\s*(?:[-*+]\s|\d+[.)]\s)", zeilen[i]):
                punkte.append(re.sub(r"^\s*(?:[-*+]\s|\d+[.)]\s)", "", zeilen[i]))
                i += 1
                # Fortsetzungszeilen gehoeren zum Punkt davor.
                #
                # Ohne das reisst jeder umgebrochene Listenpunkt ab: Der
                # Rest faellt als eigener Absatz HINTER die Liste, und aus
                # einer Aufzaehlung mit drei Punkten werden drei
                # Einpunkt-Listen mit Text dazwischen. Gemessen: 15 mal
                # allein in datenschutz.md.
                #
                # Eingerueckt heisst Fortsetzung — eine Zeile am
                # Zeilenanfang beginnt etwas Neues.
                while (i < len(zeilen) and zeilen[i].strip()
                       and not re.match(r"^\s*(?:[-*+]\s|\d+[.)]\s)", zeilen[i])
                       and not zeilen[i].strip().startswith(("#", "|", ">"))
                       and zeilen[i].startswith((" ", "	"))):
                    punkte[-1] += " " + zeilen[i].strip()
                    i += 1
            marke = "ol" if geordnet else "ul"
            raus.append(f"<{marke}>" + "".join(f"<li>{inline(p)}</li>" for p in punkte)
                        + f"</{marke}>")
            continue

        # Alles Uebrige ist ein Absatz — bis zur naechsten Leerzeile oder bis
        # etwas beginnt, das kein Absatz mehr ist.
        absatz = []
        while i < len(zeilen) and zeilen[i].strip() \
                and not zeilen[i].strip().startswith(("#", "|", ">")) \
                and not re.match(r"^\s*(?:[-*+]\s|\d+[.)]\s)", zeilen[i]) \
                and not re.fullmatch(r"-{3,}|\*{3,}|_{3,}", zeilen[i].strip()):
            absatz.append(zeilen[i].strip())
            i += 1
        raus.append("<p>" + inline(" ".join(absatz)) + "</p>")

    return "\n".join(raus)


VORLAGE = """<!DOCTYPE html>
<html lang="de" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>{titel} — IYAMBAE FM</title>
    <meta name="description" content="{beschreibung}">
    <meta name="theme-color" content="#F2B705">
    <!-- Kein Index: Ein Impressum soll auffindbar sein, wenn man es sucht,
         aber es ist kein Inhalt, mit dem diese Seite gefunden werden will. -->
    <meta name="robots" content="noindex, follow">
    <link rel="icon" href="/icon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/schrift/schriften.css">
    <link rel="stylesheet" href="/assets/styles.css">
    <link rel="stylesheet" href="/assets/recht.css">
</head>
<body class="rechtsseite">
    <header class="kopf">
        <a class="logo" href="/de/" aria-label="IYAMBAE FM">
            <img src="/assets/logo/iyambae-marke.svg" alt="" width="46" height="33">
            <span class="logo__wort">IYAMBAE<span>FM</span></span>
        </a>
    </header>

    <main class="rechtstext">
{inhalt}
    </main>

    <footer class="fuss">
        <nav class="fuss__recht" aria-label="Rechtliches">
            <a href="/de/">Zum Laden</a>
            <a href="/recht/impressum/">Impressum</a>
            <a href="/recht/datenschutz/">Datenschutz</a>
            <a href="/recht/verarbeitungsverzeichnis/">Verarbeitungsverzeichnis</a>
        </nav>
    </footer>
</body>
</html>
"""


def main():
    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    ZIEL.mkdir(parents=True)

    for name, (titel, beschreibung) in SEITEN.items():
        quelle = QUELLE / f"{name}.md"
        if not quelle.exists():
            print(f"  ✘ {quelle.relative_to(ROOT)} fehlt")
            return 1
        text = io.open(quelle, encoding="utf-8").read()
        seite = VORLAGE.format(titel=html.escape(titel),
                               beschreibung=html.escape(beschreibung, quote=True),
                               inhalt=nach_html(text))
        ordner = ZIEL / name
        ordner.mkdir()
        io.open(ordner / "index.html", "w", encoding="utf-8", newline="\n").write(seite)
        print(f"  ✔ /recht/{name}/  {len(seite):>6} Zeichen aus {len(text)} Zeichen Markdown")

    print(f"\n  {len(SEITEN)} Rechtsseiten erzeugt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
