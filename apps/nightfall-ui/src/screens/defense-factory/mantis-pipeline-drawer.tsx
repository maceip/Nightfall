import React, { useMemo, useState } from 'react';
import { Code } from '@astryxdesign/core/Code';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import {
  buildMantisCliCommand,
  buildMantisWorkflowLocalJson,
  MANTIS_DEPTH_TIER_PRESETS,
  MANTIS_REFERENCE_PIPELINE_STAGES,
  MANTIS_UPSTREAM_REPO,
  type MantisDepthTier,
  type MantisScanMode,
  type MantisStageDescriptor,
  type RepositoryRecord,
} from '@nightfall/core-contracts';
import {
  Badge,
  Button,
  CloseIcon,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  DialogClose,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DownloadIcon,
  DrawerContent,
  MantisClawIcon,
  SegmentedControl,
  TerminalIcon,
} from '@nightfall/ui-kit';

export type MantisPipelineDrawerProps = {
  open: boolean;
  repositories?: RepositoryRecord[];
  selectedRepo?: string;
  onClose: () => void;
};

const PHASE_ORDER: Array<{ key: MantisStageDescriptor['phase']; label: string }> = [
  { key: 'recon-stem', label: '1 · Recon & Shared Stem' },
  { key: 'discovery', label: '2 · Hypothesis Discovery' },
  { key: 'verification', label: '3 · Adversarial Verification & Gates' },
  { key: 'remediation-handoff', label: '4 · Exploit Chaining & Patch Handoff' },
  { key: 'calibration-report', label: '5 · Calibration & Institutional Memory' },
];

const SEAM_LABELS: Record<MantisStageDescriptor['nightfallSeam'], string | null> = {
  none: null,
  'sast-seed-jsonl': 'SAST JSONL Seed',
  'red-team-tier4-handoff': 'Red Team Tier 4 Handoff',
  'defense-factory-verified-patch': 'Defense Factory Patch Queue',
  'mcp-check-change-gate': 'MCP mantis_check_change',
};

