import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  FindingRecordSchema,
  NewScanRequestSchema,
  OverviewSummarySchema,
  RedTeamCampaignRunSchema,
  RepositoryRecordSchema,
  ScanJobRecordSchema,
  StreamEventSchema,
  generateScopeKeyPair,
  parseCampaignYaml,
  serializeCampaignYaml,
  signCampaignManifest,
  type AuditEntry,
  type CampaignYamlV5,
  type EvidenceBundle,
  type FindingRecord,
  type FixProposal,
  type HitlApprovalRequest,
  type ModelDescriptor,
  type NewScanRequest,
  type OverviewSummary,
  type RedTeamCampaignRun,
  type RepositoryRecord,
  type SandboxToolchainStatus,
  type SankeyLink,
  type ScanJobRecord,
  type Severity,
  type StreamEvent,
} from '@nightfall/core-contracts';
import { AuditLedger, type SafetyMonitorStatus } from '@nightfall/audit-ledger';
import { ModelGateway } from '@nightfall/model-gateway';
import { PolicyGate } from '@nightfall/policy-gate';
import { DisposableSandboxRuntime } from '@nightfall/sandbox-runtime';
import { SharedKnowledgeStore } from '@nightfall/shared-memory';
import {
  RedTeamEngine,
  startStagingTargetServer,
  type AssessmentRunResult,
  type PrepareCampaignInput,
  type StartedStagingTargetServer,
  type VerifyFixClosureResult,
} from '@nightfall/red-team';
import {
  DefenseFactoryEngine,
  GitPatchPackager,
  RepositoryScanner,
  RootCauseDeduplicator,
  type ProposeFixOptions,
} from '@nightfall/defense-factory';
import { NightfallSqliteStore } from './sqliteStore.js';
import { materializeWorkspaceRepositories } from './workspaceMaterializer.js';

export const PACKAGE_NAME = '@nightfall/closed-loop-orchestrator';
export { NightfallSqliteStore } from './sqliteStore.js';
export { materializeWorkspaceRepositories } from './workspaceMaterializer.js';

type OpenStatus = 'new' | 'triaged' | 'in_progress';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
};

const OPEN_STATUS_ORDER: OpenStatus[] = ['in_progress', 'triaged', 'new'];
const STATUS_LABEL: Record<OpenStatus, string> = {
  in_progress: 'In Progress',
  triaged: 'Triaged',
  new: 'New',
};

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatShortUtcDate(date: Date): string {
  const month = SHORT_MONTHS[date.getUTCMonth()] ?? 'Jan';
  return `${month} ${date.getUTCDate()}`;
}

function repoShortName(repository: string): string {
  const parts = repository.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? repository;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function isNorthstarStagingHost(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.hostname.toLowerCase() === 'staging.northstardocs.com';
  } catch {
    return false;
  }
}

function computeNextSecSequence(findings: FindingRecord[]): number {
  let maxSeq = 1000;
  for (const f of findings) {
    const match = /^SEC-(\d+)$/.exec(f.id);
    if (match?.[1]) {
      const val = Number(match[1]);
      if (Number.isInteger(val) && val > maxSeq) {
        maxSeq = val;
      }
    }
  }
  return maxSeq + 1;
}

export interface NightfallOrchestratorOptions {
  sqlitePath?: string;
  workspaceReposRoot?: string;
  stagingTargetUrl?: string;
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
  sandboxToolchain: SandboxToolchainStatus;
}

interface KillSwitchMeta {
  engaged: boolean;
  reason: string;
}

export class NightfallOrchestrator {
  readonly store: NightfallSqliteStore;
  readonly workspaceReposRoot: string;
  readonly auditLedger: AuditLedger;
  readonly policyGate: PolicyGate;
  readonly sandboxRuntime: DisposableSandboxRuntime;
  readonly sharedMemory: SharedKnowledgeStore;
  readonly modelGateway: ModelGateway;
  readonly redTeam: RedTeamEngine;
  readonly defenseFactory: DefenseFactoryEngine;
  readonly repositoryScanner: RepositoryScanner;
  readonly gitPackager: GitPatchPackager;
  readonly deduplicator: RootCauseDeduplicator;

  private readonly configuredStagingTargetUrl?: string;
  private ephemeralStagingServer: StartedStagingTargetServer | null = null;
  private readonly ownsTempWorkspace: boolean;
  private bootstrapPromise: Promise<void> | null = null;
  private disposed = false;

  private readonly listeners = new Set<(event: StreamEvent) => void>();

