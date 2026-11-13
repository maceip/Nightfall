import { useCallback, useEffect, useState } from 'react';
import type { FindingRecord, NewScanRequest, StreamEvent } from '@nightfall/core-contracts';
import {
  fetchBootstrapState,
  launchCampaignApi,
  markFindingDuplicateApi,
  mergeAndVerifyFixApi,
  type NightfallBootstrapPayload,
  prepareCampaignApi,
  resolveApprovalApi,
  sendFixFollowUpApi,
  startFixProposalApi,
  subscribeLiveEvents,
  toggleKillSwitchApi,
  toggleRepositoryCoverageApi,
  triggerNewScanApi,
} from '../api/nightfall-client.js';

function applyStreamEvent(
  prev: NightfallBootstrapPayload,
  ev: StreamEvent,
): NightfallBootstrapPayload {
  if (ev.type === 'campaign.updated') {
    const exists = prev.campaigns.some((c) => c.id === ev.campaign.id);
    return {
      ...prev,
      campaigns: exists
        ? prev.campaigns.map((c) => (c.id === ev.campaign.id ? ev.campaign : c))
        : [ev.campaign, ...prev.campaigns],
    };
  }
  if (ev.type === 'finding.updated') {
    const exists = prev.findings.some((f) => f.id === ev.finding.id);
    return {
      ...prev,
      findings: exists
        ? prev.findings.map((f) => (f.id === ev.finding.id ? ev.finding : f))
        : [ev.finding, ...prev.findings],
    };
  }
  if (ev.type === 'evidence.recorded') {
    return {
      ...prev,
      evidenceBundles: [ev.evidence, ...prev.evidenceBundles.filter((e) => e.id !== ev.evidence.id)],
    };
  }
  if (ev.type === 'fix.updated') {
    const exists = prev.fixes.some((fx) => fx.id === ev.fix.id);
    return {
      ...prev,
      fixes: exists
        ? prev.fixes.map((fx) => (fx.id === ev.fix.id ? ev.fix : fx))
        : [ev.fix, ...prev.fixes],
    };
  }
  if (ev.type === 'scan.updated') {
    return { ...prev, scans: [ev.scan, ...prev.scans.filter((s) => s.id !== ev.scan.id)] };
  }
  if (ev.type === 'hitl.updated') {
    return {
      ...prev,
      approvals: prev.approvals.map((a) => (a.id === ev.approval.id ? ev.approval : a)),
    };
  }
  if (ev.type === 'safety.kill_switch') {
    return { ...prev, killSwitchEngaged: ev.engaged };
  }
  if (ev.type === 'audit.appended') {
    return { ...prev, auditEntries: [ev.entry, ...prev.auditEntries] };
  }
  return prev;
}

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
    const unsub = subscribeLiveEvents((ev) => {
      setData((prev) => (prev ? applyStreamEvent(prev, ev) : prev));
    });
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
            overview: res.overview ?? prev.overview,
          }
        : prev,
    );
  }

  async function markDuplicate(id: string): Promise<void> {
    try {
      const res = await markFindingDuplicateApi(id);
      setData((p) =>
        p ? { ...p, findings: p.findings.map((f) => (f.id === id ? res.finding : f)), overview: res.overview ?? p.overview } : p,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to mark duplicate.');
    }
  }

  async function toggleKillSwitch(): Promise<void> {
    if (!data) return;
    const next = !data.killSwitchEngaged;
    try {
      const res = await toggleKillSwitchApi(
        next,
        next ? 'Operator halted sandboxes from Nightfall UI' : 'Operator resumed Nightfall operations',
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
    markDuplicate,
    toggleKillSwitch,
    toggleRepositoryCoverageApi,
    prepareCampaignApi,
    launchCampaignApi,
    resolveApprovalApi,
    sendFixFollowUpApi,
    mergeAndVerifyFixApi,
  };
}
