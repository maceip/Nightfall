import os from 'node:os';

/**
 * Normalizes Electron `percentCPUUsage` to whole-machine percentage across platforms.
 * Chromium normalizes darwin/win32 to machine CPU %, whereas Linux reports single-core %
 * and must be divided by logical CPU count (identical to zcode's electronCpuNormalization).
 */
export function normalizeElectronCpuToMachinePercent(
  cpu: number | null | undefined,
  options: { platform?: NodeJS.Platform; logicalCpuCount?: number } = {},
): number {
  const normalizedCpu = typeof cpu === 'number' && Number.isFinite(cpu) ? cpu : 0;
  const platform = options.platform ?? process.platform;
  if (platform !== 'linux') {
    return normalizedCpu;
  }
  const logicalCpuCount = options.logicalCpuCount ?? os.cpus().length;
  const scale = Number.isFinite(logicalCpuCount) && logicalCpuCount > 0 ? logicalCpuCount : 1;
  return normalizedCpu / scale;
}
