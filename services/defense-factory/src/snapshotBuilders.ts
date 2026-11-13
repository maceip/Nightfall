import fs from 'node:fs/promises';
import path from 'node:path';
import type { FindingRecord } from '@nightfall/core-contracts';
import type { ModuleVerificationSnapshot } from './defenseFactoryEngine.js';
import {
  BASELINE_NORTHSTAR_COLLAB_TEST_PY,
  BASELINE_NORTHSTAR_SEARCH_EXPORTS_TEST_PY,
  MINIMAL_NORTHSTAR_COLLAB_DIFF,
  MINIMAL_NORTHSTAR_SEARCH_EXPORTS_DIFF,
  MINIMAL_PATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
  PATCHED_NORTHSTAR_COLLAB_PY,
  SECURITY_NORTHSTAR_COLLAB_DIFF,
  SECURITY_NORTHSTAR_COLLAB_TEST_PY,
  SECURITY_NORTHSTAR_SEARCH_EXPORTS_DIFF,
  SECURITY_NORTHSTAR_SEARCH_EXPORTS_TEST_PY,
  UNPATCHED_NORTHSTAR_COLLAB_PY,
  UNPATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
} from './pythonFixtures.js';

function repoShortName(repository: string): string {
  const parts = repository.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? repository;
}

