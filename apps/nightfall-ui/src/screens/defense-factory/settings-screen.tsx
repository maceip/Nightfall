import React from 'react';
import { Code } from '@astryxdesign/core/Code';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Token } from '@astryxdesign/core/Token';
import type {
  MantisToolchainStatus,
  ModelDescriptor,
  RepositoryRecord,
  SandboxToolchainStatus,
  ScorecardToolchainStatus,
} from '@nightfall/core-contracts';
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
import { MantisIntegrationCard } from './mantis-integration-card.js';

export type SettingsScreenProps = {
  sandboxToolchain?: SandboxToolchainStatus;
  scorecardToolchain?: ScorecardToolchainStatus;
  mantisToolchain?: MantisToolchainStatus;
  models: ModelDescriptor[];
  auditEntryCount: number;
  killSwitchEngaged: boolean;
  connectedLiveApi?: boolean;
  onToggleKillSwitch?: () => void;
  repositories?: RepositoryRecord[];
  selectedRepo?: string;
  onOpenRedTeamComposer: () => void;
  onOpenAuditLedger: () => void;
};

export function SettingsScreen({
  sandboxToolchain,
  scorecardToolchain,
  mantisToolchain,
  models,
  auditEntryCount,
  killSwitchEngaged,
  connectedLiveApi = true,
  onToggleKillSwitch,
  repositories,
  selectedRepo,
  onOpenRedTeamComposer,
  onOpenAuditLedger,
}: SettingsScreenProps): React.ReactElement {
  const northShim = sandboxToolchain?.northShim ?? 'litebox_shim_linux';
  const southPlatform = sandboxToolchain?.southPlatform ?? 'linux_userland';
  const upstreamRepo = sandboxToolchain?.upstreamRepo ?? 'https://github.com/microsoft/litebox';
  const pinnedCommit = sandboxToolchain?.pinnedCommit ?? 'verified-pinned-tree';
  const liteboxAvailable = sandboxToolchain?.available ?? false;
  const scAvailable = scorecardToolchain?.available ?? false;
  const scMode = scorecardToolchain?.serviceMode ?? 'unavailable';

  const modelColumns: DataTableColumn<ModelDescriptor>[] = [
    {
      key: 'id',
      header: 'Model ID',
      cell: (m) => <Code size="inherit">{m.id}</Code>,
    },
    {
      key: 'label',
      header: 'Display Label',
      cell: (m) => <span className="font-medium text-ink">{m.label}</span>,
    },
    {
      key: 'provider',
      header: 'Provider',
      cell: (m) => <Token label={m.provider} size="sm" color="gray" />,
    },
    {
      key: 'tier',
      header: 'Routing Tier',
      cell: (m) => <StatusBadge status="proposed" label={m.tier} />,
    },
  ];

  return (
    <div id="view-settings" className="space-y-5 tabular-nums">
      <Card className="border-hairline bg-canvas p-4">
        <HStack justify="between" align="center" wrap="wrap" gap={3}>
          <div className="space-y-0.5">
            <HStack gap={2} align="center" wrap="wrap">
              <StatusDot
                variant={killSwitchEngaged ? 'error' : connectedLiveApi ? 'success' : 'warning'}
                label={connectedLiveApi ? 'Live API + SSE connected' : 'API reconnecting'}
                isPulsing={connectedLiveApi && !killSwitchEngaged}
              />
              <span className="text-[14px] font-semibold text-ink">
                Runtime Connectivity &amp; Emergency Sandbox Control
              </span>
              <Badge variant={connectedLiveApi ? 'enabled' : 'verifying'}>Live API + SSE</Badge>
            </HStack>
            <p className="m-0 text-xs text-ink-secondary">
              {killSwitchEngaged
                ? 'Emergency kill-switch engaged — active Red Team probes and sandbox executions are halted.'
                : 'Real-time orchestrator stream active with L7 egress scope enforcement.'}
            </p>
          </div>
          <HStack gap={2} align="center">
            <StatusBadge
              status={killSwitchEngaged ? 'critical' : 'enabled'}
              label={killSwitchEngaged ? 'Kill-Switch Halted' : 'Sandboxes Active'}
            />
            <Button
              id="btn-emergency-kill-switch"
              variant="destructive"
              size="sm"
              disabled={!onToggleKillSwitch}
              data-engaged={killSwitchEngaged ? 'true' : 'false'}
              onClick={() => onToggleKillSwitch?.()}
            >
              {killSwitchEngaged ? 'Resume' : 'Halt Sandboxes'}
            </Button>
          </HStack>
        </HStack>
      </Card>

      <MantisIntegrationCard
        mantisToolchain={mantisToolchain}
        repositories={repositories}
        selectedRepo={selectedRepo}
      />

      <Card className="space-y-4 border-hairline bg-canvas p-5">
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
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-hairline bg-sidebar p-3 text-xs text-ink-secondary md:grid-cols-2">
            <div className="truncate">
              Runner: <span className="font-mono text-ink">{sandboxToolchain.runnerBinaryPath ?? 'not-compiled'}</span>
            </div>
            <div className="truncate">
              Syscall Rewriter:{' '}
              <span className="font-mono text-ink">
                {sandboxToolchain.syscallRewriterBinaryPath ?? 'not-compiled'}
              </span>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4 border-hairline bg-canvas p-5">
        <SectionHeader
          title="Nightfall Scorecard Supply-Chain Engine"
          subtitle="Vendored & fused OSSF Scorecard Go daemon evaluating CI workflow injection, token permissions, and supply-chain checks"
          actions={
            <StatusBadge
              status={scAvailable ? 'verified' : 'not_recorded'}
              label={scAvailable ? `Scorecard ${scMode} Ready ✓` : 'Scorecard Binary Not Built'}
            />
          }
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ToolchainSpec label="Service Mode" value={scMode} mono />
          <ToolchainSpec label="Vendored Tree" value={scorecardToolchain?.vendoredPath ?? 'vendor/scorecard'} mono />
          <ToolchainSpec
            label="Pinned Commit"
            value={(scorecardToolchain?.pinnedCommit ?? '6eb56f6a7e62').slice(0, 12)}
            mono
          />
          <ToolchainSpec
            label="Upstream Repository"
            value={scorecardToolchain?.upstreamRepo ?? 'https://github.com/ossf/scorecard'}
            mono
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="space-y-2 border-hairline bg-canvas p-5">
          <HStack justify="between" align="center">
            <span className="text-[14px] font-semibold text-ink">
              SQLite Persistence &amp; Audit Ledger
            </span>
            <StatusBadge status="verified" label="WAL Durable ✓" />
          </HStack>
          <p className="m-0 text-[13px] text-ink-secondary">
            Append-only SHA-256 hash-chained ledger and shared campaign memory backed by durable
            SQLite state ({auditEntryCount} verified audit entries).
          </p>
        </Card>

        <Card className="space-y-2 border-hairline bg-canvas p-5">
          <HStack justify="between" align="center">
            <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
              <ShieldCheckIcon size={16} className="text-status-mint-ink" />
              <span>L7 Egress Policy Proxy</span>
            </span>
            <StatusBadge
              status={killSwitchEngaged ? 'critical' : 'enabled'}
              label={killSwitchEngaged ? 'Kill-Switch Halted' : 'Enforcing v5 Scope'}
            />
          </HStack>
          <p className="m-0 text-[13px] text-ink-secondary">
            Cryptographically Ed25519-signed <Code size="inherit">campaign.yaml</Code> manifests
            enforce strict HTTP method/path allowlists, WebSocket origins, and token-bucket RPS caps.
          </p>
        </Card>
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="ModelGateway Active Routing Table"
          actions={
            <HStack gap={2} align="center" wrap="wrap">
              <Button variant="outline" size="sm" onClick={onOpenRedTeamComposer}>
                Configure Red Team Campaign
              </Button>
              <Button variant="outline" size="sm" onClick={onOpenAuditLedger}>
                Inspect Hash-Chained Audit Ledger
              </Button>
            </HStack>
          }
        />
        <div className="overflow-hidden rounded-2xl border border-hairline bg-canvas">
          <DataTable
            columns={modelColumns}
            rows={models}
            rowKey={(m) => m.id}
            ariaLabel="Active ModelGateway models"
          />
        </div>
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
    <div className="rounded-xl border border-hairline bg-sidebar p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={`mt-1 truncate text-xs text-ink ${mono ? 'font-mono' : 'font-medium'}`}>
        {value}
      </div>
    </div>
  );
}
