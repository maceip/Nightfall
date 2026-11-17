import type {
  FindingRecord,
  FixProposal,
  OverviewSummary,
  RepositoryRecord,
  SankeyLink,
  ScanJobRecord,
  ScorecardReportRecord,
  Severity,
  StreamEvent,
} from '@nightfall/core-contracts';
import type { NightfallBootstrapPayload } from '../api/nightfall-client.js';

export type RepoScopedWorkspace = {
  overview: OverviewSummary;
  findings: FindingRecord[];
  fixes: FixProposal[];
  scans: ScanJobRecord[];
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
};

const OPEN_STATUS_TARGETS: Record<'new' | 'triaged' | 'in_progress', string> = {
  new: 'New',
  triaged: 'Triaged',
  in_progress: 'In Progress',
};

function safeInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;
}

function safeNullableScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

export function upsertScorecardReportList(
  list: ScorecardReportRecord[],
  report: ScorecardReportRecord,
): ScorecardReportRecord[] {
  const exists = list.some((r) => r.id === report.id || r.repository === report.repository);
  return exists
    ? list.map((r) => (r.id === report.id || r.repository === report.repository ? report : r))
    : [report, ...list];
}

export function applyWorkspaceStreamEvent(
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
  if (ev.type === 'scorecard.updated') {
    const scoredCount = ev.report.checks.filter((c) => c.score >= 0).length;
    return {
      ...prev,
      scorecardReports: upsertScorecardReportList(prev.scorecardReports, ev.report),
      repositories: prev.repositories.map((repo) =>
        repo.name === ev.report.repository || repo.fullName === ev.report.repository
          ? {
              ...repo,
              scorecardScore: ev.report.aggregateScore >= 0 ? ev.report.aggregateScore : null,
              scorecardPassingChecks: ev.report.riskSummary.passingChecks,
              scorecardTotalChecks: scoredCount,
              scorecardEvaluatedAt: ev.report.evaluatedAt,
            }
          : repo,
      ),
    };
  }
  if (ev.type === 'hitl.updated') {
    const exists = prev.approvals.some((a) => a.id === ev.approval.id);
    return {
      ...prev,
      approvals: exists
        ? prev.approvals.map((a) => (a.id === ev.approval.id ? ev.approval : a))
        : [ev.approval, ...prev.approvals],
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

function sanitizeOverview(raw: OverviewSummary): OverviewSummary {
  return {
    proposedFixesCount: safeInt(raw.proposedFixesCount),
    openFindingsCount: safeInt(raw.openFindingsCount),
    fixedFindingsCount: safeInt(raw.fixedFindingsCount),
    severityCounts: {
      critical: safeInt(raw.severityCounts?.critical),
      high: safeInt(raw.severityCounts?.high),
      medium: safeInt(raw.severityCounts?.medium),
      low: safeInt(raw.severityCounts?.low),
      informational: safeInt(raw.severityCounts?.informational),
    },
    statusCounts: {
      new: safeInt(raw.statusCounts?.new),
      triaged: safeInt(raw.statusCounts?.triaged),
      in_progress: safeInt(raw.statusCounts?.in_progress),
      fixed: safeInt(raw.statusCounts?.fixed),
    },
    sankeyLinks: (raw.sankeyLinks ?? [])
      .map((l) => ({ source: l.source, target: l.target, value: safeInt(l.value) }))
      .filter((l) => l.value > 0),
    dailyTrend: (raw.dailyTrend ?? []).map((pt) => ({
      date: pt.date,
      currentlyFixed: safeInt(pt.currentlyFixed),
      newFindings: safeInt(pt.newFindings),
    })),
    averageScorecardScore:
      raw.averageScorecardScore === undefined
        ? undefined
        : safeNullableScore(raw.averageScorecardScore),
    evaluatedScorecardReposCount:
      raw.evaluatedScorecardReposCount === undefined
        ? undefined
        : safeInt(raw.evaluatedScorecardReposCount),
  };
}

function matchesRepository(itemRepo: string, selected: string, rec?: RepositoryRecord): boolean {
  if (itemRepo === selected) return true;
  return Boolean(rec && (itemRepo === rec.name || itemRepo === rec.fullName));
}

function computeOpenSankeyLinks(openFindings: FindingRecord[]): SankeyLink[] {
  const counts = new Map<string, SankeyLink>();
  for (const finding of openFindings) {
    if (finding.status !== 'new' && finding.status !== 'triaged' && finding.status !== 'in_progress') {
      continue;
    }
    const source = SEVERITY_LABELS[finding.severity];
    const target = OPEN_STATUS_TARGETS[finding.status];
    const key = `${source}::${target}`;
    const existing = counts.get(key);
    if (existing) existing.value += 1;
    else counts.set(key, { source, target, value: 1 });
  }
  return Array.from(counts.values());
}

export function selectRepoScopedWorkspace(
  data: NightfallBootstrapPayload,
  selectedRepo: string,
): RepoScopedWorkspace {
  const cleanOverview = sanitizeOverview(data.overview);
  if (!selectedRepo || selectedRepo === 'all') {
    return { overview: cleanOverview, findings: data.findings, fixes: data.fixes, scans: data.scans };
  }

  const repoRecord = data.repositories.find(
    (r) => r.name === selectedRepo || r.fullName === selectedRepo || r.id === selectedRepo,
  );
  const findings = data.findings.filter((f) => matchesRepository(f.repository, selectedRepo, repoRecord));
  const fixes = data.fixes.filter((fx) => matchesRepository(fx.repository, selectedRepo, repoRecord));
  const scans = data.scans.filter((s) => matchesRepository(s.repository, selectedRepo, repoRecord));

  const openFindings = findings.filter(
    (f) => f.status === 'new' || f.status === 'triaged' || f.status === 'in_progress',
  );
  const fixedFindingsCount = findings.filter((f) => f.status === 'fixed').length;
  const proposedFixesCount = fixes.filter((fx) => fx.status === 'proposed').length;

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
  const statusCounts = { new: 0, triaged: 0, in_progress: 0, fixed: fixedFindingsCount };
  for (const f of openFindings) {
    severityCounts[f.severity] = safeInt(severityCounts[f.severity]) + 1;
    if (f.status === 'new' || f.status === 'triaged' || f.status === 'in_progress') {
      statusCounts[f.status] = safeInt(statusCounts[f.status]) + 1;
    }
  }

  const totalFindings = data.findings.length;
  const ratio =
    totalFindings > 0 && Number.isFinite(findings.length / totalFindings)
      ? findings.length / totalFindings
      : 0;
  const dailyTrend =
    findings.length === totalFindings
      ? cleanOverview.dailyTrend
      : cleanOverview.dailyTrend.map((pt) => ({
          date: pt.date,
          currentlyFixed: safeInt(Math.round(pt.currentlyFixed * ratio)),
          newFindings: safeInt(Math.round(pt.newFindings * ratio)),
        }));

  const matchingReport = data.scorecardReports.find((r) =>
    matchesRepository(r.repository, selectedRepo, repoRecord),
  );
  const repoScore = safeNullableScore(
    matchingReport ? matchingReport.aggregateScore : repoRecord?.scorecardScore,
  );

  return {
    overview: {
      proposedFixesCount,
      openFindingsCount: openFindings.length,
      fixedFindingsCount,
      severityCounts,
      statusCounts,
      sankeyLinks: computeOpenSankeyLinks(openFindings),
      dailyTrend,
      averageScorecardScore: repoScore,
      evaluatedScorecardReposCount: repoScore !== null ? 1 : 0,
    },
    findings,
    fixes,
    scans,
  };
}
