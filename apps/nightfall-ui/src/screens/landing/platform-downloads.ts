export type DesktopPlatformId = 'mac-arm64' | 'mac-x64' | 'win-x64' | 'other';

export type PlatformInstallerSpec = {
  id: Exclude<DesktopPlatformId, 'other'>;
  platformLabel: string;
  shortLabel: string;
  ctaLabel: string;
  mobileCtaLabel: string;
  fileName: string;
  extension: '.dmg' | '.msi';
  archSummary: string;
  url: string;
};

export type NavigatorUADataHighEntropy = {
  architecture?: string;
  bitness?: string;
  platform?: string;
};

export type NavigatorLike = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: {
    platform?: string;
    mobile?: boolean;
    getHighEntropyValues?: (hints: string[]) => Promise<NavigatorUADataHighEntropy>;
  };
};

export const NIGHTFALL_REPO_URL = 'https://github.com/maceip/Nightfall';
export const NIGHTFALL_RELEASES_LATEST_URL = 'https://github.com/maceip/Nightfall/releases/latest';
export const NIGHTFALL_CHECKSUMS_URL =
  'https://github.com/maceip/Nightfall/releases/latest/download/SHA256SUMS.txt';

export const PLATFORM_INSTALLERS: ReadonlyArray<PlatformInstallerSpec> = [
  {
    id: 'mac-arm64',
    platformLabel: 'macOS (Apple Silicon)',
    shortLabel: 'macOS Apple Silicon (.dmg)',
    ctaLabel: 'Download for macOS (Apple Silicon)',
    mobileCtaLabel: 'Download (.dmg)',
    fileName: 'Nightfall-mac-arm64.dmg',
    extension: '.dmg',
    archSummary: 'Apple M1–M4 · Universal Sandbox & Scorecard',
    url: 'https://github.com/maceip/Nightfall/releases/latest/download/Nightfall-mac-arm64.dmg',
  },
  {
    id: 'mac-x64',
    platformLabel: 'macOS (Intel)',
    shortLabel: 'macOS Intel (.dmg)',
    ctaLabel: 'Download for macOS (Intel)',
    mobileCtaLabel: 'Download (.dmg)',
    fileName: 'Nightfall-mac-x64.dmg',
    extension: '.dmg',
    archSummary: 'Intel x86_64 · macOS 13 Ventura or newer',
    url: 'https://github.com/maceip/Nightfall/releases/latest/download/Nightfall-mac-x64.dmg',
  },
  {
    id: 'win-x64',
    platformLabel: 'Windows (x64)',
    shortLabel: 'Windows x64 (.msi)',
    ctaLabel: 'Download for Windows (x64)',
    mobileCtaLabel: 'Download (.msi)',
    fileName: 'Nightfall-win-x64.msi',
    extension: '.msi',
    archSummary: 'Windows 11 / 10 (64-bit) · WiX MSI Installer',
    url: 'https://github.com/maceip/Nightfall/releases/latest/download/Nightfall-win-x64.msi',
  },
];

let cachedGpuRenderer: string | null | undefined;

function readWebGlRendererOnce(): string | null {
  if (cachedGpuRenderer !== undefined) return cachedGpuRenderer;
  if (
    typeof document === 'undefined' ||
    (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
  ) {
    cachedGpuRenderer = null;
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      cachedGpuRenderer = null;
      return null;
    }
    const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugExt
      ? String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) ?? '')
      : String(gl.getParameter(gl.RENDERER) ?? '');
    cachedGpuRenderer = renderer || null;
    return cachedGpuRenderer;
  } catch {
    cachedGpuRenderer = null;
    return null;
  }
}

