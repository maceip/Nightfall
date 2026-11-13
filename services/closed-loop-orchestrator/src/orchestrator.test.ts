import { afterEach, describe, expect, it } from 'vitest';
import type { OverviewSummary, StreamEvent } from '@nightfall/core-contracts';
import { INITIAL_OVERVIEW } from '@nightfall/mock-fixtures';
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

describe('@nightfall/closed-loop-orchestrator NightfallOrchestrator', () => {
  const instances: NightfallOrchestrator[] = [];

  afterEach(() => {
    while (instances.length > 0) {
      instances.pop()?.dispose();
    }
  });

  it('maintains exact Sankey conservation and emits StreamEvents across scans, duplicates, fixes, and merges', async () => {
    const orchestrator = new NightfallOrchestrator({ enableLiveSimulationTimers: false });
    instances.push(orchestrator);

    const events: StreamEvent[] = [];
    const unsubscribe = orchestrator.subscribe((ev) => events.push(ev));

    // Initial state matches INITIAL_OVERVIEW
    const boot = orchestrator.getBootstrapState();
    expect(boot.overview.openFindingsCount).toBe(INITIAL_OVERVIEW.openFindingsCount);
    expect(boot.overview.fixedFindingsCount).toBe(INITIAL_OVERVIEW.fixedFindingsCount);
    expect(boot.overview.proposedFixesCount).toBe(INITIAL_OVERVIEW.proposedFixesCount);
    expect(boot.overview.sankeyLinks).toEqual(INITIAL_OVERVIEW.sankeyLinks);
    assertExactSankeyConservation(boot.overview);

    // 1. Trigger new scan (+1 open finding)
    const scanRes = await orchestrator.triggerScan({
      mode: 'cloud',
      repository: 'identity-platform',
      method: 'repository_scan',
      scope: 'full_repository',
    });
    expect(scanRes.overview.openFindingsCount).toBe(551);
    assertExactSankeyConservation(scanRes.overview);

    // 2. Mark a finding duplicate (-1 open finding)
    const dupRes = orchestrator.markFindingDuplicate('F-006', 'F-005');
    expect(dupRes.finding.status).toBe('discarded_fp');
    expect(dupRes.overview.openFindingsCount).toBe(550);
    assertExactSankeyConservation(dupRes.overview);

    // 3. Start fix for SEC-50000 (creates FixProposal)
    const startFixRes = await orchestrator.startFixForFinding('SEC-50000');
    expect(startFixRes.fix.status).toBe('proposed');
    expect(startFixRes.finding.fixId).toBe(startFixRes.fix.id);
    assertExactSankeyConservation(startFixRes.overview);

    // 4. Merge and verify FIX-1034 (-1 open finding, +1 fixed finding)
    const mergeRes = await orchestrator.mergeAndVerifyFix('FIX-1034');
    expect(mergeRes.fix.status).toBe('merged');
    expect(mergeRes.finding?.status).toBe('fixed');
    expect(mergeRes.finding?.fixVerification).toBe('verified');
    expect(mergeRes.overview.openFindingsCount).toBe(549);
    expect(mergeRes.overview.fixedFindingsCount).toBe(148);
    assertExactSankeyConservation(mergeRes.overview);

    expect(events.some((e) => e.type === 'scan.updated')).toBe(true);
    expect(events.some((e) => e.type === 'finding.updated')).toBe(true);
    expect(events.some((e) => e.type === 'fix.updated')).toBe(true);
    expect(events.some((e) => e.type === 'audit.appended')).toBe(true);
    unsubscribe();
  });

  it('supports Red Team campaign prepare, launch, simulation stepping, HITL resolution, and kill-switch halt', () => {
    const orchestrator = new NightfallOrchestrator({ enableLiveSimulationTimers: false });
    instances.push(orchestrator);

    const { campaign: draft } = orchestrator.prepareCampaign({
      prompt: 'Check workspace permissions',
      targetUrl: 'https://staging.northstardocs.com',
      askForApproval: true,
      modelId: 'gpt-6-cyber-ultra',
    });
    expect(draft.status).toBe('draft');

    const { campaign: running } = orchestrator.launchCampaign(draft.id);
    expect(running.status).toBe('running');

    const stepped = orchestrator.stepCampaignSimulation(draft.id);
    expect(stepped?.elapsedSeconds).toBeGreaterThan(0);

    // Resolve seeded HITL approval
    const hitlRes = orchestrator.resolveApproval('hitl-01', 'approved');
    expect(hitlRes.approval.status).toBe('approved');

    // Engage emergency kill-switch -> halts running campaigns immediately
    const ks = orchestrator.setKillSwitch(true, 'Test emergency stop');
    expect(ks.engaged).toBe(true);
    const campaignsAfterKill = orchestrator.getBootstrapState().campaigns;
    expect(campaignsAfterKill.find((c) => c.id === draft.id)?.status).toBe('halted');
  });
});
