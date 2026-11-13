import {
  type EvidenceBundle,
  type FindingRecord,
  type FixProposal,
  type HitlApprovalRequest,
  type ModelDescriptor,
  type OverviewSummary,
  type RedTeamCampaignRun,
  type RepositoryRecord,
  type ScanJobRecord,
} from '@nightfall/core-contracts';

export const AVAILABLE_MODELS: ModelDescriptor[] = [
  {
    id: 'gpt-6-cyber-ultra',
    label: 'GPT-6 Cyber Ultra',
    provider: 'openai',
    tier: 'frontier-cyber',
  },
  {
    id: 'claude-4-6-sonnet-sec',
    label: 'Claude Sonnet Security',
    provider: 'anthropic',
    tier: 'frontier-cyber',
  },
  {
    id: 'gemini-3-pro-sec',
    label: 'Gemini 3 Pro Security',
    provider: 'google',
    tier: 'frontier-cyber',
  },
  {
    id: 'nightfall-local-verifier',
    label: 'Nightfall Deterministic Sim',
    provider: 'nightfall-sim',
    tier: 'fast-triage',
  },
];

export const NORTHSTAR_CAMPAIGN_YAML = `objective: Check document and workspace access.

campaign:
  name: northstar-docs-staging
  targets: [https://staging.northstardocs.com]
  source: { archive: northstar-docs-source.tar.gz }
  max_duration: 8h
  max_requests_per_second: 10

credentials:
  alice: { file: credentials/alice.token }
  bob:   { file: credentials/bob.token }

http:
  allow:
    - { methods: [GET, POST], path_prefixes: [/] }

websocket:
  allow:
    - { paths: [/ws/documents], origins: ["*"],
        operations: [open, send] }
`;

export const INITIAL_OVERVIEW: OverviewSummary = {
  proposedFixesCount: 6,
  openFindingsCount: 550,
  fixedFindingsCount: 147,
  severityCounts: {
    critical: 31,
    high: 216,
    medium: 193,
    low: 104,
    informational: 6,
  },
  statusCounts: {
    new: 182,
    triaged: 302,
    in_progress: 66,
    fixed: 147,
  },
  sankeyLinks: [
    { source: 'Findings', target: 'Critical', value: 31 },
    { source: 'Findings', target: 'High', value: 216 },
    { source: 'Findings', target: 'Medium', value: 193 },
    { source: 'Findings', target: 'Low', value: 104 },
    { source: 'Findings', target: 'Informational', value: 6 },
    { source: 'Critical', target: 'In Progress', value: 13 },
    { source: 'Critical', target: 'Triaged', value: 13 },
    { source: 'Critical', target: 'New', value: 5 },
    { source: 'High', target: 'In Progress', value: 33 },
    { source: 'High', target: 'Triaged', value: 128 },
    { source: 'High', target: 'New', value: 55 },
    { source: 'Medium', target: 'In Progress', value: 15 },
    { source: 'Medium', target: 'Triaged', value: 110 },
    { source: 'Medium', target: 'New', value: 68 },
    { source: 'Low', target: 'In Progress', value: 5 },
    { source: 'Low', target: 'Triaged', value: 47 },
    { source: 'Low', target: 'New', value: 52 },
    { source: 'Informational', target: 'Triaged', value: 4 },
    { source: 'Informational', target: 'New', value: 2 },
  ],
  dailyTrend: [
    { date: 'Nov 6', currentlyFixed: 118, newFindings: 164 },
    { date: 'Nov 7', currentlyFixed: 118, newFindings: 156 },
    { date: 'Nov 8', currentlyFixed: 112, newFindings: 134 },
    { date: 'Nov 9', currentlyFixed: 126, newFindings: 154 },
    { date: 'Nov 10', currentlyFixed: 121, newFindings: 155 },
    { date: 'Nov 11', currentlyFixed: 122, newFindings: 165 },
    { date: 'Nov 12', currentlyFixed: 147, newFindings: 131 },
  ],
};

