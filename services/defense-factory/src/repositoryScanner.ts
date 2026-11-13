import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  FindingRecordSchema,
  type FindingRecord,
  type Severity,
} from '@nightfall/core-contracts';
import {
  DisposableSandboxRuntime,
  type TeardownAttestation,
} from '@nightfall/sandbox-runtime';
import { RootCauseDeduplicator } from './deduplicator.js';

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTENSIONS = new Set([
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.go',
]);

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  '__tests__',
]);

export interface RepositoryScannerDeps {
  sandboxRuntime?: DisposableSandboxRuntime;
  deduplicator?: RootCauseDeduplicator;
  workspaceReposRoot?: string;
}

export interface ScanRepositoryInput {
  repository: string;
  localPath?: string;
  cloneUrl?: string;
  workspaceReposRoot?: string;
  mode?: 'cloud' | 'local';
  method?: 'repository_scan' | 'continuous_monitoring' | 'scheduled_scan';
  scope?: 'full_repository' | 'specific_paths';
  paths?: string[];
  startingSequenceNumber?: number;
}

export interface ScanRepositoryResult {
  repository: string;
  scannedPath: string;
  observedRevision: string;
  filesScannedCount: number;
  findings: FindingRecord[];
  teardownAttestation?: TeardownAttestation;
}

interface EnclosingBlock {
  startLine: number;
  endLine: number;
  symbolName: string;
  bodyText: string;
}

interface RawDetectedIssue {
  ruleSlug: string;
  weaknessCwe: string;
  severity: Severity;
  title: string;
  summary: string;
  rootCause: string;
  impactAndAttackPath: string;
  preconditions: string[];
  remediation: string;
  affectedEndpoint?: string;
  file: string;
  startLine: number;
  endLine: number;
  symbolName: string;
  description: string;
}

function isTestFileName(relPosixPath: string): boolean {
  const base = path.posix.basename(relPosixPath).toLowerCase();
  if (
    base.includes('.test.') ||
    base.includes('.spec.') ||
    base.startsWith('test_') ||
    base.endsWith('_test.py') ||
    base.endsWith('_test.go')
  ) {
    return true;
  }
  return false;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function normalizeRequestedPath(p: string): string {
  return p
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+$/, '');
}

function repoShortName(repository: string): string {
  const parts = repository.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? repository;
}

function leadingIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count += 1;
    else if (ch === '\t') count += 4;
    else break;
  }
  return count;
}

function findPythonEnclosingBlock(lines: string[], targetIdx: number): EnclosingBlock {
  const targetLine = lines[targetIdx] ?? '';
  const targetIndent = leadingIndent(targetLine);
  let defIdx = -1;
  let defIndent = 0;
  let symbolName = `line_${targetIdx + 1}`;

  for (let i = targetIdx; i >= 0; i -= 1) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = leadingIndent(raw);
    const match = /^(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(trimmed);
    if (match && (i === targetIdx || indent < targetIndent)) {
      defIdx = i;
      defIndent = indent;
      symbolName = match[1]!;
      break;
    }
  }

  if (defIdx < 0) {
    return {
      startLine: targetIdx + 1,
      endLine: targetIdx + 1,
      symbolName,
      bodyText: targetLine,
    };
  }

  let endIdx = defIdx;
  for (let i = defIdx + 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = leadingIndent(raw);
    if (indent <= defIndent) {
      break;
    }
    endIdx = i;
  }

  return {
    startLine: defIdx + 1,
    endLine: Math.max(defIdx + 1, endIdx + 1),
    symbolName,
    bodyText: lines.slice(defIdx, endIdx + 1).join('\n'),
  };
}

function countBracesOnLine(line: string): { opens: number; closes: number } {
  let opens = 0;
  let closes = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    const prev = i > 0 ? line[i - 1] : '';
    if (!inSingle && !inDouble && !inBacktick && ch === '/' && line[i + 1] === '/') {
      break;
    }
    if (prev !== '\\') {
      if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
      else if (ch === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
      else if (ch === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
    }
    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '{') opens += 1;
      else if (ch === '}') closes += 1;
    }
  }
  return { opens, closes };
}

