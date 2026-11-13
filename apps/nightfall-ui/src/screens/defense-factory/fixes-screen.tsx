import React from 'react';
import type { FixProposal } from '@nightfall/core-contracts';
import {
  Badge,
  Button,
  CloseIcon,
  DataTable,
  type DataTableColumn,
  GitBranchIcon,
  SeverityBadge,
  StatusBadge,
} from '@nightfall/ui-kit';

export type FixesScreenProps = {
  fixes: FixProposal[];
  showToast: boolean;
  onDismissToast: () => void;
  onSelectFix: (fix: FixProposal) => void;
};

function formatSandboxLabel(backend?: FixProposal['sandboxBackend']): string {
  if (backend === 'process-confined') return 'Process Confined';
  return 'Microsoft LiteBox';
}

export function FixesScreen({
  fixes,
  showToast,
  onDismissToast,
  onSelectFix,
}: FixesScreenProps): React.ReactElement {
  const columns: DataTableColumn<FixProposal>[] = [
    {
      key: 'fix',
      header: 'Fix',
      cell: (fix) => (
        <div className="space-y-1">
          <div className="font-medium text-ink">{fix.title}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-primary-500">
            <span>{fix.subtitle}</span>
            {fix.branchName ? (
              <span className="inline-code inline-flex items-center gap-1 text-[11px]">
                <GitBranchIcon size={12} />
                <span>{fix.branchName}</span>
                {fix.commitSha ? <span>@{fix.commitSha.slice(0, 7)}</span> : null}
              </span>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'repository',
      header: 'Repository & Sandbox',
      className: 'w-64',
      cell: (fix) => (
        <div className="space-y-1">
          <div className="font-medium text-ink">{fix.repository}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-primary-500">
            <span>{fix.snapshotLabel}</span>
            <Badge variant="accent">{formatSandboxLabel(fix.sandboxBackend)}</Badge>
          </div>
        </div>
      ),
    },
    {
      key: 'findings',
      header: 'Findings',
      className: 'w-36',
      cell: (fix) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-ink">{fix.findingIds.length}</span>
          <SeverityBadge severity={fix.severity} />
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-32',
      cell: (fix) => <StatusBadge status={fix.status} />,
    },
    {
      key: 'action',
      header: '',
      className: 'w-36 text-right',
      cell: (fix) => (
        <Button
          id={`btn-fix-action-${fix.id}`}
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onSelectFix(fix);
          }}
        >
          {fix.status === 'in_progress' ? 'View progress' : 'Review'}
        </Button>
      ),
    },
  ];

  return (
    <div id="view-fixes" className="space-y-4 tabular-nums">
      <DataTable
        columns={columns}
        rows={fixes}
        rowKey={(fx) => fx.id}
        rowId={(fx) => `fix-row-${fx.id}`}
        onRowClick={onSelectFix}
        ariaLabel="Defense Factory proposed fixes"
      />

      {showToast && fixes.length > 0 ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-950 px-4 py-2.5 text-xs font-medium text-surface shadow-md"
        >
          <span>
            {fixes.length} verified fix proposal{fixes.length === 1 ? '' : 's'} active in Nightfall
            Defense Factory. Each finding maps to an isolated Git patch.
          </span>
          <Button
            id="btn-dismiss-fixes-toast"
            variant="ghost"
            size="icon-sm"
            className="text-surface hover:bg-primary-800 hover:text-surface"
            onClick={onDismissToast}
          >
            <CloseIcon size={15} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
