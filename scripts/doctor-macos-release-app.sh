#!/usr/bin/env bash
set -euo pipefail

# Nightfall macOS .app Release & Debug Bundle Doctor (modeled on zcode's doctor-macos-release-app.sh)
# Validates bundle structure (Info.plist, executable, Electron Framework, app.asar) and verifies
# either Developer ID signature + notarization or ad-hoc Apple Silicon debug signature.

APP_PATH="${1:-}"
MODE="${2:---debug}"

if [[ -z "${APP_PATH}" || ! -d "${APP_PATH}" ]]; then
  echo "[doctor-macos] Usage: $0 <path/to/Nightfall.app> [--debug|--release]" >&2
  exit 1
fi

echo "[doctor-macos] Inspecting bundle: ${APP_PATH} (${MODE})"

INFO_PLIST="${APP_PATH}/Contents/Info.plist"
if [[ ! -f "${INFO_PLIST}" ]]; then
  echo "[doctor-macos] FAIL: Missing ${INFO_PLIST}" >&2
  exit 1
fi

EXEC_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${INFO_PLIST}")"
MAIN_BINARY="${APP_PATH}/Contents/MacOS/${EXEC_NAME}"
FRAMEWORK_BINARY="${APP_PATH}/Contents/Frameworks/Electron Framework.framework/Electron Framework"
ASAR_ARCHIVE="${APP_PATH}/Contents/Resources/app.asar"

for required_file in "${MAIN_BINARY}" "${FRAMEWORK_BINARY}" "${ASAR_ARCHIVE}"; do
  if [[ ! -e "${required_file}" ]]; then
    echo "[doctor-macos] FAIL: Missing required macOS bundle component: ${required_file}" >&2
    exit 1
  fi
done

echo "[doctor-macos] Bundle anatomy OK (executable=${EXEC_NAME})"

if [[ "${MODE}" == "--debug" ]]; then
  # Ensure Apple Silicon arm64 debug bundles carry a valid ad-hoc signature + entitlements
  ENTITLEMENTS_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/nightfall-ui/build/entitlements.mac.plist"
  if ! codesign --verify --deep --strict "${APP_PATH}" 2>/dev/null; then
    echo "[doctor-macos] Applying ad-hoc signature for debug macOS bundle..."
    codesign --force --deep --sign - --entitlements "${ENTITLEMENTS_PATH}" "${APP_PATH}"
  fi
  codesign --verify --deep --strict --verbose=2 "${APP_PATH}"
  echo "[doctor-macos] PASS (debug ad-hoc signature verified)"
else
  codesign --verify --deep --strict --verbose=2 "${APP_PATH}"
  spctl --assess --type execute --verbose=4 "${APP_PATH}"
  xcrun stapler validate "${APP_PATH}"
  echo "[doctor-macos] PASS (Developer ID + Gatekeeper + Stapler verified)"
fi
