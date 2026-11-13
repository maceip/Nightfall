import type { BrowserWindow, Point, Rectangle } from 'electron';

export const DEFAULT_DESKTOP_WINDOW_WIDTH = 1440;
export const DEFAULT_DESKTOP_WINDOW_HEIGHT = 900;
export const MIN_DESKTOP_WINDOW_WIDTH = 480;
export const MIN_DESKTOP_WINDOW_HEIGHT = 640;
export const WINDOW_SIZE_PERSIST_DEBOUNCE_MS = 250;

export const MACOS_TRAFFIC_LIGHT_BASE_POSITION = { x: 18, y: 13 } as const;
export const MACOS_TRAFFIC_LIGHT_BASE_LEFT_PADDING_PX = 88;
const MACOS_TRAFFIC_LIGHT_POSITION_MOVEMENT_GAIN = 1.5;
const MACOS_TRAFFIC_LIGHT_MIN_POSITION_PX = 4;

export const WINDOWS_WINDOW_CONTROLS_BASE_RIGHT_PADDING_PX = 136;
export const WINDOWS_TITLE_BAR_HEIGHT_PX = 40;

export const DESKTOP_ZOOM_FACTOR_STEP = 1.1;
export const DESKTOP_ZOOM_MIN_LEVEL = -3;
export const DESKTOP_ZOOM_MAX_LEVEL = 5;

export interface DesktopWindowSize {
  width: number;
  height: number;
  maximized: boolean;
}

export interface WindowControlsOverlayMetrics {
  leftPaddingPx?: number;
  rightPaddingPx?: number;
  titleBarHeightPx?: number;
}

export function clampDesktopZoomLevel(level: number): number {
  return Math.min(DESKTOP_ZOOM_MAX_LEVEL, Math.max(DESKTOP_ZOOM_MIN_LEVEL, level));
}

export function resolveDesktopZoomFactorForLevel(level: number): number {
  return Math.pow(DESKTOP_ZOOM_FACTOR_STEP, clampDesktopZoomLevel(level));
}

export function resolveDesktopZoomLevelFromFactor(zoomFactor: number): number {
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
    return 0;
  }
  return clampDesktopZoomLevel(
    Math.round(Math.log(zoomFactor) / Math.log(DESKTOP_ZOOM_FACTOR_STEP)),
  );
}

function clampDimension(value: number, minimum: number, available: number): number {
  const maximum = Math.max(minimum, Math.floor(available));
  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}

export function resolveDesktopWindowSize(
  persisted: DesktopWindowSize | undefined,
  workAreaSize: Pick<Rectangle, 'width' | 'height'>,
): DesktopWindowSize {
  const width = persisted?.width ?? DEFAULT_DESKTOP_WINDOW_WIDTH;
  const height = persisted?.height ?? DEFAULT_DESKTOP_WINDOW_HEIGHT;
  return {
    width: clampDimension(width, MIN_DESKTOP_WINDOW_WIDTH, workAreaSize.width),
    height: clampDimension(height, MIN_DESKTOP_WINDOW_HEIGHT, workAreaSize.height),
    maximized: persisted?.maximized ?? false,
  };
}

export function resolveMacOSWindowButtonPositionForZoomLevel(zoomLevel: number): Point {
  const zoomFactor = resolveDesktopZoomFactorForLevel(zoomLevel);
  const y = Math.max(
    MACOS_TRAFFIC_LIGHT_MIN_POSITION_PX,
    Math.round(
      MACOS_TRAFFIC_LIGHT_BASE_POSITION.y +
        (MACOS_TRAFFIC_LIGHT_BASE_POSITION.y * zoomFactor - MACOS_TRAFFIC_LIGHT_BASE_POSITION.y) *
          MACOS_TRAFFIC_LIGHT_POSITION_MOVEMENT_GAIN,
    ),
  );
  return { x: MACOS_TRAFFIC_LIGHT_BASE_POSITION.x, y };
}

