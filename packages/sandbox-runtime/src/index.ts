import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const PACKAGE_NAME = '@nightfall/sandbox-runtime';

export interface SandboxHandle {
  id: string;
  workDir: string;
  createdAt: string;
  maxDurationMs: number;
  destroyed: boolean;
}

export interface TeardownAttestation {
  sandboxId: string;
  createdAt: string;
  destroyedAt: string;
  filesErasedCount: number;
  sha256Attestation: string;
}

export interface CreateSandboxOptions {
  prefix?: string;
  maxDurationMs?: number;
  files?: Record<string, string>;
}

export interface ExecSandboxOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface ExecSandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

const DEFAULT_MAX_DURATION_MS = 60_000;
const SANDBOX_ROOT_DIR_NAME = 'nightfall-sandboxes';

function sanitizePrefix(prefix: string): string {
  const cleaned = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 32) : 'sbx';
}

async function countFilesRecursive(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += await countFilesRecursive(fullPath);
      } else {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function findExistingAncestor(targetPath: string, stopAt: string): Promise<string> {
  let current = targetPath;
  while (current.length >= stopAt.length) {
    try {
      await fs.lstat(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return stopAt;
}

export class DisposableSandboxRuntime {
  private readonly handles = new Map<string, SandboxHandle>();
  private readonly attestations: TeardownAttestation[] = [];
  private readonly attestationsBySandbox = new Map<string, TeardownAttestation>();

  private getActiveHandle(sandboxId: string): SandboxHandle {
    const handle = this.handles.get(sandboxId);
    if (!handle) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    if (handle.destroyed) {
      throw new Error(`Sandbox "${sandboxId}" has already been destroyed.`);
    }
    return handle;
  }

  private async resolveSafePath(handle: SandboxHandle, relPath: string): Promise<string> {
    if (!relPath || relPath.includes('\0')) {
      throw new Error('Invalid sandbox file path.');
    }
    if (path.isAbsolute(relPath)) {
      throw new Error(`Path traversal blocked: absolute path "${relPath}" is not permitted.`);
    }

    const workDirResolved = path.resolve(handle.workDir);
    const targetPath = path.resolve(workDirResolved, relPath);
    const relative = path.relative(workDirResolved, targetPath);

    if (
      relative === '' ||
      relative === '.' ||
      relative.startsWith('..') ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        `Path traversal blocked: "${relPath}" escapes sandbox directory "${workDirResolved}".`,
      );
    }

    const realWorkDir = await fs.realpath(workDirResolved);
    const existingAncestor = await findExistingAncestor(targetPath, workDirResolved);
    const realAncestor = await fs.realpath(existingAncestor);
    const ancestorRel = path.relative(realWorkDir, realAncestor);

    if (ancestorRel.startsWith('..') || path.isAbsolute(ancestorRel)) {
      throw new Error(
        `Symlink escape blocked: "${relPath}" resolves outside sandbox directory.`,
      );
    }

    return targetPath;
  }

  async createSandbox(options?: CreateSandboxOptions): Promise<SandboxHandle> {
    const baseRoot = path.join(os.tmpdir(), SANDBOX_ROOT_DIR_NAME);
    await fs.mkdir(baseRoot, { recursive: true });

    const prefix = sanitizePrefix(options?.prefix ?? 'sbx');
    const id = `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
    const workDir = path.join(baseRoot, id);
    await fs.mkdir(workDir, { recursive: true, mode: 0o700 });

    const handle: SandboxHandle = {
      id,
      workDir,
      createdAt: new Date().toISOString(),
      maxDurationMs: options?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
      destroyed: false,
    };

    this.handles.set(id, handle);

    if (options?.files) {
      try {
        for (const [relPath, content] of Object.entries(options.files)) {
          await this.writeSandboxFile(id, relPath, content);
        }
      } catch (err) {
        await fs.rm(workDir, { recursive: true, force: true });
        this.handles.delete(id);
        throw err;
      }
    }

    return { ...handle };
  }

  async writeSandboxFile(sandboxId: string, relPath: string, content: string): Promise<void> {
    const handle = this.getActiveHandle(sandboxId);
    const safeTarget = await this.resolveSafePath(handle, relPath);
    await fs.mkdir(path.dirname(safeTarget), { recursive: true });
    await fs.writeFile(safeTarget, content, 'utf8');
  }

  async readSandboxFile(sandboxId: string, relPath: string): Promise<string> {
    const handle = this.getActiveHandle(sandboxId);
    const safeTarget = await this.resolveSafePath(handle, relPath);
    const realWorkDir = await fs.realpath(handle.workDir);
    const realTarget = await fs.realpath(safeTarget);
    const relReal = path.relative(realWorkDir, realTarget);
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
      throw new Error(`Symlink escape blocked while reading "${relPath}".`);
    }
    return fs.readFile(realTarget, 'utf8');
  }

  async execInSandbox(
    sandboxId: string,
    command: string,
    args: string[],
    options?: ExecSandboxOptions,
  ): Promise<ExecSandboxResult> {
    const handle = this.getActiveHandle(sandboxId);
    const effectiveTimeoutMs = Math.max(
      1,
      Math.min(options?.timeoutMs ?? handle.maxDurationMs, handle.maxDurationMs),
    );

    const safePath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin';
    const scrubbedEnv: NodeJS.ProcessEnv = {
      PATH: safePath,
      HOME: handle.workDir,
      TMPDIR: handle.workDir,
      LANG: 'C.UTF-8',
      NODE_NO_WARNINGS: '1',
      ...(options?.env ?? {}),
    };

    const startedAt = performance.now();

    return new Promise<ExecSandboxResult>((resolve, reject) => {
      let settled = false;

      const child = execFile(
        command,
        args,
        {
          cwd: handle.workDir,
          env: scrubbedEnv,
          timeout: effectiveTimeoutMs,
          killSignal: 'SIGKILL',
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);

          const durationMs = Math.max(0, Math.round(performance.now() - startedAt));

          if (!error) {
            resolve({
              exitCode: 0,
              stdout: String(stdout),
              stderr: String(stderr),
              durationMs,
            });
            return;
          }

          const execErr = error as NodeJS.ErrnoException & {
            killed?: boolean;
            signal?: NodeJS.Signals | null;
          };

          if (
            execErr.killed ||
            execErr.signal === 'SIGKILL' ||
            execErr.signal === 'SIGTERM' ||
            execErr.code === 'ETIMEDOUT'
          ) {
            reject(new Error(`Sandbox command timed out after ${effectiveTimeoutMs}ms.`));
            return;
          }

          if (typeof execErr.code === 'number') {
            resolve({
              exitCode: execErr.code,
              stdout: String(stdout),
              stderr: String(stderr),
              durationMs,
            });
            return;
          }

          reject(error);
        },
      );

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore if child already exited
        }
        reject(new Error(`Sandbox command timed out after ${effectiveTimeoutMs}ms.`));
      }, effectiveTimeoutMs + 25);
    });
  }

  async destroySandbox(sandboxId: string): Promise<TeardownAttestation> {
    const existingAttestation = this.attestationsBySandbox.get(sandboxId);
    if (existingAttestation) {
      return { ...existingAttestation };
    }

    const handle = this.handles.get(sandboxId);
    if (!handle) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const filesErasedCount = await countFilesRecursive(handle.workDir);
    await fs.rm(handle.workDir, { recursive: true, force: true });

    let stillExists = false;
    try {
      await fs.access(handle.workDir);
      stillExists = true;
    } catch {
      stillExists = false;
    }

    if (stillExists) {
      throw new Error(`Failed to erase sandbox directory: ${handle.workDir}`);
    }

    handle.destroyed = true;
    const destroyedAt = new Date().toISOString();
    const canonicalAttestationPayload = JSON.stringify({
      createdAt: handle.createdAt,
      destroyedAt,
      filesErasedCount,
      sandboxId: handle.id,
      verifiedErased: true,
      workDir: handle.workDir,
    });

    const sha256Attestation = crypto
      .createHash('sha256')
      .update(canonicalAttestationPayload, 'utf8')
      .digest('hex');

    const attestation: TeardownAttestation = {
      sandboxId: handle.id,
      createdAt: handle.createdAt,
      destroyedAt,
      filesErasedCount,
      sha256Attestation,
    };

    this.attestations.push(attestation);
    this.attestationsBySandbox.set(handle.id, attestation);

    return { ...attestation };
  }

  async destroyAll(): Promise<TeardownAttestation[]> {
    const results: TeardownAttestation[] = [];
    for (const [id, handle] of this.handles.entries()) {
      if (!handle.destroyed) {
        results.push(await this.destroySandbox(id));
      }
    }
    return results;
  }

  getAttestations(): TeardownAttestation[] {
    return this.attestations.map((item) => ({ ...item }));
  }
}
