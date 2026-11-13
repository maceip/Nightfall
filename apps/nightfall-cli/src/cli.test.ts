import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifySignedCampaignManifest } from '@nightfall/core-contracts';
import { NORTHSTAR_CAMPAIGN_YAML } from '@nightfall/mock-fixtures';
import { AuditLedger } from '@nightfall/audit-ledger';
import { runNightfallCli } from './index.js';

describe('@nightfall/nightfall-cli commands', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('supports validate, sign, status, and verify-audit (detecting tampering)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-cli-test-'));
    tempDirs.push(tmpDir);

    const yamlPath = path.join(tmpDir, 'campaign.yaml');
    await fs.writeFile(yamlPath, NORTHSTAR_CAMPAIGN_YAML, 'utf8');

    // 1. validate
    const valRes = await runNightfallCli(['validate', yamlPath]);
    expect(valRes.exitCode).toBe(0);
    expect(valRes.stdout).toContain('northstar-docs-staging');

    // Invalid YAML fails cleanly
    const badPath = path.join(tmpDir, 'bad.yaml');
    await fs.writeFile(badPath, 'objective: ""\n', 'utf8');
    const badRes = await runNightfallCli(['validate', badPath]);
    expect(badRes.exitCode).toBe(1);

    // 2. sign
    const signedOutPath = path.join(tmpDir, 'signed-scope.json');
    const signRes = await runNightfallCli(['sign', yamlPath, '--out', signedOutPath]);
    expect(signRes.exitCode).toBe(0);
    expect(signRes.signedManifest).toBeDefined();
    expect(signRes.publicKeyPem).toBeDefined();
    expect(
      verifySignedCampaignManifest(signRes.signedManifest!, signRes.publicKeyPem!),
    ).toBe(true);

    // 3. status
    const statusRes = await runNightfallCli(['status']);
    expect(statusRes.exitCode).toBe(0);
    expect(statusRes.stdout).toContain('Nightfall Platform Status');
    expect(statusRes.stdout).toContain('550');

    // 4. verify-audit on intact vs tampered ledger JSON
    const ledger = new AuditLedger();
    ledger.append({
      subsystem: 'policy-gate',
      action: 'scope.signed',
      entityId: 'camp-1',
      actor: 'cli-test',
      summary: 'Initial signed manifest',
    });
    ledger.append({
      subsystem: 'red-team',
      action: 'probe.checked',
      entityId: 'camp-1',
      actor: 'cli-test',
      summary: 'Safe check completed',
    });

    const intactPath = path.join(tmpDir, 'audit-intact.json');
    await fs.writeFile(intactPath, JSON.stringify(ledger.list(), null, 2), 'utf8');

    const auditOk = await runNightfallCli(['verify-audit', '--file', intactPath]);
    expect(auditOk.exitCode).toBe(0);
    expect(auditOk.stdout).toContain('VERIFIED');

    const tamperedEntries = ledger.list();
    tamperedEntries[1] = {
      ...tamperedEntries[1]!,
      summary: 'Tampered post-hoc summary',
    };
    const tamperedPath = path.join(tmpDir, 'audit-tampered.json');
    await fs.writeFile(tamperedPath, JSON.stringify(tamperedEntries, null, 2), 'utf8');

    const auditBad = await runNightfallCli(['verify-audit', '--file', tamperedPath]);
    expect(auditBad.exitCode).toBe(1);
    expect(auditBad.stderr).toContain('FAILED');
  });
});