export const INITIAL_FINDINGS: FindingRecord[] = [
  {
    id: 'SEC-1034',
    title: 'Missing authorization — Asset export',
    subtitle: 'asset-servicing · SEC-1034 · Critical boundary; needs evidence',
    repository: 'asset-servicing',
    observedRevision: 'a123634',
    severity: 'critical',
    status: 'in_progress',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-862 · Missing authorization',
    owner: { name: 'Leo', initials: 'L', team: 'Assets', avatarColor: '#dceeff' },
    sources: ['nightfall', 'red-team'],
    summary:
      "The export route returns a restricted asset without enforcing the caller's project membership.",
    rootCause:
      'The export function receives the caller and the requested resource, but returns the resource value without checking that the caller belongs to its project.',
    impactAndAttackPath:
      "A caller who can request an export for a resource outside their project could receive that resource's contents.",
    preconditions: [
      'The caller can reach the export operation and supply or select a resource.',
      'The requested resource belongs to a project the caller cannot access.',
      'An upstream authorization check does not block the request.',
    ],
    remediation:
      "Check the caller's project membership against the resource's project before returning export data, and add a cross-project regression test.",
    affectedEndpoint: 'POST /api/v2/assets/:assetId/export',
    codeReferences: [
      {
        file: 'src/routes/asset_export.ts',
        startLine: 41,
        endLine: 68,
        description: 'Export handler missing project membership guard',
      },
    ],
    rootCauseClusterKey: 'asset-servicing:missing-project-guard',
    fixId: 'FIX-1034',
    createdAt: '2026-11-11T16:10:00Z',
    updatedAt: '2026-11-12T19:45:00Z',
  },
  {
    id: 'SEC-50000',
    title: 'Maintenance jobs lack authentication — identity-platform',
    subtitle: 'identity-platform · SEC-50000 · Critical boundary; needs evidence',
    repository: 'identity-platform',
    observedRevision: '9f84c11',
    severity: 'critical',
    status: 'in_progress',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-306 · Missing authentication for critical function',
    owner: { name: 'Maya', initials: 'M', team: 'Identity', avatarColor: '#efe3ff' },
    sources: ['nightfall', 'red-team'],
    summary:
      'Internal maintenance trigger endpoints mounted on the public router omit service-to-service bearer verification.',
    rootCause:
      'Router registration attaches `/internal/maintenance/*` before the mTLS and service-token middleware group.',
    impactAndAttackPath:
      'Unauthenticated callers able to reach the API ingress can invoke cache eviction or token rotation jobs.',
    preconditions: [
      'Ingress forwards `/internal/maintenance` paths to the application container.',
      'Handler relies on router-level authentication rather than handler-level guards.',
    ],
    remediation:
      'Move maintenance routes behind the internal mTLS + signed service-token middleware and verify unauthenticated requests return 401.',
    affectedEndpoint: 'POST /internal/maintenance/reconcile',
    codeReferences: [
      { file: 'internal/http/router.go', startLine: 88, endLine: 112 },
    ],
    rootCauseClusterKey: 'identity-platform:unauthed-maintenance-router',
    createdAt: '2026-11-11T18:20:00Z',
    updatedAt: '2026-11-12T18:05:00Z',
  },
  {
    id: 'SEC-1116',
    title: 'Unrestricted outbound callback — document-processing',
    subtitle: 'document-processing · SEC-1116 · Critical boundary; needs evidence',
    repository: 'document-processing',
    observedRevision: '4be92d0',
    severity: 'critical',
    status: 'in_progress',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-918 · Server-side request forgery (SSRF)',
    owner: { name: 'Amara Okafor', initials: 'A', team: 'Experience', avatarColor: '#dff3ff' },
    sources: ['nightfall', 'red-team'],
    summary:
      'Webhook delivery worker fetches user-supplied `webhookUrl` destinations without validating host allowlists or blocking private network ranges.',
    rootCause:
      'The async callback dispatcher passes the raw URL directly to the HTTP client without egress CIDR filtering.',
    impactAndAttackPath:
      'A workspace member configuring export notifications can cause the worker to issue requests to internal staging services.',
    preconditions: [
      'Caller has permission to register a document webhook URL.',
      'Worker container can resolve internal cluster hostnames.',
    ],
    remediation:
      'Validate callback URLs against HTTPS scheme and public non-RFC1918/link-local IP resolution inside a custom DNS dialer.',
    affectedEndpoint: 'POST /api/webhooks/test-delivery',
    codeReferences: [
      { file: 'workers/webhook_dispatcher.py', startLine: 52, endLine: 79 },
    ],
    rootCauseClusterKey: 'document-processing:unvalidated-callback-url',
    createdAt: '2026-11-10T14:00:00Z',
    updatedAt: '2026-11-12T17:30:00Z',
  },
  {
    id: 'SEC-1042',
    title: 'Untrusted callback destination — Identity API',
    subtitle: 'identity-platform · SEC-1042 · Generating fix',
    repository: 'identity-platform',
    observedRevision: '71bc90e',
    severity: 'critical',
    status: 'in_progress',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-601 · Open redirect / untrusted OAuth callback',
    owner: { name: 'Maya', initials: 'M', team: 'Identity', avatarColor: '#efe3ff' },
    sources: ['nightfall', 'sast'],
    summary:
      'OIDC post-login `redirect_uri` validation uses prefix matching instead of strict origin and path parsing.',
    rootCause:
      'String `startsWith` comparison allows attacker-controlled lookalike subdomains sharing the registered prefix.',
    impactAndAttackPath:
      'Authorization codes could be redirected to an external origin if a user follows a crafted sign-in link.',
    preconditions: ['Client registration uses origin-only prefix configuration.'],
    remediation: 'Parse URLs with `new URL()` and compare exact scheme, host, port, and registered path.',
    affectedEndpoint: 'GET /oauth/authorize',
    codeReferences: [{ file: 'src/oauth/redirect_validator.ts', startLine: 19, endLine: 37 }],
    rootCauseClusterKey: 'identity-platform:redirect-prefix-match',
    fixId: 'FIX-1042',
    createdAt: '2026-11-12T08:12:00Z',
    updatedAt: '2026-11-12T20:01:00Z',
  },
  {
    id: 'F-001',
    title: 'A signed-out visitor can read a private document over WebSocket',
    subtitle: 'northstar-docs · F-001 · Confirmed in northstar-docs-staging',
    repository: 'northstar-docs',
    observedRevision: 'e81a442',
    severity: 'high',
    status: 'triaged',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-285 · Improper authorization on WebSocket channel',
    owner: { name: 'Leo', initials: 'L', team: 'Experience', avatarColor: '#dceeff' },
    sources: ['red-team'],
    summary:
      'A public template room subscription handler upgrades `/ws/documents` frames without re-checking workspace membership when switching document channels.',
    rootCause:
      'Initial WebSocket handshake permits anonymous template viewers, and subsequent `subscribe` frames reuse the open socket without checking workspace ACLs.',
    impactAndAttackPath:
      'An unauthenticated visitor who knows or enumerates a document ID receives initial document state frames over `/ws/documents`.',
    preconditions: ['WebSocket endpoint `/ws/documents` is reachable.', 'Target document ID is supplied in subscribe message.'],
    remediation:
      'Enforce per-document ACL verification inside every WebSocket `subscribe` message handler before joining room broadcast state.',
    affectedEndpoint: 'GET /ws/documents',
    campaignId: 'camp-northstar-staging',
    evidenceBundleId: 'EV-F001',
    fixId: 'FIX-F001',
    codeReferences: [{ file: 'realtime/ws_documents.py', startLine: 44, endLine: 73 }],
    rootCauseClusterKey: 'northstar-docs:ws-subscribe-acl',
    createdAt: '2026-11-12T02:12:00Z',
    updatedAt: '2026-11-12T03:00:00Z',
  },
  {
    id: 'F-002',
    title: "Stored SQL injection exports another workspace's private documents",
    subtitle: 'F-002 · Northstar Docs staging · Confirmed reproduction',
    repository: 'northstar-docs',
    observedRevision: 'e81a442',
    severity: 'high',
    status: 'in_progress',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-89 / CWE-863 · Unbound export filter & missing per-row ACL check',
    owner: { name: 'Leo', initials: 'L', team: 'Experience', avatarColor: '#dceeff' },
    sources: ['red-team'],
    summary:
      'Bob created a saved search in Workspace B and exported its results. The background job kept the correct workspace UUID, but an unparameterized saved title filter changed which document IDs were selected. Its ZIP archive contained a synthetic private canary document from Workspace A (`NS-7b64c9e2`) that Bob could not open directly. The same filter returned no results through ordinary interactive search.',
    rootCause:
      'Interactive search binds the saved `title_contains` filter as a SQL parameter and enforces caller document-read permissions, whereas the async ZIP export worker interpolates `title_contains` directly and writes archive entries without checking requester read permissions.',
    impactAndAttackPath:
      'An authenticated user in Workspace B can export documents belonging to Workspace A via the saved-search background export worker.',
    preconditions: [
      'Caller has a valid standard account in any workspace (e.g., Bob in Workspace B).',
      'Saved search export endpoint `/api/workspaces/:id/exports` is reachable.',
    ],
    remediation:
      "Bind the saved title filter as a SQL parameter in `search_exports.py` and enforce the requesting user's document-read permission in the job's workspace before writing each archive entry.",
    affectedEndpoint: '/api/workspaces/90b2e16a-70d2-4c1d-b8e5-5f34609f8a2c/exports',
    architectureNotes:
      "Saved searches belong to a workspace and a user. The application stores the title filter as data. Interactive search binds that filter and applies the caller's document-read permissions (`search_exports.py:30-56`). An export request names an existing saved search. The server checks ownership and queues a job with the requester and workspace UUID. A shared background worker selects document IDs and builds the downloadable ZIP (`search_exports.py:59-86`).",
    defectsNotes:
      '1) `search_exports.py:76` concatenates `title_contains` into the `LIKE` clause instead of binding `?`. 2) `search_exports.py:82` writes each matched `document_id` into the ZIP archive without calling `can_read_document(requester, workspace_id, document_id)`.',
    verificationChainSummary:
      'Verified safely in staging using isolated test tenants Alice (Workspace A, seeded canary `NS-7b64c9e2`) and Bob (Workspace B). Control interactive search returned 0 cross-tenant rows; background export job returned 1 archive entry matching Alice’s canary checksum.',
    campaignId: 'camp-northstar-staging',
    evidenceBundleId: 'EV-F002',
    fixId: 'FIX-F002',
    codeReferences: [
      {
        file: 'search_exports.py',
        startLine: 30,
        endLine: 56,
        description: 'Interactive search (properly parameterized & ACL-checked)',
      },
      {
        file: 'search_exports.py',
        startLine: 59,
        endLine: 86,
        description: 'Background ZIP export worker (unparameterized filter & missing ACL check)',
      },
    ],
    rootCauseClusterKey: 'northstar-docs:saved-search-export-query',
    createdAt: '2026-11-12T02:24:00Z',
    updatedAt: '2026-11-12T03:00:00Z',
  },
  {
    id: 'F-003',
    title: 'Search suggestions disclose restricted document titles',
    subtitle: 'northstar-docs · F-003 · Confirmed in northstar-docs-staging',
    repository: 'northstar-docs',
    observedRevision: 'e81a442',
    severity: 'medium',
    status: 'triaged',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-200 · Exposure of sensitive metadata',
    owner: { name: 'Amara Okafor', initials: 'A', team: 'Experience', avatarColor: '#dff3ff' },
    sources: ['red-team'],
    summary:
      'Autocomplete prefix cache keys omit per-member folder ACL masks inside shared workspaces.',
    rootCause: 'Prefix trie cache is keyed only by `workspace_id` instead of `(workspace_id, role_scope)`.',
    impactAndAttackPath: 'Restricted folder document titles appear in typeahead suggestions for limited workspace guests.',
    preconditions: ['Caller is a guest in the target workspace.'],
    remediation: 'Filter cached prefix candidates through `filter_readable_ids(caller, doc_ids)` before serialization.',
    affectedEndpoint: 'GET /api/workspaces/:id/suggestions',
    campaignId: 'camp-northstar-staging',
    codeReferences: [{ file: 'search/suggestions.py', startLine: 22, endLine: 49 }],
    rootCauseClusterKey: 'northstar-docs:suggestions-cache-acl',
    createdAt: '2026-11-12T02:31:00Z',
    updatedAt: '2026-11-12T03:00:00Z',
  },
  {
    id: 'F-004',
    title: 'Commenters can accept their own suggested edits',
    subtitle: 'northstar-docs · F-004 · Confirmed in northstar-docs-staging',
    repository: 'northstar-docs',
    observedRevision: 'e81a442',
    severity: 'medium',
    status: 'triaged',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-285 · Improper role check on suggestion merge',
    owner: { name: 'Leo', initials: 'L', team: 'Experience', avatarColor: '#dceeff' },
    sources: ['red-team'],
    summary: 'Suggestion acceptance endpoint checks `can_comment` rather than `can_edit` role permission.',
    rootCause: 'Shared decorator `@require_doc_access("comment")` used on both create-suggestion and accept-suggestion.',
    impactAndAttackPath: 'Users with comment-only access can commit edits directly to canonical document text.',
    preconditions: ['Caller holds `commenter` role on a document.'],
    remediation: 'Require `@require_doc_access("edit")` on suggestion acceptance.',
    affectedEndpoint: 'POST /api/documents/:id/suggestions/:sid/accept',
    campaignId: 'camp-northstar-staging',
    codeReferences: [{ file: 'docs/suggestions_api.py', startLine: 61, endLine: 75 }],
    rootCauseClusterKey: 'northstar-docs:suggestion-accept-role',
    createdAt: '2026-11-12T02:39:00Z',
    updatedAt: '2026-11-12T03:00:00Z',
  },
  {
    id: 'F-005',
    title: 'Document exports include comments hidden from link viewers',
    subtitle: 'northstar-docs · F-005 · Confirmed in northstar-docs-staging',
    repository: 'northstar-docs',
    observedRevision: 'e81a442',
    severity: 'medium',
    status: 'new',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-212 · Improper removal of sensitive information before export',
    owner: { name: 'Amara Okafor', initials: 'A', team: 'Experience', avatarColor: '#dff3ff' },
    sources: ['red-team'],
    summary: 'Markdown export serializer includes internal review comment threads for read-only share-link tokens.',
    rootCause: 'Serializer defaults `include_comments=True` without checking share-link capability flags.',
    impactAndAttackPath: 'External share-link recipients can view internal reviewer discussions in exported Markdown.',
    preconditions: ['Share-link viewer invokes Markdown download.'],
    remediation: 'Gate `include_comments` on `caller.has_permission("read_comments", doc_id)`.',
    affectedEndpoint: 'GET /api/share/:token/export.md',
    campaignId: 'camp-northstar-staging',
    codeReferences: [{ file: 'docs/markdown_export.py', startLine: 14, endLine: 39 }],
    rootCauseClusterKey: 'northstar-docs:share-export-comments',
    createdAt: '2026-11-12T02:47:00Z',
    updatedAt: '2026-11-12T03:00:00Z',
  },
  {
    id: 'F-006',
    title: 'Workspace lookup confirms private workspace slugs',
    subtitle: 'northstar-docs · F-006 · Confirmed in northstar-docs-staging',
    repository: 'northstar-docs',
    observedRevision: 'e81a442',
    severity: 'low',
    status: 'new',
    fixVerification: 'not_recorded',
    weaknessCwe: 'CWE-204 · Observable response discrepancy',
    owner: { name: 'Maya', initials: 'M', team: 'Identity', avatarColor: '#efe3ff' },
    sources: ['red-team'],
    summary: 'Workspace slug resolver returns `403` for existing private slugs and `404` for non-existent slugs.',
    rootCause: 'Existence check runs and returns early before authorization check normalizes error responses.',
    impactAndAttackPath: 'Unauthenticated callers can enumerate private customer workspace slugs.',
    preconditions: ['Caller queries `/api/workspaces/by-slug/:slug`.'],
    remediation: 'Return uniform `404 Not Found` for unauthorized private workspaces.',
    affectedEndpoint: 'GET /api/workspaces/by-slug/:slug',
    campaignId: 'camp-northstar-staging',
    codeReferences: [{ file: 'workspaces/views.py', startLine: 18, endLine: 33 }],
    rootCauseClusterKey: 'northstar-docs:slug-enumeration',
    createdAt: '2026-11-12T02:55:00Z',
    updatedAt: '2026-11-12T03:00:00Z',
  },
];

