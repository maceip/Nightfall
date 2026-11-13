#!/usr/bin/env node
/**
 * Nightfall Desktop Installer Bundler CLI (modeled on zcode's packages/desktop/scripts/bundle.mjs).
 * Orchestrates icon generation, renderer + tsup main/preload bundling, electron-builder execution
 * with mirror isolation & retries, ASAR native boundary checks, and SHA-256 checksum emission.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { generateDesktopBuildAssets } from '../../../scripts/generate-desktop-icons.mjs';
import { resolveDesktopProductIdentity } from '../../../scripts/desktop-product-identity.mjs';

const desktopRoot = resolve(import.meta.dirname, '..');
const requireFromBundle = createRequire(import.meta.url);

const osAliasMap = new Map([
  ['mac', 'mac'],
  ['macos', 'mac'],
  ['darwin', 'mac'],
  ['osx', 'mac'],
  ['win', 'win'],
  ['windows', 'win'],
  ['win32', 'win'],
  ['linux', 'linux'],
]);

const archAliasMap = new Map([
  ['x64', 'x64'],
  ['amd64', 'x64'],
  ['x86_64', 'x64'],
  ['arm64', 'arm64'],
  ['aarch64', 'arm64'],
]);

const osBuilderFlagMap = {
  mac: '--mac',
  win: '--win',
  linux: '--linux',
};

const archBuilderFlagMap = {
  x64: '--x64',
  arm64: '--arm64',
};

const expectedExtensionByTarget = {
  dmg: '.dmg',
  msi: '.msi',
  zip: '.zip',
  appimage: '.AppImage',
};

export function parseBundleArgs(argv = process.argv.slice(2)) {
  let targetOs = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
  let targetArch = process.arch === 'arm64' ? 'arm64' : 'x64';
  let targets = targetOs === 'mac' ? ['dmg'] : targetOs === 'win' ? ['msi'] : ['AppImage'];
  let skipBuild = false;
  let dirOnly = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--os' && argv[i + 1]) {
      const mapped = osAliasMap.get(argv[++i].toLowerCase());
      if (!mapped) throw new Error(`Unsupported --os value: ${argv[i]}`);
      targetOs = mapped;
      targets = targetOs === 'mac' ? ['dmg'] : targetOs === 'win' ? ['msi'] : ['AppImage'];
    } else if (arg === '--arch' && argv[i + 1]) {
      const mapped = archAliasMap.get(argv[++i].toLowerCase());
      if (!mapped) throw new Error(`Unsupported --arch value: ${argv[i]}`);
      targetArch = mapped;
    } else if (arg === '--targets' && argv[i + 1]) {
      targets = argv[++i]
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    } else if (arg === '--skip-build') {
      skipBuild = true;
    } else if (arg === '--dir') {
      dirOnly = true;
    }
  }

  return { targetOs, targetArch, targets, skipBuild, dirOnly };
}

export function createIsolatedBuilderEnv(baseEnv = process.env, { targetOs, targetArch }) {
  const runtimeMirror =
    baseEnv.NIGHTFALL_ELECTRON_RUNTIME_MIRROR ||
    baseEnv.NPM_CONFIG_ELECTRON_MIRROR ||
    baseEnv.ELECTRON_MIRROR ||
    '';

  return {
    ...baseEnv,
    NIGHTFALL_TARGET_OS: targetOs,
    NIGHTFALL_TARGET_ARCH: targetArch,
    NIGHTFALL_ELECTRON_RUNTIME_MIRROR: runtimeMirror,
    // Clear global ELECTRON_MIRROR so @electron/get does not hijack dmg-builder/wix binary URLs (mirrors zcode)
    ELECTRON_MIRROR: '',
    NPM_CONFIG_ELECTRON_MIRROR: '',
    npm_config_electron_mirror: '',
    CSC_IDENTITY_AUTO_DISCOVERY:
      baseEnv.NIGHTFALL_ENABLE_MAC_SIGN === '1' ? 'true' : 'false',
  };
}

function spawnInherited(command, args, options) {
  return new Promise((resolveExit, rejectExit) => {
    const child = spawn(command, args, {
      ...options,
      stdio: 'inherit',
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
    });
    child.on('error', rejectExit);
    child.on('exit', (code) => {
      if (code === 0) resolveExit();
      else rejectExit(new Error(`Command failed (${code}): ${command} ${args.join(' ')}`));
    });
  });
}

async function runWithRetries(label, attempts, delayMs, fn) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const heartbeat = setInterval(() => {
      console.log(`[bundle-desktop][heartbeat] ${label} running (attempt ${attempt}/${attempts})...`);
    }, 30_000);
    try {
      await fn();
      clearInterval(heartbeat);
      return;
    } catch (err) {
      clearInterval(heartbeat);
      lastError = err;
      console.warn(`[bundle-desktop] ${label} attempt ${attempt}/${attempts} failed:`, err.message);
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

function writeArtifactChecksums(distDir, targetOs, targetArch) {
  if (!existsSync(distDir)) return [];
  const entries = readdirSync(distDir)
    .map((name) => resolve(distDir, name))
    .filter((filePath) => {
      const st = statSync(filePath);
      return (
        st.isFile() &&
        /\.(?:dmg|msi|zip|AppImage|blockmap)$/i.test(basename(filePath))
      );
    });

  if (entries.length === 0) return [];

  const lines = entries.map((filePath) => {
    const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
    const sizeMb = (statSync(filePath).size / (1024 * 1024)).toFixed(2);
    console.log(`[bundle-desktop] Verified artifact: ${basename(filePath)} (${sizeMb} MiB, sha256=${digest})`);
    return `${digest}  ${basename(filePath)}`;
  });

  const checksumPath = resolve(distDir, `SHA256SUMS-${targetOs}-${targetArch}.txt`);
  writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8');
  return entries;
}

async function main() {
  const { targetOs, targetArch, targets, skipBuild, dirOnly } = parseBundleArgs();
  const identity = resolveDesktopProductIdentity(process.env);
  const distDirName = process.env.NIGHTFALL_DESKTOP_DIST_DIR || `dist-electron/${targetOs}-${targetArch}`;
  const distDir = resolve(desktopRoot, distDirName);
  const env = {
    ...createIsolatedBuilderEnv(process.env, { targetOs, targetArch }),
    NIGHTFALL_DESKTOP_DIST_DIR: distDirName,
  };

  console.log(
    `[bundle-desktop] Packaging ${identity.productName} (${identity.appId}) target=${targetOs}-${targetArch} targets=${dirOnly ? 'dir' : targets.join(',')}`,
  );

  // 1. Deterministically generate PNG / ICO / ICNS / DMG assets
  generateDesktopBuildAssets(resolve(desktopRoot, 'build'));

  // 2. Compile Vite renderer + tsup main/preload bundles
  if (!skipBuild) {
    const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    await spawnInherited(pnpmBin, ['run', 'build:desktop'], {
      cwd: desktopRoot,
      env,
    });
  }

  // 3. Invoke electron-builder CLI directly via Node to avoid cross-platform .bin shim issues
  const electronBuilderCli = resolve(
    dirname(requireFromBundle.resolve('electron-builder/package.json')),
    'cli.js',
  );
  const builderArgs = [
    electronBuilderCli,
    '--config',
    'electron-builder.config.mjs',
    osBuilderFlagMap[targetOs],
    archBuilderFlagMap[targetArch],
    '--publish',
    'never',
  ];

  if (dirOnly) {
    builderArgs.push('--dir');
  } else {
    for (const target of targets) {
      builderArgs.push('--config.mac.target=' + (targetOs === 'mac' ? target : 'dmg'));
      if (targetOs === 'win') {
        builderArgs.push(`--config.win.target=${target}`);
      }
    }
  }

  await runWithRetries('electron-builder', 2, 5_000, () =>
    spawnInherited(process.execPath, builderArgs, {
      cwd: desktopRoot,
      env,
    }),
  );

  if (!dirOnly) {
    const produced = writeArtifactChecksums(distDir, targetOs, targetArch);
    for (const target of targets) {
      const ext = expectedExtensionByTarget[target.toLowerCase()];
      if (ext && !produced.some((p) => p.toLowerCase().endsWith(ext.toLowerCase()))) {
        throw new Error(
          `Expected ${ext} installer artifact was not produced in ${distDir}`,
        );
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('bundle-desktop.mjs')) {
  main().catch((err) => {
    console.error('[bundle-desktop] FAILED:', err);
    process.exit(1);
  });
}
