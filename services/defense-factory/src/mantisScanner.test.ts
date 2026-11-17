import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FindingRecordSchema } from '@nightfall/core-contracts';
import { RootCauseDeduplicator } from './deduplicator.js';
import { DEFAULT_MANTIS_ENGINE_DIR, MantisScanner } from './mantisScanner.js';

const execFileAsync = promisify(execFile);
const PYTHON = process.env.NIGHTFALL_MANTIS_PYTHON ?? 'python3';

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
});
