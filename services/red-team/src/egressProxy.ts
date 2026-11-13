import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  parseDurationMs,
  verifySignedCampaignManifest,
  type EndpointHitRecord,
  type HitlApprovalRequest,
  type HttpMethod,
  type RiskTier,
  type SignedScopeManifest,
  type WebSocketOperation,
} from '@nightfall/core-contracts';
import type { AuditLedger } from '@nightfall/audit-ledger';
import type { PolicyGate } from '@nightfall/policy-gate';

export interface EgressPolicyProxyOptions {
  signedManifest: SignedScopeManifest;
  publicKeyPem: string;
  campaignId: string;
  askForApproval?: boolean;
  policyGate: PolicyGate;
  auditLedger: AuditLedger;
  startedAtMs?: number;
  nowFn?: () => number;
  targetTransportRedirects?: Record<string, string>;
}

export interface ProxyHttpRequestInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  actor?: string;
  workItemId?: string;
  approvalId?: string;
  mutatesState?: boolean;
}

export interface ProxyHttpResponse {
  allowed: boolean;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  riskTier: RiskTier;
  blockedReason?: string;
  pendingApproval?: HitlApprovalRequest;
}

export interface ProxyWebSocketInput {
  url: string;
  origin?: string;
  operation: WebSocketOperation;
  payload?: string;
  headers?: Record<string, string>;
  actor?: string;
  workItemId?: string;
  approvalId?: string;
  executeAgainstTarget?: boolean;
  responseTimeoutMs?: number;
}

export interface ProxyWebSocketResult {
  allowed: boolean;
  riskTier: RiskTier;
  responseFrame?: string;
  blockedReason?: string;
  pendingApproval?: HitlApprovalRequest;
}

interface PolicyEvaluationDecision {
  allowed: boolean;
  statusCode: number;
  reason: string;
  riskTier: RiskTier;
  pendingApproval?: HitlApprovalRequest;
}

function normalizeOriginToHttp(rawUrlOrOrigin: string): string {
  const parsed = new URL(rawUrlOrOrigin);
  const protocol =
    parsed.protocol === 'ws:'
      ? 'http:'
      : parsed.protocol === 'wss:'
        ? 'https:'
        : parsed.protocol;
  return `${protocol}//${parsed.host}`.toLowerCase();
}

function toWebSocketUrl(rawOriginOrUrl: string, pathAndSearch: string): string {
  const parsed = new URL(rawOriginOrUrl);
  const wsProto =
    parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? 'wss:' : 'ws:';
  return `${wsProto}//${parsed.host}${pathAndSearch}`;
}

export class EgressPolicyProxy {
  private readonly signedManifest: SignedScopeManifest;
  private readonly publicKeyPem: string;
  private readonly campaignId: string;
  private readonly askForApproval: boolean;
  private readonly policyGate: PolicyGate;
  private readonly auditLedger: AuditLedger;
  private readonly startedAtMs: number;
  private readonly nowFn: () => number;
  private readonly allowedNormalizedOrigins: Set<string>;
  private readonly transportRedirects = new Map<string, string>();
  private readonly maxDurationMs: number;
  private readonly maxRps: number;

  private tokens: number;
  private lastRefillMs: number;
  private allowedCount = 0;
  private blockedCount = 0;
  private readonly endpointHits = new Map<
    string,
    {
      method: EndpointHitRecord['method'];
      path: string;
      hits: number;
      actors: Set<string>;
    }
  >();

  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private activeSockets = new Set<WebSocket>();
  private boundPort = 0;

  constructor(options: EgressPolicyProxyOptions) {
    this.signedManifest = options.signedManifest;
    this.publicKeyPem = options.publicKeyPem;
    this.campaignId = options.campaignId;
    this.askForApproval = options.askForApproval ?? true;
    this.policyGate = options.policyGate;
    this.auditLedger = options.auditLedger;
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.startedAtMs = options.startedAtMs ?? this.nowFn();

    const manifest = this.signedManifest.manifest;
    this.allowedNormalizedOrigins = new Set(
      manifest.campaign.targets.map((target) => normalizeOriginToHttp(target)),
    );
    if (options.targetTransportRedirects) {
      for (const [logicalOrigin, localTarget] of Object.entries(options.targetTransportRedirects)) {
        this.transportRedirects.set(normalizeOriginToHttp(logicalOrigin), localTarget);
      }
    }
    this.maxDurationMs = parseDurationMs(manifest.campaign.max_duration);
    this.maxRps = manifest.campaign.max_requests_per_second;
    this.tokens = this.maxRps;
    this.lastRefillMs = this.startedAtMs;
  }

