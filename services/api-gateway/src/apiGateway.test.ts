import { afterEach, describe, expect, it } from 'vitest';
import type { FindingRecord, FixProposal, HitlApprovalRequest } from '@nightfall/core-contracts';
import { NightfallOrchestrator } from '@nightfall/closed-loop-orchestrator';
import { createApiServer } from './index.js';

describe('@nightfall/api-gateway HTTP + SSE server', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length > 0) {
      const fn = closers.pop();
      if (fn) await fn();
    }
  });

  it('serves all REST routes backed by real SQLite + LiteBox orchestrator and streams live SSE events', async () => {
    const orchestrator = new NightfallOrchestrator();
    const server = createApiServer(orchestrator);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => server.closeGracefully());

    const port = (server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // OPTIONS CORS preflight
    const optRes = await fetch(`${baseUrl}/api/bootstrap`, { method: 'OPTIONS' });
    expect(optRes.status).toBe(204);
    expect(optRes.headers.get('access-control-allow-origin')).toBe('*');

    // GET /api/health exposes sandboxToolchain
    const healthRes = await fetch(`${baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as {
      status: string;
      sandboxToolchain: { available: boolean; southPlatform: string };
    };
    expect(healthJson.status).toBe('ok');
    expect(healthJson.sandboxToolchain.available).toBe(true);

    // GET /api/bootstrap awaits ensureBootstrapped() automatically
    const bootRes = await fetch(`${baseUrl}/api/bootstrap`);
    expect(bootRes.status).toBe(200);
    const bootJson = (await bootRes.json()) as {
      overview: { openFindingsCount: number };
      findings: FindingRecord[];
      fixes: FixProposal[];
      approvals: HitlApprovalRequest[];
      models: unknown[];
      sandboxToolchain: { available: boolean };
    };
    expect(bootJson.overview.openFindingsCount).toBeGreaterThanOrEqual(8);
    expect(bootJson.findings.length).toBe(bootJson.overview.openFindingsCount);
    expect(bootJson.fixes.some((fx) => fx.sandboxBackend === 'microsoft-litebox')).toBe(true);
    expect(bootJson.sandboxToolchain.available).toBe(true);
    expect(bootJson.models.length).toBe(4);

    // Open GET /api/events SSE stream and capture streamed event when real scan runs
    const abortController = new AbortController();
    const ssePromise = (async () => {
      const sseRes = await fetch(`${baseUrl}/api/events`, {
        signal: abortController.signal,
      });
      expect(sseRes.headers.get('content-type')).toContain('text/event-stream');
      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('"type":"scan.updated"')) {
          abortController.abort();
          break;
        }
      }
      return buffer;
    })();

    await new Promise((r) => setTimeout(r, 40));

    const scanRes = await fetch(`${baseUrl}/api/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'local',
        repository: 'asset-servicing',
        method: 'repository_scan',
        scope: 'full_repository',
      }),
    });
    expect(scanRes.status).toBe(200);

    const sseOutput = await ssePromise.catch((err: unknown) =>
      err instanceof Error && err.name === 'AbortError' ? 'aborted-after-match' : String(err),
    );
    expect(sseOutput.length).toBeGreaterThan(0);

    // POST /api/findings/:id/duplicate on a real payments-ledger finding
    const paymentsFinding = bootJson.findings.find(
      (f) => f.repository === 'payments-ledger' && !f.fixId,
    )!;
    const dupRes = await fetch(
      `${baseUrl}/api/findings/${encodeURIComponent(paymentsFinding.id)}/duplicate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(dupRes.status).toBe(200);

    // POST /api/findings/:id/start-fix on a real auth-gateway finding
    const authFinding = bootJson.findings.find(
      (f) => f.repository === 'auth-gateway' && !f.fixId,
    )!;
    const startFixRes = await fetch(
      `${baseUrl}/api/findings/${encodeURIComponent(authFinding.id)}/start-fix`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(startFixRes.status).toBe(200);
    const { fix } = (await startFixRes.json()) as {
      fix: { id: string; commitSha?: string; branchName?: string };
    };
    expect(fix.commitSha).toMatch(/^[0-9a-f]{40}$/);

    // POST /api/fixes/:id/followup
    const followUpRes = await fetch(`${baseUrl}/api/fixes/${encodeURIComponent(fix.id)}/followup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Add structured denial audit log' }),
    });
    expect(followUpRes.status).toBe(200);

    // POST /api/fixes/:id/merge-and-verify
    const mergeRes = await fetch(
      `${baseUrl}/api/fixes/${encodeURIComponent(fix.id)}/merge-and-verify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(mergeRes.status).toBe(200);
    const mergedBody = (await mergeRes.json()) as {
      fix: { status: string };
      finding: { fixVerification: string };
    };
    expect(mergedBody.fix.status).toBe('merged');
    expect(mergedBody.finding.fixVerification).toBe('verified');

    // POST /api/repositories/:id/toggle-scans
    const toggleRepoRes = await fetch(
      `${baseUrl}/api/repositories/repo-edge-ingress-mesh/toggle-scans`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(toggleRepoRes.status).toBe(200);

    // POST /api/red-team/campaigns/prepare & launch (real HTTP + WS execution!)
    const prepRes = await fetch(`${baseUrl}/api/red-team/campaigns/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Verify document export ACLs',
        targetUrl: 'https://staging.northstardocs.com',
        askForApproval: true,
        modelId: 'gpt-6-cyber-ultra',
      }),
    });
    expect(prepRes.status).toBe(200);
    const { campaign } = (await prepRes.json()) as { campaign: { id: string } };

    const launchRes = await fetch(`${baseUrl}/api/red-team/campaigns/${campaign.id}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(launchRes.status).toBe(200);
    const launchedBody = (await launchRes.json()) as {
      campaign: { status: string; endpoints: unknown[]; findingIds: string[] };
    };
    expect(launchedBody.campaign.endpoints.length).toBeGreaterThan(0);
    expect(launchedBody.campaign.findingIds).toEqual(expect.arrayContaining(['F-001', 'F-002']));

    // POST /api/policy/approvals/:id/resolve on real pending approval
    const refreshedBoot = (await (await fetch(`${baseUrl}/api/bootstrap`)).json()) as {
      approvals: HitlApprovalRequest[];
    };
    const pendingApproval = refreshedBoot.approvals.find((a) => a.status === 'pending')!;
    expect(pendingApproval).toBeDefined();

    const resolveRes = await fetch(
      `${baseUrl}/api/policy/approvals/${encodeURIComponent(pendingApproval.id)}/resolve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approved' }),
      },
    );
    expect(resolveRes.status).toBe(200);

    // POST /api/policy/kill-switch
    const killRes = await fetch(`${baseUrl}/api/policy/kill-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engaged: true, reason: 'Integration test halt' }),
    });
    expect(killRes.status).toBe(200);
    expect((await killRes.json()) as { engaged: boolean }).toMatchObject({ engaged: true });
  });
});