export const INITIAL_EVIDENCE_BUNDLES: EvidenceBundle[] = [
  {
    id: 'EV-F002',
    findingId: 'F-002',
    campaignId: 'camp-northstar-staging',
    verifiedAt: '2026-11-12T02:24:18Z',
    reproducible: true,
    canaryMarker: 'NS-7b64c9e2',
    summary:
      'Clean-room replay confirmed cross-workspace read differential between interactive search (0 rows) and async ZIP export (returned Workspace A synthetic canary document NS-7b64c9e2 to Workspace B test account Bob).',
    httpTraces: [
      {
        method: 'POST',
        url: 'https://staging.northstardocs.com/api/workspaces/90b2e16a-70d2-4c1d-b8e5-5f34609f8a2c/exports',
        actor: 'bob (Workspace B synthetic account)',
        requestHeaders: {
          Authorization: 'Bearer <redacted-bob-staging-token>',
          'Content-Type': 'application/json',
        },
        requestBody: JSON.stringify({ savedSearchId: 'ss_canary_check_02', format: 'zip' }),
        statusCode: 202,
        responseSnippet: '{"jobId":"exp_88412","status":"queued","workspaceId":"90b2e16a-70d2-4c1d-b8e5-5f34609f8a2c"}',
      },
    ],
    codePath: [
      {
        file: 'search_exports.py',
        startLine: 74,
        endLine: 86,
        snippet:
          'rows = db.execute("SELECT id FROM documents WHERE workspace_id = ? " f"AND title LIKE \'%{title_contains}%\' ORDER BY id", (workspace_id,)).fetchall()',
      },
    ],
    controlAssertion: 'Interactive search `/api/workspaces/:id/search` with identical saved filter returned 0 documents outside Workspace B.',
    probeAssertion: 'Archive manifest contained `doc_private_ws_a.md` carrying staging verification marker `NS-7b64c9e2`.',
    artifactJson: {
      archiveEntries: [
        {
          name: 'release-checklist-ws-a.md',
          sha256: 'cbf419b3ced817f1fe065e02421e0460275d9da8a93ecd926b7a786273fb3b00',
          text: '# Private document\n\nDraft v2: circulate the release checklist to reviewers only.\nVerification marker: NS-7b64c9e2.\n',
        },
      ],
    },
    minimalPatchDiff: {
      filePath: 'search_exports.py',
      explanation:
        "Bind the saved title filter in the export query. Before writing each archive entry, enforce the requesting user's document-read permission in the job's workspace.",
      unifiedDiff: `--- a/search_exports.py
+++ b/search_exports.py
@@ -74,11 +74,14 @@
     return
   requester, workspace_id, title_contains = job
   rows = db.execute("SELECT id FROM documents WHERE workspace_id = ? "
-                    f"AND title LIKE '%{title_contains}%' ORDER BY id", (workspace_id,)).fetchall()
+                    "AND title LIKE ? ORDER BY id", (workspace_id, "%" + title_contains + "%")).fetchall()
   output = BytesIO()
   with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
     for document_id, in rows:
+      if not can_read_document(db, requester, workspace_id, document_id):
+        continue
       title, text = db.execute("SELECT title, body FROM documents WHERE id = ?", (document_id,)).fetchone()`,
    },
  },
  {
    id: 'EV-F001',
    findingId: 'F-001',
    campaignId: 'camp-northstar-staging',
    verifiedAt: '2026-11-12T02:12:09Z',
    reproducible: true,
    canaryMarker: 'NS-ws-4410a',
    summary:
      'Unauthenticated WebSocket session opened on public template channel received private workspace document snapshot when switching channel subscription.',
    httpTraces: [
      {
        method: 'GET',
        url: 'wss://staging.northstardocs.com/ws/documents',
        actor: 'anonymous visitor',
        requestHeaders: { Upgrade: 'websocket', Origin: 'https://staging.northstardocs.com' },
        statusCode: 101,
        responseSnippet: '{"type":"doc.snapshot","docId":"doc_ws_a_101","marker":"NS-ws-4410a"}',
      },
    ],
    codePath: [
      {
        file: 'realtime/ws_documents.py',
        startLine: 51,
        endLine: 68,
        snippet: 'async def on_subscribe(ws, payload): await join_doc_channel(ws, payload["doc_id"])',
      },
    ],
    controlAssertion: 'REST GET `/api/documents/doc_ws_a_101` without auth correctly returned `401 Unauthorized`.',
    probeAssertion: 'WebSocket `subscribe` frame returned `doc.snapshot` for `doc_ws_a_101` without session token.',
  },
];