function findBraceEnclosingBlock(lines: string[], targetIdx: number): EnclosingBlock {
  const fnPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
    /(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/,
    /func\s+(?:\([^)]+\)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
    /\b(?:app|router|mux)\.(get|post|put|patch|delete|HandleFunc)\s*\(/,
  ];

  const searchFloor = Math.max(0, targetIdx - 50);
  for (let candidateStart = targetIdx; candidateStart >= searchFloor; candidateStart -= 1) {
    const lineText = lines[candidateStart] ?? '';
    let matchedSymbol: string | null = null;
    for (const pat of fnPatterns) {
      const m = pat.exec(lineText);
      if (m) {
        matchedSymbol = m[1] ?? `handler_${candidateStart + 1}`;
        break;
      }
    }
    if (!matchedSymbol) continue;

    let depth = 0;
    let sawOpenBrace = false;
    let endIdx = candidateStart;
    for (let j = candidateStart; j < lines.length; j += 1) {
      const { opens, closes } = countBracesOnLine(lines[j] ?? '');
      if (opens > 0) sawOpenBrace = true;
      depth += opens - closes;
      endIdx = j;
      if (sawOpenBrace && depth <= 0) {
        break;
      }
    }

    if (sawOpenBrace && endIdx >= targetIdx) {
      return {
        startLine: candidateStart + 1,
        endLine: endIdx + 1,
        symbolName: matchedSymbol,
        bodyText: lines.slice(candidateStart, endIdx + 1).join('\n'),
      };
    }
  }

  return {
    startLine: targetIdx + 1,
    endLine: targetIdx + 1,
    symbolName: `line_${targetIdx + 1}`,
    bodyText: lines[targetIdx] ?? '',
  };
}

function getEnclosingBlock(ext: string, lines: string[], lineIdx: number): EnclosingBlock {
  if (ext === '.py') {
    return findPythonEnclosingBlock(lines, lineIdx);
  }
  return findBraceEnclosingBlock(lines, lineIdx);
}

async function walkSourceFiles(
  rootDir: string,
  currentDir = rootDir,
): Promise<string[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const collected: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      if (entry.name === '.git') {
        continue;
      }
    }
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      collected.push(...(await walkSourceFiles(rootDir, fullPath)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        continue;
      }
      const relPosix = toPosixPath(path.relative(rootDir, fullPath));
      if (isTestFileName(relPosix)) {
        continue;
      }
      collected.push(relPosix);
    }
  }

  return collected.sort((a, b) => a.localeCompare(b));
}

