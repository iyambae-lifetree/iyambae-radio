#!/bin/bash
#
# Übersetzt MyRetuners Signalkern nach WebAssembly.
#
# Warum: Die Seite rät bisher. Sie nimmt an, jeder Sender sei auf 440 Hz
# gestimmt, und zieht mit `playbackRate` pauschal herunter — was nebenbei
# auch das Tempo ändert. Derselbe C-Kern, der auf Mac, Windows und Linux das
# Systemaudio umstimmt, kann das im Browser richtig machen: Tonhöhe ohne
# Tempoänderung.
#
# Das Ergebnis ist bewusst eine **eigenständige** .wasm ohne JS-Hülle:
# Emscriptens erzeugtes Modul lädt die .wasm per `fetch` nach, und `fetch`
# gibt es im AudioWorkletGlobalScope nicht. Ohne Hülle verlangt das Modul
# gar keine Importe und lässt sich direkt instanziieren.
#
# Aufruf (MyRetuner muss als Geschwisterordner liegen):
#
#   docker run --rm \
#     -v "$PWD/../MyRetuner:/kern:ro" -v "$PWD/assets/wasm:/out" \
#     emscripten/emsdk:latest bash -lc "bash /out/../../Scripts/baue-wasm.sh"
#
# Bequemer über Scripts/baue-wasm.ps1 bzw. den Aufruf in der README.
set -euo pipefail

KERN=${KERN:-/kern}
ZIEL=${ZIEL:-/out}
mkdir -p "$ZIEL"

echo "=== Emscripten ==="
emcc --version | head -1 | sed 's/^/  /'

echo
echo "=== Übersetzen ==="
emcc -O3 -std=c11 \
    "$KERN/Sources/RetunerDSP/RetunerDSP.c" \
    -I"$KERN/Sources/RetunerDSP/include" \
    -o "$ZIEL/retuner.wasm" \
    --no-entry \
    -s STANDALONE_WASM=1 \
    -s ALLOW_MEMORY_GROWTH=0 \
    -s INITIAL_MEMORY=4194304 \
    -s EXPORTED_FUNCTIONS='["_rt_engine_create","_rt_engine_destroy","_rt_engine_reset","_rt_engine_set_factor","_rt_engine_get_factor","_rt_engine_set_bypass","_rt_engine_latency_seconds","_rt_engine_process_channel","_malloc","_free"]'

echo "  $ZIEL/retuner.wasm  ($(stat -c%s "$ZIEL/retuner.wasm") Bytes)"

echo
echo "=== Verlangt das Modul Importe? ==="
node -e "
const fs=require('fs');
const m=new WebAssembly.Module(fs.readFileSync('$ZIEL/retuner.wasm'));
const i=WebAssembly.Module.imports(m);
if(i.length===0) console.log('  keine — im AudioWorklet direkt instanziierbar');
else { console.log('  ACHTUNG, Importe noetig:'); i.forEach(x=>console.log('   ',x.module+'.'+x.name)); process.exit(1); }
"
