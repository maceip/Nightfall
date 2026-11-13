import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { replaceAppAsarFromStaging } from '../../scripts/app-asar-repack.mjs';
import {
  createDesktopNativePackagePrunePatterns,
  findDesktopNativePackageViolations,
  parseAsarListWithPackState,
} from '../../scripts/desktop-native-package-policy.mjs';
import {
  isDebugBuildRequested,
  resolveDesktopArtifactSuffix,
  resolveDesktopProductIdentity,
} from '../../scripts/desktop-product-identity.mjs';
import { cleanupPackagedSourcemaps } from '../../scripts/packaged-sourcemap-cleanup.mjs';

const requireFromConfig = createRequire(import.meta.url);
const pkgJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'),
);

const workspaceRoot = resolve(import.meta.dirname, '../..');
const desktopPackageRoot = import.meta.dirname;
const desktopProductIdentity = resolveDesktopProductIdentity(process.env);
const isDebugBuild = isDebugBuildRequested(process.env);
const desktopArtifactEnvSuffix = resolveDesktopArtifactSuffix(process.env);
const desktopDistDir = process.env.NIGHTFALL_DESKTOP_DIST_DIR || 'dist-electron';

const targetOsRaw = (process.env.NIGHTFALL_TARGET_OS || process.platform).toLowerCase();
const targetArchRaw = (process.env.NIGHTFALL_TARGET_ARCH || process.arch).toLowerCase();
const normalizedOs =
  targetOsRaw === 'mac' || targetOsRaw === 'macos' || targetOsRaw === 'darwin'
    ? 'darwin'
    : targetOsRaw === 'win' || targetOsRaw === 'windows' || targetOsRaw === 'win32'
      ? 'win32'
      : 'linux';
const normalizedArch =
  targetArchRaw === 'amd64' || targetArchRaw === 'x86_64' ? 'x64' : targetArchRaw;
const targetPlatformKey = `${normalizedOs}-${normalizedArch}`;

const rawMacSigningIdentity = process.env.APPLE_SIGNING_IDENTITY || process.env.CSC_NAME;
const macSigningIdentity =
  rawMacSigningIdentity?.replace(/^Developer ID Application:\s*/, '') ?? null;
const shouldEnableMacSigning =
  process.env.NIGHTFALL_ENABLE_MAC_SIGN === '1' && Boolean(macSigningIdentity);

if (
  desktopProductIdentity.flavor === 'preview' &&
  process.env.NIGHTFALL_ENABLE_MAC_SIGN === '1' &&
  !macSigningIdentity
) {
  throw new Error(
    'Nightfall Preview macOS packaging requires APPLE_SIGNING_IDENTITY or CSC_NAME when NIGHTFALL_ENABLE_MAC_SIGN=1',
  );
}

const desktopElectronVersion = (pkgJson.devDependencies?.electron ?? '35.1.5').replace(
  /^[\^~]/,
  '',
);

const REQUIRED_ASAR_RUNTIME_MODULES = ['ws'];
const runtimeModuleLookupRoots = [
  desktopPackageRoot,
  workspaceRoot,
  resolve(desktopPackageRoot, 'node_modules', '.pnpm', 'node_modules'),
  resolve(workspaceRoot, 'node_modules', '.pnpm', 'node_modules'),
];

const PACKAGING_PRUNE_PATTERNS = [
  ...(isDebugBuild ? [] : ['!**/*.map']),
  '!**/*.pdb',
  '!**/__tests__/**',
  '!**/test/**',
  '!**/tests/**',
  '!**/example/**',
  '!**/examples/**',
  '!**/README*',
  '!**/CHANGELOG*',
  '!**/CONTRIBUTING*',
  '!**/CODE_OF_CONDUCT*',
  '!**/SECURITY*',
];

const WINDOWS_INSTALL_MANIFEST_NAME = '.nightfall-install-manifest';

function resolveAsarCliPath() {
  return resolve(
    dirname(requireFromConfig.resolve('@electron/asar/package.json')),
    'bin',
    'asar.js',
  );
}