export const INITIAL_FIXES: FixProposal[] = [
  {
    id: 'FIX-001',
    title: 'Bind plugin hook trust to bundle contents',
    subtitle: 'Plugin upgrades run trusted hooks without re-review',
    repository: 'nightfall/agent-runtime',
    snapshotLabel: 'Nightfall · Cloud snapshot',
    findingIds: ['SEC-0911'],
    severity: 'high',
    status: 'proposed',
    changedFilesCount: 2,
    explanation:
      'Computes SHA-256 content digest over plugin manifest + hook scripts at approval time and invalidates trust cache whenever bundle digest changes on upgrade.',
    unifiedDiff: `--- a/src/plugins/trust_store.ts
+++ b/src/plugins/trust_store.ts
@@ -28,7 +28,9 @@ export function isHookTrusted(pluginId: string, bundleDigest: string): boolean {
   const record = trustStore.get(pluginId);
-  return Boolean(record?.approved);
+  if (!record?.approved) return false;
+  return crypto.timingSafeEqual(Buffer.from(record.bundleSha256), Buffer.from(bundleDigest));
 }`,
    securityTestDiff: `+++ b/src/plugins/trust_store.test.ts
@@ -0,0 +1,12 @@
+it('revokes hook trust when plugin bundle digest changes on upgrade', () => {
+  approvePluginHook('linter-pro', 'sha256-v1');
+  expect(isHookTrusted('linter-pro', 'sha256-v2')).toBe(false);
+});`,
    gates: {
      baselineBuildPassed: true,
      redPhaseFailedAsExpected: true,
      greenPhasePassed: true,
      regressionSuitePassed: true,
      staticHygienePassed: true,
      criticApproved: true,
      criticNotes: 'Minimal 4-line digest binding with constant-time comparison and unit test.',
    },
    conversation: [
      {
        id: 'm1',
        role: 'nightfall',
        text: 'Prepared minimal patch binding plugin hook approval records to the SHA-256 digest of the bundle contents.',
        createdAt: '2026-11-12T18:10:00Z',
      },
    ],
    prNumber: 412,
    prUrl: 'https://github.com/maceip/Nightfall/pull/412',
    createdAt: '2026-11-12T18:10:00Z',
    updatedAt: '2026-11-12T18:14:00Z',
  },
  {
    id: 'FIX-002',
    title: 'Block project-local Guardian v2 configuration',
    subtitle: 'Project config can poison Guardian v2 auto-approval',
    repository: 'nightfall/agent-runtime',
    snapshotLabel: 'Nightfall · Cloud snapshot',
    findingIds: ['SEC-0918'],
    severity: 'medium',
    status: 'proposed',
    changedFilesCount: 2,
    explanation:
      'Ignores untrusted repository-local `.nightfall/guardian.toml` auto-approval overrides and loads policy ceilings strictly from user/system root trust stores.',
    unifiedDiff: `--- a/src/policy/config_loader.ts
+++ b/src/policy/config_loader.ts
@@ -44,6 +44,7 @@ export function loadGuardianPolicy(workspaceDir: string): PolicyConfig {
   const systemPolicy = readSystemPolicy();
-  const repoOverride = readRepoPolicy(workspaceDir);
-  return mergePolicies(systemPolicy, repoOverride);
+  const repoPolicy = readRepoPolicy(workspaceDir);
+  return restrictPolicyOnly(systemPolicy, repoPolicy);
 }`,
    securityTestDiff: `+++ b/src/policy/config_loader.test.ts
@@ -0,0 +1,9 @@
+it('prevents repo-local config from widening auto-approval policy', () => {
+  const policy = loadGuardianPolicy('/tmp/untrusted-repo');
+  expect(policy.allowStateMutatingWithoutApproval).toBe(false);
+});`,
    gates: {
      baselineBuildPassed: true,
      redPhaseFailedAsExpected: true,
      greenPhasePassed: true,
      regressionSuitePassed: true,
      staticHygienePassed: true,
      criticApproved: true,
      criticNotes: 'Repo-local configuration can now only tighten, never relax, system policy.',
    },
    conversation: [],
    prNumber: 413,
    prUrl: 'https://github.com/maceip/Nightfall/pull/413',
    createdAt: '2026-11-12T18:25:00Z',
    updatedAt: '2026-11-12T18:30:00Z',
  },
  {
    id: 'FIX-003',
    title: 'Secure photobooth generation endpoint',
    subtitle: 'Unauthenticated image-generation proxy enables quota abuse',
    repository: 'northstar/media-proxy',
    snapshotLabel: 'Nightfall · Cloud snapshot',
    findingIds: ['SEC-0944'],
    severity: 'high',
    status: 'proposed',
    changedFilesCount: 3,
    explanation:
      'Attaches signed session verification and per-user token-bucket rate limiting middleware to `/api/generate` before upstream model dispatch.',
    unifiedDiff: `--- a/src/server/routes.ts
+++ b/src/server/routes.ts
@@ -15,5 +15,5 @@
-app.post('/api/generate', handleGenerateImage);
+app.post('/api/generate', requireSessionAuth, enforceUserQuota({ rpm: 6 }), handleGenerateImage);`,
    securityTestDiff: `+++ b/src/server/routes.test.ts
@@ -0,0 +1,8 @@
+it('rejects unauthenticated generation requests with 401', async () => {
+  const res = await request(app).post('/api/generate').send({ prompt: 'test' });
+  expect(res.status).toBe(401);
+});`,
    gates: {
      baselineBuildPassed: true,
      redPhaseFailedAsExpected: true,
      greenPhasePassed: true,
      regressionSuitePassed: true,
      staticHygienePassed: true,
      criticApproved: true,
      criticNotes: 'Uses existing `requireSessionAuth` and `enforceUserQuota` middlewares idiomatically.',
    },
    conversation: [],
    createdAt: '2026-11-12T18:40:00Z',
    updatedAt: '2026-11-12T18:45:00Z',
  },
  {
    id: 'FIX-1042',
    title: 'Fix Untrusted callback destination — Identity API',
    subtitle: 'SEC-1042 · Generating fix',
    repository: 'identity-platform',
    snapshotLabel: 'Nightfall · Cloud snapshot',
    findingIds: ['SEC-1042'],
    severity: 'critical',
    status: 'in_progress',
    changedFilesCount: 2,
    explanation:
      'Replaces string prefix check on `redirect_uri` with canonical `URL` origin and exact pathname allowlist matching.',
    unifiedDiff: `--- a/src/oauth/redirect_validator.ts
+++ b/src/oauth/redirect_validator.ts
@@ -21,4 +21,8 @@ export function isAllowedRedirect(candidate: string, allowedUris: string[]): boo
-  return allowedUris.some((prefix) => candidate.startsWith(prefix));
+  const parsed = new URL(candidate);
+  return allowedUris.some((raw) => {
+    const allow = new URL(raw);
+    return parsed.origin === allow.origin && parsed.pathname === allow.pathname;
+  });
 }`,
    securityTestDiff: `+++ b/src/oauth/redirect_validator.test.ts
@@ -0,0 +1,7 @@
+it('blocks lookalike subdomain bypasses on redirect_uri', () => {
+  expect(isAllowedRedirect('https://app.example.com.evil.test/cb', ['https://app.example.com/cb'])).toBe(false);
+});`,
    gates: {
      baselineBuildPassed: true,
      redPhaseFailedAsExpected: true,
      greenPhasePassed: true,
      regressionSuitePassed: false,
      staticHygienePassed: true,
      criticApproved: false,
      criticNotes: 'Running full OIDC integration suite inside hermetic sandbox...',
    },
    conversation: [],
    createdAt: '2026-11-12T20:01:00Z',
    updatedAt: '2026-11-12T20:15:00Z',
  },
  {
    id: 'FIX-1034',
    title: 'Fix Missing authorization — Asset export',
    subtitle: 'SEC-1034 · Ready for review',
    repository: 'asset-servicing',
    snapshotLabel: 'Nightfall · Cloud snapshot',
    findingIds: ['SEC-1034'],
    severity: 'critical',
    status: 'proposed',
    changedFilesCount: 2,
    explanation:
      "Enforces caller project membership against `asset.projectId` inside `exportAssetHandler` before streaming asset contents, returning `403 Forbidden` on cross-project access.",
    unifiedDiff: `--- a/src/routes/asset_export.ts
+++ b/src/routes/asset_export.ts
@@ -46,6 +46,10 @@ export async function exportAssetHandler(req: AuthenticatedRequest, res: Respons
   const asset = await assetRepo.findById(req.params.assetId);
   if (!asset) return res.status(404).json({ error: 'Not found' });
+  const isMember = await projectAcl.isMember(req.caller.userId, asset.projectId);
+  if (!isMember) {
+    return res.status(403).json({ error: 'Caller is not a member of asset project' });
+  }
   return res.status(200).send(await exporter.serialize(asset));
 }`,
    securityTestDiff: `+++ b/src/routes/asset_export.test.ts
@@ -0,0 +1,11 @@
+it('denies asset export when caller belongs to a different project (SEC-1034)', async () => {
+  const res = await callExport({ callerUserId: 'user_proj_b', assetId: 'asset_proj_a' });
+  expect(res.status).toBe(403);
+});`,
    gates: {
      baselineBuildPassed: true,
      redPhaseFailedAsExpected: true,
      greenPhasePassed: true,
      regressionSuitePassed: true,
      staticHygienePassed: true,
      criticApproved: true,
      criticNotes: 'Minimal 4-line authorization check using existing `projectAcl.isMember` service + negative & positive tests.',
    },
    conversation: [
      {
        id: 'c1',
        role: 'user',
        text: 'Help me fix SEC-1034 with a minimal authorization check and regression test.',
        createdAt: '2026-11-12T19:40:00Z',
      },
      {
        id: 'c2',
        role: 'nightfall',
        text: "Fix prepared. Enforced the caller's project membership in `src/routes/asset_export.ts` and verified with a cross-project regression test.",
        createdAt: '2026-11-12T19:44:00Z',
      },
    ],
    prNumber: 189,
    prUrl: 'https://github.com/maceip/Nightfall/pull/189',
    createdAt: '2026-11-12T19:40:00Z',
    updatedAt: '2026-11-12T19:45:00Z',
  },
  {
    id: 'FIX-F002',
    title: 'Bind saved title filter & enforce workspace read check on export',
    subtitle: 'F-002 · Promoted from Nightfall Red Team',
    repository: 'northstar-docs',
    snapshotLabel: 'Nightfall · Red Team handoff',
    findingIds: ['F-002'],
    severity: 'high',
    status: 'proposed',
    changedFilesCount: 2,
    explanation:
      "Parameterizes `title_contains` in `search_exports.py` and enforces `can_read_document(db, requester, workspace_id, document_id)` before adding entries to the export ZIP.",
    unifiedDiff: `--- a/search_exports.py
+++ b/search_exports.py
@@ -74,11 +74,14 @@
     return
   requester, workspace_id, title_contains = job
   rows = db.execute("SELECT id FROM documents WHERE workspace_id = ? "
-                    f"AND title LIKE '%{title_contains}%' ORDER BY id", (workspace_id,)).fetchall()
+                    "AND title LIKE ? ORDER BY id", (workspace_id, "%" + title_contains + "%")).fetchall()
   output = BytesIO()
   with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
     for document_id, in rows:
+      if not can_read_document(db, requester, workspace_id, document_id):
+        continue
       title, text = db.execute("SELECT title, body FROM documents WHERE id = ?", (document_id,)).fetchone()`,
    securityTestDiff: `+++ b/tests/test_search_exports.py
@@ -0,0 +1,10 @@
+def test_saved_search_export_enforces_parameterization_and_workspace_acl(db):
+    zip_bytes = run_export_job(db, requester="bob", workspace_id="ws_b", title_contains="checklist%' OR 1=1 --")
+    assert "NS-7b64c9e2" not in extract_zip_text(zip_bytes)`,
    gates: {
      baselineBuildPassed: true,
      redPhaseFailedAsExpected: true,
      greenPhasePassed: true,
      regressionSuitePassed: true,
      staticHygienePassed: true,
      criticApproved: true,
      criticNotes: 'Closes both query parameterization defect and per-document ACL enforcement gap.',
    },
    conversation: [],
    createdAt: '2026-11-12T03:05:00Z',
    updatedAt: '2026-11-12T03:10:00Z',
  },
  {
    id: 'FIX-F001',
    title: 'Enforce workspace ACL on WebSocket document subscribe frames',
    subtitle: 'F-001 · Promoted from Nightfall Red Team',
    repository: 'northstar-docs',
    snapshotLabel: 'Nightfall · Red Team handoff',
    findingIds: ['F-001'],
    severity: 'high',
    status: 'proposed',
    changedFilesCount: 2,
    explanation:
      'Verifies caller workspace read permission on every `subscribe` WebSocket message before joining document room state.',
    unifiedDiff: `--- a/realtime/ws_documents.py
+++ b/realtime/ws_documents.py
@@ -51,4 +51,6 @@ async def on_subscribe(ws, payload):
   doc_id = payload["doc_id"]
+  if not can_view_document(ws.principal, doc_id):
+    return await ws.send_json({"type": "error", "code": "FORBIDDEN"})
   await join_doc_channel(ws, doc_id)`,
    securityTestDiff: `+++ b/tests/test_ws_documents.py
@@ -0,0 +1,7 @@
+async def test_anonymous_ws_visitor_blocked_from_private_doc():
+    resp = await ws_subscribe(principal=None, doc_id="doc_ws_a_101")
+    assert resp["code"] == "FORBIDDEN"`,
    gates: {
      baselineBuildPassed: true,
      redPhaseFailedAsExpected: true,
      greenPhasePassed: true,
      regressionSuitePassed: true,
      staticHygienePassed: true,
      criticApproved: true,
      criticNotes: 'Clean channel-level authorization check preserving public template read access.',
    },
    conversation: [],
    createdAt: '2026-11-12T03:12:00Z',
    updatedAt: '2026-11-12T03:16:00Z',
  },
];

