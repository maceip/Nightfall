export interface AsarPackEntry {
  packState: string;
  path: string;
}

export function createDesktopNativePackagePrunePatterns(targetPlatformKey: string): string[];
export function parseAsarListWithPackState(output: string): AsarPackEntry[];
export function findDesktopNativePackageViolations(
  entries: AsarPackEntry[],
  targetPlatformKey: string,
): string[];
