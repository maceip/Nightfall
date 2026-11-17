import React, { useMemo, useState } from 'react';
import type {
  FindingRecord,
  RepositoryRecord,
  ScorecardCheckResult,
  ScorecardReportRecord,
  ScorecardScanRequest,
} from '@nightfall/core-contracts';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  Input,
  KpiCard,
  ScorecardPostureMeter,
  ScorecardScorePill,
  SearchIcon,
  SegmentedControl,
  SeverityBadge,
  StatusBadge,
} from '@nightfall/ui-kit';
import {
  mapScorecardRiskToSeverity,
  ScorecardCheckDrawer,
} from './scorecard-check-drawer.js';

export type ScorecardScreenProps = {
  reports: ScorecardReportRecord[];
  repositories: RepositoryRecord[];
  findings: FindingRecord[];
  selectedRepo: string;
  onSelectRepo: (repo: string) => void;
  onRunScorecardScan: (req: ScorecardScanRequest) => Promise<ScorecardReportRecord | null>;
  onFixFinding: (finding: FindingRecord) => void;
};

export function ScorecardScreen({
  reports,
  repositories,
  findings,
  selectedRepo,
  onSelectRepo,
  onRunScorecardScan,
  onFixFinding,
}: ScorecardScreenProps): React.ReactElement {
  const [targetType, setTargetType] = useState<'local' | 'remote'>('local');
  const [remoteTarget, setRemoteTarget] = useState('github.com/ossf/scorecard');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'actionable' | 'pass'>('all');
  const [scanning, setScanning] = useState(false);
  const [inspectedCheck, setInspectedCheck] = useState<ScorecardCheckResult | null>(null);

  const activeReport = useMemo(() => {
    if (selectedRepo !== 'all') {
      const exact = reports.find((r) => r.repository === selectedRepo);
      if (exact) return exact;
    }
    return reports[0] ?? null;
  }, [reports, selectedRepo]);

  const activeRepoName =
    selectedRepo !== 'all' ? selectedRepo : (activeReport?.repository ?? repositories[0]?.name ?? 'northstar-docs');

  const linkedFindingsByCheck = useMemo(() => {
    const map = new Map<string, FindingRecord>();
    for (const f of findings) {
      if (!f.sources.includes('scorecard')) continue;
      if (activeReport && f.repository !== activeReport.repository) continue;
      for (const check of activeReport?.checks ?? []) {
        if (f.subtitle.includes(check.name) || f.rootCauseClusterKey.includes(check.name.toLowerCase())) {
          map.set(check.name, f);
        }
      }
    }
    return map;
  }, [findings, activeReport]);

  const filteredChecks = useMemo(() => {
    const checks = activeReport?.checks ?? [];
    return checks.filter((c) => {
      if (statusFilter === 'actionable' && c.status !== 'fail' && c.status !== 'warn') return false;
      if (statusFilter === 'pass' && c.status !== 'pass') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.reason.toLowerCase().includes(q) || c.short.toLowerCase().includes(q);
      }
      return true;
    });
  }, [activeReport, statusFilter, search]);

  const promotedCount = useMemo(
    () => findings.filter((f) => f.sources.includes('scorecard') && f.status !== 'fixed').length,
    [findings],
  );

  const columns: DataTableColumn<ScorecardCheckResult>[] = [
    {
      key: 'check',
      header: 'Check',
      cell: (c) => (
        <div>
          <div className="font-medium text-ink">{c.name}</div>
          <div className="mt-0.5 text-xs text-primary-500">{c.short || c.reason}</div>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      className: 'w-28',
      cell: (c) => <ScorecardScorePill score={c.score} />,
    },
    {
      key: 'risk',
      header: 'Risk',
      className: 'w-28',
      cell: (c) => <SeverityBadge severity={mapScorecardRiskToSeverity(c.risk)} />,
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-28',
      cell: (c) => (
        <StatusBadge
          status={c.status === 'pass' ? 'verified' : c.status === 'fail' ? 'critical' : c.status === 'warn' ? 'verifying' : 'not_recorded'}
          label={c.status}
        />
      ),
    },
    {
      key: 'reason',
      header: 'Telemetry Reason',
      cell: (c) => <span className="text-xs text-primary-700">{c.reason}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-44 text-right whitespace-nowrap',
      cell: (c) => {
        const linked = linkedFindingsByCheck.get(c.name);
        return (
          <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              id={`btn-inspect-check-${c.name}`}
              variant="outline"
              size="sm"
              onClick={() => setInspectedCheck(c)}
            >
              Inspect
            </Button>
            {linked ? (
              <Button
                id={`btn-fix-check-${c.name}`}
                size="sm"
                onClick={() => onFixFinding(linked)}
              >
                {linked.fixId ? 'View Fix' : 'Fix'}
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  async function handleRunScan(): Promise<void> {
    setScanning(true);
    try {
      const repoRec = repositories.find((r) => r.name === activeRepoName);
      const req: ScorecardScanRequest =
        targetType === 'local'
          ? {
              targetType: 'local',
              repository: activeRepoName,
              ...(repoRec?.localPath ? { localPath: repoRec.localPath } : {}),
              promoteFindings: true,
              includeGovernanceChecks: false,
            }
          : {
              targetType: 'remote',
              repository: remoteTarget.replace(/^https?:\/\/github\.com\//, '').split('/').slice(-1)[0] || remoteTarget,
              remoteRepo: remoteTarget.trim(),
              promoteFindings: true,
              includeGovernanceChecks: true,
            };
      const next = await onRunScorecardScan(req);
      if (next) {
        onSelectRepo(next.repository);
      }
    } finally {
      setScanning(false);
    }
  }

  return (
    <div id="view-scorecard" className="space-y-4 tabular-nums">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Evaluated repositories" value={reports.length} suffix={`/ ${repositories.length}`} />
        <KpiCard label="Passing checks" value={activeReport?.riskSummary.passingChecks ?? 0} />
        <KpiCard label="Open Scorecard findings" value={promotedCount} />
      </div>

      {activeReport ? (
        <ScorecardPostureMeter
          repository={activeReport.repository}
          aggregateScore={activeReport.aggregateScore}
          riskSummary={activeReport.riskSummary}
          observedRevision={activeReport.observedRevision}
          evaluatedAt={activeReport.evaluatedAt}
          scorecardVersion={activeReport.scorecardVersion}
        />
      ) : null}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SegmentedControl
            value={targetType}
            onChange={setTargetType}
            options={[
              { id: 'btn-scorecard-mode-local', value: 'local', label: 'Local Workspace' },
              { id: 'btn-scorecard-mode-remote', value: 'remote', label: 'Remote GitHub' },
            ]}
          />
          {targetType === 'local' ? (
            <select
              id="select-scorecard-repo"
              value={activeRepoName}
              onChange={(e) => onSelectRepo(e.target.value)}
              className="h-8 rounded-lg border border-primary-200 bg-surface px-3 text-xs font-medium text-ink outline-none"
            >
              {repositories.map((r) => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          ) : (
            <Input
              id="input-scorecard-target"
              value={remoteTarget}
              onChange={(e) => setRemoteTarget(e.target.value)}
              placeholder="github.com/owner/repo"
              className="w-64"
            />
          )}
        </div>
        <Button id="btn-run-scorecard-scan" disabled={scanning} onClick={() => void handleRunScan()}>
          {scanning ? 'Evaluating Posture…' : 'Run Scorecard Scan'}
        </Button>
      </Card>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-500" />
          <Input
            id="input-search-scorecard-checks"
            placeholder="Filter Scorecard checks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <select
          id="select-scorecard-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'actionable' | 'pass')}
          className="h-8 rounded-lg border border-primary-200 bg-surface px-3 text-xs font-medium text-ink outline-none"
        >
          <option value="all">All checks</option>
          <option value="actionable">Failing &amp; warnings</option>
          <option value="pass">Passing checks</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={filteredChecks}
        rowKey={(c) => c.name}
        rowId={(c) => `scorecard-check-row-${c.name}`}
        onRowClick={setInspectedCheck}
        ariaLabel="Scorecard security posture checks"
      />

      <ScorecardCheckDrawer
        check={inspectedCheck}
        repository={activeReport?.repository ?? activeRepoName}
        linkedFinding={inspectedCheck ? linkedFindingsByCheck.get(inspectedCheck.name) : undefined}
        onClose={() => setInspectedCheck(null)}
        onFixWithNightfall={onFixFinding}
      />
    </div>
  );
}
