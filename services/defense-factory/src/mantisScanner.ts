import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  CODENAV_PINNED_COMMIT,
  FNAUDIT_PINNED_COMMIT,
  FindingRecordSchema,
  MANTIS_REFERENCE_PIPELINE_STAGES,
  MANTIS_UPSTREAM_REPO,
  MantisToolchainStatusSchema,
  type FindingRecord,
  type MantisToolchainStatus,
} from '@nightfall/core-contracts';
import { RootCauseDeduplicator } from './deduplicator.js';

const execFileAsync = promisify(execFile);

/** Where the Mantis engine lives in this monorepo (services/mantis-engine/reference). */
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export function resolveDefaultMantisEngineDir(): string {
  const candidates = [
    process.env.NIGHTFALL_MANTIS_ENGINE_DIR,
    path.resolve(MODULE_DIR, '../../mantis-engine/reference'),
    path.resolve(MODULE_DIR, '../../../services/mantis-engine/reference'),
    path.resolve(process.cwd(), 'services/mantis-engine/reference'),
    path.resolve(process.cwd(), '../../services/mantis-engine/reference'),
  ].filter((c): c is string => Boolean(c && c.trim()));

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (existsSync(path.join(resolved, 'nightfall_bridge.py'))) {
      return resolved;
    }
  }
  return path.resolve(MODULE_DIR, '../../mantis-engine/reference');
}

export const DEFAULT_MANTIS_ENGINE_DIR = resolveDefaultMantisEngineDir();

