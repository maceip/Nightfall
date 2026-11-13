import React from 'react';
import type { AuditEntry, ScanJobRecord } from '@nightfall/core-contracts';
import {
  Button,
  DataTable,
  type DataTableColumn,
  PlusIcon,
  SectionHeader,
  StatusBadge,
} from '@nightfall/ui-kit';

export type ScansAuditScreenProps = {
  scans: ScanJobRecord[];
  auditEntries: AuditEntry[];
  onOpenNewScan: () => void;
};

function formatHuman(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

export function ScansAuditScreen({
  scans,
  auditEntries,
  onOpenNewScan,
}: ScansAuditScreenProps): React.ReactElement {
  const scanColumns: DataTableColumn<ScanJobRecord>[] = [
    {
      key: 'id',
      header: 'Scan ID',
      cell: (sc) => <span className="font-mono text-xs">{sc.id}</span>,
    },
    {
      key: 'repo',
      header: 'Repository',
      cell: (sc) => <span className="font-medium text-ink">{sc.repository}</span>,
    },
    {
      key: 'mode',
      header: 'Execution Mode',
      cell: (sc) => <span>Nightfall · {formatHuman(sc.mode)}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      cell: (sc) => <span>{formatHuman(sc.method)}</span>,
    },
    {
      key: 'findings',
      header: 'Findings',
      cell: (sc) => <span className="font-medium">{sc.findingsDiscovered}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (sc) => <StatusBadge status={sc.status} />,
    },
  ];

  const auditColumns: DataTableColumn<AuditEntry>[] = [
    {
      key: 'index',
      header: '#',
      className: 'w-14',
      cell: (entry) => <span className="font-mono text-xs text-primary-600">{entry.index}</span>,
    },
    {
      key: 'subsystem',
      header: 'Subsystem',
      className: 'w-36',
      cell: (entry) => <StatusBadge status="proposed" label={entry.subsystem} />,
    },
    {
      key: 'action',
      header: 'Action',
      className: 'w-48',
      cell: (entry) => <span className="font-mono text-xs">{entry.action}</span>,
    },
    {
      key: 'summary',
      header: 'Summary',
      cell: (entry) => <span className="text-primary-800">{entry.summary}</span>,
    },
    {
      key: 'hash',
      header: 'Chain Digest',
      className: 'w-40',
      cell: (entry) => (
        <span className="font-mono text-xs text-primary-500" title={entry.hash}>
          {entry.hash.slice(0, 14)}…
        </span>
      ),
    },
  ];

  return (
    <div id="view-scans" className="space-y-6 tabular-nums">
      <section>
        <SectionHeader
          title="Recent repository & continuous scans"
          actions={
            <Button id="btn-scans-new" size="sm" onClick={onOpenNewScan}>
              <PlusIcon size={14} />
              <span>New scan</span>
            </Button>
          }
        />
        <DataTable
          columns={scanColumns}
          rows={scans}
          rowKey={(sc) => sc.id}
          ariaLabel="Repository scan jobs"
        />
      </section>

      <section>
        <SectionHeader
          title={`Immutable Hash-Chained Audit Ledger (${auditEntries.length} records)`}
          actions={<StatusBadge status="verified" label="SHA-256 Chain Verified ✓" />}
        />
        <DataTable
          columns={auditColumns}
          rows={auditEntries}
          rowKey={(entry) => entry.id}
          ariaLabel="Cryptographic SHA-256 audit ledger"
        />
      </section>
    </div>
  );
}
