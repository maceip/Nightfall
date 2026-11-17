#!/usr/bin/env bash
set -euo pipefail

# Provision Microsoft LiteBox (https://github.com/microsoft/litebox) for Nightfall Sandboxing
LITEBOX_REPO="https://github.com/microsoft/litebox.git"
LITEBOX_COMMIT="cd8de54b09667c78f6a4ce1f4b0d6a15f7c97fcb"
INSTALL_ROOT="${NIGHTFALL_LITEBOX_ROOT:-$HOME/.local/share/nightfall/litebox}"
BIN_DIR="${NIGHTFALL_LITEBOX_BIN_DIR:-$INSTALL_ROOT/bin}"
SHARE_DIR="$INSTALL_ROOT/share"
TMP_BUILD_DIR="$(mktemp -d /tmp/nightfall-litebox-build.XXXXXX)"

cleanup() {
  rm -rf "$TMP_BUILD_DIR"
}
trap cleanup EXIT

echo "[Nightfall] Cloning Microsoft LiteBox ($LITEBOX_COMMIT)..."
git clone --depth 1 "$LITEBOX_REPO" "$TMP_BUILD_DIR/litebox"
git -C "$TMP_BUILD_DIR/litebox" fetch --depth 1 origin "$LITEBOX_COMMIT"
git -C "$TMP_BUILD_DIR/litebox" checkout --detach "$LITEBOX_COMMIT"

# LiteBox pins `channel = "stable"` and uses recently stabilized std APIs, so an outdated stable
# toolchain fails with E0658. Refresh stable when rustup manages the toolchain.
if command -v rustup >/dev/null 2>&1; then
  echo "[Nightfall] Updating the stable Rust toolchain (LiteBox tracks current stable)..."
  rustup update stable --no-self-update
fi

echo "[Nightfall] Building litebox_runner_linux_userland, litebox_packager & litebox_syscall_rewriter..."
# Build from inside the checkout so its rust-toolchain.toml is honored.
(
  cd "$TMP_BUILD_DIR/litebox"
  cargo build --release \
    -p litebox_runner_linux_userland \
    -p litebox_packager \
    -p litebox_syscall_rewriter
)

mkdir -p "$BIN_DIR" "$SHARE_DIR"
install -m 0755 "$TMP_BUILD_DIR/litebox/target/release/litebox_runner_linux_userland" "$BIN_DIR/"
install -m 0755 "$TMP_BUILD_DIR/litebox/target/release/litebox_packager" "$BIN_DIR/"
install -m 0755 "$TMP_BUILD_DIR/litebox/target/release/litebox_syscall_rewriter" "$BIN_DIR/"

if command -v python3 >/dev/null 2>&1; then
  PY_STDLIB_DIR="$(python3 -c 'import sysconfig; print(sysconfig.get_path("stdlib"))')"
  python3 - "$PY_STDLIB_DIR" "$SHARE_DIR/python311.zip" <<'PY'
import os, sys, zipfile
stdlib_dir, out_zip = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk(stdlib_dir):
        if "test" in root or "__pycache__" in root:
            continue
        for fname in files:
            if fname.endswith(".py"):
                full = os.path.join(root, fname)
                zf.write(full, os.path.relpath(full, stdlib_dir))
PY
fi

echo "[Nightfall] Microsoft LiteBox provisioned at $BIN_DIR"