export function MantisPipelineDrawer({
  open,
  repositories = [],
  selectedRepo = 'all',
  onClose,
}: MantisPipelineDrawerProps): React.ReactElement | null {
  const defaultRepo =
    selectedRepo !== 'all' ? selectedRepo : (repositories[0]?.name ?? 'northstar-docs');

  const [repoName, setRepoName] = useState<string>(defaultRepo);
  const [tier, setTier] = useState<MantisDepthTier>('tier-3-deep');
  const [scanMode, setScanMode] = useState<MantisScanMode>('shadow-worktree-patch');
  const [seedSastJsonl, setSeedSastJsonl] = useState<boolean>(true);
  const [copiedCli, setCopiedCli] = useState<boolean>(false);

  const repoRecord = repositories.find((r) => r.name === repoName);
  const localPath = repoRecord?.localPath ?? `/workspace/${repoName}`;
  const activePreset =
    MANTIS_DEPTH_TIER_PRESETS.find((p) => p.tier === tier) ?? MANTIS_DEPTH_TIER_PRESETS[2]!;

  const exportOptions = useMemo(
    () => ({
      repository: repoName,
      localPath,
      tier,
      scanMode,
      defaultModel: 'vertex_ai/gemini-3.8-flash',
      seedSastJsonl,
    }),
    [repoName, localPath, tier, scanMode, seedSastJsonl],
  );

  const cliCommand = useMemo(() => buildMantisCliCommand(exportOptions), [exportOptions]);
  const workflowJson = useMemo(() => buildMantisWorkflowLocalJson(exportOptions), [exportOptions]);

  if (!open) return null;

  async function handleCopyCli(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(cliCommand);
    }
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 1800);
  }

  function handleDownloadConfig(): void {
    if (typeof document === 'undefined') return;
    const blob = new Blob([workflowJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'workflow.local.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const repoChoices = repositories.length > 0 ? repositories.map((r) => r.name) : [repoName];

  return (
    <DialogRoot open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DrawerContent
        floating
        className="w-[min(640px,calc(100vw-24px))]"
        aria-label="Mantis 20-Stage Pipeline Inspector"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline bg-canvas px-5 py-4">
          <div className="space-y-1">
            <HStack gap={2} align="center" wrap="wrap">
              <MantisClawIcon size={17} className="text-accent-violet" />
              <DialogTitle>Mantis 20-Stage Reference Pipeline</DialogTitle>
              <Badge variant="preview">Preview · Integration Pipeline</Badge>
            </HStack>
            <DialogDescription>
              Upstream specification: <span className="font-mono">{MANTIS_UPSTREAM_REPO}</span>
            </DialogDescription>
          </div>
          <DialogClose id="btn-close-mantis-drawer" aria-label="Close Mantis pipeline drawer">
            <CloseIcon size={16} />
          </DialogClose>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto bg-canvas px-5 py-4 tabular-nums">
          <div className="space-y-3 rounded-2xl border border-hairline bg-sidebar p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="select-mantis-repo" className="block text-xs font-medium text-ink-secondary">
                  Target Repository
                </label>
                <select
                  id="select-mantis-repo"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="h-9 w-full rounded-full border border-hairline-strong bg-canvas px-3.5 text-[13px] font-medium text-ink outline-none"
                >
                  {repoChoices.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="select-mantis-tier" className="block text-xs font-medium text-ink-secondary">
                  Depth Tier (15..100)
                </label>
                <select
                  id="select-mantis-tier"
                  value={tier}
                  onChange={(e) => setTier(e.target.value as MantisDepthTier)}
                  className="h-9 w-full rounded-full border border-hairline-strong bg-canvas px-3.5 text-[13px] font-medium text-ink outline-none"
                >
                  {MANTIS_DEPTH_TIER_PRESETS.map((preset) => (
                    <option key={preset.tier} value={preset.tier}>{preset.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-ink-secondary">Scan Execution Mode</div>
              <SegmentedControl
                value={scanMode}
                onChange={setScanMode}
                options={[
                  { value: 'static-only', label: 'static-only' },
                  { value: 'sandboxed-poc', label: 'sandboxed-poc' },
                  { value: 'shadow-worktree-patch', label: 'shadow-worktree-patch' },
                ]}
              />
            </div>

            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={seedSastJsonl}
                  onChange={(e) => setSeedSastJsonl(e.target.checked)}
                  className="size-3.5 rounded accent-ink"
                />
                <span>Seed Nightfall SAST &amp; Scorecard JSONL into planner</span>
              </label>
              <span className="text-xs text-ink-muted">
                Budget: {activePreset.maxGraphSteps} steps · {Math.round(activePreset.maxWallClockSeconds / 60)}m cap
              </span>
            </HStack>
          </div>

          <VStack gap={3}>
            {PHASE_ORDER.map((phaseMeta) => {
              const stages = MANTIS_REFERENCE_PIPELINE_STAGES.filter((st) => st.phase === phaseMeta.key);
              return (
                <section key={phaseMeta.key} className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    {phaseMeta.label}
                  </div>
                  <div className="divide-y divide-hairline rounded-2xl border border-hairline bg-canvas">
                    {stages.map((stage) => {
                      const skipped = stage.skipWhenStatic && scanMode === 'static-only';
                      const seamLabel = SEAM_LABELS[stage.nightfallSeam];
                      return (
                        <div key={stage.id} className={`px-3.5 py-2.5 text-xs ${skipped ? 'opacity-50' : ''}`}>
                          <HStack justify="between" align="center" wrap="wrap" gap={1.5}>
                            <HStack gap={1.5} align="center" wrap="wrap">
                              <StatusDot
                                variant={skipped ? 'neutral' : seamLabel ? 'accent' : 'success'}
                                label={skipped ? 'Skipped in static-only' : 'Active stage'}
                              />
                              <Code size="inherit">{stage.id}</Code>
                              <Token label={stage.nodeType} size="sm" color={stage.nodeType === 'classifier' ? 'gray' : 'blue'} />
                              {stage.reasoningEffort ? (
                                <span className="text-[11px] text-ink-muted">effort:{stage.reasoningEffort}</span>
                              ) : null}
                              {stage.forkFrom ? (
                                <span className="font-mono text-[11px] text-ink-muted">fork:{stage.forkFrom}</span>
                              ) : null}
                            </HStack>
                            {seamLabel ? <Badge variant="lavender">{seamLabel}</Badge> : null}
                          </HStack>
                          <p className="mt-1 mb-0 text-ink-secondary">{stage.summary}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </VStack>

          <Divider variant="subtle" />

          <section className="space-y-2.5">
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                <TerminalIcon size={14} />
                <span>Reference Runner CLI</span>
              </span>
              <Button id="btn-copy-mantis-cli" variant="outline" size="sm" onClick={() => void handleCopyCli()}>
                {copiedCli ? 'Copied ✓' : 'Copy ./reference/run.sh'}
              </Button>
            </HStack>
            <pre className="m-0 overflow-x-auto rounded-xl border border-hairline bg-sidebar px-3.5 py-2.5 font-mono text-xs text-ink">
              <code>{cliCommand}</code>
            </pre>

            <Collapsible className="rounded-xl border border-hairline bg-canvas p-2">
              <CollapsibleTrigger>
                <span>Preview generated workflow.local.json</span>
                <span className="font-mono text-xs text-ink-muted">depth {activePreset.numericDepth}</span>
              </CollapsibleTrigger>
              <CollapsiblePanel className="px-2 pb-1">
                <pre className="m-0 max-h-52 overflow-auto rounded-lg bg-sidebar p-3 font-mono text-[11.5px] text-ink">
                  <code>{workflowJson}</code>
                </pre>
              </CollapsiblePanel>
            </Collapsible>
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline bg-canvas px-5 py-3.5">
          <span className="text-xs text-ink-muted">
            {MANTIS_REFERENCE_PIPELINE_STAGES.length} reference nodes · Zero fabricated runs
          </span>
          <HStack gap={2} align="center">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button id="btn-download-mantis-workflow" onClick={handleDownloadConfig}>
              <DownloadIcon size={14} />
              <span>Export workflow.local.json</span>
            </Button>
          </HStack>
        </div>
      </DrawerContent>
    </DialogRoot>
  );
}
