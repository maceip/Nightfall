import type {
  FindingRecord,
  FixProposal,
  HitlApprovalRequest,
  OverviewSummary,
  RepositoryRecord,
  SankeyLink,
  ScorecardCheckCatalogEntry,
  ScorecardToolchainStatus,
  Severity,
} from '@nightfall/core-contracts';
import type { NightfallBootstrapPayload } from './nightfall-client.js';

declare const __NIGHTFALL_PAGES_STATIC__: boolean | undefined;

export type CapturedPagesBootstrapEnvelope = {
  capturedAt: string;
  payloadSha256: string;
  payload: Omit<NightfallBootstrapPayload, 'connectedLiveApi'>;
  scorecardChecks: ScorecardCheckCatalogEntry[];
};

type PersistedPagesWorkspace = {
  payloadSha256: string;
  state: Omit<NightfallBootstrapPayload, 'connectedLiveApi'>;
  scorecardChecks: ScorecardCheckCatalogEntry[];
};

const STORAGE_KEY = 'nightfall.pages.workspace.v1';
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
};

export function isPagesStaticBuild(): boolean {
  return typeof __NIGHTFALL_PAGES_STATIC__ !== 'undefined' && __NIGHTFALL_PAGES_STATIC__ === true;
}

let cachedEnvelopePromise: Promise<CapturedPagesBootstrapEnvelope> | null = null;

async function sha256HexBrowser(text: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchVerifiedEnvelope(): Promise<CapturedPagesBootstrapEnvelope> {
  if (!cachedEnvelopePromise) {
    cachedEnvelopePromise = (async () => {
      const res = await fetch('./captured-bootstrap.json');
      if (!res.ok) {
        throw new Error(`Failed to load captured Nightfall workspace (HTTP ${res.status}).`);
      }
      const env = (await res.json()) as CapturedPagesBootstrapEnvelope;
      const digest = await sha256HexBrowser(JSON.stringify(env.payload));
      if (digest && env.payloadSha256 && digest !== env.payloadSha256) {
        throw new Error('Captured Nightfall workspace SHA-256 integrity check failed.');
      }
      return env;
    })();
  }
  return cachedEnvelopePromise;
}

function recomputeOverview(
  prev: OverviewSummary,
  findings: FindingRecord[],
  fixes: FixProposal[],
): OverviewSummary {
  const severityCounts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };
  const statusCounts = { new: 0, triaged: 0, in_progress: 0, fixed: 0 };
  const matrix: Record<Severity, { in_progress: number; triaged: number; new: number }> = {
    critical: { in_progress: 0, triaged: 0, new: 0 },
    high: { in_progress: 0, triaged: 0, new: 0 },
    medium: { in_progress: 0, triaged: 0, new: 0 },
    low: { in_progress: 0, triaged: 0, new: 0 },
    informational: { in_progress: 0, triaged: 0, new: 0 },
  };

  for (const f of findings) {
    if (f.status === 'fixed') {
      statusCounts.fixed += 1;
    } else if (f.status === 'new' || f.status === 'triaged' || f.status === 'in_progress') {
      severityCounts[f.severity] += 1;
      statusCounts[f.status] += 1;
      matrix[f.severity][f.status] += 1;
    }
  }

  const sankeyLinks: SankeyLink[] = [];
  for (const sev of SEVERITY_ORDER) {
    if (severityCounts[sev] > 0) {
      sankeyLinks.push({ source: 'Findings', target: SEVERITY_LABELS[sev], value: severityCounts[sev] });
    }
  }
  const statusOrder: Array<['in_progress' | 'triaged' | 'new', string]> = [
    ['in_progress', 'In Progress'],
    ['triaged', 'Triaged'],
    ['new', 'New'],
  ];
  for (const sev of SEVERITY_ORDER) {
    for (const [key, label] of statusOrder) {
      if (matrix[sev][key] > 0) {
        sankeyLinks.push({ source: SEVERITY_LABELS[sev], target: label, value: matrix[sev][key] });
      }
    }
  }

  return {
    ...prev,
    proposedFixesCount: fixes.filter((fx) => fx.status === 'proposed').length,
    openFindingsCount: statusCounts.new + statusCounts.triaged + statusCounts.in_progress,
    fixedFindingsCount: statusCounts.fixed,
    severityCounts,
    statusCounts,
    sankeyLinks,
  };
}

async function readOrInitStore(): Promise<PersistedPagesWorkspace> {
  const env = await fetchVerifiedEnvelope();
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedPagesWorkspace;
        if (parsed.payloadSha256 === env.payloadSha256 && parsed.state) {
          return parsed;
        }
      }
    } catch {
      // ignore corrupted storage entry and re-seed from verified capture
    }
  }
  const seeded: PersistedPagesWorkspace = {
    payloadSha256: env.payloadSha256,
    state: structuredClone(env.payload),
    scorecardChecks: structuredClone(env.scorecardChecks),
  };
  writeStore(seeded);
  return seeded;
}

function writeStore(next: PersistedPagesWorkspace): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}

export async function loadStaticPagesBootstrap(): Promise<NightfallBootstrapPayload> {
  const store = await readOrInitStore();
  return { ...store.state, connectedLiveApi: false };
}

export async function staticFetchScorecardChecks(): Promise<{
  checks: ScorecardCheckCatalogEntry[];
  toolchain: ScorecardToolchainStatus;
}> {
  const store = await readOrInitStore();
  const toolchain: ScorecardToolchainStatus = store.state.scorecardToolchain ?? {
    available: false,
    binDir: null,
    binaryPath: null,
    serviceMode: 'unavailable',
    daemonUrl: null,
    version: null,
    vendoredPath: 'vendor/scorecard',
    upstreamRepo: 'https://github.com/ossf/scorecard',
    pinnedCommit: 'vendored',
  };
  return { checks: store.scorecardChecks, toolchain };
}

