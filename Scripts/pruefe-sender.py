#!/usr/bin/env python3
"""
Prüft Senderströme — Erreichbarkeit, Format, Datenrate, CORS.

Zwei Verwendungen:

    python3 Scripts/pruefe-sender.py                 alle Sender aus data/sender.json
    python3 Scripts/pruefe-sender.py URL [URL …]     einzelne Kandidaten

Die Lehren aus STATIONS_AUDIT.md stecken hier drin, damit sie nicht noch
einmal erarbeitet werden müssen:

**Browser-Kennung, nicht die von curl.** Icecast-Server — SomaFM und
StreamGuys besonders — antworten auf eine nackte Werkzeug-Kennung mit leerer
Antwort, spielen im Browser aber einwandfrei. Ohne diese Kennung entstehen
massenhaft Fehlalarme; im alten Katalog sahen 273 von 334 Adressen tot aus.

**`.pls` und `.m3u` sind keine Ströme.** Ein `<audio>`-Element kann eine
Abspielliste nicht abspielen, es meldet `MEDIA_ERR_SRC_NOT_SUPPORTED`. Solche
Adressen werden hier aufgelöst statt abgelehnt.

**Nur HTTPS.** Die Seite läuft über https; ein http-Strom wird vom Browser als
gemischter Inhalt blockiert. Das ist kein Wunsch, sondern ein Ausschluss.

**CORS entscheidet über die Umstimmung.** Nur Ströme mit Freigabe kommen in
den Web-Audio-Graphen — nur bei ihnen kann MyRetuners Signalkern arbeiten.
Ohne Freigabe bleibt es beim Raten über `playbackRate`.

Rückgabewert 0 nur, wenn jede geprüfte Adresse trägt; sonst 1.
"""
import concurrent.futures
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Ohne diese Kennung halten viele Icecast-Server die Verbindung zu.
KENNUNG = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
ZEITLIMIT = 12
ARBEITER = 12


def hole_kopf(url):
    """GET mit sofortigem Abbruch — Icecast antwortet auf HEAD oft gar nicht."""
    anfrage = urllib.request.Request(url, headers={
        "User-Agent": KENNUNG,
        "Icy-MetaData": "1",
        # Erzwingt eine CORS-Antwort, falls der Server eine kennt.
        "Origin": "https://iyambae.fm",
        "Range": "bytes=0-2047",
    })
    with urllib.request.urlopen(anfrage, timeout=ZEITLIMIT) as antwort:
        # Die ersten Bytes werden gebraucht: Bei Ogg steht der Codec darin,
        # und der Kopf allein verraet ihn nicht.
        rumpf = antwort.read(2048)
        # Kopfnamen klein: Server schreiben „access-control-allow-origin" mal
        # so, mal so. Bis 01.10.2026 stand hier dict(antwort.headers), und
        # das Nachschlagen unter „Access-Control-Allow-Origin" verfehlte die
        # klein geschriebenen — ein Dutzend Sender mit CORS galten als Sender ohne.
        return (antwort.status, {k.lower(): v for k, v in antwort.headers.items()},
                antwort.url, rumpf)


def loese_abspielliste(url):
    """.pls und .m3u enthalten die eigentliche Adresse — die holen wir heraus."""
    anfrage = urllib.request.Request(url, headers={"User-Agent": KENNUNG})
    with urllib.request.urlopen(anfrage, timeout=ZEITLIMIT) as antwort:
        text = antwort.read(8192).decode("utf-8", "replace")
    for zeile in text.splitlines():
        zeile = zeile.strip()
        if zeile.lower().startswith("file"):          # .pls
            teil = zeile.split("=", 1)
            if len(teil) == 2 and teil[1].startswith("http"):
                return teil[1].strip()
        if zeile.startswith("http"):                   # .m3u
            return zeile
    return None


