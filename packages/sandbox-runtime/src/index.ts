import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const PACKAGE_NAME = '@nightfall/sandbox-runtime';
export const LITEBOX_UPSTREAM_REPO = 'https://github.com/microsoft/litebox' as const;
export const LITEBOX_PINNED_COMMIT = 'cd8de54b09667c78f6a4ce1f4b0d6a15f7c97fcb' as const;

export type LiteBoxNorthShim = 'litebox_shim_linux' | 'litebox_shim_optee';
export type LiteBoxSouthPlatform =
  | 'linux_userland'
  | 'windows_userland'
  | 'sev_snp'
  | 'lvbs';

export type SandboxExecutionMode =
  | 'litebox-preferred'
  | 'litebox-strict'
  | 'process-confined';

export type SandboxBackendKind = 'microsoft-litebox' | 'process-confined';

export interface LiteBoxToolchainStatus {
  available: boolean;
  binDir: string | null;
  runnerBinaryPath: string | null;
  packagerBinaryPath: string | null;
  syscallRewriterBinaryPath: string | null;
  pythonStdlibZipPath: string | null;
  northShim: LiteBoxNorthShim;
  southPlatform: LiteBoxSouthPlatform;
  upstreamRepo: typeof LITEBOX_UPSTREAM_REPO;
  pinnedCommit: typeof LITEBOX_PINNED_COMMIT;
}

export interface SandboxRuntimeConfig {
  defaultMode?: SandboxExecutionMode;
  northShim?: LiteBoxNorthShim;
  southPlatform?: LiteBoxSouthPlatform;
  liteboxBinDir?: string;
}

export interface SandboxHandle {
  id: string;
  workDir: string;
  createdAt: string;
  maxDurationMs: number;
  destroyed: boolean;
  executionMode: SandboxExecutionMode;
  northShim: LiteBoxNorthShim;
  southPlatform: LiteBoxSouthPlatform;
  liteboxAvailable: boolean;
  tunDeviceName?: string;
}

export interface TeardownAttestation {
  sandboxId: string;
  createdAt: string;
  destroyedAt: string;
  filesErasedCount: number;
  tarBundlesErasedCount: number;
  backend: SandboxBackendKind;
  northShim: LiteBoxNorthShim;
  southPlatform: LiteBoxSouthPlatform;
  sha256Attestation: string;
}

export interface CreateSandboxOptions {
  prefix?: string;
  maxDurationMs?: number;
  files?: Record<string, string>;
  executionMode?: SandboxExecutionMode;
  tunDeviceName?: string;
}

export interface ExecSandboxOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
  mode?: SandboxExecutionMode;
  tunDeviceName?: string;
}

export interface ExecSandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  backendUsed: SandboxBackendKind;
  northShim: LiteBoxNorthShim;
  southPlatform: LiteBoxSouthPlatform;
}

export interface LiteBoxInvocationSpec {
  runnerBinary: string;
  runnerArgs: string[];
  northShim: LiteBoxNorthShim;
  southPlatform: LiteBoxSouthPlatform;
}

interface InternalSandboxState {
  handle: SandboxHandle;
  lastBackendUsed: SandboxBackendKind | null;
  tarBundlesCreated: number;
}

const DEFAULT_MAX_DURATION_MS = 60_000;
const SANDBOX_ROOT_DIR_NAME = 'nightfall-sandboxes';

function defaultSouthPlatform(): LiteBoxSouthPlatform {
  return process.platform === 'win32' ? 'windows_userland' : 'linux_userland';
}

function runnerExecutableName(south: LiteBoxSouthPlatform): string {
  switch (south) {
    case 'windows_userland':
      return 'litebox_runner_linux_on_windows_userland.exe';
    case 'sev_snp':
      return 'litebox_runner_snp';
    case 'lvbs':
      return 'litebox_runner_lvbs';
    case 'linux_userland':
    default:
      return 'litebox_runner_linux_userland';
  }
}

