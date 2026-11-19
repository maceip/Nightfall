#!/usr/bin/env bash
set -euo pipefail

# Build & provision vendored codenav (https://github.com/thomasdullien/codenav, Apache-2.0)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CODENAV_SRC="$REPO_ROOT/vendor/codenav"
CODENAV_COMMIT="670a3f3ca515bf17de6a43f338efca32af3ad0d2"
STAGE_DESKTOP="${NIGHTFALL_STAGE_DESKTOP_TOOLS:-0}"

TARGET_OS="${NIGHTFALL_TARGET_OS:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
TARGET_ARCH="${NIGHTFALL_TARGET_ARCH:-$(uname -m)}"

case "$TARGET_OS" in
  mac|macos|darwin*) PLATFORM_OS="darwin"; EXT="" ;;
  win|windows|win32*|msys*|mingw*) PLATFORM_OS="win32"; EXT=".exe" ;;
  *) PLATFORM_OS="linux"; EXT="" ;;
esac

case "$TARGET_ARCH" in
  x64|amd64|x86_64) PLATFORM_ARCH="x64" ;;
  arm64|aarch64) PLATFORM_ARCH="arm64" ;;
  *) PLATFORM_ARCH="$TARGET_ARCH" ;;
esac

INSTALL_ROOT="${NIGHTFALL_CODENAV_ROOT:-$HOME/.local/share/nightfall/codenav}"
BIN_DIR="${NIGHTFALL_CODENAV_BIN_DIR:-$INSTALL_ROOT/bin}"
LOCAL_VENDOR_BIN="$CODENAV_SRC/bin"

CXX_BIN="${CXX:-}"
if [[ -z "$CXX_BIN" ]]; then
  if command -v clang++ >/dev/null 2>&1; then
    CXX_BIN="clang++"
  elif command -v g++ >/dev/null 2>&1; then
    CXX_BIN="g++"
  else
    echo "[Nightfall] ERROR: Neither clang++ nor g++ found to compile codenav." >&2
    exit 1
  fi
fi

CXXFLAGS_VAL="${CXXFLAGS:--std=c++20 -O2 -Wall -Wextra -Wno-unused-parameter -Wno-misleading-indentation}"

echo "[Nightfall] Building vendored codenav ($PLATFORM_OS/$PLATFORM_ARCH, upstream $CODENAV_COMMIT) with $CXX_BIN..."
mkdir -p "$BIN_DIR" "$LOCAL_VENDOR_BIN"

"$CXX_BIN" $CXXFLAGS_VAL -o "$BIN_DIR/codenav${EXT}" "$CODENAV_SRC/codenav.cpp"
cp -f "$BIN_DIR/codenav${EXT}" "$LOCAL_VENDOR_BIN/codenav${EXT}"

if [[ "$STAGE_DESKTOP" == "1" ]]; then
  DESKTOP_TOOLS_DIR="$REPO_ROOT/apps/nightfall-ui/bundled-tools/${PLATFORM_OS}-${PLATFORM_ARCH}/codenav/bin"
  mkdir -p "$DESKTOP_TOOLS_DIR"
  cp -f "$BIN_DIR/codenav${EXT}" "$DESKTOP_TOOLS_DIR/codenav${EXT}"
  echo "[Nightfall] Staged desktop codenav binary at $DESKTOP_TOOLS_DIR/codenav${EXT}"
fi

echo "[Nightfall] codenav provisioned at $BIN_DIR/codenav${EXT}"
