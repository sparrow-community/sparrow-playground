#!/usr/bin/env bash
# Copy WASM host artifacts from the sibling sparrow kernel into public/vendor/sparrow.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KERNEL="${SPARROW_KERNEL:-$ROOT/../sparrow}"
SRC="$KERNEL/wasm/dist"
DST="$ROOT/public/vendor/sparrow"

if [[ ! -f "$SRC/sparrow.wasm" && ! -f "$SRC/sparrow.wasm.gz" ]]; then
  echo "missing $SRC/sparrow.wasm — run: (cd \"$KERNEL/wasm\" && ./build.sh)" >&2
  exit 1
fi

mkdir -p "$DST"

if [[ -f "$SRC/sparrow.wasm.gz" ]]; then
  cp "$SRC/sparrow.wasm.gz" "$DST/sparrow.wasm.gz"
elif [[ -f "$SRC/sparrow.wasm" ]]; then
  gzip -kc "$SRC/sparrow.wasm" > "$DST/sparrow.wasm.gz"
fi

cp "$SRC/wasm_exec.js" "$DST/wasm_exec.js"

if [[ -f "$KERNEL/wasm/sparrow.d.ts" ]]; then
  cp "$KERNEL/wasm/sparrow.d.ts" "$DST/sparrow.d.ts"
fi

BYTES="$(wc -c < "$DST/sparrow.wasm.gz" | tr -d ' ')"
echo "synced → $DST (sparrow.wasm.gz $BYTES bytes)"
