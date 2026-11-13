import { describe, expect, it } from 'vitest';
import { SharedKnowledgeStore } from './index.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('@nightfall/shared-memory', () => {
  it('guarantees zero duplicate claims across 10 concurrent workers', async () => {
    const store = new SharedKnowledgeStore();
    const campaignId = 'camp-concurrency';

    for (let i = 0; i < 7; i += 1) {
      store.enqueueHypothesis(campaignId, {
        id: `wq-${i}`,
        hypothesis: `Verify tenant boundary on endpoint /api/v1/resource-${i}`,
        category: 'Tenant Isolation',
        assignedAgent: 'unassigned',
        riskTier: 'TIER_1_SAFE_PROBE',
      });
    }

    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, workerIdx) =>
        Promise.resolve().then(() =>
          store.claimNextHypothesis(campaignId, `worker-${workerIdx}`, 10_000),
        ),
      ),
    );

    const nonNullClaims = claims.filter((item): item is NonNullable<typeof item> => item !== null);
    const nullClaims = claims.filter((item) => item === null);

    expect(nonNullClaims).toHaveLength(7);
    expect(nullClaims).toHaveLength(3);

    const uniqueIds = new Set(nonNullClaims.map((item) => item.id));
    expect(uniqueIds.size).toBe(7);

    const uniqueAgents = new Set(nonNullClaims.map((item) => item.assignedAgent));
    expect(uniqueAgents.size).toBe(7);
  });

  it('reclaims expired leases after TTL elapses and supports manual requeue', async () => {
    const store = new SharedKnowledgeStore();
    const campaignId = 'camp-lease-ttl';

    store.enqueueHypothesis(campaignId, {
      id: 'wq-ttl-1',
      hypothesis: 'Check WebSocket subscribe frame ACL',
      category: 'WebSocket',
      assignedAgent: 'unassigned',
      riskTier: 'TIER_1_SAFE_PROBE',
    });

    const firstClaim = store.claimNextHypothesis(campaignId, 'worker-stalled', 25);
    expect(firstClaim?.id).toBe('wq-ttl-1');
    expect(firstClaim?.assignedAgent).toBe('worker-stalled');

    // While lease is still active, another worker receives null
    expect(store.claimNextHypothesis(campaignId, 'worker-healthy', 5_000)).toBeNull();

    // Wait for lease TTL to expire
    await delay(40);

    const reclaimed = store.claimNextHypothesis(campaignId, 'worker-healthy', 5_000);
    expect(reclaimed?.id).toBe('wq-ttl-1');
    expect(reclaimed?.assignedAgent).toBe('worker-healthy');
    expect(reclaimed?.status).toBe('leased');

    // Manual requeue clears lease and makes item queued again
    const requeued = store.requeueHypothesis(campaignId, 'wq-ttl-1', 'Paused and requeued');
    expect(requeued.status).toBe('queued');
    expect(requeued.leaseExpiresAt).toBeUndefined();
  });

  it('deduplicates shared knowledge nodes and skips hypotheses matching negative_result entries', () => {
    const store = new SharedKnowledgeStore();
    const campaignId = 'camp-dedup';

    store.seedCampaignMemory(campaignId, [], []);

    const n1 = store.upsertKnowledge(campaignId, {
      kind: 'endpoint',
      title: 'GET /api/me',
      detail: 'Returns caller session profile',
      discoveredBy: 'mapper-1',
    });
    const n2 = store.upsertKnowledge(campaignId, {
      kind: 'endpoint',
      title: '  get /api/me  ',
      detail: 'Returns caller session profile + workspace roles',
      discoveredBy: 'mapper-2',
    });

    expect(n2.id).toBe(n1.id);
    expect(store.listKnowledge(campaignId)).toHaveLength(1);
    expect(store.listKnowledge(campaignId)[0]?.detail).toContain('workspace roles');

    // Record a negative result directly in shared knowledge
    store.upsertKnowledge(campaignId, {
      kind: 'negative_result',
      title: 'GET /api/documents/:id cross-workspace read',
      detail: 'Enforces @require_workspace_member and returns 403',
      discoveredBy: 'verifier-alpha',
    });

    expect(
      store.hasFalsifiedEquivalent(
        campaignId,
        'Check whether `GET /api/documents/:id` cross-workspace read succeeds for Bob',
      ),
    ).toBe(true);

    store.enqueueHypothesis(campaignId, {
      id: 'wq-skip',
      hypothesis: 'Check whether `GET /api/documents/:id` cross-workspace read succeeds for Bob',
      category: 'REST ACL',
      assignedAgent: 'unassigned',
      riskTier: 'TIER_1_SAFE_PROBE',
    });
    store.enqueueHypothesis(campaignId, {
      id: 'wq-valid',
      hypothesis: 'Compare saved search SQL parameterization in background ZIP export',
      category: 'Export Worker',
      assignedAgent: 'unassigned',
      riskTier: 'TIER_1_SAFE_PROBE',
    });

    // Claim skips wq-skip (marking it falsified) and claims wq-valid
    const claimed = store.claimNextHypothesis(campaignId, 'verifier-beta');
    expect(claimed?.id).toBe('wq-valid');

    const queue = store.listWorkQueue(campaignId);
    expect(queue.find((i) => i.id === 'wq-skip')?.status).toBe('falsified');

    // Falsifying a claimed hypothesis automatically publishes a negative_result node
    store.completeHypothesis(campaignId, 'wq-valid', 'falsified', 'Query was parameterized');
    expect(
      store.hasFalsifiedEquivalent(
        campaignId,
        'Compare saved search SQL parameterization in background ZIP export',
      ),
    ).toBe(true);
    expect(
      store.listKnowledge(campaignId).filter((k) => k.kind === 'negative_result'),
    ).toHaveLength(2);
  });
});
