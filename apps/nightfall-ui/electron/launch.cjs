'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

try {
  const electronBinary = require('electron');
  const child = spawn(String(electronBinary), [path.join(__dirname, 'main.cjs')], {
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
      'Run `pnpm dev:web` for instant browser preview, or install `electron` locally on macOS/Windows/Linux to launch the native hiddenInset window.',
  );
  process.exit(0);
}
