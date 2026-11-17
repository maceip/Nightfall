import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import type { Readable } from 'node:stream';
import {
  NightfallWireScorecardEnvelopeSchema,
  ScorecardCheckCatalogEntrySchema,
  ScorecardReportRecordSchema,
  type ScorecardCheckCatalogEntry,
  type ScorecardCheckRisk,
  type ScorecardReportRecord,
  type ScorecardServiceMode,
  type ScorecardToolchainStatus,
} from '@nightfall/core-contracts';
import type { AuditLedger } from '@nightfall/audit-ledger';
import type { PolicyGate } from '@nightfall/policy-gate';
import {
  SCORECARD_PINNED_COMMIT,
  discoverScorecardToolchainSync,
} from './toolchain.js';

export const DEFAULT_LOCAL_SCORECARD_CHECKS = [
  'Binary-Artifacts',
  'Dangerous-Workflow',
  'Dependency-Update-Tool',
  'Fuzzing',
  'License',
  'Pinned-Dependencies',
  'SAST',
  'Security-Policy',
  'Token-Permissions',
  'Vulnerabilities',
] as const;

export const FAST_WORKSPACE_SCORECARD_CHECKS = [
  'Binary-Artifacts',
  'Dangerous-Workflow',
  'Dependency-Update-Tool',
  'License',
  'Pinned-Dependencies',
  'SAST',
  'Security-Policy',
  'Token-Permissions',
] as const;

function normalizeRisk(rawRisk: string): ScorecardCheckRisk {
  switch (rawRisk.trim().toLowerCase()) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'low':
      return 'Low';
    case 'medium':
    default:
      return 'Medium';
  }
}