export function detectClientPlatformSync(
  navOverride?: NavigatorLike,
  gpuRendererOverride?: string | null,
): DesktopPlatformId {
  const nav: NavigatorLike | undefined =
    navOverride ?? (typeof navigator !== 'undefined' ? (navigator as unknown as NavigatorLike) : undefined);
  if (!nav) return 'other';

  const ua = nav.userAgent ?? '';
  const platform = nav.platform ?? '';
  const uaDataPlatform = nav.userAgentData?.platform ?? '';
  const combined = `${ua} ${platform} ${uaDataPlatform}`;

  if (
    nav.userAgentData?.mobile ||
    /iphone|ipad|ipod|android/i.test(combined) ||
    (/macintel/i.test(platform) && (nav.maxTouchPoints ?? 0) > 1)
  ) {
    return 'other';
  }

  if (/win32|win64|windows|wow64/i.test(combined)) {
    return 'win-x64';
  }

  if (/linux|cros|x11/i.test(combined)) {
    return 'other';
  }

  if (/mac|darwin/i.test(combined)) {
    if (/arm64|aarch64|macarm|apple silicon/i.test(combined)) {
      return 'mac-arm64';
    }
    if (/x86_64/i.test(ua)) {
      return 'mac-x64';
    }
    const gpu = gpuRendererOverride !== undefined ? gpuRendererOverride : readWebGlRendererOnce();
    if (gpu) {
      if (/apple m\d/i.test(gpu)) return 'mac-arm64';
      if (/intel|amd|radeon|nvidia/i.test(gpu)) return 'mac-x64';
    }
    return 'mac-arm64';
  }

  return 'other';
}

export async function refineClientPlatformAsync(
  navOverride?: NavigatorLike,
): Promise<DesktopPlatformId> {
  const initial = detectClientPlatformSync(navOverride);
  const nav: NavigatorLike | undefined =
    navOverride ?? (typeof navigator !== 'undefined' ? (navigator as unknown as NavigatorLike) : undefined);
  const getHighEntropy = nav?.userAgentData?.getHighEntropyValues;
  if (!getHighEntropy) {
    return initial;
  }

  try {
    const hints = await getHighEntropy.call(nav.userAgentData, ['architecture', 'platform']);
    const platform = hints.platform ?? nav?.userAgentData?.platform ?? '';
    const arch = hints.architecture ?? '';
    if (/mac/i.test(platform)) {
      if (/x86|amd64|ia32/i.test(arch)) return 'mac-x64';
      if (/arm/i.test(arch)) return 'mac-arm64';
    }
    if (/win/i.test(platform)) return 'win-x64';
    if (/linux|chrome|android|ios/i.test(platform)) return 'other';
  } catch {
    // High-entropy hints rejected by browser policy; keep synchronous detection
  }
  return initial;
}

export type PlatformDownloadPlan = {
  detectedPlatform: DesktopPlatformId;
  primaryCta: {
    label: string;
    mobileLabel: string;
    url: string;
    fileName?: string;
  };
  alternateInstallers: ReadonlyArray<PlatformInstallerSpec>;
  allInstallers: ReadonlyArray<PlatformInstallerSpec>;
};

export function resolvePlatformDownloadPlan(
  detectedPlatform: DesktopPlatformId,
): PlatformDownloadPlan {
  const matched = PLATFORM_INSTALLERS.find((item) => item.id === detectedPlatform);
  if (matched) {
    return {
      detectedPlatform,
      primaryCta: {
        label: matched.ctaLabel,
        mobileLabel: matched.mobileCtaLabel,
        url: matched.url,
        fileName: matched.fileName,
      },
      alternateInstallers: PLATFORM_INSTALLERS.filter((item) => item.id !== matched.id),
      allInstallers: PLATFORM_INSTALLERS,
    };
  }

  return {
    detectedPlatform: 'other',
    primaryCta: {
      label: 'Download Desktop Releases',
      mobileLabel: 'Releases',
      url: NIGHTFALL_RELEASES_LATEST_URL,
    },
    alternateInstallers: PLATFORM_INSTALLERS.slice(0, 2),
    allInstallers: PLATFORM_INSTALLERS,
  };
}
