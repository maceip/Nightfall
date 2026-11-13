import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifySignedCampaignManifest } from '@nightfall/core-contracts';
import { AuditLedger } from '@nightfall/audit-ledger';
import { runNightfallCli } from './index.js';

const SAMPLE_NORTHSTAR_CAMPAIGN_YAML = `objective: Check multi-tenant document and workspace access boundaries.

campaign:
  name: northstar-docs-staging
  targets:
    - https://staging.northstardocs.com
  source:
    archive: northstar-docs-source.tar.gz
  max_duration: 8h
  max_requests_per_second: 10

credentials:
  alice:
    file: credentials/alice.token
    workspaceHint: Workspace A
  bob:
    file: credentials/bob.token
    workspaceHint: Workspace B

http:
  allow:
    - methods: [GET, POST]
      path_prefixes: [/]

websocket:
  allow:
    - paths: [/ws/documents]
      origins: ["*"]
      operations: [open, send]
`;

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

  it('supports validate, sign, status (with real SQLite + LiteBox state), and verify-audit (detecting tampering)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-cli-test-'));
    tempDirs.push(tmpDir);

    const yamlPath = path.join(tmpDir, 'campaign.yaml');
    await fs.writeFile(yamlPath, SAMPLE_NORTHSTAR_CAMPAIGN_YAML, 'utf8');

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

    // 3. status (bootstraps real scanned workspace + Microsoft LiteBox proofs)
    const statusRes = await runNightfallCli(['status']);
    expect(statusRes.exitCode).toBe(0);
    expect(statusRes.stdout).toContain('Nightfall Platform Status');
    expect(statusRes.stdout).toContain('Microsoft LiteBox (ready');
    expect(statusRes.stdout).toMatch(/Open Findings\s+:\s+[1-9]\d*/);

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
