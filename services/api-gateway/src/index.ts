import http from 'node:http';
import { NewScanRequestSchema } from '@nightfall/core-contracts';
import { NightfallOrchestrator } from '@nightfall/closed-loop-orchestrator';

export const PACKAGE_NAME = '@nightfall/api-gateway';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const serialized = JSON.stringify(payload);
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(serialized),
  });
  res.end(serialized);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error('Expected JSON object request body.');
}

export interface ApiGatewayInstance {
  server: http.Server;
  orchestrator: NightfallOrchestrator;
  close: () => Promise<void>;
}

export function createApiServer(
  customOrchestrator?: NightfallOrchestrator,
): http.Server & { orchestrator: NightfallOrchestrator; closeGracefully: () => Promise<void> } {
  const orchestrator = customOrchestrator ?? new NightfallOrchestrator();
  const activeSseResponses = new Set<http.ServerResponse>();

  const server = http.createServer(async (req, res) => {
    const method = (req.method ?? 'GET').toUpperCase();
    const urlObj = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = urlObj.pathname;

    if (method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    try {
      if (method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          status: 'ok',
          service: PACKAGE_NAME,
          timestamp: new Date().toISOString(),
          killSwitchEngaged: orchestrator.policyGate.isKillSwitchEngaged(),
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/bootstrap') {
        sendJson(res, 200, orchestrator.getBootstrapState());
        return;
      }

      if (method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
          ...CORS_HEADERS,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.flushHeaders();
        res.write(': nightfall-sse-connected\n\n');

        activeSseResponses.add(res);

        const unsubscribe = orchestrator.subscribe((event) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        });

        const keepAliveTimer = setInterval(() => {
          if (!res.writableEnded) {
            res.write(': keepalive\n\n');
          }
        }, 15_000);
        keepAliveTimer.unref?.();

        const cleanup = () => {
          clearInterval(keepAliveTimer);
          unsubscribe();
          activeSseResponses.delete(res);
        };

        req.on('close', cleanup);
        res.on('close', cleanup);
        return;
      }

      if (method === 'POST' && pathname === '/api/scans') {
        const body = await readJsonBody(req);
        const parsedReq = NewScanRequestSchema.parse(body);
        const result = await orchestrator.triggerScan(parsedReq);
        sendJson(res, 200, result);
        return;
      }

      const dupMatch = /^\/api\/findings\/([^/]+)\/duplicate$/.exec(pathname);
      if (dupMatch && method === 'POST') {
        const findingId = decodeURIComponent(dupMatch[1]!);
        const body = await readJsonBody(req);
        const duplicateOfId =
          typeof body.duplicateOfId === 'string' ? body.duplicateOfId : undefined;
        const result = orchestrator.markFindingDuplicate(findingId, duplicateOfId);
        sendJson(res, 200, result);
        return;
      }

      const startFixMatch = /^\/api\/findings\/([^/]+)\/start-fix$/.exec(pathname);
      if (startFixMatch && method === 'POST') {
        const findingId = decodeURIComponent(startFixMatch[1]!);
        await readJsonBody(req);
        const result = await orchestrator.startFixForFinding(findingId);
        sendJson(res, 200, result);
        return;
      }

      const followUpMatch = /^\/api\/fixes\/([^/]+)\/followup$/.exec(pathname);
      if (followUpMatch && method === 'POST') {
        const fixId = decodeURIComponent(followUpMatch[1]!);
        const body = await readJsonBody(req);
        if (typeof body.message !== 'string' || !body.message.trim()) {
          sendJson(res, 400, { error: 'Non-empty string "message" is required.' });
          return;
        }
        const result = await orchestrator.applyFixFollowUp(fixId, body.message);
        sendJson(res, 200, result);
        return;
      }

      const mergeMatch = /^\/api\/fixes\/([^/]+)\/merge-and-verify$/.exec(pathname);
      if (mergeMatch && method === 'POST') {
        const fixId = decodeURIComponent(mergeMatch[1]!);
        await readJsonBody(req);
        const { fix, finding, overview } = await orchestrator.mergeAndVerifyFix(fixId);
        sendJson(res, 200, { fix, finding, overview });
        return;
      }

      const repoToggleMatch = /^\/api\/repositories\/([^/]+)\/toggle-scans$/.exec(pathname);
      if (repoToggleMatch && method === 'POST') {
        const repoId = decodeURIComponent(repoToggleMatch[1]!);
        await readJsonBody(req);
        const result = orchestrator.toggleRepositoryScans(repoId);
        sendJson(res, 200, result);
        return;
      }

      if (method === 'POST' && pathname === '/api/red-team/campaigns/prepare') {
        const body = await readJsonBody(req);
        const prompt = typeof body.prompt === 'string' ? body.prompt : '';
        const targetUrl = typeof body.targetUrl === 'string' ? body.targetUrl : '';
        if (!prompt.trim() || !targetUrl.trim()) {
          sendJson(res, 400, { error: 'Fields "prompt" and "targetUrl" are required.' });
          return;
        }
        const result = orchestrator.prepareCampaign({
          prompt,
          targetUrl,
          sourceLabel: typeof body.sourceLabel === 'string' ? body.sourceLabel : undefined,
          askForApproval:
            typeof body.askForApproval === 'boolean' ? body.askForApproval : true,
          modelId:
            typeof body.modelId === 'string' && body.modelId
              ? body.modelId
              : 'gpt-6-cyber-ultra',
        });
        sendJson(res, 200, result);
        return;
      }

      const launchMatch = /^\/api\/red-team\/campaigns\/([^/]+)\/launch$/.exec(pathname);
      if (launchMatch && method === 'POST') {
        const campaignId = decodeURIComponent(launchMatch[1]!);
        const body = await readJsonBody(req);
        const yamlText = typeof body.yamlText === 'string' ? body.yamlText : undefined;
        const result = orchestrator.launchCampaign(campaignId, yamlText);
        sendJson(res, 200, result);
        return;
      }

      const approvalMatch = /^\/api\/policy\/approvals\/([^/]+)\/resolve$/.exec(pathname);
      if (approvalMatch && method === 'POST') {
        const approvalId = decodeURIComponent(approvalMatch[1]!);
        const body = await readJsonBody(req);
        if (body.decision !== 'approved' && body.decision !== 'rejected') {
          sendJson(res, 400, {
            error: 'Field "decision" must be "approved" or "rejected".',
          });
          return;
        }
        const result = orchestrator.resolveApproval(approvalId, body.decision);
        sendJson(res, 200, result);
        return;
      }

      if (method === 'POST' && pathname === '/api/policy/kill-switch') {
        const body = await readJsonBody(req);
        if (typeof body.engaged !== 'boolean') {
          sendJson(res, 400, { error: 'Boolean field "engaged" is required.' });
          return;
        }
        const reason = typeof body.reason === 'string' ? body.reason : undefined;
        const result = orchestrator.setKillSwitch(body.engaged, reason);
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { error: `Route ${method} ${pathname} not found` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      const isNotFound = message.toLowerCase().includes('not found');
      sendJson(res, isNotFound ? 404 : 400, { error: message });
    }
  });

  const closeGracefully = async (): Promise<void> => {
    orchestrator.dispose();
    for (const sseRes of activeSseResponses) {
      try {
        sseRes.end();
      } catch {
        // ignore socket close errors
      }
    }
    activeSseResponses.clear();

    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };

  return Object.assign(server, {
    orchestrator,
    closeGracefully,
  });
}
