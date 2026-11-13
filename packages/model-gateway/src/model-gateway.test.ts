import { describe, expect, it } from 'vitest';
import { ModelGateway } from './index.js';

describe('@nightfall/model-gateway', () => {
  it('lists all 4 Nightfall security models with zero legacy brand identifiers', () => {
    const gateway = new ModelGateway();
    const models = gateway.listModels();

    expect(models.map((m) => m.id)).toEqual([
      'gpt-6-cyber-ultra',
      'claude-4-6-sonnet-sec',
      'gemini-3-pro-sec',
      'nightfall-local-verifier',
    ]);

    const serialized = JSON.stringify(models).toLowerCase();
    expect(serialized).not.toContain('day' + 'break');
    expect(serialized).not.toContain('co' + 'dex');
  });

  it('routes structured tasks across multiple models deterministically and supports task handlers and opted-in fetch adapters', async () => {
    const gateway = new ModelGateway({ budgetUsd: 1.0 });

    const r1 = await gateway.completeStructured({
      modelId: 'gpt-6-cyber-ultra',
      task: 'surface-map',
      prompt: 'Map endpoints in search_exports.py',
      fallbackValue: { endpoints: ['/api/workspaces/:id/exports'] },
      estimatedTokens: 1000,
    });
    expect(r1.modelId).toBe('gpt-6-cyber-ultra');
    expect(r1.output).toEqual({ endpoints: ['/api/workspaces/:id/exports'] });
    expect(r1.tokensUsed).toBe(1000);
    expect(r1.costUsd).toBeGreaterThan(0);

    const r2 = await gateway.completeStructured({
      modelId: 'claude-4-6-sonnet-sec',
      task: 'patch-synth',
      prompt: 'Synthesize minimal diff for F-002',
      fallbackValue: { filesChanged: 1 },
      estimatedTokens: 500,
    });
    expect(r2.modelId).toBe('claude-4-6-sonnet-sec');
    expect(r2.output).toEqual({ filesChanged: 1 });

    gateway.registerTaskHandler('patch-critic', (input) => {
      return {
        ...(input.fallbackValue as Record<string, unknown>),
        reviewedByHandler: true,
      } as typeof input.fallbackValue;
    });

    const r3 = await gateway.completeStructured({
      modelId: 'gemini-3-pro-sec',
      task: 'patch-critic',
      prompt: 'Review minimal patch diff',
      fallbackValue: { approved: true, reviewedByHandler: false },
      estimatedTokens: 400,
    });
    expect(r3.output).toEqual({ approved: true, reviewedByHandler: true });

    const r4 = await gateway.completeStructured({
      modelId: 'nightfall-local-verifier',
      task: 'triage',
      prompt: 'Verify severity classification',
      fallbackValue: { severity: 'high' as const },
      estimatedTokens: 200,
    });
    expect(r4.output.severity).toBe('high');

    const usage = gateway.getUsageSummary();
    expect(usage.totalCalls).toBe(4);
    expect(usage.totalTokens).toBe(2100);
    expect(usage.totalCostUsd).toBeGreaterThan(0);
    expect(usage.remainingPct).toBeLessThan(100);
    expect(usage.remainingPct).toBeGreaterThan(90);

    // Opted-in live provider adapter with injected fetchImpl
    process.env.OPENAI_API_KEY = 'test-ephemeral-key';
    try {
      const liveGw = new ModelGateway({
        budgetUsd: 5.0,
        enableLiveProviders: true,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"liveVerified":true}' } }],
              usage: { total_tokens: 320 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      });
      const liveRes = await liveGw.completeStructured({
        modelId: 'gpt-6-cyber-ultra',
        task: 'followup',
        prompt: 'Explain fix',
        fallbackValue: { liveVerified: false },
      });
      expect(liveRes.output).toEqual({ liveVerified: true });
      expect(liveRes.tokensUsed).toBe(320);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }

    await expect(
      gateway.completeStructured({
        modelId: 'unknown-model-id',
        task: 'triage',
        prompt: 'test',
        fallbackValue: {},
      }),
    ).rejects.toThrow(/Unsupported Nightfall modelId/);
  });

  it('trips cost-budget circuit breaker when totalCostUsd >= budgetUsd', async () => {
    // 1,000 tokens on gpt-6-cyber-ultra = $0.015
    const gateway = new ModelGateway({ budgetUsd: 0.025 });

    await gateway.completeStructured({
      modelId: 'gpt-6-cyber-ultra',
      task: 'triage',
      prompt: 'First call ($0.015)',
      fallbackValue: { ok: true },
      estimatedTokens: 1000,
    });
    expect(gateway.getUsageSummary().totalCostUsd).toBeCloseTo(0.015, 6);

    await gateway.completeStructured({
      modelId: 'gpt-6-cyber-ultra',
      task: 'triage',
      prompt: 'Second call ($0.015 -> $0.030 >= $0.025)',
      fallbackValue: { ok: true },
      estimatedTokens: 1000,
    });
    expect(gateway.getUsageSummary().totalCostUsd).toBeCloseTo(0.03, 6);
    expect(gateway.getUsageSummary().remainingPct).toBe(0);

    await expect(
      gateway.completeStructured({
        modelId: 'gpt-6-cyber-ultra',
        task: 'triage',
        prompt: 'Third call blocked by circuit breaker',
        fallbackValue: { ok: false },
        estimatedTokens: 100,
      }),
    ).rejects.toThrow(/circuit breaker/i);

    expect(gateway.getUsageSummary().totalCalls).toBe(2);
  });
});
