#!/usr/bin/env bash
# Copy WASM host artifacts from a Sparrow engine checkout into public/vendor/sparrow.
# Playground users do not need this: npm install / dev / build use the committed WASM.
#
#   SPARROW_KERNEL=/path/to/sparrow npm run sync-wasm
#   npm run sync-wasm -- --stamp-only
#
# --stamp-only rewrites public/vendor/sparrow/VERSION from the WASM already vendored
# here. A normal sync copies artifacts, then writes the same stamp.
#
# wasm_exec.js is BSD-licensed (see wasm_exec.LICENSE next to it). This script does
# not replace that license file.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KERNEL="${SPARROW_KERNEL:-$ROOT/../sparrow}"
SRC="$KERNEL/wasm/dist"
DST="$ROOT/public/vendor/sparrow"

stamp_only=false
if [[ "${1:-}" == "--stamp-only" ]]; then
  stamp_only=true
elif [[ -n "${1:-}" ]]; then
  echo "unknown argument: $1" >&2
  exit 1
fi

if [[ "$stamp_only" == false ]]; then
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
fi

if [[ ! -f "$DST/sparrow.wasm.gz" ]]; then
  echo "missing $DST/sparrow.wasm.gz" >&2
  exit 1
fi

kernel_head=""
kernel_time=""
kernel_dirty=""
if [[ "$stamp_only" == false ]] && git -C "$KERNEL" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  kernel_head="$(git -C "$KERNEL" rev-parse HEAD)"
  kernel_time="$(git -C "$KERNEL" log -1 --format=%cI)"
  if [[ -n "$(git -C "$KERNEL" status --porcelain)" ]]; then
    kernel_dirty=true
  else
    kernel_dirty=false
  fi
fi

sha="$(sha256sum "$DST/sparrow.wasm.gz" | awk '{print $1}')"

python3 - "$DST/sparrow.wasm.gz" "$DST/VERSION" "$sha" "$kernel_head" "$kernel_time" "$kernel_dirty" << 'PY'
import gzip, pathlib, re, sys

gz_path, out_path, sha, kernel_head, kernel_time, kernel_dirty = sys.argv[1:7]
data = gzip.decompress(pathlib.Path(gz_path).read_bytes())
text = data.decode("latin1", errors="ignore")

def one(pat):
    match = re.search(pat, text)
    return match.group(1) if match else ""

revision = one(r"vcs\.revision=([0-9a-fA-F]{7,40})")
revision_time = one(r"vcs\.time=([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)")
vcs_modified = one(r"vcs\.modified=(true|false)")
go_ver = one(r"\b(go1\.\d+\.\d+)\b")
lines = [
    "engine: github.com/sparrow-community/sparrow",
    "module: github.com/sparrow-community/sparrow/wasm",
    f"go: {go_ver or 'unknown'}",
    f"revision: {revision or 'unknown'}",
    f"revision_time: {revision_time or 'unknown'}",
    f"vcs_modified: {vcs_modified or 'unknown'}",
    f"wasm_gz_sha256: {sha}",
]
if kernel_head:
    lines.append(f"kernel_head: {kernel_head}")
    lines.append(f"kernel_head_time: {kernel_time}")
    lines.append(f"kernel_dirty: {kernel_dirty}")
lines.append(
    "note: Written by scripts/sync-wasm.sh. revision, revision_time, vcs_modified, and go are read from Go build info embedded in sparrow.wasm.gz. vcs_modified=true means the engine worktree was dirty when the binary was built; that diff is not stored in the WASM. kernel_head is recorded only when sync-wasm copies from a git checkout."
)
pathlib.Path(out_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"wrote {out_path}")
PY

bytes="$(wc -c < "$DST/sparrow.wasm.gz" | tr -d ' ')"
if [[ "$stamp_only" == true ]]; then
  echo "stamped → $DST (sparrow.wasm.gz $bytes bytes)"
else
  echo "synced → $DST (sparrow.wasm.gz $bytes bytes)"
fi
