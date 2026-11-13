import { z } from 'zod';
import {
  EvidenceBundleSchema,
  FindingRecordSchema,
  FixProposalSchema,
  RiskTierSchema,
  SeveritySchema,
} from './findings.js';

export const RepositoryRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  fullName: z.string(),
  ownerTeam: z.string(),
  prReviewsEnabled: z.boolean(),
  scheduledScanLabel: z.string().nullable(),
  lastCompletedScanLabel: z.string(),
  needsAttention: z.boolean(),
  openFindingsCount: z.number().int().nonnegative(),
  localPath: z.string().optional(),
  cloneUrl: z.string().optional(),
});
export type RepositoryRecord = z.infer<typeof RepositoryRecordSchema>;

export const NewScanRequestSchema = z.object({
  mode: z.enum(['cloud', 'local']),
  repository: z.string().min(1),
  localPath: z.string().optional(),
  cloneUrl: z.string().optional(),
  method: z.enum(['repository_scan', 'continuous_monitoring', 'scheduled_scan']),
  scope: z.enum(['full_repository', 'specific_paths']),
  paths: z.array(z.string()).optional(),
  scheduleCron: z.string().optional(),
});
export type NewScanRequest = z.infer<typeof NewScanRequestSchema>;

export const SandboxToolchainStatusSchema = z.object({
  available: z.boolean(),
  binDir: z.string().nullable(),
  runnerBinaryPath: z.string().nullable(),
  packagerBinaryPath: z.string().nullable(),
  syscallRewriterBinaryPath: z.string().nullable(),
  pythonStdlibZipPath: z.string().nullable(),
  northShim: z.enum(['litebox_shim_linux', 'litebox_shim_optee']),
  southPlatform: z.enum(['linux_userland', 'windows_userland', 'sev_snp', 'lvbs']),
  upstreamRepo: z.string(),
  pinnedCommit: z.string(),
});
export type SandboxToolchainStatus = z.infer<typeof SandboxToolchainStatusSchema>;

export const ScanJobRecordSchema = z.object({
  id: z.string(),
  repository: z.string(),
  mode: z.enum(['cloud', 'local']),
  method: z.enum(['repository_scan', 'continuous_monitoring', 'scheduled_scan']),
  scope: z.enum(['full_repository', 'specific_paths']),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  findingsDiscovered: z.number().int().nonnegative(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type ScanJobRecord = z.infer<typeof ScanJobRecordSchema>;

export const EndpointHitRecordSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'WS']),
  path: z.string(),
  hits: z.number().int().nonnegative(),
  authScope: z.string(),
});
export type EndpointHitRecord = z.infer<typeof EndpointHitRecordSchema>;

export const WorkQueueItemSchema = z.object({
  id: z.string(),
  hypothesis: z.string(),
  category: z.string(),
  assignedAgent: z.string(),
  riskTier: RiskTierSchema,
  status: z.enum(['queued', 'leased', 'confirmed', 'falsified', 'awaiting_approval']),
  leaseExpiresAt: z.string().optional(),
  outcomeNote: z.string().optional(),
  updatedAt: z.string(),
});
export type WorkQueueItem = z.infer<typeof WorkQueueItemSchema>;

export const SharedKnowledgeNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['endpoint', 'identity', 'data_flow', 'negative_result']),
  title: z.string(),
  detail: z.string(),
  sourceRef: z.string().optional(),
  discoveredBy: z.string(),
  createdAt: z.string(),
});
export type SharedKnowledgeNode = z.infer<typeof SharedKnowledgeNodeSchema>;

export const CampaignActivityPointSchema = z.object({
  timestamp: z.string(),
  requestsCount: z.number().int().nonnegative(),
  findingConfirmedTick: z.boolean(),
});
export type CampaignActivityPoint = z.infer<typeof CampaignActivityPointSchema>;

export const RedTeamCampaignRunSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  targetUrl: z.string(),
  sourceLabel: z.string(),
  yamlText: z.string(),
  status: z.enum(['draft', 'running', 'paused_hitl', 'completed', 'halted']),
  askForApproval: z.boolean(),
  modelId: z.string(),
  budgetRemainingPct: z.number().min(0).max(100),
  elapsedSeconds: z.number().int().nonnegative(),
  startedAt: z.string(),
  updatedLabel: z.string(),
  headlineStatus: z.string(),
  headlineDetail: z.string(),
  safetyMonitorText: z.string(),
  withinApprovedScope: z.boolean(),
  activitySeries: z.array(CampaignActivityPointSchema),
  endpoints: z.array(EndpointHitRecordSchema),
  workQueue: z.array(WorkQueueItemSchema),
  sharedKnowledge: z.array(SharedKnowledgeNodeSchema),
  findingIds: z.array(z.string()),
});
export type RedTeamCampaignRun = z.infer<typeof RedTeamCampaignRunSchema>;

export const HitlApprovalRequestSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  workItemId: z.string(),
  riskTier: RiskTierSchema,
  actionSummary: z.string(),
  targetEndpoint: z.string(),
  rationale: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  requestedAt: z.string(),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
});
export type HitlApprovalRequest = z.infer<typeof HitlApprovalRequestSchema>;

export const SankeyLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  value: z.number().int().nonnegative(),
});
export type SankeyLink = z.infer<typeof SankeyLinkSchema>;

export const OverviewSummarySchema = z.object({
  proposedFixesCount: z.number().int().nonnegative(),
  openFindingsCount: z.number().int().nonnegative(),
  fixedFindingsCount: z.number().int().nonnegative(),
  severityCounts: z.object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
    informational: z.number().int().nonnegative(),
  }),
  statusCounts: z.object({
    new: z.number().int().nonnegative(),
    triaged: z.number().int().nonnegative(),
    in_progress: z.number().int().nonnegative(),
    fixed: z.number().int().nonnegative(),
  }),
  sankeyLinks: z.array(SankeyLinkSchema),
  dailyTrend: z.array(
    z.object({
      date: z.string(),
      currentlyFixed: z.number().int().nonnegative(),
      newFindings: z.number().int().nonnegative(),
    }),
  ),
});
export type OverviewSummary = z.infer<typeof OverviewSummarySchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  timestamp: z.string(),
  subsystem: z.enum(['red-team', 'defense-factory', 'policy-gate', 'orchestrator', 'sandbox']),
  action: z.string(),
  entityId: z.string(),
  actor: z.string(),
  summary: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  prevHash: z.string(),
  hash: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const ModelDescriptorSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.enum(['openai', 'anthropic', 'google', 'local', 'nightfall-sim']),
  tier: z.enum(['frontier-cyber', 'fast-triage', 'patch-critic']),
});
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

export const StreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('campaign.updated'), campaign: RedTeamCampaignRunSchema }),
  z.object({ type: z.literal('finding.updated'), finding: FindingRecordSchema }),
  z.object({ type: z.literal('evidence.recorded'), evidence: EvidenceBundleSchema }),
  z.object({ type: z.literal('fix.updated'), fix: FixProposalSchema }),
  z.object({ type: z.literal('scan.updated'), scan: ScanJobRecordSchema }),
  z.object({ type: z.literal('hitl.updated'), approval: HitlApprovalRequestSchema }),
  z.object({
    type: z.literal('safety.kill_switch'),
    engaged: z.boolean(),
    reason: z.string(),
    timestamp: z.string(),
  }),
  z.object({ type: z.literal('audit.appended'), entry: AuditEntrySchema }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
