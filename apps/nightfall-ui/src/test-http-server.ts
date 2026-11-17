import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  NewScanRequestSchema,
  ScorecardScanRequestSchema,
  type NewScanRequest,
  type ScorecardScanRequest,
} from '@nightfall/core-contracts';
import { buildContractValidatedTestState } from './test-http-fixtures.js';

export type EphemeralTestServer = {
  baseUrl: string;
  capturedScans: NewScanRequest[];
  capturedScorecardScans: ScorecardScanRequest[];
  close: () => Promise<void>;
};

export async function startContractValidatedTestServer(options?: {
  failFirstBootstrap?: boolean;
}): Promise<EphemeralTestServer> {
  let failFirstBootstrap = options?.failFirstBootstrap ?? false;
  const capturedScans: NewScanRequest[] = [];
  const capturedScorecardScans: ScorecardScanRequest[] = [];
  const state = buildContractValidatedTestState();

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url === '/api/bootstrap') {
      if (failFirstBootstrap) {
        failFirstBootstrap = false;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Gateway warming up' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }
    if (req.url?.startsWith('/api/scorecard/reports') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          reports: state.scorecardReports,
          toolchain: state.scorecardToolchain,
        }),
      );
      return;
    }
    if (req.url === '/api/scorecard/checks' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          checks: state.scorecardReports[0]!.checks.map((c) => ({
            name: c.name,
            risk: c.risk,
            short: c.short,
            description: c.description,
            tags: c.tags,
            remediationSteps: c.remediationSteps,
            supportedRepoTypes: ['local', 'GitHub'],
            documentationUrl: c.documentationUrl,
          })),
          toolchain: state.scorecardToolchain,
        }),
      );
      return;
    }
    if (req.url === '/api/scorecard/scan' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const ch of req) chunks.push(Buffer.from(ch));
      const parsed = ScorecardScanRequestSchema.parse(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
      );
      capturedScorecardScans.push(parsed);
      const updatedReport = {
        ...state.scorecardReports[0]!,
        repository: parsed.repository,
        evaluatedAt: new Date().toISOString(),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          report: updatedReport,
          promotedFindings: state.findings.filter((f) => f.sources.includes('scorecard')),
          overview: state.overview,
          repositories: state.repositories,
        }),
      );
      return;
    }
    if (req.url === '/api/scans' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const ch of req) chunks.push(Buffer.from(ch));
      const parsed = NewScanRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      capturedScans.push(parsed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          scan: {
            id: 'scan-local-202',
            repository: parsed.repository,
            mode: parsed.mode,
            method: parsed.method,
            scope: parsed.scope,
            status: 'completed',
            findingsDiscovered: 1,
            startedAt: new Date().toISOString(),
          },
        }),
      );
      return;
    }
    if (req.url?.endsWith('/merge-and-verify') && req.method === 'POST') {
      state.fixes[0] = { ...state.fixes[0]!, status: 'merged' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ fix: state.fixes[0] }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}/api`,
    capturedScans,
    capturedScorecardScans,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
