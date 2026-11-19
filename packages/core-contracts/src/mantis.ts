import { z } from 'zod';

export const MANTIS_UPSTREAM_REPO = 'https://github.com/maceip/mantis' as const;
export const FNAUDIT_UPSTREAM_REPO = 'https://github.com/thomasdullien/fnaudit' as const;
export const FNAUDIT_PINNED_COMMIT = '686c309a04debc2cd76db228b3c52e22afc7fce4' as const;
export const CODENAV_UPSTREAM_REPO = 'https://github.com/thomasdullien/codenav' as const;
export const CODENAV_PINNED_COMMIT = '670a3f3ca515bf17de6a43f338efca32af3ad0d2' as const;

export const MantisDepthTierSchema = z.enum([
  'tier-1-fast',
  'tier-2-pr',
  'tier-3-deep',
  'tier-4-live-handoff',
  'tier-5-exhaust',
]);
export type MantisDepthTier = z.infer<typeof MantisDepthTierSchema>;

export const MantisScanModeSchema = z.enum([
  'static-only',
  'sandboxed-poc',
  'shadow-worktree-patch',
]);
export type MantisScanMode = z.infer<typeof MantisScanModeSchema>;

export const MantisGateVerdictSchema = z.enum(['PASS', 'REVIEW', 'BLOCK']);
export type MantisGateVerdict = z.infer<typeof MantisGateVerdictSchema>;

export const MantisIntegrationStateSchema = z.enum([
  'preview-pipeline',
  'local-checkout-detected',
  'integrated-engine',
]);
export type MantisIntegrationState = z.infer<typeof MantisIntegrationStateSchema>;

export const MantisToolchainStatusSchema = z.object({
  available: z.boolean(),
  engineDir: z.string(),
  bridgeScriptPath: z.string(),
  pythonExecutable: z.string(),
  runtimeFlavor: z.literal('mantis_runtime'),
  sandboxMode: z.literal('static-only'),
  upstreamRepo: z.string(),
  stageCount: z.number().int().positive(),
  fnauditAvailable: z.boolean().default(false),
  fnauditPinnedCommit: z.string().default(FNAUDIT_PINNED_COMMIT),
  codenavAvailable: z.boolean().default(false),
  codenavBinaryPath: z.string().nullable().default(null),
  codenavPinnedCommit: z.string().default(CODENAV_PINNED_COMMIT),
  evidenceGateEnabled: z.boolean().default(false),
});
export type MantisToolchainStatus = z.infer<typeof MantisToolchainStatusSchema>;

export const MantisStageDescriptorSchema = z.object({
  id: z.string().min(1),
  nodeType: z.enum(['agent', 'classifier']),
  phase: z.enum([
    'recon-stem',
    'discovery',
    'verification',
    'remediation-handoff',
    'calibration-report',
  ]),
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  forkFrom: z.string().optional(),
  skipWhenStatic: z.boolean().default(false),
  nightfallSeam: z
    .enum([
      'none',
      'sast-seed-jsonl',
      'red-team-tier4-handoff',
      'defense-factory-verified-patch',
      'mcp-check-change-gate',
    ])
    .default('none'),
  summary: z.string(),
});
export type MantisStageDescriptor = z.infer<typeof MantisStageDescriptorSchema>;

export const MANTIS_DEPTH_TIER_PRESETS: ReadonlyArray<{
  tier: MantisDepthTier;
  numericDepth: number;
  label: string;
  maxGraphSteps: number;
  maxWallClockSeconds: number;
  description: string;
}> = [
  {
    tier: 'tier-1-fast',
    numericDepth: 15,
    label: 'Tier 1 · Fast Static Triage (15)',
    maxGraphSteps: 120,
    maxWallClockSeconds: 900,
    description: 'Rapid history + structural index + researcher sweep (`static-only`).',
  },
  {
    tier: 'tier-2-pr',
    numericDepth: 35,
    label: 'Tier 2 · PR Diff & MCP Gate (35)',
    maxGraphSteps: 250,
    maxWallClockSeconds: 3600,
    description: 'Runs reviewer + critic gates and `mantis_check_change` (`PASS | REVIEW | BLOCK`).',
  },
  {
    tier: 'tier-3-deep',
    numericDepth: 65,
    label: 'Tier 3 · Sandboxed PoC & Patch (65)',
    maxGraphSteps: 500,
    maxWallClockSeconds: 14400,
    description: 'Executes `reproducer`, `chainer`, and shadow-worktree `patcher` (`VERIFIED_SECURE`).',
  },
  {
    tier: 'tier-4-live-handoff',
    numericDepth: 85,
    label: 'Tier 4 · Nightfall Live Red Team Handoff (85)',
    maxGraphSteps: 750,
    maxWallClockSeconds: 28800,
    description: 'Promotes Tier 1–3 candidates into Nightfall Red Team scope-signed staging verification.',
  },
  {
    tier: 'tier-5-exhaust',
    numericDepth: 100,
    label: 'Tier 5 · Full Codebase Exhaustion (100)',
    maxGraphSteps: 1200,
    maxWallClockSeconds: 43200,
    description: 'Maximum-budget multi-pass audit across all 20 reference workflow nodes.',
  },
];

