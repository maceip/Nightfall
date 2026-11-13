export const SUPPORTED_DESKTOP_PLATFORM_KEYS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64',
];

export function assertSupportedTargetPlatformKey(targetPlatformKey) {
  if (!SUPPORTED_DESKTOP_PLATFORM_KEYS.includes(targetPlatformKey)) {
    throw new Error(`Unsupported desktop target platform: ${targetPlatformKey}`);
  }
}

export function createDesktopNativePackagePrunePatterns(targetPlatformKey) {
  assertSupportedTargetPlatformKey(targetPlatformKey);

  return [
    '!node_modules/@napi-rs/canvas/**',
    '!node_modules/@napi-rs/canvas-*/**',
    '!node_modules/@lydell/node-pty-*/**',
    '!node_modules/node-pty/build/**',
    '!node_modules/node-pty/bin/**',
    ...SUPPORTED_DESKTOP_PLATFORM_KEYS.filter((key) => key !== targetPlatformKey).map(
      (key) => `!node_modules/**/prebuilds/${key}/**`,
    ),
  ];
}

function normalizeAsarPath(entryPath) {
  const normalized = entryPath.trim().replaceAll('\\', '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function parseAsarListWithPackState(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(pack|unpack)\s*:\s*(.+)$/.exec(line);
      if (!match) {
        throw new Error(`Unable to parse asar pack state line: ${line}`);
      }
      return { packState: match[1], path: normalizeAsarPath(match[2]) };
    });
}

function isNativeRuntimeFile(entryPath) {
  return /\.(?:node|dll|dylib|exe)$/i.test(entryPath);
}

export function findDesktopNativePackageViolations(entries, targetPlatformKey) {
  assertSupportedTargetPlatformKey(targetPlatformKey);
  const violations = [];

  for (const entry of entries) {
    const { packState, path } = entry;

    if (
      path === '/node_modules/@napi-rs/canvas' ||
      path.startsWith('/node_modules/@napi-rs/canvas/') ||
      path.startsWith('/node_modules/@napi-rs/canvas-')
    ) {
      violations.push(`Renderer-unused Canvas native module leaked into bundle: ${path}`);
      continue;
    }

    const prebuildMatch = /^\/node_modules\/.*\/prebuilds\/([^/]+)/.exec(path);
    if (prebuildMatch && prebuildMatch[1] !== targetPlatformKey) {
      violations.push(`Cross-platform prebuild leaked into ${targetPlatformKey} bundle: ${path}`);
      continue;
    }

    if (isNativeRuntimeFile(path) && packState !== 'unpack') {
      violations.push(`Native binary remained packed inside app.asar instead of unpacked: ${path}`);
    }
  }

  return violations;
}
