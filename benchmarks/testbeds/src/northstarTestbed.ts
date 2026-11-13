import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';

export const ALICE_TOKEN = 'tok-alice-ws-a';
export const BOB_TOKEN = 'tok-bob-ws-b';
export const ALICE_WORKSPACE_ID = 'ws_a';
export const BOB_WORKSPACE_ID = '90b2e16a-70d2-4c1d-b8e5-5f34609f8a2c';
export const WS_A_CANARY = 'NS-7b64c9e2';
export const WS_CHANNEL_CANARY = 'NS-ws-4410a';

export interface TestbedPrincipal {
  userId: string;
  workspaceId: string;
  role: 'editor' | 'commenter' | 'guest';
}

export interface SyntheticDocument {
  id: string;
  workspaceId: string;
  public: boolean;
  title: string;
  body: string;
  wsMarker?: string;
}

export interface SavedSearchRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  titleContains: string;
}

export interface UpstreamHitLog {
  method: string;
  path: string;
  actor: string;
  timestamp: string;
}

const PRINCIPALS_BY_TOKEN = new Map<string, TestbedPrincipal>([
  [ALICE_TOKEN, { userId: 'alice', workspaceId: ALICE_WORKSPACE_ID, role: 'editor' }],
  [BOB_TOKEN, { userId: 'bob', workspaceId: BOB_WORKSPACE_ID, role: 'editor' }],
]);

const INITIAL_DOCUMENTS: SyntheticDocument[] = [
  {
    id: 'doc_tpl_104',
    workspaceId: 'templates',
    public: true,
    title: 'Project Charter Template',
    body: '# Public Template\n\nStandard project charter outline for all teams.\n',
  },
  {
    id: 'doc_ws_a_101',
    workspaceId: ALICE_WORKSPACE_ID,
    public: false,
    title: 'Release Checklist v2',
    body: `# Private document\n\nDraft v2: circulate the release checklist to reviewers only.\nVerification marker: ${WS_A_CANARY}.\n`,
    wsMarker: WS_CHANNEL_CANARY,
  },
  {
    id: 'doc_ws_b_201',
    workspaceId: BOB_WORKSPACE_ID,
    public: false,
    title: 'Workspace B Onboarding',
    body: '# Workspace B\n\nSynthetic onboarding notes for Workspace B.\n',
  },
];

export class NorthstarDocsTestbedServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private openSockets = new Set<WebSocket>();
  private savedSearches = new Map<string, SavedSearchRecord>();
  private upstreamHits: UpstreamHitLog[] = [];
  private wsSubscribeAclPatched = false;
  private savedSearchExportPatched = false;
  private boundPort = 0;

  get port(): number {
    return this.boundPort;
  }

  get baseUrl(): string {
    if (!this.boundPort) {
      throw new Error('NorthstarDocsTestbedServer is not started');
    }
    return `http://127.0.0.1:${this.boundPort}`;
  }

  get wsUrl(): string {
    if (!this.boundPort) {
      throw new Error('NorthstarDocsTestbedServer is not started');
    }
    return `ws://127.0.0.1:${this.boundPort}`;
  }

  applyWebSocketAclPatch(): void {
    this.wsSubscribeAclPatched = true;
  }

  applySavedSearchExportPatch(): void {
    this.savedSearchExportPatched = true;
  }

  applyAllPatches(): void {
    this.wsSubscribeAclPatched = true;
    this.savedSearchExportPatched = true;
  }

  resetPatches(): void {
    this.wsSubscribeAclPatched = false;
    this.savedSearchExportPatched = false;
  }

  getUpstreamHits(): UpstreamHitLog[] {
    return [...this.upstreamHits];
  }

  clearUpstreamHits(): void {
    this.upstreamHits = [];
  }

  private resolvePrincipal(authHeader: string | undefined, urlObj?: URL): TestbedPrincipal | null {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      return PRINCIPALS_BY_TOKEN.get(token) ?? null;
    }
    const queryToken = urlObj?.searchParams.get('token');
    if (queryToken) {
      return PRINCIPALS_BY_TOKEN.get(queryToken) ?? null;
    }
    return null;
  }

  private canReadDocument(
    principal: TestbedPrincipal | null,
    workspaceId: string,
    doc: SyntheticDocument,
  ): boolean {
    if (doc.public) return true;
    if (!principal) return false;
    return principal.workspaceId === workspaceId && doc.workspaceId === workspaceId;
  }

  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  private readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(text) as Record<string, unknown>;
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  async start(port = 0): Promise<{ port: number; baseUrl: string; wsUrl: string }> {
    if (this.server) {
      return { port: this.boundPort, baseUrl: this.baseUrl, wsUrl: this.wsUrl };
    }

    const wss = new WebSocketServer({ noServer: true });
    this.wss = wss;

    const server = http.createServer(async (req, res) => {
      const method = req.method ?? 'GET';
      const urlObj = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = urlObj.pathname;
      const principal = this.resolvePrincipal(req.headers.authorization, urlObj);

      this.upstreamHits.push({
        method,
        path: pathname,
        actor: principal?.userId ?? 'anonymous',
        timestamp: new Date().toISOString(),
      });

      if (method === 'GET' && pathname === '/api/me') {
        if (!principal) {
          this.sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        this.sendJson(res, 200, {
          user: principal.userId,
          workspaceId: principal.workspaceId,
          role: principal.role,
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/workspaces/templates/documents/104') {
        const tpl = INITIAL_DOCUMENTS.find((d) => d.id === 'doc_tpl_104')!;
        this.sendJson(res, 200, {
          id: tpl.id,
          public: true,
          title: tpl.title,
          body: tpl.body,
        });
        return;
      }

      const docMatch = /^\/api\/documents\/([^/]+)$/.exec(pathname);
      if (docMatch && method === 'GET') {
        if (!principal) {
          this.sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const docId = decodeURIComponent(docMatch[1]!);
        const doc = INITIAL_DOCUMENTS.find((d) => d.id === docId);
        if (!doc) {
          this.sendJson(res, 404, { error: 'Document not found' });
          return;
        }
        if (!doc.public && doc.workspaceId !== principal.workspaceId) {
          this.sendJson(res, 403, { error: 'Forbidden: cross-workspace document access denied' });
          return;
        }
        this.sendJson(res, 200, {
          id: doc.id,
          workspaceId: doc.workspaceId,
          title: doc.title,
          body: doc.body,
        });
        return;
      }

      const searchMatch = /^\/api\/workspaces\/([^/]+)\/search$/.exec(pathname);
      if (searchMatch && method === 'POST') {
        if (!principal) {
          this.sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const workspaceId = decodeURIComponent(searchMatch[1]!);
        if (principal.workspaceId !== workspaceId) {
          this.sendJson(res, 403, { error: 'Forbidden workspace' });
          return;
        }
        const body = await this.readJsonBody(req);
        const titleContains = typeof body.titleContains === 'string' ? body.titleContains : '';
        // Interactive search strictly binds workspaceId and caller read permission
        const results = INITIAL_DOCUMENTS.filter(
          (doc) =>
            doc.workspaceId === workspaceId &&
            this.canReadDocument(principal, workspaceId, doc) &&
            doc.title.toLowerCase().includes(titleContains.toLowerCase()),
        ).map((doc) => ({ id: doc.id, title: doc.title }));

        this.sendJson(res, 200, { workspaceId, results });
        return;
      }

      const savedSearchMatch = /^\/api\/workspaces\/([^/]+)\/saved-searches$/.exec(pathname);
      if (savedSearchMatch && method === 'POST') {
        if (!principal) {
          this.sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const workspaceId = decodeURIComponent(savedSearchMatch[1]!);
        if (principal.workspaceId !== workspaceId) {
          this.sendJson(res, 403, { error: 'Forbidden workspace' });
          return;
        }
        const body = await this.readJsonBody(req);
        const titleContains = typeof body.titleContains === 'string' ? body.titleContains : '';
        const id = `ss_${crypto.randomUUID().slice(0, 8)}`;
        this.savedSearches.set(id, {
          id,
          ownerId: principal.userId,
          workspaceId,
          titleContains,
        });
        this.sendJson(res, 201, { savedSearchId: id, workspaceId, titleContains });
        return;
      }

      const exportMatch = /^\/api\/workspaces\/([^/]+)\/exports$/.exec(pathname);
      if (exportMatch && method === 'POST') {
        if (!principal) {
          this.sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const workspaceId = decodeURIComponent(exportMatch[1]!);
        if (principal.workspaceId !== workspaceId) {
          this.sendJson(res, 403, { error: 'Forbidden workspace' });
          return;
        }
        const body = await this.readJsonBody(req);
        const savedSearchId = typeof body.savedSearchId === 'string' ? body.savedSearchId : '';
        const saved = this.savedSearches.get(savedSearchId);
        if (!saved || saved.workspaceId !== workspaceId) {
          this.sendJson(res, 404, { error: 'Saved search not found' });
          return;
        }

        const matchedDocs = INITIAL_DOCUMENTS.filter((doc) => {
          if (doc.public) return false;
          const matchesFilter = doc.title.toLowerCase().includes(saved.titleContains.toLowerCase());
          if (!matchesFilter) return false;
          if (this.savedSearchExportPatched) {
            return (
              doc.workspaceId === workspaceId &&
              this.canReadDocument(principal, workspaceId, doc)
            );
          }
          // Unpatched F-002 defect: background export omits workspace scoping & per-doc read ACL check
          return true;
        });

        const archiveEntries = matchedDocs.map((doc) => ({
          docId: doc.id,
          name: `${doc.id}.md`,
          sha256: crypto.createHash('sha256').update(doc.body).digest('hex'),
          text: doc.body,
        }));

        this.sendJson(res, 200, {
          jobId: `exp_${crypto.randomUUID().slice(0, 6)}`,
          status: 'completed',
          workspaceId,
          archiveEntries,
        });
        return;
      }

      const retentionMatch = /^\/api\/workspaces\/([^/]+)\/retention-preview$/.exec(pathname);
      if (retentionMatch && method === 'POST') {
        if (!principal) {
          this.sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const workspaceId = decodeURIComponent(retentionMatch[1]!);
        if (principal.workspaceId !== workspaceId) {
          this.sendJson(res, 403, { error: 'Forbidden workspace' });
          return;
        }
        this.sendJson(res, 200, { previewOnly: true, workspaceId, affectedDocuments: 1 });
        return;
      }

      this.sendJson(res, 404, { error: `Route ${method} ${pathname} not found` });
    });

    server.on('upgrade', (req, socket, head) => {
      const urlObj = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = urlObj.pathname;
      const principal = this.resolvePrincipal(req.headers.authorization, urlObj);

      this.upstreamHits.push({
        method: 'WS',
        path: pathname,
        actor: principal?.userId ?? 'anonymous',
        timestamp: new Date().toISOString(),
      });

      if (pathname !== '/ws/documents' && pathname !== '/ws/admin') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        this.openSockets.add(ws);
        ws.on('close', () => this.openSockets.delete(ws));

        ws.on('message', (raw) => {
          try {
            const payload = JSON.parse(raw.toString()) as { type?: string; docId?: string };
            if (payload.type === 'subscribe' && typeof payload.docId === 'string') {
              const doc = INITIAL_DOCUMENTS.find((d) => d.id === payload.docId);
              if (!doc) {
                ws.send(JSON.stringify({ type: 'error', code: 'NOT_FOUND' }));
                return;
              }
              if (doc.public) {
                ws.send(
                  JSON.stringify({
                    type: 'doc.snapshot',
                    docId: doc.id,
                    title: doc.title,
                    public: true,
                  }),
                );
                return;
              }
              if (this.wsSubscribeAclPatched) {
                if (!principal || principal.workspaceId !== doc.workspaceId) {
                  ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', docId: doc.id }));
                  return;
                }
              }
              ws.send(
                JSON.stringify({
                  type: 'doc.snapshot',
                  docId: doc.id,
                  title: doc.title,
                  marker: doc.wsMarker ?? WS_CHANNEL_CANARY,
                }),
              );
              return;
            }
            ws.send(JSON.stringify({ type: 'ack', ok: true }));
          } catch {
            ws.send(JSON.stringify({ type: 'error', code: 'BAD_PAYLOAD' }));
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
      throw new Error('Failed to bind ephemeral TCP port for NorthstarDocsTestbedServer');
    }
    this.boundPort = addr.port;
    this.server = server;

    return { port: this.boundPort, baseUrl: this.baseUrl, wsUrl: this.wsUrl };
  }

  async stop(): Promise<void> {
    for (const ws of this.openSockets) {
      try {
        ws.terminate();
      } catch {
        // ignore termination errors
      }
    }
    this.openSockets.clear();

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
