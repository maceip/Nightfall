#!/usr/bin/env bash
# index-project.sh — build a codebrowser dataset for a C/C++ project.
#
# Usage: index-project.sh <source-root> <data-out> [project-name]
#
# Requires `codebrowser_generator` on PATH (or $CODEBROWSER_GENERATOR).
# The source tree must already have a compile_commands.json somewhere —
# typically in a cmake build dir (-DCMAKE_EXPORT_COMPILE_COMMANDS=ON) or
# generated via `bear -- make` / `compiledb -n make`.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <source-root> <data-out> [project-name]" >&2
  echo "  <source-root>   absolute path to the project's source tree" >&2
  echo "  <data-out>      where codebrowser should write refs/, fnSearch/, etc." >&2
  echo "  [project-name]  defaults to basename(<source-root>)" >&2
  exit 2
fi

src=$(cd "$1" && pwd)
out=$2
name=${3:-$(basename "$src")}
gen=${CODEBROWSER_GENERATOR:-codebrowser_generator}

command -v "$gen" >/dev/null 2>&1 || {
  echo "error: $gen not found on PATH. Set \$CODEBROWSER_GENERATOR or install from https://github.com/KDAB/codebrowser." >&2
  exit 1
}

# Locate compile_commands.json. Prefer one in <src>, then common build dirs.
ccj=""
for candidate in "$src/compile_commands.json" "$src/build/compile_commands.json" \
                 "$src/out/compile_commands.json" "$src/.build/compile_commands.json"; do
  if [[ -f "$candidate" ]]; then ccj=$(dirname "$candidate"); break; fi
done
if [[ -z "$ccj" ]]; then
  echo "error: compile_commands.json not found under $src" >&2
  echo "  generate it first: cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON, or bear/compiledb over make" >&2
  exit 1
fi

mkdir -p "$out"
echo "[index-project] src=$src"
echo "[index-project] compile_commands.json dir=$ccj"
echo "[index-project] out=$out  project=$name"

"$gen" -b "$ccj" -o "$out" -p "$name:$src:HEAD" -a

echo
echo "Done. Set environment for codenav:"
echo "  export CODENAV_DATA=$out"
echo "  export CODENAV_SRC=$src"