export async function staticMarkFindingDuplicate(
  findingId: string,
  duplicateOfId?: string,
): Promise<{ finding: FindingRecord; overview: OverviewSummary }> {
  const store = await readOrInitStore();
  const target = store.state.findings.find((f) => f.id === findingId);
  if (!target) throw new Error(`Finding ${findingId} not found.`);
  const updated: FindingRecord = {
    ...target,
    status: 'discarded_fp',
    ...(duplicateOfId ? { duplicateOfId } : {}),
    updatedAt: new Date().toISOString(),
  };
  const findings = store.state.findings.map((f) => (f.id === findingId ? updated : f));
  const overview = recomputeOverview(store.state.overview, findings, store.state.fixes);
  writeStore({ ...store, state: { ...store.state, findings, overview } });
  return { finding: updated, overview };
}

export async function staticStartFixProposal(
  findingId: string,
): Promise<{ fix: FixProposal; finding?: FindingRecord; overview?: OverviewSummary }> {
  const store = await readOrInitStore();
  const finding = store.state.findings.find((f) => f.id === findingId);
  const existing = store.state.fixes.find(
    (fx) => fx.id === finding?.fixId || fx.findingIds.includes(findingId),
  );
  if (existing) return { fix: existing, finding, overview: store.state.overview };
  throwLiveRuntimeRequired('Generating a new Git patch and Microsoft LiteBox proof');
}

export async function staticSendFixFollowUp(
  fixId: string,
  message: string,
): Promise<{ fix: FixProposal }> {
  const store = await readOrInitStore();
  const target = store.state.fixes.find((fx) => fx.id === fixId);
  if (!target) throw new Error(`Fix ${fixId} not found.`);
  const now = new Date().toISOString();
  const updated: FixProposal = {
    ...target,
    updatedAt: now,
    conversation: [
      ...target.conversation,
      { id: `msg-${Date.now()}`, role: 'user', text: message, createdAt: now },
    ],
  };
  const fixes = store.state.fixes.map((fx) => (fx.id === fixId ? updated : fx));
  writeStore({ ...store, state: { ...store.state, fixes } });
  return { fix: updated };
}

export async function staticMergeAndVerifyFix(fixId: string): Promise<{
  fix: FixProposal;
  finding?: FindingRecord;
  overview: OverviewSummary;
  repositories: RepositoryRecord[];
}> {
  const store = await readOrInitStore();
  const target = store.state.fixes.find((fx) => fx.id === fixId);
  if (!target) throw new Error(`Fix ${fixId} not found.`);
  const now = new Date().toISOString();
  const mergedFix: FixProposal = { ...target, status: 'merged', updatedAt: now };
  const fixes = store.state.fixes.map((fx) => (fx.id === fixId ? mergedFix : fx));
  const findings = store.state.findings.map((f) =>
    target.findingIds.includes(f.id)
      ? ({ ...f, status: 'fixed', fixVerification: 'verified', updatedAt: now } as FindingRecord)
      : f,
  );
  const overview = recomputeOverview(store.state.overview, findings, fixes);
  writeStore({ ...store, state: { ...store.state, fixes, findings, overview } });
  return {
    fix: mergedFix,
    finding: findings.find((f) => target.findingIds.includes(f.id)),
    overview,
    repositories: store.state.repositories,
  };
}

export async function staticToggleRepositoryCoverage(
  repoId: string,
): Promise<{ repository: RepositoryRecord }> {
  const store = await readOrInitStore();
  const target = store.state.repositories.find((r) => r.id === repoId);
  if (!target) throw new Error(`Repository ${repoId} not found.`);
  const nextEnabled = !target.prReviewsEnabled;
  const updated: RepositoryRecord = {
    ...target,
    prReviewsEnabled: nextEnabled,
    needsAttention: !nextEnabled || target.openFindingsCount >= 3,
  };
  const repositories = store.state.repositories.map((r) => (r.id === repoId ? updated : r));
  writeStore({ ...store, state: { ...store.state, repositories } });
  return { repository: updated };
}

export async function staticResolveApproval(
  approvalId: string,
  decision: 'approved' | 'rejected',
): Promise<{ approval: HitlApprovalRequest }> {
  const store = await readOrInitStore();
  const target = store.state.approvals.find((a) => a.id === approvalId);
  if (!target) throw new Error(`Approval ${approvalId} not found.`);
  const updated: HitlApprovalRequest = {
    ...target,
    status: decision,
    resolvedAt: new Date().toISOString(),
    resolvedBy: 'web-operator',
  };
  const approvals = store.state.approvals.map((a) => (a.id === approvalId ? updated : a));
  writeStore({ ...store, state: { ...store.state, approvals } });
  return { approval: updated };
}

export async function staticToggleKillSwitch(engaged: boolean): Promise<{ engaged: boolean }> {
  const store = await readOrInitStore();
  writeStore({ ...store, state: { ...store.state, killSwitchEngaged: engaged } });
  return { engaged };
}

export function throwLiveRuntimeRequired(actionLabel: string): never {
  throw new Error(
    `${actionLabel} requires a live host runtime. Install Nightfall Desktop (.dmg / .msi) or start the local API daemon (pnpm dev:api on 127.0.0.1:4000).`,
  );
}
