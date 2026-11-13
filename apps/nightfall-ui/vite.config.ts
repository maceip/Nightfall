import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@nightfall/core-contracts': path.resolve(
        __dirname,
        '../../packages/core-contracts/src/index.ts',
      ),
      '@nightfall/mock-fixtures': path.resolve(
        __dirname,
        '../../packages/mock-fixtures/src/index.ts',
      ),
      '@nightfall/ui-kit': path.resolve(__dirname, '../../packages/ui-kit/src/index.ts'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.NIGHTFALL_API_TARGET ?? 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.NIGHTFALL_API_TARGET ?? 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});