function isExecutableFileSync(filePath: string): boolean {
  try {
    const stat = fsSync.statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }
    fsSync.accessSync(filePath, fsSync.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function discoverLiteBoxToolchainSync(options?: {
  binDir?: string;
  northShim?: LiteBoxNorthShim;
  southPlatform?: LiteBoxSouthPlatform;
}): LiteBoxToolchainStatus {
  const northShim = options?.northShim ?? 'litebox_shim_linux';
  const southPlatform = options?.southPlatform ?? defaultSouthPlatform();
  const exeSuffix = process.platform === 'win32' ? '.exe' : '';
  const runnerName = runnerExecutableName(southPlatform);
  const packagerName = `litebox_packager${exeSuffix}`;
  const rewriterName = `litebox_syscall_rewriter${exeSuffix}`;

  const candidateDirs: string[] = [];
  if (options?.binDir) {
    candidateDirs.push(options.binDir);
  }
  if (process.env.NIGHTFALL_LITEBOX_BIN_DIR) {
    candidateDirs.push(process.env.NIGHTFALL_LITEBOX_BIN_DIR);
  }
  candidateDirs.push(
    path.join(os.homedir(), '.local', 'share', 'nightfall', 'litebox', 'bin'),
    '/opt/nightfall/litebox/bin',
  );
  if (process.env.PATH) {
    for (const entry of process.env.PATH.split(path.delimiter)) {
      if (entry.trim()) {
        candidateDirs.push(entry.trim());
      }
    }
  }

  for (const dir of candidateDirs) {
    const runnerPath = path.join(dir, runnerName);
    const packagerPath = path.join(dir, packagerName);
    const rewriterPath = path.join(dir, rewriterName);

    if (
      isExecutableFileSync(runnerPath) &&
      isExecutableFileSync(packagerPath) &&
      isExecutableFileSync(rewriterPath)
    ) {
      const stdlibCandidates = [
        process.env.NIGHTFALL_LITEBOX_PYTHON_STDLIB_ZIP,
        path.resolve(dir, '..', 'share', 'python311.zip'),
        '/opt/nightfall/litebox/share/python311.zip',
      ].filter((item): item is string => Boolean(item));

      let pythonStdlibZipPath: string | null = null;
      for (const candidate of stdlibCandidates) {
        if (fsSync.existsSync(candidate)) {
          pythonStdlibZipPath = candidate;
          break;
        }
      }

      return {
        available: true,
        binDir: dir,
        runnerBinaryPath: runnerPath,
        packagerBinaryPath: packagerPath,
        syscallRewriterBinaryPath: rewriterPath,
        pythonStdlibZipPath,
        northShim,
        southPlatform,
        upstreamRepo: LITEBOX_UPSTREAM_REPO,
        pinnedCommit: LITEBOX_PINNED_COMMIT,
      };
    }
  }

  return {
    available: false,
    binDir: null,
    runnerBinaryPath: null,
    packagerBinaryPath: null,
    syscallRewriterBinaryPath: null,
    pythonStdlibZipPath: null,
    northShim,
    southPlatform,
    upstreamRepo: LITEBOX_UPSTREAM_REPO,
    pinnedCommit: LITEBOX_PINNED_COMMIT,
  };
}

export function buildLiteBoxRunnerInvocation(params: {
  toolchain: Pick<
    LiteBoxToolchainStatus,
    'runnerBinaryPath' | 'northShim' | 'southPlatform'
  >;
  tarBundlePath: string;
  guestProgramPath: string;
  guestArgs: string[];
  env: Record<string, string>;
  tunDeviceName?: string;
}): LiteBoxInvocationSpec {
  if (!params.toolchain.runnerBinaryPath) {
    throw new Error('Microsoft LiteBox runner binary path is not configured.');
  }
  if (!params.guestProgramPath.startsWith('/')) {
    throw new Error(
      `LiteBox --program-from-tar requires an absolute guest binary path, got "${params.guestProgramPath}".`,
    );
  }

  // Note: --forward-env is intentionally omitted so ambient host secrets never enter LiteBox.
  const runnerArgs: string[] = ['--unstable'];

  const mergedEnv: Record<string, string> = {
    LD_LIBRARY_PATH: '/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu:/lib64:/lib32:/lib',
    HOME: '/sandbox',
    TMPDIR: '/tmp',
    LANG: 'C.UTF-8',
    ...params.env,
  };

  for (const [key, value] of Object.entries(mergedEnv)) {
    runnerArgs.push('--env', `${key}=${value}`);
  }

  if (params.tunDeviceName) {
    runnerArgs.push('--tun-device-name', params.tunDeviceName);
  }

  runnerArgs.push(
    '--initial-files',
    params.tarBundlePath,
    '--program-from-tar',
    params.guestProgramPath,
    ...params.guestArgs,
  );

  return {
    runnerBinary: params.toolchain.runnerBinaryPath,
    runnerArgs,
    northShim: params.toolchain.northShim,
    southPlatform: params.toolchain.southPlatform,
  };
}

function sanitizePrefix(prefix: string): string {
  const cleaned = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 32) : 'sbx';
}

async function listFilesRecursive(dirPath: string, baseDir = dirPath): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await listFilesRecursive(fullPath, baseDir)));
      } else if (entry.isFile()) {
        results.push(path.relative(baseDir, fullPath));
      }
    }
    return results;
  } catch {
    return [];
  }
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

