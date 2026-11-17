import { useCallback, useEffect, useState } from 'react';
import type {
  FindingRecord,
  NewScanRequest,
  RedTeamCampaignRun,
  ScorecardReportRecord,
  ScorecardScanRequest,
} from '@nightfall/core-contracts';
import {
  fetchBootstrapState,
  launchCampaignApi,
  markFindingDuplicateApi,
  mergeAndVerifyFixApi,
  type NightfallBootstrapPayload,
  prepareCampaignApi,
  resolveApprovalApi,
  runScorecardScanApi,
  sendFixFollowUpApi,
  startFixProposalApi,
  subscribeLiveEvents,
  toggleKillSwitchApi,
  toggleRepositoryCoverageApi,
  triggerNewScanApi,
} from '../api/nightfall-client.js';
import { applyWorkspaceStreamEvent, upsertScorecardReportList } from './workspace-selectors.js';

export function useNightfallWorkspace() {
  const [data, setData] = useState<NightfallBootstrapPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeFindingId, setActiveFindingId] = useState<string>('');
  const [activeFixDrawerId, setActiveFixDrawerId] = useState<string | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string>('');
  const [yamlDraft, setYamlDraft] = useState<string>('');

  const loadBootstrap = useCallback(async () => {
    setLoadError(null);
    try {
      const initial = await fetchBootstrapState();
      setData(initial);
      if (initial.findings[0]) setActiveFindingId((prev) => prev || initial.findings[0]!.id);
      if (initial.campaigns[0]) {
        setActiveCampaignId((prev) => prev || initial.campaigns[0]!.id);
        setYamlDraft((prev) => prev || initial.campaigns[0]!.yamlText);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to connect to Nightfall API.');
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
    const unsub = subscribeLiveEvents(
      (ev) => setData((prev) => (prev ? applyWorkspaceStreamEvent(prev, ev) : prev)),
      (connected) =>
        setData((prev) =>
          prev && prev.connectedLiveApi !== connected
            ? { ...prev, connectedLiveApi: connected }
            : prev,
        ),
    );
    return () => unsub();
  }, [loadBootstrap]);

  async function startOrOpenFix(finding: FindingRecord): Promise<void> {
    if (finding.fixId && data?.fixes.some((fx) => fx.id === finding.fixId)) {
      setActiveFixDrawerId(finding.fixId);
      return;
    }
    try {
      const res = await startFixProposalApi(finding.id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              fixes: [res.fix, ...prev.fixes.filter((x) => x.id !== res.fix.id)],
              findings: res.finding
                ? prev.findings.map((x) => (x.id === res.finding!.id ? res.finding! : x))
                : prev.findings,
              overview: res.overview ?? prev.overview,
            }
          : prev,
      );
      setActiveFixDrawerId(res.fix.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start fix proposal.');
    }
  }

  async function submitNewScan(req: NewScanRequest): Promise<void> {
    const res = await triggerNewScanApi(req);
    setData((prev) =>
      prev
        ? {
            ...prev,
            scans: [res.scan, ...prev.scans.filter((s) => s.id !== res.scan.id)],
            findings: res.findings ?? prev.findings,
            repositories: res.repositories ?? prev.repositories,
            scorecardReports: res.scorecardReport
              ? upsertScorecardReportList(prev.scorecardReports, res.scorecardReport)
              : prev.scorecardReports,
            overview: res.overview ?? prev.overview,
          }
        : prev,
    );
  }

  async function runScorecardScan(req: ScorecardScanRequest): Promise<ScorecardReportRecord | null> {
    try {
      const res = await runScorecardScanApi(req);
      setData((prev) => {
        if (!prev) return prev;
        const promotedById = new Map(res.promotedFindings.map((f) => [f.id, f]));
        const mergedFindings = [
          ...res.promotedFindings.filter((pf) => !prev.findings.some((ef) => ef.id === pf.id)),
          ...prev.findings.map((ef) => promotedById.get(ef.id) ?? ef),
        ];
        return {
          ...prev,
          scorecardReports: upsertScorecardReportList(prev.scorecardReports, res.report),
          findings: mergedFindings,
          repositories: res.repositories ?? prev.repositories,
          overview: res.overview ?? prev.overview,
        };
      });
      return res.report;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to execute Scorecard scan.');
      return null;
    }
  }

  async function markDuplicate(id: string, duplicateOfId?: string): Promise<void> {
    try {
      const res = await markFindingDuplicateApi(id, duplicateOfId);
      setData((p) =>
        p
          ? {
              ...p,
              findings: p.findings.map((f) => (f.id === id ? res.finding : f)),
              overview: res.overview ?? p.overview,
            }
          : p,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to mark duplicate.');
    }
  }

  async function toggleRepositoryCoverage(repoId: string): Promise<void> {
    const res = await toggleRepositoryCoverageApi(repoId);
    setData((p) =>
      p
        ? { ...p, repositories: p.repositories.map((r) => (r.id === repoId ? res.repository : r)) }
        : p,
    );
  }

  async function prepareCampaign(input: Parameters<typeof prepareCampaignApi>[0]): Promise<RedTeamCampaignRun> {
    const res = await prepareCampaignApi(input);
    setData((p) =>
      p
        ? { ...p, campaigns: [res.campaign, ...p.campaigns.filter((c) => c.id !== res.campaign.id)] }
        : p,
    );
    setActiveCampaignId(res.campaign.id);
    setYamlDraft(res.campaign.yamlText);
    return res.campaign;
  }

  async function launchCampaign(
    campaignId: string,
    yamlText: string,
    signedManifest?: unknown,
  ): Promise<RedTeamCampaignRun | null> {
    try {
      const res = await launchCampaignApi(campaignId, yamlText, signedManifest);
      setData((p) =>
        p ? { ...p, campaigns: p.campaigns.map((c) => (c.id === campaignId ? res.campaign : c)) } : p,
      );
      return res.campaign;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to launch Red Team campaign.');
      return null;
    }
  }

  async function resolveApproval(approvalId: string, decision: 'approved' | 'rejected'): Promise<void> {
    try {
      const res = await resolveApprovalApi(approvalId, decision);
      setData((p) =>
        p
          ? {
              ...p,
              approvals: p.approvals.map((a) => (a.id === approvalId ? res.approval : a)),
              campaigns: res.campaign
                ? p.campaigns.map((c) => (c.id === res.campaign!.id ? res.campaign! : c))
                : p.campaigns,
            }
          : p,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to resolve approval request.');
    }
  }

  async function followUpFix(fixId: string, message: string): Promise<void> {
    const res = await sendFixFollowUpApi(fixId, message);
    setData((p) => (p ? { ...p, fixes: p.fixes.map((fx) => (fx.id === fixId ? res.fix : fx)) } : p));
  }

  async function mergeAndVerifyFix(fixId: string): Promise<void> {
    const res = await mergeAndVerifyFixApi(fixId);
    setData((p) =>
      p
        ? {
            ...p,
            fixes: p.fixes.map((fx) => (fx.id === fixId ? res.fix : fx)),
            findings: res.finding
              ? p.findings.map((f) => (f.id === res.finding!.id ? res.finding! : f))
              : p.findings,
            repositories: res.repositories ?? p.repositories,
            scorecardReports: res.scorecardReport
              ? p.scorecardReports.map((r) =>
                  r.repository === res.scorecardReport!.repository ? res.scorecardReport! : r,
                )
              : p.scorecardReports,
            overview: res.overview ?? p.overview,
          }
        : p,
    );
  }

  async function toggleKillSwitch(): Promise<void> {
    if (!data) return;
    const next = !data.killSwitchEngaged;
    try {
      const res = await toggleKillSwitchApi(
        next,
        next
          ? 'Operator halted sandboxes from Nightfall UI'
          : 'Operator resumed Nightfall operations',
      );
      setData((p) => (p ? { ...p, killSwitchEngaged: res.engaged } : p));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to toggle kill-switch.');
    }
  }

  return {
    data,
    setData,
    loadError,
    actionError,
    setActionError,
    activeFindingId,
    setActiveFindingId,
    activeFixDrawerId,
    setActiveFixDrawerId,
    activeCampaignId,
    setActiveCampaignId,
    yamlDraft,
    setYamlDraft,
    loadBootstrap,
    startOrOpenFix,
    submitNewScan,
    runScorecardScan,
    markDuplicate,
    toggleRepositoryCoverage,
    prepareCampaign,
    launchCampaign,
    resolveApproval,
    followUpFix,
    mergeAndVerifyFix,
    toggleKillSwitch,
    toggleRepositoryCoverageApi,
    prepareCampaignApi,
    launchCampaignApi,
    resolveApprovalApi,
    sendFixFollowUpApi,
    mergeAndVerifyFixApi,
  };
}