function runAsarCommand(args) {
  execFileSync(process.execPath, [resolveAsarCliPath(), ...args], {
    cwd: desktopPackageRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

function runAsarCommandStdout(args) {
  return execFileSync(process.execPath, [resolveAsarCliPath(), ...args], {
    cwd: desktopPackageRoot,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function resolveAppAsarPath(context) {
  if (context.electronPlatformName === 'darwin') {
    const appName = `${context.packager?.appInfo?.productFilename ?? desktopProductIdentity.productName}.app`;
    return resolve(context.appOutDir, appName, 'Contents', 'Resources', 'app.asar');
  }
  return resolve(context.appOutDir, 'resources', 'app.asar');
}

function resolvePackagedResourcesDir(context) {
  if (context.electronPlatformName === 'darwin') {
    const appName = `${context.packager?.appInfo?.productFilename ?? desktopProductIdentity.productName}.app`;
    return resolve(context.appOutDir, appName, 'Contents', 'Resources');
  }
  return resolve(context.appOutDir, 'resources');
}

function findRuntimeModuleOnDisk(moduleName) {
  for (const root of runtimeModuleLookupRoots) {
    const candidate = resolve(root, 'node_modules', moduleName);
    if (existsSync(resolve(candidate, 'package.json'))) {
      return candidate;
    }
  }
  return null;
}

async function injectHoistedRuntimeModulesIntoAsar(context) {
  const appAsarPath = resolveAppAsarPath(context);
  if (!existsSync(appAsarPath)) {
    throw new Error(`Packaged output is missing app.asar: ${appAsarPath}`);
  }

  const entries = new Set(
    runAsarCommandStdout(['list', appAsarPath])
      .split('\n')
      .map((line) => line.trim().replaceAll('\\', '/'))
      .filter(Boolean),
  );

  const missing = REQUIRED_ASAR_RUNTIME_MODULES.filter((modName) => {
    const root = `/node_modules/${modName}`;
    if (entries.has(root)) return false;
    for (const entry of entries) {
      if (entry.startsWith(`${root}/`)) return false;
    }
    return Boolean(findRuntimeModuleOnDisk(modName));
  });

  if (missing.length === 0) {
    console.log('[afterPack] runtime modules already complete in app.asar');
    return;
  }

  mkdirSync(tmpdir(), { recursive: true });
  const stagingDir = mkdtempSync(resolve(tmpdir(), 'nightfall-app-asar-'));
  try {
    runAsarCommand(['extract', appAsarPath, stagingDir]);
    for (const modName of missing) {
      const sourcePath = findRuntimeModuleOnDisk(modName);
      if (!sourcePath) continue;
      const destPath = resolve(stagingDir, 'node_modules', modName);
      mkdirSync(dirname(destPath), { recursive: true });
      rmSync(destPath, { force: true, recursive: true });
      cpSync(sourcePath, destPath, { recursive: true, dereference: true });
    }
    await replaceAppAsarFromStaging({
      sourceDir: stagingDir,
      appAsarPath,
      runAsarCommand,
    });
  } finally {
    rmSync(stagingDir, { force: true, recursive: true });
  }
}

function assertPackagedNativeResourcePolicy(context) {
  const appAsarPath = resolveAppAsarPath(context);
  const entries = parseAsarListWithPackState(
    runAsarCommandStdout(['list', '--is-pack', appAsarPath]),
  );
  const violations = findDesktopNativePackageViolations(entries, targetPlatformKey);
  if (violations.length > 0) {
    throw new Error(`Desktop native resource boundary violations:\n- ${violations.join('\n- ')}`);
  }
}

async function writeWindowsInstallManifest(context) {
  if (context.electronPlatformName !== 'win32') return;
  const root = context.appOutDir;
  const files = [];
  const visit = async (dir, rel = '') => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(absPath, relPath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(relPath.replaceAll('/', '\\'));
      }
    }
  };
  await visit(root);
  files.sort();
  await writeFile(join(root, WINDOWS_INSTALL_MANIFEST_NAME), `${files.join('\r\n')}\r\n`, 'utf8');
}

function buildDesktopArtifactName(platformName, extension = '${ext}') {
  return `\${productName}-\${version}-${platformName}-\${arch}${desktopArtifactEnvSuffix}.${extension}`;
}

function resolveElectronDownloadMirror(env = process.env) {
  const override =
    env.NIGHTFALL_ELECTRON_RUNTIME_MIRROR ||
    env.NPM_CONFIG_ELECTRON_MIRROR ||
    env.ELECTRON_MIRROR;
  return override?.trim() ? override.trim() : undefined;
}

const optionalLiteBoxExtraResources = existsSync(
  resolve(desktopPackageRoot, `bundled-tools/${targetPlatformKey}/litebox`),
)
  ? [
      {
        from: `bundled-tools/${targetPlatformKey}/litebox`,
        to: 'tools/litebox',
        filter: ['**/*'],
      },
    ]
  : [];

/** @type {import('electron-builder').Configuration} */
export default {
  appId: desktopProductIdentity.appId,
  productName: desktopProductIdentity.productName,
  extraMetadata: {
    version: pkgJson.version,
    main: 'out/main/index.js',
    nightfallProductFlavor: desktopProductIdentity.flavor,
    nightfallDebugBuild: isDebugBuild,
    homepage: 'https://github.com/maceip/Nightfall',
    author: {
      name: 'Nightfall Security',
      email: 'security@nightfall.dev',
    },
  },
  // Restrict Chromium locale packs to en-US so macOS codesign doesn't sign 50+ locale .paks (mirrors zcode)
  electronLanguages: ['en-US'],
  electronVersion: desktopElectronVersion,
  ...(resolveElectronDownloadMirror()
    ? { electronDownload: { mirror: resolveElectronDownloadMirror() } }
    : {}),
  directories: {
    output: desktopDistDir,
    buildResources: 'build',
  },
  files: [
    'out/**/*',
    'dist/**/*',
    'package.json',
    ...PACKAGING_PRUNE_PATTERNS,
    ...createDesktopNativePackagePrunePatterns(targetPlatformKey),
    '!node_modules/@nightfall/**',
    '!node_modules/react/**',
    '!node_modules/react-dom/**',
  ],
  asar: true,
  asarUnpack: ['**/*.{node,dll,dylib,exe}'],
  npmRebuild: false,
  detectUpdateChannel: false,
  protocols: [
    {
      name: desktopProductIdentity.productName,
      schemes: [desktopProductIdentity.deepLinkScheme],
    },
  ],
  afterPack: async (context) => {
    await injectHoistedRuntimeModulesIntoAsar(context);
    await cleanupPackagedSourcemaps({
      appAsarPath: resolveAppAsarPath(context),
      resourcesDir: resolvePackagedResourcesDir(context),
      runAsarCommand,
      replaceAppAsarFromStaging: ({ sourceDir, appAsarPath }) =>
        replaceAppAsarFromStaging({ sourceDir, appAsarPath, runAsarCommand }),
      preserveDebugMaps: isDebugBuild,
    });
    assertPackagedNativeResourcePolicy(context);
    await writeWindowsInstallManifest(context);
  },
  extraResources: [
    { from: 'build/icon.png', to: 'icon.png' },
    { from: 'build/icon_windows.png', to: 'icon_windows.png' },
    ...(normalizedOs === 'linux'
      ? [{ from: 'build/icons/512x512.png', to: 'icon_512x512.png' }]
      : []),
    ...(normalizedOs === 'win32'
      ? [{ from: 'build/icon.ico', to: 'tray_icon.ico' }]
      : []),
    ...optionalLiteBoxExtraResources,
  ],
  mac: {
    target: ['dmg'],
    icon: 'build/icon.icns',
    category: 'public.app-category.developer-tools',
    artifactName: buildDesktopArtifactName('mac'),
    extendInfo: {
      NSAppleEventsUsageDescription: `${desktopProductIdentity.productName} uses Apple Events only for user-initiated developer editor handoffs.`,
    },
    identity: shouldEnableMacSigning ? macSigningIdentity : null,
    notarize: false,
    hardenedRuntime: shouldEnableMacSigning,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    signIgnore: ['[/\\\\]Contents[/\\\\]Resources[/\\\\]tools([/\\\\]|$)'],
  },
  dmg: {
    size: '1024m',
    background: 'build/dmg_background.png',
    icon: 'build/icon_installer.icns',
    contents: [
      { x: 640, y: 56, type: 'file', path: '.background.tiff' },
      { x: 640, y: 56, type: 'file', path: '.VolumeIcon.icns' },
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  win: {
    target: ['msi'],
    icon: 'build/icon.ico',
    artifactName: buildDesktopArtifactName('win'),
  },
  msi: {
    oneClick: false,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: false,
    shortcutName: desktopProductIdentity.shortcutName,
    upgradeCode: desktopProductIdentity.msiUpgradeCode,
  },
  linux: {
    target: ['AppImage'],
    artifactName: buildDesktopArtifactName('linux'),
    executableName: desktopProductIdentity.linuxExecutableName,
    category: 'Development',
    maintainer: 'Nightfall Security <security@nightfall.dev>',
  },
  publish: {
    provider: 'generic',
    useMultipleRangeRequest: false,
    url: 'http://localhost:8081',
  },
};
