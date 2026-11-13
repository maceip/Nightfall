import fs from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FindingRecordSchema,
  generateScopeKeyPair,
  signCampaignManifest,
  type CampaignYamlV5,
} from '@nightfall/core-contracts';
import { EgressPolicyProxy } from '@nightfall/red-team';
import { NightfallOrchestrator } from '@nightfall/closed-loop-orchestrator';
import {
  ALICE_TOKEN,
  BASELINE_ASSET_EXPORT_TEST_MJS,
  BASELINE_NORTHSTAR_SEARCH_EXPORTS_TEST_PY,
  BOB_TOKEN,
  BOB_WORKSPACE_ID,
  DEFECTIVE_HARDCODED_DIFF_ASSET_EXPORT,
  DEFECTIVE_HARDCODED_PATCH_ASSET_EXPORT_MJS,
  MINIMAL_ASSET_EXPORT_DIFF,
  MINIMAL_NORTHSTAR_SEARCH_EXPORTS_DIFF,
  MINIMAL_PATCHED_ASSET_EXPORT_MJS,
  MINIMAL_PATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
  NorthstarDocsTestbedServer,
  SECURITY_INVARIANT_ASSET_EXPORT_TEST_MJS,
  SECURITY_NORTHSTAR_SEARCH_EXPORTS_DIFF,
  SECURITY_NORTHSTAR_SEARCH_EXPORTS_TEST_PY,
  SECURITY_TEST_DIFF_ASSET_EXPORT,
  UNPATCHED_ASSET_EXPORT_MJS,
  UNPATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
  WS_A_CANARY,
  WS_CHANNEL_CANARY,
} from './index.js';