function resolveHostElfBinary(command: string): string | null {
  if (path.isAbsolute(command)) {
    return isExecutableFileSync(command) ? command : null;
  }

  const searchDirs = (process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin')
    .split(path.delimiter)
    .filter(Boolean);

  for (const dir of searchDirs) {
    const candidate = path.join(dir, command);
    if (isExecutableFileSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isMultiThreadedV8Runtime(binaryPath: string): boolean {
  const base = path.basename(binaryPath).toLowerCase();
  return base === 'node' || base === 'nodejs' || base === 'node.exe';
}

function isPythonBinary(binaryPath: string): boolean {
  const base = path.basename(binaryPath).toLowerCase();
  return base === 'python3' || base === 'python' || /^python3\.\d+$/.test(base);
}

function runProcessWithTimeout(params: {
  binary: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    let settled = false;

    const child = execFile(
      params.binary,
      params.args,
      {
        cwd: params.cwd,
        env: params.env,
        timeout: params.timeoutMs,
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
          reject(new Error(`Sandbox command timed out after ${params.timeoutMs}ms.`));
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
      reject(new Error(`Sandbox command timed out after ${params.timeoutMs}ms.`));
    }, params.timeoutMs + 25);
  });
}

export class DisposableSandboxRuntime {
  private readonly states = new Map<string, InternalSandboxState>();
  private readonly attestations: TeardownAttestation[] = [];
  private readonly attestationsBySandbox = new Map<string, TeardownAttestation>();
  private readonly defaultMode: SandboxExecutionMode;
  private readonly northShim: LiteBoxNorthShim;
  private readonly southPlatform: LiteBoxSouthPlatform;
  private readonly liteboxBinDir?: string;

  constructor(config?: SandboxRuntimeConfig) {
    this.defaultMode = config?.defaultMode ?? 'litebox-preferred';
    this.northShim = config?.northShim ?? 'litebox_shim_linux';
    this.southPlatform = config?.southPlatform ?? defaultSouthPlatform();
    this.liteboxBinDir = config?.liteboxBinDir;
  }

  getToolchainStatus(): LiteBoxToolchainStatus {
    return discoverLiteBoxToolchainSync({
      binDir: this.liteboxBinDir,
      northShim: this.northShim,
      southPlatform: this.southPlatform,
    });
  }

  private getActiveState(sandboxId: string): InternalSandboxState {
    const state = this.states.get(sandboxId);
    if (!state) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    if (state.handle.destroyed) {
      throw new Error(`Sandbox "${sandboxId}" has already been destroyed.`);
    }
    return state;
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

    const toolchain = this.getToolchainStatus();
    const handle: SandboxHandle = {
      id,
      workDir,
      createdAt: new Date().toISOString(),
      maxDurationMs: options?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
      destroyed: false,
      executionMode: options?.executionMode ?? this.defaultMode,
      northShim: toolchain.northShim,
      southPlatform: toolchain.southPlatform,
      liteboxAvailable: toolchain.available,
      ...(options?.tunDeviceName ? { tunDeviceName: options.tunDeviceName } : {}),
    };

    this.states.set(id, {
      handle,
      lastBackendUsed: null,
      tarBundlesCreated: 0,
    });

    if (options?.files) {
      try {
        for (const [relPath, content] of Object.entries(options.files)) {
          await this.writeSandboxFile(id, relPath, content);
        }
      } catch (err) {
        await fs.rm(workDir, { recursive: true, force: true });
        this.states.delete(id);
        throw err;
      }
    }

    return { ...handle };
  }

  async writeSandboxFile(sandboxId: string, relPath: string, content: string): Promise<void> {
    const { handle } = this.getActiveState(sandboxId);
    const safeTarget = await this.resolveSafePath(handle, relPath);
    await fs.mkdir(path.dirname(safeTarget), { recursive: true });
    await fs.writeFile(safeTarget, content, 'utf8');
  }

  async readSandboxFile(sandboxId: string, relPath: string): Promise<string> {
    const { handle } = this.getActiveState(sandboxId);
    const safeTarget = await this.resolveSafePath(handle, relPath);
    const realWorkDir = await fs.realpath(handle.workDir);
    const realTarget = await fs.realpath(safeTarget);
    const relReal = path.relative(realWorkDir, realTarget);
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
      throw new Error(`Symlink escape blocked while reading "${relPath}".`);
    }
    return fs.readFile(realTarget, 'utf8');
  }

  private async execViaMicrosoftLiteBox(
    state: InternalSandboxState,
    toolchain: LiteBoxToolchainStatus,
    resolvedElfBinary: string,
    args: string[],
    effectiveTimeoutMs: number,
    options?: ExecSandboxOptions,
  ): Promise<ExecSandboxResult> {
    if (!toolchain.packagerBinaryPath || !toolchain.runnerBinaryPath) {
      throw new Error('Microsoft LiteBox toolchain binaries are unavailable.');
    }

    const { handle } = state;
    const bundleIndex = state.tarBundlesCreated + 1;
    state.tarBundlesCreated = bundleIndex;
    const tarBundlePath = path.join(handle.workDir, `.litebox-bundle-${bundleIndex}.tar`);

    const relFiles = (await listFilesRecursive(handle.workDir)).filter(
      (rel) => !path.basename(rel).startsWith('.litebox-bundle-'),
    );
    const relFileSet = new Set(relFiles.map((f) => f.split(path.sep).join('/')));

    const packagerArgs: string[] = [resolvedElfBinary];

    const pythonMode = isPythonBinary(resolvedElfBinary);
    if (pythonMode && toolchain.pythonStdlibZipPath) {
      packagerArgs.push(
        '--include',
        `${toolchain.pythonStdlibZipPath}:/usr/lib/python311.zip`,
      );
    }

    for (const relFile of relFiles) {
      const hostPath = path.join(handle.workDir, relFile);
      if (hostPath.includes(':')) {
        throw new Error(
          `LiteBox packager host path cannot contain ":": "${hostPath}"`,
        );
      }
      const posixRel = relFile.split(path.sep).join('/');
      packagerArgs.push('--include', `${hostPath}:/sandbox/${posixRel}`);
    }

    packagerArgs.push('-o', tarBundlePath);

    const startedAt = performance.now();
    try {
      const packageRes = await runProcessWithTimeout({
        binary: toolchain.packagerBinaryPath,
        args: packagerArgs,
        cwd: handle.workDir,
        env: {
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
          HOME: handle.workDir,
          TMPDIR: handle.workDir,
        },
        timeoutMs: effectiveTimeoutMs,
      });

      if (packageRes.exitCode !== 0) {
        throw new Error(
          `Microsoft LiteBox packager failed (exit ${packageRes.exitCode}): ${packageRes.stderr}`,
        );
      }

      const mappedArgs = args.map((arg) => {
        const normalized = arg.replace(/^\.\//, '');
        if (!arg.startsWith('-') && !arg.startsWith('/') && relFileSet.has(normalized)) {
          return `/sandbox/${normalized}`;
        }
        return arg;
      });

      const guestArgs =
        pythonMode && !mappedArgs.includes('-S')
          ? ['-B', '-S', ...mappedArgs]
          : mappedArgs;

      const guestEnv: Record<string, string> = {
        ...(pythonMode
          ? {
              PYTHONHOME: '/usr',
              PYTHONPATH: '/sandbox:/usr/lib/python311.zip',
              PYTHONDONTWRITEBYTECODE: '1',
            }
          : {}),
        ...(options?.env ?? {}),
      };

      const elapsedPackaging = Math.round(performance.now() - startedAt);
      const remainingTimeoutMs = Math.max(50, effectiveTimeoutMs - elapsedPackaging);

      const invocation = buildLiteBoxRunnerInvocation({
        toolchain,
        tarBundlePath,
        guestProgramPath: resolvedElfBinary,
        guestArgs,
        env: guestEnv,
        tunDeviceName: options?.tunDeviceName ?? handle.tunDeviceName,
      });

      const runRes = await runProcessWithTimeout({
        binary: invocation.runnerBinary,
        args: invocation.runnerArgs,
        cwd: handle.workDir,
        env: {
          PATH: '/usr/bin:/bin',
          HOME: handle.workDir,
          TMPDIR: handle.workDir,
        },
        timeoutMs: remainingTimeoutMs,
      });

      state.lastBackendUsed = 'microsoft-litebox';
      return {
        exitCode: runRes.exitCode,
        stdout: runRes.stdout,
        stderr: runRes.stderr,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        backendUsed: 'microsoft-litebox',
        northShim: invocation.northShim,
        southPlatform: invocation.southPlatform,
      };
    } finally {
      await fs.rm(tarBundlePath, { force: true }).catch(() => undefined);
    }
  }

  async execInSandbox(
    sandboxId: string,
    command: string,
    args: string[],
    options?: ExecSandboxOptions,
  ): Promise<ExecSandboxResult> {
    const state = this.getActiveState(sandboxId);
    const { handle } = state;
    const effectiveTimeoutMs = Math.max(
      1,
      Math.min(options?.timeoutMs ?? handle.maxDurationMs, handle.maxDurationMs),
    );

    const requestedMode = options?.mode ?? handle.executionMode ?? this.defaultMode;
    const toolchain = this.getToolchainStatus();
    const resolvedElf = resolveHostElfBinary(command);

    if (requestedMode === 'litebox-strict') {
      if (!toolchain.available) {
        throw new Error(
          'Microsoft LiteBox strict mode requested, but LiteBox toolchain binaries were not found. Run infra/litebox/build-litebox.sh to provision.',
        );
      }
      if (!resolvedElf) {
        throw new Error(
          `Microsoft LiteBox strict mode could not resolve executable binary for "${command}".`,
        );
      }
      return this.execViaMicrosoftLiteBox(
        state,
        toolchain,
        resolvedElf,
        args,
        effectiveTimeoutMs,
        options,
      );
    }

    if (
      requestedMode === 'litebox-preferred' &&
      toolchain.available &&
      resolvedElf &&
      !isMultiThreadedV8Runtime(resolvedElf)
    ) {
      return this.execViaMicrosoftLiteBox(
        state,
        toolchain,
        resolvedElf,
        args,
        effectiveTimeoutMs,
        options,
      );
    }

    const safePath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin';
    const scrubbedEnv: NodeJS.ProcessEnv = {
      PATH: safePath,
      HOME: handle.workDir,
      TMPDIR: handle.workDir,
      LANG: 'C.UTF-8',
      NODE_NO_WARNINGS: '1',
      ...(options?.env ?? {}),
    };

    const procRes = await runProcessWithTimeout({
      binary: command,
      args,
      cwd: handle.workDir,
      env: scrubbedEnv,
      timeoutMs: effectiveTimeoutMs,
    });

    state.lastBackendUsed = 'process-confined';
    return {
      ...procRes,
      backendUsed: 'process-confined',
      northShim: toolchain.northShim,
      southPlatform: toolchain.southPlatform,
    };
  }

  async destroySandbox(sandboxId: string): Promise<TeardownAttestation> {
    const existingAttestation = this.attestationsBySandbox.get(sandboxId);
    if (existingAttestation) {
      return { ...existingAttestation };
    }

    const state = this.states.get(sandboxId);
    if (!state) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const { handle } = state;
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
    const backend: SandboxBackendKind =
      state.lastBackendUsed ??
      (handle.liteboxAvailable && handle.executionMode !== 'process-confined'
        ? 'microsoft-litebox'
        : 'process-confined');

    const canonicalAttestationPayload = JSON.stringify({
      backend,
      createdAt: handle.createdAt,
      destroyedAt,
      filesErasedCount,
      northShim: handle.northShim,
      sandboxId: handle.id,
      southPlatform: handle.southPlatform,
      tarBundlesErasedCount: state.tarBundlesCreated,
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
      tarBundlesErasedCount: state.tarBundlesCreated,
      backend,
      northShim: handle.northShim,
      southPlatform: handle.southPlatform,
      sha256Attestation,
    };

    this.attestations.push(attestation);
    this.attestationsBySandbox.set(handle.id, attestation);

    return { ...attestation };
  }

  async destroyAll(): Promise<TeardownAttestation[]> {
    const results: TeardownAttestation[] = [];
    for (const [id, state] of this.states.entries()) {
      if (!state.handle.destroyed) {
        results.push(await this.destroySandbox(id));
      }
    }
    return results;
  }

  getAttestations(): TeardownAttestation[] {
    return this.attestations.map((item) => ({ ...item }));
  }
}