export const MANTIS_REFERENCE_PIPELINE_STAGES: ReadonlyArray<MantisStageDescriptor> = [
  { id: 'history', nodeType: 'agent', phase: 'recon-stem', reasoningEffort: 'low', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Analyzes recent Git commit history and security-sensitive churn.' },
  { id: 'structural_index', nodeType: 'agent', phase: 'recon-stem', reasoningEffort: 'low', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Builds repository symbol boundaries and trust-zone inventory.' },
  { id: 'architect', nodeType: 'agent', phase: 'recon-stem', reasoningEffort: 'medium', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Records shared `audit_stem` architectural summary into `knowledge.db`.' },
  { id: 'threat_modeler', nodeType: 'agent', phase: 'recon-stem', reasoningEffort: 'medium', forkFrom: 'architect', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Derives attacker entrypoints, tenant boundaries, and trust assumptions.' },
  { id: 'planner', nodeType: 'agent', phase: 'recon-stem', reasoningEffort: 'medium', forkFrom: 'threat_modeler', skipWhenStatic: false, nightfallSeam: 'sast-seed-jsonl', summary: 'Ingests `sast_findings.jsonl` seeds from Nightfall RepositoryScanner & Scorecard.' },
  { id: 'explorer', nodeType: 'agent', phase: 'discovery', reasoningEffort: 'medium', forkFrom: 'planner', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Traverses callers, callees, and function boundaries along planned hypotheses.' },
  { id: 'researcher', nodeType: 'agent', phase: 'discovery', reasoningEffort: 'medium', forkFrom: 'explorer', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Produces structured candidate vulnerability records and regression checks.' },
  { id: 'findings_gate', nodeType: 'classifier', phase: 'discovery', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Short-circuits clean targets directly to `reporter` when zero candidates exist.' },
  { id: 'deduplicator', nodeType: 'agent', phase: 'discovery', reasoningEffort: 'low', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Collapses duplicate candidate traces by shared root cause.' },
  { id: 'reviewer', nodeType: 'agent', phase: 'verification', reasoningEffort: 'medium', forkFrom: 'explorer', skipWhenStatic: false, nightfallSeam: 'mcp-check-change-gate', summary: 'Emits `ReviewVerdict` backing `mantis_check_change` (`PASS | REVIEW | BLOCK`).' },
  { id: 'reviewer_classifier', nodeType: 'classifier', phase: 'verification', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Routes confirmed candidates to `critic` and unconfirmed items to `calibrator`.' },
  { id: 'critic', nodeType: 'agent', phase: 'verification', reasoningEffort: 'medium', forkFrom: 'explorer', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Adversarially challenges exploitability assumptions (`CriticVerdict`).' },
  { id: 'critic_classifier', nodeType: 'classifier', phase: 'verification', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Gates entry into dynamic `reproducer` only when `CriticVerdict` is `viable`.' },
  { id: 'reproducer', nodeType: 'agent', phase: 'verification', reasoningEffort: 'medium', forkFrom: 'explorer', skipWhenStatic: true, nightfallSeam: 'red-team-tier4-handoff', summary: 'Runs Tier 1–3 sandboxed PoCs and hands live network targets to Nightfall Red Team.' },
  { id: 'repro_classifier', nodeType: 'classifier', phase: 'verification', skipWhenStatic: true, nightfallSeam: 'none', summary: 'Routes reproduced findings (`ReproVerdict: success`) into `chainer` and `patcher`.' },
  { id: 'chainer', nodeType: 'agent', phase: 'remediation-handoff', reasoningEffort: 'high', skipWhenStatic: true, nightfallSeam: 'red-team-tier4-handoff', summary: 'Composes multi-step exploit chains (`record_exploit_chain`) for Red Team replay.' },
  { id: 'patcher', nodeType: 'agent', phase: 'remediation-handoff', reasoningEffort: 'high', skipWhenStatic: true, nightfallSeam: 'defense-factory-verified-patch', summary: 'Synthesizes `VERIFIED_SECURE` patches in shadow worktrees for Defense Factory.' },
  { id: 'calibrator', nodeType: 'agent', phase: 'calibration-report', reasoningEffort: 'medium', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Scores CVSS/severity calibration (`FindingCalibration`) from verified evidence.' },
  { id: 'reflector', nodeType: 'agent', phase: 'calibration-report', reasoningEffort: 'medium', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Persists institutional learnings into `knowledge.db` for future runs.' },
  { id: 'reporter', nodeType: 'agent', phase: 'calibration-report', reasoningEffort: 'medium', skipWhenStatic: false, nightfallSeam: 'none', summary: 'Generates structured Mantis report artifacts and handoff bundles.' },
];

export const MantisWorkflowExportOptionsSchema = z.object({
  repository: z.string().min(1),
  localPath: z.string().default('.'),
  tier: MantisDepthTierSchema.default('tier-3-deep'),
  scanMode: MantisScanModeSchema.default('sandboxed-poc'),
  defaultModel: z.string().default('vertex_ai/gemini-3.8-flash'),
  seedSastJsonl: z.boolean().default(true),
});
export type MantisWorkflowExportOptions = z.infer<typeof MantisWorkflowExportOptionsSchema>;

export function buildMantisWorkflowLocalJson(rawOpts: MantisWorkflowExportOptions): string {
  const opts = MantisWorkflowExportOptionsSchema.parse(rawOpts);
  const preset =
    MANTIS_DEPTH_TIER_PRESETS.find((item) => item.tier === opts.tier) ??
    MANTIS_DEPTH_TIER_PRESETS[2]!;
  const sandboxType = opts.scanMode === 'static-only' ? 'static-only' : 'litebox-isolated';

  const workflowConfig = {
    name: 'mantis_vulnerability_pipeline',
    upstream: MANTIS_UPSTREAM_REPO,
    nightfall_bridge: {
      integration_state: 'integrated-engine',
      repository: opts.repository,
      depth_tier: opts.tier,
      numeric_depth: preset.numericDepth,
      sast_seed_file: opts.seedSastJsonl ? '.nightfall/sast_findings.jsonl' : null,
      handoff_targets: {
        red_team_live_staging: opts.tier === 'tier-4-live-handoff' || opts.tier === 'tier-5-exhaust',
        defense_factory_patch_queue: opts.scanMode === 'shadow-worktree-patch',
      },
    },
    config: {
      db_path: 'knowledge.db',
      retry_attempts: 3,
      default_model: opts.defaultModel,
      reasoning_effort: preset.numericDepth >= 65 ? 'high' : 'medium',
      context_editing_trigger_tokens: 180000,
      timeout: 180,
      seed_prompt: `Initial Task Input: Evaluate ${opts.repository} ({filepath})`,
      sandbox: {
        type: sandboxType,
        options:
          sandboxType === 'static-only'
            ? {}
            : { runtime: 'microsoft-litebox', network: 'disabled' },
      },
    },
    budget: {
      max_wall_clock_seconds: preset.maxWallClockSeconds,
      max_tokens: 10000000,
      max_graph_steps: preset.maxGraphSteps,
      max_node_visits: 50,
      max_llm_calls: 2000,
      max_node_tool_calls: 200,
    },
  };

  return JSON.stringify(workflowConfig, null, 2);
}

export function buildMantisCliCommand(rawOpts: MantisWorkflowExportOptions): string {
  const opts = MantisWorkflowExportOptionsSchema.parse(rawOpts);
  const preset =
    MANTIS_DEPTH_TIER_PRESETS.find((item) => item.tier === opts.tier) ??
    MANTIS_DEPTH_TIER_PRESETS[2]!;
  const flags = [
    './reference/run.sh',
    `--repo ${JSON.stringify(opts.localPath)}`,
    '--config workflow.local.json',
    `--depth ${preset.numericDepth}`,
  ];
  if (opts.scanMode === 'static-only') {
    flags.push('--static-only');
  }
  if (opts.seedSastJsonl) {
    flags.push('--seed .nightfall/sast_findings.jsonl');
  }
  return flags.join(' ');
}
