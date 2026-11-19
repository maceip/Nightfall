import React, { useState } from 'react';
import { Code } from '@astryxdesign/core/Code';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
  CODENAV_PINNED_COMMIT,
  FNAUDIT_PINNED_COMMIT,
  MANTIS_DEPTH_TIER_PRESETS,
  MANTIS_REFERENCE_PIPELINE_STAGES,
  MANTIS_UPSTREAM_REPO,
  type MantisToolchainStatus,
  type RepositoryRecord,
} from '@nightfall/core-contracts';
import {
  Button,
  Card,
  MantisClawIcon,
  SectionHeader,
  StatusBadge,
} from '@nightfall/ui-kit';
import { MantisPipelineDrawer } from './mantis-pipeline-drawer.js';

export type MantisIntegrationCardProps = {
  mantisToolchain?: MantisToolchainStatus;
  repositories?: RepositoryRecord[];
  selectedRepo?: string;
};

type LiveCapabilityRow = {
  id: string;
  title: string;
  ready: boolean;
  readyLabel: string;
  missingLabel: string;
  anchorLabel: string;
  anchorValue: string;
  detail: string;
};

export function MantisIntegrationCard({
  mantisToolchain,
  repositories,
  selectedRepo,
}: MantisIntegrationCardProps): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mantisAvailable = mantisToolchain?.available ?? false;
  const fnauditReady = mantisToolchain?.fnauditAvailable ?? false;
  const codenavReady = mantisToolchain?.codenavAvailable ?? false;
  const evidenceGateReady = mantisToolchain?.evidenceGateEnabled ?? false;

  const fnauditCommit = (mantisToolchain?.fnauditPinnedCommit ?? FNAUDIT_PINNED_COMMIT).slice(0, 12);
  const codenavCommit = (mantisToolchain?.codenavPinnedCommit ?? CODENAV_PINNED_COMMIT).slice(0, 12);
  const codenavBinary = mantisToolchain?.codenavBinaryPath ?? 'not-compiled';
  const pythonExec = mantisToolchain?.pythonExecutable ?? 'not-detected';

  const capabilities: ReadonlyArray<LiveCapabilityRow> = [
    {
      id: 'cap-fnaudit-ledger',
      title: 'fnaudit Per-Symbol Intent Ledger',
      ready: fnauditReady,
      readyLabel: 'SQLite + FTS5 Ready',
      missingLabel: 'Module Missing',
      anchorLabel: 'Pinned Apache-2.0',
      anchorValue: fnauditCommit,
      detail:
        'Records body_sha-verified per-function intent vs. implementation audits and 800-token ranked module briefings across explorer and researcher.',
    },
    {
      id: 'cap-codenav-cpp',
      title: 'codenav C++20 Semantic Navigator',
      ready: codenavReady,
      readyLabel: 'Binary Ready',
      missingLabel: 'Not Compiled',
      anchorLabel: `Commit ${codenavCommit}`,
      anchorValue: codenavBinary,
      detail:
        'Executes read-only C/C++ callgraph, struct layout, and override queries over KDAB Woboq datasets, falling back to tree-sitter StructuralIndex.',
    },
    {
      id: 'cap-evidence-gate',
      title: 'Mechanical Evidence & Anti-Fabrication Gate',
      ready: evidenceGateReady,
      readyLabel: 'Enforcing Gate',
      missingLabel: 'Bridge Offline',
      anchorLabel: 'Bridge',
      anchorValue: 'nightfall_bridge.py',
      detail:
        'Rejects placeholder sanitizer PIDs and missing target-root file anchors while enforcing contested <= high, unconfirmed <= medium, and theoretical <= low ceilings.',
    },
    {
      id: 'cap-static-pin',
      title: 'Static-Only Bridge → LiteBox Proof Chain',
      ready: mantisAvailable,
      readyLabel: 'Static-Only Pinned',
      missingLabel: 'Runtime Missing',
      anchorLabel: 'Python Runtime',
      anchorValue: pythonExec,
      detail:
        'Pins Mantis subprocess execution to --sandbox static-only so dynamic exploit and patch proofs execute exclusively inside Nightfall LiteBox.',
    },
  ];

  return (
    <>
      <Card id="card-mantis-integration" className="space-y-4 border-hairline bg-canvas p-5">
        <SectionHeader
          title={
            <HStack gap={2} align="center" wrap="wrap">
              <MantisClawIcon size={17} className="text-accent-violet" />
              <span>Mantis Autonomous Vulnerability Pipeline</span>
              <StatusBadge
                status={mantisAvailable ? 'verified' : 'not_recorded'}
                label={mantisAvailable ? 'Mantis Engine Integrated ✓' : 'Mantis Engine Unavailable'}
              />
            </HStack>
          }
          subtitle={
            <span>
              Vendored <Code size="inherit">services/mantis-engine</Code> (
              <Code size="inherit">{mantisToolchain?.runtimeFlavor ?? 'mantis_runtime'}</Code> ·{' '}
              <Code size="inherit">{mantisToolchain?.sandboxMode ?? 'static-only'}</Code>) running{' '}
              <span className="font-mono">{MANTIS_REFERENCE_PIPELINE_STAGES.length}</span> stages across{' '}
              {MANTIS_DEPTH_TIER_PRESETS.length} depth tiers (<Code size="inherit">{MANTIS_UPSTREAM_REPO}</Code>).
            </span>
          }
          actions={
            <Button
              id="btn-open-mantis-pipeline-drawer"
              variant="outline"
              size="sm"
              onClick={() => setDrawerOpen(true)}
            >
              Inspect 20-Stage Pipeline &amp; Export Config
            </Button>
          }
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {capabilities.map((cap) => (
            <div
              key={cap.id}
              id={cap.id}
              className="space-y-1.5 rounded-xl border border-hairline bg-sidebar p-3.5"
            >
              <HStack justify="between" align="center" wrap="wrap" gap={1.5}>
                <HStack gap={1.5} align="center">
                  <StatusDot variant={cap.ready ? 'success' : 'warning'} label={cap.title} />
                  <span className="text-[13px] font-semibold text-ink">{cap.title}</span>
                </HStack>
                <StatusBadge
                  status={cap.ready ? 'proposed' : 'verifying'}
                  label={cap.ready ? cap.readyLabel : cap.missingLabel}
                />
              </HStack>
              <div className="truncate text-[11.5px] text-ink-muted">
                {cap.anchorLabel}: <Code size="inherit">{cap.anchorValue}</Code>
              </div>
              <p className="m-0 text-xs leading-relaxed text-ink-secondary">{cap.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      <MantisPipelineDrawer
        open={drawerOpen}
        repositories={repositories}
        selectedRepo={selectedRepo}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