  private resolveTransportHttpUrl(approvedUrl: string): string {
    const parsed = new URL(approvedUrl);
    const redirectBase = this.transportRedirects.get(normalizeOriginToHttp(approvedUrl));
    if (!redirectBase) {
      return approvedUrl;
    }
    return new URL(`${parsed.pathname}${parsed.search}`, redirectBase).toString();
  }

  private resolveTransportWsUrl(approvedWsUrl: string): string {
    const parsed = new URL(approvedWsUrl);
    const redirectBase = this.transportRedirects.get(normalizeOriginToHttp(approvedWsUrl));
    if (!redirectBase) {
      return approvedWsUrl;
    }
    return toWebSocketUrl(redirectBase, `${parsed.pathname}${parsed.search}`);
  }

  isManifestSignatureValid(): boolean {
    return verifySignedCampaignManifest(this.signedManifest, this.publicKeyPem);
  }

  getStats(): { allowedCount: number; blockedCount: number } {
    return {
      allowedCount: this.allowedCount,
      blockedCount: this.blockedCount,
    };
  }

  getEndpointHits(): EndpointHitRecord[] {
    return Array.from(this.endpointHits.values()).map((entry) => ({
      method: entry.method,
      path: entry.path,
      hits: entry.hits,
      authScope: Array.from(entry.actors).join(', ') || 'anonymous',
    }));
  }

  private recordEndpointHit(
    method: EndpointHitRecord['method'],
    pathname: string,
    actor: string,
  ): void {
    const key = `${method}:${pathname}`;
    const existing = this.endpointHits.get(key);
    if (existing) {
      existing.hits += 1;
      existing.actors.add(actor);
    } else {
      this.endpointHits.set(key, {
        method,
        path: pathname,
        hits: 1,
        actors: new Set([actor]),
      });
    }
  }

  private tryConsumeRateToken(): boolean {
    const now = this.nowFn();
    const elapsedMs = Math.max(0, now - this.lastRefillMs);
    if (elapsedMs > 0) {
      const refill = (elapsedMs / 1000) * this.maxRps;
      this.tokens = Math.min(this.maxRps, this.tokens + refill);
      this.lastRefillMs = now;
    }
    if (this.tokens < 1) {
      return false;
    }
    this.tokens -= 1;
    return true;
  }

  private checkCommonGuards(params: {
    targetUrl: URL;
    methodOrOp: string;
    isWebSocket: boolean;
    actor: string;
  }): PolicyEvaluationDecision | null {
    const { targetUrl, methodOrOp, isWebSocket, actor } = params;
    const baseMeta = {
      campaignId: this.campaignId,
      actor,
      url: targetUrl.toString(),
      method: methodOrOp,
    };

    if (this.policyGate.isKillSwitchEngaged()) {
      const reason = 'Emergency kill-switch engaged';
      this.auditLedger.recordBlockedEgress(reason, baseMeta);
      return {
        allowed: false,
        statusCode: 503,
        reason,
        riskTier: 'TIER_3_RESTRICTED',
      };
    }

    if (!this.isManifestSignatureValid()) {
      const reason = 'Invalid or tampered SignedScopeManifest cryptographic signature';
      this.auditLedger.recordBlockedEgress(reason, baseMeta);
      return {
        allowed: false,
        statusCode: 403,
        reason,
        riskTier: 'TIER_3_RESTRICTED',
      };
    }

    const elapsedMs = this.nowFn() - this.startedAtMs;
    if (elapsedMs > this.maxDurationMs) {
      const reason = `Campaign max_duration (${this.signedManifest.manifest.campaign.max_duration}) exceeded`;
      this.auditLedger.recordBlockedEgress(reason, baseMeta);
      return {
        allowed: false,
        statusCode: 403,
        reason,
        riskTier: 'TIER_3_RESTRICTED',
      };
    }

    const normalizedTargetOrigin = normalizeOriginToHttp(targetUrl.toString());
    if (!this.allowedNormalizedOrigins.has(normalizedTargetOrigin)) {
      const riskTier = this.policyGate.classifyActionRisk({
        method: methodOrOp,
        path: targetUrl.pathname,
        isWebSocket,
        outsideStaging: true,
      });
      const reason = `Target origin ${normalizedTargetOrigin} is outside approved campaign.targets`;
      this.auditLedger.recordBlockedEgress(reason, { ...baseMeta, riskTier });
      return {
        allowed: false,
        statusCode: 403,
        reason,
        riskTier,
      };
    }

    return null;
  }

