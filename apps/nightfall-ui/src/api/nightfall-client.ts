import type {
  AuditEntry,
  EvidenceBundle,
  FindingRecord,
  FixProposal,
  HitlApprovalRequest,
  MantisToolchainStatus,
  ModelDescriptor,
  NewScanRequest,
  OverviewSummary,
  RedTeamCampaignRun,
  RepositoryRecord,
  SandboxToolchainStatus,
  ScanJobRecord,
  ScorecardCheckCatalogEntry,
  ScorecardReportRecord,
  ScorecardScanRequest,
  ScorecardToolchainStatus,
  StreamEvent,
} from '@nightfall/core-contracts';
import {
  isPagesStaticBuild,
  loadStaticPagesBootstrap,
  staticFetchScorecardChecks,
  staticMarkFindingDuplicate,
  staticMergeAndVerifyFix,
  staticResolveApproval,
  staticSendFixFollowUp,
  staticStartFixProposal,
  staticToggleKillSwitch,
  staticToggleRepositoryCoverage,
  throwLiveRuntimeRequired,
} from './pages-static-store.js';

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
  scorecardReports: ScorecardReportRecord[];
  campaigns: RedTeamCampaignRun[];
  evidenceBundles: EvidenceBundle[];
  approvals: HitlApprovalRequest[];
  models: ModelDescriptor[];
  auditEntries: AuditEntry[];
  killSwitchEngaged: boolean;
  sandboxToolchain?: SandboxToolchainStatus;
  scorecardToolchain?: ScorecardToolchainStatus;
  mantisToolchain?: MantisToolchainStatus;
  safetyMonitor?: SafetyMonitorSummary;
};

function readInitialApiBaseUrl(): string {
  const metaEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string> }).env
      : undefined;
  if (metaEnv?.VITE_API_BASE) return metaEnv.VITE_API_BASE.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const queryApi = new URLSearchParams(window.location.search).get('api');
    if (queryApi?.trim()) return queryApi.trim().replace(/\/+$/, '');
    const desktopApiBase = window.nightfallDesktop?.apiBaseUrl;
    if (desktopApiBase?.trim()) return desktopApiBase.trim().replace(/\/+$/, '');
  }
  return '/api';
}

let activeApiBaseUrl = readInitialApiBaseUrl();
let resolvedPagesModePromise: Promise<'live' | 'static'> | null = null;

export function setNightfallApiBaseUrl(url: string): void {
  activeApiBaseUrl = url.replace(/\/+$/, '') || '/api';
  resolvedPagesModePromise = null;
}

export function getNightfallApiBaseUrl(): string {
  return activeApiBaseUrl;
}

