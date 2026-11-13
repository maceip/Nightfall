'use strict';

const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

try {
  const electronBinary = require('electron');
  const bundledEntry = path.join(__dirname, '../out/main/index.js');
  const entryPoint = existsSync(bundledEntry) ? bundledEntry : path.join(__dirname, 'main.cjs');

  const child = spawn(String(electronBinary), [entryPoint], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NIGHTFALL_RENDERER_URL: process.env.NIGHTFALL_RENDERER_URL || 'http://localhost:5173',
    },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} catch {
  console.log(
    '[Nightfall Desktop] Electron binary not installed in this headless environment.\n' +
      'Run `pnpm dev:web` for instant browser preview, or `pnpm bundle:desktop` / GitHub Actions CI to build the `.dmg` and `.msi` installers.',
  );
  process.exit(0);
}