const CORE_REPOS: RepositoryRecord[] = [
  {
    id: 'repo-identity',
    name: 'identity-platform',
    fullName: 'northstar/identity-platform',
    ownerTeam: 'Identity',
    prReviewsEnabled: true,
    scheduledScanLabel: 'Daily at 8:00 AM UTC',
    lastCompletedScanLabel: '7 min ago',
    needsAttention: true,
    openFindingsCount: 42,
  },
  {
    id: 'repo-custody',
    name: 'key-custody-service',
    fullName: 'northstar/key-custody-service',
    ownerTeam: 'Custody',
    prReviewsEnabled: true,
    scheduledScanLabel: 'Daily at 8:00 AM UTC',
    lastCompletedScanLabel: '23 hr ago',
    needsAttention: false,
    openFindingsCount: 14,
  },
  {
    id: 'repo-assets',
    name: 'asset-servicing',
    fullName: 'northstar/asset-servicing',
    ownerTeam: 'Assets',
    prReviewsEnabled: true,
    scheduledScanLabel: 'Daily at 8:00 AM UTC',
    lastCompletedScanLabel: '5 hr ago',
    needsAttention: true,
    openFindingsCount: 38,
  },
  {
    id: 'repo-experience',
    name: 'northstar-docs',
    fullName: 'northstar/northstar-docs',
    ownerTeam: 'Experience',
    prReviewsEnabled: true,
    scheduledScanLabel: 'Daily at 8:00 AM UTC',
    lastCompletedScanLabel: '23 hr ago',
    needsAttention: true,
    openFindingsCount: 51,
  },
  {
    id: 'repo-infra',
    name: 'edge-ingress-mesh',
    fullName: 'northstar/edge-ingress-mesh',
    ownerTeam: 'Infrastructure',
    prReviewsEnabled: true,
    scheduledScanLabel: 'Daily at 8:00 AM UTC',
    lastCompletedScanLabel: '17 min ago',
    needsAttention: false,
    openFindingsCount: 19,
  },
  {
    id: 'repo-doc-proc',
    name: 'document-processing',
    fullName: 'northstar/document-processing',
    ownerTeam: 'Experience',
    prReviewsEnabled: true,
    scheduledScanLabel: 'Daily at 8:00 AM UTC',
    lastCompletedScanLabel: '2 hr ago',
    needsAttention: true,
    openFindingsCount: 27,
  },
  {
    id: 'repo-agent-runtime',
    name: 'agent-runtime',
    fullName: 'nightfall/agent-runtime',
    ownerTeam: 'Infrastructure',
    prReviewsEnabled: true,
    scheduledScanLabel: 'Daily at 8:00 AM UTC',
    lastCompletedScanLabel: '41 min ago',
    needsAttention: false,
    openFindingsCount: 11,
  },
  {
    id: 'repo-media-proxy',
    name: 'media-proxy',
    fullName: 'northstar/media-proxy',
    ownerTeam: 'Experience',
    prReviewsEnabled: false,
    scheduledScanLabel: null,
    lastCompletedScanLabel: '4 days ago',
    needsAttention: true,
    openFindingsCount: 23,
  },
];

