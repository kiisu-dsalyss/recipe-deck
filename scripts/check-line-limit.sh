#!/usr/bin/env bash
# Fail if any TS/TSX under client/src, server, types, or shared exceeds 400 lines.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX=400
fail=0
while IFS= read -r -d '' f; do
  lines=$(wc -l < "$f" | tr -d ' ')
  if [ "$lines" -gt "$MAX" ]; then
    echo "over ${MAX} lines ($lines): ${f#"$ROOT/"}"
    fail=1
  fi
done < <(find "$ROOT/client/src" "$ROOT/server" "$ROOT/types" "$ROOT/shared" \
  \( -name '*.ts' -o -name '*.tsx' \) -print0 2>/dev/null)
if [ "$fail" -ne 0 ]; then
  echo "check-line-limit: split the files above before opening a PR"
  exit 1
fi
echo "check-line-limit: ok (max ${MAX} lines)"
