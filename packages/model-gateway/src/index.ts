import { ModelDescriptorSchema, type ModelDescriptor } from '@nightfall/core-contracts';

export const PACKAGE_NAME = '@nightfall/model-gateway';

export type ModelTask =
  | 'surface-map'
  | 'triage'
  | 'patch-synth'
  | 'patch-critic'
  | 'followup';

export interface CompleteStructuredInput<T> {
  modelId: string;
  task: ModelTask;
  prompt: string;
  fallbackValue: T;
  estimatedTokens?: number;
}

export interface CompleteStructuredResult<T> {
  modelId: string;
  output: T;
  tokensUsed: number;
  costUsd: number;
}

export interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  budgetUsd: number;
  remainingPct: number;
}

export type DeterministicTaskHandler = <T>(
  input: CompleteStructuredInput<T>,
) => T | Promise<T>;

export interface ModelGatewayOptions {
  budgetUsd?: number;
  enableLiveProviders?: boolean;
  fetchImpl?: typeof fetch;
  taskHandlers?: Partial<Record<ModelTask, DeterministicTaskHandler>>;
  models?: ModelDescriptor[];
}

const DEFAULT_BUDGET_USD = 25.0;

const NIGHTFALL_MODELS: ModelDescriptor[] = [
  {
    id: 'gpt-6-cyber-ultra',
    label: 'GPT-6 Cyber Ultra',
    provider: 'openai',
    tier: 'frontier-cyber',
  },
  {
    id: 'claude-4-6-sonnet-sec',
    label: 'Claude Sonnet Security',
    provider: 'anthropic',
    tier: 'frontier-cyber',
  },
  {
    id: 'gemini-3-pro-sec',
    label: 'Gemini 3 Pro Security',
    provider: 'google',
    tier: 'frontier-cyber',
  },
  {
    id: 'nightfall-local-verifier',
    label: 'Nightfall Deterministic Sim',
    provider: 'nightfall-sim',
    tier: 'fast-triage',
  },
];

const COST_PER_1K_TOKENS_USD: Record<string, number> = {
  'gpt-6-cyber-ultra': 0.015,
  'claude-4-6-sonnet-sec': 0.012,
  'gemini-3-pro-sec': 0.01,
  'nightfall-local-verifier': 0.001,
};

function estimateTokenCount(prompt: string, fallbackValue: unknown): number {
  const serializedFallback = JSON.stringify(fallbackValue ?? '') ?? '';
  return Math.max(32, Math.ceil((prompt.length + serializedFallback.length) / 4));
}

export class ModelGateway {
  private readonly models: ModelDescriptor[];
  private budgetUsd: number;
  private readonly enableLiveProviders: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly taskHandlers: Partial<Record<ModelTask, DeterministicTaskHandler>>;

  private totalCalls = 0;
  private totalTokens = 0;
  private totalCostUsd = 0;

  constructor(optionsOrBudget?: number | ModelGatewayOptions) {
    if (typeof optionsOrBudget === 'number') {
      this.budgetUsd = optionsOrBudget;
      this.enableLiveProviders = false;
      this.fetchImpl = globalThis.fetch;
      this.taskHandlers = {};
      this.models = NIGHTFALL_MODELS.map((m) => ModelDescriptorSchema.parse(m));
    } else {
      this.budgetUsd = optionsOrBudget?.budgetUsd ?? DEFAULT_BUDGET_USD;
      this.enableLiveProviders =
        optionsOrBudget?.enableLiveProviders ??
        process.env.NIGHTFALL_ENABLE_LIVE_MODELS === 'true';
      this.fetchImpl = optionsOrBudget?.fetchImpl ?? globalThis.fetch;
      this.taskHandlers = { ...(optionsOrBudget?.taskHandlers ?? {}) };
      this.models = (optionsOrBudget?.models ?? NIGHTFALL_MODELS).map((m) =>
        ModelDescriptorSchema.parse(m),
      );
    }
  }

  listModels(): ModelDescriptor[] {
    return this.models.map((m) => ({ ...m }));
  }

  registerTaskHandler(task: ModelTask, handler: DeterministicTaskHandler): void {
    this.taskHandlers[task] = handler;
  }

