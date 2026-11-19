import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FindingRecordSchema } from '@nightfall/core-contracts';
import { RootCauseDeduplicator } from './deduplicator.js';
import {
  DEFAULT_MANTIS_ENGINE_DIR,
  MantisScanner,
  discoverMantisToolchainSync,
} from './mantisScanner.js';

const execFileAsync = promisify(execFile);
const PYTHON = discoverMantisToolchainSync().pythonExecutable;

/** Records findings through Mantis's own database layer, as a Mantis run would. */
async function recordMantisRun(dbPath: string): Promise<void> {
  const script = `
import sys
sys.path.insert(0, ${JSON.stringify(DEFAULT_MANTIS_ENGINE_DIR)})
from core.database import init_db, write_findings
db = sys.argv[1]
init_db(db)
write_findings(db, "app/export.py", [
    {"title": "Cross-tenant export", "severity": "CRITICAL", "cwe": "CWE-862",
     "description": "export_project returns another tenant's data.", "filepath": "app/export.py",
     "line_numbers": [12, 30], "remediation": "Check the caller's tenant.",
     "code_paths": ["app/models.py:4-9"]},
    {"title": "Verbose error page", "severity": "LOW", "description": "Stack traces reach users.",
     "filepath": "app/errors.py", "line_numbers": [3]},
], run_id="run-nightfall-1")
`;
  await execFileAsync(PYTHON, ['-c', script, dbPath], { timeout: 60_000 });
}

describe('MantisScanner', () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-mantis-test-'));
    dbPath = path.join(tmp, 'mantis.db');
    await recordMantisRun(dbPath);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('exports a Mantis run as valid FindingRecords with Nightfall owners', async () => {
    const deduplicator = new RootCauseDeduplicator();
    const scanner = new MantisScanner({ pythonExecutable: PYTHON, deduplicator });
    const findings = await scanner.exportRun({
      repository: 'acme/asset-servicing',
      dbPath,
      observedRevision: 'a1b2c3d',
    });

    expect(findings).toHaveLength(2);
    for (const finding of findings) {
      expect(() => FindingRecordSchema.parse(finding)).not.toThrow();
      expect(finding.repository).toBe('asset-servicing');
      expect(finding.observedRevision).toBe('a1b2c3d');
      expect(finding.owner).toEqual(deduplicator.resolveCodeOwner('asset-servicing'));
      expect(finding.id).toMatch(/^MANTIS-[0-9A-F]{12}$/);
    }

    const tenant = findings.find((f) => f.title === 'Cross-tenant export');
    expect(tenant?.severity).toBe('critical');
    expect(tenant?.status).toBe('new');
    expect(tenant?.weaknessCwe).toBe('CWE-862');
    expect(tenant?.codeReferences).toContainEqual({
      file: 'app/export.py',
      startLine: 12,
      endLine: 30,
      description: 'Reported location',
    });
    expect(tenant?.codeReferences).toContainEqual({
      file: 'app/models.py',
      startLine: 4,
      endLine: 9,
      description: 'Cited code path',
    });
  });

  it('keeps finding ids stable across exports so re-imports do not duplicate', async () => {
    const scanner = new MantisScanner({ pythonExecutable: PYTHON });
    const input = { repository: 'asset-servicing', dbPath, observedRevision: 'a1b2c3d', runId: 'run-nightfall-1' };
    const first = await scanner.exportRun(input);
    const second = await scanner.exportRun(input);
    expect(second.map((f) => f.id)).toEqual(first.map((f) => f.id));
  });

  it('reports a missing database as an error, not as an empty result', async () => {
    const scanner = new MantisScanner({ pythonExecutable: PYTHON });
    await expect(
      scanner.exportRun({
        repository: 'asset-servicing',
        dbPath: path.join(tmp, 'absent.db'),
        observedRevision: 'a1b2c3d',
      }),
    ).rejects.toThrow(/Mantis database not found/);
  });
  it('refuses Mantis-managed dynamic sandboxes so proofs stay in LiteBox', async () => {
    const scanner = new MantisScanner({ pythonExecutable: PYTHON });
    await expect(
      scanner.scanRepository({
        repository: 'asset-servicing',
        localPath: tmp,
        sandbox: 'gvisor' as unknown as 'static-only',
      }),
    ).rejects.toThrow(/only run static sandbox modes/);
    for (const extraArgs of [['--sandbox', 'remote'], ['--sand=remote'], ['--sa', 'gce'], ['-sremote'], ['-s', 'gvisor']]) {
      await expect(
        scanner.scanRepository({ repository: 'asset-servicing', localPath: tmp, extraArgs }),
      ).rejects.toThrow(/not extraArgs/);
    }
  });

  it('reports an unknown run id as an error, not as a clean run', async () => {
    const scanner = new MantisScanner({ pythonExecutable: PYTHON });
    await expect(
      scanner.exportRun({ repository: 'asset-servicing', dbPath, observedRevision: 'a1b2c3d', runId: 'no-such-run' }),
    ).rejects.toThrow(/Mantis run not found/);
  });

  it('discovers vendored Apache-2.0 fnaudit + codenav toolchains and enforces mechanical anti-fabrication gate', async () => {
    const scanner = new MantisScanner({ pythonExecutable: PYTHON });
    const status = scanner.getToolchainStatus();
    expect(status.available).toBe(true);
    expect(status.fnauditAvailable).toBe(true);
    expect(status.evidenceGateEnabled).toBe(true);
    expect(status.fnauditPinnedCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(status.codenavPinnedCommit).toMatch(/^[0-9a-f]{40}$/);

    const gateDb = path.join(tmp, 'gate.db');
    const seedGateScript = `
import sys, sqlite3
sys.path.insert(0, ${JSON.stringify(DEFAULT_MANTIS_ENGINE_DIR)})
from core.database import init_db, write_findings
db = sys.argv[1]
init_db(db)
write_findings(db, "src/parse.c", [
    {"title": "Synthetic ASan claim", "severity": "CRITICAL", "cwe": "CWE-787",
     "description": "==1234==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x602000000010",
     "filepath": "src/parse.c", "line_numbers": [18]},
], run_id="run-gate-ts")
with sqlite3.connect(db) as conn:
    conn.execute("UPDATE findings SET status='dynamic_confirmed' WHERE run_id='run-gate-ts'")
`;
    await execFileAsync(PYTHON, ['-c', seedGateScript, gateDb], { timeout: 60_000 });
    const exported = await scanner.exportRun({
      repository: 'acme/native-parser',
      dbPath: gateDb,
      observedRevision: '998877a',
      runId: 'run-gate-ts',
    });
    expect(exported).toHaveLength(1);
    expect(exported[0]?.status).toBe('new');
    expect(exported[0]?.severity).toBe('medium');
    expect(exported[0]?.defectsNotes).toContain('placeholder sanitizer PID');
  });
});