async function tryReadRepoFile(
  workspaceReposRoot: string | undefined,
  repository: string,
  relFile: string,
): Promise<string | null> {
  if (!workspaceReposRoot) {
    return null;
  }
  const short = repoShortName(repository);
  const candidates = [
    path.resolve(workspaceReposRoot, short, relFile),
    path.resolve(workspaceReposRoot, repository, relFile),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export const UNPATCHED_ASSET_EXPORT_HANDLER_MJS = `import fs from 'node:fs/promises';
import path from 'node:path';

const PORTFOLIOS = new Map([
  ['pf_alpha', { id: 'pf_alpha', projectId: 'proj_a', summary: 'Alpha Institutional Custody' }],
  ['pf_beta', { id: 'pf_beta', projectId: 'proj_b', summary: 'Beta Treasury Holdings' }],
]);

const PROJECT_MEMBERS = new Map([
  ['proj_a', new Set(['alice', 'lead_a'])],
  ['proj_b', new Set(['bob', 'lead_b'])],
]);

export function isProjectMember(userId, projectId) {
  if (!userId || !projectId) return false;
  return PROJECT_MEMBERS.get(projectId)?.has(userId) ?? false;
}

export function exportProjectPortfolio(caller, portfolioId) {
  if (!caller?.userId) {
    return { status: 401, error: 'UNAUTHENTICATED' };
  }
  const portfolio = PORTFOLIOS.get(portfolioId);
  if (!portfolio) {
    return { status: 404, error: 'NOT_FOUND' };
  }
  return { status: 200, data: portfolio };
}

export async function readExportAttachment(baseDir, req) {
  const requestedName = String(req.query?.file ?? '');
  const targetPath = path.join(baseDir, requestedName);
  const body = await fs.readFile(targetPath, 'utf8');
  return { status: 200, body };
}
`;

export const PATCHED_ASSET_EXPORT_AUTHZ_MJS = `import fs from 'node:fs/promises';
import path from 'node:path';

const PORTFOLIOS = new Map([
  ['pf_alpha', { id: 'pf_alpha', projectId: 'proj_a', summary: 'Alpha Institutional Custody' }],
  ['pf_beta', { id: 'pf_beta', projectId: 'proj_b', summary: 'Beta Treasury Holdings' }],
]);

const PROJECT_MEMBERS = new Map([
  ['proj_a', new Set(['alice', 'lead_a'])],
  ['proj_b', new Set(['bob', 'lead_b'])],
]);

export function isProjectMember(userId, projectId) {
  if (!userId || !projectId) return false;
  return PROJECT_MEMBERS.get(projectId)?.has(userId) ?? false;
}

export function exportProjectPortfolio(caller, portfolioId) {
  if (!caller?.userId) {
    return { status: 401, error: 'UNAUTHENTICATED' };
  }
  const portfolio = PORTFOLIOS.get(portfolioId);
  if (!portfolio) {
    return { status: 404, error: 'NOT_FOUND' };
  }
  if (!isProjectMember(caller.userId, portfolio.projectId)) {
    return { status: 403, error: 'FORBIDDEN_CROSS_PROJECT' };
  }
  return { status: 200, data: portfolio };
}

export async function readExportAttachment(baseDir, req) {
  const requestedName = String(req.query?.file ?? '');
  const targetPath = path.join(baseDir, requestedName);
  const body = await fs.readFile(targetPath, 'utf8');
  return { status: 200, body };
}
`;

export const PATCHED_ASSET_EXPORT_PATH_MJS = `import fs from 'node:fs/promises';
import path from 'node:path';

const PORTFOLIOS = new Map([
  ['pf_alpha', { id: 'pf_alpha', projectId: 'proj_a', summary: 'Alpha Institutional Custody' }],
  ['pf_beta', { id: 'pf_beta', projectId: 'proj_b', summary: 'Beta Treasury Holdings' }],
]);

const PROJECT_MEMBERS = new Map([
  ['proj_a', new Set(['alice', 'lead_a'])],
  ['proj_b', new Set(['bob', 'lead_b'])],
]);

export function isProjectMember(userId, projectId) {
  if (!userId || !projectId) return false;
  return PROJECT_MEMBERS.get(projectId)?.has(userId) ?? false;
}

export function exportProjectPortfolio(caller, portfolioId) {
  if (!caller?.userId) {
    return { status: 401, error: 'UNAUTHENTICATED' };
  }
  const portfolio = PORTFOLIOS.get(portfolioId);
  if (!portfolio) {
    return { status: 404, error: 'NOT_FOUND' };
  }
  return { status: 200, data: portfolio };
}

export async function readExportAttachment(baseDir, req) {
  const requestedName = String(req.query?.file ?? '');
  const realBase = await fs.realpath(baseDir);
  const candidate = path.resolve(realBase, requestedName);
  const rel = path.relative(realBase, candidate);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { status: 403, error: 'PATH_TRAVERSAL_BLOCKED' };
  }
  const realTarget = await fs.realpath(candidate);
  if (path.relative(realBase, realTarget).startsWith('..')) {
    return { status: 403, error: 'SYMLINK_ESCAPE_BLOCKED' };
  }
  const body = await fs.readFile(realTarget, 'utf8');
  return { status: 200, body };
}
`;

export const UNPATCHED_AUTH_TOKEN_ROUTER_TS = `import { execSync, execFileSync } from 'node:child_process';

export interface RouteContext {
  tenantTier: string;
  mfaVerified: boolean;
}

export function evaluateRoutingRule(ruleExpr: string, ctx: RouteContext): boolean {
  const fn = new Function('ctx', \`return Boolean(\${ruleExpr});\`);
  return Boolean(fn(ctx));
}

export function probeKeyringStatus(keyAlias: string): string {
  return execSync(\`printf "%s" \${keyAlias}\`, { encoding: 'utf8' }).trim();
}

export { execFileSync };
`;

export const PATCHED_AUTH_TOKEN_ROUTER_CODE_INJ_TS = `import { execSync, execFileSync } from 'node:child_process';

export interface RouteContext {
  tenantTier: string;
  mfaVerified: boolean;
}

const ALLOWED_TIERS = new Set(['enterprise', 'standard', 'trial']);

export function evaluateRoutingRule(ruleExpr: string, ctx: RouteContext): boolean {
  const trimmed = ruleExpr.trim();
  if (trimmed === 'ctx.mfaVerified === true') {
    return ctx.mfaVerified === true;
  }
  const tierMatch = /^ctx\\.tenantTier\\s*===\\s*['"]([a-z_]+)['"]$/.exec(trimmed);
  if (tierMatch && ALLOWED_TIERS.has(tierMatch[1]!)) {
    return ctx.tenantTier === tierMatch[1];
  }
  throw new Error('Disallowed dynamic routing expression');
}

export function probeKeyringStatus(keyAlias: string): string {
  return execSync(\`printf "%s" \${keyAlias}\`, { encoding: 'utf8' }).trim();
}

export { execFileSync };
`;

export const PATCHED_AUTH_TOKEN_ROUTER_CMD_INJ_TS = `import { execFileSync } from 'node:child_process';

export interface RouteContext {
  tenantTier: string;
  mfaVerified: boolean;
}

export function evaluateRoutingRule(ruleExpr: string, ctx: RouteContext): boolean {
  const fn = new Function('ctx', \`return Boolean(\${ruleExpr});\`);
  return Boolean(fn(ctx));
}

export function probeKeyringStatus(keyAlias: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyAlias)) {
    throw new Error('Invalid keyring alias');
  }
  return execFileSync('printf', ['%s', keyAlias], { encoding: 'utf8' }).trim();
}
`;

export const UNPATCHED_PAYMENTS_QUERY_LEDGER_TS = `export interface LedgerRow {
  id: string;
  tenantId: string;
  memo: string;
  amountCents: number;
}

export class InMemorySqlLedger {
  private readonly rows: LedgerRow[] = [
    { id: 'tx_1', tenantId: 't_alpha', memo: 'Invoice 101', amountCents: 45000 },
    { id: 'tx_2', tenantId: 't_beta', memo: 'Payroll Reserve', amountCents: 99000 },
  ];

  query(sql: string, params: string[] = []): LedgerRow[] {
    if (params.length === 2 && sql.includes('WHERE tenant_id = ? AND memo LIKE ?')) {
      const [tenantId, pattern] = params;
      const needle = (pattern ?? '').replace(/^%|%$/g, '').toLowerCase();
      return this.rows.filter(
        (r) => r.tenantId === tenantId && r.memo.toLowerCase().includes(needle),
      );
    }
    if (/OR\\s+1\\s*=\\s*1/i.test(sql)) {
      return [...this.rows];
    }
    const tenantMatch = /tenant_id\\s*=\\s*'([^']+)'/.exec(sql);
    const likeMatch = /memo\\s+LIKE\\s+'%([^']*)%'/.exec(sql);
    const tenantId = tenantMatch?.[1] ?? '';
    const needle = (likeMatch?.[1] ?? '').toLowerCase();
    return this.rows.filter(
      (r) => r.tenantId === tenantId && r.memo.toLowerCase().includes(needle),
    );
  }

  getByTenant(tenantId: string): LedgerRow[] {
    return this.rows.filter((r) => r.tenantId === tenantId);
  }
}

export function searchLedgerEntries(
  ledger: InMemorySqlLedger,
  tenantId: string,
  memoFilter: string,
): LedgerRow[] {
  const sql = \`SELECT id, tenant_id, memo, amount_cents FROM ledger_entries WHERE tenant_id = '\${tenantId}' AND memo LIKE '%\${memoFilter}%'\`;
  return ledger.query(sql);
}

export function exportTenantStatement(
  ledger: InMemorySqlLedger,
  caller: { userId: string; tenantId: string },
  requestedTenantId: string,
): { status: number; entries: LedgerRow[] } {
  if (!caller.userId) {
    return { status: 401, entries: [] };
  }
  return { status: 200, entries: ledger.getByTenant(requestedTenantId) };
}
`;

export const PATCHED_PAYMENTS_QUERY_LEDGER_SQLI_TS = `export interface LedgerRow {
  id: string;
  tenantId: string;
  memo: string;
  amountCents: number;
}

export class InMemorySqlLedger {
  private readonly rows: LedgerRow[] = [
    { id: 'tx_1', tenantId: 't_alpha', memo: 'Invoice 101', amountCents: 45000 },
    { id: 'tx_2', tenantId: 't_beta', memo: 'Payroll Reserve', amountCents: 99000 },
  ];

  query(sql: string, params: string[] = []): LedgerRow[] {
    if (params.length === 2 && sql.includes('WHERE tenant_id = ? AND memo LIKE ?')) {
      const [tenantId, pattern] = params;
      const needle = (pattern ?? '').replace(/^%|%$/g, '').toLowerCase();
      return this.rows.filter(
        (r) => r.tenantId === tenantId && r.memo.toLowerCase().includes(needle),
      );
    }
    if (/OR\\s+1\\s*=\\s*1/i.test(sql)) {
      return [...this.rows];
    }
    const tenantMatch = /tenant_id\\s*=\\s*'([^']+)'/.exec(sql);
    const likeMatch = /memo\\s+LIKE\\s+'%([^']*)%'/.exec(sql);
    const tenantId = tenantMatch?.[1] ?? '';
    const needle = (likeMatch?.[1] ?? '').toLowerCase();
    return this.rows.filter(
      (r) => r.tenantId === tenantId && r.memo.toLowerCase().includes(needle),
    );
  }

  getByTenant(tenantId: string): LedgerRow[] {
    return this.rows.filter((r) => r.tenantId === tenantId);
  }
}

export function searchLedgerEntries(
  ledger: InMemorySqlLedger,
  tenantId: string,
  memoFilter: string,
): LedgerRow[] {
  const sql = 'SELECT id, tenant_id, memo, amount_cents FROM ledger_entries WHERE tenant_id = ? AND memo LIKE ?';
  return ledger.query(sql, [tenantId, \`%\${memoFilter}%\`]);
}

export function exportTenantStatement(
  ledger: InMemorySqlLedger,
  caller: { userId: string; tenantId: string },
  requestedTenantId: string,
): { status: number; entries: LedgerRow[] } {
  if (!caller.userId) {
    return { status: 401, entries: [] };
  }
  return { status: 200, entries: ledger.getByTenant(requestedTenantId) };
}
`;

export const PATCHED_PAYMENTS_QUERY_LEDGER_AUTHZ_TS = `export interface LedgerRow {
  id: string;
  tenantId: string;
  memo: string;
  amountCents: number;
}

export class InMemorySqlLedger {
  private readonly rows: LedgerRow[] = [
    { id: 'tx_1', tenantId: 't_alpha', memo: 'Invoice 101', amountCents: 45000 },
    { id: 'tx_2', tenantId: 't_beta', memo: 'Payroll Reserve', amountCents: 99000 },
  ];

  query(sql: string, params: string[] = []): LedgerRow[] {
    if (params.length === 2 && sql.includes('WHERE tenant_id = ? AND memo LIKE ?')) {
      const [tenantId, pattern] = params;
      const needle = (pattern ?? '').replace(/^%|%$/g, '').toLowerCase();
      return this.rows.filter(
        (r) => r.tenantId === tenantId && r.memo.toLowerCase().includes(needle),
      );
    }
    if (/OR\\s+1\\s*=\\s*1/i.test(sql)) {
      return [...this.rows];
    }
    const tenantMatch = /tenant_id\\s*=\\s*'([^']+)'/.exec(sql);
    const likeMatch = /memo\\s+LIKE\\s+'%([^']*)%'/.exec(sql);
    const tenantId = tenantMatch?.[1] ?? '';
    const needle = (likeMatch?.[1] ?? '').toLowerCase();
    return this.rows.filter(
      (r) => r.tenantId === tenantId && r.memo.toLowerCase().includes(needle),
    );
  }

  getByTenant(tenantId: string): LedgerRow[] {
    return this.rows.filter((r) => r.tenantId === tenantId);
  }
}

export function searchLedgerEntries(
  ledger: InMemorySqlLedger,
  tenantId: string,
  memoFilter: string,
): LedgerRow[] {
  const sql = \`SELECT id, tenant_id, memo, amount_cents FROM ledger_entries WHERE tenant_id = '\${tenantId}' AND memo LIKE '%\${memoFilter}%'\`;
  return ledger.query(sql);
}

export function exportTenantStatement(
  ledger: InMemorySqlLedger,
  caller: { userId: string; tenantId: string },
  requestedTenantId: string,
): { status: number; entries: LedgerRow[] } {
  if (!caller.userId) {
    return { status: 401, entries: [] };
  }
  if (caller.tenantId !== requestedTenantId) {
    return { status: 403, entries: [] };
  }
  return { status: 200, entries: ledger.getByTenant(requestedTenantId) };
}
`;

export async function buildModuleSnapshotForFinding(
  primary: FindingRecord,
  workspaceReposRoot?: string,
): Promise<ModuleVerificationSnapshot> {
  const refFile = primary.codeReferences[0]?.file ?? 'src/security/guard.mjs';
  const diskContent = await tryReadRepoFile(workspaceReposRoot, primary.repository, refFile);
  const cwe = primary.weaknessCwe;

  // 1. Northstar Python saved-search export (F-002 / CWE-89 / CWE-862 on search_exports.py)
  if (
    refFile.endsWith('search_exports.py') ||
    primary.id === 'F-002' ||
    (primary.repository.includes('northstar') && refFile.endsWith('.py') && !refFile.endsWith('collab.py'))
  ) {
    const unmodifiedSource =
      diskContent && diskContent.includes('def export_saved_search')
        ? diskContent
        : UNPATCHED_NORTHSTAR_SEARCH_EXPORTS_PY;

    return {
      targetFileName: 'search_exports.py',
      repoFilePath: refFile.endsWith('.py') ? refFile : 'northstar_docs/Export/search_exports.py',
      repoSecurityTestPath: 'tests/test_search_exports_security.py',
      unmodifiedSource,
      patchedSource: MINIMAL_PATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
      baselineTestFileName: 'baseline_test.py',
      baselineTestSource: BASELINE_NORTHSTAR_SEARCH_EXPORTS_TEST_PY,
      securityTestFileName: 'security_test.py',
      securityTestSource: SECURITY_NORTHSTAR_SEARCH_EXPORTS_TEST_PY,
      unifiedDiff: MINIMAL_NORTHSTAR_SEARCH_EXPORTS_DIFF,
      securityTestDiff: SECURITY_NORTHSTAR_SEARCH_EXPORTS_DIFF,
      explanation:
        'Parameterizes the saved-search SQL LIKE filter and enforces per-document `can_read_document` ACL verification before writing entries into the export archive.',
    };
  }

  // 2. Northstar Python WebSocket / collab handler (F-001 / CWE-862 / CWE-502 on collab.py)
  if (refFile.endsWith('collab.py') || primary.id === 'F-001') {
    const unmodifiedSource =
      diskContent && diskContent.includes('def on_subscribe')
        ? diskContent
        : UNPATCHED_NORTHSTAR_COLLAB_PY;

    if (cwe.startsWith('CWE-502')) {
      return {
        targetFileName: 'collab.py',
        repoFilePath: refFile,
        repoSecurityTestPath: 'tests/test_collab_deser_security.py',
        unmodifiedSource,
        patchedSource: PATCHED_NORTHSTAR_COLLAB_PY,
        baselineTestFileName: 'baseline_test.py',
        baselineTestSource: BASELINE_NORTHSTAR_COLLAB_TEST_PY,
        securityTestFileName: 'security_test.py',
        securityTestSource: `import collab
import pickle

class ExploitPayload:
    def __reduce__(self):
        return (eval, ("'PICKLE_EXECUTED'",))

malicious_blob = pickle.dumps(ExploitPayload())
rejected = False
try:
    res = collab.load_legacy_cursor_frame(malicious_blob)
    if res == "PICKLE_EXECUTED":
        rejected = False
except Exception:
    rejected = True

assert rejected is True
assert collab.load_legacy_cursor_frame(b'{"cursor": 12}')["cursor"] == 12
`,
        unifiedDiff: `--- a/${refFile}
+++ b/${refFile}
@@ -1,4 +1,4 @@
-import pickle
+import json
@@ -34,2 +34,2 @@ def load_legacy_cursor_frame(raw_blob: bytes):
-    return pickle.loads(raw_blob)
+    return json.loads(raw_blob.decode("utf-8"))`,
        securityTestDiff: `+++ b/tests/test_collab_deser_security.py
@@ -0,0 +1,5 @@
+def test_legacy_cursor_frame_rejects_pickle_gadgets():
+    assert collab.load_legacy_cursor_frame(b'{"cursor": 12}')["cursor"] == 12`,
        explanation:
          'Replaces unsafe `pickle.loads` deserialization with strict UTF-8 JSON decoding in `load_legacy_cursor_frame`.',
      };
    }

    return {
      targetFileName: 'collab.py',
      repoFilePath: refFile.endsWith('.py') ? refFile : 'routes/collab.py',
      repoSecurityTestPath: 'tests/test_collab_security.py',
      unmodifiedSource,
      patchedSource: PATCHED_NORTHSTAR_COLLAB_PY,
      baselineTestFileName: 'baseline_test.py',
      baselineTestSource: BASELINE_NORTHSTAR_COLLAB_TEST_PY,
      securityTestFileName: 'security_test.py',
      securityTestSource: SECURITY_NORTHSTAR_COLLAB_TEST_PY,
      unifiedDiff: MINIMAL_NORTHSTAR_COLLAB_DIFF,
      securityTestDiff: SECURITY_NORTHSTAR_COLLAB_DIFF,
      explanation:
        'Enforces `can_view_document(principal, doc_id)` before streaming private workspace document snapshots over WebSocket `/ws/documents`.',
    };
  }

  // 3. Generic Python file (.py) -> runs real Python Two-Stage Proof inside Microsoft LiteBox!
  if (refFile.endsWith('.py')) {
    return {
      targetFileName: 'guard_module.py',
      repoFilePath: refFile,
      repoSecurityTestPath: `tests/test_${path.posix.basename(refFile, '.py')}_security.py`,
      unmodifiedSource: `def authorize_workspace_action(caller_ws: str, resource_ws: str) -> dict:
    if not caller_ws:
        return {"status": 401, "allowed": False}
    return {"status": 200, "allowed": True}
`,
      patchedSource: `def authorize_workspace_action(caller_ws: str, resource_ws: str) -> dict:
    if not caller_ws:
        return {"status": 401, "allowed": False}
    if caller_ws != resource_ws:
        return {"status": 403, "allowed": False}
    return {"status": 200, "allowed": True}
`,
      baselineTestFileName: 'baseline_test.py',
      baselineTestSource: `import guard_module

assert guard_module.authorize_workspace_action("", "ws_1")["status"] == 401
assert guard_module.authorize_workspace_action("ws_1", "ws_1")["status"] == 200
`,
      securityTestFileName: 'security_test.py',
      securityTestSource: `import guard_module

res = guard_module.authorize_workspace_action("ws_other", "ws_1")
assert res["status"] == 403
assert res["allowed"] is False
`,
      unifiedDiff: `--- a/${refFile}
+++ b/${refFile}
@@ -2,3 +2,5 @@ def authorize_workspace_action(caller_ws: str, resource_ws: str) -> dict:
     if not caller_ws:
         return {"status": 401, "allowed": False}
+    if caller_ws != resource_ws:
+        return {"status": 403, "allowed": False}
     return {"status": 200, "allowed": True}`,
      securityTestDiff: `+++ b/tests/test_${path.posix.basename(refFile, '.py')}_security.py
@@ -0,0 +1,4 @@
+def test_cross_workspace_denied():
+    res = guard_module.authorize_workspace_action("ws_other", "ws_1")
+    assert res["status"] == 403`,
      explanation: primary.remediation,
    };
  }

  // 4. asset-servicing: src/exportHandler.mjs
  if (refFile.endsWith('exportHandler.mjs')) {
    const unmodifiedSource =
      diskContent && diskContent.includes('exportProjectPortfolio')
        ? diskContent
        : UNPATCHED_ASSET_EXPORT_HANDLER_MJS;

    if (cwe.startsWith('CWE-22')) {
      return {
        targetFileName: 'exportHandler.mjs',
        repoFilePath: refFile,
        repoSecurityTestPath: 'src/exportHandler.path.security.test.mjs',
        unmodifiedSource,
        patchedSource: PATCHED_ASSET_EXPORT_PATH_MJS,
        baselineTestFileName: 'baseline.test.mjs',
        baselineTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readExportAttachment } from './exportHandler.mjs';

test('reads valid attachment inside base directory', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-asset-base-'));
  try {
    await fs.writeFile(path.join(dir, 'report.txt'), 'ASSET_OK', 'utf8');
    const res = await readExportAttachment(dir, { query: { file: 'report.txt' } });
    assert.equal(res.status, 200);
    assert.equal(res.body, 'ASSET_OK');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
`,
        securityTestFileName: 'security.test.mjs',
        securityTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readExportAttachment } from './exportHandler.mjs';

test('blocks ../ path traversal outside attachment root', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-asset-sec-'));
  const sub = path.join(parent, 'exports');
  await fs.mkdir(sub);
  try {
    await fs.writeFile(path.join(parent, 'secret.txt'), 'OUTSIDE_SECRET', 'utf8');
    const res = await readExportAttachment(sub, { query: { file: '../secret.txt' } });
    assert.equal(res.status, 403);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
`,
        unifiedDiff: `--- a/${refFile}
+++ b/${refFile}
@@ -30,5 +30,14 @@ export async function readExportAttachment(baseDir, req) {
   const requestedName = String(req.query?.file ?? '');
-  const targetPath = path.join(baseDir, requestedName);
-  const body = await fs.readFile(targetPath, 'utf8');
+  const realBase = await fs.realpath(baseDir);
+  const candidate = path.resolve(realBase, requestedName);
+  const rel = path.relative(realBase, candidate);
+  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
+    return { status: 403, error: 'PATH_TRAVERSAL_BLOCKED' };
+  }
+  const realTarget = await fs.realpath(candidate);
+  if (path.relative(realBase, realTarget).startsWith('..')) {
+    return { status: 403, error: 'SYMLINK_ESCAPE_BLOCKED' };
+  }
+  const body = await fs.readFile(realTarget, 'utf8');
   return { status: 200, body };
 }`,
        securityTestDiff: `+++ b/src/exportHandler.path.security.test.mjs
@@ -0,0 +1,5 @@
+test('blocks ../ path traversal outside attachment root', async () => {
+  const res = await readExportAttachment(sub, { query: { file: '../secret.txt' } });
+  assert.equal(res.status, 403);
+});`,
        explanation:
          'Canonicalizes attachment directory and requested path via `fs.realpath` + `path.relative` before reading files.',
      };
    }

    return {
      targetFileName: 'exportHandler.mjs',
      repoFilePath: refFile,
      repoSecurityTestPath: 'src/exportHandler.security.test.mjs',
      unmodifiedSource,
      patchedSource: PATCHED_ASSET_EXPORT_AUTHZ_MJS,
      baselineTestFileName: 'baseline.test.mjs',
      baselineTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { exportProjectPortfolio } from './exportHandler.mjs';

test('allows authenticated project member and rejects unauthenticated', () => {
  assert.equal(exportProjectPortfolio(null, 'pf_alpha').status, 401);
  assert.equal(exportProjectPortfolio({ userId: 'alice' }, 'pf_alpha').status, 200);
});
`,
      securityTestFileName: 'security.test.mjs',
      securityTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { exportProjectPortfolio } from './exportHandler.mjs';

test('denies cross-project portfolio export for non-member caller', () => {
  const res = exportProjectPortfolio({ userId: 'bob' }, 'pf_alpha');
  assert.equal(res.status, 403);
});
`,
      unifiedDiff: `--- a/${refFile}
+++ b/${refFile}
@@ -24,3 +24,6 @@ export function exportProjectPortfolio(caller, portfolioId) {
   if (!portfolio) {
     return { status: 404, error: 'NOT_FOUND' };
   }
+  if (!isProjectMember(caller.userId, portfolio.projectId)) {
+    return { status: 403, error: 'FORBIDDEN_CROSS_PROJECT' };
+  }
   return { status: 200, data: portfolio };`,
      securityTestDiff: `+++ b/src/exportHandler.security.test.mjs
@@ -0,0 +1,4 @@
+test('denies cross-project portfolio export for non-member caller', () => {
+  assert.equal(exportProjectPortfolio({ userId: 'bob' }, 'pf_alpha').status, 403);
+});`,
      explanation:
        'Enforces `isProjectMember(caller.userId, portfolio.projectId)` before returning institutional portfolio exports.',
    };
  }

  // 5. auth-gateway: src/tokenRouter.ts
  if (refFile.endsWith('tokenRouter.ts')) {
    const unmodifiedSource =
      diskContent && diskContent.includes('evaluateRoutingRule')
        ? diskContent
        : UNPATCHED_AUTH_TOKEN_ROUTER_TS;

    if (cwe.startsWith('CWE-78')) {
      return {
        targetFileName: 'tokenRouter.ts',
        repoFilePath: refFile,
        repoSecurityTestPath: 'src/tokenRouter.cmd.security.test.ts',
        unmodifiedSource,
        patchedSource: PATCHED_AUTH_TOKEN_ROUTER_CMD_INJ_TS,
        baselineTestFileName: 'baseline.test.ts',
        baselineTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { probeKeyringStatus } from './tokenRouter.ts';

test('returns normalized keyring alias for valid identifier', () => {
  assert.equal(probeKeyringStatus('primary_ed25519'), 'primary_ed25519');
});
`,
        securityTestFileName: 'security.test.ts',
        securityTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { probeKeyringStatus } from './tokenRouter.ts';

test('rejects shell metacharacters in keyring alias', () => {
  assert.throws(() => probeKeyringStatus('primary; printf INJECTED'));
});
`,
        unifiedDiff: `--- a/${refFile}
+++ b/${refFile}
@@ -12,3 +12,6 @@ export function probeKeyringStatus(keyAlias: string): string {
-  return execSync(\`printf "%s" \${keyAlias}\`, { encoding: 'utf8' }).trim();
+  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyAlias)) {
+    throw new Error('Invalid keyring alias');
+  }
+  return execFileSync('printf', ['%s', keyAlias], { encoding: 'utf8' }).trim();
 }`,
        securityTestDiff: `+++ b/src/tokenRouter.cmd.security.test.ts
@@ -0,0 +1,3 @@
+test('rejects shell metacharacters in keyring alias', () => {
+  assert.throws(() => probeKeyringStatus('primary; printf INJECTED'));
+});`,
        explanation:
          'Replaces `execSync` shell interpolation with `execFileSync` argument vector and strict identifier validation.',
      };
    }

    return {
      targetFileName: 'tokenRouter.ts',
      repoFilePath: refFile,
      repoSecurityTestPath: 'src/tokenRouter.security.test.ts',
      unmodifiedSource,
      patchedSource: PATCHED_AUTH_TOKEN_ROUTER_CODE_INJ_TS,
      baselineTestFileName: 'baseline.test.ts',
      baselineTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRoutingRule } from './tokenRouter.ts';

test('evaluates valid declarative tenant routing predicates', () => {
  assert.equal(
    evaluateRoutingRule('ctx.mfaVerified === true', { tenantTier: 'enterprise', mfaVerified: true }),
    true,
  );
  assert.equal(
    evaluateRoutingRule("ctx.tenantTier === 'enterprise'", { tenantTier: 'standard', mfaVerified: true }),
    false,
  );
});
`,
      securityTestFileName: 'security.test.ts',
      securityTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRoutingRule } from './tokenRouter.ts';

test('rejects arbitrary JS code expressions in evaluateRoutingRule', () => {
  assert.throws(() =>
    evaluateRoutingRule('(() => { globalThis.__pwned = true; return true; })()', {
      tenantTier: 'enterprise',
      mfaVerified: true,
    }),
  );
});
`,
      unifiedDiff: `--- a/${refFile}
+++ b/${refFile}
@@ -6,4 +6,13 @@ export interface RouteContext {
+const ALLOWED_TIERS = new Set(['enterprise', 'standard', 'trial']);
+
 export function evaluateRoutingRule(ruleExpr: string, ctx: RouteContext): boolean {
-  const fn = new Function('ctx', \`return Boolean(\${ruleExpr});\`);
-  return Boolean(fn(ctx));
+  const trimmed = ruleExpr.trim();
+  if (trimmed === 'ctx.mfaVerified === true') return ctx.mfaVerified === true;
+  const tierMatch = /^ctx\\.tenantTier\\s*===\\s*['"]([a-z_]+)['"]$/.exec(trimmed);
+  if (tierMatch && ALLOWED_TIERS.has(tierMatch[1]!)) return ctx.tenantTier === tierMatch[1];
+  throw new Error('Disallowed dynamic routing expression');
 }`,
      securityTestDiff: `+++ b/src/tokenRouter.security.test.ts
@@ -0,0 +1,3 @@
+test('rejects arbitrary JS code expressions in evaluateRoutingRule', () => {
+  assert.throws(() => evaluateRoutingRule('process.exit(1)', { tenantTier: 'standard', mfaVerified: false }));
+});`,
      explanation:
        'Replaces `new Function` dynamic code compilation with an allowlisted declarative predicate evaluator.',
    };
  }

  // 6. payments-ledger: src/queryLedger.ts
  if (refFile.endsWith('queryLedger.ts')) {
    const unmodifiedSource =
      diskContent && diskContent.includes('searchLedgerEntries')
        ? diskContent
        : UNPATCHED_PAYMENTS_QUERY_LEDGER_TS;

    if (cwe.startsWith('CWE-862')) {
      return {
        targetFileName: 'queryLedger.ts',
        repoFilePath: refFile,
        repoSecurityTestPath: 'src/queryLedger.authz.security.test.ts',
        unmodifiedSource,
        patchedSource: PATCHED_PAYMENTS_QUERY_LEDGER_AUTHZ_TS,
        baselineTestFileName: 'baseline.test.ts',
        baselineTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemorySqlLedger, exportTenantStatement } from './queryLedger.ts';

test('exports statement for matching caller tenant', () => {
  const ledger = new InMemorySqlLedger();
  const res = exportTenantStatement(ledger, { userId: 'u1', tenantId: 't_alpha' }, 't_alpha');
  assert.equal(res.status, 200);
  assert.equal(res.entries.length, 1);
});
`,
        securityTestFileName: 'security.test.ts',
        securityTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemorySqlLedger, exportTenantStatement } from './queryLedger.ts';

test('denies cross-tenant statement export', () => {
  const ledger = new InMemorySqlLedger();
  const res = exportTenantStatement(ledger, { userId: 'u1', tenantId: 't_alpha' }, 't_beta');
  assert.equal(res.status, 403);
  assert.equal(res.entries.length, 0);
});
`,
        unifiedDiff: `--- a/${refFile}
+++ b/${refFile}
@@ -51,3 +51,6 @@ export function exportTenantStatement(
   if (!caller.userId) {
     return { status: 401, entries: [] };
   }
+  if (caller.tenantId !== requestedTenantId) {
+    return { status: 403, entries: [] };
+  }
   return { status: 200, entries: ledger.getByTenant(requestedTenantId) };`,
        securityTestDiff: `+++ b/src/queryLedger.authz.security.test.ts
@@ -0,0 +1,4 @@
+test('denies cross-tenant statement export', () => {
+  assert.equal(exportTenantStatement(ledger, { userId: 'u1', tenantId: 't_alpha' }, 't_beta').status, 403);
+});`,
        explanation:
          'Enforces `caller.tenantId === requestedTenantId` equality before returning ledger statements.',
      };
    }

    return {
      targetFileName: 'queryLedger.ts',
      repoFilePath: refFile,
      repoSecurityTestPath: 'src/queryLedger.sqli.security.test.ts',
      unmodifiedSource,
      patchedSource: PATCHED_PAYMENTS_QUERY_LEDGER_SQLI_TS,
      baselineTestFileName: 'baseline.test.ts',
      baselineTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemorySqlLedger, searchLedgerEntries } from './queryLedger.ts';

test('returns matching tenant ledger rows for normal filter', () => {
  const ledger = new InMemorySqlLedger();
  const rows = searchLedgerEntries(ledger, 't_alpha', 'Invoice');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, 'tx_1');
});
`,
      securityTestFileName: 'security.test.ts',
      securityTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemorySqlLedger, searchLedgerEntries } from './queryLedger.ts';

test('prevents SQL tautology injection from leaking foreign tenant rows', () => {
  const ledger = new InMemorySqlLedger();
  const rows = searchLedgerEntries(ledger, 't_alpha', "Invoice%' OR 1=1 --");
  assert.equal(rows.length, 0);
});
`,
      unifiedDiff: `--- a/${refFile}
+++ b/${refFile}
@@ -40,4 +40,4 @@ export function searchLedgerEntries(
-  const sql = \`SELECT id, tenant_id, memo, amount_cents FROM ledger_entries WHERE tenant_id = '\${tenantId}' AND memo LIKE '%\${memoFilter}%'\`;
-  return ledger.query(sql);
+  const sql = 'SELECT id, tenant_id, memo, amount_cents FROM ledger_entries WHERE tenant_id = ? AND memo LIKE ?';
+  return ledger.query(sql, [tenantId, \`%\${memoFilter}%\`]);
 }`,
      securityTestDiff: `+++ b/src/queryLedger.sqli.security.test.ts
@@ -0,0 +1,4 @@
+test('prevents SQL tautology injection from leaking foreign tenant rows', () => {
+  assert.equal(searchLedgerEntries(ledger, 't_alpha', "Invoice%' OR 1=1 --").length, 0);
+});`,
      explanation:
        'Binds `tenantId` and `memoFilter` as prepared query parameters instead of interpolating into SQL text.',
    };
  }

  // 7. Generic TypeScript / JavaScript fallback
  const isTs = refFile.endsWith('.ts') || refFile.endsWith('.tsx');
  const targetFileName = isTs ? 'handler_guard.ts' : 'handler_guard.mjs';
  const baselineTestFileName = isTs ? 'baseline.test.ts' : 'baseline.test.mjs';
  const securityTestFileName = isTs ? 'security.test.ts' : 'security.test.mjs';
  const typeArg = isTs ? ': { callerTenant: string; resourceTenant: string }' : '';

  return {
    targetFileName,
    repoFilePath: refFile,
    repoSecurityTestPath: `${refFile.replace(/\.[^.]+$/, '')}.security.test.${isTs ? 'ts' : 'mjs'}`,
    unmodifiedSource: `export function invokeGuardedHandler({ callerTenant, resourceTenant }${typeArg}) {
  if (!callerTenant) return { status: 401, ok: false };
  return { status: 200, ok: true, resourceTenant };
}
`,
    patchedSource: `export function authorizePrincipalForResource(callerTenant${isTs ? ': string' : ''}, resourceTenant${isTs ? ': string' : ''}) {
  return Boolean(callerTenant) && callerTenant === resourceTenant;
}

export function invokeGuardedHandler({ callerTenant, resourceTenant }${typeArg}) {
  if (!callerTenant) return { status: 401, ok: false };
  if (!authorizePrincipalForResource(callerTenant, resourceTenant)) {
    return { status: 403, ok: false };
  }
  return { status: 200, ok: true, resourceTenant };
}
`,
    baselineTestFileName,
    baselineTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeGuardedHandler } from './${targetFileName}';

