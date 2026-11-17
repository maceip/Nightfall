import { execFileSync } from 'node:child_process';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ScorecardToolchainStatusSchema,
  type ScorecardServiceMode,
  type ScorecardToolchainStatus,
} from '@nightfall/core-contracts';

export const PACKAGE_NAME = '@nightfall/scorecard';
export const SCORECARD_UPSTREAM_REPO = 'https://github.com/ossf/scorecard' as const;
export const SCORECARD_PINNED_COMMIT = '6eb56f6a7e62d8f5d55800f54cd92ea305107d1d' as const;

const versionCache = new Map<string, { mtimeMs: number; version: string | null }>();

function isExecutableFileSync(filePath: string): boolean {
  try {
    const stat = fsSync.statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }
    if (process.platform !== 'win32') {
      fsSync.accessSync(filePath, fsSync.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function resolveVendoredScorecardDir(explicitVendoredDir?: string): string {
  if (explicitVendoredDir) {
    return explicitVendoredDir;
  }
  try {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const monorepoCandidate = path.resolve(thisDir, '..', '..', '..', 'vendor', 'scorecard');
    if (fsSync.existsSync(monorepoCandidate)) {
      return monorepoCandidate;
    }
  } catch {
    // Bundled CJS/ESM context fallback
  }
  const cwdCandidate = path.resolve(process.cwd(), 'vendor', 'scorecard');
  if (fsSync.existsSync(cwdCandidate)) {
    return cwdCandidate;
  }
  return 'vendor/scorecard';
}

function probeScorecardVersionSync(binaryPath: string): string | null {
  try {
    const stat = fsSync.statSync(binaryPath);
    const cached = versionCache.get(binaryPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.version;
    }
    const raw = execFileSync(binaryPath, ['version', '--json'], {
      encoding: 'utf8',
      timeout: 3_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(raw) as { gitVersion?: string };
    const version =
      typeof parsed.gitVersion === 'string' && parsed.gitVersion.trim()
        ? parsed.gitVersion.trim()
        : 'v5.6.0-nightfall';
    versionCache.set(binaryPath, { mtimeMs: stat.mtimeMs, version });
    return version;
  } catch {
    return 'v5.6.0-nightfall';
  }
}

export interface DiscoverScorecardToolchainOptions {
  binDir?: string;
  serviceMode?: ScorecardServiceMode;
  daemonUrl?: string | null;
  vendoredRootDir?: string;
}

export function discoverScorecardToolchainSync(
  options?: DiscoverScorecardToolchainOptions,
): ScorecardToolchainStatus {
  const exeSuffix = process.platform === 'win32' ? '.exe' : '';
  const exeNames = [`nightfall-scorecard${exeSuffix}`, `scorecard${exeSuffix}`];
  const vendoredPath = resolveVendoredScorecardDir(options?.vendoredRootDir);

  const candidateDirs: string[] = [];
  if (options?.binDir) {
    candidateDirs.push(options.binDir);
  }
  if (process.env.NIGHTFALL_SCORECARD_BIN_DIR) {
    candidateDirs.push(process.env.NIGHTFALL_SCORECARD_BIN_DIR);
  }
  candidateDirs.push(
    path.join(os.homedir(), '.local', 'share', 'nightfall', 'scorecard', 'bin'),
    '/opt/nightfall/scorecard/bin',
  );
  if (path.isAbsolute(vendoredPath)) {
    candidateDirs.push(path.join(vendoredPath, 'bin'));
  }
  if (process.env.PATH) {
    for (const entry of process.env.PATH.split(path.delimiter)) {
      if (entry.trim()) {
        candidateDirs.push(entry.trim());
      }
    }
  }

  for (const dir of candidateDirs) {
    for (const exeName of exeNames) {
      const candidatePath = path.join(dir, exeName);
      if (isExecutableFileSync(candidatePath)) {
        const version = probeScorecardVersionSync(candidatePath);
        const mode: ScorecardServiceMode =
          options?.serviceMode ?? (options?.daemonUrl ? 'daemon-http' : 'cli-oneshot');
        return ScorecardToolchainStatusSchema.parse({
          available: true,
          binDir: dir,
          binaryPath: candidatePath,
          serviceMode: mode,
          daemonUrl: options?.daemonUrl ?? null,
          version,
          vendoredPath,
          upstreamRepo: SCORECARD_UPSTREAM_REPO,
          pinnedCommit: SCORECARD_PINNED_COMMIT,
        });
      }
    }
  }

  return ScorecardToolchainStatusSchema.parse({
    available: false,
    binDir: null,
    binaryPath: null,
    serviceMode: 'unavailable',
    daemonUrl: null,
    version: null,
    vendoredPath,
    upstreamRepo: SCORECARD_UPSTREAM_REPO,
    pinnedCommit: SCORECARD_PINNED_COMMIT,
  });
}
