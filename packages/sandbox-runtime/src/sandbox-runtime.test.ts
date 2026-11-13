import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DisposableSandboxRuntime,
  LITEBOX_PINNED_COMMIT,
  LITEBOX_UPSTREAM_REPO,
  buildLiteBoxRunnerInvocation,
} from './index.js';

describe('@nightfall/sandbox-runtime (Microsoft LiteBox Library OS + Confined Process)', () => {
  const runtimes: DisposableSandboxRuntime[] = [];

  afterEach(async () => {
    for (const rt of runtimes.splice(0)) {
      await rt.destroyAll();
    }
  });

  it('discovers the installed Microsoft LiteBox toolchain (runner, packager, syscall rewriter)', () => {
    const rt = new DisposableSandboxRuntime();
    const status = rt.getToolchainStatus();

    expect(status.upstreamRepo).toBe(LITEBOX_UPSTREAM_REPO);
    expect(status.pinnedCommit).toBe(LITEBOX_PINNED_COMMIT);
    expect(status.northShim).toBe('litebox_shim_linux');
    expect(status.southPlatform).toBe('linux_userland');
    expect(status.available).toBe(true);
    expect(status.runnerBinaryPath).toContain('litebox_runner_linux_userland');
    expect(status.packagerBinaryPath).toContain('litebox_packager');
    expect(status.syscallRewriterBinaryPath).toContain('litebox_syscall_rewriter');
  });

  it('executes ELF binaries inside real Microsoft LiteBox Library OS and blocks host filesystem reads (/etc/hostname)', async () => {
    const rt = new DisposableSandboxRuntime({ defaultMode: 'litebox-strict' });
    runtimes.push(rt);

    const sbx = await rt.createSandbox({
      prefix: 'litebox-elf',
      maxDurationMs: 15_000,
      files: {
        'canary.txt': 'NS-litebox-isolated-canary',
      },
    });

    expect(sbx.liteboxAvailable).toBe(true);

    // 1. Authorized read inside LiteBox's tar + InMem /sandbox rootfs succeeds
    const allowedRead = await rt.execInSandbox(sbx.id, '/usr/bin/cat', ['canary.txt']);
    expect(allowedRead.exitCode).toBe(0);
    expect(allowedRead.backendUsed).toBe('microsoft-litebox');
    expect(allowedRead.stdout.trim()).toBe('NS-litebox-isolated-canary');

    // 2. Attempting to read host /etc/hostname inside LiteBox fails because host FS is absent from tar_ro + InMem
    const hostEscapeAttempt = await rt.execInSandbox(sbx.id, '/usr/bin/cat', ['/etc/hostname']);
    expect(hostEscapeAttempt.backendUsed).toBe('microsoft-litebox');
    expect(hostEscapeAttempt.exitCode).not.toBe(0);

    const attestation = await rt.destroySandbox(sbx.id);
    expect(attestation.backend).toBe('microsoft-litebox');
    expect(attestation.northShim).toBe('litebox_shim_linux');
    expect(attestation.southPlatform).toBe('linux_userland');
    expect(attestation.tarBundlesErasedCount).toBe(2);
    expect(attestation.sha256Attestation).toMatch(/^[0-9a-f]{64}$/);
  });

  it('executes multi-file Python 3 verification workloads inside real Microsoft LiteBox without ambient env leakage', async () => {
    const rt = new DisposableSandboxRuntime({ defaultMode: 'litebox-strict' });
    runtimes.push(rt);

    process.env.NIGHTFALL_HOST_SECRET = 'never-expose-to-litebox';
    try {
      const sbx = await rt.createSandbox({
        prefix: 'litebox-py',
        maxDurationMs: 20_000,
        files: {
          'guard.py': [
            'def can_export(doc_workspace: str, caller_workspace: str) -> bool:',
            '    return bool(caller_workspace) and doc_workspace == caller_workspace',
          ].join('\n'),
          'verify_guard.py': [
            'import json, os, guard',
            'print(json.dumps({',
            '  "same_ws": guard.can_export("ws-a", "ws-a"),',
            '  "cross_ws": guard.can_export("ws-a", "ws-b"),',
            '  "host_secret": os.environ.get("NIGHTFALL_HOST_SECRET"),',
            '  "custom_flag": os.environ.get("LITEBOX_CHECK"),',
            '}))',
          ].join('\n'),
        },
      });

      const res = await rt.execInSandbox(sbx.id, 'python3', ['verify_guard.py'], {
        env: { LITEBOX_CHECK: 'active' },
      });

      expect(res.exitCode).toBe(0);
      expect(res.backendUsed).toBe('microsoft-litebox');

      const jsonLine = res.stdout
        .trim()
        .split('\n')
        .find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const parsed = JSON.parse(jsonLine!) as {
        same_ws: boolean;
        cross_ws: boolean;
        host_secret: string | null;
        custom_flag: string | null;
      };

      expect(parsed.same_ws).toBe(true);
      expect(parsed.cross_ws).toBe(false);
      expect(parsed.host_secret).toBeNull();
      expect(parsed.custom_flag).toBe('active');
    } finally {
      delete process.env.NIGHTFALL_HOST_SECRET;
    }
  });

  it('constructs deterministic LiteBox CLI invocations across Linux userland, Windows userland, and SEV-SNP South profiles', () => {
    const winSpec = buildLiteBoxRunnerInvocation({
      toolchain: {
        runnerBinaryPath: 'C:\\nightfall\\litebox\\litebox_runner_linux_on_windows_userland.exe',
        northShim: 'litebox_shim_linux',
        southPlatform: 'windows_userland',
      },
      tarBundlePath: 'C:\\temp\\bundle.tar',
      guestProgramPath: '/usr/bin/python3',
      guestArgs: ['/sandbox/check.py'],
      env: { NIGHTFALL_SCOPE: 'local' },
      tunDeviceName: 'nf-tun0',
    });

    expect(winSpec.southPlatform).toBe('windows_userland');
    expect(winSpec.runnerArgs).toContain('--unstable');
    expect(winSpec.runnerArgs).not.toContain('--forward-env');
    expect(winSpec.runnerArgs).toContain('--tun-device-name');
    expect(winSpec.runnerArgs).toContain('nf-tun0');
    expect(winSpec.runnerArgs).toContain('--program-from-tar');
  });

  it('creates isolated ephemeral sandboxes, blocks path/symlink escapes, and enforces timeouts', async () => {
    const rt = new DisposableSandboxRuntime();
    runtimes.push(rt);

    const sbx = await rt.createSandbox({
      prefix: 'replay',
      maxDurationMs: 5_000,
      files: {
        'README.txt': 'clean-room verification',
      },
    });

    expect(sbx.workDir.startsWith(path.join(os.tmpdir(), 'nightfall-sandboxes'))).toBe(true);

    await expect(rt.writeSandboxFile(sbx.id, '../escaped.txt', 'bad')).rejects.toThrow(
      /Path traversal blocked/,
    );
    await fs.symlink('/etc/hostname', path.join(sbx.workDir, 'host-link'));
    await expect(rt.readSandboxFile(sbx.id, 'host-link')).rejects.toThrow(/escape blocked/i);

    await expect(
      rt.execInSandbox(
        sbx.id,
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000);'],
        { timeoutMs: 120 },
      ),
    ).rejects.toThrow(/timed out/i);

    const attestation = await rt.destroySandbox(sbx.id);
    expect(attestation.sha256Attestation).toMatch(/^[0-9a-f]{64}$/);
    await expect(fs.access(sbx.workDir)).rejects.toThrow();
  });
});
