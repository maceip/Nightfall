export type WindowControlsOverlayMetrics = {
  leftPaddingPx?: number;
  rightPaddingPx?: number;
  titleBarHeightPx?: number;
};

export type PlatformInfo = {
  isElectron: boolean;
  platform: string;
  arch: string;
  productFlavor?: string;
  debugBuild?: boolean;
  apiBaseUrl?: string;
  cpuPercent?: number;
};

export type NightfallDesktopBridge = {
  readonly isElectron: boolean;
  readonly apiBaseUrl?: string;
  readonly deviceMid?: string;
  readonly productFlavor?: string;
  readonly debugBuild?: boolean;
  readonly platform?: string;
  readonly arch?: string;
  getWindowControlsMetrics?: () => WindowControlsOverlayMetrics;
  onWindowControlsMetricsChanged?: (cb: (metrics: WindowControlsOverlayMetrics) => void) => () => void;
  onDeepLink?: (cb: (url: string) => void) => () => void;
  getPlatformInfo: () => Promise<PlatformInfo>;
  pickLocalRepository: () => Promise<string | null>;
  sendNativeNotification: (title: string, body: string) => Promise<boolean>;
  setZoomLevel?: (level: number) => Promise<{ zoomLevel: number; zoomFactor: number }>;
  setKeepAwake?: (enabled: boolean) => Promise<boolean>;
};

declare global {
  interface Window {
    __NIGHTFALL_DEVICE_ID__?: string;
    nightfallDesktop?: NightfallDesktopBridge;
  }
}

function getIsElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.nightfallDesktop?.isElectron);
}

async function getPlatformInfo(): Promise<PlatformInfo> {
  if (typeof window !== 'undefined' && window.nightfallDesktop) {
    return window.nightfallDesktop.getPlatformInfo();
  }
  return { isElectron: false, platform: 'web', arch: 'browser' };
}

async function pickLocalRepository(): Promise<string | null> {
  if (typeof window !== 'undefined' && window.nightfallDesktop) {
    return window.nightfallDesktop.pickLocalRepository();
  }
  return null;
}

async function sendNativeNotification(title: string, body: string): Promise<boolean> {
  if (typeof window !== 'undefined' && window.nightfallDesktop) {
    return window.nightfallDesktop.sendNativeNotification(title, body);
  }
  return false;
}

export const platformBridge: NightfallDesktopBridge = {
  get isElectron(): boolean {
    return getIsElectron();
  },
  get apiBaseUrl(): string | undefined {
    return typeof window !== 'undefined' ? window.nightfallDesktop?.apiBaseUrl : undefined;
  },
  get deviceMid(): string | undefined {
    return typeof window !== 'undefined' ? window.nightfallDesktop?.deviceMid : undefined;
  },
  get productFlavor(): string | undefined {
    return typeof window !== 'undefined' ? window.nightfallDesktop?.productFlavor : undefined;
  },
  get debugBuild(): boolean | undefined {
    return typeof window !== 'undefined' ? window.nightfallDesktop?.debugBuild : undefined;
  },
  getWindowControlsMetrics: () =>
    typeof window !== 'undefined' && window.nightfallDesktop?.getWindowControlsMetrics
      ? window.nightfallDesktop.getWindowControlsMetrics()
      : {},
  onWindowControlsMetricsChanged: (cb) =>
    typeof window !== 'undefined' && window.nightfallDesktop?.onWindowControlsMetricsChanged
      ? window.nightfallDesktop.onWindowControlsMetricsChanged(cb)
      : () => undefined,
  onDeepLink: (cb) =>
    typeof window !== 'undefined' && window.nightfallDesktop?.onDeepLink
      ? window.nightfallDesktop.onDeepLink(cb)
      : () => undefined,
  getPlatformInfo,
  pickLocalRepository,
  sendNativeNotification,
};
