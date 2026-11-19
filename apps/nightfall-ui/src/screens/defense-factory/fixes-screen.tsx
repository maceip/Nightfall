import React from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import type { FixProposal } from '@nightfall/core-contracts';
import {
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
          <div className="font-semibold text-ink">{fix.title}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <span>{fix.subtitle}</span>
            {fix.branchName ? (
              <span className="inline-flex items-center gap-1 font-mono text-[11.5px] text-ink-secondary">
                <span>·</span>
                <GitBranchIcon size={12} />
                <span>{fix.branchName}</span>
              </span>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'repository',
      header: 'Repository',
      className: 'w-64',
      cell: (fix) => (
        <div className="space-y-0.5">
          <div className="font-mono text-[13px] font-medium text-ink">{fix.repository}</div>
          <div className="text-xs text-ink-muted">
            {fix.snapshotLabel} · {formatSandboxLabel(fix.sandboxBackend)}
          </div>
        </div>
      ),
    },
    {
      key: 'findings',
      header: 'Findings',
      className: 'w-36',
      cell: (fix) => (
        <HStack gap={2} align="center">
          <span className="font-medium text-ink">{fix.findingIds.length}</span>
          <SeverityBadge severity={fix.severity} />
        </HStack>
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
      header: 'Action',
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
    <div id="view-fixes" className="relative space-y-4 tabular-nums">
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
          className="fixed right-6 bottom-5 z-30 flex max-w-sm items-start justify-between gap-3 rounded-2xl border border-hairline-strong bg-canvas p-4 text-[13px] font-medium text-ink shadow-lg"
        >
          <span className="leading-snug">
            {fixes.length} fix proposal{fixes.length === 1 ? '' : 's'} ready. Each finding has its
            own isolated patch.
          </span>
          <Button
            id="btn-dismiss-fixes-toast"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss fixes notification"
            onClick={onDismissToast}
          >
            <CloseIcon size={15} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
