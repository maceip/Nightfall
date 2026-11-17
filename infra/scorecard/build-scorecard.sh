#!/usr/bin/env bash
set -euo pipefail

# Build & provision vendored Nightfall Scorecard (https://github.com/ossf/scorecard)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCORECARD_SRC="$REPO_ROOT/vendor/scorecard"
SCORECARD_COMMIT="6eb56f6a7e62d8f5d55800f54cd92ea305107d1d"
SCORECARD_VERSION="v5.6.0-nightfall"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

TARGET_OS="${NIGHTFALL_TARGET_OS:-$(go env GOOS)}"
TARGET_ARCH="${NIGHTFALL_TARGET_ARCH:-$(go env GOARCH)}"
STAGE_DESKTOP="${NIGHTFALL_STAGE_DESKTOP_TOOLS:-0}"

case "$TARGET_OS" in
  mac|macos|darwin) GOOS_VAL="darwin"; PLATFORM_OS="darwin" ;;
  win|windows|win32) GOOS_VAL="windows"; PLATFORM_OS="win32" ;;
  *) GOOS_VAL="linux"; PLATFORM_OS="linux" ;;
esac

case "$TARGET_ARCH" in
  x64|amd64|x86_64) GOARCH_VAL="amd64"; PLATFORM_ARCH="x64" ;;
  arm64|aarch64) GOARCH_VAL="arm64"; PLATFORM_ARCH="arm64" ;;
  *) GOARCH_VAL="$TARGET_ARCH"; PLATFORM_ARCH="$TARGET_ARCH" ;;
esac

EXT=""
if [[ "$GOOS_VAL" == "windows" ]]; then
  EXT=".exe"
fi

INSTALL_ROOT="${NIGHTFALL_SCORECARD_ROOT:-$HOME/.local/share/nightfall/scorecard}"
BIN_DIR="${NIGHTFALL_SCORECARD_BIN_DIR:-$INSTALL_ROOT/bin}"
LOCAL_VENDOR_BIN="$SCORECARD_SRC/bin"

LDFLAGS="-s -w \
  -X sigs.k8s.io/release-utils/version.gitVersion=${SCORECARD_VERSION} \
  -X sigs.k8s.io/release-utils/version.gitCommit=${SCORECARD_COMMIT} \
  -X sigs.k8s.io/release-utils/version.gitTreeState=clean \
  -X sigs.k8s.io/release-utils/version.buildDate=${BUILD_DATE}"

echo "[Nightfall] Building vendored Nightfall Scorecard ($GOOS_VAL/$GOARCH_VAL, upstream $SCORECARD_COMMIT)..."

mkdir -p "$BIN_DIR" "$LOCAL_VENDOR_BIN"

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  GO_NOPROXY_DEFAULT="${GONOPROXY:-}"
  GO_SUMDB_DEFAULT="${GOSUMDB:-sum.golang.org}"
else
  GO_NOPROXY_DEFAULT="${GONOPROXY:-github.com/*,google.golang.org/*,modernc.org/*}"
  GO_SUMDB_DEFAULT="${GOSUMDB:-off}"
fi

CGO_ENABLED=0 \
GOOS="$GOOS_VAL" \
GOARCH="$GOARCH_VAL" \
GOTOOLCHAIN="${GOTOOLCHAIN:-local}" \
GONOPROXY="$GO_NOPROXY_DEFAULT" \
GOSUMDB="$GO_SUMDB_DEFAULT" \
go -C "$SCORECARD_SRC" build -trimpath -ldflags "$LDFLAGS" -o "$BIN_DIR/nightfall-scorecard${EXT}" .

cp -f "$BIN_DIR/nightfall-scorecard${EXT}" "$BIN_DIR/scorecard${EXT}"
cp -f "$BIN_DIR/nightfall-scorecard${EXT}" "$LOCAL_VENDOR_BIN/nightfall-scorecard${EXT}"

if [[ "$STAGE_DESKTOP" == "1" ]]; then
  DESKTOP_TOOLS_DIR="$REPO_ROOT/apps/nightfall-ui/bundled-tools/${PLATFORM_OS}-${PLATFORM_ARCH}/scorecard/bin"
  mkdir -p "$DESKTOP_TOOLS_DIR"
  cp -f "$BIN_DIR/nightfall-scorecard${EXT}" "$DESKTOP_TOOLS_DIR/nightfall-scorecard${EXT}"
  echo "[Nightfall] Staged desktop Scorecard binary at $DESKTOP_TOOLS_DIR/nightfall-scorecard${EXT}"
fi

echo "[Nightfall] Nightfall Scorecard provisioned at $BIN_DIR/nightfall-scorecard${EXT}"
