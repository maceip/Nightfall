import React, { useMemo, useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import type { FindingRecord, OverviewSummary, Severity } from '@nightfall/core-contracts';
import {
  Button,
  CodeIcon,
  DataTable,
  type DataTableColumn,
  FilterIcon,
  Input,
  MoreHorizontalIcon,
  NightfallHorizonIcon,
  RedTeamSparkIcon,
  SankeyDiagram,
  ScorecardPostureIcon,
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AVATAR_TONES = [
  'bg-sky-100 text-sky-800',
  'bg-violet-100 text-violet-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
];

function getAvatarTone(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) {
    sum = (sum + seed.charCodeAt(i)) % AVATAR_TONES.length;
  }
  return AVATAR_TONES[sum] ?? AVATAR_TONES[0]!;
}

function formatDetectedShort(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!match) return 'Recent';
  const monthIdx = Number.parseInt(match[2]!, 10) - 1;
  const day = Number.parseInt(match[3]!, 10);
  if (!Number.isFinite(monthIdx) || monthIdx < 0 || monthIdx > 11 || !Number.isFinite(day)) {
    return 'Recent';
  }
  return `${MONTHS[monthIdx]} ${day}`;
}

function getFindingLocation(f: FindingRecord): string {
  const ref = f.codeReferences[0];
  if (ref) return `${ref.file}:${ref.startLine}`;
  return f.affectedEndpoint ?? f.subtitle;
}

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
          f.repository.toLowerCase().includes(q) ||
          f.subtitle.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [findings, selectedRepo, selectedSeverity, statusFilter, search]);

  const columns: DataTableColumn<FindingRecord>[] = [
    {
      key: 'severity',
      header: 'Severity ↓',
      className: 'w-28',
      cell: (f) => <SeverityBadge severity={f.severity} />,
    },
    {
      key: 'title',
      header: 'Title',
      cell: (f) => (
        <div className="min-w-[220px]">
          <div className="font-semibold text-ink">{f.title}</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            <span className="font-mono">{f.id}</span> ·{' '}
            <span className="font-mono">{getFindingLocation(f)}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'repository',
      header: 'Repository',
      className: 'w-40',
      cell: (f) => <span className="font-mono text-[12.5px] text-ink-secondary">{f.repository}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-32',
      cell: (f) => <StatusBadge status={f.status} />,
    },
    {
      key: 'owner',
      header: 'Owner',
      className: 'w-40',
      cell: (f) => (
        <span className="inline-flex items-center gap-2">
          <span
            className={`inline-flex size-6 items-center justify-center rounded-full text-[10.5px] font-semibold ${getAvatarTone(f.owner.name)}`}
          >
            {f.owner.initials}
          </span>
          <span className="text-[13px] text-ink">{f.owner.name}</span>
        </span>
      ),
    },
    {
      key: 'sources',
      header: 'Sources',
      className: 'w-24',
      cell: (f) => {
        const rawSources = f.sources as readonly string[];
        const hasRedTeam =
          rawSources.includes('red-team') || rawSources.includes('nightfall_red_team');
        const hasScorecard =
          rawSources.includes('scorecard') || rawSources.includes('nightfall_scorecard');
        return (
          <span className="inline-flex items-center -space-x-1.5">
            <span
              title="Nightfall Defense Factory"
              className="inline-flex size-6 items-center justify-center rounded-full bg-pill text-ink ring-2 ring-canvas"
            >
              <NightfallHorizonIcon size={13} />
            </span>
            {hasRedTeam ? (
              <span
                title="Nightfall Red Team"
                className="inline-flex size-6 items-center justify-center rounded-full bg-sky-100 text-accent-blue ring-2 ring-canvas"
              >
                <RedTeamSparkIcon size={12} />
              </span>
            ) : null}
            {hasScorecard ? (
              <span
                title="Nightfall Scorecard"
                className="inline-flex size-6 items-center justify-center rounded-full bg-status-mint text-status-mint-ink ring-2 ring-canvas"
              >
                <ScorecardPostureIcon size={12} />
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'detected',
      header: 'Detected',
      className: 'w-24 text-right whitespace-nowrap',
      cell: (f) => <span className="text-xs text-ink-muted">{formatDetectedShort(f.createdAt)}</span>,
    },
  ];

  return (
    <VStack id="view-findings" gap={4} className="tabular-nums">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-canvas px-4 py-3">
        <HStack gap={2} align="center" className="text-[13.5px] text-ink">
          <CodeIcon size={16} className="text-ink-secondary" />
          <span>
            Fix proposals ready for review
            {overview.proposedFixesCount > 0
              ? ` · ${overview.proposedFixesCount} verified ${overview.proposedFixesCount === 1 ? 'patch' : 'patches'} queued`
              : ''}
          </span>
        </HStack>
        <Button id="btn-banner-view-fixes" variant="default" size="sm" onClick={onNavigateFixes}>
          View fixes
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <Input
            id="input-search-findings"
            type="text"
            placeholder="Search findings"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-full border-hairline-strong bg-canvas pl-9"
          />
        </div>

        <HStack gap={2} align="center" wrap="wrap">
          <select
            id="select-findings-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'open' | 'all' | 'fixed')}
            aria-label="Filter findings by status"
            className="h-9 rounded-full border border-hairline-strong bg-canvas px-3.5 text-[13px] font-medium text-ink outline-none"
          >
            <option value="open">Open findings</option>
            <option value="all">All findings</option>
            <option value="fixed">Fixed</option>
          </select>

          <Button
            id="btn-findings-clear-filters"
            variant="outline"
            onClick={() => {
              setSearch('');
              setStatusFilter('open');
              onSelectSeverity(null);
            }}
          >
            <FilterIcon size={14} />
            <span>Filters</span>
          </Button>

          <Button
            id="btn-findings-more"
            variant="outline"
            size="icon"
            aria-label="More findings options"
          >
            <MoreHorizontalIcon size={15} />
          </Button>
        </HStack>
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
    </VStack>
  );
}
