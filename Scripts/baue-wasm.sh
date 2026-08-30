#!/bin/bash
#
# Übersetzt MyRetuners Signalkern nach WebAssembly — BEIDE Engines.
#
# Warum: Die Seite rät bisher. Sie nimmt an, jeder Sender sei auf 440 Hz
# gestimmt, und zieht mit `playbackRate` pauschal herunter — was nebenbei
# auch das Tempo ändert. Derselbe C-Kern, der auf Mac, Windows und Linux das
# Systemaudio umstimmt, kann das im Browser richtig machen: Tonhöhe ohne
# Tempoänderung.
#
# SEIT DEM 30.08.2026 IST AUCH DIE GUTE ENGINE DABEI.
#
# Vorher lag hier nur RetunerDSP.c, die schnelle Delay-Line. Deren Artefakt
# steht in ihrem eigenen Quelltext: Bei der voreingestellten Überblendbreite
# 0,5 tragen beide Leseköpfe immer bei, also liegt durchgehend ein Kammfilter
# aus zwei Kopien über dem Signal — hörbar als langsames Pulsieren. Auf der
# Probe der Landeseite waren das 2,7 dB, 0,8-mal je Sekunde.
#
# Sāmi-Ra am 30.08.2026: „Beste Produkte verdienen beste Präsentation."
# Deshalb kommt RetunerStretch.cpp mit — Signalsmith Stretch, dieselbe
# Engine, die auf dem Mac „High Quality" heisst.
#
# Das Ergebnis ist bewusst eine **eigenständige** .wasm ohne JS-Hülle:
# Emscriptens erzeugtes Modul lädt die .wasm per `fetch` nach, und `fetch`
# gibt es im AudioWorkletGlobalScope nicht.
#
# Ohne C++ verlangte das Modul gar keine Importe. Mit C++ verlangt es genau
# vier, und der Worklet reicht sie als Stummel herein — random_get (Signalsmith
# würfelt Phasen), dazu fd_write/fd_seek/fd_close aus den Abbruchpfaden von
# libc++, die nie gerufen werden. Die Prüfung unten lässt genau diese vier zu
# und keinen fünften: Ein unbemerkt hinzugekommener Import macht das Modul im
# Worklet unbrauchbar, und zwar erst zur Laufzeit.
#
# C++ BRINGT ZWEI BEDINGUNGEN MIT
#
#   1. Statische Konstruktoren. Wer das Modul instanziiert, MUSS danach
#      `_initialize()` rufen — sonst laufen sie nie. Der Worklet tut das.
#   2. Ohne -fno-exceptions verlangt das Modul Importe für das Abwickeln
#      des Stapels, und dann ist es im Worklet nicht mehr instanziierbar.
#      Die Prüfung ganz unten fängt genau das ab.
#
# Aufruf, örtlich (emcc aus Homebrew, MyRetuner als Geschwisterordner):
#
#   KERN=~/Claude/MyRetuner ZIEL=apps/assets/wasm bash Scripts/baue-wasm.sh
#
# Aufruf über Docker, wenn emcc nicht örtlich liegt:
#
#   docker run --rm \
#     -v "$PWD/../MyRetuner:/kern:ro" -v "$PWD/apps/assets/wasm:/out" \
#     emscripten/emsdk:latest bash -lc "bash /out/../../../Scripts/baue-wasm.sh"
#
set -euo pipefail

KERN=${KERN:-/kern}
ZIEL=${ZIEL:-/out}
mkdir -p "$ZIEL"

DSP="$KERN/Sources/RetunerDSP"
STR="$KERN/Sources/RetunerStretch"

for pfad in "$DSP/RetunerDSP.c" "$STR/RetunerStretch.cpp"; do
    [ -f "$pfad" ] || { echo "  ✘ fehlt: $pfad"; exit 1; }
done

echo "=== Emscripten ==="
em++ --version | head -1 | sed 's/^/  /'

echo
echo "=== Übersetzen ==="
#
# -fno-exceptions / -fno-rtti: siehe oben, sonst braucht das Modul Importe.
# ALLOW_MEMORY_GROWTH=0: Waechst der Speicher, werden im Worklet alle
# Float32Array-Sichten darauf ungueltig. INITIAL_MEMORY ist deshalb von
# 4 auf 32 MiB hoch — Signalsmith legt seine FFT-Puffer beim Anlegen an,
# und zwei Engines nebeneinander sollen hineinpassen.
#
em++ -O3 \
    -x c   "$DSP/RetunerDSP.c" \
    -x c++ "$STR/RetunerStretch.cpp" \
    -std=c++17 -fno-exceptions -fno-rtti \
    -I"$DSP/include" \
    -I"$STR" -I"$STR/include" -I"$STR/vendor" \
    -o "$ZIEL/retuner.wasm" \
    --no-entry \
    -s STANDALONE_WASM=1 \
    -s ALLOW_MEMORY_GROWTH=0 \
    -s INITIAL_MEMORY=33554432 \
    -s EXPORTED_FUNCTIONS='["_rt_engine_create","_rt_engine_destroy","_rt_engine_reset","_rt_engine_set_factor","_rt_engine_get_factor","_rt_engine_set_bypass","_rt_engine_latency_seconds","_rt_engine_process_channel","_rt_stretch_create","_rt_stretch_create_custom","_rt_stretch_destroy","_rt_stretch_reset","_rt_stretch_set_factor","_rt_stretch_get_factor","_rt_stretch_set_bypass","_rt_stretch_set_channel","_rt_stretch_process","_rt_stretch_latency_seconds","_rt_stretch_block_frames","_malloc","_free"]'

GROESSE=$(wc -c < "$ZIEL/retuner.wasm" | tr -d ' ')
echo "  $ZIEL/retuner.wasm  ($GROESSE Bytes)"

echo
echo "=== Welche Importe verlangt das Modul? ==="
node -e "
const fs=require('fs');
const m=new WebAssembly.Module(fs.readFileSync('$ZIEL/retuner.wasm'));
const erlaubt=new Set(['wasi_snapshot_preview1.random_get',
                       'wasi_snapshot_preview1.fd_write',
                       'wasi_snapshot_preview1.fd_seek',
                       'wasi_snapshot_preview1.fd_close']);
const i=WebAssembly.Module.imports(m).map(x=>x.module+'.'+x.name);
const fremd=i.filter(n=>!erlaubt.has(n));
i.forEach(n=>console.log('   ',n));
if(fremd.length){ console.log('  ✘ nicht vorgesehen:',fremd.join(', ')); process.exit(1); }
console.log('  '+i.length+' Stueck, alle vom Worklet bedient');
const e=WebAssembly.Module.exports(m).map(x=>x.name);
for (const n of ['rt_engine_create','rt_stretch_create','rt_stretch_process','_initialize'])
  if (!e.includes(n)) { console.log('  ✘ Ausfuhr fehlt:', n); process.exit(1); }
console.log('  beide Engines ausgefuehrt, _initialize vorhanden');
"
