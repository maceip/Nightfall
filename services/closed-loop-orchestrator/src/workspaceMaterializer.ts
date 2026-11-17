import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { RepositoryRecord } from '@nightfall/core-contracts';
import {
  UNPATCHED_ASSET_EXPORT_HANDLER_MJS,
  UNPATCHED_AUTH_TOKEN_ROUTER_TS,
  UNPATCHED_NORTHSTAR_COLLAB_PY,
  UNPATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
  UNPATCHED_PAYMENTS_QUERY_LEDGER_TS,
} from '@nightfall/defense-factory';

const execFileAsync = promisify(execFile);

const CLEAN_EDGE_INGRESS_PROXY_MJS = `export function sanitizeForwardedProto(headerValue) {
  const normalized = String(headerValue ?? '').trim().toLowerCase();
  if (normalized === 'https' || normalized === 'http') {
    return normalized;
  }
  return 'https';
}

export function buildUpstreamRouteHeaders(requestId) {
  const safeId = String(requestId ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return {
    'x-request-id': safeId || 'nf-edge-req',
    'x-content-type-options': 'nosniff',
  };
}
`;

export interface MaterializedRepoSpec {
  record: RepositoryRecord;
  files: Record<string, string>;
}

async function hasGitDir(repoDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoDir, '.git'));
    return true;
  } catch {
    return false;
  }
}

async function initGitRepoIfNeeded(repoDir: string, repoName: string): Promise<void> {
  if (await hasGitDir(repoDir)) {
    return;
  }
  const gitEnv = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: repoDir,
    TMPDIR: os.tmpdir(),
    GIT_TERMINAL_PROMPT: '0',
    LANG: 'C.UTF-8',
  };
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: repoDir, env: gitEnv });
  await execFileAsync('git', ['add', '.'], { cwd: repoDir, env: gitEnv });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.name=Nightfall Workspace',
      '-c',
      'user.email=workspace@nightfall.local',
      'commit',
      '-q',
      '-m',
      `chore(${repoName}): initial repository snapshot`,
    ],
    { cwd: repoDir, env: gitEnv },
  );
}

const HARDENED_EDGE_WORKFLOW_YML = `name: Edge Mesh CI
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - run: node --check src/proxyConfig.mjs
`;

const AUTH_GATEWAY_DANGEROUS_WORKFLOW_YML = `name: Auth Gateway CI
on:
  pull_request:
  issues:
    types: [opened]
permissions:
  contents: read
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - name: Log untrusted issue title
        run: echo "Triaging \${{ github.event.issue.title }}"
`;

const STANDARD_UNPINNED_WORKFLOW_YML = `name: Service CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "build ok"
`;

const NORTHSTAR_WORKFLOW_YML = `name: Northstar Docs CI
on: [push, pull_request]
permissions:
  contents: read
jobs:
  pytest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: python3 -m py_compile routes/collab.py
`;

const APACHE_LICENSE_STUB = `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/
`;

const SECURITY_POLICY_MD = `# Security Policy

Report vulnerabilities privately to security@northstar.example before public disclosure.
`;

const DEPENDABOT_YML = `version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
`;

