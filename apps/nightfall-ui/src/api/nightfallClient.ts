import {
  type AuditEntry,
  type EvidenceBundle,
  type FindingRecord,
  type FixProposal,
  type HitlApprovalRequest,
  type ModelDescriptor,
  type NewScanRequest,
  type OverviewSummary,
  type RedTeamCampaignRun,
  type RepositoryRecord,
  type ScanJobRecord,
  type StreamEvent,
} from '@nightfall/core-contracts';
import {
  AVAILABLE_MODELS,
  INITIAL_EVIDENCE_BUNDLES,
  INITIAL_FINDINGS,
  INITIAL_FIXES,
  INITIAL_HITL_APPROVALS,
  INITIAL_OVERVIEW,
  INITIAL_RED_TEAM_CAMPAIGN,
  INITIAL_REPOSITORIES,
  INITIAL_SCANS,
  NORTHSTAR_CAMPAIGN_YAML,
} from '@nightfall/mock-fixtures';

export interface NightfallBootstrapPayload {
  connectedLiveApi: boolean;
  overview: OverviewSummary;
  findings: FindingRecord[];
  fixes: FixProposal[];
  repositories: RepositoryRecord[];
  scans: ScanJobRecord[];
  campaigns: RedTeamCampaignRun[];
  evidenceBundles: EvidenceBundle[];
  approvals: HitlApprovalRequest[];
  models: ModelDescriptor[];
  auditEntries: AuditEntry[];
  killSwitchEngaged: boolean;
}

const API_BASE =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE
    ? (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_BASE!
    : '/api';

async function tryJsonFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchBootstrapState(): Promise<NightfallBootstrapPayload> {
  const remote = await tryJsonFetch<Omit<NightfallBootstrapPayload, 'connectedLiveApi'>>(
    '/bootstrap',
  );
  if (remote && remote.overview && Array.isArray(remote.findings)) {
    return {
      ...remote,
      connectedLiveApi: true,
    };
  }

  return {
    connectedLiveApi: false,
    overview: structuredClone(INITIAL_OVERVIEW),
    findings: structuredClone(INITIAL_FINDINGS),
    fixes: structuredClone(INITIAL_FIXES),
    repositories: structuredClone(INITIAL_REPOSITORIES),
    scans: structuredClone(INITIAL_SCANS),
    campaigns: [structuredClone(INITIAL_RED_TEAM_CAMPAIGN)],
    evidenceBundles: structuredClone(INITIAL_EVIDENCE_BUNDLES),
    approvals: structuredClone(INITIAL_HITL_APPROVALS),
    models: structuredClone(AVAILABLE_MODELS),
    auditEntries: [
      {
        id: 'aud-init-1',
        index: 0,
        timestamp: '2026-11-12T02:00:01Z',
        subsystem: 'policy-gate',
        action: 'scope.manifest.signed',
        entityId: 'camp-northstar-staging',
        actor: 'nightfall-policy-gate',
        summary: 'Signed v5 campaign.yaml manifest (HTTP GET/POST + WS /ws/documents, max 10 RPS).',
        metadata: { rps: 10 },
        prevHash: 'GENESIS',
        hash: '94b81f2c08d149a77e1029a8f1b24e336c71a9d001e345bc7a1120ef928371c4',
      },
      {
        id: 'aud-init-2',
        index: 1,
        timestamp: '2026-11-12T02:24:18Z',
        subsystem: 'red-team',
        action: 'finding.confirmed',
        entityId: 'F-002',
        actor: 'verifier-beta',
        summary: 'Confirmed cross-workspace saved-search export differential via benign canary NS-7b64c9e2.',
        metadata: { canary: 'NS-7b64c9e2' },
        prevHash: '94b81f2c08d149a77e1029a8f1b24e336c71a9d001e345bc7a1120ef928371c4',
        hash: 'e12d004bc9a712380912bc74561ef90823a1149087bcde231456091283abcdef',
      },
    ],
    killSwitchEngaged: false,
  };
}

export function subscribeLiveEvents(onEvent: (ev: StreamEvent) => void): () => void {
  if (typeof EventSource === 'undefined') {
    return () => {};
  }
  try {
    const es = new EventSource(`${API_BASE}/events`);
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as StreamEvent;
        onEvent(parsed);
      } catch {
        // ignore malformed keepalive
      }
    };
    return () => es.close();
  } catch {
    return () => {};
  }
}

