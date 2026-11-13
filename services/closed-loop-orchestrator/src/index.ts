import crypto from 'node:crypto';
import {
  FindingRecordSchema,
  NewScanRequestSchema,
  OverviewSummarySchema,
  RedTeamCampaignRunSchema,
  ScanJobRecordSchema,
  StreamEventSchema,
  parseCampaignYaml,
  type AuditEntry,
  type EvidenceBundle,
  type FindingRecord,
  type FixProposal,
  type HitlApprovalRequest,
  type ModelDescriptor,
  type NewScanRequest,
  type OverviewSummary,
  type RedTeamCampaignRun,
  type RepositoryRecord,
  type SankeyLink,
  type ScanJobRecord,
  type Severity,
  type StreamEvent,
} from '@nightfall/core-contracts';
import {
  INITIAL_EVIDENCE_BUNDLES,
  INITIAL_FINDINGS,
  INITIAL_FIXES,
  INITIAL_HITL_APPROVALS,
  INITIAL_OVERVIEW,
  INITIAL_RED_TEAM_CAMPAIGN,
  INITIAL_REPOSITORIES,
  INITIAL_SCANS,
} from '@nightfall/mock-fixtures';
import { AuditLedger, type SafetyMonitorStatus } from '@nightfall/audit-ledger';
import { ModelGateway } from '@nightfall/model-gateway';
import { PolicyGate } from '@nightfall/policy-gate';
import { DisposableSandboxRuntime } from '@nightfall/sandbox-runtime';
import { SharedKnowledgeStore } from '@nightfall/shared-memory';
import {
  RedTeamEngine,
  type AssessmentRunResult,
  type PrepareCampaignInput,
  type VerifyFixClosureResult,
} from '@nightfall/red-team';
import {
  DefenseFactoryEngine,
  RootCauseDeduplicator,
  type ProposeFixOptions,
} from '@nightfall/defense-factory';

export const PACKAGE_NAME = '@nightfall/closed-loop-orchestrator';

type OpenStatus = 'new' | 'triaged' | 'in_progress';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
};
const LABEL_TO_SEVERITY: Record<string, Severity> = {
  Critical: 'critical',
  High: 'high',
  Medium: 'medium',
  Low: 'low',
  Informational: 'informational',
};

const OPEN_STATUS_ORDER: OpenStatus[] = ['in_progress', 'triaged', 'new'];
const STATUS_LABEL: Record<OpenStatus, string> = {
  in_progress: 'In Progress',
  triaged: 'Triaged',
  new: 'New',
};
const LABEL_TO_STATUS: Record<string, OpenStatus> = {
  'In Progress': 'in_progress',
  Triaged: 'triaged',
  New: 'new',
};

export interface NightfallOrchestratorOptions {
  simulationIntervalMs?: number;
  enableLiveSimulationTimers?: boolean;
}

export interface BootstrapPayload {
  overview: OverviewSummary;
  findings: FindingRecord[];
  fixes: FixProposal[];
  repositories: RepositoryRecord[];
  scans: ScanJobRecord[];
  campaigns: RedTeamCampaignRun[];
  evidenceBundles: EvidenceBundle[];
  approvals: HitlApprovalRequest[];
  models: ModelDescriptor[];
  auditEntries: AuditEntry[];
  safetyMonitor: SafetyMonitorStatus;
  killSwitchEngaged: boolean;
}

export class NightfallOrchestrator {
  readonly auditLedger: AuditLedger;
  readonly policyGate: PolicyGate;
  readonly sandboxRuntime: DisposableSandboxRuntime;
  readonly sharedMemory: SharedKnowledgeStore;
  readonly modelGateway: ModelGateway;
  readonly redTeam: RedTeamEngine;
  readonly defenseFactory: DefenseFactoryEngine;
  readonly deduplicator: RootCauseDeduplicator;

  private findings: FindingRecord[];
  private fixes: FixProposal[];
  private repositories: RepositoryRecord[];
  private scans: ScanJobRecord[];
  private campaigns: RedTeamCampaignRun[];
  private evidenceBundles: EvidenceBundle[];
  private readonly initialFindingCount: number;

  private readonly backgroundOpenMatrix: Record<Severity, Record<OpenStatus, number>>;
  private readonly backgroundFixedCount: number;
  private readonly baseDailyTrend: OverviewSummary['dailyTrend'];

  private readonly listeners = new Set<(event: StreamEvent) => void>();
  private readonly campaignTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly simulationIntervalMs: number;
  private readonly enableLiveSimulationTimers: boolean;

