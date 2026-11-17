import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import { FindingRecordSchema, type FindingRecord } from '@nightfall/core-contracts';
import { RootCauseDeduplicator } from './deduplicator.js';

const execFileAsync = promisify(execFile);

/** Where the Mantis engine lives in this monorepo (services/mantis-engine/reference). */
export const DEFAULT_MANTIS_ENGINE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../mantis-engine/reference',
);

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
   * Mantis's own sandbox. Default 'static-only': Mantis reasons over the code and
   * Nightfall runs dynamic proofs in its LiteBox sandbox runtime.
   */
  sandbox?: 'static-only' | 'static' | 'gvisor' | 'microsandbox' | 'gce' | 'remote';
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
}

export interface MantisScanResult {
  repository: string;
  scannedPath: string;
  observedRevision: string;
  runId: string | null;
  mantisExitCode: number;
  findings: FindingRecord[];
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
    this.python = deps?.pythonExecutable ?? process.env.NIGHTFALL_MANTIS_PYTHON ?? 'python3';
    this.engineDir = deps?.engineDir ?? DEFAULT_MANTIS_ENGINE_DIR;
    this.deduplicator = deps?.deduplicator ?? new RootCauseDeduplicator();
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
      const mantisArgs = [
        '--sandbox', input.sandbox ?? 'static-only',
        ...(input.model ? ['--model', input.model] : []),
        ...(input.extraArgs ?? []),
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
