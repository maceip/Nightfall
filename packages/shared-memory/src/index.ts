import crypto from 'node:crypto';
import {
  SharedKnowledgeNodeSchema,
  WorkQueueItemSchema,
  type SharedKnowledgeNode,
  type WorkQueueItem,
} from '@nightfall/core-contracts';

export const PACKAGE_NAME = '@nightfall/shared-memory';

export type UpsertKnowledgeInput = Omit<SharedKnowledgeNode, 'id' | 'createdAt'> & {
  id?: string;
};

export type EnqueueHypothesisInput = Omit<WorkQueueItem, 'id' | 'updatedAt' | 'status'> & {
  id?: string;
  status?: WorkQueueItem['status'];
};

interface CampaignMemoryBucket {
  workQueue: WorkQueueItem[];
  knowledge: SharedKnowledgeNode[];
}

const DEFAULT_LEASE_TTL_MS = 30_000;

function canonicalizeKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`'"]/g, '')
    .replace(/[^a-z0-9/._:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEquivalentText(a: string, b: string): boolean {
  const normA = canonicalizeKey(a);
  const normB = canonicalizeKey(b);
  if (!normA || !normB) {
    return false;
  }
  if (normA === normB) {
    return true;
  }
  if (normA.length >= 10 && normB.includes(normA)) {
    return true;
  }
  if (normB.length >= 10 && normA.includes(normB)) {
    return true;
  }
  return false;
}

export class SharedKnowledgeStore {
  private readonly campaigns = new Map<string, CampaignMemoryBucket>();

  private getOrCreateBucket(campaignId: string): CampaignMemoryBucket {
    let bucket = this.campaigns.get(campaignId);
    if (!bucket) {
      bucket = { workQueue: [], knowledge: [] };
      this.campaigns.set(campaignId, bucket);
    }
    return bucket;
  }

  seedCampaignMemory(
    campaignId: string,
    workQueue: WorkQueueItem[],
    knowledge: SharedKnowledgeNode[],
  ): void {
    const parsedQueue = workQueue.map((item) => WorkQueueItemSchema.parse(structuredClone(item)));
    const parsedKnowledge: SharedKnowledgeNode[] = [];

    this.campaigns.set(campaignId, {
      workQueue: parsedQueue,
      knowledge: parsedKnowledge,
    });

    for (const node of knowledge) {
      const parsed = SharedKnowledgeNodeSchema.parse(structuredClone(node));
      const existingIdx = parsedKnowledge.findIndex(
        (existing) =>
          existing.id === parsed.id ||
          (existing.kind === parsed.kind &&
            canonicalizeKey(existing.title) === canonicalizeKey(parsed.title)),
      );
      if (existingIdx >= 0) {
        parsedKnowledge[existingIdx] = parsed;
      } else {
        parsedKnowledge.push(parsed);
      }
    }
  }

  upsertKnowledge(campaignId: string, node: UpsertKnowledgeInput): SharedKnowledgeNode {
    const bucket = this.getOrCreateBucket(campaignId);
    const normTitle = canonicalizeKey(node.title);

    const existingIdx = bucket.knowledge.findIndex(
      (existing) =>
        (node.id !== undefined && existing.id === node.id) ||
        (existing.kind === node.kind && canonicalizeKey(existing.title) === normTitle),
    );

    if (existingIdx >= 0) {
      const current = bucket.knowledge[existingIdx]!;
      const updated = SharedKnowledgeNodeSchema.parse({
        ...current,
        kind: node.kind,
        title: node.title,
        detail: node.detail,
        ...(node.sourceRef !== undefined ? { sourceRef: node.sourceRef } : {}),
        discoveredBy: node.discoveredBy,
      });
      bucket.knowledge[existingIdx] = updated;
      return structuredClone(updated);
    }

    const created = SharedKnowledgeNodeSchema.parse({
      id: node.id ?? `sk-${crypto.randomUUID().slice(0, 8)}`,
      kind: node.kind,
      title: node.title,
      detail: node.detail,
      ...(node.sourceRef !== undefined ? { sourceRef: node.sourceRef } : {}),
      discoveredBy: node.discoveredBy,
      createdAt: new Date().toISOString(),
    });

    bucket.knowledge.push(created);
    return structuredClone(created);
  }

  listKnowledge(campaignId: string): SharedKnowledgeNode[] {
    const bucket = this.campaigns.get(campaignId);
    if (!bucket) {
      return [];
    }
    return bucket.knowledge.map((node) => structuredClone(node));
  }

  enqueueHypothesis(campaignId: string, item: EnqueueHypothesisInput): WorkQueueItem {
    const bucket = this.getOrCreateBucket(campaignId);
    const nowIso = new Date().toISOString();

    if (item.id !== undefined) {
      const existingIdx = bucket.workQueue.findIndex((q) => q.id === item.id);
      if (existingIdx >= 0) {
        const current = bucket.workQueue[existingIdx]!;
        const updated = WorkQueueItemSchema.parse({
          ...current,
          ...item,
          id: current.id,
          status: item.status ?? current.status,
          updatedAt: nowIso,
        });
        bucket.workQueue[existingIdx] = updated;
        return structuredClone(updated);
      }
    }

    const created = WorkQueueItemSchema.parse({
      id: item.id ?? `wq-${crypto.randomUUID().slice(0, 8)}`,
      hypothesis: item.hypothesis,
      category: item.category,
      assignedAgent: item.assignedAgent,
      riskTier: item.riskTier,
      status: item.status ?? 'queued',
      ...(item.leaseExpiresAt !== undefined ? { leaseExpiresAt: item.leaseExpiresAt } : {}),
      ...(item.outcomeNote !== undefined ? { outcomeNote: item.outcomeNote } : {}),
      updatedAt: nowIso,
    });

    bucket.workQueue.push(created);
    return structuredClone(created);
  }

  hasFalsifiedEquivalent(campaignId: string, hypothesis: string): boolean {
    const bucket = this.campaigns.get(campaignId);
    if (!bucket) {
      return false;
    }

    for (const item of bucket.workQueue) {
      if (item.status === 'falsified' && isEquivalentText(item.hypothesis, hypothesis)) {
        return true;
      }
    }

    for (const node of bucket.knowledge) {
      if (node.kind !== 'negative_result') {
        continue;
      }
      if (
        isEquivalentText(node.title, hypothesis) ||
        canonicalizeKey(node.detail) === canonicalizeKey(hypothesis)
      ) {
        return true;
      }
    }

    return false;
  }

  private hasConfirmedEquivalent(bucket: CampaignMemoryBucket, hypothesis: string): boolean {
    return bucket.workQueue.some(
      (item) =>
        item.status === 'confirmed' &&
        canonicalizeKey(item.hypothesis) === canonicalizeKey(hypothesis),
    );
  }

  claimNextHypothesis(
    campaignId: string,
    agentId: string,
    leaseTtlMs = DEFAULT_LEASE_TTL_MS,
  ): WorkQueueItem | null {
    const bucket = this.campaigns.get(campaignId);
    if (!bucket) {
      return null;
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const effectiveTtlMs = Math.max(1, leaseTtlMs);

    for (let i = 0; i < bucket.workQueue.length; i += 1) {
      const candidate = bucket.workQueue[i]!;

      const isQueued = candidate.status === 'queued';
      const isExpiredLease =
        candidate.status === 'leased' &&
        candidate.leaseExpiresAt !== undefined &&
        Date.parse(candidate.leaseExpiresAt) <= nowMs;

      if (!isQueued && !isExpiredLease) {
        continue;
      }

      if (this.hasFalsifiedEquivalent(campaignId, candidate.hypothesis)) {
        const { leaseExpiresAt: _omitted, ...rest } = candidate;
        bucket.workQueue[i] = WorkQueueItemSchema.parse({
          ...rest,
          status: 'falsified',
          outcomeNote:
            candidate.outcomeNote ??
            'Skipped automatically: equivalent hypothesis already falsified in shared knowledge.',
          updatedAt: nowIso,
        });
        continue;
      }

      if (this.hasConfirmedEquivalent(bucket, candidate.hypothesis)) {
        continue;
      }

      const leased = WorkQueueItemSchema.parse({
        ...candidate,
        assignedAgent: agentId,
        status: 'leased',
        leaseExpiresAt: new Date(nowMs + effectiveTtlMs).toISOString(),
        updatedAt: nowIso,
      });

      bucket.workQueue[i] = leased;
      return structuredClone(leased);
    }

    return null;
  }

  completeHypothesis(
    campaignId: string,
    itemId: string,
    status: 'confirmed' | 'falsified' | 'awaiting_approval',
    outcomeNote: string,
  ): WorkQueueItem {
    const bucket = this.getOrCreateBucket(campaignId);
    const idx = bucket.workQueue.findIndex((item) => item.id === itemId);
    if (idx < 0) {
      throw new Error(`WorkQueueItem not found in campaign "${campaignId}": ${itemId}`);
    }

    const current = bucket.workQueue[idx]!;
    const { leaseExpiresAt: _omitted, ...rest } = current;
    const updated = WorkQueueItemSchema.parse({
      ...rest,
      status,
      outcomeNote,
      updatedAt: new Date().toISOString(),
    });

    bucket.workQueue[idx] = updated;

    if (status === 'falsified') {
      this.upsertKnowledge(campaignId, {
        kind: 'negative_result',
        title: updated.hypothesis,
        detail: outcomeNote,
        discoveredBy: updated.assignedAgent || 'verifier',
      });
    }

    return structuredClone(updated);
  }

  requeueHypothesis(campaignId: string, itemId: string, note?: string): WorkQueueItem {
    const bucket = this.getOrCreateBucket(campaignId);
    const idx = bucket.workQueue.findIndex((item) => item.id === itemId);
    if (idx < 0) {
      throw new Error(`WorkQueueItem not found in campaign "${campaignId}": ${itemId}`);
    }

    const current = bucket.workQueue[idx]!;
    const { leaseExpiresAt: _omitted, ...rest } = current;
    const updated = WorkQueueItemSchema.parse({
      ...rest,
      status: 'queued',
      ...(note !== undefined
        ? { outcomeNote: note }
        : current.outcomeNote !== undefined
          ? { outcomeNote: current.outcomeNote }
          : {}),
      updatedAt: new Date().toISOString(),
    });

    bucket.workQueue[idx] = updated;
    return structuredClone(updated);
  }

  listWorkQueue(campaignId: string): WorkQueueItem[] {
    const bucket = this.campaigns.get(campaignId);
    if (!bucket) {
      return [];
    }
    return bucket.workQueue.map((item) => structuredClone(item));
  }
}
