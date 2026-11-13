import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ChromiumHardwareAccelerationApp {
  disableHardwareAcceleration(): void;
}

export function resolveChromiumHardwareAccelerationSettingsFile(homePath: string = homedir()): string {
  return join(homePath, '.nightfall', 'v2', 'setting.json');
}

export function extractBootstrapChromiumHardwareAccelerationEnabled(rawValue: unknown): boolean {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return true;
  }
  const enabled = (rawValue as { desktopChromiumHardwareAccelerationEnabled?: unknown })
    .desktopChromiumHardwareAccelerationEnabled;
  return typeof enabled === 'boolean' ? enabled : true;
}

export function applyEarlyChromiumHardwareAccelerationBootstrap(
  app: ChromiumHardwareAccelerationApp,
  rawSettings?: unknown,
): boolean {
  let enabled = true;
  if (rawSettings !== undefined) {
    enabled = extractBootstrapChromiumHardwareAccelerationEnabled(rawSettings);
  } else {
    const settingsFile = resolveChromiumHardwareAccelerationSettingsFile();
    if (existsSync(settingsFile)) {
      try {
        enabled = extractBootstrapChromiumHardwareAccelerationEnabled(
          JSON.parse(readFileSync(settingsFile, 'utf-8')),
        );
      } catch {
        enabled = true;
      }
    }
  }

  if (!enabled) {
    // Electron requires disableHardwareAcceleration() before app.whenReady().
    app.disableHardwareAcceleration();
  }
  return enabled;
}
