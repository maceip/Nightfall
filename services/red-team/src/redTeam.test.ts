import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import {
  generateScopeKeyPair,
  parseCampaignYaml,
  signCampaignManifest,
  type CampaignYamlV5,
} from '@nightfall/core-contracts';
import { AuditLedger } from '@nightfall/audit-ledger';
import { PolicyGate } from '@nightfall/policy-gate';
import { EgressPolicyProxy } from './egressProxy.js';
import { RedTeamEngine } from './redTeamEngine.js';

describe('@nightfall/red-team EgressPolicyProxy & RedTeamEngine', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('enforces signed scope manifest, target origin, HTTP verbs, RPS token bucket, HITL, and kill-switch', async () => {
    let upstreamHits = 0;
    const upstreamServer = http.createServer((_req, res) => {
      upstreamHits += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise<void>((resolve) => upstreamServer.close(() => resolve())));

    const port = (upstreamServer.address() as { port: number }).port;
    const targetOrigin = `http://127.0.0.1:${port}`;

    const keys = generateScopeKeyPair('rt-unit-key');
    const manifest: CampaignYamlV5 = {
      objective: 'Test L7 egress enforcement',
      campaign: {
        name: 'egress-unit',
        targets: [targetOrigin],
        source: { archive: 'src.tar.gz' },
        max_duration: '10m',
        max_requests_per_second: 2,
      },
      credentials: {},
      http: {
        allow: [{ methods: ['GET', 'POST'], path_prefixes: ['/api/'] }],
      },
      websocket: {
        allow: [{ paths: ['/ws/documents'], origins: ['*'], operations: ['open', 'send'] }],
      },
    };
    const signed = signCampaignManifest(manifest, keys.privateKeyPem, keys.keyId);

    const ledger = new AuditLedger();
    const policyGate = new PolicyGate();
    let fakeNow = 1_000_000;

    const proxy = new EgressPolicyProxy({
      signedManifest: signed,
      publicKeyPem: keys.publicKeyPem,
      campaignId: 'camp-egress-1',
      askForApproval: true,
      policyGate,
      auditLedger: ledger,
      startedAtMs: fakeNow,
      nowFn: () => fakeNow,
    });

    // 1. Out-of-scope host blocked
    const badHost = await proxy.proxyHttpRequest({
      method: 'GET',
      url: 'https://external.example.com/api/me',
    });
    expect(badHost.allowed).toBe(false);
    expect(badHost.statusCode).toBe(403);
    expect(upstreamHits).toBe(0);

    // 2. Disallowed HTTP method (DELETE) blocked
    const badVerb = await proxy.proxyHttpRequest({
      method: 'DELETE',
      url: `${targetOrigin}/api/documents/1`,
    });
    expect(badVerb.allowed).toBe(false);
    expect(badVerb.statusCode).toBe(403);
    expect(upstreamHits).toBe(0);

    // 3. State-mutating action with askForApproval=true pauses with 428 HITL approval
    const hitlPaused = await proxy.proxyHttpRequest({
      method: 'POST',
      url: `${targetOrigin}/api/retention`,
      mutatesState: true,
      workItemId: 'wq-mut-1',
    });
    expect(hitlPaused.allowed).toBe(false);
    expect(hitlPaused.statusCode).toBe(428);
    expect(hitlPaused.pendingApproval?.status).toBe('pending');
    expect(upstreamHits).toBe(0);

    // 4. Allowed GET requests consume RPS token bucket (max 2 RPS)
    const ok1 = await proxy.proxyHttpRequest({
      method: 'GET',
      url: `${targetOrigin}/api/me`,
      actor: 'alice',
    });
    const ok2 = await proxy.proxyHttpRequest({
      method: 'GET',
      url: `${targetOrigin}/api/me`,
      actor: 'bob',
    });
    const rateLimited = await proxy.proxyHttpRequest({
      method: 'GET',
      url: `${targetOrigin}/api/me`,
      actor: 'alice',
    });
    expect(ok1.allowed).toBe(true);
    expect(ok2.allowed).toBe(true);
    expect(rateLimited.allowed).toBe(false);
    expect(rateLimited.statusCode).toBe(429);
    expect(upstreamHits).toBe(2);

    // Refill clock by 1s and engage kill-switch
    fakeNow += 1_000;
    policyGate.engageKillSwitch('Unit test emergency halt');
    const killed = await proxy.proxyHttpRequest({
      method: 'GET',
      url: `${targetOrigin}/api/me`,
    });
    expect(killed.allowed).toBe(false);
    expect(killed.statusCode).toBe(503);
    expect(upstreamHits).toBe(2);

    // Verify blocked egress count in AuditLedger
    const safety = ledger.getSafetyMonitorStatus();
    expect(safety.withinApprovedScope).toBe(true);
    expect(safety.blockedRequestsCount).toBe(4);
    expect(proxy.getEndpointHits()[0]).toEqual({
      method: 'GET',
      path: '/api/me',
      hits: 2,
      authScope: 'alice, bob',
    });
  });

  it('intercepts real HTTP and WebSocket traffic via local EgressPolicyProxy server', async () => {
    const upstreamWss = new WebSocketServer({ noServer: true });
    const upstreamHttp = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hello: 'staging' }));
    });
    upstreamHttp.on('upgrade', (req, socket, head) => {
      upstreamWss.handleUpgrade(req, socket, head, (ws) => {
        ws.on('message', (msg) => ws.send(`echo:${msg.toString()}`));
      });
    });
    await new Promise<void>((resolve) => upstreamHttp.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await new Promise<void>((resolve) => upstreamWss.close(() => resolve()));
      await new Promise<void>((resolve) => upstreamHttp.close(() => resolve()));
    });

    const upstreamPort = (upstreamHttp.address() as { port: number }).port;
    const targetOrigin = `http://127.0.0.1:${upstreamPort}`;

    const keys = generateScopeKeyPair('ws-proxy-key');
    const signed = signCampaignManifest(
      {
        objective: 'Check HTTP + WS proxy server',
        campaign: {
          name: 'ws-proxy-test',
          targets: [targetOrigin],
          source: { archive: 'src.tar.gz' },
          max_duration: '5m',
          max_requests_per_second: 20,
        },
        credentials: {},
        http: { allow: [{ methods: ['GET'], path_prefixes: ['/api'] }] },
        websocket: {
          allow: [{ paths: ['/ws/documents'], origins: ['*'], operations: ['open', 'send'] }],
        },
      },
      keys.privateKeyPem,
      keys.keyId,
    );

    const proxy = new EgressPolicyProxy({
      signedManifest: signed,
      publicKeyPem: keys.publicKeyPem,
      campaignId: 'camp-ws-srv',
      policyGate: new PolicyGate(),
      auditLedger: new AuditLedger(),
    });
    const { proxyUrl, wsProxyUrl } = await proxy.startServer(0);
    cleanups.push(() => proxy.stopServer());

    // Allowed HTTP GET through live proxy server
    const httpRes = await fetch(`${proxyUrl}/api/status`);
    expect(httpRes.status).toBe(200);
    expect(await httpRes.json()).toEqual({ hello: 'staging' });

    // Blocked HTTP DELETE through live proxy server
    const delRes = await fetch(`${proxyUrl}/api/status`, { method: 'DELETE' });
    expect(delRes.status).toBe(403);

    // Allowed WebSocket /ws/documents round-trip through live proxy server
    const echoed = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`${wsProxyUrl}/ws/documents`);
      ws.once('error', reject);
      ws.once('open', () => ws.send('ping-doc'));
      ws.once('message', (data) => {
        ws.close();
        resolve(data.toString());
      });
    });
    expect(echoed).toBe('echo:ping-doc');

    // Blocked WebSocket /ws/admin rejected on upgrade
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`${wsProxyUrl}/ws/admin`);
        ws.once('open', () => {
          ws.close();
          resolve();
        });
        ws.once('error', reject);
        ws.once('unexpected-response', (_req, res) => {
          ws.terminate();
          if (res.statusCode === 403) {
            reject(new Error('WS_UPGRADE_403'));
          } else {
            resolve();
          }
        });
      }),
    ).rejects.toThrow('WS_UPGRADE_403');
  });

  it('prepares valid v5 draft campaigns and discards static false positives', () => {
    const engine = new RedTeamEngine();
    const draft = engine.prepareCampaignFromPrompt({
      prompt: 'Verify tenant isolation on workspace export endpoints.',
      targetUrl: 'https://staging.northstardocs.com',
      askForApproval: true,
      modelId: 'gpt-6-cyber-ultra',
    });

    expect(draft.status).toBe('draft');
    const parsed = parseCampaignYaml(draft.yamlText);
    expect(parsed.campaign.targets).toEqual(['https://staging.northstardocs.com']);
    expect(draft.id.startsWith('camp-')).toBe(true);
    expect(draft.safetyMonitorText).toContain('approved staging scope');

    const dispositions = engine.evaluateExternalFindings([
      { id: 'SAST-1', route: '/internal/legacy-export', reachableInCode: false, sanitizedInCode: false },
      { id: 'SAST-2', route: '/api/v2/search', reachableInCode: true, sanitizedInCode: true },
      { id: 'SAST-3', route: '/api/v2/exports', reachableInCode: true, sanitizedInCode: false },
    ]);

    expect(dispositions[0]?.disposition).toBe('discarded_fp');
    expect(dispositions[1]?.disposition).toBe('discarded_fp');
    expect(dispositions[2]?.disposition).toBe('needs_runtime_check');
  });
});
