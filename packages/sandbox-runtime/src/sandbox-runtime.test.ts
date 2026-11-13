import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DisposableSandboxRuntime } from './index.js';

describe('@nightfall/sandbox-runtime', () => {
  const runtimes: DisposableSandboxRuntime[] = [];

  afterEach(async () => {
    for (const rt of runtimes.splice(0)) {
      await rt.destroyAll();
    }
  });

  it('creates isolated ephemeral sandboxes, reads/writes files, and proves directory disposal via SHA-256 TeardownAttestation', async () => {
    const rt = new DisposableSandboxRuntime();
    runtimes.push(rt);

    const sbx = await rt.createSandbox({
      prefix: 'replay',
      maxDurationMs: 10_000,
      files: {
        'README.txt': 'clean-room verification',
        'src/probe.js': 'console.log("ok");\n',
      },
    });

    expect(sbx.id.startsWith('replay-')).toBe(true);
    expect(sbx.workDir.startsWith(path.join(os.tmpdir(), 'nightfall-sandboxes'))).toBe(true);
    expect(sbx.destroyed).toBe(false);

    await rt.writeSandboxFile(sbx.id, 'nested/artifact.json', '{"verified":true}');
    const content = await rt.readSandboxFile(sbx.id, 'nested/artifact.json');
    expect(content).toBe('{"verified":true}');

    const attestation = await rt.destroySandbox(sbx.id);
    expect(attestation.sandboxId).toBe(sbx.id);
    expect(attestation.filesErasedCount).toBe(3);
    expect(attestation.sha256Attestation).toMatch(/^[0-9a-f]{64}$/);

    await expect(fs.access(sbx.workDir)).rejects.toThrow();
    await expect(rt.readSandboxFile(sbx.id, 'README.txt')).rejects.toThrow(/destroyed/);
    expect(rt.getAttestations()).toHaveLength(1);
  });

  it('prevents path traversal and symlink escapes outside sandbox workDir', async () => {
    const rt = new DisposableSandboxRuntime();
    runtimes.push(rt);

    const sbx = await rt.createSandbox({ prefix: 'traversal' });

    await expect(rt.writeSandboxFile(sbx.id, '../escaped.txt', 'bad')).rejects.toThrow(
      /Path traversal blocked/,
    );
    await expect(
      rt.writeSandboxFile(sbx.id, 'nested/../../outside.txt', 'bad'),
    ).rejects.toThrow(/Path traversal blocked/);
    await expect(rt.writeSandboxFile(sbx.id, '/tmp/absolute-escape.txt', 'bad')).rejects.toThrow(
      /Path traversal blocked/,
    );
    await expect(rt.readSandboxFile(sbx.id, '../../etc/hostname')).rejects.toThrow(
      /Path traversal blocked/,
    );

    // Symlink escape defense
    await fs.symlink('/etc/hostname', path.join(sbx.workDir, 'host-link'));
    await expect(rt.readSandboxFile(sbx.id, 'host-link')).rejects.toThrow(/escape blocked/i);
  });

  it('executes commands with scrubbed environment variables and captures exit codes', async () => {
    const rt = new DisposableSandboxRuntime();
    runtimes.push(rt);

    process.env.NIGHTFALL_TEST_AMBIENT_SECRET = 'super-secret-do-not-leak';
    try {
      const sbx = await rt.createSandbox({
        prefix: 'exec',
        files: {
          'inspect-env.mjs': [
            'console.log(JSON.stringify({',
            '  home: process.env.HOME,',
            '  ambientSecret: process.env.NIGHTFALL_TEST_AMBIENT_SECRET ?? null,',
            '  customFlag: process.env.CUSTOM_FLAG ?? null,',
            '}));',
          ].join('\n'),
        },
      });

      const okRes = await rt.execInSandbox(sbx.id, process.execPath, ['inspect-env.mjs'], {
        env: { CUSTOM_FLAG: 'enabled' },
      });
      expect(okRes.exitCode).toBe(0);
      const parsed = JSON.parse(okRes.stdout.trim()) as {
        home: string;
        ambientSecret: string | null;
        customFlag: string | null;
      };
      expect(parsed.home).toBe(sbx.workDir);
      expect(parsed.ambientSecret).toBeNull();
      expect(parsed.customFlag).toBe('enabled');

      const nonZeroRes = await rt.execInSandbox(sbx.id, process.execPath, [
        '-e',
        'console.error("expected failure"); process.exit(3);',
      ]);
      expect(nonZeroRes.exitCode).toBe(3);
      expect(nonZeroRes.stderr).toContain('expected failure');
    } finally {
      delete process.env.NIGHTFALL_TEST_AMBIENT_SECRET;
    }
  });

  it('enforces strict command timeout and terminates runaway child processes', async () => {
    const rt = new DisposableSandboxRuntime();
    runtimes.push(rt);

    const sbx = await rt.createSandbox({ prefix: 'timeout', maxDurationMs: 5_000 });
    const started = performance.now();

    await expect(
      rt.execInSandbox(
        sbx.id,
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000);'],
        { timeoutMs: 120 },
      ),
    ).rejects.toThrow(/timed out/i);

    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(2_000);
  });
});
