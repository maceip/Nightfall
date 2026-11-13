import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  powerSaveBlocker,
  screen,
  session,
  shell,
} from 'electron';
import {
  isDebugBuildRequested,
  resolveDesktopProductIdentity,
  resolveWindowsAppUserModelId,
} from '../../../scripts/desktop-product-identity.mjs';
import { normalizeElectronCpuToMachinePercent } from './cpu-normalization.js';
import { applyEarlyChromiumHardwareAccelerationBootstrap } from './early-hardware-acceleration.js';
import { applyDesktopChromiumNetworkPolicy, type DesktopNetworkPolicySettings } from './network-policy.js';
import {
  attachDesktopWindowSizePersistence,
  attachWindowsWindowRepaint,
  buildWindowsTitleBarOverlayForZoomLevel,
  clampDesktopZoomLevel,
  type DesktopWindowSize,
  MACOS_TRAFFIC_LIGHT_BASE_POSITION,
  MIN_DESKTOP_WINDOW_HEIGHT,
  MIN_DESKTOP_WINDOW_WIDTH,
  resolveDesktopZoomFactorForLevel,
  resolveDesktopZoomLevelFromFactor,
  resolveDesktopWindowSize,
  syncWindowControlsOverlayForZoomLevel,
} from './window-size-and-zoom.js';

interface DesktopPersistedSettings extends DesktopNetworkPolicySettings {
  desktopZoomLevel?: number;
  desktopWindowSize?: DesktopWindowSize;
  desktopChromiumHardwareAccelerationEnabled?: boolean;
  keepAwakeWhileRunning?: boolean;
}

// 1. Pre-ready Chromium hardware acceleration bootstrap (mirrors zcode)
applyEarlyChromiumHardwareAccelerationBootstrap(app);

const productIdentity = resolveDesktopProductIdentity(process.env);
const isDebugBuild = isDebugBuildRequested(process.env);

// 2. Enable Chromium remote debugging port in debug / unpackaged builds unless explicitly disabled
if (
  (!app.isPackaged || isDebugBuild) &&
  process.env.NIGHTFALL_DISABLE_FIXED_REMOTE_DEBUGGING_PORT !== '1'
) {
  app.commandLine.appendSwitch('remote-debugging-port', '9229');
}

app.setName(productIdentity.productName);
process.title = productIdentity.productName;

if (process.platform === 'win32') {
  app.setAppUserModelId(
    resolveWindowsAppUserModelId(process.env, { isPackaged: app.isPackaged }),
  );
}

process.on('unhandledRejection', (reason) => {
  console.error('[nightfall-desktop] unhandledRejection:', reason);
});

let primaryWindow: BrowserWindow | null = null;
let embeddedServer: (http.Server & { closeGracefully?: () => Promise<void> }) | null = null;
let embeddedApiBaseUrl: string = process.env.NIGHTFALL_API_BASE_URL?.trim() || '';
let powerSaveBlockerId: number | null = null;
let keepAwakeWhileRunning = false;
const pendingDeepLinks: string[] = [];

function getSettingsFilePath(): string {
  return join(app.getPath('userData'), 'setting.json');
}

function readDesktopSettings(): DesktopPersistedSettings {
  const filePath = getSettingsFilePath();
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as DesktopPersistedSettings;
  } catch {
    return {};
  }
}

function updateDesktopSettings(patch: Partial<DesktopPersistedSettings>): DesktopPersistedSettings {
  const filePath = getSettingsFilePath();
  const next = { ...readDesktopSettings(), ...patch };
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn('[nightfall-desktop] failed to persist settings:', err);
  }
  return next;
}

function computeDeviceMid(): string {
  return createHash('sha256').update(app.getPath('userData')).digest('hex').slice(0, 32);
}

function reconcileKeepAwakeBlocker(): void {
  if (keepAwakeWhileRunning && powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  } else if (!keepAwakeWhileRunning && powerSaveBlockerId !== null) {
    try {
      powerSaveBlocker.stop(powerSaveBlockerId);
    } catch {
      // Ignore already-stopped blocker ID
    }
    powerSaveBlockerId = null;
  }
}

function resolveAppIconPath(): string {
  if (process.platform === 'win32') {
    return app.isPackaged
      ? join(process.resourcesPath, 'icon_windows.png')
      : resolve(import.meta.dirname, '../../build/icon_windows.png');
  }
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : resolve(import.meta.dirname, '../../build/icon.png');
}

function applyMacDockIcon(iconPath: string): void {
  if (process.platform !== 'darwin' || app.dock == null || !existsSync(iconPath)) {
    return;
  }
  const dockIcon = nativeImage.createFromPath(iconPath);
  if (!dockIcon.isEmpty()) {
    app.dock.setIcon(dockIcon);
  }
}

function buildDesktopWindowVisualOptions(initialZoomLevel: number) {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  if (process.platform === 'darwin') {
    return {
      backgroundColor: '#00000000',
      titleBarStyle: 'hidden' as const,
      trafficLightPosition: MACOS_TRAFFIC_LIGHT_BASE_POSITION,
      vibrancy: 'under-window' as const,
      visualEffectState: 'active' as const,
    };
  }
  if (process.platform === 'win32') {
    return {
      backgroundColor: '#00000000',
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: buildWindowsTitleBarOverlayForZoomLevel(initialZoomLevel, theme),
      backgroundMaterial: 'acrylic' as const,
    };
  }
  return {
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    hasShadow: false,
  };
}

