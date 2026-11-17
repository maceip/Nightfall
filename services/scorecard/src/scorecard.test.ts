import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { PolicyGate } from '@nightfall/policy-gate';
import {
  SCORECARD_PINNED_COMMIT,
  ScorecardService,
  discoverScorecardToolchainSync,
  formatScorecardReportTable,
  mapScorecardReportToFindings,
} from './index.js';

describe('@nightfall/scorecard fused service & live Go daemon', () => {
  const activeServices: ScorecardService[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (activeServices.length > 0) {
      const svc = activeServices.pop();
      if (svc) {
        await svc.dispose();
      }
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('discovers the provisioned Nightfall Scorecard binary and vendored source tree', () => {
    const status = discoverScorecardToolchainSync();
    expect(status.available).toBe(true);
    expect(status.binaryPath).toContain('nightfall-scorecard');
    expect(status.pinnedCommit).toBe(SCORECARD_PINNED_COMMIT);
    expect(status.vendoredPath).toContain('scorecard');
    expect(status.version).toBeTruthy();
  });

  it('boots live nightfall-scorecard HTTP daemon, serves /checks catalog, scans local Git repo, and promotes findings', async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-sc-live-'));
    tempDirs.push(repoDir);

    await fs.mkdir(path.join(repoDir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(
      path.join(repoDir, '.github', 'workflows', 'ci.yml'),
      `name: CI
on: [issues, push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Triaging \${{ github.event.issue.title }}"
`,
      'utf8',
    );
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'ci@nightfall.local'], {
      cwd: repoDir,
      stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'Nightfall Test'], {
      cwd: repoDir,
      stdio: 'ignore',
    });
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'initial workflow'], {
      cwd: repoDir,
      stdio: 'ignore',
    });

    const policyGate = new PolicyGate();
    const service = new ScorecardService({
      policyGate,
      preferDaemon: true,
      offlineByDefault: true,
    });
    activeServices.push(service);

    const catalog = await service.fetchCheckCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(15);
    expect(catalog.some((c) => c.name === 'Dangerous-Workflow')).toBe(true);

    const daemonStatus = service.getToolchainStatus();
    expect(daemonStatus.serviceMode).toBe('daemon-http');
    expect(daemonStatus.daemonUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const report = await service.scanRepository({
      repository: 'acme/workflow-service',
      targetType: 'local',
      localPath: repoDir,
      checks: ['Dangerous-Workflow', 'Token-Permissions', 'Binary-Artifacts'],
      offline: true,
    });

    expect(report.observedRevision).toMatch(/^[0-9a-f]{12}$/);
    const dw = report.checks.find((c) => c.name === 'Dangerous-Workflow');
    expect(dw?.score).toBe(0);
    expect(dw?.status).toBe('fail');
    expect(dw?.findings.some((f) => Boolean(f.remediation?.patch))).toBe(true);

    const findings = mapScorecardReportToFindings(report);
    expect(findings.length).toBe(2); // Dangerous-Workflow + Token-Permissions
    const dwFinding = findings.find((f) => f.weaknessCwe.startsWith('CWE-78'));
    expect(dwFinding).toBeDefined();
    expect(dwFinding?.sources).toEqual(['nightfall', 'scorecard']);
    expect(dwFinding?.codeReferences[0]?.file).toBe('.github/workflows/ci.yml');
    expect(dwFinding?.codeReferences[0]?.startLine).toBe(8);

    const table = formatScorecardReportTable(report, { showDetails: true });
    expect(table).toContain('Nightfall Scorecard · Supply-Chain & Repository Posture');
    expect(table).toContain('Dangerous-Workflow');

    // Engaging Emergency Kill-Switch immediately halts daemon and rejects subsequent scans
    policyGate.engageKillSwitch('Unit test emergency halt');
    await expect(
      service.scanRepository({
        repository: 'acme/workflow-service',
        targetType: 'local',
        localPath: repoDir,
      }),
    ).rejects.toThrow(/Emergency kill-switch engaged/);
  });
});