  evaluateHttpPolicy(input: ProxyHttpRequestInput): PolicyEvaluationDecision {
    const actor = input.actor ?? 'red-team-verifier';
    const upperMethod = input.method.trim().toUpperCase();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(input.url);
    } catch {
      const reason = `Malformed target URL: ${input.url}`;
      this.auditLedger.recordBlockedEgress(reason, { campaignId: this.campaignId, actor });
      return {
        allowed: false,
        statusCode: 400,
        reason,
        riskTier: 'TIER_3_RESTRICTED',
      };
    }

    const commonFailure = this.checkCommonGuards({
      targetUrl: parsedUrl,
      methodOrOp: upperMethod,
      isWebSocket: false,
      actor,
    });
    if (commonFailure) {
      return commonFailure;
    }

    const pathname = parsedUrl.pathname || '/';
    const httpRuleMatched = this.signedManifest.manifest.http.allow.some(
      (rule) =>
        rule.methods.includes(upperMethod as HttpMethod) &&
        rule.path_prefixes.some((prefix) => pathname.startsWith(prefix)),
    );

    const riskTier = this.policyGate.classifyActionRisk({
      method: upperMethod,
      path: pathname,
      isWebSocket: false,
      mutatesState: input.mutatesState,
      outsideStaging: false,
    });

    if (!httpRuleMatched) {
      const reason = `HTTP ${upperMethod} ${pathname} is disallowed by campaign.http.allow`;
      this.auditLedger.recordBlockedEgress(reason, {
        campaignId: this.campaignId,
        actor,
        method: upperMethod,
        path: pathname,
        riskTier,
      });
      return {
        allowed: false,
        statusCode: 403,
        reason,
        riskTier,
      };
    }

    const gateResult = this.policyGate.evaluateRequest({
      campaignId: this.campaignId,
      workItemId: input.workItemId,
      askForApproval: this.askForApproval,
      riskTier,
      actionSummary: `${upperMethod} ${pathname} as ${actor}`,
      targetEndpoint: `${upperMethod} ${parsedUrl.toString()}`,
      approvalId: input.approvalId,
    });

    if (!gateResult.allowed) {
      if (gateResult.pendingApproval) {
        this.auditLedger.append({
          subsystem: 'policy-gate',
          action: 'hitl.paused',
          entityId: this.campaignId,
          actor,
          summary: `Paused ${upperMethod} ${pathname} awaiting human approval (${gateResult.pendingApproval.id})`,
          metadata: { approvalId: gateResult.pendingApproval.id, riskTier },
        });
        return {
          allowed: false,
          statusCode: 428,
          reason: gateResult.reason,
          riskTier,
          pendingApproval: gateResult.pendingApproval,
        };
      }
      this.auditLedger.recordBlockedEgress(gateResult.reason, {
        campaignId: this.campaignId,
        actor,
        method: upperMethod,
        path: pathname,
        riskTier,
      });
      return {
        allowed: false,
        statusCode: 403,
        reason: gateResult.reason,
        riskTier,
      };
    }

    if (!this.tryConsumeRateToken()) {
      const reason = `Rate limit exceeded (max ${this.maxRps} req/s)`;
      this.auditLedger.recordBlockedEgress(reason, {
        campaignId: this.campaignId,
        actor,
        method: upperMethod,
        path: pathname,
      });
      return {
        allowed: false,
        statusCode: 429,
        reason,
        riskTier,
      };
    }

