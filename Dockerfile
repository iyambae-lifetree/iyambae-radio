# IYAMBAE — statische Auslieferung in einem Container.
#
# Zwei Stufen. Die erste erzeugt die sieben Sprachseiten, die zweite liefert
# aus. Der Grund für die Trennung: Die Sprachseiten sind erzeugt, nicht
# geschrieben. Lägen sie im Repository, gäbe es zwei Wahrheiten — index.html
# und sieben Kopien davon — und die Kopien veralteten still beim nächsten
# Textwechsel. So entstehen sie bei jedem Bau neu aus der Vorlage.

# ── Stufe 1: die Sprachseiten erzeugen ──────────────────────────────
FROM python:3.12-alpine AS erzeuger
WORKDIR /bau
# node für die drei Prüfungen, die Modulcode tatsächlich AUSFÜHREN statt ihn
# zu lesen: die Erlaubnisliste der Messung, die Reihenfolge im Regal
# „Zuletzt gehört" und die Zustandslogik des Kontos. Diese Stufe wird
# verworfen; im ausgelieferten Abbild steckt kein node.
RUN apk add --no-cache nodejs
COPY . .
# Der Erzeuger prüft sich selbst: Er muss index.html mit dem deutschen
# Katalog zeichengenau reproduzieren. Schlägt das fehl, bricht der Bau hier
# ab — und nicht erst im Browser eines Besuchers.
RUN python3 Scripts/baue-sprachen.py \
 && python3 Scripts/baue-recht.py \
 && python3 Scripts/baue-apps-sprachen.py \
 && python3 Scripts/pruefe-shell-dateien.py \
 && node Scripts/pruefe-messung.mjs \
 && node Scripts/pruefe-verlauf.mjs \
 && node Scripts/pruefe-konto.mjs

# ── Stufe 2: ausliefern ─────────────────────────────────────────────
#
# nginx-unprivileged statt nginx: läuft als Benutzer 101 auf Port 8080, ohne
# root im Container. Azure Container Apps braucht keinen privilegierten Port.
FROM nginxinc/nginx-unprivileged:1.29-alpine

# Die eigene Konfiguration ersetzt die mitgelieferte vollständig.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Das Radio, samt der eben erzeugten Sprachordner.
COPY --from=erzeuger --chown=101:101 /bau /srv/radio

# Die Apps-Seite. Liegt im selben Bestand, wird aber unter einem eigenen
# Hostnamen ausgeliefert — siehe nginx.conf.
COPY --from=erzeuger --chown=101:101 /bau/apps /srv/apps

# Innerhalb von /srv/radio hat die Apps-Seite nichts zu suchen; sie wäre
# sonst zusätzlich unter iyambae.fm/apps erreichbar und damit doppelt
# indexierbar.
USER root
RUN rm -rf /srv/radio/apps /srv/radio/deploy /srv/radio/infra /srv/radio/Scripts \
           /srv/radio/.git /srv/radio/docs
USER 101

EXPOSE 8080

# Ein Container, der nicht antwortet, soll das melden, statt still zu stehen.
#
# Geprüft wird /en/ und nicht /: Auf / steht eine Umleitung, und was BusyBox
# daraus macht, hängt an Schaltern, die es nicht gibt. /en/ antwortet direkt
# mit 200.
#
# KEIN --max-redirect: Alpine bringt BusyBox-wget mit, nicht GNU-wget, und
# BusyBox kennt den Schalter nicht. Er stand hier zwei Fassungen lang und
# machte den Container dauerhaft „unhealthy", während die Seite tadellos
# antwortete — gemessen: 20 Fehlversuche in Folge, jedes Mal „unrecognized
# option", nie eine einzige HTTP-Anfrage.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/en/ || exit 1