async function isStaticModeActive(): Promise<boolean> {
  if (!isPagesStaticBuild()) return false;
  if (!resolvedPagesModePromise) {
    resolvedPagesModePromise = (async () => {
      const candidate =
        activeApiBaseUrl !== '/api' ? activeApiBaseUrl : 'http://127.0.0.1:4000/api';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1100);
      try {
        const res = await fetch(`${candidate}/health`, { signal: ctrl.signal });
        if (res.ok) {
          activeApiBaseUrl = candidate;
          return 'live';
        }
      } catch {
        // Local daemon not running on visitor host; use SHA-256 verified Pages capture
      } finally {
        clearTimeout(timer);
      }
      return 'static';
    })();
  }
  return (await resolvedPagesModePromise) === 'static';
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${activeApiBaseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as { error?: string };
      if (errBody?.error) detail = errBody.error;
    } catch {
      // keep HTTP status text
    }
    throw new Error(`Nightfall API error (${path}): ${detail}`);
  }
  return (await response.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function fetchBootstrapState(): Promise<NightfallBootstrapPayload> {
  if (await isStaticModeActive()) return loadStaticPagesBootstrap();
  const payload = await requestJson<
    Omit<NightfallBootstrapPayload, 'connectedLiveApi' | 'scorecardReports'> & {
      scorecardReports?: ScorecardReportRecord[];
    }
  >('/bootstrap');
  return { ...payload, scorecardReports: payload.scorecardReports ?? [], connectedLiveApi: true };
}

export function subscribeLiveEvents(
  onEvent: (ev: StreamEvent) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  if ((isPagesStaticBuild() && activeApiBaseUrl === '/api') || typeof EventSource === 'undefined') {
    return () => {};
  }
  try {
    const es = new EventSource(`${activeApiBaseUrl}/events`);
    es.onopen = () => onConnectionChange?.(true);
    es.onerror = () => onConnectionChange?.(false);
    es.onmessage = (msg) => {
      onConnectionChange?.(true);
      try {
        onEvent(JSON.parse(msg.data) as StreamEvent);
      } catch {
        // ignore heartbeat frames
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
  findings?: FindingRecord[];
  repositories?: RepositoryRecord[];
  scorecardReport?: ScorecardReportRecord;
}> {
  if (await isStaticModeActive()) throwLiveRuntimeRequired('Running live repository scans');
  return postJson('/scans', req);
}

export async function runScorecardScanApi(req: ScorecardScanRequest): Promise<{
  report: ScorecardReportRecord;
  promotedFindings: FindingRecord[];
  overview?: OverviewSummary;
  repositories?: RepositoryRecord[];
}> {
  if (await isStaticModeActive()) throwLiveRuntimeRequired('Running live Scorecard Go daemon scans');
  return postJson('/scorecard/scan', req);
}

export async function fetchScorecardChecksApi(): Promise<{
  checks: ScorecardCheckCatalogEntry[];
  toolchain: ScorecardToolchainStatus;
}> {
  if (await isStaticModeActive()) return staticFetchScorecardChecks();
  return requestJson('/scorecard/checks');
}

export async function markFindingDuplicateApi(
  findingId: string,
  duplicateOfId?: string,
): Promise<{ finding: FindingRecord; overview?: OverviewSummary }> {
  if (await isStaticModeActive()) return staticMarkFindingDuplicate(findingId, duplicateOfId);
  return postJson(
    `/findings/${encodeURIComponent(findingId)}/duplicate`,
    duplicateOfId ? { duplicateOfId } : {},
  );
}

export async function startFixProposalApi(findingId: string): Promise<{
  fix: FixProposal;
  finding?: FindingRecord;
  overview?: OverviewSummary;
}> {
  if (await isStaticModeActive()) return staticStartFixProposal(findingId);
  return postJson(`/findings/${encodeURIComponent(findingId)}/start-fix`, {});
}

export async function sendFixFollowUpApi(
  fixId: string,
  message: string,
): Promise<{ fix: FixProposal }> {
  if (await isStaticModeActive()) return staticSendFixFollowUp(fixId, message);
  return postJson(`/fixes/${encodeURIComponent(fixId)}/followup`, { message });
}

export async function mergeAndVerifyFixApi(fixId: string): Promise<{
  fix: FixProposal;
  finding?: FindingRecord;
  overview?: OverviewSummary;
  scorecardReport?: ScorecardReportRecord;
  repositories?: RepositoryRecord[];
}> {
  if (await isStaticModeActive()) return staticMergeAndVerifyFix(fixId);
  return postJson(`/fixes/${encodeURIComponent(fixId)}/merge-and-verify`, {});
}

export async function toggleRepositoryCoverageApi(
  repoId: string,
): Promise<{ repository: RepositoryRecord }> {
  if (await isStaticModeActive()) return staticToggleRepositoryCoverage(repoId);
  return postJson(`/repositories/${encodeURIComponent(repoId)}/toggle-scans`, {});
}

export async function prepareCampaignApi(input: {
  prompt: string;
  targetUrl: string;
  sourceLabel?: string;
  askForApproval: boolean;
  modelId: string;
}): Promise<{ campaign: RedTeamCampaignRun }> {
  if (await isStaticModeActive()) throwLiveRuntimeRequired('Preparing a live Red Team campaign');
  return postJson('/red-team/campaigns/prepare', input);
}

export async function launchCampaignApi(
  campaignId: string,
  yamlText: string,
  signedManifest?: unknown,
): Promise<{ campaign: RedTeamCampaignRun }> {
  if (await isStaticModeActive()) throwLiveRuntimeRequired('Launching live Red Team probes');
  return postJson(
    `/red-team/campaigns/${encodeURIComponent(campaignId)}/launch`,
    signedManifest ? { yamlText, signedManifest } : { yamlText },
  );
}

export async function resolveApprovalApi(
  approvalId: string,
  decision: 'approved' | 'rejected',
): Promise<{ approval: HitlApprovalRequest; campaign?: RedTeamCampaignRun }> {
  if (await isStaticModeActive()) return staticResolveApproval(approvalId, decision);
  return postJson(`/policy/approvals/${encodeURIComponent(approvalId)}/resolve`, { decision });
}

export async function toggleKillSwitchApi(
  engaged: boolean,
  reason: string,
): Promise<{ engaged: boolean }> {
  if (await isStaticModeActive()) return staticToggleKillSwitch(engaged);
  return postJson('/policy/kill-switch', { engaged, reason });
}