    return {
      allowed: true,
      statusCode: 200,
      reason: 'Allowed by scope manifest and PolicyGate',
      riskTier,
    };
  }

  evaluateWebSocketPolicy(input: ProxyWebSocketInput): PolicyEvaluationDecision {
    const actor = input.actor ?? 'red-team-verifier';
    const originHeader = input.origin ?? '*';
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(input.url);
    } catch {
      const reason = `Malformed WebSocket URL: ${input.url}`;
      this.auditLedger.recordBlockedEgress(reason, { campaignId: this.campaignId, actor });
      return {
        allowed: false,
        statusCode: 400,
        reason,
        riskTier: 'TIER_3_RESTRICTED',
      };
    }

    const commonFailure = this.checkCommonGuards({
      targetUrl: parsedUrl,
      methodOrOp: `WS:${input.operation}`,
      isWebSocket: true,
      actor,
    });
    if (commonFailure) {
      return commonFailure;
    }

    const pathname = parsedUrl.pathname || '/';
    const wsAllowRules = this.signedManifest.manifest.websocket?.allow ?? [];
    const wsRuleMatched = wsAllowRules.some((rule) => {
      const pathOk = rule.paths.some(
        (allowedPath) => pathname === allowedPath || pathname.startsWith(`${allowedPath}/`),
      );
      const originOk = rule.origins.includes('*') || rule.origins.includes(originHeader);
      const opOk = rule.operations.includes(input.operation);
      return pathOk && originOk && opOk;
    });

    const riskTier = this.policyGate.classifyActionRisk({
      method: 'WS',
      path: pathname,
      isWebSocket: true,
      outsideStaging: false,
    });

    if (!wsRuleMatched) {
      const reason = `WebSocket ${input.operation} on ${pathname} (origin: ${originHeader}) disallowed by campaign.websocket.allow`;
      this.auditLedger.recordBlockedEgress(reason, {
        campaignId: this.campaignId,
        actor,
        operation: input.operation,
        path: pathname,
        origin: originHeader,
        riskTier,
      });
      return {
        allowed: false,
        statusCode: 403,
        reason,
        riskTier,
      };
    }

    const gateResult = this.policyGate.evaluateRequest({
      campaignId: this.campaignId,
      workItemId: input.workItemId,
      askForApproval: this.askForApproval,
      riskTier,
      actionSummary: `WebSocket ${input.operation} ${pathname} as ${actor}`,
      targetEndpoint: `WS ${parsedUrl.toString()}`,
      approvalId: input.approvalId,
    });

    if (!gateResult.allowed) {
      if (gateResult.pendingApproval) {
        return {
          allowed: false,
          statusCode: 428,
          reason: gateResult.reason,
          riskTier,
          pendingApproval: gateResult.pendingApproval,
        };
      }
      this.auditLedger.recordBlockedEgress(gateResult.reason, {
        campaignId: this.campaignId,
        actor,
        operation: input.operation,
        path: pathname,
      });
      return {
        allowed: false,
        statusCode: 403,
        reason: gateResult.reason,
        riskTier,
      };
    }

    if (!this.tryConsumeRateToken()) {
      const reason = `WebSocket rate limit exceeded (max ${this.maxRps} ops/s)`;
      this.auditLedger.recordBlockedEgress(reason, {
        campaignId: this.campaignId,
        actor,
        operation: input.operation,
        path: pathname,
      });
      return {
        allowed: false,
        statusCode: 429,
        reason,
        riskTier,
      };
    }

    return {
      allowed: true,
      statusCode: 101,
      reason: 'Allowed WebSocket operation',
      riskTier,
    };
  }

  async proxyHttpRequest(input: ProxyHttpRequestInput): Promise<ProxyHttpResponse> {
    const actor = input.actor ?? 'red-team-verifier';
    const decision = this.evaluateHttpPolicy(input);
    if (!decision.allowed) {
      this.blockedCount += 1;
      return {
        allowed: false,
        statusCode: decision.statusCode,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: decision.reason }),
        riskTier: decision.riskTier,
        blockedReason: decision.reason,
        pendingApproval: decision.pendingApproval,
      };
    }

    const parsedUrl = new URL(input.url);
    const upperMethod = input.method.trim().toUpperCase();
    const hitMethod: EndpointHitRecord['method'] =
      upperMethod === 'GET' ||
      upperMethod === 'POST' ||
      upperMethod === 'PUT' ||
      upperMethod === 'PATCH' ||
      upperMethod === 'DELETE'
        ? upperMethod
        : 'GET';

    const transportHttpUrl = this.resolveTransportHttpUrl(input.url);
    const response = await fetch(transportHttpUrl, {
      method: upperMethod,
      headers: input.headers,
      body:
        upperMethod === 'GET' || upperMethod === 'HEAD' || input.body === undefined
          ? undefined
          : input.body,
    });

    const responseText = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    this.allowedCount += 1;
    this.recordEndpointHit(hitMethod, parsedUrl.pathname || '/', actor);

    return {
      allowed: true,
      statusCode: response.status,
      headers: responseHeaders,
      body: responseText,
      riskTier: decision.riskTier,
    };
  }

  async proxyWebSocketOperation(input: ProxyWebSocketInput): Promise<ProxyWebSocketResult> {
    const actor = input.actor ?? 'red-team-verifier';
    const decision = this.evaluateWebSocketPolicy(input);
    if (!decision.allowed) {
      this.blockedCount += 1;
      return {
        allowed: false,
        riskTier: decision.riskTier,
        blockedReason: decision.reason,
        pendingApproval: decision.pendingApproval,
      };
    }

    const parsedUrl = new URL(input.url);
    this.allowedCount += 1;
    this.recordEndpointHit('WS', parsedUrl.pathname || '/', actor);

    if (input.executeAgainstTarget === false) {
      return {
        allowed: true,
        riskTier: decision.riskTier,
      };
    }

    const timeoutMs = input.responseTimeoutMs ?? 4000;
    const wsHeaders: Record<string, string> = {
      ...(input.headers ?? {}),
    };
    if (input.origin && input.origin !== '*') {
      wsHeaders.Origin = input.origin;
    }

    const transportWsUrl = this.resolveTransportWsUrl(input.url);
    return new Promise<ProxyWebSocketResult>((resolve, reject) => {
      const ws = new WebSocket(transportWsUrl, { headers: wsHeaders });
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.terminate();
        reject(new Error(`WebSocket proxy operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      ws.once('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.terminate();
        reject(err);
      });

      ws.once('open', () => {
        if (input.operation === 'open' && input.payload === undefined) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve({
            allowed: true,
            riskTier: decision.riskTier,
          });
          return;
        }

        ws.once('message', (data) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const frameText = data.toString();
          ws.close();
          resolve({
            allowed: true,
            riskTier: decision.riskTier,
            responseFrame: frameText,
          });
        });

        ws.send(input.payload ?? '');
      });
    });
  }

  async startServer(
    port = 0,
  ): Promise<{ port: number; proxyUrl: string; wsProxyUrl: string }> {
    if (this.server) {
      return {
        port: this.boundPort,
        proxyUrl: `http://127.0.0.1:${this.boundPort}`,
        wsProxyUrl: `ws://127.0.0.1:${this.boundPort}`,
      };
    }

    const wss = new WebSocketServer({ noServer: true });
    this.wss = wss;

    const defaultTargetOrigin = this.signedManifest.manifest.campaign.targets[0]!;

    const server = http.createServer(async (req, res) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const rawBody = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined;

        const explicitTargetUrl = req.headers['x-nightfall-target-url'];
        const overrideOrigin = req.headers['x-nightfall-target-origin'];
        const actorHeader = req.headers['x-nightfall-actor'];

        let resolvedTargetUrl: string;
        if (typeof explicitTargetUrl === 'string' && explicitTargetUrl.length > 0) {
          resolvedTargetUrl = explicitTargetUrl;
        } else if (req.url && (req.url.startsWith('http://') || req.url.startsWith('https://'))) {
          resolvedTargetUrl = req.url;
        } else {
          const baseOrigin =
            typeof overrideOrigin === 'string' && overrideOrigin.length > 0
              ? overrideOrigin
              : defaultTargetOrigin;
          resolvedTargetUrl = new URL(req.url ?? '/', baseOrigin).toString();
        }

        const forwardHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (
            k.startsWith('x-nightfall-') ||
            k === 'host' ||
            k === 'connection' ||
            k === 'content-length'
          ) {
            continue;
          }
          if (typeof v === 'string') {
            forwardHeaders[k] = v;
          }
        }

        const proxyResult = await this.proxyHttpRequest({
          method: req.method ?? 'GET',
          url: resolvedTargetUrl,
          headers: forwardHeaders,
          body: rawBody,
          actor: typeof actorHeader === 'string' ? actorHeader : 'http-proxy-client',
        });

        res.writeHead(proxyResult.statusCode, {
          'Content-Type': proxyResult.headers['content-type'] ?? 'application/json',
          'X-Nightfall-Risk-Tier': proxyResult.riskTier,
        });
        res.end(proxyResult.body);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unexpected proxy failure';
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
    });

    server.on('upgrade', (req, socket, head) => {
      const overrideOrigin = req.headers['x-nightfall-target-origin'];
      const actorHeader = req.headers['x-nightfall-actor'];
      const actor = typeof actorHeader === 'string' ? actorHeader : 'ws-proxy-client';
      const baseOrigin =
        typeof overrideOrigin === 'string' && overrideOrigin.length > 0
          ? overrideOrigin
          : defaultTargetOrigin;
      const targetWsUrl = toWebSocketUrl(baseOrigin, req.url ?? '/');
      const clientOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : '*';

      const openDecision = this.evaluateWebSocketPolicy({
        url: targetWsUrl,
        origin: clientOrigin,
        operation: 'open',
        actor,
      });

      if (!openDecision.allowed) {
        this.blockedCount += 1;
        const errJson = JSON.stringify({ error: openDecision.reason });
        socket.write(
          `HTTP/1.1 ${openDecision.statusCode} Forbidden\r\n` +
            `Content-Type: application/json\r\n` +
            `Content-Length: ${Buffer.byteLength(errJson)}\r\n` +
            `Connection: close\r\n\r\n` +
            errJson,
        );
        socket.destroy();
        return;
      }

      const parsedWsUrl = new URL(targetWsUrl);
      this.allowedCount += 1;
      this.recordEndpointHit('WS', parsedWsUrl.pathname || '/', actor);

      const upstreamHeaders: Record<string, string> = {};
      if (typeof req.headers.authorization === 'string') {
        upstreamHeaders.Authorization = req.headers.authorization;
      }
      if (typeof req.headers.origin === 'string') {
        upstreamHeaders.Origin = req.headers.origin;
      }

      wss.handleUpgrade(req, socket, head, (clientWs) => {
        this.activeSockets.add(clientWs);
        clientWs.on('close', () => this.activeSockets.delete(clientWs));

        const upstreamTransportUrl = this.resolveTransportWsUrl(targetWsUrl);
        const upstreamWs = new WebSocket(upstreamTransportUrl, { headers: upstreamHeaders });
        this.activeSockets.add(upstreamWs);
        upstreamWs.on('close', () => this.activeSockets.delete(upstreamWs));

        const pendingFrames: string[] = [];
        let upstreamOpen = false;

        upstreamWs.on('open', () => {
          upstreamOpen = true;
          for (const frame of pendingFrames.splice(0, pendingFrames.length)) {
            upstreamWs.send(frame);
          }
        });

        upstreamWs.on('message', (data) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data.toString());
          }
        });

        upstreamWs.on('close', () => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close();
          }
        });

        upstreamWs.on('error', () => {
          clientWs.terminate();
        });

        clientWs.on('message', (raw) => {
          const sendDecision = this.evaluateWebSocketPolicy({
            url: targetWsUrl,
            origin: clientOrigin,
            operation: 'send',
            actor,
          });
          if (!sendDecision.allowed) {
            this.blockedCount += 1;
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'error',
                  code: 'EGRESS_BLOCKED',
                  reason: sendDecision.reason,
                }),
              );
              clientWs.close();
            }
            upstreamWs.close();
            return;
          }

          this.allowedCount += 1;
          const text = raw.toString();
          if (upstreamOpen && upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.send(text);
          } else {
            pendingFrames.push(text);
          }
        });

        clientWs.on('close', () => {
          if (
            upstreamWs.readyState === WebSocket.OPEN ||
            upstreamWs.readyState === WebSocket.CONNECTING
          ) {
            upstreamWs.close();
          }
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve());
    });

    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind EgressPolicyProxy local server');
    }
    this.boundPort = addr.port;
    this.server = server;

    return {
      port: this.boundPort,
      proxyUrl: `http://127.0.0.1:${this.boundPort}`,
      wsProxyUrl: `ws://127.0.0.1:${this.boundPort}`,
    };
  }

  async stopServer(): Promise<void> {
    for (const ws of this.activeSockets) {
      try {
        ws.terminate();
      } catch {
        // ignore termination errors
      }
    }
    this.activeSockets.clear();

    if (this.wss) {
      const wss = this.wss;
      this.wss = null;
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }

    if (this.server) {
      const server = this.server;
      this.server = null;
      this.boundPort = 0;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
