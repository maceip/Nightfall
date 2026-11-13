import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';
import {
  isDebugBuildRequested,
  resolveDesktopProductFlavor,
} from '../../scripts/desktop-product-identity.mjs';

const pkgJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'),
) as { version: string };

function readBuildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: import.meta.dirname,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'local';
  }
}

export function resolveDesktopTsupBundleSecurityOptions(
  runtimeEnv: Record<string, string | undefined> = process.env,
) {
  const isProduction = runtimeEnv.NODE_ENV === 'production';
  const isDebugBuild = isDebugBuildRequested(runtimeEnv);
  return {
    keepNames: true,
    minify: isProduction && !isDebugBuild,
    sourcemap: isDebugBuild || !isProduction,
  };
}

export function applyDesktopTsupEsbuildSecurityOptions(options: {
  chunkNames?: string;
  legalComments?: 'none' | 'inline' | 'eof' | 'linked' | 'external';
}) {
  options.legalComments = 'none';
}

const bundleSecurityOptions = resolveDesktopTsupBundleSecurityOptions();
const productFlavor = resolveDesktopProductFlavor(process.env);
const debugBuild = isDebugBuildRequested(process.env);

function createSharedDefines() {
  return {
    __NIGHTFALL_VERSION__: JSON.stringify(pkgJson.version),
    __NIGHTFALL_COMMIT__: JSON.stringify(readBuildCommit()),
    __NIGHTFALL_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __NIGHTFALL_PRODUCT_FLAVOR__: JSON.stringify(productFlavor),
    __NIGHTFALL_DEBUG_BUILD__: JSON.stringify(debugBuild),
  };
}

const desktopNodeRuntimeExternals = [
  'electron',
  'ws',
];

export default defineConfig([
  {
    name: 'main',
    entry: {
      'main/index': 'electron/main.ts',
    },
    outDir: 'out',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    external: desktopNodeRuntimeExternals,
    noExternal: [
      '@nightfall/api-gateway',
      '@nightfall/closed-loop-orchestrator',
      '@nightfall/red-team',
      '@nightfall/defense-factory',
      '@nightfall/sandbox-runtime',
      '@nightfall/policy-gate',
      '@nightfall/shared-memory',
      '@nightfall/audit-ledger',
      '@nightfall/model-gateway',
      '@nightfall/core-contracts',
    ],
    define: createSharedDefines(),
    esbuildOptions(options) {
      applyDesktopTsupEsbuildSecurityOptions(options);
      options.chunkNames = 'main/chunk-[hash]';
    },
    ...bundleSecurityOptions,
  },
  {
    name: 'preload',
    entry: {
      'preload/index': 'electron/preload.ts',
    },
    outDir: 'out',
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    external: ['electron'],
    outExtension: () => ({ js: '.cjs' }),
    define: createSharedDefines(),
    esbuildOptions(options) {
      applyDesktopTsupEsbuildSecurityOptions(options);
    },
    ...bundleSecurityOptions,
  },
]);