export async function triggerNewScanApi(req: NewScanRequest): Promise<{
  scan: ScanJobRecord;
  overview?: OverviewSummary;
}> {
  const remote = await tryJsonFetch<{ scan: ScanJobRecord; overview: OverviewSummary }>('/scans', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  if (remote) return remote;

  return {
    scan: {
      id: `scan-${Date.now().toString().slice(-4)}`,
      repository: req.repository,
      mode: req.mode,
      method: req.method,
      scope: req.scope,
      status: 'completed',
      findingsDiscovered: 1,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  };
}

export async function markFindingDuplicateApi(findingId: string): Promise<{
  finding?: FindingRecord;
  overview?: OverviewSummary;
} | null> {
  return tryJsonFetch(`/findings/${encodeURIComponent(findingId)}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function startFixProposalApi(findingId: string): Promise<{
  fix?: FixProposal;
  finding?: FindingRecord;
} | null> {
  return tryJsonFetch(`/findings/${encodeURIComponent(findingId)}/start-fix`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function sendFixFollowUpApi(
  fixId: string,
  message: string,
): Promise<{ fix: FixProposal } | null> {
  return tryJsonFetch(`/fixes/${encodeURIComponent(fixId)}/followup`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function mergeAndVerifyFixApi(fixId: string): Promise<{
  fix: FixProposal;
  finding?: FindingRecord;
  overview?: OverviewSummary;
} | null> {
  return tryJsonFetch(`/fixes/${encodeURIComponent(fixId)}/merge-and-verify`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function toggleRepositoryCoverageApi(repoId: string): Promise<{
  repository: RepositoryRecord;
} | null> {
  return tryJsonFetch(`/repositories/${encodeURIComponent(repoId)}/toggle-scans`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function prepareCampaignApi(input: {
  prompt: string;
  targetUrl: string;
  sourceLabel?: string;
  askForApproval: boolean;
  modelId: string;
}): Promise<{ campaign: RedTeamCampaignRun }> {
  const remote = await tryJsonFetch<{ campaign: RedTeamCampaignRun }>(
    '/red-team/campaigns/prepare',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  if (remote) return remote;

  const slug =
    input.targetUrl
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'staging-target';

  const yamlText = NORTHSTAR_CAMPAIGN_YAML.replace(
    'https://staging.northstardocs.com',
    input.targetUrl,
  ).replace('northstar-docs-staging', slug);

  return {
    campaign: {
      ...structuredClone(INITIAL_RED_TEAM_CAMPAIGN),
      id: `camp-${Date.now().toString().slice(-5)}`,
      name: slug,
      objective: input.prompt,
      targetUrl: input.targetUrl,
      sourceLabel: input.sourceLabel ?? 'northstar-docs-source.tar.gz',
      yamlText,
      status: 'draft',
      askForApproval: input.askForApproval,
      modelId: input.modelId,
      elapsedSeconds: 0,
      headlineStatus: 'Campaign manifest prepared',
      headlineDetail: 'Ready to launch inside isolated staging boundary.',
    },
  };
}

export async function launchCampaignApi(
  campaignId: string,
  yamlText: string,
): Promise<{ campaign: RedTeamCampaignRun } | null> {
  return tryJsonFetch(`/red-team/campaigns/${encodeURIComponent(campaignId)}/launch`, {
    method: 'POST',
    body: JSON.stringify({ yamlText }),
  });
}

export async function resolveApprovalApi(
  approvalId: string,
  decision: 'approved' | 'rejected',
): Promise<{ approval: HitlApprovalRequest; campaign?: RedTeamCampaignRun } | null> {
  return tryJsonFetch(`/policy/approvals/${encodeURIComponent(approvalId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  });
}

export async function toggleKillSwitchApi(
  engaged: boolean,
  reason: string,
): Promise<{ engaged: boolean } | null> {
  return tryJsonFetch('/policy/kill-switch', {
    method: 'POST',
    body: JSON.stringify({ engaged, reason }),
  });
}