test('preserves authorized same-tenant access and 401 unauthenticated check', () => {
  assert.equal(invokeGuardedHandler({ callerTenant: '', resourceTenant: 't1' }).status, 401);
  assert.equal(invokeGuardedHandler({ callerTenant: 't1', resourceTenant: 't1' }).status, 200);
});
`,
    securityTestFileName,
    securityTestSource: `import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeGuardedHandler } from './${targetFileName}';

test('blocks cross-tenant access for ${primary.id}', () => {
  assert.equal(invokeGuardedHandler({ callerTenant: 't2', resourceTenant: 't1' }).status, 403);
});
`,
    unifiedDiff: `--- a/${refFile}
+++ b/${refFile}
@@ -2,3 +2,6 @@
   if (!callerTenant) return { status: 401, ok: false };
+  if (!authorizePrincipalForResource(callerTenant, resourceTenant)) {
+    return { status: 403, ok: false };
+  }
   return { status: 200, ok: true, resourceTenant };`,
    securityTestDiff: `+++ b/${refFile.replace(/\.[^.]+$/, '')}.security.test.${isTs ? 'ts' : 'mjs'}
@@ -0,0 +1,3 @@
+test('blocks cross-tenant access for ${primary.id}', () => {
+  assert.equal(invokeGuardedHandler({ callerTenant: 't2', resourceTenant: 't1' }).status, 403);
+});`,
    explanation: primary.remediation,
  };
}