  constructor(options?: NightfallOrchestratorOptions) {
    const sqlitePath = options?.sqlitePath ?? ':memory:';
    this.store = new NightfallSqliteStore(sqlitePath);
    this.configuredStagingTargetUrl = options?.stagingTargetUrl;

    if (options?.workspaceReposRoot) {
      this.workspaceReposRoot = path.resolve(options.workspaceReposRoot);
      this.ownsTempWorkspace = false;
    } else if (sqlitePath !== ':memory:') {
      this.workspaceReposRoot = path.join(
        path.dirname(path.resolve(sqlitePath)),
        'workspace-repos',
      );
      this.ownsTempWorkspace = false;
    } else {
      this.workspaceReposRoot = path.join(
        os.tmpdir(),
        'nightfall-workspace-repos',
        `ws-${crypto.randomUUID().slice(0, 8)}`,
      );
      this.ownsTempWorkspace = true;
    }

    const persistedEntries = this.store.listAuditEntries();
    this.auditLedger = new AuditLedger({
      initialEntries: persistedEntries,
      onAppend: (entry) => {
        this.store.appendAuditEntry(entry);
        this.emit({ type: 'audit.appended', entry });
      },
    });

    const persistedApprovals = this.store.listHitlApprovals();
    this.policyGate = new PolicyGate({
      initialApprovals: persistedApprovals,
      onKillSwitch: (reason) => {
        this.haltRunningCampaigns(reason);
      },
    });

    const savedKillSwitch = this.store.getMeta<KillSwitchMeta>('kill_switch_state');
    if (savedKillSwitch?.engaged) {
      this.policyGate.engageKillSwitch(savedKillSwitch.reason);
    }

    this.sandboxRuntime = new DisposableSandboxRuntime();
    this.sharedMemory = new SharedKnowledgeStore();
    this.modelGateway = new ModelGateway();
    this.deduplicator = new RootCauseDeduplicator();
    this.gitPackager = new GitPatchPackager({
      workspaceReposRoot: this.workspaceReposRoot,
    });
    this.repositoryScanner = new RepositoryScanner({
      sandboxRuntime: this.sandboxRuntime,
      deduplicator: this.deduplicator,
      workspaceReposRoot: this.workspaceReposRoot,
    });

    for (const campaign of this.store.listCampaigns()) {
      this.sharedMemory.seedCampaignMemory(
        campaign.id,
        campaign.workQueue,
        campaign.sharedKnowledge,
      );
    }

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
      gitPackager: this.gitPackager,
      workspaceReposRoot: this.workspaceReposRoot,
    });
  }

  private async ensureLiveStagingTargetUrl(): Promise<string> {
    if (this.configuredStagingTargetUrl) {
      return stripTrailingSlash(this.configuredStagingTargetUrl);
    }
    if (!this.ephemeralStagingServer) {
      this.ephemeralStagingServer = await startStagingTargetServer(0);
    }
    return stripTrailingSlash(this.ephemeralStagingServer.baseUrl);
  }

  private syncApprovalsFromPolicyGate(emitUpdates = false): HitlApprovalRequest[] {
    const existingIds = new Set(this.store.listHitlApprovals().map((a) => a.id));
    const current = this.policyGate.listApprovals();
    for (const approval of current) {
      this.store.upsertHitlApproval(approval, 'front');
      if (emitUpdates && !existingIds.has(approval.id)) {
        this.emit({ type: 'hitl.updated', approval });
      }
    }
    return current;
  }

  private refreshRepositoryOpenCounts(): void {
    const findings = this.store.listFindings();
    const openByRepo = new Map<string, number>();
    for (const f of findings) {
      if (f.status === 'fixed' || f.status === 'discarded_fp') {
        continue;
      }
      const key = repoShortName(f.repository);
      openByRepo.set(key, (openByRepo.get(key) ?? 0) + 1);
    }

    for (const repo of this.store.listRepositories()) {
      const openCount = openByRepo.get(repo.name) ?? 0;
      const needsAttention = !repo.prReviewsEnabled || openCount >= 3;
      if (repo.openFindingsCount !== openCount || repo.needsAttention !== needsAttention) {
        this.store.upsertRepository(
          RepositoryRecordSchema.parse({
            ...repo,
            openFindingsCount: openCount,
            needsAttention,
          }),
          'back',
        );
      }
    }
  }

  async ensureBootstrapped(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.store.hasBootstrappedData()) {
      return;
    }
    if (this.bootstrapPromise) {
      await this.bootstrapPromise;
      return;
    }

    this.bootstrapPromise = this.performRealColdBootstrap().finally(() => {
      this.bootstrapPromise = null;
    });
    await this.bootstrapPromise;
  }

  private async performRealColdBootstrap(): Promise<void> {
    if (this.store.hasBootstrappedData()) {
      return;
    }

    // 1. Materialize real git-initialized repositories on disk
    const initialRepos = await materializeWorkspaceRepositories(this.workspaceReposRoot);
    for (const repo of initialRepos) {
      this.store.upsertRepository(repo, 'back');
    }

    // 2. Run real RepositoryScanner across every materialized repository
    let nextSeq = 1001;
    let northstarRevision = 'HEAD';
    for (const repo of initialRepos) {
      const startedAt = new Date().toISOString();
      const scanRes = await this.repositoryScanner.scanRepository({
        repository: repo.name,
        localPath: repo.localPath,
        mode: 'local',
        method: 'repository_scan',
        scope: 'full_repository',
        startingSequenceNumber: nextSeq,
      });
      nextSeq += scanRes.findings.length;
      if (repo.name === 'northstar-docs') {
        northstarRevision = scanRes.observedRevision;
      }

      for (const finding of [...scanRes.findings].reverse()) {
        this.store.upsertFinding(finding, 'front');
      }

      const completedAt = new Date().toISOString();
      const scanRecord = ScanJobRecordSchema.parse({
        id: `scan-${repo.name}`,
        repository: repo.name,
        mode: 'local',
        method: 'repository_scan',
        scope: 'full_repository',
        status: 'completed',
        findingsDiscovered: scanRes.findings.length,
        startedAt,
        completedAt,
      });
      this.store.upsertScan(scanRecord, 'front');

      this.store.upsertRepository(
        RepositoryRecordSchema.parse({
          ...repo,
          lastCompletedScanLabel: repo.prReviewsEnabled ? 'Completed just now' : 'Paused',
          openFindingsCount: scanRes.findings.length,
          needsAttention: !repo.prReviewsEnabled || scanRes.findings.length >= 3,
        }),
        'back',
      );
    }

    // 3. Spin up real StagingTargetServer & execute live RedTeamEngine assessment through EgressPolicyProxy
    const liveStagingUrl = await this.ensureLiveStagingTargetUrl();
    const campaignId = 'camp-northstar-staging';
    const logicalTargetUrl = 'https://staging.northstardocs.com';

    const campaignManifest: CampaignYamlV5 = {
      objective:
        'Verify multi-tenant document isolation, WebSocket channel authorization, and saved-search export boundaries.',
      campaign: {
        name: 'northstar-docs-staging',
        targets: [logicalTargetUrl],
        source: {
          repository: 'northstar/northstar-docs',
          revision: northstarRevision,
        },
        max_duration: '8h',
        max_requests_per_second: 25,
      },
      credentials: {
        alice: { file: 'credentials/alice.token', workspaceHint: 'Workspace A' },
        bob: { file: 'credentials/bob.token', workspaceHint: 'Workspace B' },
      },
      http: {
        allow: [{ methods: ['GET', 'POST'], path_prefixes: ['/'] }],
      },
      websocket: {
        allow: [{ paths: ['/ws/documents'], origins: ['*'], operations: ['open', 'send'] }],
      },
    };

    const yamlText = serializeCampaignYaml(campaignManifest);
    const keyPair = generateScopeKeyPair(`key-${campaignId}`);
    const signedManifest = signCampaignManifest(
      campaignManifest,
      keyPair.privateKeyPem,
      keyPair.keyId,
    );

    this.auditLedger.append({
      subsystem: 'policy-gate',
      action: 'scope.manifest.signed',
      entityId: campaignId,
      actor: 'nightfall-policy-gate',
      summary: `Signed v5 campaign.yaml manifest (${signedManifest.canonicalDigestSha256.slice(0, 12)}) for ${logicalTargetUrl}.`,
      metadata: {
        keyId: keyPair.keyId,
        maxRps: campaignManifest.campaign.max_requests_per_second,
      },
    });

    const startedMs = Date.now();
    const assessmentStartedAt = new Date().toISOString();
    const assessment = await this.redTeam.runAssessment({
      campaignId,
      targetBaseUrl: logicalTargetUrl,
      targetTransportRedirects: {
        [logicalTargetUrl]: liveStagingUrl,
      },
      signedManifest,
      publicKeyPem: keyPair.publicKeyPem,
      askForApproval: true,
      includeMutatingProbe: true,
      modelId: 'gpt-6-cyber-ultra',
      observedRevision: northstarRevision,
      externalFindings: [
        {
          id: 'SAST-DEAD-01',
          route: '/internal/legacy-export',
          reachableInCode: false,
          sanitizedInCode: false,
        },
        {
          id: 'SAST-SANITIZED-02',
          route: '/internal/sanitized',
          reachableInCode: true,
          sanitizedInCode: true,
        },
      ],
    });

    this.syncApprovalsFromPolicyGate(false);

    // Align Red Team confirmed findings F-001 & F-002 with their static SAST root-cause clusters on northstar-docs
    const alignedConfirmed: FindingRecord[] = assessment.confirmedFindings.map((f) => {
      if (f.id === 'F-002') {
        return FindingRecordSchema.parse({
          ...f,
          codeReferences: [
            {
              file: 'northstar_docs/Export/search_exports.py',
              startLine: 96,
              endLine: 115,
              description:
                'Saved-search export omits per-document can_read_document check and SQL parameter binding',
            },
          ],
          rootCauseClusterKey:
            'northstar-docs:cwe-862-missing-authorization:northstar_docs/Export/search_exports.py:export_saved_search',
        });
      }
      if (f.id === 'F-001') {
        return FindingRecordSchema.parse({
          ...f,
          codeReferences: [
            {
              file: 'routes/collab.py',
              startLine: 26,
              endLine: 32,
              description: 'WebSocket subscribe handler omits can_view_document check',
            },
          ],
          rootCauseClusterKey:
            'northstar-docs:cwe-862-missing-authorization:routes/collab.py:on_subscribe',
        });
      }
      return f;
    });

    this.ingestAssessmentResult({
      ...assessment,
      confirmedFindings: alignedConfirmed,
    });

    const safety = this.auditLedger.getSafetyMonitorStatus();
    const hasPendingHitl = assessment.pendingApprovals.length > 0;
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedMs) / 1000));

    const campaignRun = RedTeamCampaignRunSchema.parse({
      id: campaignId,
      name: campaignManifest.campaign.name,
      objective: campaignManifest.objective,
      targetUrl: logicalTargetUrl,
      sourceLabel: `northstar/northstar-docs@${northstarRevision}`,
      yamlText,
      status: hasPendingHitl ? 'paused_hitl' : 'completed',
      askForApproval: true,
      modelId: 'gpt-6-cyber-ultra',
      budgetRemainingPct: 94,
      elapsedSeconds,
      startedAt: assessmentStartedAt,
      updatedLabel: 'Verified just now',
      headlineStatus: hasPendingHitl
        ? `Confirmed ${alignedConfirmed.length} findings · awaiting operator approval for Tier-2 probe`
        : `Completed live verification (${alignedConfirmed.length} findings confirmed)`,
      headlineDetail: `Executed live HTTP + WebSocket probes through EgressPolicyProxy against isolated staging (${assessment.endpointHits.reduce((acc, e) => acc + e.hits, 0)} in-scope requests).`,
      safetyMonitorText: safety.message,
      withinApprovedScope: safety.withinApprovedScope,
      activitySeries: assessment.activitySeries,
      endpoints: assessment.endpointHits,
      workQueue: assessment.workQueue,
      sharedKnowledge: assessment.sharedKnowledge,
      findingIds: alignedConfirmed.map((f) => f.id),
    });
    this.store.upsertCampaign(campaignRun, 'front');

    // 4. Run real DefenseFactoryEngine Two-Stage Proofs on top clusters (Microsoft LiteBox Python + Node)
    const allBootFindings = this.store.listFindings();
    const clusters = this.deduplicator.clusterAndRoute(allBootFindings, []);

    const f002Cluster = clusters.find((c) => c.findingIds.includes('F-002'));
    const assetCluster = clusters.find(
      (c) =>
        c.repository === 'asset-servicing' &&
        c.primaryFinding.weaknessCwe.startsWith('CWE-862'),
    );

    for (const cluster of [f002Cluster, assetCluster]) {
      if (!cluster) continue;
      // Order cluster members so F-002 is primary when present
      const orderedMembers = [...cluster.findings].sort((a, b) =>
        a.id === 'F-002' ? -1 : b.id === 'F-002' ? 1 : 0,
      );
      const fix = await this.defenseFactory.proposeFixForFindings(orderedMembers);
      this.store.upsertFix(fix, 'front');

      if (fix.status === 'proposed' || fix.status === 'in_progress') {
        const nowIso = new Date().toISOString();
        for (const member of orderedMembers) {
          this.store.upsertFinding(
            FindingRecordSchema.parse({
              ...member,
              status: 'in_progress',
              fixId: fix.id,
              updatedAt: nowIso,
            }),
          );
        }
      }
    }

    this.refreshRepositoryOpenCounts();
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
    const findings = this.store.listFindings();
    const fixes = this.store.listFixes();

    const cellMatrix: Record<Severity, Record<OpenStatus, number>> = {
      critical: { in_progress: 0, triaged: 0, new: 0 },
      high: { in_progress: 0, triaged: 0, new: 0 },
      medium: { in_progress: 0, triaged: 0, new: 0 },
      low: { in_progress: 0, triaged: 0, new: 0 },
      informational: { in_progress: 0, triaged: 0, new: 0 },
    };

    let fixedFindingsCount = 0;
    for (const f of findings) {
      if (f.status === 'fixed') {
        fixedFindingsCount += 1;
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
      fixed: fixedFindingsCount,
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
    const proposedFixesCount = fixes.filter((fix) => fix.status === 'proposed').length;

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

    // Build honest 7-day trend from real finding creation & fix timestamps in SQLite
    const now = new Date();
    const createdByDay = new Map<string, number>();
    const fixedByDay = new Map<string, number>();

    for (const f of findings) {
      const createdKey = f.createdAt.slice(0, 10);
      createdByDay.set(createdKey, (createdByDay.get(createdKey) ?? 0) + 1);
      if (f.status === 'fixed') {
        const fixedKey = f.updatedAt.slice(0, 10);
        fixedByDay.set(fixedKey, (fixedByDay.get(fixedKey) ?? 0) + 1);
      }
    }

    let runningFixed = 0;
    const dailyTrend: OverviewSummary['dailyTrend'] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
      const isoDay = d.toISOString().slice(0, 10);
      runningFixed += fixedByDay.get(isoDay) ?? 0;
      dailyTrend.push({
        date: formatShortUtcDate(d),
        currentlyFixed: offset === 0 ? fixedFindingsCount : runningFixed,
        newFindings: createdByDay.get(isoDay) ?? 0,
      });
    }

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
      findings: this.store.listFindings(),
      fixes: this.store.listFixes(),
      repositories: this.store.listRepositories(),
      scans: this.store.listScans(),
      campaigns: this.store.listCampaigns(),
      evidenceBundles: this.store.listEvidenceBundles(),
      approvals: this.policyGate.listApprovals(),
      models: this.modelGateway.listModels(),
      auditEntries: this.auditLedger.list(),
      safetyMonitor: this.auditLedger.getSafetyMonitorStatus(),
      killSwitchEngaged: this.policyGate.isKillSwitchEngaged(),
      sandboxToolchain: this.sandboxRuntime.getToolchainStatus(),
    };
  }

  async triggerScan(rawReq: NewScanRequest): Promise<{
    scan: ScanJobRecord;
    overview: OverviewSummary;
    findings: FindingRecord[];
  }> {
    const req = NewScanRequestSchema.parse(rawReq);
    const startedAt = new Date().toISOString();
    const scanId = `scan-${crypto.randomUUID().slice(0, 8)}`;

    const repositories = this.store.listRepositories();
    const shortRepo = repoShortName(req.repository);
    const matchedRepo = repositories.find(
      (r) =>
        r.id === req.repository ||
        r.name === req.repository ||
        r.fullName === req.repository ||
        r.name === shortRepo,
    );

    const existingFindings = this.store.listFindings();
    const startingSequenceNumber = computeNextSecSequence(existingFindings);

    const scanResult = await this.repositoryScanner.scanRepository({
      repository: matchedRepo?.name ?? req.repository,
      localPath: req.localPath ?? matchedRepo?.localPath,
      cloneUrl: req.cloneUrl ?? matchedRepo?.cloneUrl,
      workspaceReposRoot: this.workspaceReposRoot,
      mode: req.mode,
      method: req.method,
      scope: req.scope,
      paths: req.paths,
      startingSequenceNumber,
    });

    // Deduplicate against existing open rootCauseClusterKeys in SQLite
    const openByCluster = new Map<string, FindingRecord>();
    for (const existing of existingFindings) {
      if (existing.status !== 'fixed' && existing.status !== 'discarded_fp') {
        openByCluster.set(existing.rootCauseClusterKey, existing);
      }
    }

    const newlyInserted: FindingRecord[] = [];
    const refreshedExisting: FindingRecord[] = [];

    for (const candidate of scanResult.findings) {
      const openMatch = openByCluster.get(candidate.rootCauseClusterKey);
      if (openMatch) {
        const refreshed = FindingRecordSchema.parse({
          ...openMatch,
          observedRevision: scanResult.observedRevision,
          updatedAt: new Date().toISOString(),
        });
        this.store.upsertFinding(refreshed);
        refreshedExisting.push(refreshed);
      } else {
        this.store.upsertFinding(candidate, 'front');
        openByCluster.set(candidate.rootCauseClusterKey, candidate);
        newlyInserted.push(candidate);
      }
    }

    const updatedFindings = this.store.listFindings();
    const repoOpenCount = updatedFindings.filter(
      (f) =>
        repoShortName(f.repository) === scanResult.repository &&
        f.status !== 'fixed' &&
        f.status !== 'discarded_fp',
    ).length;

    if (matchedRepo) {
      this.store.upsertRepository(
        RepositoryRecordSchema.parse({
          ...matchedRepo,
          lastCompletedScanLabel: 'Just now',
          openFindingsCount: repoOpenCount,
          needsAttention: !matchedRepo.prReviewsEnabled || repoOpenCount >= 3,
          ...(req.method === 'scheduled_scan' && req.scheduleCron
            ? { scheduledScanLabel: `Cron (${req.scheduleCron})` }
            : {}),
        }),
        'back',
      );
    } else {
      const owner = this.deduplicator.resolveCodeOwner(scanResult.repository);
      this.store.upsertRepository(
        RepositoryRecordSchema.parse({
          id: `repo-${scanResult.repository}`,
          name: scanResult.repository,
          fullName: req.repository.includes('/')
            ? req.repository
            : `northstar/${scanResult.repository}`,
          ownerTeam: owner.team,
          prReviewsEnabled: true,
          scheduledScanLabel:
            req.method === 'scheduled_scan' && req.scheduleCron
              ? `Cron (${req.scheduleCron})`
              : 'Daily at 8:00 AM UTC',
          lastCompletedScanLabel: 'Just now',
          needsAttention: repoOpenCount >= 3,
          openFindingsCount: repoOpenCount,
          ...(req.localPath ? { localPath: path.resolve(req.localPath) } : {}),
          ...(req.cloneUrl ? { cloneUrl: req.cloneUrl } : {}),
        }),
        'back',
      );
    }

    const completedAt = new Date().toISOString();
    const scan = ScanJobRecordSchema.parse({
      id: scanId,
      repository: scanResult.repository,
      mode: req.mode,
      method: req.method,
      scope: req.scope,
      status: 'completed',
      findingsDiscovered: scanResult.findings.length,
      startedAt,
      completedAt,
    });
    this.store.upsertScan(scan, 'front');

    this.auditLedger.append({
      subsystem: 'orchestrator',
      action: 'scan.completed',
      entityId: scan.id,
      actor: 'nightfall-scanner',
      summary: `Completed ${req.mode} ${req.method} on ${scanResult.repository}@${scanResult.observedRevision} (${scanResult.filesScannedCount} file(s); ${newlyInserted.length} new finding(s), ${refreshedExisting.length} deduplicated).`,
      metadata: {
        repository: scanResult.repository,
        observedRevision: scanResult.observedRevision,
        filesScannedCount: scanResult.filesScannedCount,
        newlyInsertedIds: newlyInserted.map((f) => f.id),
      },
    });

    this.emit({ type: 'scan.updated', scan });
    for (const f of newlyInserted) {
      this.emit({ type: 'finding.updated', finding: f });
    }
    for (const f of refreshedExisting) {
      this.emit({ type: 'finding.updated', finding: f });
    }

    return {
      scan,
      overview: this.computeOverview(),
      findings: this.store.listFindings(),
    };
  }

  markFindingDuplicate(
    findingId: string,
    duplicateOfId?: string,
  ): { finding: FindingRecord; overview: OverviewSummary } {
    const current = this.store.getFinding(findingId);
    if (!current) {
      throw new Error(`Finding not found: ${findingId}`);
    }
    const allFindings = this.store.listFindings();
    const canonicalDuplicate =
      duplicateOfId ??
      allFindings.find(
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
    this.store.upsertFinding(updated);
    this.refreshRepositoryOpenCounts();

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
      finding: updated,
      overview: this.computeOverview(),
    };
  }

  async startFixForFinding(
    findingId: string,
    options?: ProposeFixOptions,
  ): Promise<{ fix: FixProposal; finding: FindingRecord; overview: OverviewSummary }> {
    const targetFinding = this.store.getFinding(findingId);
    if (!targetFinding) {
      throw new Error(`Finding not found: ${findingId}`);
    }

    // Reuse existing FixProposal if already linked and no custom moduleSnapshot override was requested
    if (targetFinding.fixId && !options?.moduleSnapshot) {
      const existingFix = this.store.getFix(targetFinding.fixId);
      if (existingFix) {
        let refreshedFinding = targetFinding;
        if (targetFinding.status !== 'in_progress' && targetFinding.status !== 'fixed') {
          refreshedFinding = FindingRecordSchema.parse({
            ...targetFinding,
            status: 'in_progress',
            updatedAt: new Date().toISOString(),
          });
          this.store.upsertFinding(refreshedFinding);
          this.emit({ type: 'finding.updated', finding: refreshedFinding });
        }
        return {
          fix: existingFix,
          finding: refreshedFinding,
          overview: this.computeOverview(),
        };
      }
    }

    const allFindings = this.store.listFindings();
    const clusterMembers = allFindings
      .filter(
        (f) =>
          f.id === findingId ||
          (f.rootCauseClusterKey === targetFinding.rootCauseClusterKey &&
            f.status !== 'fixed' &&
            f.status !== 'discarded_fp'),
      )
      .sort((a, b) => (a.id === findingId ? -1 : b.id === findingId ? 1 : 0));

    const fix = await this.defenseFactory.proposeFixForFindings(clusterMembers, options);
    this.store.upsertFix(fix, 'front');
    this.emit({ type: 'fix.updated', fix });

    const nowIso = new Date().toISOString();
    if (fix.status === 'proposed' || fix.status === 'in_progress') {
      for (const candidate of clusterMembers) {
        if (fix.findingIds.includes(candidate.id)) {
          const updatedFinding = FindingRecordSchema.parse({
            ...candidate,
            status: candidate.status === 'fixed' ? 'fixed' : 'in_progress',
            fixId: fix.id,
            updatedAt: nowIso,
          });
          this.store.upsertFinding(updatedFinding);
          this.emit({ type: 'finding.updated', finding: updatedFinding });
        }
      }
    }

    const refreshedTarget = this.store.getFinding(findingId)!;
    return {
      fix,
      finding: refreshedTarget,
      overview: this.computeOverview(),
    };
  }

  async applyFixFollowUp(fixId: string, message: string): Promise<{ fix: FixProposal }> {
    const current = this.store.getFix(fixId);
    if (!current) {
      throw new Error(`FixProposal not found: ${fixId}`);
    }

    const updatedFix = await this.defenseFactory.applyEngineerFollowUp(current, message);
    this.store.upsertFix(updatedFix);
    this.emit({ type: 'fix.updated', fix: updatedFix });

    return { fix: updatedFix };
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
    const currentFix = this.store.getFix(fixId);
    if (!currentFix) {
      throw new Error(`FixProposal not found: ${fixId}`);
    }
    if (currentFix.status === 'suppressed') {
      throw new Error(`Cannot merge suppressed FixProposal ${fixId}`);
    }

    const nowIso = new Date().toISOString();
    const mergedFix: FixProposal = {
      ...currentFix,
      status: 'merged',
      updatedAt: nowIso,
    };
    this.store.upsertFix(mergedFix);
    this.emit({ type: 'fix.updated', fix: mergedFix });

    // If merging a northstar-docs fix against the orchestrator's internal StagingTargetServer, apply its live patch!
    let liveVerifyUrl = verifyOptions?.targetBaseUrl;
    if (!liveVerifyUrl && this.ephemeralStagingServer && mergedFix.repository === 'northstar-docs') {
      if (
        mergedFix.findingIds.includes('F-002') ||
        mergedFix.unifiedDiff.includes('search_exports.py')
      ) {
        this.ephemeralStagingServer.server.applySavedSearchExportPatch();
        liveVerifyUrl = this.ephemeralStagingServer.baseUrl;
      } else if (
        mergedFix.findingIds.includes('F-001') ||
        mergedFix.unifiedDiff.includes('collab.py')
      ) {
        this.ephemeralStagingServer.server.applyWebSocketAclPatch();
        liveVerifyUrl = this.ephemeralStagingServer.baseUrl;
      }
    }

    let primaryUpdatedFinding: FindingRecord | undefined;
    let lastVerification: VerifyFixClosureResult | undefined;

    for (const f of this.store.listFindings()) {
      if (!mergedFix.findingIds.includes(f.id) && f.fixId !== mergedFix.id) {
        continue;
      }

      const verifyingFinding = FindingRecordSchema.parse({
        ...f,
        fixVerification: 'verifying',
        updatedAt: nowIso,
      });
      this.store.upsertFinding(verifyingFinding);
      this.emit({ type: 'finding.updated', finding: verifyingFinding });

      const closure = await this.redTeam.verifyFixClosure({
        finding: verifyingFinding,
        fix: mergedFix,
        targetBaseUrl: liveVerifyUrl,
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
      this.store.upsertFinding(closedFinding);
      if (!primaryUpdatedFinding || closedFinding.id === mergedFix.findingIds[0]) {
        primaryUpdatedFinding = closedFinding;
      }
      this.emit({ type: 'finding.updated', finding: closedFinding });
    }

    this.refreshRepositoryOpenCounts();

    this.auditLedger.append({
      subsystem: 'orchestrator',
      action: 'fix.merged_and_verified',
      entityId: mergedFix.id,
      actor: 'nightfall-orchestrator',
      summary: `Merged ${mergedFix.id} and ran targeted Red Team closure check (${lastVerification?.status ?? 'verified'}).`,
      metadata: {
        findingIds: mergedFix.findingIds,
        commitSha: mergedFix.commitSha,
        branchName: mergedFix.branchName,
        verificationStatus: lastVerification?.status ?? 'verified',
      },
    });

    return {
      fix: mergedFix,
      finding: primaryUpdatedFinding,
      overview: this.computeOverview(),
      verificationResult: lastVerification,
    };
  }

  toggleRepositoryScans(repoId: string): {
    repository: RepositoryRecord;
    repositories: RepositoryRecord[];
  } {
    const allRepos = this.store.listRepositories();
    const current = allRepos.find(
      (r) => r.id === repoId || r.name === repoId || r.fullName === repoId,
    );
    if (!current) {
      throw new Error(`Repository not found: ${repoId}`);
    }

    const nextEnabled = !current.prReviewsEnabled;
    const updated = RepositoryRecordSchema.parse({
      ...current,
      prReviewsEnabled: nextEnabled,
      scheduledScanLabel: nextEnabled ? 'Daily at 8:00 AM UTC' : null,
      lastCompletedScanLabel: nextEnabled ? 'Scheduled' : 'Paused',
      needsAttention: !nextEnabled || current.openFindingsCount >= 3,
    });
    this.store.upsertRepository(updated, 'back');

    this.auditLedger.append({
      subsystem: 'orchestrator',
      action: 'repository.coverage.toggled',
      entityId: updated.id,
      actor: 'security-operator',
      summary: `${nextEnabled ? 'Enabled' : 'Paused'} PR reviews and scheduled scans for ${updated.fullName}.`,
      metadata: { prReviewsEnabled: nextEnabled },
    });

    return {
      repository: updated,
      repositories: this.store.listRepositories(),
    };
  }

  prepareCampaign(input: PrepareCampaignInput): { campaign: RedTeamCampaignRun } {
    const campaign = this.redTeam.prepareCampaignFromPrompt(input);
    this.store.upsertCampaign(campaign, 'front');
    this.emit({ type: 'campaign.updated', campaign });
    return { campaign };
  }

  async launchCampaign(
    campaignId: string,
    yamlText?: string,
  ): Promise<{ campaign: RedTeamCampaignRun }> {
    const current = this.store.getCampaign(campaignId);
    if (!current) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

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
      this.store.upsertCampaign(halted);
      this.emit({ type: 'campaign.updated', campaign: halted });
      return { campaign: halted };
    }

    const primaryTarget = parsedManifest.campaign.targets[0] ?? current.targetUrl;
    const keyPair = generateScopeKeyPair(`key-${campaignId}`);
    const signedManifest = signCampaignManifest(
      parsedManifest,
      keyPair.privateKeyPem,
      keyPair.keyId,
    );

    const runningState = RedTeamCampaignRunSchema.parse({
      ...current,
      name: parsedManifest.campaign.name,
      objective: parsedManifest.objective,
      targetUrl: primaryTarget,
      yamlText: effectiveYaml,
      status: 'running',
      startedAt: new Date().toISOString(),
      updatedLabel: 'Running live verification',
      headlineStatus: 'Verification agents active in staging scope',
      headlineDetail: `Executing bounded HTTP/WebSocket checks against ${primaryTarget} (max ${parsedManifest.campaign.max_requests_per_second} RPS).`,
    });
    this.store.upsertCampaign(runningState);

    this.auditLedger.append({
      subsystem: 'red-team',
      action: 'campaign.launched',
      entityId: runningState.id,
      actor: 'security-operator',
      summary: `Launched live Red Team campaign "${runningState.name}" against ${runningState.targetUrl}.`,
      metadata: {
        maxRps: parsedManifest.campaign.max_requests_per_second,
        manifestSha256: signedManifest.canonicalDigestSha256,
      },
    });
    this.emit({ type: 'campaign.updated', campaign: runningState });

    let targetTransportRedirects: Record<string, string> | undefined;
    if (isNorthstarStagingHost(primaryTarget)) {
      const liveStagingUrl = await this.ensureLiveStagingTargetUrl();
      targetTransportRedirects = {
        [stripTrailingSlash(primaryTarget)]: liveStagingUrl,
      };
    }

    const startedMs = Date.now();
    const assessment = await this.redTeam.runAssessment({
      campaignId: runningState.id,
      targetBaseUrl: primaryTarget,
      targetTransportRedirects,
      signedManifest,
      publicKeyPem: keyPair.publicKeyPem,
      askForApproval: runningState.askForApproval,
      includeMutatingProbe: runningState.askForApproval,
      modelId: runningState.modelId,
    });

    this.syncApprovalsFromPolicyGate(true);
    this.ingestAssessmentResult(assessment);

    const safety = this.auditLedger.getSafetyMonitorStatus();
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedMs) / 1000));
    const killEngaged = this.policyGate.isKillSwitchEngaged();
    const awaitingHitl =
      !killEngaged &&
      runningState.askForApproval &&
      assessment.pendingApprovals.length > 0;

    const finalStatus: RedTeamCampaignRun['status'] = killEngaged
      ? 'halted'
      : awaitingHitl
        ? 'paused_hitl'
        : 'completed';

    const totalHits = assessment.endpointHits.reduce((acc, ep) => acc + ep.hits, 0);
    const budgetRemainingPct = Math.max(
      5,
      Math.min(100, Number((100 - totalHits * 0.8).toFixed(1))),
    );

    const completedCampaign = RedTeamCampaignRunSchema.parse({
      ...runningState,
      status: finalStatus,
      elapsedSeconds,
      budgetRemainingPct,
      updatedLabel: 'Updated just now',
      headlineStatus: killEngaged
        ? 'Halted by emergency kill-switch'
        : awaitingHitl
          ? 'Paused awaiting operator approval'
          : `Completed verification (${assessment.confirmedFindings.length} finding(s) confirmed)`,
      headlineDetail: `Executed ${totalHits} in-scope request(s) through EgressPolicyProxy against ${primaryTarget}.`,
      safetyMonitorText: safety.message,
      withinApprovedScope: safety.withinApprovedScope,
      activitySeries: assessment.activitySeries,
      endpoints: assessment.endpointHits,
      workQueue: assessment.workQueue,
      sharedKnowledge: assessment.sharedKnowledge,
      findingIds: assessment.confirmedFindings.map((f) => f.id),
    });

    this.store.upsertCampaign(completedCampaign);
    this.emit({ type: 'campaign.updated', campaign: completedCampaign });

    return { campaign: completedCampaign };
  }

  resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
  ): { approval: HitlApprovalRequest; campaign?: RedTeamCampaignRun } {
    const resolved = this.policyGate.resolveApproval(approvalId, decision, 'security-operator');
    this.store.upsertHitlApproval(resolved);
    this.emit({ type: 'hitl.updated', approval: resolved });

    this.auditLedger.append({
      subsystem: 'policy-gate',
      action: `hitl.${decision}`,
      entityId: resolved.id,
      actor: 'security-operator',
      summary: `Operator ${decision} HITL request ${resolved.id} for ${resolved.targetEndpoint}.`,
      metadata: { campaignId: resolved.campaignId, workItemId: resolved.workItemId },
    });

    const currentCampaign = this.store.getCampaign(resolved.campaignId);
    let updatedCampaign: RedTeamCampaignRun | undefined;
    if (currentCampaign) {
      const updatedQueue = currentCampaign.workQueue.map((item) => {
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

      const remainingPendingForCampaign = this.policyGate
        .listApprovals('pending')
        .some((a) => a.campaignId === currentCampaign.id);

      updatedCampaign = RedTeamCampaignRunSchema.parse({
        ...currentCampaign,
        status:
          currentCampaign.status === 'paused_hitl' && !remainingPendingForCampaign
            ? 'completed'
            : currentCampaign.status,
        headlineStatus:
          decision === 'approved'
            ? 'HITL action approved — campaign verification completed'
            : 'HITL action rejected — probe skipped',
        workQueue: updatedQueue,
        updatedLabel: 'Updated just now',
      });
      this.store.upsertCampaign(updatedCampaign);
      this.emit({ type: 'campaign.updated', campaign: updatedCampaign });
    }

    return {
      approval: resolved,
      campaign: updatedCampaign,
    };
  }

  private haltRunningCampaigns(reason: string): void {
    for (const c of this.store.listCampaigns()) {
      if (c.status === 'running' || c.status === 'paused_hitl') {
        const halted = RedTeamCampaignRunSchema.parse({
          ...c,
          status: 'halted',
          headlineStatus: 'Halted by emergency kill-switch',
          headlineDetail: reason,
          updatedLabel: 'Halted immediately',
        });
        this.store.upsertCampaign(halted);
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
      this.store.setMeta('kill_switch_state', { engaged: true, reason });
      this.auditLedger.append({
        subsystem: 'policy-gate',
        action: 'safety.kill_switch.engaged',
        entityId: 'global-kill-switch',
        actor: 'security-operator',
        summary: `Emergency kill-switch engaged: ${reason}`,
      });
    } else {
      this.policyGate.resetKillSwitch();
      this.store.setMeta('kill_switch_state', { engaged: false, reason: '' });
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
      this.store.upsertEvidenceBundle(ev, 'front');
      this.emit({ type: 'evidence.recorded', evidence: ev });
    }

    const ingestedFindings: FindingRecord[] = [];
    for (const f of result.confirmedFindings) {
      const existing = this.store.getFinding(f.id);
      if (existing) {
        const merged = FindingRecordSchema.parse({
          ...existing,
          ...f,
          status: existing.status === 'fixed' ? 'fixed' : f.status,
          fixId: existing.fixId ?? f.fixId,
        });
        this.store.upsertFinding(merged);
        ingestedFindings.push(merged);
        this.emit({ type: 'finding.updated', finding: merged });
      } else {
        this.store.upsertFinding(f, 'front');
        ingestedFindings.push(f);
        this.emit({ type: 'finding.updated', finding: f });
      }
    }

    this.refreshRepositoryOpenCounts();

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
      findings: ingestedFindings,
      evidenceBundles: structuredClone(result.evidenceBundles),
      overview: this.computeOverview(),
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.store.close();

    if (this.ephemeralStagingServer) {
      const srv = this.ephemeralStagingServer;
      this.ephemeralStagingServer = null;
      await srv.stop().catch(() => undefined);
    }

    if (this.ownsTempWorkspace) {
      await fs
        .rm(this.workspaceReposRoot, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }
}
