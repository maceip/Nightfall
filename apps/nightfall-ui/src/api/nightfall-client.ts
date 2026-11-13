import type {
  AuditEntry,
  EvidenceBundle,
  FindingRecord,
  FixProposal,
  HitlApprovalRequest,
  ModelDescriptor,
  NewScanRequest,
  OverviewSummary,
  RedTeamCampaignRun,
  RepositoryRecord,
  SandboxToolchainStatus,
  ScanJobRecord,
  StreamEvent,
} from '@nightfall/core-contracts';

export type SafetyMonitorSummary = {
  withinApprovedScope?: boolean;
  activeSandboxes?: number;
  killSwitchEngaged?: boolean;
  summary?: string;
};

export type NightfallBootstrapPayload = {
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
  sandboxToolchain?: SandboxToolchainStatus;
  safetyMonitor?: SafetyMonitorSummary;
};

function readInitialApiBaseUrl(): string {
  const metaEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string> }).env
      : undefined;
  if (metaEnv?.VITE_API_BASE) {
    return metaEnv.VITE_API_BASE.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    const desktopApiBase = (
      window as unknown as { nightfallDesktop?: { apiBaseUrl?: string } }
    ).nightfallDesktop?.apiBaseUrl;
    if (desktopApiBase && desktopApiBase.trim()) {
      return desktopApiBase.trim().replace(/\/+$/, '');
    }
  }
  return '/api';
}

let activeApiBaseUrl = readInitialApiBaseUrl();

export function setNightfallApiBaseUrl(url: string): void {
  activeApiBaseUrl = url.replace(/\/+$/, '') || '/api';
}

export function getNightfallApiBaseUrl(): string {
  return activeApiBaseUrl;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${activeApiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as { error?: string };
      if (errBody?.error) {
        detail = errBody.error;
      }
    } catch {
      // keep HTTP status text
    }
    throw new Error(`Nightfall API error (${path}): ${detail}`);
  }

  return (await response.json()) as T;
}

export async function fetchBootstrapState(): Promise<NightfallBootstrapPayload> {
  const payload = await requestJson<Omit<NightfallBootstrapPayload, 'connectedLiveApi'>>(
    '/bootstrap',
  );
  return {
    ...payload,
    connectedLiveApi: true,
  };
}

export function subscribeLiveEvents(onEvent: (ev: StreamEvent) => void): () => void {
  if (typeof EventSource === 'undefined') {
    return () => {};
  }
  try {
    const es = new EventSource(`${activeApiBaseUrl}/events`);
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as StreamEvent;
        onEvent(parsed);
      } catch {
        // ignore heartbeat frames
      }
    };
    return () => {
      es.close();
    };
  } catch {
    return () => {};
  }
}

export async function triggerNewScanApi(req: NewScanRequest): Promise<{
  scan: ScanJobRecord;
  overview?: OverviewSummary;
  findings?: FindingRecord[];
  repositories?: RepositoryRecord[];
}> {
  return requestJson('/scans', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function markFindingDuplicateApi(
  findingId: string,
  duplicateOfId?: string,
): Promise<{
  finding: FindingRecord;
  overview?: OverviewSummary;
}> {
  return requestJson(`/findings/${encodeURIComponent(findingId)}/duplicate`, {
    method: 'POST',
    body: JSON.stringify(duplicateOfId ? { duplicateOfId } : {}),
  });
}

export async function startFixProposalApi(findingId: string): Promise<{
  fix: FixProposal;
  finding?: FindingRecord;
  overview?: OverviewSummary;
}> {
  return requestJson(`/findings/${encodeURIComponent(findingId)}/start-fix`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function sendFixFollowUpApi(
  fixId: string,
  message: string,
): Promise<{ fix: FixProposal }> {
  return requestJson(`/fixes/${encodeURIComponent(fixId)}/followup`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function mergeAndVerifyFixApi(fixId: string): Promise<{
  fix: FixProposal;
  finding?: FindingRecord;
  overview?: OverviewSummary;
}> {
  return requestJson(`/fixes/${encodeURIComponent(fixId)}/merge-and-verify`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function toggleRepositoryCoverageApi(repoId: string): Promise<{
  repository: RepositoryRecord;
}> {
  return requestJson(`/repositories/${encodeURIComponent(repoId)}/toggle-scans`, {
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
  return requestJson('/red-team/campaigns/prepare', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function launchCampaignApi(
  campaignId: string,
  yamlText: string,
): Promise<{ campaign: RedTeamCampaignRun }> {
  return requestJson(`/red-team/campaigns/${encodeURIComponent(campaignId)}/launch`, {
    method: 'POST',
    body: JSON.stringify({ yamlText }),
  });
}

export async function resolveApprovalApi(
  approvalId: string,
  decision: 'approved' | 'rejected',
): Promise<{ approval: HitlApprovalRequest; campaign?: RedTeamCampaignRun }> {
  return requestJson(`/policy/approvals/${encodeURIComponent(approvalId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  });
}

export async function toggleKillSwitchApi(
  engaged: boolean,
  reason: string,
): Promise<{ engaged: boolean }> {
  return requestJson('/policy/kill-switch', {
    method: 'POST',
    body: JSON.stringify({ engaged, reason }),
  });
}
