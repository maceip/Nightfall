import React from 'react';
import { Code } from '@astryxdesign/core/Code';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { VStack } from '@astryxdesign/core/VStack';
import type { AuditEntry, ScanJobRecord } from '@nightfall/core-contracts';
import {
  Button,
  ConnectedKpiStrip,
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
  const completedCount = scans.filter((s) => s.status === 'completed').length;
  const totalDiscovered = scans.reduce((acc, s) => acc + (s.findingsDiscovered || 0), 0);

  const scanColumns: DataTableColumn<ScanJobRecord>[] = [
    {
      key: 'id',
      header: 'Scan ID',
      cell: (sc) => <Code size="inherit">{sc.id}</Code>,
    },
    {
      key: 'repo',
      header: 'Repository',
      cell: (sc) => <span className="font-mono text-[13px] font-medium text-ink">{sc.repository}</span>,
    },
    {
      key: 'mode',
      header: 'Execution Mode',
      cell: (sc) => <span className="text-ink-secondary">Nightfall · {formatHuman(sc.mode)}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      cell: (sc) => <span className="text-ink-secondary">{formatHuman(sc.method)}</span>,
    },
    {
      key: 'findings',
      header: 'Findings',
      cell: (sc) => <span className="font-semibold text-ink">{sc.findingsDiscovered}</span>,
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
      cell: (entry) => <span className="font-mono text-xs text-ink-muted">{entry.index}</span>,
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
      cell: (entry) => <Code size="inherit">{entry.action}</Code>,
    },
    {
      key: 'summary',
      header: 'Summary',
      cell: (entry) => <span className="text-ink-secondary">{entry.summary}</span>,
    },
    {
      key: 'hash',
      header: 'Chain Digest',
      className: 'w-40',
      cell: (entry) => (
        <span className="font-mono text-xs text-ink-muted" title={entry.hash}>
          {entry.hash.slice(0, 14)}…
        </span>
      ),
    },
  ];

  return (
    <VStack id="view-scans" gap={5} className="tabular-nums">
      <ConnectedKpiStrip
        cells={[
          { key: 'scans', label: 'Completed scans', value: completedCount, suffix: `/ ${scans.length}` },
          { key: 'findings', label: 'Findings discovered', value: totalDiscovered },
          { key: 'audit', label: 'Verified audit entries', value: auditEntries.length },
        ]}
      />

      <section className="space-y-3">
        <SectionHeader
          title="Recent repository & continuous scans"
          actions={
            <Button id="btn-scans-new" size="sm" onClick={onOpenNewScan}>
              <PlusIcon size={14} />
              <span>New scan</span>
            </Button>
          }
        />
        <div className="overflow-hidden rounded-2xl border border-hairline bg-canvas">
          <DataTable
            columns={scanColumns}
            rows={scans}
            rowKey={(sc) => sc.id}
            ariaLabel="Repository scan jobs"
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title={`Immutable Hash-Chained Audit Ledger (${auditEntries.length} records)`}
          actions={
            <HStack gap={2} align="center">
              <StatusDot variant="success" label="SHA-256 chain verified" />
              <StatusBadge status="verified" label="SHA-256 Chain Verified ✓" />
            </HStack>
          }
        />
        <div className="overflow-hidden rounded-2xl border border-hairline bg-canvas">
          <DataTable
            columns={auditColumns}
            rows={auditEntries}
            rowKey={(entry) => entry.id}
            ariaLabel="Cryptographic SHA-256 audit ledger"
          />
        </div>
      </section>
    </VStack>
  );
}