def format_aus(kopf, rumpf=b""):
    """
    Format bestimmen — und bei Ogg NICHT raten.

    `application/ogg` sagt nur, dass es ein Ogg-Container ist. Darin kann
    Vorbis, Opus oder FLAC stecken. Ein erster Lauf dieses Skripts hat
    pauschal „vorbis" angenommen und dabei Radio Paradise (FLAC) und
    Listen.moe (Opus) falsch eingeordnet — die gespeicherten Daten waren
    genauer als die Messung.

    Der Codec steht im ersten Ogg-Paket, gleich hinter der Kennung `OggS`:
    „vorbis", „OpusHead" oder „FLAC". Danach wird hier gesucht, statt zu raten.
    """
    typ = (kopf.get("content-type") or "").lower()
    typ = typ.split(";")[0].strip()

    einfach = {
        "audio/mpeg": "mp3", "audio/mp3": "mp3",
        "audio/aac": "aac", "audio/aacp": "aac", "audio/mp4": "aac",
        "audio/opus": "opus", "audio/flac": "flac", "audio/x-flac": "flac",
    }
    if typ in einfach:
        return einfach[typ]

    if typ in ("audio/ogg", "application/ogg", "audio/vorbis"):
        if b"OpusHead" in rumpf: return "opus"
        if b"FLAC" in rumpf:     return "flac"
        if b"vorbis" in rumpf:   return "vorbis"
        # Ehrlich bleiben: Container erkannt, Inhalt nicht.
        return "ogg?"

    return typ or "?"


def abtastrate_aus_mp3(rumpf):
    """
    Abtastrate aus dem ersten MP3-Rahmen lesen.

    Viele Icecast-Server senden `icy-br`, aber kein `icy-sr`. Die Rate steht
    aber im Rahmenkopf selbst — elf Sync-Bits, dann Fassung, Lage und zwei
    Bits für die Rate. Das ist eindeutig und muss nicht geraten werden.
    """
    raten = {
        3: [44100, 48000, 32000],   # MPEG 1
        2: [22050, 24000, 16000],   # MPEG 2
        0: [11025, 12000, 8000],    # MPEG 2.5
    }
    for i in range(len(rumpf) - 3):
        if rumpf[i] == 0xFF and (rumpf[i + 1] & 0xE0) == 0xE0:
            fassung = (rumpf[i + 1] >> 3) & 0x03
            index = (rumpf[i + 2] >> 2) & 0x03
            if fassung in raten and index < 3:
                return raten[fassung][index]
    return None


def pruefe_hls(ergebnis, url):
    """Trägt, wenn die Liste lädt und — bei einer Hauptliste — die erste
    Unterliste Teilstücke nennt. Codec und Datenrate stehen nur als
    Bandbreiten-Angabe darin; die wird nicht als Datenrate ausgegeben."""
    def lade(adresse):
        anfrage = urllib.request.Request(adresse, headers={
            "User-Agent": KENNUNG, "Origin": "https://iyambae.fm"})
        with urllib.request.urlopen(anfrage, timeout=ZEITLIMIT) as antwort:
            kopf = {k.lower(): v for k, v in antwort.headers.items()}
            return antwort.read(200_000).decode("utf-8", "replace"), antwort.url, kopf

    text, endgueltig, kopf = lade(url)
    if "#EXTM3U" not in text:
        ergebnis["grund"] = "HLS-Adresse ohne HLS-Liste"
        return ergebnis
    zeilen = [z.strip() for z in text.splitlines() if z.strip() and not z.startswith("#")]
    if "#EXT-X-STREAM-INF" in text and zeilen:
        unter, _, _ = lade(urllib.parse.urljoin(endgueltig, zeilen[0]))
        zeilen = [z for z in unter.splitlines() if z.strip() and not z.startswith("#")]
    if not zeilen:
        ergebnis["grund"] = "HLS-Liste ohne Teilstücke"
        return ergebnis
    ergebnis.update({
        "ok": True, "status": 200, "codec": "hls", "bitrate": None,
        "samplerate": None, "sendername": None,
        "cors": (kopf.get("access-control-allow-origin") or "") in ("*", "https://iyambae.fm"),
        "endgueltig": endgueltig if endgueltig != url else None,
    })
    return ergebnis


