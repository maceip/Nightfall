import { z } from 'zod';

export const ScorecardServiceModeSchema = z.enum(['daemon-http', 'cli-oneshot', 'unavailable']);
export type ScorecardServiceMode = z.infer<typeof ScorecardServiceModeSchema>;

export const ScorecardToolchainStatusSchema = z.object({
  available: z.boolean(),
  binDir: z.string().nullable(),
  binaryPath: z.string().nullable(),
  serviceMode: ScorecardServiceModeSchema,
  daemonUrl: z.string().nullable(),
  version: z.string().nullable(),
  vendoredPath: z.string(),
  upstreamRepo: z.string(),
  pinnedCommit: z.string(),
});
export type ScorecardToolchainStatus = z.infer<typeof ScorecardToolchainStatusSchema>;

export const ScorecardCheckStatusSchema = z.enum(['pass', 'warn', 'fail', 'inconclusive']);
export type ScorecardCheckStatus = z.infer<typeof ScorecardCheckStatusSchema>;

export const ScorecardCheckRiskSchema = z.enum(['Critical', 'High', 'Medium', 'Low']);
export type ScorecardCheckRisk = z.infer<typeof ScorecardCheckRiskSchema>;

export const ScorecardFindingLocationSchema = z.object({
  path: z.string(),
  type: z.enum(['source', 'binary', 'text', 'url', 'binary_verified', 'none']).default('none'),
  lineStart: z.number().int().nonnegative().optional(),
  lineEnd: z.number().int().nonnegative().optional(),
  snippet: z.string().optional(),
});
export type ScorecardFindingLocation = z.infer<typeof ScorecardFindingLocationSchema>;

export const ScorecardFindingRemediationSchema = z.object({
  text: z.string(),
  markdown: z.string(),
  effort: z.enum(['low', 'medium', 'high', 'none']).default('none'),
  patch: z.string().optional(),
});
export type ScorecardFindingRemediation = z.infer<typeof ScorecardFindingRemediationSchema>;

export const ScorecardProbeFindingSchema = z.object({
  probe: z.string(),
  outcome: z.string(),
  message: z.string(),
  location: ScorecardFindingLocationSchema.optional(),
  remediation: ScorecardFindingRemediationSchema.optional(),
  values: z.record(z.string(), z.string()).optional(),
});
export type ScorecardProbeFinding = z.infer<typeof ScorecardProbeFindingSchema>;

export const ScorecardCheckResultSchema = z.object({
  name: z.string().min(1),
  score: z.number().int().min(-1).max(10),
  status: ScorecardCheckStatusSchema,
  risk: ScorecardCheckRiskSchema,
  reason: z.string(),
  short: z.string(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  remediationSteps: z.array(z.string()).default([]),
  documentationUrl: z.string(),
  details: z.array(z.string()).default([]),
  annotations: z.array(z.string()).default([]),
  findings: z.array(ScorecardProbeFindingSchema).default([]),
});
export type ScorecardCheckResult = z.infer<typeof ScorecardCheckResultSchema>;

export const ScorecardRiskSummarySchema = z.object({
  criticalFailing: z.number().int().nonnegative(),
  highFailing: z.number().int().nonnegative(),
  mediumFailing: z.number().int().nonnegative(),
  lowFailing: z.number().int().nonnegative(),
  passingChecks: z.number().int().nonnegative(),
  inconclusiveChecks: z.number().int().nonnegative(),
});
export type ScorecardRiskSummary = z.infer<typeof ScorecardRiskSummarySchema>;

export const ScorecardReportRecordSchema = z.object({
  id: z.string().min(1),
  repository: z.string().min(1),
  targetUri: z.string().min(1),
  targetType: z.enum(['local', 'remote']),
  observedRevision: z.string().min(1),
  evaluatedAt: z.string(),
  aggregateScore: z.number().min(-1).max(10),
  scorecardVersion: z.string(),
  scorecardCommit: z.string(),
  riskSummary: ScorecardRiskSummarySchema,
  checks: z.array(ScorecardCheckResultSchema),
  promotedFindingIds: z.array(z.string()).default([]),
});
export type ScorecardReportRecord = z.infer<typeof ScorecardReportRecordSchema>;

export const ScorecardScanRequestSchema = z.object({
  targetType: z.enum(['local', 'remote']).default('local'),
  repository: z.string().min(1),
  localPath: z.string().optional(),
  remoteRepo: z.string().optional(),
  checks: z.array(z.string()).optional(),
  promoteFindings: z.boolean().default(true),
  includeGovernanceChecks: z.boolean().default(false),
});
export type ScorecardScanRequest = z.infer<typeof ScorecardScanRequestSchema>;

export const ScorecardCheckCatalogEntrySchema = z.object({
  name: z.string().min(1),
  risk: ScorecardCheckRiskSchema,
  short: z.string(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  remediationSteps: z.array(z.string()).default([]),
  supportedRepoTypes: z.array(z.string()).default([]),
  documentationUrl: z.string(),
});
export type ScorecardCheckCatalogEntry = z.infer<typeof ScorecardCheckCatalogEntrySchema>;

export const NightfallWireScorecardEnvelopeSchema = z.object({
  service: z.string(),
  date: z.string(),
  repo: z.object({
    name: z.string(),
    commit: z.string(),
    targetType: z.enum(['local', 'remote']).catch('local'),
  }),
  scorecard: z.object({
    version: z.string(),
    commit: z.string(),
  }),
  score: z.number(),
  riskSummary: ScorecardRiskSummarySchema,
  checks: z.array(
    z.object({
      name: z.string(),
      score: z.number().int(),
      status: ScorecardCheckStatusSchema.catch('inconclusive'),
      risk: z.string(),
      reason: z.string(),
      short: z.string().default(''),
      description: z.string().default(''),
      tags: z.array(z.string()).nullish().transform((v) => v ?? []),
      remediationSteps: z.array(z.string()).nullish().transform((v) => v ?? []),
      documentationUrl: z.string().default(''),
      details: z.array(z.string()).nullish().transform((v) => v ?? []),
      annotations: z.array(z.string()).nullish().transform((v) => v ?? []),
      findings: z
        .array(ScorecardProbeFindingSchema)
        .nullish()
        .transform((v) => v ?? []),
    }),
  ),
  metadata: z.array(z.string()).nullish().transform((v) => v ?? []),
});
export type NightfallWireScorecardEnvelope = z.infer<typeof NightfallWireScorecardEnvelopeSchema>;