// Pad out to 36 repositories matching the exact 29/36 PR review & scheduled scan coverage KPIs in the mock
const EXTRA_REPOS: RepositoryRecord[] = Array.from({ length: 28 }, (_, idx) => {
  const num = idx + 9;
  const teams = ['Identity', 'Custody', 'Assets', 'Experience', 'Infrastructure'] as const;
  const team = teams[idx % teams.length] ?? 'Infrastructure';
  const enabled = idx < 22; // 7 enabled in CORE_REPOS + 22 here = 29 / 36!
  return {
    id: `repo-svc-${num}`,
    name: `${team.toLowerCase()}-service-${num}`,
    fullName: `northstar/${team.toLowerCase()}-service-${num}`,
    ownerTeam: team,
    prReviewsEnabled: enabled,
    scheduledScanLabel: enabled ? 'Daily at 8:00 AM UTC' : null,
    lastCompletedScanLabel: enabled ? `${(idx % 19) + 1} hr ago` : 'Not configured',
    needsAttention: idx === 27, // 5 in CORE_REPOS + 1 here = 6 Need attention!
    openFindingsCount: (idx * 7) % 29,
  };
});

export const INITIAL_REPOSITORIES: RepositoryRecord[] = [...CORE_REPOS, ...EXTRA_REPOS];

