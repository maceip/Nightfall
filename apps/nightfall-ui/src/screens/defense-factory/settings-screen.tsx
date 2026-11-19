import React from 'react';
import { Code } from '@astryxdesign/core/Code';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import type {
  MantisToolchainStatus,
  ModelDescriptor,
  RepositoryRecord,
  SandboxToolchainStatus,
  ScorecardToolchainStatus,
} from '@nightfall/core-contracts';
import {
  AstryxSegmentedControl,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  SectionHeader,
  SegmentedControlItem,
  ShieldCheckIcon,
  StatusBadge,
} from '@nightfall/ui-kit';
import { MantisIntegrationCard } from './mantis-integration-card.js';
import { isPagesStaticBuild } from '../../api/pages-static-store.js';

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
  themeMode?: 'light' | 'dark';
  onChangeThemeMode?: (next: 'light' | 'dark') => void;
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
  themeMode = 'light',
  onChangeThemeMode,
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
      cell: (m) => <span className="font-mono text-xs text-ink-secondary">{m.provider}</span>,
    },
    {
      key: 'tier',
      header: 'Routing Tier',
      cell: (m) => <span className="text-xs text-ink-secondary">{m.tier}</span>,
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
              {!connectedLiveApi ? (
                <StatusBadge
                  status="verifying"
                  label={isPagesStaticBuild() ? 'Static Web Snapshot' : 'Reconnecting…'}
                />
              ) : (
                <span className="text-xs text-ink-muted">Live API + SSE</span>
              )}
            </HStack>
            <p className="m-0 text-xs text-ink-secondary text-pretty">
              {killSwitchEngaged
                ? 'Emergency kill-switch engaged — active Red Team probes and sandbox executions are halted.'
                : !connectedLiveApi && isPagesStaticBuild()
                  ? 'Browser localStorage workspace seeded from SHA-256 verified build capture. Start pnpm dev:api on :4000 or install Nightfall Desktop for live scans.'
                  : 'Real-time orchestrator stream active with L7 egress scope enforcement.'}
            </p>
          </div>
          <HStack gap={2} align="center" wrap="wrap">
            {onChangeThemeMode ? (
              <AstryxSegmentedControl
                size="sm"
                label="Color mode"
                value={themeMode}
                onChange={(v) => onChangeThemeMode(v as 'dark' | 'light')}
              >
                <SegmentedControlItem value="light" label="Light" />
                <SegmentedControlItem value="dark" label="Dark" />
              </AstryxSegmentedControl>
            ) : null}
            {killSwitchEngaged ? (
              <StatusBadge status="critical" label="Kill-Switch Halted" />
            ) : null}
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
            liteboxAvailable ? (
              <span className="text-xs font-medium text-ink-muted">LiteBox Binaries Ready ✓</span>
            ) : (
              <StatusBadge status="in_progress" label="Process-Confined Fallback" />
            )
          }
        />

        <div className="grid grid-cols-1 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <ToolchainSpec label="North shim" value={northShim} mono />
          <ToolchainSpec label="South platform" value={southPlatform} mono />
          <ToolchainSpec label="Pinned commit" value={pinnedCommit.slice(0, 12)} mono />
          <ToolchainSpec label="Upstream repository" value={upstreamRepo} mono />
        </div>

        {sandboxToolchain ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3 text-xs text-ink-secondary">
            <span className="truncate">
              Runner: <span className="font-mono text-ink">{sandboxToolchain.runnerBinaryPath ?? 'not-compiled'}</span>
            </span>
            <span className="truncate">
              Syscall rewriter:{' '}
              <span className="font-mono text-ink">
                {sandboxToolchain.syscallRewriterBinaryPath ?? 'not-compiled'}
              </span>
            </span>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4 border-hairline bg-canvas p-5">
        <SectionHeader
          title="Nightfall Scorecard Supply-Chain Engine"
          subtitle="Vendored & fused OSSF Scorecard Go daemon evaluating CI workflow injection, token permissions, and supply-chain checks"
          actions={
            scAvailable ? (
              <span className="text-xs font-medium text-ink-muted">Scorecard {scMode} Ready ✓</span>
            ) : (
              <StatusBadge status="verifying" label="Scorecard Binary Not Built" />
            )
          }
        />
        <div className="grid grid-cols-1 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <ToolchainSpec label="Service mode" value={scMode} mono />
          <ToolchainSpec label="Vendored tree" value={scorecardToolchain?.vendoredPath ?? 'vendor/scorecard'} mono />
          <ToolchainSpec
            label="Pinned commit"
            value={(scorecardToolchain?.pinnedCommit ?? '6eb56f6a7e62').slice(0, 12)}
            mono
          />
          <ToolchainSpec
            label="Upstream repository"
            value={scorecardToolchain?.upstreamRepo ?? 'https://github.com/ossf/scorecard'}
            mono
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-canvas md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="space-y-1.5 p-5">
          <HStack justify="between" align="center">
            <HStack gap={1.5} align="center">
              <StatusDot variant="success" label="SQLite ledger active" />
              <span className="text-[14px] font-semibold text-ink">
                SQLite Persistence &amp; Audit Ledger
              </span>
            </HStack>
            <span className="font-mono text-xs text-ink-muted">{auditEntryCount} entries</span>
          </HStack>
          <p className="m-0 text-[13px] text-ink-secondary text-pretty">
            Append-only SHA-256 hash-chained ledger and shared campaign memory persisted in SQLite.
          </p>
        </div>

        <div className="space-y-1.5 p-5">
          <HStack justify="between" align="center">
            <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
              <ShieldCheckIcon size={16} className="text-ink-secondary" />
              <span>L7 Egress Policy Proxy</span>
            </span>
            {killSwitchEngaged ? (
              <StatusBadge status="critical" label="Kill-Switch Halted" />
            ) : (
              <span className="text-xs text-ink-muted">Enforcing v5 scope</span>
            )}
          </HStack>
          <p className="m-0 text-[13px] text-ink-secondary text-pretty">
            Cryptographically Ed25519-signed <Code size="inherit">campaign.yaml</Code> manifests
            enforce strict HTTP method/path allowlists, WebSocket origins, and token-bucket RPS caps.
          </p>
        </div>
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
    <div className="p-3.5">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className={`mt-1 truncate text-xs text-ink ${mono ? 'font-mono' : 'font-medium'}`}>
        {value}
      </div>
    </div>
  );
}
