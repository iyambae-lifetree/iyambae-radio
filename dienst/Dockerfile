# IYAMBAE — der Anmeldedienst als Sidecar.
#
# Er laeuft NICHT allein, sondern als zweiter Container in derselben Replik
# wie nginx (siehe infra/main.bicep). nginx reicht /api/ an 127.0.0.1:8081
# weiter — dieser Container lauscht dort und sonst nirgends. Es gibt keinen
# Ingress auf ihn, keinen eigenen Hostnamen, keine Adresse von aussen.
#
# Zwei Stufen. Nicht aus Gewohnheit, sondern weil `npm ci` einen Cache, eine
# package-lock.json und ein Gedaechtnis hinterlaesst, das in einem Abbild
# nichts zu suchen hat. Die zweite Stufe bekommt genau drei Dinge: die
# Abhaengigkeiten, den Quelltext und package.json.

# ── Stufe 1: Abhaengigkeiten aufloesen ──────────────────────────────
#
# alpine, und das ist hier eine Entscheidung mit Folgen: `@node-rs/argon2`
# ist eine native Bibliothek. Auf alpine (musl) zieht npm die Variante
# `@node-rs/argon2-linux-x64-musl`; auf Debian waere es die gnu-Variante.
# Beide liegen als fertiges Binaerpaket in der Registry — es wird nichts
# uebersetzt, es braucht keinen Compiler, und deshalb bleibt die Stufe klein.
#
# Wer das Grundabbild wechselt, prueft danach, ob argon2 wirklich laedt:
# ein fehlendes Binaerpaket faellt erst beim ersten Passwort auf.
FROM node:22-alpine AS abhaengigkeiten
WORKDIR /bau

# Nur die beiden Dateien, die den Abhaengigkeitsbaum beschreiben — nicht der
# Quelltext. So bleibt diese Schicht im Docker-Cache liegen, solange sich an
# den Abhaengigkeiten nichts aendert. Eine Textaenderung in src/ baut dann
# nicht die halbe Registry neu.
COPY package.json package-lock.json ./

# `npm ci`, nicht `npm install`: ci baut streng nach package-lock.json und
# scheitert, wenn die beiden Dateien auseinanderlaufen. Genau das soll ein
# Bau tun — stillschweigend eine neuere Fassung ziehen ist der Weg, auf dem
# ein geprueftes Abbild und ein ausgeliefertes Abbild verschiedene Dinge sind.
#
# `--omit=dev`: Es gibt hier ohnehin keine Entwicklungsabhaengigkeiten (die
# Tests laufen mit `node --test` aus der Standardbibliothek). Die Zeile steht
# trotzdem da, damit sie es auch bleibt, wenn eines Tages eine dazukommt.
RUN npm ci --omit=dev --no-audit --no-fund

# ── Stufe 2: laufen lassen ──────────────────────────────────────────
FROM node:22-alpine

# `production` schaltet in Bibliotheken die Entwicklungspfade ab und ist die
# Vorgabe, gegen die geprueft wurde.
ENV NODE_ENV=production

# Beides gehoert ZUSAMMEN und beides gehoert hierher, nicht in die Vorlage
# allein — die Messung im README (Abschnitt „Speicher je Argon2-Pruefung")
# zeigt, dass ein erhoehter Thread-Pool bei gelockerter Schranke die ganze
# Replik per OOM abraeumt. Zwei Deckel, und einer allein genuegt; wer einen
# aendert, aendert den anderen mit.
#
# Gemessen: UV_THREADPOOL_SIZE=4 und Schranke 4 ergeben +89 MiB Spitze bei
# 200 gleichzeitigen Passwortanmeldungen. Das passt in 0,5 GiB.
ENV UV_THREADPOOL_SIZE=4
ENV ARGON_GLEICHZEITIG=4

WORKDIR /dienst

# Das Abbild traegt den Benutzer `node` (UID 1000) ab Werk mit. Er wird
# benutzt, nicht neu erfunden — und die Dateien gehoeren ihm gleich beim
# Kopieren, nicht nachtraeglich per chown in einer eigenen Schicht.
#
# Der Dienst schreibt nichts ins Dateisystem. Die Dateien duerfen ihm
# deshalb gehoeren, ohne dass er sie aendern koennen muss; --chown setzt den
# Besitzer, die Rechte bleiben die des Ursprungs.
COPY --from=abhaengigkeiten --chown=node:node /bau/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# Ab hier kein root mehr. Alles darunter — auch der Prozess selbst — laeuft
# als UID 1000. Container Apps braucht keinen privilegierten Port; 8081 liegt
# weit ueber 1024.
USER node

EXPOSE 8081

# Ein Container, der nicht antwortet, soll das melden, statt still zu stehen.
#
# `/api/leben` antwortet 204 und fasst dabei WEDER Table Storage NOCH ACS an
# — Absicht, siehe den Kommentar an der Route in src/server.mjs. Eine Probe,
# die die Datenhaltung mitprueft, macht aus einer Stoerung dort einen
# Neustart hier, und der hilft niemandem.
#
# BusyBox-wget, nicht GNU-wget: keine Schalter benutzen, die Alpine nicht
# kennt. `-q -O /dev/null` reicht, und ein 204 ist fuer wget ein Erfolg.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8081/api/leben || exit 1

# Direkt `node`, NICHT `npm start`.
#
# Mit npm davor ist npm der Prozess 1, und SIGTERM landet bei ihm statt bei
# Node. server.mjs faengt SIGTERM ab, um eine laufende Anmeldung zu Ende zu
# bringen, bevor der Container geht (siehe `starte()`); ueber npm kaeme das
# Zeichen dort nie an, und Container Apps schoesse nach der Frist hart ab.
CMD ["node", "src/server.mjs"]