async function ensureEmbeddedApiServer(): Promise<string> {
  if (embeddedApiBaseUrl) {
    return embeddedApiBaseUrl;
  }
  if (process.env.NIGHTFALL_EMBED_API === '0') {
    return '/api';
  }

  try {
    const userDataDir = app.getPath('userData');
    mkdirSync(userDataDir, { recursive: true });
    process.env.NIGHTFALL_SQLITE_PATH ||= join(userDataDir, 'nightfall.sqlite');

    // Prepend bundled tools directory (e.g. packaged LiteBox binaries) to PATH if present
    if (app.isPackaged) {
      const bundledLiteBoxBin = join(process.resourcesPath, 'tools', 'litebox', 'bin');
      if (existsSync(bundledLiteBoxBin)) {
        process.env.NIGHTFALL_LITEBOX_BIN_DIR ||= bundledLiteBoxBin;
      }
    }

    const { createApiServer } = await import('@nightfall/api-gateway');
    const server = createApiServer();
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', () => resolveListen());
    });
    const addr = server.address() as AddressInfo;
    embeddedServer = server;
    embeddedApiBaseUrl = `http://127.0.0.1:${addr.port}/api`;
    console.log(`[nightfall-desktop] Embedded API server listening at ${embeddedApiBaseUrl}`);
    return embeddedApiBaseUrl;
  } catch (err) {
    console.warn('[nightfall-desktop] Embedded API server skipped, using /api fallback:', err);
    return '/api';
  }
}

function extractDeepLinkFromArgv(argv: readonly string[]): string | null {
  const prefix = `${productIdentity.deepLinkScheme}://`;
  const hit = argv.find((arg) => arg.startsWith(prefix) || arg.startsWith('nightfall://'));
  return hit ?? null;
}

function forwardDeepLinkToWindow(url: string): void {
  if (!primaryWindow || primaryWindow.isDestroyed()) {
    pendingDeepLinks.push(url);
    return;
  }
  primaryWindow.webContents.send('nightfall:open-deep-link', url);
}

function registerSingleInstanceAndProtocol(): boolean {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }

  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(productIdentity.deepLinkScheme, process.execPath, [
      resolve(process.argv[1]!),
    ]);
  } else {
    app.setAsDefaultProtocolClient(productIdentity.deepLinkScheme);
  }

  app.on('second-instance', (_event, commandLine) => {
    if (primaryWindow && !primaryWindow.isDestroyed()) {
      if (primaryWindow.isMinimized()) primaryWindow.restore();
      primaryWindow.focus();
    }
    const link = extractDeepLinkFromArgv(commandLine);
    if (link) forwardDeepLinkToWindow(link);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    forwardDeepLinkToWindow(url);
  });

  return true;
}

function createMainWindow(apiBaseUrl: string): BrowserWindow {
  const settings = readDesktopSettings();
  const initialZoomLevel = clampDesktopZoomLevel(settings.desktopZoomLevel ?? 0);
  const initialZoomFactor = resolveDesktopZoomFactorForLevel(initialZoomLevel);
  const initialWindowSize = resolveDesktopWindowSize(
    settings.desktopWindowSize,
    screen.getPrimaryDisplay().workAreaSize,
  );
  const iconPath = resolveAppIconPath();
  applyMacDockIcon(iconPath);

  const preloadPath = resolve(import.meta.dirname, '../preload/index.cjs');
  const deviceMid = computeDeviceMid();

  const win = new BrowserWindow({
    width: initialWindowSize.width,
    height: initialWindowSize.height,
    minWidth: MIN_DESKTOP_WINDOW_WIDTH,
    minHeight: MIN_DESKTOP_WINDOW_HEIGHT,
    title: productIdentity.productName,
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    autoHideMenuBar: process.platform === 'linux',
    ...buildDesktopWindowVisualOptions(initialZoomLevel),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      zoomFactor: initialZoomFactor,
      additionalArguments: [
        `--device-id=${deviceMid}`,
        `--api-base-url=${apiBaseUrl}`,
        `--product-flavor=${productIdentity.flavor}`,
        `--debug-build=${isDebugBuild ? '1' : '0'}`,
      ],
    },
  });

  win.webContents.setZoomFactor(initialZoomFactor);
  syncWindowControlsOverlayForZoomLevel(
    win,
    initialZoomLevel,
    nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
  );

  if (initialWindowSize.maximized) {
    win.maximize();
  }

  attachDesktopWindowSizePersistence(win, (desktopWindowSize) => {
    updateDesktopSettings({ desktopWindowSize });
  });
  attachWindowsWindowRepaint(win);

  win.webContents.once('did-finish-load', () => {
    // Replay persisted zoom after file:// navigation (prevents Chromium per-origin zoom reset)
    win.webContents.setZoomFactor(initialZoomFactor);
    syncWindowControlsOverlayForZoomLevel(
      win,
      initialZoomLevel,
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    );
    while (pendingDeepLinks.length > 0) {
      const nextUrl = pendingDeepLinks.shift();
      if (nextUrl) win.webContents.send('nightfall:open-deep-link', nextUrl);
    }
  });

  // Strict popup & navigation lockdown
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(url);
      }
    } catch {
      // Ignore malformed popup URLs
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    const devOrigin = process.env.NIGHTFALL_RENDERER_URL || 'http://localhost:5173';
    if (!targetUrl.startsWith(devOrigin) && !targetUrl.startsWith('file://')) {
      event.preventDefault();
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          void shell.openExternal(targetUrl);
        }
      } catch {
        // Ignore invalid target URL
      }
    }
  });

  // Native text edit context menu + Inspect Element in debug/dev builds (mirrors zcode)
  win.webContents.on('context-menu', (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      template.push(
        { role: 'undo', enabled: params.editFlags.canUndo },
        { role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { role: 'selectAll', enabled: params.editFlags.canSelectAll },
      );
    } else if (params.selectionText.trim().length > 0) {
      template.push({ role: 'copy', enabled: params.editFlags.canCopy });
    }

    if (!app.isPackaged || isDebugBuild) {
      if (template.length > 0) template.push({ type: 'separator' });
      template.push({
        label: 'Inspect Element (Debug)',
        click: () => win.webContents.inspectElement(params.x, params.y),
      });
    }

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({ window: win });
    }
  });

  const devServerUrl = process.env.NIGHTFALL_RENDERER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(resolve(import.meta.dirname, '../../dist/index.html'));
  }

  return win;
}

