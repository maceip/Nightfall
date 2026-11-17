import React, { useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import type { RepositoryRecord } from '@nightfall/core-contracts';
import {
  Button,
  ConnectedKpiStrip,
  DataTable,
  type DataTableColumn,
  FilterIcon,
  Input,
  ScorecardScorePill,
  SearchIcon,
  StatusBadge,
} from '@nightfall/ui-kit';

export type RepositoriesScreenProps = {
  repositories: RepositoryRecord[];
  onToggleRepoScans: (repoId: string) => Promise<void>;
  onQuickScanRepo: (repoName: string) => Promise<void>;
  onOpenRepoScorecard?: (repoName: string) => void;
};

export function RepositoriesScreen({
  repositories,
  onToggleRepoScans,
  onQuickScanRepo,
  onOpenRepoScorecard,
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
          <div className="font-mono text-[13.5px] font-semibold text-ink">{repo.name}</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            <span className="font-mono">{repo.fullName}</span> · {repo.ownerTeam}
          </div>
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
      cell: (repo) => <span className="text-[13px] text-ink-secondary">{repo.lastCompletedScanLabel}</span>,
    },
    {
      key: 'scorecard',
      header: 'Scorecard',
      cell: (repo) => (
        <button
          id={`btn-repo-scorecard-${repo.name}`}
          type="button"
          onClick={() => onOpenRepoScorecard?.(repo.name)}
          className="cursor-pointer bg-transparent p-0"
          title={`Inspect Scorecard posture for ${repo.name}`}
        >
          <ScorecardScorePill score={repo.scorecardScore} />
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'w-44 text-right whitespace-nowrap',
      cell: (repo) => (
        <HStack gap={1.5} align="center" justify="end">
          <Button
            id={`btn-repo-toggle-pr-${repo.name}`}
            variant="outline"
            size="sm"
            onClick={() => void onToggleRepoScans(repo.id)}
          >
            Toggle PR
          </Button>
          <Button
            id={`btn-repo-scan-${repo.name}`}
            variant="outline"
            size="sm"
            onClick={() => void onQuickScanRepo(repo.name)}
          >
            Scan
          </Button>
        </HStack>
      ),
    },
  ];

  return (
    <VStack id="view-repositories" gap={4} className="tabular-nums">
      <ConnectedKpiStrip
        cells={[
          {
            key: 'pr',
            label: 'PR review coverage',
            value: prCovered,
            suffix: `/ ${repositories.length}`,
          },
          {
            key: 'auto',
            label: 'Automatic scans',
            value: schedCovered,
            suffix: `/ ${repositories.length}`,
          },
          {
            key: 'attn',
            label: 'Active fixes',
            value: needAttention,
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <Input
            id="input-search-repositories"
            type="text"
            placeholder="Search repositories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-full border-hairline-strong bg-canvas pl-9"
          />
        </div>

        <Button
          id="btn-filter-attention"
          variant={onlyAttention ? 'default' : 'outline'}
          onClick={() => setOnlyAttention((v) => !v)}
        >
          <FilterIcon size={14} />
          <span>Needs attention ({needAttention})</span>
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        rowId={(r) => `repo-row-${r.id}`}
        ariaLabel="Connected repositories"
      />
    </VStack>
  );
}
