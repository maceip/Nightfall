import React, { useMemo, useState } from 'react';
import type { FindingRecord, OverviewSummary, Severity } from '@nightfall/core-contracts';
import {
  Button,
  CodeIcon,
  DataTable,
  type DataTableColumn,
  FilterIcon,
  Input,
  NightfallHorizonIcon,
  RedTeamSparkIcon,
  SankeyDiagram,
  SearchIcon,
  SeverityBadge,
  StatusBadge,
} from '@nightfall/ui-kit';

export type FindingsScreenProps = {
  overview: OverviewSummary;
  findings: FindingRecord[];
  selectedRepo: string;
  selectedSeverity: Severity | null;
  onSelectSeverity: (sev: Severity | null) => void;
  onSelectFinding: (finding: FindingRecord) => void;
  onNavigateFixes: () => void;
};

export function FindingsScreen({
  overview,
  findings,
  selectedRepo,
  selectedSeverity,
  onSelectSeverity,
  onSelectFinding,
  onNavigateFixes,
}: FindingsScreenProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'fixed'>('open');

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      if (selectedRepo !== 'all' && f.repository !== selectedRepo) return false;
      if (selectedSeverity && f.severity !== selectedSeverity) return false;
      if (statusFilter === 'open' && (f.status === 'fixed' || f.status === 'discarded_fp')) {
        return false;
      }
      if (statusFilter === 'fixed' && f.status !== 'fixed') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          f.title.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q) ||
          f.repository.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [findings, selectedRepo, selectedSeverity, statusFilter, search]);

  const columns: DataTableColumn<FindingRecord>[] = [
    {
      key: 'select',
      header: '',
      className: 'w-9',
      cell: (f) => (
        <span onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select ${f.id}`}
            className="size-3.5 rounded border-primary-300 accent-primary-900"
          />
        </span>
      ),
    },
    {
      key: 'severity',
      header: 'Severity ↓',
      className: 'w-28',
      cell: (f) => <SeverityBadge severity={f.severity} />,
    },
    {
      key: 'finding',
      header: 'Finding',
      cell: (f) => (
        <div>
          <div className="font-medium text-ink">{f.title}</div>
          <div className="mt-0.5 text-xs text-primary-500">{f.subtitle}</div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      className: 'w-40',
      cell: (f) => (
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary-800 text-[10px] font-semibold text-surface">
            {f.owner.initials}
          </span>
          <span className="text-[13px] text-primary-800">{f.owner.name}</span>
        </span>
      ),
    },
    {
      key: 'sources',
      header: 'Sources',
      className: 'w-24',
      cell: (f) => (
        <span className="inline-flex items-center gap-1.5 text-ink">
          <NightfallHorizonIcon size={16} />
          {f.sources.includes('red-team') ? <RedTeamSparkIcon size={14} /> : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-32',
      cell: (f) => <StatusBadge status={f.status} />,
    },
  ];

  return (
    <div id="view-findings" className="space-y-4 tabular-nums">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
        <div className="flex items-center gap-2.5 text-[13.5px] text-ink">
          <CodeIcon size={16} className="text-primary-600" />
          <span>
            Review <span className="font-semibold">{overview.proposedFixesCount} proposed fixes</span>{' '}
            to help reduce vulnerabilities in your code.
          </span>
        </div>
        <Button id="btn-banner-view-fixes" size="sm" onClick={onNavigateFixes}>
          View fixes
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-500"
          />
          <Input
            id="input-search-findings"
            type="text"
            placeholder="Search findings"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <select
          id="select-findings-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'open' | 'all' | 'fixed')}
          className="h-8 rounded-lg border border-primary-200 bg-surface px-3 text-[13px] font-medium text-ink outline-none focus:border-primary-400"
        >
          <option value="open">Open findings</option>
          <option value="all">All findings</option>
          <option value="fixed">Fixed findings</option>
        </select>

        <Button
          id="btn-findings-clear-filters"
          variant="outline"
          onClick={() => {
            setSearch('');
            onSelectSeverity(null);
          }}
        >
          <FilterIcon size={14} />
          <span>Filters</span>
        </Button>
      </div>

      <SankeyDiagram
        totalOpen={overview.openFindingsCount}
        severityCounts={overview.severityCounts}
        statusCounts={{
          new: overview.statusCounts.new,
          triaged: overview.statusCounts.triaged,
          in_progress: overview.statusCounts.in_progress,
        }}
        links={overview.sankeyLinks}
        selectedSeverity={selectedSeverity}
        onSelectSeverity={onSelectSeverity}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(f) => f.id}
        rowId={(f) => `finding-row-${f.id}`}
        onRowClick={onSelectFinding}
        ariaLabel="Security findings list"
      />
    </div>
  );
}