export const INITIAL_SCANS: ScanJobRecord[] = [
  {
    id: 'scan-901',
    repository: 'identity-platform',
    mode: 'cloud',
    method: 'scheduled_scan',
    scope: 'full_repository',
    status: 'completed',
    findingsDiscovered: 3,
    startedAt: '2026-11-12T20:25:00Z',
    completedAt: '2026-11-12T20:28:14Z',
  },
  {
    id: 'scan-902',
    repository: 'edge-ingress-mesh',
    mode: 'cloud',
    method: 'continuous_monitoring',
    scope: 'full_repository',
    status: 'completed',
    findingsDiscovered: 0,
    startedAt: '2026-11-12T20:15:00Z',
    completedAt: '2026-11-12T20:17:42Z',
  },
  {
    id: 'scan-903',
    repository: 'asset-servicing',
    mode: 'cloud',
    method: 'repository_scan',
    scope: 'full_repository',
    status: 'completed',
    findingsDiscovered: 2,
    startedAt: '2026-11-12T15:30:00Z',
    completedAt: '2026-11-12T15:36:11Z',
  },
];

export const INITIAL_RED_TEAM_CAMPAIGN: RedTeamCampaignRun = {
  id: 'camp-northstar-staging',
  name: 'northstar-docs-staging',
  objective: 'Check document and workspace access.',
  targetUrl: 'https://staging.northstardocs.com',
  sourceLabel: 'northstar-docs-source.tar.gz',
  yamlText: NORTHSTAR_CAMPAIGN_YAML,
  status: 'running',
  askForApproval: true,
  modelId: 'gpt-6-cyber-ultra',
  budgetRemainingPct: 81,
  elapsedSeconds: 3609, // 1h 0m 09s matching Screenshot_20261112-201638~2.jpg!
  startedAt: '2026-11-12T02:00:00Z',
  updatedLabel: 'Updated just now',
  headlineStatus: 'Nine findings confirmed',
  headlineDetail: "A public template exposed a private workspace's document over WebSocket.",
  safetyMonitorText: 'Requests stay within the approved staging scope.',
  withinApprovedScope: true,
  activitySeries: Array.from({ length: 48 }, (_, i) => {
    const confirmedIndices = new Set([9, 13, 18, 22, 27, 31, 36, 41, 45]);
    return {
      timestamp: `02:${String(Math.min(59, Math.floor((i * 60) / 48))).padStart(2, '0')} AM`,
      requestsCount: 14 + ((i * 17) % 34) + (confirmedIndices.has(i) ? 18 : 0),
      findingConfirmedTick: confirmedIndices.has(i),
    };
  }),
  endpoints: [
    { method: 'GET', path: '/api/me', hits: 261, authScope: 'alice, bob' },
    { method: 'GET', path: '/ws/documents', hits: 208, authScope: 'anonymous, alice, bob' },
    {
      method: 'POST',
      path: '/api/workspaces/90b2e16a-70d2-4c1d-b8e5-5f34609f8a2c/exports',
      hits: 162,
      authScope: 'bob',
    },
    { method: 'GET', path: '/api/workspaces/templates/documents/104', hits: 84, authScope: 'public' },
    {
      method: 'POST',
      path: '/api/workspaces/90b2e16a-70d2-4c1d-b8e5-5f34609f8a2c/saved-searches',
      hits: 42,
      authScope: 'bob',
    },
    { method: 'GET', path: '/api/workspaces/:id/suggestions', hits: 39, authScope: 'guest' },
    { method: 'POST', path: '/api/documents/:id/suggestions/:sid/accept', hits: 27, authScope: 'commenter' },
    { method: 'GET', path: '/api/share/:token/export.md', hits: 19, authScope: 'share-token' },
    { method: 'GET', path: '/api/workspaces/by-slug/:slug', hits: 16, authScope: 'anonymous' },
  ],
  workQueue: [
    {
      id: 'wq-1',
      hypothesis: 'Verify WebSocket `/ws/documents` enforces workspace ACL on channel subscribe frames',
      category: 'Tenant Isolation (WebSocket)',
      assignedAgent: 'verifier-alpha',
      riskTier: 'TIER_1_SAFE_PROBE',
      status: 'confirmed',
      outcomeNote: 'Confirmed as F-001 using synthetic canary NS-ws-4410a',
      updatedAt: '2026-11-12T02:12:09Z',
    },
    {
      id: 'wq-2',
      hypothesis: 'Compare interactive search vs. background ZIP export query parameterization & per-doc ACL',
      category: 'Data Flow Differential',
      assignedAgent: 'verifier-beta',
      riskTier: 'TIER_1_SAFE_PROBE',
      status: 'confirmed',
      outcomeNote: 'Confirmed as F-002 using Alice/Bob staging workspaces & canary NS-7b64c9e2',
      updatedAt: '2026-11-12T02:24:18Z',
    },
    {
      id: 'wq-3',
      hypothesis: 'Check whether direct REST `GET /api/documents/:id` allows cross-workspace read by Bob',
      category: 'Tenant Isolation (REST)',
      assignedAgent: 'verifier-alpha',
      riskTier: 'TIER_1_SAFE_PROBE',
      status: 'falsified',
      outcomeNote: 'Properly blocked by `@require_workspace_member` middleware (403 Forbidden); recorded in Shared Knowledge so parallel agents skip.',
      updatedAt: '2026-11-12T02:16:40Z',
    },
    {
      id: 'wq-4',
      hypothesis: 'Test batch workspace archive purge endpoint under commenter role (`POST /api/workspaces/:id/RetentionPolicy`)',
      category: 'State-Mutating Role Boundary',
      assignedAgent: 'verifier-gamma',
      riskTier: 'TIER_2_STATE_MUTATING',
      status: 'awaiting_approval',
      outcomeNote: 'Paused by Ask-for-Approval policy gate awaiting human operator review.',
      updatedAt: '2026-11-12T02:58:00Z',
    },
  ],
  sharedKnowledge: [
    {
      id: 'sk-1',
      kind: 'identity',
      title: 'Isolated Staging Test Principals (Alice & Bob)',
      detail: 'Alice belongs exclusively to Workspace A (`ws_a`, canary `NS-7b64c9e2`); Bob belongs exclusively to Workspace B (`90b2e16a-70d2-4c1d-b8e5-5f34609f8a2c`).',
      discoveredBy: 'surface-mapper-1',
      createdAt: '2026-11-12T02:01:12Z',
    },
    {
      id: 'sk-2',
      kind: 'data_flow',
      title: 'Divergent Saved-Search Execution Paths (`search_exports.py`)',
      detail: 'Interactive search (`lines 30-56`) binds parameters & checks `can_read_document`; async ZIP export worker (`lines 59-86`) omits both controls.',
      sourceRef: 'search_exports.py:30-86',
      discoveredBy: 'static-flow-mapper',
      createdAt: '2026-11-12T02:08:45Z',
    },
    {
      id: 'sk-3',
      kind: 'negative_result',
      title: 'Direct Document CRUD Endpoints Enforce Tenant UUID Scoping',
      detail: 'Verified `GET/PUT /api/documents/:id` rejects cross-tenant bearer tokens with HTTP 403; excluded from redundant probing.',
      sourceRef: 'docs/views.py:19-48',
      discoveredBy: 'verifier-alpha',
      createdAt: '2026-11-12T02:16:40Z',
    },
  ],
  findingIds: ['F-001', 'F-002', 'F-003', 'F-004', 'F-005', 'F-006'],
};

export const INITIAL_HITL_APPROVALS: HitlApprovalRequest[] = [
  {
    id: 'hitl-01',
    campaignId: 'camp-northstar-staging',
    workItemId: 'wq-4',
    riskTier: 'TIER_2_STATE_MUTATING',
    actionSummary: 'Send state-mutating POST probe with Bob commenter token to retention policy preview endpoint',
    targetEndpoint: 'POST https://staging.northstardocs.com/api/workspaces/90b2e16a-70d2-4c1d-b8e5-5f34609f8a2c/retention-preview',
    rationale: 'Endpoint modifies workspace retention metadata; Ask-for-Approval mode requires explicit human authorization.',
    status: 'pending',
    requestedAt: '2026-11-12T02:58:00Z',
  },
];
