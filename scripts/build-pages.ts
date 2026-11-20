import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NightfallOrchestrator } from '../services/closed-loop-orchestrator/src/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiRoot = path.join(repoRoot, 'apps', 'nightfall-ui');
const outDir = path.join(uiRoot, 'dist-pages');

async function main(): Promise<void> {
  console.log('[build-pages] Compiling Nightfall Vite bundle (--mode pages)...');
  const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  execFileSync(
    pnpmBin,
    ['--filter', '@nightfall/nightfall-ui', 'exec', 'vite', 'build', '--mode', 'pages', '--outDir', 'dist-pages'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NIGHTFALL_PAGES_BASE: './',
      },
    },
  );

  mkdirSync(outDir, { recursive: true });

  console.log('[build-pages] Executing real NightfallOrchestrator cold bootstrap capture...');
  const orchestrator = new NightfallOrchestrator({ sqlitePath: ':memory:' });
  try {
    await orchestrator.ensureBootstrapped();
    const payload = orchestrator.getBootstrapState();
    const scorecardChecks = await orchestrator.listScorecardChecks().catch(() => []);
    const payloadJson = JSON.stringify(payload);
    const payloadSha256 = createHash('sha256').update(payloadJson).digest('hex');

    if (payload.findings.length === 0 || payload.fixes.length === 0) {
      throw new Error(
        `Unexpected empty orchestrator capture (findings=${payload.findings.length}, fixes=${payload.fixes.length})`,
      );
    }

    const envelope = {
      capturedAt: new Date().toISOString(),
      payloadSha256,
      payload,
      scorecardChecks,
    };

    const capturePath = path.join(outDir, 'captured-bootstrap.json');
    writeFileSync(capturePath, JSON.stringify(envelope), 'utf8');
    console.log(
      `[build-pages] Wrote verified capture: findings=${payload.findings.length}, fixes=${payload.fixes.length}, scorecardChecks=${scorecardChecks.length}, sha256=${payloadSha256.slice(0, 16)}...`,
    );
  } finally {
    await orchestrator.dispose();
  }

  const indexHtmlPath = path.join(outDir, 'index.html');
  const notFoundHtmlPath = path.join(outDir, '404.html');
  const noJekyllPath = path.join(outDir, '.nojekyll');

  copyFileSync(indexHtmlPath, notFoundHtmlPath);
  writeFileSync(noJekyllPath, '', 'utf8');

  const requiredAssets = [
    'index.html',
    '404.html',
    '.nojekyll',
    'captured-bootstrap.json',
    'favicon.png',
    'og-card.png',
    'preview-console-light.png',
    'preview-console-dark.png',
    'pillar-defense.webp',
    'pillar-red-team.webp',
    'pillar-scorecard.webp',
  ];

  for (const rel of requiredAssets) {
    const abs = path.join(outDir, rel);
    if (!existsSync(abs)) {
      throw new Error(`[build-pages] Missing required Pages output file: ${abs}`);
    }
    if (rel !== '.nojekyll' && statSync(abs).size < 64) {
      throw new Error(`[build-pages] Unexpectedly small Pages output file: ${abs}`);
    }
  }

  console.log(`[build-pages] GitHub Pages bundle ready at ${outDir}`);
}

main().catch((err) => {
  console.error('[build-pages] FAILED:', err);
  process.exit(1);
});
