import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDesktopNativePackagePrunePatterns,
  findDesktopNativePackageViolations,
  parseAsarListWithPackState,
} from '../../../scripts/desktop-native-package-policy.mjs';
import {
  isDebugBuildRequested,
  resolveDesktopArtifactSuffix,
  resolveDesktopProductFlavor,
  resolveDesktopProductIdentity,
  resolveWindowsAppUserModelId,
} from '../../../scripts/desktop-product-identity.mjs';
import { stripSourceMappingUrlComments } from '../../../scripts/packaged-sourcemap-cleanup.mjs';
import { normalizeElectronCpuToMachinePercent } from './cpu-normalization';
import { extractBootstrapChromiumHardwareAccelerationEnabled } from './early-hardware-acceleration';
import { buildElectronProxyConfig } from './network-policy';
import {
  buildWindowsTitleBarOverlayForZoomLevel,
  clampDesktopZoomLevel,
  computeWindowControlsOverlayMetrics,
  resolveDesktopWindowSize,
  resolveMacOSWindowButtonPositionForZoomLevel,
} from './window-size-and-zoom';

describe('Nightfall zcode-aligned Electron desktop & CI packaging suite', () => {
  it('isolates Preview/Debug and Production product identities, MSI upgrade codes, and Windows AUMID', () => {
    const debugPreview = resolveDesktopProductIdentity({
      NIGHTFALL_ENV: 'debug',
      NIGHTFALL_DEBUG_BUILD: '1',
      NIGHTFALL_PREVIEW_IDENTITY: '1',
    });
    expect(debugPreview.flavor).toBe('preview');
    expect(debugPreview.appId).toBe('dev.nightfall.app.preview');
    expect(debugPreview.productName).toBe('Nightfall Preview');
    expect(debugPreview.msiUpgradeCode).toBe('8F4E5B62-9D17-4C8A-A5D2-7C31E904B1F8');
    expect(
      resolveDesktopArtifactSuffix({
        NIGHTFALL_ENV: 'debug',
        NIGHTFALL_DEBUG_BUILD: '1',
      }),
    ).toBe('_DEBUG');

    const prod = resolveDesktopProductIdentity({
      NIGHTFALL_ENV: 'production',
      NIGHTFALL_PREVIEW_IDENTITY: '0',
    });
    expect(prod.flavor).toBe('production');
    expect(prod.appId).toBe('dev.nightfall.app');
    expect(prod.msiUpgradeCode).not.toBe(debugPreview.msiUpgradeCode);

    expect(
      resolveWindowsAppUserModelId({ NIGHTFALL_PREVIEW_IDENTITY: '1' }, { isPackaged: true }),
    ).toBe('dev.nightfall.app.preview');
    expect(
      resolveWindowsAppUserModelId({ NIGHTFALL_PREVIEW_IDENTITY: '1' }, { isPackaged: false }),
    ).toBe('dev.nightfall.desktop.dev');
    expect(isDebugBuildRequested({ NIGHTFALL_DEBUG_BUILD: '1' })).toBe(true);
    expect(resolveDesktopProductFlavor({ NIGHTFALL_ENV: 'production', NIGHTFALL_PREVIEW_IDENTITY: '1' })).toBe('preview');
  });

  it('enforces zcode native ASAR unpack and cross-platform prebuild pruning rules', () => {
    const prune = createDesktopNativePackagePrunePatterns('darwin-arm64');
    expect(prune).toContain('!node_modules/@napi-rs/canvas/**');
    expect(prune).toContain('!node_modules/**/prebuilds/win32-x64/**');
    expect(prune).not.toContain('!node_modules/**/prebuilds/darwin-arm64/**');

    const cleanEntries = parseAsarListWithPackState(
      [
        'pack : /out/main/index.js',
        'unpack : /node_modules/addon/prebuilds/darwin-arm64/addon.node',
      ].join('\n'),
    );
    expect(findDesktopNativePackageViolations(cleanEntries, 'darwin-arm64')).toEqual([]);

    const badEntries = parseAsarListWithPackState(
      [
        'pack : /node_modules/addon/prebuilds/darwin-arm64/addon.node',
        'unpack : /node_modules/addon/prebuilds/win32-x64/addon.dll',
      ].join('\n'),
    );
    const violations = findDesktopNativePackageViolations(badEntries, 'darwin-arm64');
    expect(violations).toHaveLength(2);
  });

  it('strips line-anchored sourceMappingURL comments without corrupting inline code strings', () => {
    const sample = [
      'const msg = "//# sourceMappingURL=keep-inline.js.map";',
      '//# sourceMappingURL=bundle.js.map',
      '/*# sourceMappingURL=styles.css.map */',
    ].join('\n');
    const stripped = stripSourceMappingUrlComments(sample);
    expect(stripped).toContain('keep-inline.js.map');
    expect(stripped).not.toContain('bundle.js.map');
    expect(stripped).not.toContain('styles.css.map');
  });

  it('normalizes Electron CPU %, window bounds, zoom-compensated traffic lights, and proxy bypass', () => {
    expect(normalizeElectronCpuToMachinePercent(80, { platform: 'darwin', logicalCpuCount: 8 })).toBe(80);
    expect(normalizeElectronCpuToMachinePercent(80, { platform: 'linux', logicalCpuCount: 8 })).toBe(10);

    expect(extractBootstrapChromiumHardwareAccelerationEnabled({ desktopChromiumHardwareAccelerationEnabled: false })).toBe(false);
    expect(extractBootstrapChromiumHardwareAccelerationEnabled({})).toBe(true);

    expect(clampDesktopZoomLevel(99)).toBe(5);
    expect(clampDesktopZoomLevel(-99)).toBe(-3);

    const winSize = resolveDesktopWindowSize(
      { width: 3000, height: 2000, maximized: true },
      { width: 1440, height: 900 },
    );
    expect(winSize).toEqual({ width: 1440, height: 900, maximized: true });

    const macButtonPos = resolveMacOSWindowButtonPositionForZoomLevel(0);
    expect(macButtonPos).toEqual({ x: 18, y: 13 });
    expect(computeWindowControlsOverlayMetrics(0, 'darwin')).toEqual({ leftPaddingPx: 88 });

    const winOverlay = buildWindowsTitleBarOverlayForZoomLevel(0, 'light');
    expect(winOverlay).toEqual({ color: '#00000000', symbolColor: '#1f1f1f', height: 40 });

    const directProxy = buildElectronProxyConfig(undefined);
    expect(directProxy).toEqual({ mode: 'direct' });
    const customProxy = buildElectronProxyConfig('http://proxy.internal:8080', 'corp.local');
    expect(customProxy.mode).toBe('fixed_servers');
    expect(customProxy.proxyBypassRules).toContain('127.0.0.1');
    expect(customProxy.proxyBypassRules).toContain('corp.local');
  });

  it('verifies generated PNG, Windows ICO, and Apple ICNS binary headers in build/', () => {
    const buildDir = resolve(__dirname, '../build');
    const pngHeader = readFileSync(resolve(buildDir, 'icon.png')).subarray(0, 8);
    expect(Array.from(pngHeader)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const icoHeader = readFileSync(resolve(buildDir, 'icon.ico')).subarray(0, 4);
    expect(Array.from(icoHeader)).toEqual([0, 0, 1, 0]);

    const icnsMagic = readFileSync(resolve(buildDir, 'icon.icns')).subarray(0, 4).toString('ascii');
    expect(icnsMagic).toBe('icns');
    expect(existsSync(resolve(buildDir, 'entitlements.mac.plist'))).toBe(true);
    expect(existsSync(resolve(buildDir, 'dmg_background.png'))).toBe(true);
  });

  it('verifies electron-builder.config.mjs and GitHub Actions CI workflow produce DMG and MSI artifacts', async () => {
    const builderConfig = (await import('../electron-builder.config.mjs')).default;
    expect(builderConfig.electronLanguages).toEqual(['en-US']);
    expect(builderConfig.asar).toBe(true);
    expect(builderConfig.npmRebuild).toBe(false);
    expect(builderConfig.mac?.target).toContain('dmg');
    expect(builderConfig.win?.target).toContain('msi');
    expect(builderConfig.msi?.oneClick).toBe(false);
    expect(builderConfig.msi?.upgradeCode).toBeTruthy();

    const workflowPath = resolve(
      __dirname,
      '../../../.github/workflows/desktop-debug-installers.yml',
    );
    expect(existsSync(workflowPath)).toBe(true);
    const workflowYaml = readFileSync(workflowPath, 'utf8');
    expect(workflowYaml).toContain('build-macos-dmg:');
    expect(workflowYaml).toContain('runs-on: macos-latest');
    expect(workflowYaml).toContain('--targets dmg');
    expect(workflowYaml).toContain('nightfall-debug-macos-${{ matrix.arch }}-dmg');
    expect(workflowYaml).toContain('build-windows-msi:');
    expect(workflowYaml).toContain('runs-on: windows-latest');
    expect(workflowYaml).toContain('--targets msi');
    expect(workflowYaml).toContain('nightfall-debug-windows-${{ matrix.arch }}-msi');
    expect(workflowYaml).toContain('actions/upload-artifact@v4');
  });
});