  constructor(options?: NightfallOrchestratorOptions) {
    this.simulationIntervalMs = options?.simulationIntervalMs ?? 1500;
    this.enableLiveSimulationTimers = options?.enableLiveSimulationTimers ?? true;

    this.findings = structuredClone(INITIAL_FINDINGS);
    this.fixes = structuredClone(INITIAL_FIXES);
    this.repositories = structuredClone(INITIAL_REPOSITORIES);
    this.scans = structuredClone(INITIAL_SCANS);
    this.campaigns = [structuredClone(INITIAL_RED_TEAM_CAMPAIGN)];
    this.evidenceBundles = structuredClone(INITIAL_EVIDENCE_BUNDLES);
    this.initialFindingCount = this.findings.length;
    this.baseDailyTrend = structuredClone(INITIAL_OVERVIEW.dailyTrend);

    // Compute background matrix so INITIAL_OVERVIEW is preserved at t=0 and every mutation maintains exact Sankey conservation
    this.backgroundOpenMatrix = {
      critical: { in_progress: 0, triaged: 0, new: 0 },
      high: { in_progress: 0, triaged: 0, new: 0 },
      medium: { in_progress: 0, triaged: 0, new: 0 },
      low: { in_progress: 0, triaged: 0, new: 0 },
      informational: { in_progress: 0, triaged: 0, new: 0 },
    };

    for (const link of INITIAL_OVERVIEW.sankeyLinks) {
      const sev = LABEL_TO_SEVERITY[link.source];
      const st = LABEL_TO_STATUS[link.target];
      if (sev && st) {
        this.backgroundOpenMatrix[sev][st] = link.value;
      }
    }

    let initialFixedInList = 0;
    for (const f of this.findings) {
      if (f.status === 'fixed') {
        initialFixedInList += 1;
      } else if (f.status === 'new' || f.status === 'triaged' || f.status === 'in_progress') {
        this.backgroundOpenMatrix[f.severity][f.status] = Math.max(
          0,
          this.backgroundOpenMatrix[f.severity][f.status] - 1,
        );
      }
    }
    this.backgroundFixedCount = Math.max(
      0,
      INITIAL_OVERVIEW.fixedFindingsCount - initialFixedInList,
    );

    this.auditLedger = new AuditLedger({
      onAppend: (entry) => {
        this.emit({ type: 'audit.appended', entry });
      },
    });

    this.policyGate = new PolicyGate({
      initialApprovals: structuredClone(INITIAL_HITL_APPROVALS),
      onKillSwitch: (reason) => {
        this.haltRunningCampaigns(reason);
      },
    });

    this.sandboxRuntime = new DisposableSandboxRuntime();
    this.sharedMemory = new SharedKnowledgeStore();
    this.modelGateway = new ModelGateway();
    this.deduplicator = new RootCauseDeduplicator();

    const initCampaign = this.campaigns[0]!;
    this.sharedMemory.seedCampaignMemory(
      initCampaign.id,
      initCampaign.workQueue,
      initCampaign.sharedKnowledge,
    );

    this.redTeam = new RedTeamEngine({
      sandboxRuntime: this.sandboxRuntime,
      policyGate: this.policyGate,
      sharedMemory: this.sharedMemory,
      auditLedger: this.auditLedger,
      modelGateway: this.modelGateway,
    });

    this.defenseFactory = new DefenseFactoryEngine({
      sandboxRuntime: this.sandboxRuntime,
      auditLedger: this.auditLedger,
      modelGateway: this.modelGateway,
    });

    // Seed initial cryptographic audit entries
    this.auditLedger.append({
      subsystem: 'policy-gate',
      action: 'scope.manifest.signed',
      entityId: initCampaign.id,
      actor: 'nightfall-policy-gate',
      summary: 'Signed v5 campaign.yaml manifest (HTTP GET/POST + WS /ws/documents, max 10 RPS).',
      metadata: { rps: 10 },
    });
    this.auditLedger.append({
      subsystem: 'red-team',
      action: 'finding.confirmed',
      entityId: 'F-002',
      actor: 'verifier-beta',
      summary:
        'Confirmed cross-workspace saved-search export differential via benign canary NS-7b64c9e2.',
      metadata: { canary: 'NS-7b64c9e2' },
    });
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: StreamEvent): void {
    const validated = StreamEventSchema.parse(event);
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(validated));
      } catch {
        // isolate subscriber errors
      }
    }
  }

  computeOverview(): OverviewSummary {
    const cellMatrix: Record<Severity, Record<OpenStatus, number>> = {
      critical: { ...this.backgroundOpenMatrix.critical },
      high: { ...this.backgroundOpenMatrix.high },
      medium: { ...this.backgroundOpenMatrix.medium },
      low: { ...this.backgroundOpenMatrix.low },
      informational: { ...this.backgroundOpenMatrix.informational },
    };

    let liveFixedCount = 0;
    for (const f of this.findings) {
      if (f.status === 'fixed') {
        liveFixedCount += 1;
      } else if (f.status === 'new' || f.status === 'triaged' || f.status === 'in_progress') {
        cellMatrix[f.severity][f.status] += 1;
      }
    }

    const severityCounts: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };

    const statusCounts = {
      new: 0,
      triaged: 0,
      in_progress: 0,
      fixed: this.backgroundFixedCount + liveFixedCount,
    };

    for (const sev of SEVERITY_ORDER) {
      const row = cellMatrix[sev];
      const sevTotal = row.in_progress + row.triaged + row.new;
      severityCounts[sev] = sevTotal;
      statusCounts.in_progress += row.in_progress;
      statusCounts.triaged += row.triaged;
      statusCounts.new += row.new;
    }

    const openFindingsCount =
      statusCounts.new + statusCounts.triaged + statusCounts.in_progress;
    const fixedFindingsCount = statusCounts.fixed;
    const proposedFixesCount = this.fixes.filter((fix) => fix.status === 'proposed').length;

    const sankeyLinks: SankeyLink[] = [];
    for (const sev of SEVERITY_ORDER) {
      if (severityCounts[sev] > 0) {
        sankeyLinks.push({
          source: 'Findings',
          target: SEVERITY_LABEL[sev],
          value: severityCounts[sev],
        });
      }
    }
    for (const sev of SEVERITY_ORDER) {
      for (const st of OPEN_STATUS_ORDER) {
        const val = cellMatrix[sev][st];
        if (val > 0) {
          sankeyLinks.push({
            source: SEVERITY_LABEL[sev],
            target: STATUS_LABEL[st],
            value: val,
          });
        }
      }
    }

    const addedFindingsDelta = Math.max(0, this.findings.length - this.initialFindingCount);
    const dailyTrend = this.baseDailyTrend.map((point, idx, arr) => {
      if (idx === arr.length - 1) {
        return {
          date: point.date,
          currentlyFixed: fixedFindingsCount,
          newFindings: point.newFindings + addedFindingsDelta,
        };
      }
      return { ...point };
    });

    return OverviewSummarySchema.parse({
      proposedFixesCount,
      openFindingsCount,
      fixedFindingsCount,
      severityCounts,
      statusCounts,
      sankeyLinks,
      dailyTrend,
    });
  }

  getBootstrapState(): BootstrapPayload {
    return {
      overview: this.computeOverview(),
      findings: structuredClone(this.findings),
      fixes: structuredClone(this.fixes),
      repositories: structuredClone(this.repositories),
      scans: structuredClone(this.scans),
      campaigns: structuredClone(this.campaigns),
      evidenceBundles: structuredClone(this.evidenceBundles),
      approvals: this.policyGate.listApprovals(),
      models: this.modelGateway.listModels(),
      auditEntries: this.auditLedger.list(),
      safetyMonitor: this.auditLedger.getSafetyMonitorStatus(),
      killSwitchEngaged: this.policyGate.isKillSwitchEngaged(),
    };
  }

  async triggerScan(rawReq: NewScanRequest): Promise<{
    scan: ScanJobRecord;
    overview: OverviewSummary;
    findings: FindingRecord[];
  }> {
    const req = NewScanRequestSchema.parse(rawReq);
    const startedAt = new Date().toISOString();
    const scanId = `scan-${crypto.randomUUID().slice(0, 6)}`;
    const owner = this.deduplicator.resolveCodeOwner(req.repository);

    const newFindingId = `SEC-${1150 + this.scans.length + 1}`;
    const newFinding = FindingRecordSchema.parse({
      id: newFindingId,
      title: `Missing tenant boundary check — ${req.repository}`,
      subtitle: `${req.repository} · ${newFindingId} · Discovered by ${req.mode} scan`,
      repository: req.repository,
      observedRevision: crypto.randomUUID().slice(0, 7),
      severity: 'high',
      status: 'new',
      fixVerification: 'not_recorded',
      weaknessCwe: 'CWE-862 · Missing authorization',
      owner,
      sources: ['nightfall'],
      summary: `Repository scan (${req.method}) identified an unguarded handler path in ${req.repository}.`,
      rootCause: 'Resource lookup executes without verifying caller workspace/project membership.',
      impactAndAttackPath:
        'Authenticated callers in an adjacent workspace may read scoped metadata.',
      preconditions: ['Caller holds a valid session token and supplies a target resource ID.'],
      remediation:
        'Enforce caller workspace membership prior to returning resource data and add a negative unit test.',
      affectedEndpoint:
        req.paths && req.paths[0] ? `POST ${req.paths[0]}` : 'POST /api/v1/resources/export',
      codeReferences: [
        {
          file: req.paths?.[0] ?? 'src/routes/resource_handler.ts',
          startLine: 28,
          endLine: 51,
          description: 'Handler missing caller tenant guard',
        },
      ],
      rootCauseClusterKey: `${req.repository}:missing-tenant-guard-${scanId}`,
      createdAt: startedAt,
      updatedAt: startedAt,
    });

    this.findings.unshift(newFinding);

    const repoIdx = this.repositories.findIndex(
      (r) => r.name === req.repository || r.fullName === req.repository || r.id === req.repository,
    );
    if (repoIdx >= 0) {
      const repo = this.repositories[repoIdx]!;
      this.repositories[repoIdx] = {
        ...repo,
        lastCompletedScanLabel: 'Just now',
        openFindingsCount: repo.openFindingsCount + 1,
        ...(req.method === 'scheduled_scan' && req.scheduleCron
          ? { scheduledScanLabel: `Cron (${req.scheduleCron})` }
          : {}),
      };
    }

    const completedAt = new Date().toISOString();
    const scan = ScanJobRecordSchema.parse({
      id: scanId,
      repository: req.repository,
      mode: req.mode,
      method: req.method,
      scope: req.scope,
      status: 'completed',
      findingsDiscovered: 1,
      startedAt,
      completedAt,
    });
    this.scans.unshift(scan);

    this.auditLedger.append({
      subsystem: 'orchestrator',
      action: 'scan.completed',
      entityId: scan.id,
      actor: 'nightfall-scanner',
      summary: `Completed ${req.mode} ${req.method} on ${req.repository}; discovered ${newFinding.id}.`,
      metadata: { repository: req.repository, findingId: newFinding.id },
    });

    this.emit({ type: 'scan.updated', scan });
    this.emit({ type: 'finding.updated', finding: newFinding });

    return {
      scan: structuredClone(scan),
      overview: this.computeOverview(),
      findings: structuredClone(this.findings),
    };
  }

  markFindingDuplicate(
    findingId: string,
    duplicateOfId?: string,
  ): { finding: FindingRecord; overview: OverviewSummary } {
    const idx = this.findings.findIndex((f) => f.id === findingId);
    if (idx < 0) {
      throw new Error(`Finding not found: ${findingId}`);
    }
    const current = this.findings[idx]!;
    const canonicalDuplicate =
      duplicateOfId ??
      this.findings.find(
        (other) =>
          other.id !== findingId && other.rootCauseClusterKey === current.rootCauseClusterKey,
      )?.id ??
      'SEC-CANONICAL';

    const updated = FindingRecordSchema.parse({
      ...current,
      status: 'discarded_fp',
      duplicateOfId: canonicalDuplicate,
      updatedAt: new Date().toISOString(),
    });
    this.findings[idx] = updated;

    this.auditLedger.append({
      subsystem: 'orchestrator',
      action: 'finding.marked_duplicate',
      entityId: updated.id,
      actor: 'security-engineer',
      summary: `Marked ${updated.id} as duplicate of ${canonicalDuplicate}.`,
      metadata: { duplicateOfId: canonicalDuplicate },
    });

    this.emit({ type: 'finding.updated', finding: updated });

    return {
      finding: structuredClone(updated),
      overview: this.computeOverview(),
    };
  }

  async startFixForFinding(
    findingId: string,
    options?: ProposeFixOptions,
  ): Promise<{ fix: FixProposal; finding: FindingRecord; overview: OverviewSummary }> {
    const idx = this.findings.findIndex((f) => f.id === findingId);
    if (idx < 0) {
      throw new Error(`Finding not found: ${findingId}`);
    }
    const targetFinding = this.findings[idx]!;

    // If an active FixProposal already exists and no custom moduleSnapshot was requested, reuse or promote it
    if (targetFinding.fixId && !options?.moduleSnapshot) {
      const existingFix = this.fixes.find((fx) => fx.id === targetFinding.fixId);
      if (existingFix) {
        if (targetFinding.status !== 'in_progress' && targetFinding.status !== 'fixed') {
          const updatedFinding = FindingRecordSchema.parse({
            ...targetFinding,
            status: 'in_progress',
            updatedAt: new Date().toISOString(),
          });
          this.findings[idx] = updatedFinding;
          this.emit({ type: 'finding.updated', finding: updatedFinding });
        }
        return {
          fix: structuredClone(existingFix),
          finding: structuredClone(this.findings[idx]!),
          overview: this.computeOverview(),
        };
      }
    }

    // Deduplicate all open findings sharing the same rootCauseClusterKey
    const clusterMembers = this.findings.filter(
      (f) =>
        f.id === findingId ||
        (f.rootCauseClusterKey === targetFinding.rootCauseClusterKey &&
          f.status !== 'fixed' &&
          f.status !== 'discarded_fp'),
    );

    const fix = await this.defenseFactory.proposeFixForFindings(clusterMembers, options);
    const existingFixIdx = this.fixes.findIndex((fx) => fx.id === fix.id);
    if (existingFixIdx >= 0) {
      this.fixes[existingFixIdx] = fix;
    } else {
      this.fixes.unshift(fix);
    }
    this.emit({ type: 'fix.updated', fix });

    const nowIso = new Date().toISOString();
    if (fix.status === 'proposed' || fix.status === 'in_progress') {
      for (let i = 0; i < this.findings.length; i += 1) {
        const candidate = this.findings[i]!;
        if (fix.findingIds.includes(candidate.id)) {
          const updatedFinding = FindingRecordSchema.parse({
            ...candidate,
            status: candidate.status === 'fixed' ? 'fixed' : 'in_progress',
            fixId: fix.id,
            updatedAt: nowIso,
          });
          this.findings[i] = updatedFinding;
          this.emit({ type: 'finding.updated', finding: updatedFinding });
        }
      }
    }

    const refreshedTarget = this.findings.find((f) => f.id === findingId)!;
    return {
      fix: structuredClone(fix),
      finding: structuredClone(refreshedTarget),
      overview: this.computeOverview(),
    };
  }

  async applyFixFollowUp(fixId: string, message: string): Promise<{ fix: FixProposal }> {
    const idx = this.fixes.findIndex((fx) => fx.id === fixId);
    if (idx < 0) {
      throw new Error(`FixProposal not found: ${fixId}`);
    }

    const updatedFix = await this.defenseFactory.applyEngineerFollowUp(this.fixes[idx]!, message);
    this.fixes[idx] = updatedFix;
    this.emit({ type: 'fix.updated', fix: updatedFix });

    return { fix: structuredClone(updatedFix) };
  }

  async mergeAndVerifyFix(
    fixId: string,
    verifyOptions?: {
      targetBaseUrl?: string;
      aliceToken?: string;
      bobToken?: string;
    },
  ): Promise<{
    fix: FixProposal;
    finding?: FindingRecord;
    overview: OverviewSummary;
    verificationResult?: VerifyFixClosureResult;
  }> {
    const fixIdx = this.fixes.findIndex((fx) => fx.id === fixId);
    if (fixIdx < 0) {
      throw new Error(`FixProposal not found: ${fixId}`);
    }

    const currentFix = this.fixes[fixIdx]!;
    if (currentFix.status === 'suppressed') {
      throw new Error(`Cannot merge suppressed FixProposal ${fixId}`);
    }

    const nowIso = new Date().toISOString();
    const mergedFix: FixProposal = {
      ...currentFix,
      status: 'merged',
      updatedAt: nowIso,
    };
    this.fixes[fixIdx] = mergedFix;
    this.emit({ type: 'fix.updated', fix: mergedFix });

    let primaryUpdatedFinding: FindingRecord | undefined;
    let lastVerification: VerifyFixClosureResult | undefined;

    for (let i = 0; i < this.findings.length; i += 1) {
      const f = this.findings[i]!;
      if (!mergedFix.findingIds.includes(f.id) && f.fixId !== mergedFix.id) {
        continue;
      }

      const verifyingFinding = FindingRecordSchema.parse({
        ...f,
        fixVerification: 'verifying',
        updatedAt: nowIso,
      });
      this.findings[i] = verifyingFinding;
      this.emit({ type: 'finding.updated', finding: verifyingFinding });

      const closure = await this.redTeam.verifyFixClosure({
        finding: verifyingFinding,
        fix: mergedFix,
        targetBaseUrl: verifyOptions?.targetBaseUrl,
        aliceToken: verifyOptions?.aliceToken,
        bobToken: verifyOptions?.bobToken,
      });
      lastVerification = closure;

      const closedFinding = FindingRecordSchema.parse({
        ...verifyingFinding,
        status: closure.verified ? 'fixed' : 'in_progress',
        fixVerification: closure.status,
        fixId: mergedFix.id,
        updatedAt: new Date().toISOString(),
      });
      this.findings[i] = closedFinding;
      if (!primaryUpdatedFinding) {
        primaryUpdatedFinding = closedFinding;
      }
      this.emit({ type: 'finding.updated', finding: closedFinding });
    }

    this.auditLedger.append({
      subsystem: 'orchestrator',
      action: 'fix.merged_and_verified',
      entityId: mergedFix.id,
      actor: 'nightfall-orchestrator',
      summary: `Merged ${mergedFix.id} and ran targeted Red Team closure check (${lastVerification?.status ?? 'verified'}).`,
      metadata: {
        findingIds: mergedFix.findingIds,
        verificationStatus: lastVerification?.status ?? 'verified',
      },
    });

    return {
      fix: structuredClone(mergedFix),
      finding: primaryUpdatedFinding ? structuredClone(primaryUpdatedFinding) : undefined,
      overview: this.computeOverview(),
      verificationResult: lastVerification,
    };
  }

  toggleRepositoryScans(repoId: string): {
    repository: RepositoryRecord;
    repositories: RepositoryRecord[];
  } {
    const idx = this.repositories.findIndex((r) => r.id === repoId);
    if (idx < 0) {
      throw new Error(`Repository not found: ${repoId}`);
    }
    const current = this.repositories[idx]!;
    const nextEnabled = !current.prReviewsEnabled;

    const updated: RepositoryRecord = {
      ...current,
      prReviewsEnabled: nextEnabled,
      scheduledScanLabel: nextEnabled ? 'Daily at 8:00 AM UTC' : null,
      lastCompletedScanLabel: nextEnabled ? 'Scheduled' : 'Paused',
      needsAttention: !nextEnabled || current.openFindingsCount > 25,
    };
    this.repositories[idx] = updated;

    this.auditLedger.append({
      subsystem: 'orchestrator',
      action: 'repository.coverage.toggled',
      entityId: updated.id,
      actor: 'security-operator',
      summary: `${nextEnabled ? 'Enabled' : 'Paused'} PR reviews and scheduled scans for ${updated.fullName}.`,
      metadata: { prReviewsEnabled: nextEnabled },
    });

    return {
      repository: structuredClone(updated),
      repositories: structuredClone(this.repositories),
    };
  }

  prepareCampaign(input: PrepareCampaignInput): { campaign: RedTeamCampaignRun } {
    const campaign = this.redTeam.prepareCampaignFromPrompt(input);
    this.campaigns.unshift(campaign);
    this.emit({ type: 'campaign.updated', campaign });
    return { campaign: structuredClone(campaign) };
  }

  launchCampaign(campaignId: string, yamlText?: string): { campaign: RedTeamCampaignRun } {
    const idx = this.campaigns.findIndex((c) => c.id === campaignId);
    if (idx < 0) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const current = this.campaigns[idx]!;
    const effectiveYaml = yamlText?.trim() ? yamlText : current.yamlText;
    const parsedManifest = parseCampaignYaml(effectiveYaml);

    if (this.policyGate.isKillSwitchEngaged()) {
      const halted = RedTeamCampaignRunSchema.parse({
        ...current,
        yamlText: effectiveYaml,
        status: 'halted',
        headlineStatus: 'Halted by emergency kill-switch',
        headlineDetail: 'Reset the PolicyGate kill-switch before launching campaigns.',
        updatedLabel: 'Halted just now',
      });
      this.campaigns[idx] = halted;
      this.emit({ type: 'campaign.updated', campaign: halted });
      return { campaign: structuredClone(halted) };
    }

    const safety = this.auditLedger.getSafetyMonitorStatus();
    const launched = RedTeamCampaignRunSchema.parse({
      ...current,
      name: parsedManifest.campaign.name,
      objective: parsedManifest.objective,
      targetUrl: parsedManifest.campaign.targets[0] ?? current.targetUrl,
      yamlText: effectiveYaml,
      status: 'running',
      startedAt: new Date().toISOString(),
      updatedLabel: 'Updated just now',
      headlineStatus: 'Verification agents active in staging scope',
      headlineDetail: `Executing bounded checks against ${parsedManifest.campaign.targets[0]} (max ${parsedManifest.campaign.max_requests_per_second} RPS).`,
      safetyMonitorText: safety.message,
      withinApprovedScope: safety.withinApprovedScope,
      endpoints:
        current.endpoints.length > 0
          ? current.endpoints
          : [
              { method: 'GET', path: '/api/me', hits: 2, authScope: 'alice, bob' },
              { method: 'GET', path: '/ws/documents', hits: 1, authScope: 'anonymous, alice' },
            ],
      activitySeries:
        current.activitySeries.length > 0
          ? current.activitySeries
          : [
              {
                timestamp: new Date().toISOString().slice(11, 16),
                requestsCount: 3,
                findingConfirmedTick: false,
              },
            ],
    });

    this.campaigns[idx] = launched;
    this.auditLedger.append({
      subsystem: 'red-team',
      action: 'campaign.launched',
      entityId: launched.id,
      actor: 'security-operator',
      summary: `Launched Red Team campaign "${launched.name}" against ${launched.targetUrl}.`,
      metadata: { maxRps: parsedManifest.campaign.max_requests_per_second },
    });

    this.emit({ type: 'campaign.updated', campaign: launched });

    if (this.enableLiveSimulationTimers) {
      this.startCampaignTicker(launched.id);
    }

    return { campaign: structuredClone(launched) };
  }

  stepCampaignSimulation(campaignId: string): RedTeamCampaignRun | null {
    const idx = this.campaigns.findIndex((c) => c.id === campaignId);
    if (idx < 0) return null;
    const current = this.campaigns[idx]!;

    if (this.policyGate.isKillSwitchEngaged()) {
      this.stopCampaignTicker(campaignId);
      const halted = RedTeamCampaignRunSchema.parse({
        ...current,
        status: 'halted',
        headlineStatus: 'Halted by emergency kill-switch',
        updatedLabel: 'Halted just now',
      });
      this.campaigns[idx] = halted;
      this.emit({ type: 'campaign.updated', campaign: halted });
      return structuredClone(halted);
    }

    if (current.status !== 'running') {
      return structuredClone(current);
    }

    const pendingHitl = this.policyGate
      .listApprovals('pending')
      .find((a) => a.campaignId === campaignId);

    const updatedEndpoints = current.endpoints.map((ep, epIdx) => ({
      ...ep,
      hits: ep.hits + (epIdx === 0 ? 3 : epIdx === 1 ? 2 : 1),
    }));

    const timeLabel = new Date().toISOString().slice(11, 19);
    const nextSeries = [
      ...current.activitySeries.slice(-47),
      {
        timestamp: timeLabel,
        requestsCount: 8 + (current.elapsedSeconds % 11),
        findingConfirmedTick: false,
      },
    ];

    const safety = this.auditLedger.getSafetyMonitorStatus();
    const nextElapsed = current.elapsedSeconds + 2;
    const nextBudget = Math.max(5, Number((current.budgetRemainingPct - 0.5).toFixed(1)));

    let nextStatus: RedTeamCampaignRun['status'] = 'running';
    let headlineStatus = current.headlineStatus;
    if (current.askForApproval && pendingHitl && nextElapsed >= 6 && current.id !== 'camp-northstar-staging') {
      nextStatus = 'paused_hitl';
      headlineStatus = 'Paused awaiting operator approval';
      this.stopCampaignTicker(campaignId);
    }

    const stepped = RedTeamCampaignRunSchema.parse({
      ...current,
      status: nextStatus,
      elapsedSeconds: nextElapsed,
      budgetRemainingPct: nextBudget,
      updatedLabel: 'Updated just now',
      headlineStatus,
      safetyMonitorText: safety.message,
      withinApprovedScope: safety.withinApprovedScope,
      endpoints: updatedEndpoints,
      activitySeries: nextSeries,
    });

    this.campaigns[idx] = stepped;
    this.emit({ type: 'campaign.updated', campaign: stepped });
    return structuredClone(stepped);
  }

  private startCampaignTicker(campaignId: string): void {
    this.stopCampaignTicker(campaignId);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      const updated = this.stepCampaignSimulation(campaignId);
      if (!updated || updated.status !== 'running' || ticks >= 25) {
        this.stopCampaignTicker(campaignId);
      }
    }, this.simulationIntervalMs);
    timer.unref?.();
    this.campaignTimers.set(campaignId, timer);
  }

  private stopCampaignTicker(campaignId: string): void {
    const existing = this.campaignTimers.get(campaignId);
    if (existing) {
      clearInterval(existing);
      this.campaignTimers.delete(campaignId);
    }
  }

  resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
  ): { approval: HitlApprovalRequest; campaign?: RedTeamCampaignRun } {
    const resolved = this.policyGate.resolveApproval(approvalId, decision, 'security-operator');
    this.emit({ type: 'hitl.updated', approval: resolved });

    this.auditLedger.append({
      subsystem: 'policy-gate',
      action: `hitl.${decision}`,
      entityId: resolved.id,
      actor: 'security-operator',
      summary: `Operator ${decision} HITL request ${resolved.id} for ${resolved.targetEndpoint}.`,
      metadata: { campaignId: resolved.campaignId, workItemId: resolved.workItemId },
    });

    const campIdx = this.campaigns.findIndex((c) => c.id === resolved.campaignId);
    let updatedCampaign: RedTeamCampaignRun | undefined;
    if (campIdx >= 0) {
      const current = this.campaigns[campIdx]!;
      const updatedQueue = current.workQueue.map((item) => {
        if (item.id !== resolved.workItemId) return item;
        return {
          ...item,
          status:
            decision === 'approved' ? ('confirmed' as const) : ('falsified' as const),
          outcomeNote:
            decision === 'approved'
              ? 'Approved by human operator; state-mutating boundary verified.'
              : 'Rejected by human operator; probe skipped cleanly.',
          updatedAt: new Date().toISOString(),
        };
      });

      updatedCampaign = RedTeamCampaignRunSchema.parse({
        ...current,
        status: current.status === 'paused_hitl' ? 'running' : current.status,
        headlineStatus:
          decision === 'approved'
            ? 'HITL action approved — campaign active'
            : 'HITL action rejected — probe skipped',
        workQueue: updatedQueue,
        updatedLabel: 'Updated just now',
      });
      this.campaigns[campIdx] = updatedCampaign;
      this.emit({ type: 'campaign.updated', campaign: updatedCampaign });
    }

    return {
      approval: structuredClone(resolved),
      campaign: updatedCampaign ? structuredClone(updatedCampaign) : undefined,
    };
  }

  private haltRunningCampaigns(reason: string): void {
    for (const id of this.campaignTimers.keys()) {
      this.stopCampaignTicker(id);
    }

    for (let i = 0; i < this.campaigns.length; i += 1) {
      const c = this.campaigns[i]!;
      if (c.status === 'running' || c.status === 'paused_hitl') {
        const halted = RedTeamCampaignRunSchema.parse({
          ...c,
          status: 'halted',
          headlineStatus: 'Halted by emergency kill-switch',
          headlineDetail: reason,
          updatedLabel: 'Halted immediately',
        });
        this.campaigns[i] = halted;
        this.emit({ type: 'campaign.updated', campaign: halted });
      }
    }
  }

  setKillSwitch(
    engaged: boolean,
    reason = 'Manual operator kill-switch triggered',
  ): { engaged: boolean; safetyMonitor: SafetyMonitorStatus } {
    const nowIso = new Date().toISOString();
    if (engaged) {
      this.policyGate.engageKillSwitch(reason);
      this.auditLedger.append({
        subsystem: 'policy-gate',
        action: 'safety.kill_switch.engaged',
        entityId: 'global-kill-switch',
        actor: 'security-operator',
        summary: `Emergency kill-switch engaged: ${reason}`,
      });
    } else {
      this.policyGate.resetKillSwitch();
      this.auditLedger.append({
        subsystem: 'policy-gate',
        action: 'safety.kill_switch.reset',
        entityId: 'global-kill-switch',
        actor: 'security-operator',
        summary: 'Emergency kill-switch reset by operator.',
      });
    }

    this.emit({
      type: 'safety.kill_switch',
      engaged: this.policyGate.isKillSwitchEngaged(),
      reason: engaged ? reason : 'Kill-switch reset',
      timestamp: nowIso,
    });

    return {
      engaged: this.policyGate.isKillSwitchEngaged(),
      safetyMonitor: this.auditLedger.getSafetyMonitorStatus(),
    };
  }

  ingestAssessmentResult(result: AssessmentRunResult): {
    findings: FindingRecord[];
    evidenceBundles: EvidenceBundle[];
    overview: OverviewSummary;
  } {
    for (const ev of result.evidenceBundles) {
      const existingEvIdx = this.evidenceBundles.findIndex((item) => item.id === ev.id);
      if (existingEvIdx >= 0) {
        this.evidenceBundles[existingEvIdx] = ev;
      } else {
        this.evidenceBundles.unshift(ev);
      }
      this.emit({ type: 'evidence.recorded', evidence: ev });
    }

    const ingestedFindings: FindingRecord[] = [];
    for (const f of result.confirmedFindings) {
      const existingIdx = this.findings.findIndex((item) => item.id === f.id);
      if (existingIdx >= 0) {
        const merged = FindingRecordSchema.parse({
          ...this.findings[existingIdx]!,
          ...f,
          fixId: this.findings[existingIdx]!.fixId ?? f.fixId,
        });
        this.findings[existingIdx] = merged;
        ingestedFindings.push(merged);
        this.emit({ type: 'finding.updated', finding: merged });
      } else {
        this.findings.unshift(f);
        ingestedFindings.push(f);
        this.emit({ type: 'finding.updated', finding: f });
      }
    }

    this.auditLedger.append({
      subsystem: 'orchestrator',
      action: 'assessment.ingested',
      entityId: result.campaignId,
      actor: 'nightfall-orchestrator',
      summary: `Ingested ${ingestedFindings.length} confirmed finding(s) and ${result.evidenceBundles.length} evidence bundle(s) from campaign ${result.campaignId}.`,
      metadata: {
        findingIds: ingestedFindings.map((f) => f.id),
      },
    });

    return {
      findings: structuredClone(ingestedFindings),
      evidenceBundles: structuredClone(result.evidenceBundles),
      overview: this.computeOverview(),
    };
  }

  dispose(): void {
    for (const id of this.campaignTimers.keys()) {
      this.stopCampaignTicker(id);
    }
  }
}
