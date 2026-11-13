# Nightfall Desktop Electron Architecture & CI Installer Pipeline (`zcode`-Aligned)

Nightfall's desktop shell (`apps/nightfall-ui/electron/`, `apps/nightfall-ui/electron-builder.config.mjs`, and `scripts/`) mirrors every runtime, bundler, security, and cross-platform packaging configuration used by **`maceip/zcode`** (`@zcode/desktop` on Electron `41.0.3` + `electron-builder` `26.x` + `tsup` `8.5.0`).

## 1. Mirrored `zcode` Electron Configurations & Optimizations

| Optimization / Subsystem | Implementation in Nightfall | Purpose |
| :--- | :--- | :--- |
| **Dual-Axis Product Identity (`preview` vs `production`)** | `scripts/desktop-product-identity.mjs` | `NIGHTFALL_PREVIEW_IDENTITY=1` / `NIGHTFALL_DEBUG_BUILD=1` emits `dev.nightfall.app.preview` (`Nightfall Preview`, `_DEBUG` suffix, isolated MSI `upgradeCode`) so debug `.msi`/`.dmg` builds install side-by-side with production `dev.nightfall.app` without overwriting user installations or Windows AUMID shortcuts. |
| **Pre-Ready Hardware Acceleration Bootstrap** | `apps/nightfall-ui/electron/early-hardware-acceleration.ts` | Reads `~/.nightfall/v2/setting.json` before `app.whenReady()` so `app.disableHardwareAcceleration()` takes effect cleanly when toggled. |
| **Debug CDP Port & Context Menu** | `apps/nightfall-ui/electron/main.ts` | Appends `--remote-debugging-port=9229` and enables right-click `Inspect Element (Debug)` whenever `!app.isPackaged \|\| NIGHTFALL_DEBUG_BUILD=1`. |
| **Cross-Platform Window Chrome & Zoom Compensation** | `apps/nightfall-ui/electron/window-size-and-zoom.ts` | macOS `titleBarStyle: 'hidden'` + `vibrancy: 'under-window'` + zoom-adjusted `setWindowButtonPosition`; Windows `titleBarOverlay` + `backgroundMaterial: 'acrylic'` + double-frame `webContents.invalidate()` on `resized`/`show`; Linux frameless transparent chrome; `250ms` debounced normal-bounds persistence and `did-finish-load` zoom replay. |
| **Session Proxy & Custom X.509 CA Policy** | `apps/nightfall-ui/electron/network-policy.ts` | Defaults to `mode: 'direct'` (protecting embedded loopback API calls from ambient shell proxies) and supports custom PEM CA SHA-256 chain pinning via `setCertificateVerifyProc`. |
| **Embedded Standalone SQLite API Server** | `apps/nightfall-ui/electron/main.ts` + `tsup.config.ts` | Bundles `@nightfall/api-gateway` + `@nightfall/closed-loop-orchestrator` (`node:sqlite` WAL) directly into `out/main/index.js`, starting on `127.0.0.1:0` and passing `--api-base-url` synchronously to preload so installed `.msi` and `.dmg` apps work standalone offline/locally. |
| **Multi-Entry `tsup` + Relative Vite Renderer** | `apps/nightfall-ui/tsup.config.ts`, `vite.config.ts` | Builds ESM `out/main/index.js` (`chunkNames: 'main/chunk-[hash]'`, `legalComments: 'none'`) + CJS `out/preload/index.cjs`, and sets `base: './'`, `dedupe: ['react', 'react-dom']`, and `worker.rollupOptions.treeshake: false` in Vite. |
| **Optional V8 Bytecode Cache** | `scripts/compile-desktop-bytecode.cjs`, `scripts/desktop-bytecode-runtime.cjs` | Compiles CJS bundles under `ELECTRON_RUN_AS_NODE=1` with `--no-lazy --no-flush-bytecode` and SHA-256 digest verification. |
| **ASAR Native Policy, Locale Pruning & Atomic Repack** | `apps/nightfall-ui/electron-builder.config.mjs`, `scripts/desktop-native-package-policy.mjs`, `scripts/app-asar-repack.mjs` | Sets `electronLanguages: ['en-US']` (eliminating 50+ redundant macOS `codesign` locale calls), `npmRebuild: false`, prunes cross-platform prebuilds, verifies `.node/.dll/.dylib/.exe` unpack state via `@electron/asar`, retains sourcemaps in debug mode (`NIGHTFALL_DEBUG_BUILD=1`), and writes `.nightfall-install-manifest` on Windows. |

## 2. GitHub Actions CI Workflow (`.github/workflows/desktop-debug-installers.yml`)

Triggered on `push` (`main`, `release/**`), `pull_request`, and `workflow_dispatch`:
1. **`verify` (`ubuntu-latest`)**: Runs `pnpm typecheck`, `pnpm test`, and `pnpm --filter @nightfall/nightfall-ui run build:desktop`.
2. **`build-macos-dmg` (`macos-latest`, matrix `arm64` & `x64`)**: Runs `bundle-desktop.mjs --os mac --arch <arch> --targets dmg`, validates `.app` anatomy + Apple Silicon ad-hoc `codesign` + `entitlements.mac.plist` via `scripts/doctor-macos-release-app.sh`, runs `hdiutil verify`, and uploads `nightfall-debug-macos-<arch>-dmg` (`.dmg`, `.blockmap`, `SHA256SUMS`).
3. **`build-windows-msi` (`windows-latest`, `x64`)**: Ensures WiX Toolset v3 (`candle.exe` / `light.exe`) is on `PATH`, runs `bundle-desktop.mjs --os win --arch x64 --targets msi`, validates the OLE Compound Document `.msi` header (`D0CF11E0A1B11AE1`) + `.nightfall-install-manifest`, and uploads `nightfall-debug-windows-x64-msi` (`.msi`, `SHA256SUMS`).
