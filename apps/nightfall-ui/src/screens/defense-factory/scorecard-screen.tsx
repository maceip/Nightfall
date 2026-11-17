import React, { useMemo, useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import type {
  FindingRecord,
  RepositoryRecord,
  ScorecardCheckResult,
  ScorecardReportRecord,
  ScorecardScanRequest,
} from '@nightfall/core-contracts';
import {
  Button,
  ConnectedKpiStrip,
  DataTable,
  type DataTableColumn,
  Input,
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

function mapCheckStatus(status: ScorecardCheckResult['status']): string {
  if (status === 'pass') return 'verified';
  if (status === 'fail') return 'critical';
  if (status === 'warn') return 'verifying';
  return 'not_recorded';
}

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
    selectedRepo !== 'all'
      ? selectedRepo
      : (reports[0]?.repository ?? repositories[0]?.name ?? 'northstar-docs');

  const linkedFindingsByCheck = useMemo(() => {
    const map = new Map<string, FindingRecord>();
    for (const f of findings) {
      if (!f.sources.includes('scorecard')) continue;
      if (activeReport && f.repository !== activeReport.repository) continue;
      for (const check of activeReport?.checks ?? []) {
        if (
          f.subtitle.includes(check.name) ||
          f.rootCauseClusterKey.includes(check.name.toLowerCase())
        ) {
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
        return (
          c.name.toLowerCase().includes(q) ||
          c.reason.toLowerCase().includes(q) ||
          c.short.toLowerCase().includes(q)
        );
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
          <div className="font-semibold text-ink">{c.name}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{c.short || c.reason}</div>
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
      cell: (c) => <StatusBadge status={mapCheckStatus(c.status)} label={c.status} />,
    },
    {
      key: 'reason',
      header: 'Telemetry Reason',
      cell: (c) => <span className="text-xs text-ink-secondary">{c.reason}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'w-44 text-right whitespace-nowrap',
      cell: (c) => {
        const linked = linkedFindingsByCheck.get(c.name);
        return (
          <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              id={`btn-inspect-check-${c.name}`}
              variant="outline"
              size="sm"
              onClick={() => setInspectedCheck(c)}
            >
              Inspect
            </Button>
            {linked ? (
              <Button id={`btn-fix-check-${c.name}`} size="sm" onClick={() => onFixFinding(linked)}>
                {linked.fixId ? 'View Fix' : 'Fix'}
              </Button>
            ) : null}
          </span>
        );
      },
    },
  ];

  async function handleRunScan(): Promise<void> {
    setScanning(true);
    try {
      const targetRepo =
        selectedRepo !== 'all'
          ? selectedRepo
          : (reports[0]?.repository ?? repositories[0]?.name ?? 'northstar-docs');
      const repoRec = repositories.find((r) => r.name === targetRepo);
      const req: ScorecardScanRequest =
        targetType === 'local'
          ? {
              targetType: 'local',
              repository: targetRepo,
              ...(repoRec?.localPath ? { localPath: repoRec.localPath } : {}),
              promoteFindings: true,
              includeGovernanceChecks: false,
            }
          : {
              targetType: 'remote',
              repository:
                remoteTarget.replace(/^https?:\/\/github\.com\//, '').split('/').slice(-1)[0] ||
                remoteTarget,
              remoteRepo: remoteTarget.trim(),
              promoteFindings: true,
              includeGovernanceChecks: true,
            };
      const next = await onRunScorecardScan(req);
      if (next) onSelectRepo(next.repository);
    } finally {
      setScanning(false);
    }
  }

  return (
    <VStack id="view-scorecard" gap={4} className="tabular-nums">
      <ConnectedKpiStrip
        cells={[
          { key: 'repos', label: 'Evaluated repositories', value: reports.length, suffix: `/ ${repositories.length}` },
          { key: 'passing', label: 'Passing checks', value: activeReport?.riskSummary.passingChecks ?? 0 },
          { key: 'open', label: 'Open Scorecard findings', value: promotedCount },
        ]}
      />

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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-canvas p-4">
        <HStack gap={2} align="center" wrap="wrap">
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
              aria-label="Select Scorecard repository"
              className="h-9 rounded-full border border-hairline-strong bg-canvas px-3.5 text-xs font-medium text-ink outline-none"
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
              className="w-64 border-hairline-strong bg-canvas"
            />
          )}
        </HStack>

        <Button id="btn-run-scorecard-scan" disabled={scanning} onClick={() => void handleRunScan()}>
          {scanning ? 'Evaluating Posture…' : 'Run Scorecard Scan'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            id="input-search-scorecard-checks"
            placeholder="Filter Scorecard checks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-full border-hairline-strong bg-canvas pl-9"
          />
        </div>
        <select
          id="select-scorecard-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'actionable' | 'pass')}
          aria-label="Filter Scorecard checks by status"
          className="h-9 rounded-full border border-hairline-strong bg-canvas px-3.5 text-xs font-medium text-ink outline-none"
        >
          <option value="all">All checks</option>
          <option value="actionable">Failing &amp; warnings</option>
          <option value="pass">Passing checks</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-hairline bg-canvas">
        <DataTable
          columns={columns}
          rows={filteredChecks}
          rowKey={(c) => c.name}
          rowId={(c) => `scorecard-check-row-${c.name}`}
          onRowClick={setInspectedCheck}
          ariaLabel="Scorecard security posture checks"
        />
      </div>

      <ScorecardCheckDrawer
        check={inspectedCheck}
        repository={activeReport?.repository ?? activeRepoName}
        linkedFinding={inspectedCheck ? linkedFindingsByCheck.get(inspectedCheck.name) : undefined}
        onClose={() => setInspectedCheck(null)}
        onFixWithNightfall={onFixFinding}
      />
    </VStack>
  );
}
