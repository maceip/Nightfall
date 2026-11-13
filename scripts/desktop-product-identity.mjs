/**
 * Nightfall Desktop Product Identity & Channel Isolation (modeled on zcode's desktop-product-identity).
 *
 * Separates installer identity (`production` vs `preview`) from backend/debug mode so debug/CI
 * `.msi` and `.dmg` installers can be installed side-by-side with a stable Nightfall release
 * without colliding on macOS bundle IDs, Windows UpgradeCode/AUMID, or Linux package names.
 */
export const NIGHTFALL_PREVIEW_IDENTITY_ENV = 'NIGHTFALL_PREVIEW_IDENTITY';
export const NIGHTFALL_DEBUG_BUILD_ENV = 'NIGHTFALL_DEBUG_BUILD';

const PRODUCTION_IDENTITY = Object.freeze({
  flavor: 'production',
  appId: 'dev.nightfall.app',
  productName: 'Nightfall',
  shortcutName: 'Nightfall',
  linuxExecutableName: 'nightfall',
  linuxPackageName: 'nightfall',
  deepLinkScheme: 'nightfall',
  msiUpgradeCode: '5C31B9E4-8F20-4A71-9D14-2B8E607A39C1',
});

const PREVIEW_IDENTITY = Object.freeze({
  flavor: 'preview',
  appId: 'dev.nightfall.app.preview',
  productName: 'Nightfall Preview',
  shortcutName: 'Nightfall Preview',
  linuxExecutableName: 'nightfall-preview',
  linuxPackageName: 'nightfall-preview',
  deepLinkScheme: 'nightfall-preview',
  msiUpgradeCode: '8F4E5B62-9D17-4C8A-A5D2-7C31E904B1F8',
});

export const desktopProductIdentities = Object.freeze({
  production: PRODUCTION_IDENTITY,
  preview: PREVIEW_IDENTITY,
});

export function normalizeDesktopNightfallEnv(env = process.env) {
  const raw = env.NIGHTFALL_ENV?.trim().toLowerCase();
  if (raw === 'production') return 'production';
  if (raw === 'debug') return 'debug';
  return 'test';
}

export function isDebugBuildRequested(env = process.env) {
  const value = env[NIGHTFALL_DEBUG_BUILD_ENV]?.trim() ?? '';
  if (value === '1') return true;
  if (value === '' || value === '0') return normalizeDesktopNightfallEnv(env) === 'debug';
  throw new Error(
    `Invalid ${NIGHTFALL_DEBUG_BUILD_ENV}=${env[NIGHTFALL_DEBUG_BUILD_ENV]}; expected 1 or 0`,
  );
}

export function isPreviewIdentityRequested(env = process.env) {
  const value = env[NIGHTFALL_PREVIEW_IDENTITY_ENV]?.trim() ?? '';
  if (value === '1') return true;
  if (value === '' || value === '0') return false;
  throw new Error(
    `Invalid ${NIGHTFALL_PREVIEW_IDENTITY_ENV}=${env[NIGHTFALL_PREVIEW_IDENTITY_ENV]}; expected 1 or 0`,
  );
}

export function resolveDesktopProductFlavor(env = process.env) {
  if (isPreviewIdentityRequested(env)) {
    return 'preview';
  }
  return normalizeDesktopNightfallEnv(env) === 'production' ? 'production' : 'preview';
}

export function resolveDesktopProductIdentity(env = process.env) {
  return desktopProductIdentities[resolveDesktopProductFlavor(env)];
}

export function resolveDesktopArtifactSuffix(env = process.env) {
  if (isDebugBuildRequested(env)) {
    return '_DEBUG';
  }
  return normalizeDesktopNightfallEnv(env) === 'test' ? '_TEST' : '';
}

export function resolveWindowsAppUserModelIdForFlavor(flavor, runtime = { isPackaged: true }) {
  if (runtime.isPackaged === false) {
    return 'dev.nightfall.desktop.dev';
  }
  return desktopProductIdentities[flavor === 'preview' ? 'preview' : 'production'].appId;
}

export function resolveWindowsAppUserModelId(env = process.env, runtime = { isPackaged: true }) {
  return resolveWindowsAppUserModelIdForFlavor(resolveDesktopProductFlavor(env), runtime);
}