async function computeGitShortHead(dirPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dirPath, 'rev-parse', '--short', 'HEAD'], {
      timeout: 5_000,
    });
    const rev = stdout.trim();
    if (/^[0-9a-f]{7,40}$/i.test(rev)) {
      return rev.toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

function computeFilesDigestRevision(files: Array<{ relPath: string; content: string }>): string {
  const hash = crypto.createHash('sha256');
  for (const item of files) {
    hash.update(item.relPath, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(item.content, 'utf8');
    hash.update('\0', 'utf8');
  }
  return hash.digest('hex').slice(0, 7);
}

function analyzeSourceFile(
  repository: string,
  relFile: string,
  content: string,
): RawDetectedIssue[] {
  const ext = path.posix.extname(relFile).toLowerCase();
  const lines = content.split(/\r?\n/);
  const issues: RawDetectedIssue[] = [];
  const emittedKeys = new Set<string>();

  const pushUnique = (issue: RawDetectedIssue) => {
    const dedupKey = `${issue.ruleSlug}:${issue.file}:${issue.startLine}:${issue.endLine}`;
    if (emittedKeys.has(dedupKey)) return;
    emittedKeys.add(dedupKey);
    issues.push(issue);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }

    // 1. CWE-78: OS Command Injection
    const isJsCmdInj =
      ext !== '.py' &&
      ext !== '.go' &&
      (/(?:^|[^.\w$])(?:exec|execSync)\s*\(/.test(trimmed) ||
        /\b(?:child_process|cp)\s*\.\s*(?:exec|execSync)\s*\(/.test(trimmed)) &&
      !/\bexecFile(?:Sync)?\s*\(/.test(trimmed);
    const isPyCmdInj =
      ext === '.py' &&
      (/\bos\.(?:system|popen)\s*\(/.test(trimmed) ||
        (/\bsubprocess\.(?:run|Popen|call|check_output)\s*\(/.test(trimmed) &&
          getEnclosingBlock(ext, lines, i).bodyText.includes('shell=True')));
    const isGoCmdInj =
      ext === '.go' && /\bexec\.Command\s*\(\s*"(?:sh|bash)"\s*,\s*"-c"/.test(trimmed);

    if (isJsCmdInj || isPyCmdInj || isGoCmdInj) {
      const block = getEnclosingBlock(ext, lines, i);
      pushUnique({
        ruleSlug: 'cwe-78-os-command-injection',
        weaknessCwe: 'CWE-78 · OS Command Injection',
        severity: 'critical',
        title: `OS command shell execution — ${path.posix.basename(relFile)}`,
        summary: `Shell-invoking command execution in \`${block.symbolName}\` (${relFile}:${block.startLine}-${block.endLine}) passes dynamic arguments through a shell interpreter.`,
        rootCause:
          'Invoke of shell command runner (`exec`/`execSync`/`shell=True`/`os.system`) allows shell metacharacter expansion instead of argument-array process spawning.',
        impactAndAttackPath:
          'Caller-influenced input reaching the command argument string can execute arbitrary subcommands under the service account.',
        preconditions: [
          `Caller can influence parameters passed into \`${block.symbolName}\` in \`${relFile}\`.`,
        ],
        remediation:
          'Replace shell execution with `execFile` / `subprocess.run(..., shell=False)` using an explicit argument list and strict input allowlisting.',
        file: relFile,
        startLine: block.startLine,
        endLine: block.endLine,
        symbolName: block.symbolName,
        description: 'Unparameterized shell command invocation',
      });
    }

    // 2. CWE-94: Code Injection
    const isCodeInj =
      (ext !== '.go' && /\bnew\s+Function\s*\(/.test(trimmed)) ||
      (ext !== '.go' && /(?:^|[^.\w$])eval\s*\(/.test(trimmed)) ||
      (ext === '.py' && /(?:^|[^.\w])exec\s*\(/.test(trimmed));

    if (isCodeInj) {
      const block = getEnclosingBlock(ext, lines, i);
      pushUnique({
        ruleSlug: 'cwe-94-code-injection',
        weaknessCwe: 'CWE-94 · Code Injection',
        severity: 'critical',
        title: `Dynamic code evaluation — ${path.posix.basename(relFile)}`,
        summary: `Dynamic code compiler/evaluator (\`eval\` / \`new Function\`) invoked inside \`${block.symbolName}\` (${relFile}:${block.startLine}-${block.endLine}).`,
        rootCause:
          'Untrusted or configuration-derived expressions are compiled into executable runtime code instead of evaluated via a declarative rule AST.',
        impactAndAttackPath:
          'Crafted expressions reaching the evaluator execute arbitrary code in the application runtime.',
        preconditions: [
          `Dynamic expression input reaches \`${block.symbolName}\` in \`${relFile}\`.`,
        ],
        remediation:
          'Eliminate `eval`/`new Function` and evaluate structured predicates against an explicit operator allowlist.',
        file: relFile,
        startLine: block.startLine,
        endLine: block.endLine,
        symbolName: block.symbolName,
        description: 'Dynamic runtime code evaluation (`eval` / `new Function`)',
      });
    }

    // 3. CWE-89: SQL Injection
    const windowText = lines.slice(i, Math.min(lines.length, i + 4)).join(' ');
    const isJsSqlInj =
      (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs' || ext === '.cjs') &&
      /`[^`]*\b(?:SELECT|DELETE|UPDATE|INSERT\s+INTO)\b[^`]*\$\{[^}]+\}/i.test(windowText) &&
      /`[^`]*\b(?:SELECT|DELETE|UPDATE|INSERT)\b/i.test(trimmed);
    const isPySqlInj =
      ext === '.py' &&
      (/f["'][^"']*\b(?:SELECT|DELETE|UPDATE|INSERT\s+INTO)\b[^"']*\{[^}]+\}/i.test(trimmed) ||
        (/f["'][^"']*\b(?:AND|WHERE)\b[^"']*\bLIKE\b[^"']*\{[^}]+\}/i.test(trimmed) &&
          getEnclosingBlock(ext, lines, i).bodyText.includes('.execute(')));
    const isGoSqlInj =
      ext === '.go' &&
      /\bfmt\.Sprintf\s*\(\s*"[^"]*\b(?:SELECT|DELETE|UPDATE|INSERT)\b[^"]*%[sv]/.test(trimmed);

    if (isJsSqlInj || isPySqlInj || isGoSqlInj) {
      const block = getEnclosingBlock(ext, lines, i);
      pushUnique({
        ruleSlug: 'cwe-89-sql-injection',
        weaknessCwe: 'CWE-89 · SQL Injection',
        severity: 'high',
        title: `Unparameterized SQL query interpolation — ${path.posix.basename(relFile)}`,
        summary: `String-interpolated SQL clause in \`${block.symbolName}\` (${relFile}:${block.startLine}-${block.endLine}) embeds dynamic values directly into SQL text.`,
        rootCause:
          'Query construction uses template literals or Python f-strings instead of bound query parameters (`?` / `$1`).',
        impactAndAttackPath:
          'Crafted filter strings can alter SQL predicate logic and read or modify records across tenant boundaries.',
        preconditions: [
          `Caller-supplied filter or identifier reaches \`${block.symbolName}\` in \`${relFile}\`.`,
        ],
        remediation:
          'Bind all dynamic values as prepared-statement parameters (`?` / `$1`) and remove string interpolation from SQL clauses.',
        file: relFile,
        startLine: block.startLine,
        endLine: block.endLine,
        symbolName: block.symbolName,
        description: 'Direct string interpolation inside SQL query statement',
      });
    }

    // 4. CWE-22: Path Traversal
    const isJsFsCall =
      ext !== '.py' &&
      ext !== '.go' &&
      /\b(?:readFile|readFileSync|createReadStream|sendFile)\s*\(/.test(trimmed);
    const isPyFsCall =
      ext === '.py' && /\b(?:send_file|open)\s*\(/.test(trimmed);

    if (isJsFsCall || isPyFsCall) {
      const block = getEnclosingBlock(ext, lines, i);
      const usesRequestInput =
        /\breq\.(?:query|params|body)\b/.test(block.bodyText) ||
        /\brequest\.(?:args|query_params|view_args)\b/.test(block.bodyText);
      const hasPathConfinement =
        /\brealpath(?:Sync)?\b/.test(block.bodyText) ||
        /\bpath\.relative\b/.test(block.bodyText) ||
        /\.resolve\s*\(\s*\)/.test(block.bodyText);

      if (usesRequestInput && !hasPathConfinement) {
        pushUnique({
          ruleSlug: 'cwe-22-path-traversal',
          weaknessCwe: 'CWE-22 · Path Traversal',
          severity: 'high',
          title: `Unconfined file path from request input — ${path.posix.basename(relFile)}`,
          summary: `Handler \`${block.symbolName}\` (${relFile}:${block.startLine}-${block.endLine}) passes request-controlled path segments to filesystem read APIs without canonical confinement checks.`,
          rootCause:
            'Request parameter reaches `readFile`/`sendFile` without resolving `fs.realpath` and verifying `path.relative(baseDir, target)` stays inside the allowed root.',
          impactAndAttackPath:
            'Relative `../` segments or symlinks can read sensitive files outside the intended export directory.',
          preconditions: [`Caller can invoke \`${block.symbolName}\` with a path query/route parameter.`],
          remediation:
            'Canonicalize both root directory and target path with `realpath` and reject any path whose `path.relative` starts with `..` or is absolute.',
          file: relFile,
          startLine: block.startLine,
          endLine: block.endLine,
          symbolName: block.symbolName,
          description: 'Request parameter passed to file read without realpath/relative check',
        });
      }
    }

    // 5. CWE-502: Deserialization of Untrusted Data
    const isPyUnsafeDeser =
      ext === '.py' &&
      (/\bpickle\.loads?\s*\(/.test(trimmed) ||
        /\bmarshal\.loads?\s*\(/.test(trimmed) ||
        (/\byaml\.load\s*\(/.test(trimmed) && !/SafeLoader/.test(trimmed)));
    const isJsUnsafeDeser =
      ext !== '.py' && /\b(?:nodeSerialize|serialize)\.unserialize\s*\(/.test(trimmed);

    if (isPyUnsafeDeser || isJsUnsafeDeser) {
      const block = getEnclosingBlock(ext, lines, i);
      pushUnique({
        ruleSlug: 'cwe-502-unsafe-deserialization',
        weaknessCwe: 'CWE-502 · Deserialization of Untrusted Data',
        severity: 'high',
        title: `Unsafe binary/object deserialization — ${path.posix.basename(relFile)}`,
        summary: `Function \`${block.symbolName}\` (${relFile}:${block.startLine}-${block.endLine}) deserializes untrusted payloads using an arbitrary object loader.`,
        rootCause:
          'Usage of `pickle.loads` or `yaml.load` without `SafeLoader` instantiates arbitrary classes during payload decoding.',
        impactAndAttackPath:
          'Crafted serialized frames can trigger arbitrary gadget execution in the worker process.',
        preconditions: [`Serialized payload reaches \`${block.symbolName}\` in \`${relFile}\`.`],
        remediation:
          'Replace `pickle.loads` / unsafe `yaml.load` with schema-validated JSON (`json.loads`) or `yaml.safe_load`.',
        file: relFile,
        startLine: block.startLine,
        endLine: block.endLine,
        symbolName: block.symbolName,
        description: 'Unsafe deserialization call (`pickle.loads` / unsafe `yaml.load`)',
      });
    }

    // 6. CWE-862: Missing Authorization on export / resource / channel handlers
    if (ext === '.py') {
      const pyDefMatch = /^(?:async\s+)?def\s+(export_[a-zA-Z0-9_]*|run_export_[a-zA-Z0-9_]*|on_subscribe|handle_ws_subscribe)\s*\(/.exec(
        trimmed,
      );
      const hasSavedSearchOrm = /\bSavedSearch\.objects\.get\s*\(/.test(trimmed);

      if (pyDefMatch || hasSavedSearchOrm) {
        const block = getEnclosingBlock(ext, lines, i);
        const hasAuthGuard =
          /\bcan_read_document\s*\(/.test(block.bodyText) ||
          /\bcan_view_document\s*\(/.test(block.bodyText) ||
          /\bcheck_workspace_member\s*\(/.test(block.bodyText) ||
          /\bhas_perm(?:ission)?\s*\(/.test(block.bodyText) ||
          (hasSavedSearchOrm && /\bworkspace_id\s*=/.test(trimmed));

        if (!hasAuthGuard) {
          pushUnique({
            ruleSlug: 'cwe-862-missing-authorization',
            weaknessCwe: 'CWE-862 · Missing authorization',
            severity: block.symbolName.includes('export') ? 'critical' : 'high',
            title: `Missing authorization — ${block.symbolName} (${repoShortName(repository)})`,
            summary: `Handler \`${block.symbolName}\` in \`${relFile}\` (${block.startLine}-${block.endLine}) returns or streams workspace document data without verifying caller workspace/document read permissions.`,
            rootCause:
              'The handler resolves target documents and constructs response payloads without invoking `can_read_document` / `can_view_document` against the caller principal.',
            impactAndAttackPath:
              'Callers outside the owning workspace or lacking document read ACLs can retrieve restricted document contents.',
            preconditions: [
              `Caller can reach \`${block.symbolName}\` and reference a target search or document identifier.`,
            ],
            remediation:
              'Enforce caller workspace and document read ACL checks before returning or archiving any document record, and add a cross-workspace regression test.',
            file: relFile,
            startLine: block.startLine,
            endLine: block.endLine,
            symbolName: block.symbolName,
            description: 'Handler omits caller workspace / per-document authorization check',
          });
        }
      }
    } else if (ext !== '.go') {
      const jsExportDef =
        /(?:export\s+)?(?:async\s+)?function\s+(export[A-Z][a-zA-Z0-9_]*|getRestricted[A-Z][a-zA-Z0-9_]*|downloadWorkspace[A-Z][a-zA-Z0-9_]*)\s*\(/.exec(
          trimmed,
        ) ??
        /(?:export\s+)?const\s+(export[A-Z][a-zA-Z0-9_]*|getRestricted[A-Z][a-zA-Z0-9_]*)\s*=\s*(?:async\s*)?\(/.exec(
          trimmed,
        ) ??
        /\b(?:app|router)\.(?:get|post)\s*\(\s*['"`][^'"`]*\/exports?\b[^'"`]*['"`]/.exec(trimmed);
      if (jsExportDef) {
        const block = getEnclosingBlock(ext, lines, i);
        const hasTenantGuard =
          /\bisProjectMember\s*\(/.test(block.bodyText) ||
          /\bprojectAcl\.isMember\s*\(/.test(block.bodyText) ||
          /\bauthorizePrincipal[a-zA-Z0-9_]*\s*\(/.test(block.bodyText) ||
          /\bcallerTenantId\s*===\s*[a-zA-Z0-9_.]+tenantId\b/.test(block.bodyText) ||
          /\bcallerTenantId\s*!==\s*[a-zA-Z0-9_.]+tenantId\b/.test(block.bodyText) ||
          /\bcaller\.projectId\s*===\s*/.test(block.bodyText) ||
          /\bcaller\.projectId\s*!==\s*/.test(block.bodyText);

        if (!hasTenantGuard) {
          pushUnique({
            ruleSlug: 'cwe-862-missing-authorization',
            weaknessCwe: 'CWE-862 · Missing authorization',
            severity: 'critical',
            title: `Missing authorization — ${block.symbolName} (${repoShortName(repository)})`,
            summary: `Export handler \`${block.symbolName}\` in \`${relFile}\` (${block.startLine}-${block.endLine}) returns restricted resource data without enforcing caller project/tenant membership.`,
            rootCause:
              'The export function loads the target resource by ID and returns its contents without checking that the caller belongs to the owning project or tenant.',
            impactAndAttackPath:
              'An authenticated caller in another project or tenant can supply a target resource ID and export cross-tenant data.',
            preconditions: [
              `Caller holds an authenticated session and invokes \`${block.symbolName}\` with a foreign resource ID.`,
            ],
            remediation:
              'Verify caller project/tenant membership against the resource owner prior to returning export payloads, returning 403 Forbidden on mismatch.',
            file: relFile,
            startLine: block.startLine,
            endLine: block.endLine,
            symbolName: block.symbolName,
            description: 'Export handler missing caller project/tenant equality guard',
          });
        }
      }
    }
  }

  return issues;
}

export class RepositoryScanner {
  private readonly sandboxRuntime: DisposableSandboxRuntime;
  private readonly deduplicator: RootCauseDeduplicator;
  private readonly workspaceReposRoot?: string;

  constructor(deps?: RepositoryScannerDeps) {
    this.sandboxRuntime = deps?.sandboxRuntime ?? new DisposableSandboxRuntime();
    this.deduplicator = deps?.deduplicator ?? new RootCauseDeduplicator();
    this.workspaceReposRoot = deps?.workspaceReposRoot;
  }

  async scanRepository(input: ScanRepositoryInput): Promise<ScanRepositoryResult> {
    const scope = input.scope ?? 'full_repository';
    const mode = input.mode ?? 'local';
    const shortRepo = repoShortName(input.repository);
    const effectiveReposRoot = input.workspaceReposRoot ?? this.workspaceReposRoot;

    let cloneSandboxId: string | null = null;
    let teardownAttestation: TeardownAttestation | undefined;
    let targetDir: string;

    try {
      if (input.cloneUrl && !input.localPath) {
        const sandbox = await this.sandboxRuntime.createSandbox({
          prefix: 'nf-scan-clone',
          maxDurationMs: 60_000,
          executionMode: 'process-confined',
        });
        cloneSandboxId = sandbox.id;
        const cloneRes = await this.sandboxRuntime.execInSandbox(
          sandbox.id,
          'git',
          ['clone', '--depth', '1', input.cloneUrl, 'repo'],
          { mode: 'process-confined', timeoutMs: 45_000 },
        );
        if (cloneRes.exitCode !== 0) {
          throw new Error(
            `git clone failed for "${input.cloneUrl}": ${cloneRes.stderr || cloneRes.stdout}`,
          );
        }
        targetDir = path.join(sandbox.workDir, 'repo');
      } else if (input.localPath) {
        targetDir = path.resolve(input.localPath);
      } else if (effectiveReposRoot) {
        const directCandidate = path.resolve(effectiveReposRoot, shortRepo);
        const fullCandidate = path.resolve(effectiveReposRoot, input.repository);
        try {
          await fs.access(directCandidate);
          targetDir = directCandidate;
        } catch {
          targetDir = fullCandidate;
        }
      } else {
        throw new Error(
          `Cannot scan repository "${input.repository}": neither localPath, cloneUrl, nor workspaceReposRoot was provided.`,
        );
      }

      const stat = await fs.stat(targetDir);
      if (!stat.isDirectory()) {
        throw new Error(`Target repository path is not a directory: ${targetDir}`);
      }

      let relFiles = await walkSourceFiles(targetDir);
      if (scope === 'specific_paths' && input.paths && input.paths.length > 0) {
        const normalizedTargets = input.paths
          .map(normalizeRequestedPath)
          .filter((item) => item.length > 0);
        if (normalizedTargets.length > 0) {
          relFiles = relFiles.filter((relFile) =>
            normalizedTargets.some(
              (reqPath) =>
                relFile === reqPath ||
                relFile.startsWith(`${reqPath}/`) ||
                relFile.endsWith(`/${reqPath}`),
            ),
          );
        }
      }

      const loadedFiles: Array<{ relPath: string; content: string }> = [];
      for (const relPath of relFiles) {
        const content = await fs.readFile(path.join(targetDir, relPath), 'utf8');
        loadedFiles.push({ relPath, content });
      }

      const gitRevision = await computeGitShortHead(targetDir);
      const observedRevision = gitRevision ?? computeFilesDigestRevision(loadedFiles);

      const nowIso = new Date().toISOString();
      const owner = this.deduplicator.resolveCodeOwner(
        shortRepo,
        this.deduplicator.resolveCodeOwner(input.repository),
      );

      let seq = input.startingSequenceNumber ?? 1001;
      const findings: FindingRecord[] = [];

      for (const fileItem of loadedFiles) {
        const detected = analyzeSourceFile(input.repository, fileItem.relPath, fileItem.content);
        for (const issue of detected) {
          const findingId = `SEC-${seq}`;
          seq += 1;
          const clusterKey = `${shortRepo}:${issue.ruleSlug}:${issue.file}:${issue.symbolName}`;

          const record = FindingRecordSchema.parse({
            id: findingId,
            title: issue.title,
            subtitle: `${shortRepo} · ${findingId} · Discovered by ${mode} source scan`,
            repository: shortRepo,
            observedRevision,
            severity: issue.severity,
            status: 'new',
            fixVerification: 'not_recorded',
            weaknessCwe: issue.weaknessCwe,
            owner,
            sources: ['nightfall', 'sast'],
            summary: issue.summary,
            rootCause: issue.rootCause,
            impactAndAttackPath: issue.impactAndAttackPath,
            preconditions: issue.preconditions,
            remediation: issue.remediation,
            ...(issue.affectedEndpoint ? { affectedEndpoint: issue.affectedEndpoint } : {}),
            codeReferences: [
              {
                file: issue.file,
                startLine: issue.startLine,
                endLine: issue.endLine,
                description: issue.description,
              },
            ],
            rootCauseClusterKey: clusterKey,
            createdAt: nowIso,
            updatedAt: nowIso,
          });

          findings.push(record);
        }
      }

      if (cloneSandboxId) {
        teardownAttestation = await this.sandboxRuntime.destroySandbox(cloneSandboxId);
        cloneSandboxId = null;
      }

      return {
        repository: shortRepo,
        scannedPath: targetDir,
        observedRevision,
        filesScannedCount: loadedFiles.length,
        findings,
        ...(teardownAttestation ? { teardownAttestation } : {}),
      };
    } finally {
      if (cloneSandboxId) {
        await this.sandboxRuntime.destroySandbox(cloneSandboxId).catch(() => undefined);
      }
    }
  }
}