  setBudgetUsd(budgetUsd: number): void {
    this.budgetUsd = budgetUsd;
  }

  private async tryLiveProviderCompletion<T>(
    model: ModelDescriptor,
    input: CompleteStructuredInput<T>,
  ): Promise<{ output: T; tokensUsed?: number } | null> {
    if (!this.enableLiveProviders || typeof this.fetchImpl !== 'function') {
      return null;
    }

    const systemInstruction = `You are a Nightfall security analysis engine executing task "${input.task}". Respond ONLY with valid JSON.`;

    try {
      if (model.provider === 'openai' && process.env.OPENAI_API_KEY) {
        const res = await this.fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model.id,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: input.prompt },
            ],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { total_tokens?: number };
          };
          const rawText = data.choices?.[0]?.message?.content;
          if (rawText) {
            return {
              output: JSON.parse(rawText) as T,
              tokensUsed: data.usage?.total_tokens,
            };
          }
        }
      } else if (model.provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
        const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model.id,
            max_tokens: 2048,
            system: systemInstruction,
            messages: [{ role: 'user', content: input.prompt }],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            content?: Array<{ text?: string }>;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          const rawText = data.content?.[0]?.text;
          if (rawText) {
            const tokens =
              (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
            return {
              output: JSON.parse(rawText) as T,
              tokensUsed: tokens > 0 ? tokens : undefined,
            };
          }
        }
      } else if (model.provider === 'google' && process.env.GEMINI_API_KEY) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: { responseMimeType: 'application/json' },
            contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\n${input.prompt}` }] }],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            usageMetadata?: { totalTokenCount?: number };
          };
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            return {
              output: JSON.parse(rawText) as T,
              tokensUsed: data.usageMetadata?.totalTokenCount,
            };
          }
        }
      }
    } catch {
      // Gracefully fall back to deterministic handler / fallbackValue on provider errors
    }

    return null;
  }

  async completeStructured<T>(
    input: CompleteStructuredInput<T>,
  ): Promise<CompleteStructuredResult<T>> {
    if (this.totalCostUsd >= this.budgetUsd) {
      throw new Error(
        `Model budget circuit breaker tripped: totalCostUsd ($${this.totalCostUsd.toFixed(6)}) >= budgetUsd ($${this.budgetUsd.toFixed(6)}).`,
      );
    }

    const model = this.models.find((m) => m.id === input.modelId);
    if (!model) {
      throw new Error(`Unsupported Nightfall modelId: "${input.modelId}".`);
    }

    let output: T;
    let tokensUsed =
      input.estimatedTokens !== undefined && input.estimatedTokens > 0
        ? Math.ceil(input.estimatedTokens)
        : estimateTokenCount(input.prompt, input.fallbackValue);

    const liveResult = await this.tryLiveProviderCompletion(model, input);
    if (liveResult !== null) {
      output = liveResult.output;
      if (liveResult.tokensUsed !== undefined && liveResult.tokensUsed > 0) {
        tokensUsed = liveResult.tokensUsed;
      }
    } else {
      const handler = this.taskHandlers[input.task];
      if (handler) {
        output = await handler(input);
      } else {
        output = structuredClone(input.fallbackValue);
      }
    }

    const ratePer1k = COST_PER_1K_TOKENS_USD[model.id] ?? 0.01;
    const costUsd = Number(((tokensUsed / 1000) * ratePer1k).toFixed(8));

    this.totalCalls += 1;
    this.totalTokens += tokensUsed;
    this.totalCostUsd = Number((this.totalCostUsd + costUsd).toFixed(8));

    return {
      modelId: model.id,
      output,
      tokensUsed,
      costUsd,
    };
  }

  getUsageSummary(): UsageSummary {
    const remainingPct =
      this.budgetUsd <= 0
        ? 0
        : Math.max(
            0,
            Math.min(
              100,
              Number((((this.budgetUsd - this.totalCostUsd) / this.budgetUsd) * 100).toFixed(2)),
            ),
          );

    return {
      totalCalls: this.totalCalls,
      totalTokens: this.totalTokens,
      totalCostUsd: this.totalCostUsd,
      budgetUsd: this.budgetUsd,
      remainingPct,
    };
  }
}
