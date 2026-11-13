import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@nightfall/core-contracts': path.resolve(__dirname, 'packages/core-contracts/src/index.ts'),
      '@nightfall/mock-fixtures': path.resolve(__dirname, 'packages/mock-fixtures/src/index.ts'),
      '@nightfall/sandbox-runtime': path.resolve(__dirname, 'packages/sandbox-runtime/src/index.ts'),
      '@nightfall/policy-gate': path.resolve(__dirname, 'packages/policy-gate/src/index.ts'),
      '@nightfall/shared-memory': path.resolve(__dirname, 'packages/shared-memory/src/index.ts'),
      '@nightfall/audit-ledger': path.resolve(__dirname, 'packages/audit-ledger/src/index.ts'),
      '@nightfall/model-gateway': path.resolve(__dirname, 'packages/model-gateway/src/index.ts'),
      '@nightfall/ui-kit': path.resolve(__dirname, 'packages/ui-kit/src/index.ts'),
      '@nightfall/red-team': path.resolve(__dirname, 'services/red-team/src/index.ts'),
      '@nightfall/defense-factory': path.resolve(__dirname, 'services/defense-factory/src/index.ts'),
      '@nightfall/closed-loop-orchestrator': path.resolve(__dirname, 'services/closed-loop-orchestrator/src/index.ts'),
      '@nightfall/api-gateway': path.resolve(__dirname, 'services/api-gateway/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/**/*.test.ts',
      'services/**/*.test.ts',
      'apps/**/*.test.{ts,tsx}',
      'benchmarks/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 20000,
  },
});
