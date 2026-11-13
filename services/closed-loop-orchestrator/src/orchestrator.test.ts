import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { OverviewSummary, StreamEvent } from '@nightfall/core-contracts';
import { NightfallOrchestrator } from './index.js';

function assertExactSankeyConservation(overview: OverviewSummary): void {
  const sevSum = Object.values(overview.severityCounts).reduce((a, b) => a + b, 0);
  expect(sevSum).toBe(overview.openFindingsCount);

  const openStatusSum =
    overview.statusCounts.new +
    overview.statusCounts.triaged +
    overview.statusCounts.in_progress;
  expect(openStatusSum).toBe(overview.openFindingsCount);

  const firstLayerSum = overview.sankeyLinks
    .filter((l) => l.source === 'Findings')
    .reduce((acc, l) => acc + l.value, 0);
  expect(firstLayerSum).toBe(overview.openFindingsCount);

  const secondLayerSum = overview.sankeyLinks
    .filter((l) => l.source !== 'Findings')
    .reduce((acc, l) => acc + l.value, 0);
  expect(secondLayerSum).toBe(overview.openFindingsCount);
}

describe('@nightfall/closed-loop-orchestrator Zero-Mock SQLite NightfallOrchestrator', () => {
  const instances: NightfallOrchestrator[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (instances.length > 0) {
      await instances.pop()?.dispose();
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('bootstraps real scanned repos, live Red Team evidence, and Microsoft LiteBox fixes with exact Sankey conservation', async () => {
    const orchestrator = new NightfallOrchestrator();
    instances.push(orchestrator);
    await orchestrator.ensureBootstrapped();

    const events: StreamEvent[] = [];
    const unsubscribe = orchestrator.subscribe((ev) => events.push(ev));

    const boot = orchestrator.getBootstrapState();
    expect(boot.sandboxToolchain.available).toBe(true);
    expect(boot.repositories.length).toBe(5);
    expect(
      boot.repositories.find((r) => r.name === 'edge-ingress-mesh')?.openFindingsCount,
    ).toBe(0);

    // Every overview number is computed strictly from real SQLite findings & fixes
    const expectedOpen = boot.findings.filter(
      (f) => f.status !== 'fixed' && f.status !== 'discarded_fp',
    ).length;
    expect(boot.overview.openFindingsCount).toBe(expectedOpen);
    expect(boot.overview.openFindingsCount).toBeGreaterThanOrEqual(8);
    expect(boot.overview.fixedFindingsCount).toBe(0);
    expect(boot.overview.proposedFixesCount).toBe(2);
    assertExactSankeyConservation(boot.overview);

    // Verify F-001 & F-002 came from live HTTP + WebSocket probes with real traces
    expect(boot.findings.some((f) => f.id === 'F-001')).toBe(true);
    expect(boot.findings.some((f) => f.id === 'F-002')).toBe(true);
    expect(boot.evidenceBundles.some((ev) => ev.canaryMarker === 'NS-7b64c9e2')).toBe(true);
    expect(boot.evidenceBundles.some((ev) => ev.canaryMarker === 'NS-ws-4410a')).toBe(true);

    // Verify FIX-F-002 ran inside real Microsoft LiteBox and recorded real git commit
    const fixF002 = boot.fixes.find((fx) => fx.id === 'FIX-F-002')!;
    expect(fixF002).toBeDefined();
    expect(fixF002.sandboxBackend).toBe('microsoft-litebox');
    expect(fixF002.branchName).toBe('nightfall/fix-f-002');
    expect(fixF002.commitSha).toMatch(/^[0-9a-f]{40}$/);

    // 1. Trigger a real scan on a new local repository directory (+1 open finding, then deduplicated on rescan)
    const extraDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-extra-scan-'));
    tempDirs.push(extraDir);
    await fs.writeFile(
      path.join(extraDir, 'unsafeEval.mjs'),
      'export function runDynamic(code) { return eval(code); }\n',
      'utf8',
    );

    const scanRes1 = await orchestrator.triggerScan({
      mode: 'local',
      repository: 'analytics-worker',
      localPath: extraDir,
      method: 'repository_scan',
      scope: 'full_repository',
    });
    expect(scanRes1.scan.findingsDiscovered).toBe(1);
    expect(scanRes1.overview.openFindingsCount).toBe(expectedOpen + 1);
    assertExactSankeyConservation(scanRes1.overview);

    // Re-scanning identical repository deduplicates open rootCauseClusterKey
    const scanRes2 = await orchestrator.triggerScan({
      mode: 'local',
      repository: 'analytics-worker',
      localPath: extraDir,
      method: 'repository_scan',
      scope: 'full_repository',
    });
    expect(scanRes2.overview.openFindingsCount).toBe(expectedOpen + 1);

    // 2. Mark newly scanned finding duplicate (-1 open finding)
    const analyticsFinding = scanRes1.findings.find(
      (f) => f.repository === 'analytics-worker',
    )!;
    const dupRes = orchestrator.markFindingDuplicate(analyticsFinding.id);
    expect(dupRes.finding.status).toBe('discarded_fp');
    expect(dupRes.overview.openFindingsCount).toBe(expectedOpen);
    assertExactSankeyConservation(dupRes.overview);

    // 3. Start fix for TypeScript auth-gateway finding (runs real node --experimental-strip-types --test proof)
    const authFinding = boot.findings.find((f) => f.repository === 'auth-gateway')!;
    const startFixRes = await orchestrator.startFixForFinding(authFinding.id);
    expect(startFixRes.fix.status).toBe('proposed');
    expect(startFixRes.fix.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(startFixRes.finding.fixId).toBe(startFixRes.fix.id);
    assertExactSankeyConservation(startFixRes.overview);

    // 4. Merge and verify FIX-F-002 (closes both F-002 and its SAST twin in the same root-cause cluster!)
    const mergeRes = await orchestrator.mergeAndVerifyFix('FIX-F-002');
    expect(mergeRes.fix.status).toBe('merged');
    expect(mergeRes.finding?.status).toBe('fixed');
    expect(mergeRes.finding?.fixVerification).toBe('verified');
    expect(mergeRes.overview.fixedFindingsCount).toBeGreaterThanOrEqual(1);
    assertExactSankeyConservation(mergeRes.overview);

    expect(events.some((e) => e.type === 'scan.updated')).toBe(true);
    expect(events.some((e) => e.type === 'finding.updated')).toBe(true);
    expect(events.some((e) => e.type === 'fix.updated')).toBe(true);
    expect(events.some((e) => e.type === 'audit.appended')).toBe(true);
    unsubscribe();
  });

  it('persists full state durably in file-backed node:sqlite WAL database across restarts and executes live campaigns', async () => {
    const dbDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-sqlite-wal-'));
    tempDirs.push(dbDir);
    const sqlitePath = path.join(dbDir, 'nightfall.sqlite');

    const orch1 = new NightfallOrchestrator({ sqlitePath });
    await orch1.ensureBootstrapped();

    const { campaign: draft } = orch1.prepareCampaign({
      prompt: 'Verify multi-tenant document isolation and WebSocket subscribe ACLs',
      targetUrl: 'https://staging.northstardocs.com',
      askForApproval: true,
      modelId: 'gpt-6-cyber-ultra',
    });
    expect(draft.status).toBe('draft');

    const { campaign: launched } = await orch1.launchCampaign(draft.id);
    expect(launched.status).toBe('paused_hitl');
    expect(launched.endpoints.length).toBeGreaterThan(0);
    expect(launched.findingIds).toEqual(expect.arrayContaining(['F-001', 'F-002']));

    // Resolve the real pending HITL approval generated during the campaign
    const pendingApproval = orch1
      .getBootstrapState()
      .approvals.find((a) => a.campaignId === draft.id && a.status === 'pending')!;
    expect(pendingApproval).toBeDefined();

    const hitlRes = orch1.resolveApproval(pendingApproval.id, 'approved');
    expect(hitlRes.approval.status).toBe('approved');

    // Engage emergency kill-switch on remaining paused campaign
    const ks = orch1.setKillSwitch(true, 'Test emergency stop');
    expect(ks.engaged).toBe(true);

    const stateBeforeClose = orch1.getBootstrapState();
    await orch1.dispose();

    // Reopen from the exact same SQLite file and prove zero data loss + intact audit chain
    const orch2 = new NightfallOrchestrator({ sqlitePath });
    instances.push(orch2);
    await orch2.ensureBootstrapped();

    const stateAfterReopen = orch2.getBootstrapState();
    expect(stateAfterReopen.findings.length).toBe(stateBeforeClose.findings.length);
    expect(stateAfterReopen.fixes.length).toBe(stateBeforeClose.fixes.length);
    expect(stateAfterReopen.campaigns.length).toBe(stateBeforeClose.campaigns.length);
    expect(stateAfterReopen.killSwitchEngaged).toBe(true);
    expect(orch2.auditLedger.verifyIntegrity().valid).toBe(true);
    expect(stateAfterReopen.auditEntries.length).toBe(stateBeforeClose.auditEntries.length);
  });
});
