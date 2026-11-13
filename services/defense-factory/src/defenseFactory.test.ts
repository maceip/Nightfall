import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { FindingRecord } from '@nightfall/core-contracts';
import { RootCauseDeduplicator } from './deduplicator.js';
import { DefenseFactoryEngine } from './defenseFactoryEngine.js';
import { GitPatchPackager } from './gitPackager.js';
import { UNPATCHED_NORTHSTAR_SEARCH_EXPORTS_PY } from './pythonFixtures.js';
import { RepositoryScanner } from './repositoryScanner.js';

const execFileAsync = promisify(execFile);

function makeSampleFinding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  const nowIso = '2026-11-12T00:00:00.000Z';
  return {
    id: 'SEC-1034',
    title: 'Missing authorization — exportProjectPortfolio (asset-servicing)',
    subtitle: 'asset-servicing · SEC-1034 · Discovered by local source scan',
    repository: 'asset-servicing',
    observedRevision: 'a1b2c3d',
    severity: 'critical',
    status: 'triaged',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-862 · Missing authorization',
    owner: { name: 'Leo', initials: 'L', team: 'Assets', avatarColor: '#dceeff' },
    sources: ['nightfall', 'sast'],
    summary: 'Export handler omits caller project membership check.',
    rootCause: 'Missing isProjectMember guard in exportProjectPortfolio.',
    impactAndAttackPath: 'Cross-project portfolio export.',
    preconditions: ['Authenticated session'],
    remediation: 'Check isProjectMember before returning portfolio.',
    codeReferences: [
      {
        file: 'src/exportHandler.mjs',
        startLine: 18,
        endLine: 28,
        description: 'Export handler missing caller project/tenant equality guard',
      },
    ],
    rootCauseClusterKey: 'asset-servicing:cwe-862-missing-authorization:src/exportHandler.mjs:exportProjectPortfolio',
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

describe('@nightfall/defense-factory Scanner, GitPackager, Deduplicator & LiteBox Proof Engine', () => {
  it('clusters duplicate findings by rootCauseClusterKey and enforces per-team WIP limits', () => {
    const deduplicator = new RootCauseDeduplicator({ maxOpenProposalsPerTeam: 2 });
    const baseFinding = makeSampleFinding();

    const dupLow: FindingRecord = {
      ...baseFinding,
      id: 'SEC-1034-DUP-1',
      severity: 'medium',
    };
    const dupHigh: FindingRecord = {
      ...baseFinding,
      id: 'SEC-1034-DUP-2',
      severity: 'critical',
    };
    const clusterB: FindingRecord = {
      ...baseFinding,
      id: 'SEC-2001',
      rootCauseClusterKey: 'asset-servicing:cluster-b',
    };
    const clusterC: FindingRecord = {
      ...baseFinding,
      id: 'SEC-2002',
      rootCauseClusterKey: 'asset-servicing:cluster-c',
    };
    const clusterD: FindingRecord = {
      ...baseFinding,
      id: 'SEC-2003',
      rootCauseClusterKey: 'asset-servicing:cluster-d',
    };

    const clusters = deduplicator.clusterAndRoute(
      [dupLow, dupHigh, clusterB, clusterC, clusterD],
      [],
    );

    expect(clusters).toHaveLength(4);
    const mergedCluster = clusters.find(
      (c) => c.clusterKey === baseFinding.rootCauseClusterKey,
    )!;
    expect(mergedCluster.findingIds).toHaveLength(2);
    expect(mergedCluster.highestSeverity).toBe('critical');

    const dispatchableCount = clusters.filter((c) => c.dispatchable).length;
    expect(dispatchableCount).toBe(2);
    expect(clusters.some((c) => !c.dispatchable && c.deferredReason?.includes('WIP limit'))).toBe(
      true,
    );
  });

  it('scans real local and cloned repositories across all 6 CWE analyzers with exact line ranges and real revisions', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-scanner-test-'));
    const repoDir = path.join(tmpRoot, 'multi-vuln-repo');
    await fs.mkdir(path.join(repoDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(repoDir, 'py'), { recursive: true });
    await fs.mkdir(path.join(repoDir, 'node_modules', 'ignored-pkg'), { recursive: true });

    try {
      // Should be skipped (node_modules and *.test.ts)
      await fs.writeFile(
        path.join(repoDir, 'node_modules', 'ignored-pkg', 'bad.js'),
        'eval(userInput);\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(repoDir, 'src', 'skipMe.test.ts'),
        'eval(userInput);\n',
        'utf8',
      );

      // JS/TS file with CWE-78, CWE-94, CWE-89, CWE-22, CWE-862
      await fs.writeFile(
        path.join(repoDir, 'src', 'handlers.ts'),
        `import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';

export function runDiagnostic(host: string) {
  return execSync(\`ping -c 1 \${host}\`);
}

export function compilePredicate(expr: string) {
  return new Function('ctx', expr);
}

export function queryInvoices(db: { all: (s: string) => unknown[] }, filter: string) {
  return db.all(\`SELECT id FROM invoices WHERE memo LIKE '%\${filter}%'\`);
}

export async function downloadAttachment(req: { query: { p: string } }) {
  return fs.readFile(req.query.p, 'utf8');
}

export function exportCustomerBundle(caller: { id: string }, bundleId: string) {
  return { status: 200, bundleId, callerId: caller.id };
}
`,
        'utf8',
      );

      // Python file with CWE-502 and CWE-862
      await fs.writeFile(
        path.join(repoDir, 'py', 'worker.py'),
        `import pickle

def decode_job(raw_bytes: bytes):
    return pickle.loads(raw_bytes)

def export_saved_search(db, job):
    return db.fetch_all(job)
`,
        'utf8',
      );

      const scanner = new RepositoryScanner();

      // 1. Non-git directory computes deterministic 7-hex SHA-256 digest
      const nonGitScan = await scanner.scanRepository({
        repository: 'auth-gateway',
        localPath: repoDir,
      });
      expect(nonGitScan.observedRevision).toMatch(/^[0-9a-f]{7}$/);
      expect(nonGitScan.filesScannedCount).toBe(2);

      const detectedCwes = new Set(nonGitScan.findings.map((f) => f.weaknessCwe));
      expect(detectedCwes.has('CWE-78 · OS Command Injection')).toBe(true);
      expect(detectedCwes.has('CWE-94 · Code Injection')).toBe(true);
      expect(detectedCwes.has('CWE-89 · SQL Injection')).toBe(true);
      expect(detectedCwes.has('CWE-22 · Path Traversal')).toBe(true);
      expect(detectedCwes.has('CWE-502 · Deserialization of Untrusted Data')).toBe(true);
      expect(detectedCwes.has('CWE-862 · Missing authorization')).toBe(true);

      const cmdFinding = nonGitScan.findings.find((f) => f.weaknessCwe.startsWith('CWE-78'))!;
      expect(cmdFinding.codeReferences[0]?.file).toBe('src/handlers.ts');
      expect(cmdFinding.codeReferences[0]?.startLine).toBe(4);
      expect(cmdFinding.codeReferences[0]?.endLine).toBe(6);

      // 2. Initialize real git repo and verify git rev-parse --short HEAD + specific_paths + cloneUrl
      await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: repoDir });
      await execFileAsync('git', ['add', '.'], { cwd: repoDir });
      await execFileAsync(
        'git',
        [
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@nightfall.local',
          'commit',
          '-q',
          '-m',
          'initial',
        ],
        { cwd: repoDir },
      );
      const { stdout: expectedHead } = await execFileAsync(
        'git',
        ['rev-parse', '--short', 'HEAD'],
        { cwd: repoDir },
      );

      const scopedScan = await scanner.scanRepository({
        repository: 'auth-gateway',
        localPath: repoDir,
        scope: 'specific_paths',
        paths: ['py/worker.py'],
      });
      expect(scopedScan.observedRevision).toBe(expectedHead.trim());
      expect(scopedScan.filesScannedCount).toBe(1);
      expect(scopedScan.findings.every((f) => f.codeReferences[0]?.file === 'py/worker.py')).toBe(
        true,
      );

      // 3. Clone via cloneUrl inside DisposableSandboxRuntime and verify teardownAttestation
      const clonedScan = await scanner.scanRepository({
        repository: 'auth-gateway',
        cloneUrl: `file://${repoDir}`,
      });
      expect(clonedScan.observedRevision).toBe(expectedHead.trim());
      expect(clonedScan.teardownAttestation?.sha256Attestation).toHaveLength(64);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('executes Python search_exports.py Two-Stage Proof inside real Microsoft LiteBox and commits real git branch', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-litebox-df-'));
    const northstarDir = path.join(tmpRoot, 'northstar-docs');
    await fs.mkdir(path.join(northstarDir, 'northstar_docs', 'Export'), { recursive: true });

    try {
      await fs.writeFile(
        path.join(northstarDir, 'northstar_docs', 'Export', 'search_exports.py'),
        UNPATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
        'utf8',
      );
      await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: northstarDir });
      await execFileAsync('git', ['add', '.'], { cwd: northstarDir });
      await execFileAsync(
        'git',
        [
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@nightfall.local',
          'commit',
          '-q',
          '-m',
          'seed northstar-docs',
        ],
        { cwd: northstarDir },
      );

      const engine = new DefenseFactoryEngine({ workspaceReposRoot: tmpRoot });
      const pythonFinding = makeSampleFinding({
        id: 'F-002',
        title: 'Cross-workspace document leakage via saved-search export',
        repository: 'northstar-docs',
        weaknessCwe: 'CWE-862 · Missing authorization',
        sources: ['nightfall', 'red-team'],
        codeReferences: [
          {
            file: 'northstar_docs/Export/search_exports.py',
            startLine: 96,
            endLine: 115,
            description: 'Saved-search export omits per-document ACL check and SQL parameter binding',
          },
        ],
        rootCauseClusterKey: 'northstar-docs:search-export-acl-sqli',
      });

      const proposal = await engine.proposeFixForFindings(pythonFinding);
      expect(proposal.status).toBe('proposed');
      expect(proposal.sandboxBackend).toBe('microsoft-litebox');
      expect(proposal.branchName).toBe('nightfall/fix-f-002');
      expect(proposal.commitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(proposal.prNumber).toBeUndefined();
      expect(proposal.prUrl).toBeUndefined();
      expect(proposal.gates.baselineBuildPassed).toBe(true);
      expect(proposal.gates.redPhaseFailedAsExpected).toBe(true);
      expect(proposal.gates.greenPhasePassed).toBe(true);
      expect(proposal.gates.regressionSuitePassed).toBe(true);
      expect(proposal.gates.staticHygienePassed).toBe(true);
      expect(proposal.gates.criticApproved).toBe(true);

      // Verify the branch actually exists in northstar-docs/.git!
      const { stdout: branchTip } = await execFileAsync(
        'git',
        ['rev-parse', 'refs/heads/nightfall/fix-f-002'],
        { cwd: northstarDir },
      );
      expect(branchTip.trim()).toBe(proposal.commitSha);

      // Follow-up on Python fix runs inside real Microsoft LiteBox and advances commitSha
      const refined = await engine.applyEngineerFollowUp(
        proposal,
        'Please add structured audit logging on denied cross-workspace exports.',
      );
      expect(refined.sandboxBackend).toBe('microsoft-litebox');
      expect(refined.unifiedDiff).toContain('auditSecurityDenial');
      expect(refined.commitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(refined.commitSha).not.toBe(proposal.commitSha);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('runs hermetic Node Two-Stage Proof, suppresses bloated patches, and only sets PR URL when GitHub API succeeds', async () => {
    const engine = new DefenseFactoryEngine();
    const targetFinding = makeSampleFinding();

    const validProof = await engine.runTwoStageModuleProof(targetFinding, {
      targetFileName: 'guard.mjs',
      unmodifiedSource: `export function readDoc(callerWs, docWs) {
  if (!callerWs) return { status: 401 };
  return { status: 200, data: 'secret' };
}\n`,
      patchedSource: `export function readDoc(callerWs, docWs) {
  if (!callerWs) return { status: 401 };
  if (callerWs !== docWs) return { status: 403 };
  return { status: 200, data: 'secret' };
}\n`,
      baselineTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { readDoc } from './guard.mjs';
test('same workspace works', () => {
  assert.equal(readDoc('', 'ws1').status, 401);
  assert.equal(readDoc('ws1', 'ws1').status, 200);
});\n`,
      securityTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { readDoc } from './guard.mjs';
test('cross workspace denied', () => {
  assert.equal(readDoc('ws2', 'ws1').status, 403);
});\n`,
      unifiedDiff: `--- a/guard.mjs\n+++ b/guard.mjs\n@@ -2,2 +2,3 @@\n+  if (callerWs !== docWs) return { status: 403 };`,
      securityTestDiff: `+++ b/guard.security.test.mjs\n+assert.equal(readDoc('ws2', 'ws1').status, 403);`,
    });

    expect(validProof.proposal.status).toBe('proposed');
    expect(validProof.proposal.branchName).toBe('nightfall/fix-sec-1034');
    expect(validProof.proposal.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(validProof.proposal.prNumber).toBeUndefined();
    expect(validProof.proposal.prUrl).toBeUndefined();
    expect(validProof.teardownAttestation.sha256Attestation).toHaveLength(64);

    // Verify GitPatchPackager populates prNumber/prUrl when GitHub API returns 201 Created
    const packagerWithMockedGh = new GitPatchPackager({
      githubToken: 'ghp_test_token',
      githubRepo: 'northstar/asset-servicing',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            number: 42,
            html_url: 'https://github.com/northstar/asset-servicing/pull/42',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        )) as typeof fetch,
    });
    const ghArtifact = await packagerWithMockedGh.packageVerifiedFix({
      findingId: 'SEC-1034',
      repository: 'asset-servicing',
      commitMessage: 'fix(asset-servicing): enforce project ACL',
      targetFilePath: 'src/guard.mjs',
      unmodifiedSource: 'export const v = 1;\n',
      patchedSource: 'export const v = 2;\n',
      securityTestFilePath: 'src/guard.security.test.mjs',
      securityTestSource: 'import assert from "node:assert"; assert.equal(2, 2);\n',
    });
    expect(ghArtifact.prNumber).toBe(42);
    expect(ghArtifact.prUrl).toBe('https://github.com/northstar/asset-servicing/pull/42');

    // Interactive engineer follow-up refines FixProposal and appends conversation
    const updatedFix = await engine.applyEngineerFollowUp(
      validProof.proposal,
      'Please add structured audit logging on denied cross-project requests.',
    );
    expect(updatedFix.conversation.length).toBeGreaterThanOrEqual(3);
    expect(updatedFix.unifiedDiff).toContain('auditSecurityDenial');
    expect(updatedFix.gates.criticApproved).toBe(true);
    expect(updatedFix.commitSha).toMatch(/^[0-9a-f]{40}$/);

    // Patch touching unrelated extra files is suppressed by Critic Gate
    const bloatedProof = await engine.runTwoStageModuleProof(targetFinding, {
      targetFileName: 'guard.mjs',
      unmodifiedSource: `export const x = () => 200;\n`,
      patchedSource: `export const x = (ok) => (ok ? 200 : 403);\n`,
      baselineTestSource: `import test from 'node:test'; import assert from 'node:assert/strict'; import { x } from './guard.mjs'; test('ok', () => assert.equal(x(true), 200));\n`,
      securityTestSource: `import test from 'node:test'; import assert from 'node:assert/strict'; import { x } from './guard.mjs'; test('sec', () => assert.equal(x(false), 403));\n`,
      unifiedDiff: `--- a/guard.mjs\n+++ b/guard.mjs\n+export const x = (ok) => (ok ? 200 : 403);`,
      securityTestDiff: `+test('sec')`,
      extraFilesTouched: { 'unrelated/readme.txt': 'unwanted edit' },
    });
    expect(bloatedProof.proposal.status).toBe('suppressed');
    expect(bloatedProof.proposal.gates.criticApproved).toBe(false);
    expect(bloatedProof.proposal.commitSha).toBeUndefined();
  });
});
