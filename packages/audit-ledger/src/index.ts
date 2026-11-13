import crypto from 'node:crypto';
import { AuditEntrySchema, type AuditEntry } from '@nightfall/core-contracts';

export const PACKAGE_NAME = '@nightfall/audit-ledger';
export const GENESIS_HASH = 'GENESIS';

export interface AppendAuditInput {
  subsystem: AuditEntry['subsystem'];
  action: string;
  entityId: string;
  actor: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface AuditListFilter {
  entityId?: string;
  subsystem?: AuditEntry['subsystem'];
  limit?: number;
}

export interface IntegrityVerificationResult {
  valid: boolean;
  checkedCount: number;
  brokenAtIndex?: number;
}

export interface SafetyMonitorStatus {
  withinApprovedScope: boolean;
  blockedRequestsCount: number;
  message: string;
  updatedAt: string;
}

export interface AuditLedgerOptions {
  initialEntries?: AuditEntry[];
  onAppend?: (entry: AuditEntry) => void;
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item === undefined ? null : item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`).join(',')}}`;
}

function computeEntryHash(fields: Omit<AuditEntry, 'hash'>): string {
  const canonicalPayload = canonicalizeJson({
    id: fields.id,
    index: fields.index,
    timestamp: fields.timestamp,
    subsystem: fields.subsystem,
    action: fields.action,
    entityId: fields.entityId,
    actor: fields.actor,
    summary: fields.summary,
    metadata: fields.metadata,
    prevHash: fields.prevHash,
  });
  return crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
}

export class AuditLedger {
  private readonly entries: AuditEntry[] = [];
  private blockedRequestsCount = 0;
  private lastUpdatedAt: string;
  private readonly onAppend?: (entry: AuditEntry) => void;

  constructor(options?: AuditLedgerOptions) {
    this.lastUpdatedAt = new Date().toISOString();
    this.onAppend = options?.onAppend;
    if (options?.initialEntries) {
      for (const item of options.initialEntries) {
        const parsed = AuditEntrySchema.parse(structuredClone(item));
        this.entries.push(parsed);
        if (parsed.action === 'egress.blocked') {
          this.blockedRequestsCount += 1;
        }
        this.lastUpdatedAt = parsed.timestamp;
      }
    }
  }

  append(input: AppendAuditInput): AuditEntry {
    const index = this.entries.length;
    const prevHash = index === 0 ? GENESIS_HASH : this.entries[index - 1]!.hash;
    const timestamp = new Date().toISOString();
    const id = `aud-${String(index + 1).padStart(4, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    const metadata = input.metadata ? structuredClone(input.metadata) : {};

    const baseFields: Omit<AuditEntry, 'hash'> = {
      id,
      index,
      timestamp,
      subsystem: input.subsystem,
      action: input.action,
      entityId: input.entityId,
      actor: input.actor,
      summary: input.summary,
      metadata,
      prevHash,
    };

    const hash = computeEntryHash(baseFields);
    const entry = AuditEntrySchema.parse({
      ...baseFields,
      hash,
    });

    this.entries.push(entry);
    this.lastUpdatedAt = timestamp;

    if (entry.action === 'egress.blocked') {
      this.blockedRequestsCount += 1;
    }

    if (this.onAppend) {
      this.onAppend(structuredClone(entry));
    }

    return structuredClone(entry);
  }

  list(filter?: AuditListFilter): AuditEntry[] {
    let filtered = this.entries;

    if (filter?.entityId !== undefined) {
      filtered = filtered.filter((entry) => entry.entityId === filter.entityId);
    }

    if (filter?.subsystem !== undefined) {
      filtered = filtered.filter((entry) => entry.subsystem === filter.subsystem);
    }

    if (filter?.limit !== undefined) {
      if (filter.limit <= 0) {
        return [];
      }
      if (filtered.length > filter.limit) {
        filtered = filtered.slice(-filter.limit);
      }
    }

    return filtered.map((entry) => structuredClone(entry));
  }

  verifyIntegrity(): IntegrityVerificationResult {
    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i]!;
      const expectedPrevHash = i === 0 ? GENESIS_HASH : this.entries[i - 1]!.hash;

      if (entry.index !== i || entry.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          checkedCount: i + 1,
          brokenAtIndex: i,
        };
      }

      const { hash, ...rest } = entry;
      const expectedHash = computeEntryHash(rest);
      if (hash !== expectedHash) {
        return {
          valid: false,
          checkedCount: i + 1,
          brokenAtIndex: i,
        };
      }
    }

    return {
      valid: true,
      checkedCount: this.entries.length,
    };
  }

  recordBlockedEgress(reason: string, metadata?: Record<string, unknown>): AuditEntry {
    const entityId =
      typeof metadata?.campaignId === 'string'
        ? metadata.campaignId
        : typeof metadata?.entityId === 'string'
          ? metadata.entityId
          : 'egress-proxy';
    const actor = typeof metadata?.actor === 'string' ? metadata.actor : 'egress-policy-proxy';

    return this.append({
      subsystem: 'policy-gate',
      action: 'egress.blocked',
      entityId,
      actor,
      summary: `Blocked out-of-scope egress: ${reason}`,
      metadata: {
        ...(metadata ?? {}),
        blockedReason: reason,
        blockedAtBoundary: true,
      },
    });
  }

  getSafetyMonitorStatus(): SafetyMonitorStatus {
    const message =
      this.blockedRequestsCount === 0
        ? 'Requests stay within the approved staging scope.'
        : `Requests stay within the approved staging scope. (${this.blockedRequestsCount} out-of-scope request${this.blockedRequestsCount === 1 ? '' : 's'} blocked at egress boundary.)`;

    return {
      withinApprovedScope: true,
      blockedRequestsCount: this.blockedRequestsCount,
      message,
      updatedAt: this.lastUpdatedAt,
    };
  }

  tamperEntryForTestOnly(index: number, newSummary: string): void {
    const target = this.entries[index];
    if (!target) {
      throw new RangeError(`Audit entry index out of range: ${index}`);
    }
    target.summary = newSummary;
  }
}
