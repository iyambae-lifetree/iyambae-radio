#!/usr/bin/env python3
"""Baut „Neues Passwort": /<sprache>/passwort-neu/ — sieben Seiten.

WOZU SIE DA IST

Die Mail aus „Passwort vergessen" verweist auf /passwort-neu#marke=…
(dienst/src/server.mjs). nginx leitet nach der Sprache auf
/<sprache>/passwort-neu/ weiter; der Browser nimmt das Fragment mit. Die
Seite liest die Marke und loest sie per POST /api/passwort/neu ein —
siehe assets/passwort-neu.mjs. Bis zum 13.10.2026 fehlte sie, und der Link
in der Mail fuehrte ins Leere (432hz-radio#42).

WOHER DER INHALT KOMMT

    passwort-neu.html              der Aufbau, mit Marken in {{...}}
    data/passwort-neu-texte.json   jeder Satz in sieben Sprachen
    data/regal-texte.json          Sprachwahl und Fusszeile, wie bei den Regalen

Muster und Hilfen (esc, fusszeile) kommen aus baue-regale.py, die
Sprachtabelle aus baue-sprachen.py. Laeuft NACH baue-sprachen.py, das die
Sprachordner raeumt.

    python3 Scripts/baue-passwort-neu.py
"""

import importlib.util
import io
import json
import pathlib
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _lade(name):
    p = ROOT / "Scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), p)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


REGALE = _lade("baue-regale")
SPRACHEN = REGALE.SPRACHEN
esc, esc_attr = REGALE.esc, REGALE.esc_attr

MARKEN = [
    "SPRACHE", "RICHTUNG", "TITEL", "BESCHREIBUNG", "HEIM",
    "SPRACHWAHL_TITEL", "SPRACHWAHL", "AUGENBRAUE", "UEBERSCHRIFT",
    "VORWORT", "FELD", "REGEL", "ZEIGEN", "EINMAL", "SENDEN",
    "OK_TITEL", "OK_TEXT", "OK_KNOPF",
    "LINK_TITEL", "LINK_FELD", "LINK_PLATZHALTER", "LINK_SENDEN",
    "FUSS", "TEXTE",
]

# Was der Programmcode zur Laufzeit braucht. Nur diese Saetze gehen in den
# JSON-Block der Seite; die anderen stehen schon als HTML darin.
FUER_PROGRAMM = [
    "senden", "sendet", "fehlt", "abgelehnt", "verbraucht", "ungueltig",
    "abgelaufen", "gedrosselt", "netz", "link.ohneMail", "link.ok",
]


def sprachwahl(kuerzel):
    zeilen = []
    for k, (name, _) in SPRACHEN.items():
        if k == kuerzel:
            zeilen.append(f'        <span aria-current="true">{esc(name)}</span>')
        else:
            zeilen.append(f'        <a href="/{k}/passwort-neu/" '
                          f'hreflang="{k}" lang="{k}">{esc(name)}</a>')
    return "\n".join(zeilen)


def erzeuge_seite(vorlage, kuerzel, texte, regaltexte):
    _, richtung = SPRACHEN[kuerzel]

    def t(schluessel):
        return texte[schluessel][kuerzel]

    programm = {k: t(k) for k in FUER_PROGRAMM}
    programm.update({k: t(k) for k in texte if k.startswith("grund.")})
    # "</" im JSON wuerde den <script>-Block vorzeitig schliessen.
    texte_json = json.dumps(programm, ensure_ascii=False).replace("</", "<\\/")

    werte = {
        "SPRACHE": kuerzel,
        "RICHTUNG": richtung,
        "TITEL": esc(t("titel")),
        "BESCHREIBUNG": esc_attr(t("beschreibung")),
        "HEIM": f"/{kuerzel}/",
        "SPRACHWAHL_TITEL": esc_attr(regaltexte["sprachwahl"][kuerzel]),
        "SPRACHWAHL": sprachwahl(kuerzel),
        "AUGENBRAUE": esc(t("augenbraue")),
        "UEBERSCHRIFT": esc(t("ueberschrift")),
        "VORWORT": esc(t("vorwort")),
        "FELD": esc(t("feld")),
        "REGEL": esc(t("regel")),
        "ZEIGEN": esc(t("zeigen")),
        "EINMAL": esc(t("einmal")),
        "SENDEN": esc(t("senden")),
        "OK_TITEL": esc(t("ok.titel")),
        "OK_TEXT": esc(t("ok.text")),
        "OK_KNOPF": esc(t("ok.knopf")),
        "LINK_TITEL": esc(t("link.titel")),
        "LINK_FELD": esc(t("link.feld")),
        "LINK_PLATZHALTER": esc_attr(t("link.platzhalter")),
        "LINK_SENDEN": esc(t("link.senden")),
        "FUSS": REGALE.fusszeile({k: v[kuerzel] for k, v in regaltexte.items()
                                  if not k.startswith("_")}, kuerzel),
        "TEXTE": texte_json,
    }

    seite = vorlage
    for marke in MARKEN:
        seite = seite.replace("{{" + marke + "}}", werte[marke])
    return seite


def main():
    vorlage = io.open(ROOT / "passwort-neu.html", encoding="utf-8").read()
    texte = {k: v for k, v in json.loads(io.open(
        ROOT / "data" / "passwort-neu-texte.json", encoding="utf-8").read()).items()
        if not k.startswith("_")}
    regaltexte = REGALE.lade_texte()

    gut = True
    for marke in MARKEN:
        if "{{" + marke + "}}" not in vorlage:
            print(f"  ✘ passwort-neu.html: Marke {{{{{marke}}}}} fehlt")
            gut = False

    for schluessel, fassungen in texte.items():
        fehlend = [k for k in SPRACHEN if not fassungen.get(k, "").strip()]
        if fehlend:
            print(f"  ✘ passwort-neu-texte.json: {schluessel} fehlt fuer {fehlend}")
            gut = False
    for schluessel in FUER_PROGRAMM:
        if schluessel not in texte:
            print(f"  ✘ passwort-neu-texte.json: {schluessel} fehlt ganz")
            gut = False
    if not gut:
        print("\n  Nichts geschrieben.")
        return 1

    seiten = {k: erzeuge_seite(vorlage, k, texte, regaltexte) for k in SPRACHEN}
    for kuerzel, seite in seiten.items():
        if "{{" in seite:
            print(f"  ✘ /{kuerzel}/passwort-neu/: eine Marke blieb stehen")
            gut = False
    if not gut:
        print("\n  Nichts geschrieben.")
        return 1

    for kuerzel, seite in seiten.items():
        ordner = ROOT / kuerzel / "passwort-neu"
        ordner.mkdir(parents=True, exist_ok=True)
        io.open(ordner / "index.html", "w", encoding="utf-8",
                newline="\n").write(seite)
        print(f"  ✔ /{kuerzel}/passwort-neu/  {len(seite):>5} Zeichen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