export async function materializeWorkspaceRepositories(
  workspaceReposRoot: string,
): Promise<RepositoryRecord[]> {
  await fs.mkdir(workspaceReposRoot, { recursive: true });

  const specs: MaterializedRepoSpec[] = [
    {
      record: {
        id: 'repo-northstar-docs',
        name: 'northstar-docs',
        fullName: 'northstar/northstar-docs',
        ownerTeam: 'Experience',
        prReviewsEnabled: true,
        scheduledScanLabel: 'Daily at 8:00 AM UTC',
        lastCompletedScanLabel: 'Pending initial scan',
        needsAttention: false,
        openFindingsCount: 0,
        localPath: path.resolve(workspaceReposRoot, 'northstar-docs'),
      },
      files: {
        'northstar_docs/Export/search_exports.py': UNPATCHED_NORTHSTAR_SEARCH_EXPORTS_PY,
        'routes/collab.py': UNPATCHED_NORTHSTAR_COLLAB_PY,
        '.github/workflows/ci.yml': NORTHSTAR_WORKFLOW_YML,
        'SECURITY.md': SECURITY_POLICY_MD,
        LICENSE: APACHE_LICENSE_STUB,
      },
    },
    {
      record: {
        id: 'repo-asset-servicing',
        name: 'asset-servicing',
        fullName: 'northstar/asset-servicing',
        ownerTeam: 'Assets',
        prReviewsEnabled: true,
        scheduledScanLabel: 'Daily at 8:00 AM UTC',
        lastCompletedScanLabel: 'Pending initial scan',
        needsAttention: false,
        openFindingsCount: 0,
        localPath: path.resolve(workspaceReposRoot, 'asset-servicing'),
      },
      files: {
        'src/exportHandler.mjs': UNPATCHED_ASSET_EXPORT_HANDLER_MJS,
        '.github/workflows/ci.yml': STANDARD_UNPINNED_WORKFLOW_YML,
        LICENSE: APACHE_LICENSE_STUB,
      },
    },
    {
      record: {
        id: 'repo-auth-gateway',
        name: 'auth-gateway',
        fullName: 'northstar/auth-gateway',
        ownerTeam: 'Identity',
        prReviewsEnabled: true,
        scheduledScanLabel: 'Daily at 8:00 AM UTC',
        lastCompletedScanLabel: 'Pending initial scan',
        needsAttention: false,
        openFindingsCount: 0,
        localPath: path.resolve(workspaceReposRoot, 'auth-gateway'),
      },
      files: {
        'src/tokenRouter.ts': UNPATCHED_AUTH_TOKEN_ROUTER_TS,
        '.github/workflows/ci.yml': AUTH_GATEWAY_DANGEROUS_WORKFLOW_YML,
        'SECURITY.md': SECURITY_POLICY_MD,
        LICENSE: APACHE_LICENSE_STUB,
      },
    },
    {
      record: {
        id: 'repo-payments-ledger',
        name: 'payments-ledger',
        fullName: 'northstar/payments-ledger',
        ownerTeam: 'Custody',
        prReviewsEnabled: true,
        scheduledScanLabel: 'Weekly on Mondays',
        lastCompletedScanLabel: 'Pending initial scan',
        needsAttention: false,
        openFindingsCount: 0,
        localPath: path.resolve(workspaceReposRoot, 'payments-ledger'),
      },
      files: {
        'src/queryLedger.ts': UNPATCHED_PAYMENTS_QUERY_LEDGER_TS,
        '.github/workflows/ci.yml': STANDARD_UNPINNED_WORKFLOW_YML,
      },
    },
    {
      record: {
        id: 'repo-edge-ingress-mesh',
        name: 'edge-ingress-mesh',
        fullName: 'northstar/edge-ingress-mesh',
        ownerTeam: 'Infrastructure',
        prReviewsEnabled: false,
        scheduledScanLabel: null,
        lastCompletedScanLabel: 'Paused',
        needsAttention: true,
        openFindingsCount: 0,
        localPath: path.resolve(workspaceReposRoot, 'edge-ingress-mesh'),
      },
      files: {
        'src/proxyConfig.mjs': CLEAN_EDGE_INGRESS_PROXY_MJS,
        '.github/workflows/ci.yml': HARDENED_EDGE_WORKFLOW_YML,
        '.github/dependabot.yml': DEPENDABOT_YML,
        'SECURITY.md': SECURITY_POLICY_MD,
        LICENSE: APACHE_LICENSE_STUB,
      },
    },
  ];

  for (const spec of specs) {
    const repoDir = spec.record.localPath!;
    await fs.mkdir(repoDir, { recursive: true });
    for (const [relFile, content] of Object.entries(spec.files)) {
      const targetAbs = path.join(repoDir, relFile);
      try {
        await fs.access(targetAbs);
      } catch {
        await fs.mkdir(path.dirname(targetAbs), { recursive: true });
        await fs.writeFile(targetAbs, content, 'utf8');
      }
    }
    await initGitRepoIfNeeded(repoDir, spec.record.name);
  }

  return specs.map((s) => ({ ...s.record }));
}
