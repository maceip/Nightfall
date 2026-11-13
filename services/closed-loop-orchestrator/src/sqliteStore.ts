import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  AuditEntrySchema,
  EvidenceBundleSchema,
  FindingRecordSchema,
  FixProposalSchema,
  HitlApprovalRequestSchema,
  RedTeamCampaignRunSchema,
  RepositoryRecordSchema,
  ScanJobRecordSchema,
  type AuditEntry,
  type EvidenceBundle,
  type FindingRecord,
  type FixProposal,
  type HitlApprovalRequest,
  type RedTeamCampaignRun,
  type RepositoryRecord,
  type ScanJobRecord,
} from '@nightfall/core-contracts';

type OrderedTable =
  | 'repositories'
  | 'findings'
  | 'fixes'
  | 'scans'
  | 'campaigns'
  | 'evidence_bundles'
  | 'hitl_approvals';

export class NightfallSqliteStore {
  readonly sqlitePath: string;
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(sqlitePath = ':memory:') {
    this.sqlitePath = sqlitePath;
    if (sqlitePath !== ':memory:') {
      fs.mkdirSync(path.dirname(path.resolve(sqlitePath)), { recursive: true });
    }
    this.db = new DatabaseSync(sqlitePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        repository TEXT NOT NULL,
        status TEXT NOT NULL,
        severity TEXT NOT NULL,
        cluster_key TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fixes (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        repository TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        repository TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evidence_bundles (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        finding_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hitl_approvals (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        campaign_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_entries (
        idx INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        entity_id TEXT NOT NULL,
        subsystem TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meta_kv (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
    `);
  }

  private resolveSortOrder(
    table: OrderedTable,
    id: string,
    placement: 'front' | 'back' = 'front',
  ): number {
    const existing = this.db
      .prepare(`SELECT sort_order FROM ${table} WHERE id = ?`)
      .get(id) as { sort_order?: number } | undefined;
    if (existing && typeof existing.sort_order === 'number') {
      return existing.sort_order;
    }

    if (placement === 'front') {
      const row = this.db
        .prepare(`SELECT MIN(sort_order) AS min_order FROM ${table}`)
        .get() as { min_order?: number | null } | undefined;
      return typeof row?.min_order === 'number' ? row.min_order - 1 : 0;
    }

    const row = this.db
      .prepare(`SELECT MAX(sort_order) AS max_order FROM ${table}`)
      .get() as { max_order?: number | null } | undefined;
    return typeof row?.max_order === 'number' ? row.max_order + 1 : 0;
  }

  hasBootstrappedData(): boolean {
    if (this.closed) return false;
    const repoCount = (
      this.db.prepare('SELECT COUNT(*) AS cnt FROM repositories').get() as { cnt: number }
    ).cnt;
    const findingCount = (
      this.db.prepare('SELECT COUNT(*) AS cnt FROM findings').get() as { cnt: number }
    ).cnt;
    return repoCount > 0 && findingCount > 0;
  }

  getMeta<T>(key: string): T | undefined {
    if (this.closed) return undefined;
    const row = this.db
      .prepare('SELECT value_json FROM meta_kv WHERE key = ?')
      .get(key) as { value_json?: string } | undefined;
    if (!row?.value_json) {
      return undefined;
    }
    return JSON.parse(row.value_json) as T;
  }

  setMeta(key: string, value: unknown): void {
    if (this.closed) return;
    this.db
      .prepare(
        `INSERT INTO meta_kv (key, value_json)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
      )
      .run(key, JSON.stringify(value));
  }

  upsertRepository(
    repo: RepositoryRecord,
    placement: 'front' | 'back' = 'back',
  ): RepositoryRecord {
    const validated = RepositoryRecordSchema.parse(repo);
    if (this.closed) return validated;
    const sortOrder = this.resolveSortOrder('repositories', validated.id, placement);
    this.db
      .prepare(
        `INSERT INTO repositories (id, sort_order, name, full_name, payload_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           full_name = excluded.full_name,
           payload_json = excluded.payload_json`,
      )
      .run(
        validated.id,
        sortOrder,
        validated.name,
        validated.fullName,
        JSON.stringify(validated),
      );
    return validated;
  }

  listRepositories(): RepositoryRecord[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT payload_json FROM repositories ORDER BY sort_order ASC, id ASC')
      .all() as Array<{ payload_json: string }>;
    return rows.map((row) => RepositoryRecordSchema.parse(JSON.parse(row.payload_json)));
  }

  upsertFinding(
    finding: FindingRecord,
    placement: 'front' | 'back' = 'front',
  ): FindingRecord {
    const validated = FindingRecordSchema.parse(finding);
    if (this.closed) return validated;
    const sortOrder = this.resolveSortOrder('findings', validated.id, placement);
    this.db
      .prepare(
        `INSERT INTO findings (id, sort_order, repository, status, severity, cluster_key, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           repository = excluded.repository,
           status = excluded.status,
           severity = excluded.severity,
           cluster_key = excluded.cluster_key,
           payload_json = excluded.payload_json`,
      )
      .run(
        validated.id,
        sortOrder,
        validated.repository,
        validated.status,
        validated.severity,
        validated.rootCauseClusterKey,
        JSON.stringify(validated),
      );
    return validated;
  }

  getFinding(id: string): FindingRecord | undefined {
    if (this.closed) return undefined;
    const row = this.db
      .prepare('SELECT payload_json FROM findings WHERE id = ?')
      .get(id) as { payload_json?: string } | undefined;
    if (!row?.payload_json) return undefined;
    return FindingRecordSchema.parse(JSON.parse(row.payload_json));
  }

  listFindings(): FindingRecord[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT payload_json FROM findings ORDER BY sort_order ASC, id ASC')
      .all() as Array<{ payload_json: string }>;
    return rows.map((row) => FindingRecordSchema.parse(JSON.parse(row.payload_json)));
  }

  upsertFix(fix: FixProposal, placement: 'front' | 'back' = 'front'): FixProposal {
    const validated = FixProposalSchema.parse(fix);
    if (this.closed) return validated;
    const sortOrder = this.resolveSortOrder('fixes', validated.id, placement);
    this.db
      .prepare(
        `INSERT INTO fixes (id, sort_order, repository, status, payload_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           repository = excluded.repository,
           status = excluded.status,
           payload_json = excluded.payload_json`,
      )
      .run(
        validated.id,
        sortOrder,
        validated.repository,
        validated.status,
        JSON.stringify(validated),
      );
    return validated;
  }

  getFix(id: string): FixProposal | undefined {
    if (this.closed) return undefined;
    const row = this.db
      .prepare('SELECT payload_json FROM fixes WHERE id = ?')
      .get(id) as { payload_json?: string } | undefined;
    if (!row?.payload_json) return undefined;
    return FixProposalSchema.parse(JSON.parse(row.payload_json));
  }

  listFixes(): FixProposal[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT payload_json FROM fixes ORDER BY sort_order ASC, id ASC')
      .all() as Array<{ payload_json: string }>;
    return rows.map((row) => FixProposalSchema.parse(JSON.parse(row.payload_json)));
  }

  upsertScan(scan: ScanJobRecord, placement: 'front' | 'back' = 'front'): ScanJobRecord {
    const validated = ScanJobRecordSchema.parse(scan);
    if (this.closed) return validated;
    const sortOrder = this.resolveSortOrder('scans', validated.id, placement);
    this.db
      .prepare(
        `INSERT INTO scans (id, sort_order, repository, status, payload_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           repository = excluded.repository,
           status = excluded.status,
           payload_json = excluded.payload_json`,
      )
      .run(
        validated.id,
        sortOrder,
        validated.repository,
        validated.status,
        JSON.stringify(validated),
      );
    return validated;
  }

  listScans(): ScanJobRecord[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT payload_json FROM scans ORDER BY sort_order ASC, id ASC')
      .all() as Array<{ payload_json: string }>;
    return rows.map((row) => ScanJobRecordSchema.parse(JSON.parse(row.payload_json)));
  }

  upsertCampaign(
    campaign: RedTeamCampaignRun,
    placement: 'front' | 'back' = 'front',
  ): RedTeamCampaignRun {
    const validated = RedTeamCampaignRunSchema.parse(campaign);
    if (this.closed) return validated;
    const sortOrder = this.resolveSortOrder('campaigns', validated.id, placement);
    this.db
      .prepare(
        `INSERT INTO campaigns (id, sort_order, status, payload_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           payload_json = excluded.payload_json`,
      )
      .run(validated.id, sortOrder, validated.status, JSON.stringify(validated));
    return validated;
  }

  getCampaign(id: string): RedTeamCampaignRun | undefined {
    if (this.closed) return undefined;
    const row = this.db
      .prepare('SELECT payload_json FROM campaigns WHERE id = ?')
      .get(id) as { payload_json?: string } | undefined;
    if (!row?.payload_json) return undefined;
    return RedTeamCampaignRunSchema.parse(JSON.parse(row.payload_json));
  }

  listCampaigns(): RedTeamCampaignRun[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT payload_json FROM campaigns ORDER BY sort_order ASC, id ASC')
      .all() as Array<{ payload_json: string }>;
    return rows.map((row) => RedTeamCampaignRunSchema.parse(JSON.parse(row.payload_json)));
  }

  upsertEvidenceBundle(
    evidence: EvidenceBundle,
    placement: 'front' | 'back' = 'front',
  ): EvidenceBundle {
    const validated = EvidenceBundleSchema.parse(evidence);
    if (this.closed) return validated;
    const sortOrder = this.resolveSortOrder('evidence_bundles', validated.id, placement);
    this.db
      .prepare(
        `INSERT INTO evidence_bundles (id, sort_order, finding_id, campaign_id, payload_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           finding_id = excluded.finding_id,
           campaign_id = excluded.campaign_id,
           payload_json = excluded.payload_json`,
      )
      .run(
        validated.id,
        sortOrder,
        validated.findingId,
        validated.campaignId,
        JSON.stringify(validated),
      );
    return validated;
  }

  listEvidenceBundles(): EvidenceBundle[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT payload_json FROM evidence_bundles ORDER BY sort_order ASC, id ASC')
      .all() as Array<{ payload_json: string }>;
    return rows.map((row) => EvidenceBundleSchema.parse(JSON.parse(row.payload_json)));
  }

  upsertHitlApproval(
    approval: HitlApprovalRequest,
    placement: 'front' | 'back' = 'front',
  ): HitlApprovalRequest {
    const validated = HitlApprovalRequestSchema.parse(approval);
    if (this.closed) return validated;
    const sortOrder = this.resolveSortOrder('hitl_approvals', validated.id, placement);
    this.db
      .prepare(
        `INSERT INTO hitl_approvals (id, sort_order, campaign_id, status, payload_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           campaign_id = excluded.campaign_id,
           status = excluded.status,
           payload_json = excluded.payload_json`,
      )
      .run(
        validated.id,
        sortOrder,
        validated.campaignId,
        validated.status,
        JSON.stringify(validated),
      );
    return validated;
  }

  listHitlApprovals(): HitlApprovalRequest[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT payload_json FROM hitl_approvals ORDER BY sort_order ASC, id ASC')
      .all() as Array<{ payload_json: string }>;
    return rows.map((row) => HitlApprovalRequestSchema.parse(JSON.parse(row.payload_json)));
  }

  appendAuditEntry(entry: AuditEntry): AuditEntry {
    const validated = AuditEntrySchema.parse(entry);
    if (this.closed) return validated;
    this.db
      .prepare(
        `INSERT INTO audit_entries (idx, id, entity_id, subsystem, payload_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(idx) DO UPDATE SET
           id = excluded.id,
           entity_id = excluded.entity_id,
           subsystem = excluded.subsystem,
           payload_json = excluded.payload_json`,
      )
      .run(
        validated.index,
        validated.id,
        validated.entityId,
        validated.subsystem,
        JSON.stringify(validated),
      );
    return validated;
  }

  listAuditEntries(): AuditEntry[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT payload_json FROM audit_entries ORDER BY idx ASC')
      .all() as Array<{ payload_json: string }>;
    return rows.map((row) => AuditEntrySchema.parse(JSON.parse(row.payload_json)));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.db.close();
    } catch {
      // Ignore close errors if already closed
    }
  }
}