export function resolveDefaultMantisPython(engineDir: string = DEFAULT_MANTIS_ENGINE_DIR): string {
  if (process.env.NIGHTFALL_MANTIS_PYTHON?.trim()) {
    return process.env.NIGHTFALL_MANTIS_PYTHON.trim();
  }
  const localVenvCandidates = [
    path.join(engineDir, '.venv', 'bin', 'python'),
    path.join(os.homedir(), '.local', 'share', 'nightfall', 'mantis-venv', 'bin', 'python'),
  ];
  for (const candidate of localVenvCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return 'python3';
}

export function resolveDefaultCodenavBinary(): string | null {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    process.env.NIGHTFALL_CODENAV_BIN,
    process.env.NIGHTFALL_CODENAV_BIN_DIR
      ? path.join(process.env.NIGHTFALL_CODENAV_BIN_DIR, `codenav${ext}`)
      : undefined,
    path.join(os.homedir(), '.local', 'share', 'nightfall', 'codenav', 'bin', `codenav${ext}`),
    path.resolve(MODULE_DIR, `../../../vendor/codenav/bin/codenav${ext}`),
    path.resolve(process.cwd(), `vendor/codenav/bin/codenav${ext}`),
  ].filter((c): c is string => Boolean(c && c.trim()));

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

export function discoverMantisToolchainSync(deps?: {
  pythonExecutable?: string;
  engineDir?: string;
}): MantisToolchainStatus {
  const engineDir = path.resolve(deps?.engineDir ?? resolveDefaultMantisEngineDir());
  const bridgeScriptPath = path.join(engineDir, 'nightfall_bridge.py');
  const runtimeDir = path.join(engineDir, 'mantis_runtime');
  const pythonExecutable = deps?.pythonExecutable ?? resolveDefaultMantisPython(engineDir);
  const available = existsSync(bridgeScriptPath) && existsSync(runtimeDir);
  const fnauditAvailable =
    existsSync(path.join(engineDir, 'third_party', 'fnaudit', 'db.py')) &&
    existsSync(path.join(engineDir, 'tools', 'function_audit_tools.py'));
  const codenavBinaryPath = resolveDefaultCodenavBinary();
  const codenavAvailable = codenavBinaryPath !== null;
  return MantisToolchainStatusSchema.parse({
    available,
    engineDir,
    bridgeScriptPath,
    pythonExecutable,
    runtimeFlavor: 'mantis_runtime',
    sandboxMode: 'static-only',
    upstreamRepo: MANTIS_UPSTREAM_REPO,
    stageCount: MANTIS_REFERENCE_PIPELINE_STAGES.length,
    fnauditAvailable,
    fnauditPinnedCommit: FNAUDIT_PINNED_COMMIT,
    codenavAvailable,
    codenavBinaryPath,
    codenavPinnedCommit: CODENAV_PINNED_COMMIT,
    evidenceGateEnabled: available,
  });
}

const MANTIS_EXPORT_FORMAT = 'mantis-nightfall/v1';

/** What nightfall_bridge.py prints: FindingRecords without the owner, which Nightfall resolves. */
const MantisExportSchema = z.object({
  format: z.literal(MANTIS_EXPORT_FORMAT),
  runId: z.string().nullable(),
  repository: z.string(),
  observedRevision: z.string(),
  findings: z.array(FindingRecordSchema.omit({ owner: true })),
  mantisExitCode: z.number().int().optional(),
});
export type MantisExport = z.infer<typeof MantisExportSchema>;

export interface MantisScannerDeps {
  /** Python with Mantis's requirements installed. Default: $NIGHTFALL_MANTIS_PYTHON, else python3. */
  pythonExecutable?: string;
  engineDir?: string;
  deduplicator?: RootCauseDeduplicator;
}

export interface MantisScanInput {
  repository: string;
  localPath: string;
  /** Mantis knowledge database. Default: a fresh one in a temporary directory, removed afterwards. */
  dbPath?: string;
  observedRevision?: string;
  /**
   * Mantis's static modes only. Mantis reasons over the code; dynamic execution and
   * proofs stay in Nightfall's EgressPolicyProxy / RedTeamEngine and the LiteBox
   * DisposableSandboxRuntime, never in a Mantis-managed sandbox.
   */
  sandbox?: 'static-only' | 'static';
  model?: string;
  /** Further Mantis CLI options, passed through unchanged. */
  extraArgs?: string[];
  timeoutMs?: number;
}

export interface MantisExportInput {
  repository: string;
  dbPath: string;
  observedRevision: string;
  runId?: string;
  /**
   * The directory the run scanned. A database can hold runs over several
   * repositories: with this set, "latest" means the latest run over this
   * directory, and a runId over another directory is refused.
   */
  targetPath?: string;
}

export interface MantisScanResult {
  repository: string;
  scannedPath: string;
  observedRevision: string;
  runId: string | null;
  /** Nonzero when Mantis paused on a budget or a campaign failed: findings are kept, coverage may be partial. */
  mantisExitCode: number;
  findings: FindingRecord[];
}

/** --sandbox, -s, or any prefix argparse would expand to --sandbox (--sand, --sandbox=...). */
function isSandboxFlag(arg: string): boolean {
  const flag = arg.split('=', 1)[0] ?? arg;
  if (flag === '-s' || /^-s[^-]/.test(arg)) return true;
  return flag.length >= 3 && flag.startsWith('--') && '--sandbox'.startsWith(flag);
}

function repoShortName(repository: string): string {
  const parts = repository.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? repository;
}

async function gitShortHead(dirPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dirPath, 'rev-parse', '--short', 'HEAD'], {
      timeout: 5_000,
    });
    const rev = stdout.trim();
    return /^[0-9a-f]{7,40}$/i.test(rev) ? rev.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Runs the Mantis engine (an LLM-driven security review pipeline in Python) as a
 * subprocess and returns its findings as Nightfall FindingRecords, alongside the
 * pattern-based RepositoryScanner.
 */
export class MantisScanner {
  private readonly python: string;
  private readonly engineDir: string;
  private readonly deduplicator: RootCauseDeduplicator;

  constructor(deps?: MantisScannerDeps) {
    this.engineDir = deps?.engineDir ?? resolveDefaultMantisEngineDir();
    this.python = deps?.pythonExecutable ?? resolveDefaultMantisPython(this.engineDir);
    this.deduplicator = deps?.deduplicator ?? new RootCauseDeduplicator();
  }