def pruefe(name, url):
    ergebnis = {"name": name, "url": url, "ok": False}

    if url.startswith("http://"):
        ergebnis["grund"] = "nur HTTP — vom Browser als gemischter Inhalt blockiert"
        return ergebnis

    try:
        # HLS ist keine Abspielliste im Sinne von .pls/.m3u: Die Seite spielt
        # es über hls.js, und die Zeilen darin sind relative Teilstücke statt
        # einer Adresse. Bis 01.10.2026 landete .m3u8 im Zweig darunter, und
        # sieben laufende Sender galten als tot.
        if re.search(r"\.m3u8(\?|$)", url, re.I):
            return pruefe_hls(ergebnis, url)
        if re.search(r"\.(pls|m3u)(\?|$)", url, re.I):
            echt = loese_abspielliste(url)
            if not echt:
                ergebnis["grund"] = "Abspielliste ohne brauchbare Adresse"
                return ergebnis
            ergebnis["aufgeloest"] = echt
            url = echt

        status, kopf, endgueltig, rumpf = hole_kopf(url)
    except urllib.error.HTTPError as f:
        ergebnis["grund"] = f"HTTP {f.code}"
        return ergebnis
    except Exception as f:
        ergebnis["grund"] = f"{type(f).__name__}: {f}"[:80]
        return ergebnis

    ergebnis.update({
        "ok": 200 <= status < 300,
        "status": status,
        "codec": format_aus(kopf, rumpf),
        "bitrate": int(kopf.get("icy-br") or 0) or None,
        # icy-sr fehlt bei vielen Servern; dann aus dem MP3-Rahmen lesen.
        # Den Rahmenkopf nur bei MP3 lesen: Ein AAC-Rahmen (ADTS) beginnt mit
        # denselben Sync-Bits und ergab hier 22050 oder 8000 Hz, wo 44100
        # gesendet wird.
        "samplerate": int(kopf.get("icy-sr") or 0) or (
            abtastrate_aus_mp3(rumpf) if format_aus(kopf, rumpf) == "mp3" else None),
        "sendername": kopf.get("icy-name"),
        # Nur wer hier antwortet, kann umgestimmt werden.
        "cors": (kopf.get("access-control-allow-origin") or "") in ("*", "https://iyambae.fm"),
        "endgueltig": endgueltig if endgueltig != url else None,
    })
    return ergebnis


def main():
    if len(sys.argv) > 1:
        aufgaben = [(u, u) for u in sys.argv[1:]]
    else:
        daten = json.loads((ROOT / "data" / "sender.json").read_text(encoding="utf-8"))
        aufgaben = [(s["name"], s["stream"]) for s in daten["sender"]]

    print(f"  {len(aufgaben)} Adressen, {ARBEITER} gleichzeitig, {ZEITLIMIT}s Zeitlimit")
    print()

    with concurrent.futures.ThreadPoolExecutor(max_workers=ARBEITER) as pool:
        ergebnisse = list(pool.map(lambda a: pruefe(*a), aufgaben))

    gut = [e for e in ergebnisse if e["ok"]]
    schlecht = [e for e in ergebnisse if not e["ok"]]

    for e in sorted(gut, key=lambda x: x["name"]):
        teile = [e["codec"]]
        if e.get("bitrate"): teile.append(f"{e['bitrate']}k")
        if e.get("samplerate"): teile.append(f"{e['samplerate']}Hz")
        print(f"  ✔ {e['name'][:34]:<34} {' '.join(teile):<20} "
              f"CORS {'ja ' if e['cors'] else 'nein'}")
        if e.get("aufgeloest"): print(f"      Abspielliste aufgeloest → {e['aufgeloest']}")
        if e.get("endgueltig"): print(f"      Weiterleitung → {e['endgueltig']}")

    if schlecht:
        print()
        for e in sorted(schlecht, key=lambda x: x["name"]):
            print(f"  ✘ {e['name'][:34]:<34} {e['grund']}")

    print()
    print(f"  {len(gut)} erreichbar, {len(schlecht)} nicht. "
          f"Davon mit CORS: {sum(1 for e in gut if e['cors'])}")
    # Rueckgabewert 1, sobald EINE Adresse nicht traegt. Vorher reichte eine
    # einzige erreichbare, und 164 tote Stroeme haetten als Erfolg gegolten —
    # wer das Skript aus einem anderen aufruft, sah dann nichts.
    return 1 if schlecht else 0


if __name__ == "__main__":
    sys.exit(main())