function registerIpcHandlers(): void {
  ipcMain.handle('nightfall:get-platform-info', () => {
    const metrics = app.getAppMetrics();
    const rawCpu = metrics.reduce((sum, m) => sum + (m.cpu?.percentCPUUsage ?? 0), 0);
    return {
      isElectron: true,
      platform: process.platform,
      arch: process.arch,
      productFlavor: productIdentity.flavor,
      debugBuild: isDebugBuild,
      apiBaseUrl: embeddedApiBaseUrl || '/api',
      cpuPercent: normalizeElectronCpuToMachinePercent(rawCpu),
    };
  });

  ipcMain.handle('nightfall:pick-local-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Local Repository for Nightfall Scan',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle('nightfall:notify', (_event, payload: { title?: unknown; body?: unknown }) => {
    if (Notification.isSupported() && payload && typeof payload.title === 'string') {
      new Notification({
        title: payload.title,
        body: typeof payload.body === 'string' ? payload.body : '',
      }).show();
      return true;
    }
    return false;
  });

  ipcMain.handle('nightfall:set-zoom-level', (event, rawLevel: number) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const zoomLevel = clampDesktopZoomLevel(rawLevel);
    const zoomFactor = resolveDesktopZoomFactorForLevel(zoomLevel);
    updateDesktopSettings({ desktopZoomLevel: zoomLevel });
    if (win && !win.isDestroyed()) {
      win.webContents.setZoomFactor(zoomFactor);
      syncWindowControlsOverlayForZoomLevel(
        win,
        zoomLevel,
        nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      );
    }
    return { zoomLevel, zoomFactor };
  });

  ipcMain.handle('nightfall:set-keep-awake', (_event, enabled: boolean) => {
    keepAwakeWhileRunning = Boolean(enabled);
    updateDesktopSettings({ keepAwakeWhileRunning });
    reconcileKeepAwakeBlocker();
    return keepAwakeWhileRunning;
  });

  ipcMain.on('nightfall:window-controls-overlay-ready', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const zoomLevel = resolveDesktopZoomLevelFromFactor(win.webContents.getZoomFactor());
    syncWindowControlsOverlayForZoomLevel(
      win,
      zoomLevel,
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    );
  });
}

if (registerSingleInstanceAndProtocol()) {
  const initialDeepLink = extractDeepLinkFromArgv(process.argv);
  if (initialDeepLink) pendingDeepLinks.push(initialDeepLink);

  void app.whenReady().then(async () => {
    const settings = readDesktopSettings();
    keepAwakeWhileRunning = Boolean(settings.keepAwakeWhileRunning);
    reconcileKeepAwakeBlocker();

    await applyDesktopChromiumNetworkPolicy(session.defaultSession, settings);
    registerIpcHandlers();
    const apiBaseUrl = await ensureEmbeddedApiServer();
    primaryWindow = createMainWindow(apiBaseUrl);

    nativeTheme.on('updated', () => {
      if (!primaryWindow || primaryWindow.isDestroyed()) return;
      const zoomLevel = resolveDesktopZoomLevelFromFactor(
        primaryWindow.webContents.getZoomFactor(),
      );
      syncWindowControlsOverlayForZoomLevel(
        primaryWindow,
        zoomLevel,
        nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      );
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        primaryWindow = createMainWindow(apiBaseUrl);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    if (embeddedServer?.closeGracefully) {
      void embeddedServer.closeGracefully();
    } else if (embeddedServer) {
      embeddedServer.close();
    }
  });
}