function loopbackJsonRequest<T>(options: {
  baseUrl: string;
  method: 'GET' | 'POST';
  pathname: string;
  body?: unknown;
  timeoutMs?: number;
}): Promise<T> {
  const url = new URL(options.pathname, options.baseUrl);
  const payload = options.body !== undefined ? JSON.stringify(options.body) : undefined;
  const timeoutMs = options.timeoutMs ?? 45_000;

  return new Promise<T>((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: options.method,
        headers: {
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 500;
          if (status < 200 || status >= 300) {
            reject(
              new Error(
                `Nightfall Scorecard daemon returned HTTP ${status}: ${text.trim() || 'empty body'}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch (err) {
            reject(
              new Error(
                `Invalid JSON from Nightfall Scorecard daemon: ${(err as Error).message}`,
              ),
            );
          }
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Nightfall Scorecard daemon timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

export interface ScorecardServiceConfig {
  binDir?: string;
  vendoredRootDir?: string;
  preferDaemon?: boolean;
  offlineByDefault?: boolean;
  policyGate?: PolicyGate;
  auditLedger?: AuditLedger;
}

export interface ScanRepositoryOptions {
  repository: string;
  targetType?: 'local' | 'remote';
  localPath?: string;
  remoteRepo?: string;
  commit?: string;
  checks?: string[];
  offline?: boolean;
  timeoutMs?: number;
}

export class ScorecardService {
  private readonly binDir?: string;
  private readonly vendoredRootDir?: string;
  private readonly preferDaemon: boolean;
  private readonly offlineByDefault: boolean;
  private readonly policyGate?: PolicyGate;
  private readonly auditLedger?: AuditLedger;

  private daemonProc: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private daemonUrl: string | null = null;
  private daemonStarting: Promise<string> | null = null;

  constructor(config?: ScorecardServiceConfig) {
    this.binDir = config?.binDir;
    this.vendoredRootDir = config?.vendoredRootDir;
    this.preferDaemon = config?.preferDaemon ?? true;
    this.offlineByDefault = config?.offlineByDefault ?? false;
    this.policyGate = config?.policyGate;
    this.auditLedger = config?.auditLedger;
  }

  private assertNotHalted(): void {
    if (this.policyGate?.isKillSwitchEngaged()) {
      void this.stopDaemon();
      throw new Error('Emergency kill-switch engaged: Scorecard engine halted by PolicyGate.');
    }
  }

  getToolchainStatus(): ScorecardToolchainStatus {
    const mode: ScorecardServiceMode | undefined = this.daemonUrl
      ? 'daemon-http'
      : undefined;
    return discoverScorecardToolchainSync({
      binDir: this.binDir,
      vendoredRootDir: this.vendoredRootDir,
      serviceMode: mode,
      daemonUrl: this.daemonUrl,
    });
  }

  async ensureDaemonRunning(): Promise<string> {
    this.assertNotHalted();
    if (this.daemonUrl && this.daemonProc && this.daemonProc.exitCode === null) {
      return this.daemonUrl;
    }
    if (this.daemonStarting) {
      return this.daemonStarting;
    }

    const status = discoverScorecardToolchainSync({
      binDir: this.binDir,
      vendoredRootDir: this.vendoredRootDir,
    });
    if (!status.available || !status.binaryPath) {
      throw new Error(
        'Nightfall Scorecard binary not found. Run `pnpm build:scorecard` to build vendor/scorecard.',
      );
    }

    this.daemonStarting = new Promise<string>((resolve, reject) => {
      const child = spawn(status.binaryPath!, ['serve', '--listen', '127.0.0.1:0'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NIGHTFALL_SCORECARD_GRACEFUL_NET: '1',
          ...(this.offlineByDefault ? { NIGHTFALL_SCORECARD_OFFLINE: '1' } : {}),
        },
      });

      let settled = false;
      let stdoutBuf = '';
      let stderrBuf = '';

      const startTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill('SIGKILL');
          reject(
            new Error(
              `Timed out waiting for Nightfall Scorecard daemon startup (${stderrBuf.trim() || 'no output'})`,
            ),
          );
        }
      }, 8_000);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf8');
        const match = /NIGHTFALL_SCORECARD_LISTENING=(http:\/\/[^\s\r\n]+)/.exec(stdoutBuf);
        if (match?.[1] && !settled) {
          settled = true;
          clearTimeout(startTimer);
          const url = match[1].trim();
          this.daemonProc = child;
          this.daemonUrl = url;
          resolve(url);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(startTimer);
          reject(err);
        }
      });

      child.on('exit', (code) => {
        if (this.daemonProc === child) {
          this.daemonProc = null;
          this.daemonUrl = null;
        }
        if (!settled) {
          settled = true;
          clearTimeout(startTimer);
          reject(
            new Error(
              `Nightfall Scorecard daemon exited prematurely with code ${code}: ${stderrBuf.trim()}`,
            ),
          );
        }
      });
    }).finally(() => {
      this.daemonStarting = null;
    });

    const url = await this.daemonStarting;
    await loopbackJsonRequest<{ status: string }>({
      baseUrl: url,
      method: 'GET',
      pathname: '/health',
      timeoutMs: 3_000,
    });
    return url;
  }

  async stopDaemon(): Promise<void> {
    const proc = this.daemonProc;
    this.daemonProc = null;
    this.daemonUrl = null;
    if (!proc || proc.exitCode !== null) {
      return;
    }
    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process already exited
        }
        resolve();
      }, 1_500);

      proc.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
      try {
        proc.kill('SIGTERM');
      } catch {
        clearTimeout(killTimer);
        resolve();
      }
    });
  }

  async dispose(): Promise<void> {
    await this.stopDaemon();
  }

  async fetchCheckCatalog(): Promise<ScorecardCheckCatalogEntry[]> {
    this.assertNotHalted();
    const url = await this.ensureDaemonRunning();
    const res = await loopbackJsonRequest<{
      checks: Array<{
        name: string;
        risk: string;
        short: string;
        description: string;
        tags?: string[];
        remediationSteps?: string[];
        supportedRepoTypes?: string[];
        documentationUrl: string;
      }>;
    }>({
      baseUrl: url,
      method: 'GET',
      pathname: '/checks',
      timeoutMs: 5_000,
    });

    return (res.checks ?? []).map((entry) =>
      ScorecardCheckCatalogEntrySchema.parse({
        ...entry,
        risk: normalizeRisk(entry.risk),
        tags: entry.tags ?? [],
        remediationSteps: entry.remediationSteps ?? [],
        supportedRepoTypes: entry.supportedRepoTypes ?? [],
      }),
    );
  }

  private async runCliOneshot(options: ScanRepositoryOptions): Promise<unknown> {
    const status = discoverScorecardToolchainSync({
      binDir: this.binDir,
      vendoredRootDir: this.vendoredRootDir,
    });
    if (!status.available || !status.binaryPath) {
      throw new Error(
        'Nightfall Scorecard binary not found. Run `pnpm build:scorecard` to build vendor/scorecard.',
      );
    }

    const args: string[] = ['--format=nightfall', '--show-details', '--show-annotations'];
    if ((options.targetType ?? 'local') === 'local') {
      if (!options.localPath) {
        throw new Error('localPath is required when targetType is local.');
      }
      args.push(`--local=${options.localPath}`);
    } else {
      const remote = options.remoteRepo ?? options.repository;
      args.push(`--repo=${remote}`);
      if (options.commit) {
        args.push(`--commit=${options.commit}`);
      }
    }
    if (options.checks && options.checks.length > 0) {
      args.push(`--checks=${options.checks.join(',')}`);
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NIGHTFALL_SCORECARD_GRACEFUL_NET: '1',
      ...(options.offline || this.offlineByDefault
        ? { NIGHTFALL_SCORECARD_OFFLINE: '1' }
        : {}),
    };

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        status.binaryPath!,
        args,
        {
          env,
          maxBuffer: 16 * 1024 * 1024,
          timeout: options.timeoutMs ?? 60_000,
        },
        (err, out, stderr) => {
          if (err && !out.trim().startsWith('{')) {
            reject(
              new Error(
                `Nightfall Scorecard CLI failed: ${stderr.trim() || err.message}`,
              ),
            );
            return;
          }
          resolve(out);
        },
      );
    });

    return JSON.parse(stdout);
  }

  async scanRepository(options: ScanRepositoryOptions): Promise<ScorecardReportRecord> {
    this.assertNotHalted();
    const targetType = options.targetType ?? (options.localPath ? 'local' : 'remote');
    const checks =
      options.checks && options.checks.length > 0
        ? options.checks
        : targetType === 'local'
          ? [...(options.offline ? FAST_WORKSPACE_SCORECARD_CHECKS : DEFAULT_LOCAL_SCORECARD_CHECKS)]
          : undefined;

    let rawPayload: unknown;
    if (this.preferDaemon && !options.offline) {
      const url = await this.ensureDaemonRunning();
      rawPayload = await loopbackJsonRequest<unknown>({
        baseUrl: url,
        method: 'POST',
        pathname: '/scan',
        body: {
          local: targetType === 'local' ? options.localPath : undefined,
          repo:
            targetType === 'remote'
              ? (options.remoteRepo ?? options.repository)
              : undefined,
          commit: options.commit,
          checks,
          format: 'nightfall',
          show_details: true,
          show_annotations: true,
        },
        timeoutMs: options.timeoutMs ?? 60_000,
      });
    } else if (this.preferDaemon && options.offline && this.offlineByDefault) {
      const url = await this.ensureDaemonRunning();
      rawPayload = await loopbackJsonRequest<unknown>({
        baseUrl: url,
        method: 'POST',
        pathname: '/scan',
        body: {
          local: targetType === 'local' ? options.localPath : undefined,
          repo:
            targetType === 'remote'
              ? (options.remoteRepo ?? options.repository)
              : undefined,
          commit: options.commit,
          checks,
          format: 'nightfall',
          show_details: true,
          show_annotations: true,
        },
        timeoutMs: options.timeoutMs ?? 45_000,
      });
    } else {
      rawPayload = await this.runCliOneshot({ ...options, targetType, checks });
    }

    const wire = NightfallWireScorecardEnvelopeSchema.parse(rawPayload);
    const shortRepo =
      options.repository.split('/').filter(Boolean).pop() ?? options.repository;
    const reportId = `SCR-${crypto
      .createHash('sha256')
      .update(`scorecard-report:${shortRepo}`)
      .digest('hex')
      .slice(0, 10)
      .toUpperCase()}`;

    const normalizedChecks = wire.checks.map((c) => ({
      ...c,
      score: Math.max(-1, Math.min(10, c.score)),
      risk: normalizeRisk(c.risk),
    }));

    const report = ScorecardReportRecordSchema.parse({
      id: reportId,
      repository: options.repository,
      targetUri: wire.repo.name,
      targetType,
      observedRevision:
        wire.repo.commit && wire.repo.commit !== 'unknown'
          ? wire.repo.commit.slice(0, 12)
          : 'local-working-tree',
      evaluatedAt: wire.date || new Date().toISOString(),
      aggregateScore:
        wire.score < 0 ? -1 : Math.round(Math.min(10, Math.max(0, wire.score)) * 10) / 10,
      scorecardVersion: wire.scorecard.version || 'v5.6.0-nightfall',
      scorecardCommit: wire.scorecard.commit || SCORECARD_PINNED_COMMIT,
      riskSummary: wire.riskSummary,
      checks: normalizedChecks,
      promotedFindingIds: [],
    });

    this.auditLedger?.append({
      subsystem: 'scorecard',
      action: 'scorecard.repository_evaluated',
      entityId: report.id,
      actor: 'nightfall-scorecard',
      summary: `Evaluated ${report.repository} (${report.targetType}) -> aggregate ${report.aggregateScore}/10 across ${report.checks.length} check(s).`,
      metadata: {
        repository: report.repository,
        aggregateScore: report.aggregateScore,
        checksCount: report.checks.length,
        passingChecks: report.riskSummary.passingChecks,
      },
    });

    return report;
  }
}

export function formatScorecardReportTable(
  report: ScorecardReportRecord,
  options?: { showDetails?: boolean },
): string {
  const lines: string[] = [];
  const scoredCount = report.checks.filter((c) => c.score >= 0).length;
  const scoreDisplay =
    report.aggregateScore < 0 ? 'N/A' : `${report.aggregateScore.toFixed(1)} / 10.0`;

  lines.push('Nightfall Scorecard · Supply-Chain & Repository Posture');
  lines.push(`  Repository        : ${report.repository} (${report.targetType})`);
  lines.push(`  Target URI        : ${report.targetUri}`);
  lines.push(`  Observed Revision : ${report.observedRevision}`);
  lines.push(`  Aggregate Score   : ${scoreDisplay}`);
  lines.push(
    `  Evaluated Checks  : ${scoredCount} scored · ${report.riskSummary.passingChecks} passing · ${report.riskSummary.inconclusiveChecks} inconclusive`,
  );
  lines.push(
    `  Failing by Risk   : ${report.riskSummary.criticalFailing} critical · ${report.riskSummary.highFailing} high · ${report.riskSummary.mediumFailing} medium · ${report.riskSummary.lowFailing} low`,
  );
  if (report.promotedFindingIds.length > 0) {
    lines.push(`  Promoted Findings : ${report.promotedFindingIds.join(', ')}`);
  }
  lines.push('');
  lines.push(
    `  ${'SCORE'.padEnd(8)}  ${'RISK'.padEnd(8)}  ${'STATUS'.padEnd(12)}  ${'CHECK'.padEnd(24)}  SUMMARY`,
  );
  lines.push(
    `  ${'--------'}  ${'--------'}  ${'------------'}  ${'------------------------'}  ${'----------------------------------------'}`,
  );

  const sorted = [...report.checks].sort((a, b) => a.name.localeCompare(b.name));
  for (const check of sorted) {
    const scoreCell = check.score < 0 ? '  - / 10' : `${String(check.score).padStart(2, ' ')} / 10`;
    lines.push(
      `  ${scoreCell.padEnd(8)}  ${check.risk.padEnd(8)}  ${check.status.toUpperCase().padEnd(12)}  ${check.name.padEnd(24)}  ${check.reason}`,
    );
    if (options?.showDetails) {
      for (const detail of check.details.slice(0, 4)) {
        lines.push(`      · ${detail}`);
      }
    }
  }

  return lines.join('\n');
}
