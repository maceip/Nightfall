import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import {
  isDebugBuildRequested,
  resolveDesktopProductFlavor,
} from '../../scripts/desktop-product-identity.mjs';

function readBuildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'local';
  }
}

const pkgJson = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string };

export default defineConfig(({ mode }) => {
  const isDebugBuild = isDebugBuildRequested(process.env);
  const productFlavor = resolveDesktopProductFlavor(process.env);

  return {
    // Relative asset base required for packaged Electron loadFile(file://...) (mirrors zcode)
    base: './',
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        '@nightfall/core-contracts': path.resolve(
          __dirname,
          '../../packages/core-contracts/src/index.ts',
        ),
        '@nightfall/ui-kit/styles.css': path.resolve(
          __dirname,
          '../../packages/ui-kit/src/styles/webclaw.css',
        ),
        '@nightfall/ui-kit': path.resolve(__dirname, '../../packages/ui-kit/src/index.ts'),
      },
      dedupe: ['react', 'react-dom'],
    },
    define: {
      __NIGHTFALL_VERSION__: JSON.stringify(pkgJson.version),
      __NIGHTFALL_COMMIT__: JSON.stringify(readBuildCommit()),
      __NIGHTFALL_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __NIGHTFALL_PRODUCT_FLAVOR__: JSON.stringify(productFlavor),
      __NIGHTFALL_DEBUG_BUILD__: JSON.stringify(isDebugBuild),
    },
    worker: {
      rollupOptions: {
        // Prevent Rollup from tree-shaking worker message listeners to 0B (mirrors zcode)
        treeshake: false,
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Debug builds retain full sourcemaps; production release builds use hidden sourcemaps
      sourcemap: isDebugBuild || mode !== 'production' ? true : 'hidden',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/@hugeicons')) return 'vendor-icons';
            if (id.includes('node_modules/@base-ui')) return 'vendor-base-ui';
            if (id.includes('node_modules/react')) return 'vendor-react';
            return undefined;
          },
        },
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
  };
});
