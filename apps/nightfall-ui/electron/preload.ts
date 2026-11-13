import { contextBridge, ipcRenderer, webFrame } from 'electron';

interface WindowControlsOverlayMetrics {
  leftPaddingPx?: number;
  rightPaddingPx?: number;
  titleBarHeightPx?: number;
}

const MACOS_TRAFFIC_LIGHT_BASE_LEFT_PADDING_PX = 88;
const WINDOWS_WINDOW_CONTROLS_BASE_RIGHT_PADDING_PX = 136;
const WINDOWS_TITLE_BAR_HEIGHT_PX = 40;
const DESKTOP_ZOOM_FACTOR_STEP = 1.1;

function parseArgValue(flagPrefix: string, fallback = ''): string {
  for (const arg of process.argv) {
    if (arg.startsWith(flagPrefix)) {
      return arg.slice(flagPrefix.length);
    }
  }
  return fallback;
}

function clampZoomLevel(level: number): number {
  return Math.min(5, Math.max(-3, level));
}

function readInitialWindowControlsOverlayMetrics(): WindowControlsOverlayMetrics {
  const rawFactor = webFrame.getZoomFactor();
  const level =
    Number.isFinite(rawFactor) && rawFactor > 0
      ? clampZoomLevel(Math.round(Math.log(rawFactor) / Math.log(DESKTOP_ZOOM_FACTOR_STEP)))
      : 0;
  const zoomFactor = Math.pow(DESKTOP_ZOOM_FACTOR_STEP, level);

  if (process.platform === 'darwin') {
    return {
      leftPaddingPx: Math.round(MACOS_TRAFFIC_LIGHT_BASE_LEFT_PADDING_PX / zoomFactor),
    };
  }
  if (process.platform === 'win32') {
    return {
      rightPaddingPx: Math.round(WINDOWS_WINDOW_CONTROLS_BASE_RIGHT_PADDING_PX / zoomFactor),
      titleBarHeightPx: Math.round(WINDOWS_TITLE_BAR_HEIGHT_PX * zoomFactor),
    };
  }
  return {};
}

const deviceMid = parseArgValue('--device-id=');
const apiBaseUrl = parseArgValue('--api-base-url=', '/api');
const productFlavor = parseArgValue('--product-flavor=', 'preview');
const debugBuild = parseArgValue('--debug-build=', '1') === '1';

let latestMetrics: WindowControlsOverlayMetrics = readInitialWindowControlsOverlayMetrics();
const overlaySubscribers = new Set<(metrics: WindowControlsOverlayMetrics) => void>();
const deepLinkSubscribers = new Set<(url: string) => void>();
const pendingDeepLinks: string[] = [];

// Synchronously notify main before React mounts so macOS traffic lights align on frame 1 (mirrors zcode)
ipcRenderer.send('nightfall:window-controls-overlay-ready');

ipcRenderer.on(
  'nightfall:window-controls-overlay-changed',
  (_event: unknown, metrics: WindowControlsOverlayMetrics) => {
    latestMetrics = metrics;
    for (const listener of overlaySubscribers) {
      listener(metrics);
    }
  },
);

ipcRenderer.on('nightfall:open-deep-link', (_event: unknown, url: string) => {
  if (deepLinkSubscribers.size === 0) {
    pendingDeepLinks.push(url);
    return;
  }
  for (const listener of deepLinkSubscribers) {
    listener(url);
  }
});

contextBridge.exposeInMainWorld('__NIGHTFALL_DEVICE_ID__', deviceMid);

contextBridge.exposeInMainWorld('nightfallDesktop', {
  isElectron: true,
  deviceMid,
  apiBaseUrl,
  productFlavor,
  debugBuild,
  platform: process.platform,
  arch: process.arch,
  getWindowControlsMetrics: () => latestMetrics,
  onWindowControlsMetricsChanged: (cb: (metrics: WindowControlsOverlayMetrics) => void) => {
    overlaySubscribers.add(cb);
    cb(latestMetrics);
    return () => {
      overlaySubscribers.delete(cb);
    };
  },
  onDeepLink: (cb: (url: string) => void) => {
    deepLinkSubscribers.add(cb);
    while (pendingDeepLinks.length > 0) {
      const link = pendingDeepLinks.shift();
      if (link) cb(link);
    }
    return () => {
      deepLinkSubscribers.delete(cb);
    };
  },
  getPlatformInfo: () => ipcRenderer.invoke('nightfall:get-platform-info'),
  pickLocalRepository: () => ipcRenderer.invoke('nightfall:pick-local-directory'),
  sendNativeNotification: (title: string, body: string) =>
    ipcRenderer.invoke('nightfall:notify', { title, body }),
  setZoomLevel: (level: number) => ipcRenderer.invoke('nightfall:set-zoom-level', level),
  setKeepAwake: (enabled: boolean) => ipcRenderer.invoke('nightfall:set-keep-awake', enabled),
});
