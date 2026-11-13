import React from 'react';
import type { ModelDescriptor, SandboxToolchainStatus } from '@nightfall/core-contracts';
import {
  Badge,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  SectionHeader,
  ShieldCheckIcon,
  StatusBadge,
} from '@nightfall/ui-kit';

export type SettingsScreenProps = {
  sandboxToolchain?: SandboxToolchainStatus;
  models: ModelDescriptor[];
  auditEntryCount: number;
  killSwitchEngaged: boolean;
  onOpenRedTeamComposer: () => void;
  onOpenAuditLedger: () => void;
};

export function SettingsScreen({
  sandboxToolchain,
  models,
  auditEntryCount,
  killSwitchEngaged,
  onOpenRedTeamComposer,
  onOpenAuditLedger,
}: SettingsScreenProps): React.ReactElement {
  const northShim = sandboxToolchain?.northShim ?? 'litebox_shim_linux';
  const southPlatform = sandboxToolchain?.southPlatform ?? 'linux_userland';
  const upstreamRepo = sandboxToolchain?.upstreamRepo ?? 'https://github.com/microsoft/litebox';
  const pinnedCommit = sandboxToolchain?.pinnedCommit ?? 'verified-pinned-tree';
  const liteboxAvailable = sandboxToolchain?.available ?? false;

  const modelColumns: DataTableColumn<ModelDescriptor>[] = [
    {
      key: 'id',
      header: 'Model ID',
      cell: (m) => <span className="inline-code">{m.id}</span>,
    },
    {
      key: 'label',
      header: 'Display Label',
      cell: (m) => <span className="font-medium text-ink">{m.label}</span>,
    },
    {
      key: 'provider',
      header: 'Provider',
      cell: (m) => <Badge variant="informational">{m.provider}</Badge>,
    },
    {
      key: 'tier',
      header: 'Routing Tier',
      cell: (m) => <StatusBadge status="proposed" label={m.tier} />,
    },
  ];

  return (
    <div id="view-settings" className="space-y-6 tabular-nums">
      <Card className="space-y-4 p-5">
        <SectionHeader
          title="Microsoft LiteBox Library OS Sandbox"
          subtitle="Reduced-TCB user-mode library OS isolation for Red Team probes & Defense Factory patch verification"
          actions={
            <StatusBadge
              status={liteboxAvailable ? 'verified' : 'in_progress'}
              label={liteboxAvailable ? 'LiteBox Binaries Ready ✓' : 'Process-Confined Fallback'}
            />
          }
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ToolchainSpec label="North Shim" value={northShim} mono />
          <ToolchainSpec label="South Platform" value={southPlatform} mono />
          <ToolchainSpec label="Pinned Commit" value={pinnedCommit.slice(0, 12)} mono />
          <ToolchainSpec label="Upstream Repository" value={upstreamRepo} mono />
        </div>

        {sandboxToolchain ? (
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-primary-200 bg-primary-50 p-3 text-xs text-primary-700 md:grid-cols-2">
            <div>
              Runner:{' '}
              <span className="font-mono">
                {sandboxToolchain.runnerBinaryPath ?? 'not-compiled'}
              </span>
            </div>
            <div>
              Syscall Rewriter:{' '}
              <span className="font-mono">
                {sandboxToolchain.syscallRewriterBinaryPath ?? 'not-compiled'}
              </span>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="space-y-2.5 p-5">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold text-ink">
              SQLite Persistence &amp; Audit Ledger
            </span>
            <StatusBadge status="verified" label="WAL Durable ✓" />
          </div>
          <p className="m-0 text-[13px] text-primary-700">
            Append-only SHA-256 hash-chained ledger and shared campaign memory backed by durable
            SQLite state ({auditEntryCount} verified audit entries).
          </p>
        </Card>

        <Card className="space-y-2.5 p-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
              <ShieldCheckIcon size={16} className="text-emerald-700" />
              <span>L7 Egress Policy Proxy</span>
            </span>
            <StatusBadge
              status={killSwitchEngaged ? 'critical' : 'enabled'}
              label={killSwitchEngaged ? 'Kill-Switch Halted' : 'Enforcing v5 Scope'}
            />
          </div>
          <p className="m-0 text-[13px] text-primary-700">
            Cryptographically Ed25519-signed <span className="inline-code">campaign.yaml</span>{' '}
            manifests enforce strict HTTP method/path allowlists, WebSocket origins, and token-bucket
            RPS caps.
          </p>
        </Card>
      </div>

      <section>
        <SectionHeader
          title="ModelGateway Active Routing Table"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onOpenRedTeamComposer}>
                Configure Red Team Campaign
              </Button>
              <Button variant="outline" size="sm" onClick={onOpenAuditLedger}>
                Inspect Hash-Chained Audit Ledger
              </Button>
            </div>
          }
        />
        <DataTable
          columns={modelColumns}
          rows={models}
          rowKey={(m) => m.id}
          ariaLabel="Active ModelGateway models"
        />
      </section>
    </div>
  );
}

function ToolchainSpec({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50/60 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-primary-500">
        {label}
      </div>
      <div className={`mt-1 truncate text-xs text-ink ${mono ? 'font-mono' : 'font-medium'}`}>
        {value}
      </div>
    </div>
  );
}
