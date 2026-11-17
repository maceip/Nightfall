import React, { useState } from 'react';
import { Code } from '@astryxdesign/core/Code';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Token } from '@astryxdesign/core/Token';
import {
  MANTIS_DEPTH_TIER_PRESETS,
  MANTIS_REFERENCE_PIPELINE_STAGES,
  MANTIS_UPSTREAM_REPO,
  type RepositoryRecord,
} from '@nightfall/core-contracts';
import {
  Badge,
  Button,
  Card,
  MantisClawIcon,
  SectionHeader,
} from '@nightfall/ui-kit';
import { MantisPipelineDrawer } from './mantis-pipeline-drawer.js';

export type MantisIntegrationCardProps = {
  repositories?: RepositoryRecord[];
  selectedRepo?: string;
};

const FUSED_SEAMS: ReadonlyArray<{
  id: string;
  stageNode: string;
  title: string;
  verdictToken: string;
  tokenColor: 'blue' | 'purple' | 'green' | 'orange';
  detail: string;
}> = [
  {
    id: 'seam-sast-seed',
    stageNode: 'planner',
    title: 'SAST & Scorecard JSONL Seed',
    verdictToken: 'sast_findings.jsonl',
    tokenColor: 'blue',
    detail:
      'Feeds Nightfall RepositoryScanner & Scorecard findings directly into the Mantis planner hypothesis graph.',
  },
  {
    id: 'seam-red-team',
    stageNode: 'reproducer / chainer',
    title: 'Tier 1–3 PoC → Tier 4 Live Red Team',
    verdictToken: 'Tier 4 Handoff',
    tokenColor: 'purple',
    detail:
      'Promotes sandboxed PoC traces and multi-step exploit chains into Ed25519 scope-signed Nightfall Red Team replay.',
  },
  {
    id: 'seam-patcher',
    stageNode: 'patcher',
    title: 'Shadow-Worktree Patch → Defense Factory',
    verdictToken: 'VERIFIED_SECURE',
    tokenColor: 'green',
    detail:
      'Routes VERIFIED_SECURE shadow-worktree patches into the Nightfall Defense Factory Fix review queue.',
  },
  {
    id: 'seam-mcp-gate',
    stageNode: 'reviewer',
    title: 'Pre-Merge MCP Change Gate',
    verdictToken: 'PASS | REVIEW | BLOCK',
    tokenColor: 'orange',
    detail:
      'Exposes mantis_check_change verdicts across pull-request diffs and CI pre-merge policy gates.',
  },
];

export function MantisIntegrationCard({
  repositories,
  selectedRepo,
}: MantisIntegrationCardProps): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <Card id="card-mantis-integration" className="space-y-4 border-hairline bg-canvas p-5">
        <SectionHeader
          title={
            <HStack gap={2} align="center" wrap="wrap">
              <MantisClawIcon size={17} className="text-accent-violet" />
              <span>Mantis Autonomous Vulnerability Pipeline</span>
              <Badge variant="preview">Preview · Integration Pipeline</Badge>
            </HStack>
          }
          subtitle={
            <span>
              Fused{' '}
              <span className="font-mono">{MANTIS_REFERENCE_PIPELINE_STAGES.length}</span>-stage
              multi-agent graph bridge (<Code size="inherit">{MANTIS_UPSTREAM_REPO}</Code>) across{' '}
              {MANTIS_DEPTH_TIER_PRESETS.length} depth tiers (15..100).
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
          {FUSED_SEAMS.map((seam) => (
            <div
              key={seam.id}
              className="space-y-1.5 rounded-xl border border-hairline bg-sidebar p-3.5"
            >
              <HStack justify="between" align="center" wrap="wrap" gap={1.5}>
                <HStack gap={1.5} align="center">
                  <StatusDot variant="accent" label={seam.title} />
                  <span className="text-[13px] font-semibold text-ink">{seam.title}</span>
                </HStack>
                <Token label={seam.verdictToken} size="sm" color={seam.tokenColor} />
              </HStack>
              <div className="text-[11.5px] text-ink-muted">
                Stage node: <Code size="inherit">{seam.stageNode}</Code>
              </div>
              <p className="m-0 text-xs leading-relaxed text-ink-secondary">{seam.detail}</p>
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
