export interface DesktopProductIdentity {
  flavor: 'production' | 'preview';
  appId: string;
  productName: string;
  shortcutName: string;
  linuxExecutableName: string;
  linuxPackageName: string;
  deepLinkScheme: string;
  msiUpgradeCode: string;
}

export function isDebugBuildRequested(env?: Record<string, string | undefined>): boolean;
export function isPreviewIdentityRequested(env?: Record<string, string | undefined>): boolean;
export function resolveDesktopProductFlavor(
  env?: Record<string, string | undefined>,
): 'production' | 'preview';
export function resolveDesktopProductIdentity(
  env?: Record<string, string | undefined>,
): DesktopProductIdentity;
export function resolveDesktopArtifactSuffix(
  env?: Record<string, string | undefined>,
): string;
export function resolveWindowsAppUserModelId(
  env?: Record<string, string | undefined>,
  runtime?: { isPackaged: boolean },
): string;