describe('@nightfall/benchmarks E2E Security Verification & Closed-Loop Remediation Suite', () => {
  const testbeds: NorthstarDocsTestbedServer[] = [];
  const orchestrators: NightfallOrchestrator[] = [];
  const proxies: EgressPolicyProxy[] = [];

  afterEach(async () => {
    while (proxies.length > 0) {
      await proxies.pop()?.stopServer();
    }
    while (orchestrators.length > 0) {
      await orchestrators.pop()?.dispose();
    }
    while (testbeds.length > 0) {
      await testbeds.pop()?.stop();
    }
  });

  it('1. proves EgressPolicyProxy blocks out-of-scope hosts, DELETE verbs, unapproved WS paths, excess RPS, and kill-switch with 0 upstream leaks', async () => {
    const testbed = new NorthstarDocsTestbedServer();
    testbeds.push(testbed);
    const { baseUrl, wsUrl } = await testbed.start(0);

    const orchestrator = new NightfallOrchestrator();
    orchestrators.push(orchestrator);

    const keys = generateScopeKeyPair('bench-egress-key');
    const manifest: CampaignYamlV5 = {
      objective: 'Verify L7 egress boundary zero-leak invariant.',
      campaign: {
        name: 'bench-egress-scope',
        targets: [baseUrl],
        source: { archive: 'northstar-docs-source.tar.gz' },
        max_duration: '15m',
        max_requests_per_second: 2,
      },
      credentials: {},
      http: {
        allow: [{ methods: ['GET', 'POST'], path_prefixes: ['/api/'] }],
      },
      websocket: {
        allow: [{ paths: ['/ws/documents'], origins: ['*'], operations: ['open', 'send'] }],
      },
    };
    const signedManifest = signCampaignManifest(manifest, keys.privateKeyPem, keys.keyId);

    let simulatedNow = 5_000_000;
    const proxy = new EgressPolicyProxy({
      signedManifest,
      publicKeyPem: keys.publicKeyPem,
      campaignId: 'camp-bench-egress',
      askForApproval: true,
      policyGate: orchestrator.policyGate,
      auditLedger: orchestrator.auditLedger,
      startedAtMs: simulatedNow,
      nowFn: () => simulatedNow,
    });
    proxies.push(proxy);

    // Out-of-scope host blocked
    const outOfScope = await proxy.proxyHttpRequest({
      method: 'GET',
      url: 'https://production.northstardocs.com/api/me',
    });
    expect(outOfScope.allowed).toBe(false);
    expect(outOfScope.statusCode).toBe(403);

    // Disallowed HTTP verb (DELETE) blocked
    const disallowedVerb = await proxy.proxyHttpRequest({
      method: 'DELETE',
      url: `${baseUrl}/api/documents/doc_ws_a_101`,
    });
    expect(disallowedVerb.allowed).toBe(false);
    expect(disallowedVerb.statusCode).toBe(403);

    // Unapproved WebSocket path (/ws/admin) blocked
    const disallowedWs = await proxy.proxyWebSocketOperation({
      url: `${wsUrl}/ws/admin`,
      origin: '*',
      operation: 'open',
    });
    expect(disallowedWs.allowed).toBe(false);

    // Prove ZERO out-of-scope / disallowed requests leaked to NorthstarDocsTestbedServer!
    expect(testbed.getUpstreamHits()).toHaveLength(0);

    // Exhaust 2 RPS token bucket and prove 3rd immediate request is rate-limited (429) with 0 leak
    const r1 = await proxy.proxyHttpRequest({
      method: 'GET',
      url: `${baseUrl}/api/workspaces/templates/documents/104`,
    });
    const r2 = await proxy.proxyHttpRequest({
      method: 'GET',
      url: `${baseUrl}/api/workspaces/templates/documents/104`,
    });
    const r3 = await proxy.proxyHttpRequest({
      method: 'GET',
      url: `${baseUrl}/api/workspaces/templates/documents/104`,
    });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    expect(r3.statusCode).toBe(429);
    expect(testbed.getUpstreamHits()).toHaveLength(2);

    // Refill tokens and engage emergency kill-switch -> blocked with 503 and 0 additional upstream hits
    simulatedNow += 2_000;
    orchestrator.setKillSwitch(true, 'Benchmark kill-switch verification');
    const killedReq = await proxy.proxyHttpRequest({
      method: 'GET',
      url: `${baseUrl}/api/workspaces/templates/documents/104`,
    });
    expect(killedReq.allowed).toBe(false);
    expect(killedReq.statusCode).toBe(503);
    expect(testbed.getUpstreamHits()).toHaveLength(2);

    const safety = orchestrator.auditLedger.getSafetyMonitorStatus();
    expect(safety.withinApprovedScope).toBe(true);
    expect(safety.blockedRequestsCount).toBe(5);
  });

  it('2. safely confirms cross-tenant gaps on NorthstarDocsTestbedServer, filters static FPs, and attests sandbox teardown', async () => {
    const testbed = new NorthstarDocsTestbedServer();
    testbeds.push(testbed);
    const { baseUrl } = await testbed.start(0);

    const orchestrator = new NightfallOrchestrator();
    orchestrators.push(orchestrator);

    const assessment = await orchestrator.redTeam.runAssessmentAgainstTestbed({
      campaignId: 'camp-bench-rt',
      targetBaseUrl: baseUrl,
      aliceToken: ALICE_TOKEN,
      bobToken: BOB_TOKEN,
      bobWorkspaceId: BOB_WORKSPACE_ID,
      externalFindings: [
        { id: 'EXT-FP-DEAD', route: '/api/v0/deprecated', reachableInCode: false, sanitizedInCode: false },
        { id: 'EXT-FP-SAFE', route: '/api/workspaces/:id/search', reachableInCode: true, sanitizedInCode: true },
        { id: 'EXT-REAL-CANDIDATE', route: '/api/workspaces/:id/exports', reachableInCode: true, sanitizedInCode: false },
      ],
    });

    // Confirmed both F-001 (WebSocket channel ACL) and F-002 (saved-search export) using benign markers
    expect(assessment.confirmedFindings.map((f) => f.id).sort()).toEqual(['F-001', 'F-002']);
    expect(
      assessment.evidenceBundles.some((ev) => ev.canaryMarker === WS_CHANNEL_CANARY),
    ).toBe(true);
    expect(
      assessment.evidenceBundles.some((ev) => ev.canaryMarker === WS_A_CANARY),
    ).toBe(true);

    // Static false positives discarded with code-level rationale
    expect(assessment.externalEvaluations.filter((e) => e.disposition === 'discarded_fp')).toHaveLength(2);
    expect(assessment.externalEvaluations.find((e) => e.id === 'EXT-REAL-CANDIDATE')?.disposition).toBe(
      'needs_runtime_check',
    );

    // Direct REST GET /api/documents/doc_ws_a_101 was falsified & recorded in SharedKnowledgeStore
    expect(
      orchestrator.sharedMemory.hasFalsifiedEquivalent(
        'camp-bench-rt',
        'Check whether direct REST GET /api/documents/doc_ws_a_101 allows cross-workspace read by Bob',
      ),
    ).toBe(true);

    // Clean-room sandbox destroyed with valid SHA-256 TeardownAttestation
    expect(assessment.teardownAttestation.sha256Attestation).toMatch(/^[a-f0-9]{64}$/);
    expect(assessment.teardownAttestation.filesErasedCount).toBeGreaterThanOrEqual(2);
    await expect(
      fs.access(`/tmp/nightfall-sandboxes/${assessment.teardownAttestation.sandboxId}`),
    ).rejects.toThrow();
  });

  it('3. executes real Two-Stage Test Proof on asset_export.mjs in DisposableSandboxRuntime and suppresses defective/bloated patches', async () => {
    const orchestrator = new NightfallOrchestrator();
    orchestrators.push(orchestrator);
    await orchestrator.ensureBootstrapped();

    const assetFinding = FindingRecordSchema.parse(
      orchestrator
        .getBootstrapState()
        .findings.find((f) => f.repository === 'asset-servicing'),
    );

    // A) Minimal surgical patch passes Baseline -> Red (fails on unpatched) -> Green (passes on patched) + Regression + Critic
    const goodResult = await orchestrator.defenseFactory.runTwoStageModuleProof(assetFinding, {
      targetFileName: 'asset_export.mjs',
      unmodifiedSource: UNPATCHED_ASSET_EXPORT_MJS,
      patchedSource: MINIMAL_PATCHED_ASSET_EXPORT_MJS,
      baselineTestFileName: 'asset_export.baseline.test.mjs',
      baselineTestSource: BASELINE_ASSET_EXPORT_TEST_MJS,
      securityTestFileName: 'asset_export.security.test.mjs',
      securityTestSource: SECURITY_INVARIANT_ASSET_EXPORT_TEST_MJS,
      unifiedDiff: MINIMAL_ASSET_EXPORT_DIFF,
      securityTestDiff: SECURITY_TEST_DIFF_ASSET_EXPORT,
      explanation: 'Enforces isProjectMember(callerUserId, asset.projectId) before returning export payload.',
    });

    expect(goodResult.proposal.status).toBe('proposed');
    expect(goodResult.proposal.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(goodResult.proposal.gates).toMatchObject({
      baselineBuildPassed: true,
      redPhaseFailedAsExpected: true,
      greenPhasePassed: true,
      regressionSuitePassed: true,
      staticHygienePassed: true,
      criticApproved: true,
    });
    expect(goodResult.teardownAttestation.sha256Attestation).toMatch(/^[a-f0-9]{64}$/);

    // B) Defective patch that hardcodes test actor IDs ('user_proj_b') is suppressed by Critic Gate!
    const hardcodedResult = await orchestrator.defenseFactory.runTwoStageModuleProof(assetFinding, {
      targetFileName: 'asset_export.mjs',
      unmodifiedSource: UNPATCHED_ASSET_EXPORT_MJS,
      patchedSource: DEFECTIVE_HARDCODED_PATCH_ASSET_EXPORT_MJS,
      baselineTestFileName: 'asset_export.baseline.test.mjs',
      baselineTestSource: BASELINE_ASSET_EXPORT_TEST_MJS,
      securityTestFileName: 'asset_export.security.test.mjs',
      securityTestSource: SECURITY_INVARIANT_ASSET_EXPORT_TEST_MJS,
      unifiedDiff: DEFECTIVE_HARDCODED_DIFF_ASSET_EXPORT,
      securityTestDiff: SECURITY_TEST_DIFF_ASSET_EXPORT,
    });

    expect(hardcodedResult.proposal.status).toBe('suppressed');
    expect(hardcodedResult.proposal.gates.criticApproved).toBe(false);
    expect(hardcodedResult.proposal.gates.criticNotes).toContain('test-string blocklisting');
  });

  it('4. closes the full loop: Red Team discovery -> Defense Factory Microsoft LiteBox Python fix -> merge -> live post-patch closure verification', async () => {
    const testbed = new NorthstarDocsTestbedServer();
    testbeds.push(testbed);
    const { baseUrl } = await testbed.start(0);

    const orchestrator = new NightfallOrchestrator({ stagingTargetUrl: baseUrl });
    orchestrators.push(orchestrator);

    // Step 1: Discover and confirm F-001 & F-002 against unpatched staging testbed
    const assessment = await orchestrator.redTeam.runAssessmentAgainstTestbed({
      campaignId: 'camp-closed-loop',
      targetBaseUrl: baseUrl,
      aliceToken: ALICE_TOKEN,
      bobToken: BOB_TOKEN,
      bobWorkspaceId: BOB_WORKSPACE_ID,
    });
    orchestrator.ingestAssessmentResult(assessment);

    // Step 2: Obtain / start FixProposal for F-002 and F-001 (runs inside real Microsoft LiteBox!)
    const { fix: fixF002 } = await orchestrator.startFixForFinding('F-002');
    const { fix: fixF001 } = await orchestrator.startFixForFinding('F-001');
    expect(fixF002.status).toBe('proposed');
    expect(fixF002.sandboxBackend).toBe('microsoft-litebox');
    expect(fixF002.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(fixF001.status).toBe('proposed');
    expect(fixF001.sandboxBackend).toBe('microsoft-litebox');
    expect(fixF001.commitSha).toMatch(/^[a-f0-9]{40}$/);

    // Step 3: Apply remediations on staging target & run mergeAndVerifyFix with live replay + LiteBox Python closure check!
    testbed.setPatched(true);

    const verifiedF002 = await orchestrator.mergeAndVerifyFix(fixF002.id, {
      targetBaseUrl: baseUrl,
      aliceToken: ALICE_TOKEN,
      bobToken: BOB_TOKEN,
    });
    expect(verifiedF002.fix.status).toBe('merged');
    expect(verifiedF002.finding?.status).toBe('fixed');
    expect(verifiedF002.finding?.fixVerification).toBe('verified');
    expect(verifiedF002.verificationResult?.securityProbeBlocked).toBe(true);
    expect(verifiedF002.verificationResult?.normalBehaviorPreserved).toBe(true);
    expect(verifiedF002.verificationResult?.teardownAttestation.backend).toBe(
      'microsoft-litebox',
    );

    const verifiedF001 = await orchestrator.mergeAndVerifyFix(fixF001.id, {
      targetBaseUrl: baseUrl,
      aliceToken: ALICE_TOKEN,
      bobToken: BOB_TOKEN,
    });
    expect(verifiedF001.fix.status).toBe('merged');
    expect(verifiedF001.finding?.status).toBe('fixed');
    expect(verifiedF001.finding?.fixVerification).toBe('verified');
    expect(verifiedF001.verificationResult?.securityProbeBlocked).toBe(true);
    expect(verifiedF001.verificationResult?.normalBehaviorPreserved).toBe(true);

    // Step 4: Cryptographic AuditLedger integrity holds across the entire closed loop
    const integrity = orchestrator.auditLedger.verifyIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.checkedCount).toBeGreaterThanOrEqual(8);
  });

  it('5. executes Python search_exports.py Two-Stage Proof directly inside real Microsoft LiteBox (litebox_runner_linux_userland)', async () => {
    const orchestrator = new NightfallOrchestrator();
    orchestrators.push(orchestrator);

    const pythonFinding = FindingRecordSchema.parse({
      id: 'F-002',
      title: 'Saved-search background export leaks cross-workspace documents',
      subtitle: 'northstar-docs · F-002 · Confirmed reproduction',
      repository: 'northstar-docs',
      observedRevision: 'e81a442',
      severity: 'high',
      status: 'triaged',
      fixVerification: 'not_recorded',
      weaknessCwe: 'CWE-862 · Missing authorization',
      owner: { name: 'Leo', initials: 'L', team: 'Experience', avatarColor: '#dceeff' },
      sources: ['nightfall', 'red-team'],
      summary: 'Saved-search export omits per-document ACL verification and SQL parameter binding.',
      rootCause: 'String-interpolated LIKE clause and missing can_read_document check.',
      impactAndAttackPath: 'Cross-workspace document leakage in export archive.',
      preconditions: ['Authenticated workspace session'],
      remediation: 'Parameterize SQL LIKE query and enforce can_read_document per row.',
      codeReferences: [{ file: 'northstar_docs/Export/search_exports.py', startLine: 96, endLine: 115 }],
      rootCauseClusterKey: 'northstar-docs:search-export-acl',
      createdAt: '2026-11-12T00:00:00.000Z',
      updatedAt: '2026-11-12T00:00:00.000Z',
    });

    const proof = await orchestrator.defenseFactory.runTwoStageModuleProof(pythonFinding, {
      targetFileName: 'search_exports.py',
      repoFilePath: 'northstar_docs/Export/search_exports.py',
      repoSecurityTestPath: 'tests/test_search_exports_security.py',
      unmodifiedSource: UNPATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
      patchedSource: MINIMAL_PATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
      baselineTestFileName: 'baseline_test.py',
      baselineTestSource: BASELINE_NORTHSTAR_SEARCH_EXPORTS_TEST_PY,
      securityTestFileName: 'security_test.py',
      securityTestSource: SECURITY_NORTHSTAR_SEARCH_EXPORTS_TEST_PY,
      unifiedDiff: MINIMAL_NORTHSTAR_SEARCH_EXPORTS_DIFF,
      securityTestDiff: SECURITY_NORTHSTAR_SEARCH_EXPORTS_DIFF,
      explanation: 'Parameterizes SQL filter and enforces per-document can_read_document check.',
    });

    expect(proof.proposal.status).toBe('proposed');
    expect(proof.proposal.sandboxBackend).toBe('microsoft-litebox');
    expect(proof.teardownAttestation.backend).toBe('microsoft-litebox');
    expect(proof.proposal.branchName).toBe('nightfall/fix-f-002');
    expect(proof.proposal.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(proof.proposal.prNumber).toBeUndefined();
    expect(proof.proposal.prUrl).toBeUndefined();
  });
});
