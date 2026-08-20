# IYAMBAE — statische Auslieferung in einem Container.
#
# nginx-unprivileged statt nginx: läuft als Benutzer 101 auf Port 8080, ohne
# root im Container. Azure Container Apps braucht keinen privilegierten Port.
FROM nginxinc/nginx-unprivileged:1.29-alpine

# Die eigene Konfiguration ersetzt die mitgelieferte vollständig.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Das Radio: alles, was .dockerignore nicht ausschließt.
COPY --chown=101:101 . /srv/radio

# Die Apps-Seite. Liegt im selben Bestand, wird aber unter einem eigenen
# Hostnamen ausgeliefert — siehe nginx.conf.
COPY --chown=101:101 apps /srv/apps

# Innerhalb von /srv/radio hat die Apps-Seite nichts zu suchen; sie wäre
# sonst zusätzlich unter iyambae.fm/apps erreichbar und damit doppelt
# indexierbar.
USER root
RUN rm -rf /srv/radio/apps /srv/radio/deploy /srv/radio/infra /srv/radio/Scripts
USER 101

EXPOSE 8080

# Ein Container, der nicht antwortet, soll das melden, statt still zu stehen.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
