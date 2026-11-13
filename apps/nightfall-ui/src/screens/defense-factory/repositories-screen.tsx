import React, { useState } from 'react';
import type { RepositoryRecord } from '@nightfall/core-contracts';
import {
  Button,
  DataTable,
  type DataTableColumn,
  FilterIcon,
  Input,
  KpiCard,
  SearchIcon,
  SettingsIcon,
  StatusBadge,
} from '@nightfall/ui-kit';

export type RepositoriesScreenProps = {
  repositories: RepositoryRecord[];
  onToggleRepoScans: (repoId: string) => Promise<void>;
  onQuickScanRepo: (repoName: string) => Promise<void>;
};

export function RepositoriesScreen({
  repositories,
  onToggleRepoScans,
  onQuickScanRepo,
}: RepositoriesScreenProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);

  const prCovered = repositories.filter((r) => r.prReviewsEnabled).length;
  const schedCovered = repositories.filter((r) => r.scheduledScanLabel !== null).length;
  const needAttention = repositories.filter((r) => r.needsAttention).length;

  const filtered = repositories.filter((r) => {
    if (onlyAttention && !r.needsAttention) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.ownerTeam.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const columns: DataTableColumn<RepositoryRecord>[] = [
    {
      key: 'repo',
      header: 'Repository',
      cell: (repo) => (
        <div>
          <div className="font-medium text-ink">{repo.name}</div>
          <div className="mt-0.5 text-xs text-primary-500">{repo.fullName}</div>
        </div>
      ),
    },
    {
      key: 'pr',
      header: 'PR reviews',
      cell: (repo) => (
        <StatusBadge
          status={repo.prReviewsEnabled ? 'enabled' : 'new'}
          label={repo.prReviewsEnabled ? 'Enabled' : 'Disabled'}
        />
      ),
    },
    {
      key: 'scheduled',
      header: 'Scheduled scans',
      cell: (repo) =>
        repo.scheduledScanLabel ? (
          <StatusBadge status="enabled" label={repo.scheduledScanLabel} />
        ) : (
          <StatusBadge status="new" label="Paused" />
        ),
    },
    {
      key: 'lastScan',
      header: 'Last completed scan',
      cell: (repo) => <span className="text-primary-700">{repo.lastCompletedScanLabel}</span>,
    },
    {
      key: 'owner',
      header: 'Owner',
      cell: (repo) => <span className="font-medium text-ink">{repo.ownerTeam}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-32 text-right whitespace-nowrap',
      cell: (repo) => (
        <div className="inline-flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Toggle scan schedule"
            onClick={() => void onToggleRepoScans(repo.id)}
          >
            <SettingsIcon size={15} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onQuickScanRepo(repo.name)}
          >
            Scan
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div id="view-repositories" className="space-y-4 tabular-nums">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="PR review coverage"
          value={prCovered}
          suffix={`/ ${repositories.length}`}
        />
        <KpiCard
          label="Scheduled scan coverage"
          value={schedCovered}
          suffix={`/ ${repositories.length}`}
        />
        <KpiCard label="Need attention" value={needAttention} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-500"
          />
          <Input
            id="input-search-repositories"
            type="text"
            placeholder="Search repositories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Button
          id="btn-filter-attention"
          variant="outline"
          onClick={() => setOnlyAttention((v) => !v)}
        >
          <FilterIcon size={14} />
          <span>{onlyAttention ? `Showing attention (${needAttention})` : 'Filters'}</span>
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        rowId={(r) => `repo-row-${r.id}`}
        ariaLabel="Connected repositories"
      />
    </div>
  );
}
