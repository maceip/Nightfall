import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  EvidenceBundleSchema,
  FindingRecordSchema,
  FixProposalSchema,
  NewScanRequestSchema,
  OverviewSummarySchema,
  RedTeamCampaignRunSchema,
  SandboxToolchainStatusSchema,
  type NewScanRequest,
} from '@nightfall/core-contracts';

export type EphemeralTestServer = {
  baseUrl: string;
  capturedScans: NewScanRequest[];
  close: () => Promise<void>;
};

export async function startContractValidatedTestServer(options?: {
  failFirstBootstrap?: boolean;
}): Promise<EphemeralTestServer> {
  let failFirstBootstrap = options?.failFirstBootstrap ?? false;
  const capturedScans: NewScanRequest[] = [];

  const overview = OverviewSummarySchema.parse({
    proposedFixesCount: 1,
    openFindingsCount: 2,
    fixedFindingsCount: 5,
    severityCounts: { critical: 1, high: 1, medium: 0, low: 0, informational: 0 },
    statusCounts: { new: 1, triaged: 1, in_progress: 0, fixed: 5 },
    sankeyLinks: [
      { source: 'Critical', target: 'Triaged', value: 1 },
      { source: 'High', target: 'New', value: 1 },
    ],
    dailyTrend: [
      { date: '2026-11-11', currentlyFixed: 4, newFindings: 1 },
      { date: '2026-11-12', currentlyFixed: 5, newFindings: 2 },
    ],
  });

  const findings = [
    FindingRecordSchema.parse({
      id: 'SEC-1034',
      title: 'Missing tenant workspace ACL guard on saved-search ZIP export',
      subtitle: 'northstar-docs · src/export/zipExporter.ts',
      repository: 'northstar-docs',
      observedRevision: 'a91f44c',
      severity: 'critical',
      status: 'triaged',
      fixVerification: 'not_recorded',
      weaknessCwe: 'CWE-862: Missing Authorization',
      owner: { name: 'Platform Sec', initials: 'PS', team: 'Security', avatarColor: 'slate' },
      sources: ['nightfall', 'red-team'],
      summary: 'Cross-workspace export permits unauthorized saved-search ZIP archive retrieval.',
      rootCause: 'Export handler omits workspaceId predicate when resolving savedSearchId.',
      impactAndAttackPath: 'Authenticated caller in Workspace B exports Workspace A documents.',
      preconditions: ['Valid session token in secondary workspace'],
      remediation: 'Bind workspaceId from authenticated session onto export query.',
      affectedEndpoint: 'POST /api/v1/exports/saved-search',
      architectureNotes: 'Export pipeline resolves saved searches in zipExporter.',
      defectsNotes: 'Unscoped lookup by primary key only.',
      verificationChainSummary: 'Verified differential response with canary NS-7b64c9e2.',
      codeReferences: [{ file: 'src/export/zipExporter.ts', startLine: 42, endLine: 58 }],
      rootCauseClusterKey: 'northstar-docs:zipExporter:cwe-862',
      campaignId: 'camp-northstar-live',
      evidenceBundleId: 'ev-1034',
      fixId: 'fix-1034',
      createdAt: '2026-11-12T02:00:00Z',
      updatedAt: '2026-11-12T02:10:00Z',
    }),
  ];

  const fixes = [
    FixProposalSchema.parse({
      id: 'fix-1034',
      title: 'Enforce workspace ACL on saved-search ZIP export',
      subtitle: 'SEC-1034 · Verified in Microsoft LiteBox',
      repository: 'northstar-docs',
      snapshotLabel: 'Nightfall · Red Team handoff',
      findingIds: ['SEC-1034'],
      severity: 'critical',
      status: 'proposed',
      changedFilesCount: 2,
      unifiedDiff: '--- a/src/export/zipExporter.ts\n+++ b/src/export/zipExporter.ts\n+enforceWorkspaceAcl(ctx, search);',
      securityTestDiff: '+++ b/test/zipExporter.test.ts\n+expect(crossTenantStatus).toBe(403);',
      explanation: 'Scopes saved-search query to caller workspace and adds regression proof.',
      gates: {
        baselineBuildPassed: true,
        redPhaseFailedAsExpected: true,
        greenPhasePassed: true,
        regressionSuitePassed: true,
        staticHygienePassed: true,
        criticApproved: true,
        criticNotes: 'Minimal 2-file patch verified inside Microsoft LiteBox.',
      },
      conversation: [],
      branchName: 'nightfall/fix-sec-1034',
      commitSha: '7c91e4a02b19',
      sandboxBackend: 'microsoft-litebox',
      createdAt: '2026-11-12T02:12:00Z',
      updatedAt: '2026-11-12T02:15:00Z',
    }),
  ];

  const campaign = RedTeamCampaignRunSchema.parse({
    id: 'camp-northstar-live',
    name: 'northstar-docs-staging',
    objective: 'Assess cross-tenant document export isolation',
    targetUrl: 'http://127.0.0.1:4555',
    sourceLabel: 'northstar-docs.tar.gz',
    yamlText: 'objective: Assess isolation\ncampaign:\n  name: northstar-docs-staging\n',
    status: 'running',
    askForApproval: true,
    modelId: 'gpt-6-cyber-ultra',
    budgetRemainingPct: 82,
    elapsedSeconds: 125,
    startedAt: '2026-11-12T02:00:00Z',
    updatedLabel: 'Updated just now',
    headlineStatus: 'Confirmed cross-tenant finding',
    headlineDetail: 'Verified canary NS-7b64c9e2 in isolated staging boundary.',
    safetyMonitorText: 'All HTTP & WS probes strictly within Ed25519 v5 scope.',
    withinApprovedScope: true,
    activitySeries: [
      { timestamp: '02:01', requestsCount: 12, findingConfirmedTick: false },
      { timestamp: '02:05', requestsCount: 19, findingConfirmedTick: true },
    ],
    endpoints: [{ method: 'POST', path: '/api/v1/exports/saved-search', hits: 14, authScope: 'workspace-b' }],
    workQueue: [
      {
        id: 'wq-1',
        hypothesis: 'Saved-search export IDOR across workspaces',
        category: 'authz',
        assignedAgent: 'verifier-alpha',
        riskTier: 'TIER_1_SAFE_PROBE',
        status: 'confirmed',
        updatedAt: '2026-11-12T02:05:00Z',
      },
    ],
    sharedKnowledge: [
      {
        id: 'sk-1',
        kind: 'data_flow',
        title: 'ZIP export stream sink',
        detail: 'Saved search IDs resolve before tenant middleware.',
        discoveredBy: 'recon-alpha',
        createdAt: '2026-11-12T02:02:00Z',
      },
    ],
    findingIds: ['SEC-1034'],
  });

  const evidenceBundles = [
    EvidenceBundleSchema.parse({
      id: 'ev-1034',
      findingId: 'SEC-1034',
      campaignId: 'camp-northstar-live',
      verifiedAt: '2026-11-12T02:05:00Z',
      reproducible: true,
      canaryMarker: 'NS-7b64c9e2',
      summary: 'Differential probe confirmed Workspace B retrieved canary NS-7b64c9e2.',
      httpTraces: [
        {
          method: 'POST',
          url: 'http://127.0.0.1:4555/api/v1/exports/saved-search',
          actor: 'bob@workspace-b',
          requestHeaders: { authorization: 'Bearer synth-bob' },
          statusCode: 200,
          responseSnippet: '{"canary":"NS-7b64c9e2"}',
        },
      ],
      codePath: [{ file: 'src/export/zipExporter.ts', startLine: 42, endLine: 58, snippet: 'findById(id)' }],
      controlAssertion: 'Workspace A owner receives 200 OK',
      probeAssertion: 'Workspace B non-owner receives 200 OK with NS-7b64c9e2',
      artifactJson: { canary: 'NS-7b64c9e2' },
      minimalPatchDiff: {
        filePath: 'src/export/zipExporter.ts',
        explanation: 'Require matching workspaceId on export lookup.',
        unifiedDiff: '+if (doc.workspaceId !== caller.workspaceId) throw new ForbiddenError();',
      },
    }),
  ];

  const sandboxToolchain = SandboxToolchainStatusSchema.parse({
    available: true,
    binDir: '/home/antigravity/Nightfall/infra/litebox/bin',
    runnerBinaryPath: '/home/antigravity/Nightfall/infra/litebox/bin/litebox_runner_linux_on_linux_userland',
    packagerBinaryPath: '/home/antigravity/Nightfall/infra/litebox/bin/litebox_packager',
    syscallRewriterBinaryPath: '/home/antigravity/Nightfall/infra/litebox/bin/litebox_syscall_rewriter',
    pythonStdlibZipPath: null,
    northShim: 'litebox_shim_linux',
    southPlatform: 'linux_userland',
    upstreamRepo: 'https://github.com/microsoft/litebox',
    pinnedCommit: '8f1b2c3d4e5f6a7b8c9d',
  });

  const state = {
    overview,
    findings,
    fixes,
    repositories: [
      {
        id: 'repo-northstar',
        name: 'northstar-docs',
        fullName: 'maceip/northstar-docs',
        ownerTeam: 'Platform Security',
        prReviewsEnabled: true,
        scheduledScanLabel: 'Daily at 8:00 AM UTC',
        lastCompletedScanLabel: '4m ago',
        needsAttention: true,
        openFindingsCount: 2,
        localPath: '/workspace/northstar-docs',
      },
    ],
    scans: [
      {
        id: 'scan-101',
        repository: 'northstar-docs',
        mode: 'local' as const,
        method: 'repository_scan' as const,
        scope: 'full_repository' as const,
        status: 'completed' as const,
        findingsDiscovered: 2,
        startedAt: '2026-11-12T01:55:00Z',
        completedAt: '2026-11-12T01:56:00Z',
      },
    ],
    campaigns: [campaign],
    evidenceBundles,
    approvals: [],
    models: [{ id: 'gpt-6-cyber-ultra', label: 'Cyber Frontier', provider: 'openai', tier: 'frontier-cyber' }],
    auditEntries: [
      {
        id: 'aud-1',
        index: 0,
        timestamp: '2026-11-12T02:00:00Z',
        subsystem: 'sandbox',
        action: 'litebox.executed',
        entityId: 'fix-1034',
        actor: 'defense-factory',
        summary: 'Verified Red-to-Green patch inside Microsoft LiteBox.',
        metadata: {},
        prevHash: 'GENESIS',
        hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      },
    ],
    killSwitchEngaged: false,
    sandboxToolchain,
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url === '/api/bootstrap') {
      if (failFirstBootstrap) {
        failFirstBootstrap = false;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Gateway warming up' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }
    if (req.url === '/api/scans' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const ch of req) chunks.push(Buffer.from(ch));
      const parsed = NewScanRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      capturedScans.push(parsed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          scan: {
            id: 'scan-local-202',
            repository: parsed.repository,
            mode: parsed.mode,
            method: parsed.method,
            scope: parsed.scope,
            status: 'completed',
            findingsDiscovered: 1,
            startedAt: new Date().toISOString(),
          },
        }),
      );
      return;
    }
    if (req.url?.endsWith('/merge-and-verify') && req.method === 'POST') {
      state.fixes[0] = { ...state.fixes[0]!, status: 'merged' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ fix: state.fixes[0] }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}/api`,
    capturedScans,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