export function buildWindowsTitleBarOverlayForZoomLevel(
  zoomLevel: number,
  theme: 'light' | 'dark',
) {
  const zoomFactor = resolveDesktopZoomFactorForLevel(zoomLevel);
  return {
    color: '#00000000',
    symbolColor: theme === 'dark' ? '#f5f5f5' : '#1f1f1f',
    height: Math.round(WINDOWS_TITLE_BAR_HEIGHT_PX * zoomFactor),
  };
}

export function computeWindowControlsOverlayMetrics(
  zoomLevel: number,
  platform: NodeJS.Platform = process.platform,
): WindowControlsOverlayMetrics {
  const zoomFactor = resolveDesktopZoomFactorForLevel(zoomLevel);
  if (platform === 'darwin') {
    return {
      leftPaddingPx: Math.round(MACOS_TRAFFIC_LIGHT_BASE_LEFT_PADDING_PX / zoomFactor),
    };
  }
  if (platform === 'win32') {
    return {
      rightPaddingPx: Math.round(WINDOWS_WINDOW_CONTROLS_BASE_RIGHT_PADDING_PX / zoomFactor),
      titleBarHeightPx: Math.round(WINDOWS_TITLE_BAR_HEIGHT_PX * zoomFactor),
    };
  }
  return {};
}

export function syncWindowControlsOverlayForZoomLevel(
  targetWindow: BrowserWindow | null | undefined,
  zoomLevel: number,
  theme: 'light' | 'dark',
): void {
  if (!targetWindow || targetWindow.isDestroyed()) return;

  if (process.platform === 'darwin') {
    targetWindow.setWindowButtonPosition(resolveMacOSWindowButtonPositionForZoomLevel(zoomLevel));
  } else if (process.platform === 'win32') {
    targetWindow.setTitleBarOverlay(buildWindowsTitleBarOverlayForZoomLevel(zoomLevel, theme));
  }

  targetWindow.webContents.send(
    'nightfall:window-controls-overlay-changed',
    computeWindowControlsOverlayMetrics(zoomLevel),
  );
}

export function attachDesktopWindowSizePersistence(
  win: Pick<BrowserWindow, 'getNormalBounds' | 'isDestroyed' | 'isMaximized' | 'on'>,
  save: (state: DesktopWindowSize) => void,
): void {
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  const persistCurrentState = () => {
    if (win.isDestroyed()) return;
    const bounds = win.getNormalBounds();
    save({
      width: Math.max(MIN_DESKTOP_WINDOW_WIDTH, Math.floor(bounds.width)),
      height: Math.max(MIN_DESKTOP_WINDOW_HEIGHT, Math.floor(bounds.height)),
      maximized: win.isMaximized(),
    });
  };

  const clearResizeTimer = () => {
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
  };

  win.on('resize', () => {
    clearResizeTimer();
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      persistCurrentState();
    }, WINDOW_SIZE_PERSIST_DEBOUNCE_MS);
  });
  win.on('maximize', () => {
    clearResizeTimer();
    persistCurrentState();
  });
  win.on('unmaximize', () => {
    clearResizeTimer();
    persistCurrentState();
  });
  win.on('close', clearResizeTimer);
}

export function attachWindowsWindowRepaint(targetWindow: BrowserWindow): void {
  if (process.platform !== 'win32') return;

  let pendingRepaintTimer: ReturnType<typeof setTimeout> | null = null;
  const repaint = () => {
    if (targetWindow.isDestroyed() || targetWindow.webContents.isDestroyed()) return;
    targetWindow.webContents.invalidate();
  };

  const scheduleRepaint = () => {
    repaint();
    if (pendingRepaintTimer !== null) clearTimeout(pendingRepaintTimer);
    pendingRepaintTimer = setTimeout(() => {
      pendingRepaintTimer = null;
      repaint();
    }, 32);
  };

  targetWindow.on('resized', scheduleRepaint);
  targetWindow.on('show', scheduleRepaint);
}
