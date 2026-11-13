import { z } from 'zod';

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'informational']);
export type Severity = z.infer<typeof SeveritySchema>;

export const FindingStatusSchema = z.enum([
  'new',
  'triaged',
  'in_progress',
  'fixed',
  'discarded_fp',
]);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const FixVerificationStatusSchema = z.enum([
  'not_recorded',
  'verifying',
  'verified',
  'regression_detected',
]);
export type FixVerificationStatus = z.infer<typeof FixVerificationStatusSchema>;

export const FixStatusSchema = z.enum(['proposed', 'in_progress', 'merged', 'suppressed']);
export type FixStatus = z.infer<typeof FixStatusSchema>;

export const RiskTierSchema = z.enum([
  'TIER_0_PASSIVE',
  'TIER_1_SAFE_PROBE',
  'TIER_2_STATE_MUTATING',
  'TIER_3_RESTRICTED',
]);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const FindingSourceBadgeSchema = z.enum(['nightfall', 'red-team', 'sast', 'third-party']);
export type FindingSourceBadge = z.infer<typeof FindingSourceBadgeSchema>;

export const OwnerSchema = z.object({
  name: z.string(),
  initials: z.string(),
  team: z.string(),
  avatarColor: z.string(),
});
export type OwnerInfo = z.infer<typeof OwnerSchema>;

export const CodeReferenceSchema = z.object({
  file: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  description: z.string().optional(),
});
export type CodeReference = z.infer<typeof CodeReferenceSchema>;

export const FindingRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
  repository: z.string().min(1),
  observedRevision: z.string().min(1),
  severity: SeveritySchema,
  status: FindingStatusSchema,
  fixVerification: FixVerificationStatusSchema,
  weaknessCwe: z.string(),
  owner: OwnerSchema,
  sources: z.array(FindingSourceBadgeSchema).min(1),
  summary: z.string(),
  rootCause: z.string(),
  impactAndAttackPath: z.string(),
  preconditions: z.array(z.string()),
  remediation: z.string(),
  affectedEndpoint: z.string().optional(),
  architectureNotes: z.string().optional(),
  defectsNotes: z.string().optional(),
  verificationChainSummary: z.string().optional(),
  codeReferences: z.array(CodeReferenceSchema).default([]),
  rootCauseClusterKey: z.string(),
  duplicateOfId: z.string().optional(),
  campaignId: z.string().optional(),
  evidenceBundleId: z.string().optional(),
  fixId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FindingRecord = z.infer<typeof FindingRecordSchema>;

export const EvidenceHttpTraceSchema = z.object({
  method: z.string(),
  url: z.string(),
  actor: z.string(),
  requestHeaders: z.record(z.string(), z.string()),
  requestBody: z.string().optional(),
  statusCode: z.number().int(),
  responseSnippet: z.string(),
});
export type EvidenceHttpTrace = z.infer<typeof EvidenceHttpTraceSchema>;

export const EvidenceBundleSchema = z.object({
  id: z.string().min(1),
  findingId: z.string().min(1),
  campaignId: z.string().min(1),
  verifiedAt: z.string(),
  reproducible: z.boolean(),
  canaryMarker: z.string().optional(),
  summary: z.string(),
  httpTraces: z.array(EvidenceHttpTraceSchema),
  codePath: z.array(
    z.object({
      file: z.string(),
      startLine: z.number().int(),
      endLine: z.number().int(),
      snippet: z.string(),
    }),
  ),
  controlAssertion: z.string(),
  probeAssertion: z.string(),
  artifactJson: z.record(z.string(), z.unknown()).optional(),
  minimalPatchDiff: z
    .object({
      filePath: z.string(),
      explanation: z.string(),
      unifiedDiff: z.string(),
    })
    .optional(),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

export const PatchGatesSchema = z.object({
  baselineBuildPassed: z.boolean(),
  redPhaseFailedAsExpected: z.boolean(),
  greenPhasePassed: z.boolean(),
  regressionSuitePassed: z.boolean(),
  staticHygienePassed: z.boolean(),
  criticApproved: z.boolean(),
  criticNotes: z.string(),
});
export type PatchGates = z.infer<typeof PatchGatesSchema>;

export const FixConversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'nightfall']),
  text: z.string(),
  createdAt: z.string(),
});
export type FixConversationMessage = z.infer<typeof FixConversationMessageSchema>;

export const FixProposalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
  repository: z.string().min(1),
  snapshotLabel: z.enum([
    'Nightfall · Cloud snapshot',
    'Nightfall · Local snapshot',
    'Nightfall · Red Team handoff',
  ]),
  findingIds: z.array(z.string()).min(1),
  severity: SeveritySchema,
  status: FixStatusSchema,
  changedFilesCount: z.number().int().nonnegative(),
  unifiedDiff: z.string(),
  securityTestDiff: z.string(),
  explanation: z.string(),
  gates: PatchGatesSchema,
  conversation: z.array(FixConversationMessageSchema).default([]),
  prUrl: z.string().optional(),
  prNumber: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FixProposal = z.infer<typeof FixProposalSchema>;
