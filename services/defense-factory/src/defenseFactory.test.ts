import { describe, expect, it } from 'vitest';
import { INITIAL_FINDINGS, INITIAL_FIXES } from '@nightfall/mock-fixtures';
import type { FindingRecord } from '@nightfall/core-contracts';
import { RootCauseDeduplicator } from './deduplicator.js';
import { DefenseFactoryEngine } from './defenseFactoryEngine.js';

describe('@nightfall/defense-factory Deduplicator & Two-Stage Proof Engine', () => {
  it('clusters duplicate findings by rootCauseClusterKey and enforces per-team WIP limits', () => {
    const deduplicator = new RootCauseDeduplicator({ maxOpenProposalsPerTeam: 2 });
    const baseFinding = INITIAL_FINDINGS[0]!;

    const dupLow: FindingRecord = {
      ...baseFinding,
      id: 'SEC-1034-DUP-1',
      severity: 'medium',
      fixId: undefined,
    };
    const dupHigh: FindingRecord = {
      ...baseFinding,
      id: 'SEC-1034-DUP-2',
      severity: 'critical',
      fixId: undefined,
    };
    const clusterB: FindingRecord = {
      ...baseFinding,
      id: 'SEC-2001',
      rootCauseClusterKey: 'asset-servicing:cluster-b',
      fixId: undefined,
    };
    const clusterC: FindingRecord = {
      ...baseFinding,
      id: 'SEC-2002',
      rootCauseClusterKey: 'asset-servicing:cluster-c',
      fixId: undefined,
    };
    const clusterD: FindingRecord = {
      ...baseFinding,
      id: 'SEC-2003',
      rootCauseClusterKey: 'asset-servicing:cluster-d',
      fixId: undefined,
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

    // Only 2 clusters for team "Assets" should be dispatchable under maxOpenProposalsPerTeam: 2
    const dispatchableCount = clusters.filter((c) => c.dispatchable).length;
    expect(dispatchableCount).toBe(2);
    expect(clusters.some((c) => !c.dispatchable && c.deferredReason?.includes('WIP limit'))).toBe(
      true,
    );
  });

  it('runs hermetic Two-Stage Proof, suppresses naive test-fitting patches, and handles engineer follow-ups', async () => {
    const engine = new DefenseFactoryEngine();
    const targetFinding = INITIAL_FINDINGS[0]!;

    // 1. Valid minimal patch passes Red -> Green + Regression + Critic
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
    expect(validProof.proposal.gates.baselineBuildPassed).toBe(true);
    expect(validProof.proposal.gates.redPhaseFailedAsExpected).toBe(true);
    expect(validProof.proposal.gates.greenPhasePassed).toBe(true);
    expect(validProof.proposal.gates.regressionSuitePassed).toBe(true);
    expect(validProof.proposal.gates.criticApproved).toBe(true);
    expect(validProof.teardownAttestation.sha256Attestation).toHaveLength(64);

    // 2. Interactive engineer follow-up refines FixProposal and appends conversation
    const updatedFix = await engine.applyEngineerFollowUp(
      validProof.proposal,
      'Please add structured audit logging on denied cross-project requests.',
    );
    expect(updatedFix.conversation.length).toBeGreaterThanOrEqual(3);
    expect(updatedFix.unifiedDiff).toContain('auditSecurityDenial');
    expect(updatedFix.gates.criticApproved).toBe(true);

    // 3. Patch touching unrelated extra files is suppressed by Critic Gate
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
    expect(INITIAL_FIXES).toBeDefined();
  });
});