  getToolchainStatus(): MantisToolchainStatus {
    return discoverMantisToolchainSync({
      pythonExecutable: this.python,
      engineDir: this.engineDir,
    });
  }

  /** Reads one recorded Mantis run (the latest when runId is omitted). */
  async exportRun(input: MantisExportInput): Promise<FindingRecord[]> {
    const shortRepo = repoShortName(input.repository);
    const args = [
      'export',
      '--db', input.dbPath,
      '--repository', shortRepo,
      '--revision', input.observedRevision,
      ...(input.runId ? ['--run-id', input.runId] : []),
      ...(input.targetPath ? ['--target', path.resolve(input.targetPath)] : []),
    ];
    const doc = await this.runBridge(args, 60_000);
    return this.toFindingRecords(input.repository, doc);
  }

  /** Runs a full Mantis review of a local directory and returns what it found. */
  async scanRepository(input: MantisScanInput): Promise<MantisScanResult> {
    const targetDir = path.resolve(input.localPath);
    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) {
      throw new Error(`Target repository path is not a directory: ${targetDir}`);
    }
    const observedRevision = input.observedRevision ?? (await gitShortHead(targetDir)) ?? 'unversioned';
    const shortRepo = repoShortName(input.repository);

    let tempDir: string | null = null;
    let dbPath = input.dbPath;
    if (!dbPath) {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-mantis-'));
      dbPath = path.join(tempDir, 'mantis.db');
    }
    try {
      const sandbox = input.sandbox ?? 'static-only';
      if (sandbox !== 'static-only' && sandbox !== 'static') {
        throw new Error(`Mantis may only run static sandbox modes inside Nightfall, got "${String(sandbox)}"`);
      }
      const extraArgs = input.extraArgs ?? [];
      if (extraArgs.some(isSandboxFlag)) {
        throw new Error('Pass the Mantis sandbox through `sandbox`, not extraArgs');
      }
      // The sandbox goes last: with argparse the last occurrence wins, so nothing
      // earlier on the command line can move Mantis off a static mode.
      const mantisArgs = [
        ...(input.model ? ['--model', input.model] : []),
        ...extraArgs,
        '--sandbox', sandbox,
      ];
      const doc = await this.runBridge(
        [
          'scan',
          '--db', dbPath,
          '--repository', shortRepo,
          '--revision', observedRevision,
          '--target', targetDir,
          '--',
          ...mantisArgs,
        ],
        input.timeoutMs ?? 6 * 60 * 60 * 1000,
      );
      return {
        repository: shortRepo,
        scannedPath: targetDir,
        observedRevision,
        runId: doc.runId,
        mantisExitCode: doc.mantisExitCode ?? 0,
        findings: this.toFindingRecords(input.repository, doc),
      };
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  }

  private toFindingRecords(repository: string, doc: MantisExport): FindingRecord[] {
    const shortRepo = repoShortName(repository);
    const owner = this.deduplicator.resolveCodeOwner(
      shortRepo,
      this.deduplicator.resolveCodeOwner(repository),
    );
    return doc.findings.map((finding) => FindingRecordSchema.parse({ ...finding, owner }));
  }

  private async runBridge(args: string[], timeoutMs: number): Promise<MantisExport> {
    const script = path.join(this.engineDir, 'nightfall_bridge.py');
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(this.python, [script, ...args], {
        cwd: this.engineDir,
        timeout: timeoutMs,
        maxBuffer: 256 * 1024 * 1024,
      }));
    } catch (error) {
      const err = error as { stderr?: string; message?: string };
      const detail = (err.stderr ?? '').trim().split('\n').slice(-20).join('\n');
      throw new Error(`Mantis bridge failed (${args[0]}): ${detail || err.message}`);
    }
    const lastLine = stdout.trim().split('\n').pop() ?? '';
    return MantisExportSchema.parse(JSON.parse(lastLine));
  }
}
