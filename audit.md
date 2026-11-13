# Nightfall Audit — Required Changes

Status: internal review draft
Scope: the two autonomous subprojects — **Nightfall Red Team** (`services/red-team`) and
**Nightfall Defense Factory** (`services/defense-factory`) — plus the shared packages and the
closed-loop orchestrator that bind them, and the Electron/Web UI.

This document is the exhaustive, actionable list of changes required before either subproject can
be taken seriously by, or safely used against, a real project. It is organized as premise /
evidence / required change. Severity legend:

- **S1 Blocker** — the stated premise is false or the behavior is destructive/unsafe; must fix before any real use.
- **S2 Major** — a real user is blocked or badly misled in the first hour.
- **S3 Minor** — correctness, hygiene, or polish.

The project's own cardinal rule (`AGENTS.md` §1) is: *"Zero Fake, Mocked, or Hardcoded Runtime
Implementations … Never return static arrays … or placeholder strings from runtime services."* Most
S1 items below are violations of that rule by the core engines themselves.

---

## 0. Cross-cutting premise contradiction (the "closed loop" is scripted)

The end-to-end loop is coherent only for one bundled scenario (`northstar-docs`, findings
`F-001`/`F-002`). Three seams make it work; each must be replaced with a real implementation.

### 0.1 — S1 — Red Team does not discover findings; it re-emits two hardcoded ones
- Evidence: `services/red-team/src/redTeamEngine.ts:290` (`runAssessment`) has three fixed
  hypotheses and `if (claimed.id === 'wq-rest-direct')`-style branches; confirmations build
  `FindingRecord`s with fixed `id: 'F-001'`, fixed `file: 'routes/collab.py'`, fixed line numbers,
  fixed `owner: 'Leo'` (`redTeamEngine.ts:603-631`, `:788-822`). Probes assert on canary strings
  baked into the bundled staging server (`STAGING_WS_A_CANARY`).
- Required change: generate hypotheses and findings from real surface/dataflow analysis of the
  actual target and source; derive `id`, file, line, CWE, owner from real evidence. Remove all
  literal `F-001`/`F-002` construction from runtime paths.

### 0.2 — S1 — Orchestrator rewrites findings to force fixture alignment
- Evidence: `services/closed-loop-orchestrator/src/index.ts:471-504` overwrites the confirmed
  findings' `codeReferences` and `rootCauseClusterKey` to point at
  `northstar_docs/Export/search_exports.py` and `routes/collab.py` so downstream fixtures match.
- Required change: delete the alignment step. Findings must carry real code references end to end.

### 0.3 — S1 — Defense Factory does not synthesize patches; it looks them up by filename suffix
- Evidence: `services/defense-factory/src/snapshotBuilders.ts:418` (`buildModuleSnapshotForFinding`)
  is a chain of `refFile.endsWith('search_exports.py' | 'collab.py' | 'tokenRouter.ts' |
  'queryLedger.ts' | 'exportHandler.mjs')`, each returning a complete pre-written "patched" file.
  The generic fallback (`snapshotBuilders.ts:919-980`) returns a fabricated `invokeGuardedHandler`
  module unrelated to the user's file.
- Required change: synthesize the patch from the real finding and the real source (model-driven
  fault localization + minimal patch), operating on the actual file contents, not a fixture table.

---

## 1. Nightfall Red Team — required changes

### 1.1 — S1 — The "signed scope manifest" provides no security (self-signed)
- Premise (`docs/BUILD_PLAN.md`, "Safety-First Architectural Invariant"): scope is enforced
  deterministically by a cryptographically signed `campaign.yaml`.
- Evidence: `verifySignedCampaignManifest` checks the signature against a public key passed in
  alongside the manifest (`packages/core-contracts/src/campaign.ts:149`); when none is supplied,
  `runAssessment` generates a fresh keypair and signs its own scope
  (`services/red-team/src/redTeamEngine.ts:303-326`). No trust anchor, no pinned authorized key.
- Required change: verify against an operator-provisioned, pinned public key (or a real CA/KMS).
  Reject manifests not signed by an authorized key. The signing key must not be mintable by the
  same code path that runs the campaign.

### 1.2 — S1 — "Clean-room" sandbox verification is circular
- Evidence: confirmation writes a sandbox script that re-asserts values already computed in the host
  (`redTeamEngine.ts:542-556`). `verifyFixClosure` computes booleans in JS and then interpolates
  them into the sandbox assertions: `assert.equal(${securityProbeBlocked}, true)`
  (`redTeamEngine.ts:1183-1191`, Python variant `:1139-1141`). The sandbox proves `true === true`.
- Required change: the sandbox must execute the actual probe/repro against the actual target or
  patched module and derive pass/fail from real output — never from a host-computed literal.

### 1.3 — S1 — `evaluateExternalFindings` fabricates evidence
- Evidence: `redTeamEngine.ts:264-288` branches on caller-supplied booleans and emits prose claiming
  "call-graph reachability analysis confirmed route handler is dead." No call graph exists.
- Required change: either perform real reachability/sanitization analysis, or label the output as a
  heuristic triage hint and stop asserting analysis that did not run.

### 1.4 — S2 — Finding/evidence IDs are not unique (data corruption across runs)
- Evidence: every WebSocket finding is `F-001`, every export finding `F-002`, evidence
  `EV-F001-LIVE` (`redTeamEngine.ts:560-562`, `:738-739`). SQLite upserts by ID, so a second
  campaign overwrites the first.
- Required change: generate collision-free IDs (campaign-scoped UUID or monotonic sequence) for
  findings and evidence bundles.

### 1.5 — S2 — Assessment only works against the bundled staging server
- Evidence: all probe logic and canary assertions are specific to
  `services/red-team/src/stagingTargetServer.ts`. There is no path to register a real target,
  real credentials, or real scope authorization from the UI.
- Required change: real target onboarding (URL + credentials + authorized scope), and probe logic
  that does not depend on bundled canary constants.

### 1.6 — S1 — State-mutating POSTs bypass the approval gate (risk misclassification)
- Evidence: `PolicyGate.classifyActionRisk` returns `TIER_1_SAFE_PROBE` for every `POST` unless the
  caller explicitly passes `mutatesState` (`packages/policy-gate/src/index.ts:83-89`). The assessment
  creates saved searches and runs exports via POST without setting that flag
  (`services/red-team/src/redTeamEngine.ts:677-703`), so even with `askForApproval: true` these
  state-changing calls execute with no HITL approval (only the retention-preview POST sets it,
  `:862-874`). Risk is an optional caller assertion, not a property of the method/endpoint.
- Required change: derive the risk tier from method + endpoint policy (POST/PUT/PATCH/DELETE and
  known-mutating routes are mutating by default); require mutating operations to enter the approval
  flow regardless of a caller flag.

### 1.7 — S1 — Egress scope is not re-checked on HTTP redirects
- Evidence: `proxyHttpRequest` evaluates policy only for `input.url`, then calls `fetch` without
  `redirect: 'manual'` (`services/red-team/src/egressProxy.ts:570-578`). An in-scope target that
  responds with a 3xx to an off-scope origin (e.g. an internal service) is followed automatically,
  with no repeat of the origin/path/scope checks — defeating the campaign allowlist even after the
  signing issue (1.1) is fixed.
- Required change: set `redirect: 'manual'` and either reject cross-origin redirects or follow them
  hop-by-hop, re-running the full scope + policy evaluation (and rate/duration accounting) on every
  hop.

### 1.8 — S1 — Approved mutating actions are reported complete but never executed
- Evidence: `resolveApproval` marks the work-queue item `confirmed` ("state-mutating boundary
  verified") and flips the campaign to `completed`, but never replays the paused request through
  `EgressPolicyProxy` with the approval ID
  (`services/closed-loop-orchestrator/src/index.ts:1290-1342`); no caller passes an `approvalId` back
  to the proxy. The approved retention POST is reported done without ever running.
- Required change: persist the paused action bound to its approval, replay it through the policy gate
  on approval, and mark it complete only from the real response (see also GAP-30).

### 1.9 — S1 — No per-request deadline; a hung response outlives max_duration and the kill-switch
- Evidence: `checkCommonGuards` checks elapsed time once, then `proxyHttpRequest` awaits `fetch` and
  `response.text()` with no `AbortSignal` (`services/red-team/src/egressProxy.ts:263-273,570-580`). A
  target that accepts the connection and never finishes keeps the campaign running past `max_duration`,
  and engaging the kill-switch cannot stop the in-flight request.
- Required change: give every request and body read an `AbortSignal` bound to the remaining campaign
  duration, and abort all in-flight requests when the kill-switch engages.

---

## 2. Nightfall Defense Factory — required changes

### 2.1 — S1 — The committed patch is not the diff shown to the reviewer (destructive)
- Evidence: the UI renders `snapshot.unifiedDiff` (a small hunk), but
  `GitPatchPackager.packageVerifiedFix` never applies that diff — it writes
  `input.patchedSource` as the entire file (`services/defense-factory/src/gitPackager.ts:184`).
  For a real finding routed through the generic fallback, the commit replaces the user's whole
  vulnerable file with the toy `invokeGuardedHandler` stub while displaying a tidy 3-line diff.
- Required change: apply the shown unified diff to the real file (3-way apply against the cloned
  revision), fail loudly on reject, and assert that the committed diff equals the displayed diff.
  Never overwrite a whole file from a synthesized `patchedSource`.

### 2.2 — S1 — The "Two-Stage Proof" proves the fixture, not the finding
- Evidence: Red/Green runs against `snapshot.unmodifiedSource` / `patchedSource` — the hardcoded
  pair — unless `workspaceReposRoot` is set and the on-disk file contains a magic marker string
  (`snapshotBuilders.ts:433`, `:457`). The proof otherwise says nothing about the real bug.
- Required change: baseline, red, green, and regression phases must run against the real repository
  checkout at the observed revision, with the real (patched) file.

### 2.3 — S1 — SAST is single-line regex with name-convention authz detection
- Evidence: `services/defense-factory/src/repositoryScanner.ts:333` (`analyzeSourceFile`) matches
  `exec(`, `eval(`, f-string SQL, `pickle.loads`, and flags "missing authorization" only on
  functions literally named `export_*` / `on_subscribe` / `getRestricted*`
  (`repositoryScanner.ts:543`, `:583`). On real code it misses real authz bugs and false-fires on
  benign `exec`/`eval`/`readFile`, then feeds each FP to the destructive patcher (2.1).
- Required change: move to AST/dataflow-based rules (or an established engine), require
  taint/reachability before emitting, and gate auto-patching behind confirmed findings only.

### 2.4 — S2 — The Critic's anti-cheat guard only fires on demo strings
- Evidence: `BUILTIN_FORBIDDEN_TEST_TOKENS` (`defenseFactoryEngine.ts:54`) blocklists literal demo
  canaries (`NS-7b64c9e2`, `tok-bob-ws-b`, …). Real patches never contain these, so the guard is
  inert in production.
- Required change: detect test-fitting structurally (e.g. patch references identifiers that appear
  only in the security test, or hardcodes the test's expected inputs), independent of demo tokens.

### 2.5 — S2 — Engineer follow-up discards the engineer's change and re-greens gates by assignment
- Evidence: `applyEngineerFollowUp` appends a canned comment to the diff, runs a recheck that only
  asserts the diff is non-empty and canary-free, then sets
  `greenPhasePassed/regressionSuitePassed/criticApproved = gatesStillHealthy`
  (`defenseFactoryEngine.ts:670-677`) without re-running tests; the committed body is placeholder
  text (`:632-638`).
- Required change: apply the engineer's actual instruction to the real patch, then re-run the full
  two-stage proof and set each gate from its real result.

### 2.6 — S2 — Git packaging hardcodes `base: main` and force-pushes
- Evidence: `gitPackager.ts:235` (`base: 'main'`), `:208` (`push … --force`). No per-repo default
  branch, no identity/app model, PR only when `GITHUB_TOKEN` + `NIGHTFALL_GITHUB_REPO` are set.
- Required change: resolve the real default branch, avoid force-push to shared refs, and provide a
  proper GitHub App / installation auth flow.

### 2.7 — S1 — "Merge and verify" never merges anything
- Evidence: `NightfallOrchestrator.mergeAndVerifyFix` sets `status: 'merged'` immediately
  (`services/closed-loop-orchestrator/src/index.ts:1026-1031`), then (for the bundled demo only)
  toggles the in-memory staging server's patch and runs the circular `verifyFixClosure` (1.2 / GAP-14),
  flipping findings to `fixed`. No real Git/PR merge occurs; for any real repository the default branch
  is untouched while the UI reports the fix merged and the finding fixed.
- Required change: perform a real, verified merge of the packaged branch/PR (respecting branch
  protection and required checks), advance `merged`/`fixed` only on a confirmed merge, and run closure
  checks against the actual resulting revision.

### 2.8 — S2 — The per-team WIP cap and dispatchable routing are never enforced
- Evidence: `RootCauseDeduplicator.clusterAndRoute` computes `dispatchable: false` past a team's cap,
  but the bootstrap caller never reads `dispatchable`
  (`services/closed-loop-orchestrator/src/index.ts:545-560`) and `startFixForFinding` bypasses routing
  entirely (`:921-964`); a team can receive unlimited active proposals despite the advertised cap.
- Required change: make proposal creation reject or defer non-dispatchable clusters, or remove the
  WIP-cap claim.

---

## 3. Offensive-security LLM and Trusted-Vendor configuration (internal-review item)

Internal-review assumption under test: *Nightfall does not include a capable offensive-security
LLM, and a configuration page needs to list trusted vendors for this.*

**Reviewed — the assumption is correct.**

### 3.1 — S1 — No capable offensive-security LLM is actually included or operational
- Evidence:
  - `packages/model-gateway/src/index.ts:49` (`NIGHTFALL_MODELS`) ships four descriptors:
    `gpt-6-cyber-ultra` (openai), `claude-4-6-sonnet-sec` (anthropic), `gemini-3-pro-sec` (google),
    `nightfall-local-verifier` (nightfall-sim). The first three are non-existent model IDs; if
    live providers are enabled and keys are set, those IDs are sent to the real provider APIs
    (`:142-224`) and rejected, so the gateway falls back to the caller's `fallbackValue`.
  - Live providers are **off by default**: `enableLiveProviders` defaults to
    `NIGHTFALL_ENABLE_LIVE_MODELS === 'true'` (`:108-110`). Out of the box nothing is contacted.
  - Every caller passes the answer as `fallbackValue` (surface map, patch critic, follow-up), so the
    "offensive" reasoning is the scripted fallback, not a model. The only model that returns without
    error is the `nightfall-sim` stub.
  - The gateway is a thin single-shot JSON chat wrapper: no tool-use, no agent loop, no
    exploitation capability. `tier: 'frontier-cyber'` is a label on a descriptor, not a capability.
- Required change: integrate a real, capable model for the offensive tasks (surface mapping,
  hypothesis generation, exploit/repro reasoning) behind the gateway, with genuine request/response
  handling and real model IDs; make deterministic fallback an explicit, clearly-labeled degraded
  mode rather than the default behavior.

### 3.2 — S1 — No configuration surface to select or govern trusted vendors
- Evidence:
  - The settings page (`apps/nightfall-ui/src/screens/defense-factory/settings-screen.tsx:132-152`)
    is read-only: it renders a `DataTable` of the static `models` list. There is no control to add,
    enable, select, or remove a vendor, no credential entry, no budget, no model pinning.
  - Credentials are read only from `process.env` (`model-gateway/src/index.ts:142`, `:171`, `:201`);
    there is no in-product way to supply or rotate them.
  - The provider set is a hardcoded zod enum
    (`packages/core-contracts/src/operations.ts:197`: `['openai','anthropic','google','local',
    'nightfall-sim']`) — a type, not an operator-governed allowlist.
- Required change: add a **Model / Vendor configuration page** that:
  1. Lists an operator-governed **trusted-vendor allowlist** (which providers are permitted to
     receive campaign/source context), editable and persisted, not a compile-time enum.
  2. Captures and stores credentials per vendor securely (OS keychain via the Electron bridge for
     desktop; server-side secret store for the API), never in chat or plaintext config.
  3. Lets the operator enable/disable live providers, pick the model per task (surface-map, triage,
     patch-synth, patch-critic, follow-up), pin a model version, and set the cost budget.
  4. Records vendor/model changes to the audit ledger, and surfaces a clear warning that enabling a
     vendor sends code/target context to that third party.
  5. Enforces the allowlist at the gateway: a request to a non-allowlisted provider is refused, not
     silently fallen back.

### 3.3 — S2 — Data-governance gap: no control over what is sent to third-party models
- Evidence: `tryLiveProviderCompletion` sends `input.prompt` (which includes target URLs, finding
  details, and candidate diffs) to the selected provider with no redaction or consent gate
  (`model-gateway/src/index.ts:131-224`).
- Required change: tie outbound model calls to the trusted-vendor allowlist (3.2), add a redaction/
  consent step for source and secrets, and log every outbound vendor call.

---

## 4. Platform and adoption gaps (apply to both subprojects)

### 4.1 — S1 — No license
- Evidence: repo root has no `LICENSE`. A public repo pitched for real use is legally unusable by
  others.
- Required change: add an explicit open-source or commercial license; add `CONTRIBUTING.md` and
  `SECURITY.md`.

### 4.2 — S1 — CI runs the test suite and it is red (the suite hard-requires the unprovisionable LiteBox toolchain)
- Correction to an earlier draft of this item: CI does exist and does run the code.
  `.github/workflows/desktop-debug-installers.yml` defines a job
  `Typecheck, Unit/E2E Tests & Bundle Audit` that runs `pnpm typecheck` and `pnpm test` on both
  `push` and `pull_request` (lines 3-8, 46, 72-76).
- Evidence: that job fails — 9 tests across 6 files fail because they assert the LiteBox backend is
  present/selected rather than the real fallback:
  `expect(proposal.sandboxBackend).toBe('microsoft-litebox')`
  (`services/defense-factory/src/defenseFactory.test.ts:281`);
  `expect(boot.sandboxToolchain.available).toBe(true)`
  (`services/api-gateway/src/apiGateway.test.ts:38`,
  `services/closed-loop-orchestrator/src/orchestrator.test.ts:54`,
  `packages/sandbox-runtime/src/sandbox-runtime.test.ts:29,47` and strict-mode `:94`);
  the CLI status expects `Microsoft LiteBox (ready` (`apps/nightfall-cli/src/cli.test.ts:84`); the
  benchmark suite expects `microsoft-litebox` (`benchmarks/testbeds/src/benchmarks.test.ts:283,366`).
  Because the LiteBox binaries cannot be provisioned (see 4.3), the runtime correctly falls back to
  `process-confined`, so the suite is red anywhere the binaries are absent — i.e. in CI and on any
  normal install. The test suite encodes the very overclaim it should be catching.
- Required change: make the required check pass honestly — either ship a reproducible LiteBox
  provisioning path and gate the LiteBox-specific assertions on its real availability, or rewrite the
  tests to assert the real `process-confined` backend and drop the LiteBox assertions (ties to 4.3
  and to the claims-vs-reality remediation). Keep `pnpm typecheck` + `pnpm test` as required,
  green PR checks thereafter.

### 4.3 — S1 — "Microsoft LiteBox" isolation is claimed but silently downgraded
- Evidence: the sandbox falls back to `process-confined` whenever the LiteBox binaries are absent
  (`packages/sandbox-runtime/src/index.ts:754-768`); the pinned toolchain
  (`LITEBOX_PINNED_COMMIT`, `:10`) is not a provisionable public artifact and
  `infra/litebox/build-litebox.sh` cannot produce it. Every "isolated inside Microsoft LiteBox"
  claim (README, settings page, teardown attestation) then describes an ordinary host child process.
- Required change: either ship a reproducible LiteBox provisioning path and fail closed in strict
  mode, or drop the LiteBox branding and describe the real `process-confined` backend honestly in
  the UI and attestations.

### 4.4 — S2 — Declared Node floor is wrong
- Evidence: `engines.node: ">=22.0.0"` (root `package.json`), but `node:sqlite` (`DatabaseSync`,
  `services/closed-loop-orchestrator/src/sqliteStore.ts:3`) does not exist on Node 22.0-22.4; it was
  added in 22.5.0 behind `--experimental-sqlite` and unflagged (still experimental) only in 22.13.0.
  So `>=22.0.0` throws `ERR_UNKNOWN_BUILTIN_MODULE` below 22.5 and needs the flag on 22.5-22.12.
  (Corrected per PR review; an earlier draft said "until Node 24.")
- Required change: raise the floor to `>=22.13.0` for unflagged use (or `>=22.5` with the documented
  flag), or depend on a stable SQLite library.

### 4.5 — S1 — API gateway has no authentication and open CORS on safety controls
- Evidence: `services/api-gateway/src/index.ts:7` sets `Access-Control-Allow-Origin: *`; no route is
  authenticated, including `POST /api/policy/kill-switch` (`:236`) and approval resolution (`:221`).
  The HITL approval gate and kill-switch — the safety core — are callable by anyone who can reach
  the port.
- Required change: add authentication/authorization, scope CORS, and protect all policy/approval/
  kill-switch endpoints with an operator role.

### 4.6 — S2 — No durable, collision-free finding history
- Evidence: SQLite defaults to `:memory:` (`closed-loop-orchestrator/src/index.ts:181`), so state is
  lost on restart; combined with non-unique finding IDs (1.4), there is no re-scannable history — the
  one thing a vulnerability-management platform must have.
- Required change: default to a durable DB path, make IDs unique, and support idempotent re-scan /
  finding-lifecycle updates.

### 4.7 — S3 — No environment/config documentation
- Evidence: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GITHUB_TOKEN`,
  `NIGHTFALL_ENABLE_LIVE_MODELS`, `NIGHTFALL_SQLITE_PATH`, `NIGHTFALL_WORKSPACE_REPOS_ROOT`,
  `NIGHTFALL_STAGING_TARGET_URL`, `NIGHTFALL_LITEBOX_BIN_DIR`, `NIGHTFALL_GITHUB_REPO` are read from
  `process.env` with no `.env.example` and no docs.
- Required change: add `.env.example` and a configuration section documenting every variable.

### 4.8 — S2 — The "immutable" audit ledger is never verified on load and rows are overwritable
- Evidence: the orchestrator passes `store.listAuditEntries()` straight into `AuditLedger`, whose
  constructor only parses and accepts them with no chain verification
  (`packages/audit-ledger/src/index.ts:75-87`); the SQLite writer uses
  `ON CONFLICT(idx) DO UPDATE SET ... payload_json = excluded.payload_json`
  (`services/closed-loop-orchestrator/src/sqliteStore.ts:437-449`), so a modified or replaced
  historical row is silently trusted and later entries chain from the tampered hash. `verifyIntegrity`
  exists and the CLI uses it, but the running service never does.
- Required change: verify the complete hash chain before serving state or appending, fail closed on
  corruption, and make persisted audit rows strictly append-only (no `DO UPDATE`).

### 4.9 — S2 — "Scheduled scans" never run (label-only scheduling)
- Evidence: there is no scheduler/cron worker. Selecting `scheduled_scan` performs a single immediate
  scan and stores a display label; `toggleRepositoryScans` only flips `prReviewsEnabled` and sets
  `scheduledScanLabel: 'Daily at 8:00 AM UTC'` / `'Scheduled'` while the audit summary claims scheduled
  scans were enabled (`services/closed-loop-orchestrator/src/index.ts:1127-1144`). Users see "Daily",
  "Weekly", or cron coverage that will never execute.
- Required change: persist schedules and execute them through a real scheduler/worker, or remove the
  scheduled-coverage claims from the UI and audit text.

### 4.10 — S2 — Campaign queue/lease/knowledge state is in-memory only and not crash-recoverable
- Evidence: `SharedKnowledgeStore` holds queues, leases, and knowledge in in-memory `Map`s
  (`packages/shared-memory/src/index.ts`); `launchCampaign` persists only the pre-assessment campaign
  row, runs the whole assessment in memory, and writes the result back only after it returns
  (`services/closed-loop-orchestrator/src/index.ts:1205,1229-1284`). A crash mid-assessment loses all
  intermediate findings, lease, and queue state — contradicting the SQLite-persistence requirement.
- Required change: persist queue/knowledge/lease mutations transactionally as they happen and make a
  running campaign recoverable after restart.

### 4.11 — S3 — The overview "currently fixed" trend is miscomputed
- Evidence: `computeOverview` seeds `runningFixed` at 0 and counts only fixes whose `updatedAt` is in
  the 7-day window, then overwrites just today's point with the all-time total
  (`services/closed-loop-orchestrator/src/index.ts:671-695`). Any fix completed before the window
  understates the first six points and produces an artificial jump on the final day.
- Required change: seed the series with fixes completed before the window, or compute each point from
  the full as-of-date history.

---

## 6. Reality Gap Inventory — mocked / faked / hardcoded as of code commit `7273506`

This is the exhaustive catalog of every place where runtime behavior is mocked, faked, hardcoded,
scripted, or fabricated across the entire repository, measured against a future state in which
**nothing** is mocked/faked/hardcoded — i.e. every finding comes from real analysis of the user's
real target and code, every patch is synthesized for that code, every proof runs against it, and
every claim in the UI/docs/attestations is literally true.

Each entry: **Gap** (what is faked) · **Evidence** (`file:line`) · **Real-state target** (what "real"
requires). Severity reuses the legend above.

### 6.A — Scenario and data fabrication (the entire demo world is synthetic)

- **GAP-01 — S1 — The repositories under analysis are fabricated in code.**
  `materializeWorkspaceRepositories` writes five fixed "repos" (`northstar-docs`, `asset-servicing`,
  `auth-gateway`, `payments-ledger`, `edge-ingress-mesh`) from hardcoded source strings and
  `git init`s them (`services/closed-loop-orchestrator/src/workspaceMaterializer.ts:82-169`). Source
  bodies are imported fixtures (`UNPATCHED_*` from `pythonFixtures.ts` / `snapshotBuilders.ts`).
  Real-state: analyze repositories the user actually connects (clone URL / local path / VCS
  integration); no built-in corpus on the runtime path.
- **GAP-02 — S1 — The live target is a bundled vulnerable app with planted canaries.**
  `StagingTargetServer` hardcodes principals, documents, workspace IDs and canary markers
  (`services/red-team/src/stagingTargetServer.ts:5-99`) and toggles its own vulnerabilities via
  `setPatched`. All "live verification" only works against this server.
  Real-state: probe the user's real staging/ephemeral target; no bundled target on the runtime path.
- **GAP-03 — S1 — Cold bootstrap seeds a scripted campaign.** `performRealColdBootstrap` hardcodes
  the campaign, `logicalTargetUrl = 'https://staging.northstardocs.com'`, two invented external SAST
  findings (`SAST-DEAD-01`, `SAST-SANITIZED-02`), and cosmetic
  `budgetRemainingPct: 94` (`services/closed-loop-orchestrator/src/index.ts:390-465`, `:525`).
  Real-state: no auto-seeded campaign; state starts empty and is populated by real user actions.
- **GAP-26 — S2 — "Scheduled scans" are label-only; no scheduler exists.** `scheduled_scan` runs one
  immediate scan and stores a cron display label; `toggleRepositoryScans` only flips a flag and sets
  `'Daily at 8:00 AM UTC'` (`services/closed-loop-orchestrator/src/index.ts:1127-1144`). No later scan
  runs. Real-state: a real scheduler/worker that executes persisted schedules.
- **GAP-29 — S1 — Marking a finding "duplicate" with no canonical fabricates `SEC-CANONICAL` and
  discards it.** The UI duplicate buttons send no `duplicateOfId`; with no same-cluster peer,
  `markFindingDuplicate` invents `'SEC-CANONICAL'`, sets the finding to `discarded_fp`, and records the
  nonexistent relationship (`services/closed-loop-orchestrator/src/index.ts:887-911`). A real finding
  silently disappears behind a fabricated duplicate. Real-state: require selecting/validating an
  existing canonical finding, or reject the action when none is supplied.

### 6.B — Red Team detection (findings are scripted, not discovered)

- **GAP-04 — S1 — Findings `F-001`/`F-002` are hardcoded literals.** Fixed id, title, file
  (`routes/collab.py`, `northstar_docs/Export/search_exports.py`), line numbers, CWE, severity and
  owner `Leo` are constructed in branch logic
  (`services/red-team/src/redTeamEngine.ts:603-631`, `:788-822`). IDs collide across runs.
  Real-state: findings and their IDs derive from real evidence; unique IDs.
- **GAP-05 — S1 — "Surface mapping" returns its own input.** `completeStructured({task:'surface-map',
  fallbackValue:{hypotheses: baseHypotheses}})` has no model behind it, so the three baseline
  hypotheses pass through unchanged (`redTeamEngine.ts:348-389`).
  Real-state: hypotheses generated from real surface/dataflow analysis of the target+source.
- **GAP-06 — S1 — External-finding triage fabricates analysis prose.** `evaluateExternalFindings`
  branches on caller booleans and emits "call-graph reachability analysis confirmed route handler is
  dead" with no call graph (`redTeamEngine.ts:264-288`).
  Real-state: real reachability/taint analysis, or honest "unverified heuristic" labeling.
- **GAP-07 — S2 — `observedRevision` defaults to a hardcoded hash.** `'e81a442'`
  (`redTeamEngine.ts:299`). Real-state: resolve the real revision of the analyzed target.

### 6.C — Model / LLM layer (no real offensive intelligence)

- **GAP-08 — S1 — No capable model performs any reasoning.** Every `completeStructured` caller passes
  the answer as `fallbackValue`; live providers are off by default and, when on, use non-existent
  model IDs (`gpt-6-cyber-ultra`, `claude-4-6-sonnet-sec`, `gemini-3-pro-sec`) that real APIs reject,
  so the fallback is returned (`packages/model-gateway/src/index.ts:49-81`, `:232-265`). The only
  working model, `nightfall-local-verifier` (`nightfall-sim`), is a stub.
  Real-state: a real, capable offensive-security model does surface-map / triage / patch-synth /
  patch-critic / follow-up; deterministic fallback is an explicit, labeled degraded mode.
- **GAP-09 — S1 — No trusted-vendor configuration.** Provider set is a compile-time enum
  (`packages/core-contracts/src/operations.ts:197`); the settings page is a read-only table
  (`apps/nightfall-ui/src/screens/defense-factory/settings-screen.tsx:132-152`); credentials come only
  from `process.env`. Real-state: operator-governed trusted-vendor allowlist, secure credential
  storage, enablement, per-task model selection, budget, fail-closed enforcement (see §3).

### 6.D — Defense Factory patch synthesis (fixture lookup, not synthesis)

- **GAP-10 — S1 — Patches are looked up by filename suffix.** `buildModuleSnapshotForFinding` is a
  chain of `refFile.endsWith(...)` returning pre-written patched files for five known fixtures
  (`services/defense-factory/src/snapshotBuilders.ts:418-917`).
  Real-state: synthesize the patch from the real finding and real source.
- **GAP-11 — S1 — The generic fallback emits an unrelated toy module.** Any non-fixture file yields a
  fabricated `invokeGuardedHandler` module unrelated to the user's code
  (`snapshotBuilders.ts:919-980`). Real-state: a patch derived from the actual file, or an explicit
  "cannot auto-fix" result — never a stand-in module.
- **GAP-12 — S2 — Code-owner routing is a hardcoded directory.** Fixed names mapped to fixed repos
  (`services/defense-factory/src/deduplicator.ts:33-73`). Real-state: resolve owners from CODEOWNERS /
  VCS / directory service.

### 6.E — Verification and "proof" (circular or asserted)

- **GAP-13 — S1 — Clean-room confirmation asserts host-computed literals.** The sandbox script
  re-asserts values already parsed in the host (`redTeamEngine.ts:542-556`, `:721-734`).
  Real-state: the sandbox independently reproduces the issue from inputs, not from a baked conclusion.
- **GAP-14 — S1 — Fix-closure verification asserts precomputed booleans.** `verifyFixClosure`
  computes pass/fail in JS, then writes `assert.equal(${securityProbeBlocked}, true)` into the sandbox
  (`redTeamEngine.ts:1139-1141`, `:1183-1191`). Real-state: derive pass/fail from the real post-patch
  probe/run.
- **GAP-15 — S1 — Two-stage proof runs against fixtures, not the user's file.** Red/Green/regression
  execute on `snapshot.unmodifiedSource`/`patchedSource` (the fixtures) unless a disk file contains a
  magic marker (`services/defense-factory/src/defenseFactoryEngine.ts:187-378`,
  `snapshotBuilders.ts:433`). Real-state: run against the real checkout at the observed revision.
- **GAP-16 — S2 — Critic anti-cheat only triggers on demo tokens.** `BUILTIN_FORBIDDEN_TEST_TOKENS`
  blocklists demo canaries (`defenseFactoryEngine.ts:54-62`); real patches never contain them.
  Real-state: structural test-fitting detection independent of demo strings.
- **GAP-17 — S2 — Engineer follow-up fakes the refinement.** Appends a canned comment, re-greens all
  gates from one boolean without re-running tests, and commits placeholder body text
  (`defenseFactoryEngine.ts:528-715`, esp. `:632-638`, `:670-677`).
  Real-state: apply the real instruction, re-run the full proof, set each gate from its real result.
- **GAP-30 — S1 — Approved mutating actions are recorded verified without executing.** `resolveApproval`
  marks the item `confirmed` / campaign `completed` but never replays the paused request through the
  proxy (`services/closed-loop-orchestrator/src/index.ts:1290-1342`). Real-state: replay the approved
  action and record completion only from its real response (see 1.8).

### 6.F — Git / PR packaging (committed artifact diverges from shown diff)

- **GAP-18 — S1 — The displayed unified diff is never applied; the whole file is overwritten.**
  `packageVerifiedFix` writes `patchedSource` as the entire file
  (`services/defense-factory/src/gitPackager.ts:184`); `unifiedDiff` is display-only. For a
  non-fixture finding this commits the toy stub over the user's file while showing a small diff.
  Real-state: apply the shown diff to the real file (3-way), assert committed == displayed, fail on
  reject.
- **GAP-19 — S2 — PR base and push are hardcoded.** `base: 'main'` and `push --force`
  (`gitPackager.ts:235`, `:208`). Real-state: resolve the real default branch; no force-push to shared
  refs; real app/installation auth.
- **GAP-27 — S1 — "Merge and verify" never merges.** `mergeAndVerifyFix` sets `status: 'merged'`
  immediately and flips findings to `fixed` via the circular closure check, toggling only an in-memory
  staging patch for the demo (`services/closed-loop-orchestrator/src/index.ts:1026-1050`). The real
  branch/PR is never merged. Real-state: a real verified merge, with state advanced only on confirmation
  and closure run against the resulting revision (see 2.7).

### 6.G — Sandbox / Microsoft LiteBox (claimed isolation never occurs)

- **GAP-20 — S1 — LiteBox isolation is never actually used; every run is `process-confined`.** The
  toolchain is absent (binaries not provisionable; `infra/litebox/build-litebox.sh` does a real clone
  + `cargo build` but depends on an upstream repo/commit/crate layout that is not guaranteed to exist
  and is never built or cached in CI), so `discoverLiteBoxToolchainSync` returns unavailable and
  execution falls back (`packages/sandbox-runtime/src/index.ts:143-225`, `:754-768`). The runtime
  labels the backend honestly, but the README, the settings screen copy, the fix-proposal subtitle
  logic (`defenseFactoryEngine.ts:434-437`), and the test suite all assert LiteBox isolation that does
  not happen (the 9 CI failures in §4.2). Real-state: either ship a reproducible LiteBox toolchain and
  fail-closed in strict mode, or drop the LiteBox branding everywhere and describe the real backend.

### 6.H — Credentials and secrets (referenced but ignored, or hardcoded)

- **GAP-21 — S1 — Campaign credentials are declared but never loaded; hardcoded tokens are used.**
  Manifests reference `credentials/alice.token` / `credentials/bob.token`
  (`services/closed-loop-orchestrator/src/index.ts:406-409`) but the engine ignores them and uses
  constants `STAGING_ALICE_TOKEN` / `STAGING_BOB_TOKEN`
  (`services/red-team/src/redTeamEngine.ts:293-296`). Real-state: load and use the real referenced
  credentials from a secret store.
- **GAP-22 — S2 — "OS Keychain" bridge is claimed but unimplemented.** `BUILD_PLAN.md`/`README`
  describe an OS-keychain preload bridge, but `platform-bridge.ts` exposes only
  `pickLocalRepository` / `sendNativeNotification` and no keychain/`safeStorage` method exists
  (`apps/nightfall-ui/src/bridge/platform-bridge.ts:17-98`). Real-state: implement real keychain-backed
  credential storage, or remove the claim.

### 6.I — UI affordances that are labeled but not wired

- **GAP-23 — S2 — "Attach source archive / synthetic credentials" is a placeholder.** The composer
  advertises attachment (`apps/nightfall-ui/src/screens/red-team/composer-screen.tsx:127`), but
  campaign prep accepts only `prompt`, `targetUrl`, and a free-text `sourceLabel` string, and the
  engine never ingests an archive (`services/api-gateway/src/index.ts:188-209`;
  `redTeamEngine.ts:158-187`). Real-state: real source-archive ingestion feeding analysis.
- **GAP-24 — S2 — Model picker lists fictional models.** The composer selects among the GAP-08 model
  IDs (`composer-screen.tsx:43`, `:147-148`). Real-state: list real, configured, allowlisted models.
- **GAP-28 — S2 — The finding report links to a "downloaded ZIP" that does not exist.** The report says
  "See the private document in the downloaded ZIP" but the link is an in-page anchor to `#sec-evidence`
  (`apps/nightfall-ui/src/screens/red-team/finding-report-screen.tsx:53-59`); there is no evidence-export
  API, client method, or handler anywhere in the repo. Real-state: generate and download a sanitized
  evidence bundle, or remove the promise.
- **GAP-31 — S2 — The fix drawer shows a false "verified" state for suppressed/failed fixes.** It renders
  "✓ Fix prepared · Two-stage test proof verified" unconditionally and enables "Merge & Verify Fix"
  whenever status is not `merged`, including suppressed proposals the backend then rejects
  (`apps/nightfall-ui/src/screens/defense-factory/fix-drawer.tsx:94-99,170-185`;
  `services/closed-loop-orchestrator/src/index.ts:1021-1023`). Real-state: render suppression and failed
  gates truthfully and disable actions that cannot run.

### 6.J — Efficacy is measured only against synthetic testbeds

- **GAP-25 — S2 — Benchmarks run on fabricated testbeds and a deliberately "defective" patch.**
  `benchmarks/testbeds/src/` defines synthetic documents and
  `DEFECTIVE_HARDCODED_PATCH_ASSET_EXPORT_MJS` (`assetExportFixture.ts:112-148`,
  `northstarTestbed.ts`). There is no measurement against real-world vulnerability corpora
  (OWASP Benchmark, real CVEs). Real-state: a reproducible efficacy suite over real datasets with
  published detection-rate / false-positive numbers.

### 6.K — Best-in-class real alternatives (by fakery area)

Best-effort, concrete "build-this-instead" guidance. Named tools/standards are representative of the
class, not endorsements; choose per language and deployment model.

**For 6.A (scenario & data) — make the subject-under-analysis entirely user-supplied.** Ingest
repositories through a real VCS integration (a GitHub/GitLab/Bitbucket App with per-install,
short-lived tokens), clone to an ephemeral workspace, and also support local-path and uploaded-archive
sources. Drive dynamic testing against the user's own staging or an ephemeral preview environment of
their app (spun from their compose/Helm/preview-env tooling) registered with explicit, authenticated
scope. Keep every sample/vulnerable app out of the runtime and confine it to the benchmark harness
(6.J).

**For 6.B (detection) — emit findings from real detectors that carry evidence.**
- Static: AST/dataflow engines — CodeQL, Semgrep (taint mode), language taint tools (Pysa/Pyre for
  Python, CodeQL for JS/TS/Java/Go). Merge third-party results via SARIF.
- Dynamic BOLA/IDOR/broken-object-authorization (exactly what `F-001`/`F-002` are): differential
  authorization testing — drive the target with two or more authenticated identities across tenants
  and diff the responses (the Autorize / OWASP ZAP access-control methodology), seeded from an
  OpenAPI/GraphQL schema, a HAR capture, or a crawl, and confirmed by an idempotent, non-destructive
  replay.
- Surface mapping: real discovery — crawler + OpenAPI/Swagger + GraphQL introspection + route
  extraction (tree-sitter/Semgrep) producing an attack-surface model. Use ULID/UUIDv7 for IDs and the
  scanner's real `git rev-parse HEAD` for the revision.

**For 6.C (model/LLM) — put a real model behind the gateway, as planner not oracle.** Use a capable
frontier model with structured outputs/function-calling and RAG over the repository for grounding;
have it orchestrate the deterministic tools (scanner, proxy, fuzzer) while the sandbox proof — never
the model — renders the final verdict. Validate every model output against the zod schemas. Offer a
self-hosted/on-prem model path (vLLM, Ollama, or a licensed on-prem deployment) for air-gapped buyers.
Govern providers with the operator allowlist in §3; store keys in a real secret manager (Vault, cloud
secret managers, or Electron `safeStorage` on desktop).

**For 6.D (patch synthesis) — real automated program repair grounded in the actual code.** Localize
from the failing security test plus the taint path, generate a minimal candidate diff with the model,
and gate it on execution (the honest version of the two-stage proof). Lineage worth studying:
Getafix/SapFix and modern LLM-APR. When no candidate clears the gates, do not emit a stand-in module —
open a draft PR/issue carrying the finding and the reproduction test for a human. Route ownership from
CODEOWNERS → `git blame` → directory service (Okta/AD) and file work in Jira/Linear with real WIP
accounting.

**For 6.E (verification/proof) — the sandbox receives only inputs and produces the verdict itself.**
Red-team confirmation: replay the real HTTP/WS exchange against the target inside the sandbox and
assert on the real response and canary. Fix closure: materialize the real repo at the observed
revision, apply the candidate patch, and run the project's own detected test command plus the
generated security test. Harden against overfitting with mutation testing (Stryker/mutmut) and
property/metamorphic tests so a patch cannot pass by matching a single literal.

**For 6.F (git/PR) — apply and verify the real diff.** Apply the proposed unified diff with
`git apply --3way` (or a real patch library) against the cloned revision, then assert the resulting
`git diff` equals what was displayed and fail closed on reject. Resolve the real default branch via the
API, push a feature branch without force, and open the PR through the VCS App honoring branch
protection and required checks.

**For 6.G (sandbox/isolation) — ship a production isolation backend and name it truthfully.** Use
gVisor, Firecracker microVMs, or Kata Containers for strong isolation, or nsjail/bubblewrap +
seccomp-bpf + user namespaces + egress control for lighter confinement, with sandbox egress routed
through the existing policy proxy, and fail closed in strict mode. If LiteBox is genuinely wanted,
vendor a reproducible, pinned build and cache it in CI; otherwise drop the branding and make every
attestation and UI label reflect the real backend.

**For 6.H (credentials/secrets) — load real secrets at run time.** Fetch campaign credentials from a
real secret store (Vault / cloud secret manager; OIDC short-lived tokens where possible) and never
bake tokens. On desktop, implement OS-keychain storage via Electron `safeStorage`; remove the keychain
claim until it exists.

**For 6.I (UI affordances) — wire the advertised actions.** Implement real source-archive upload /
repo-connect feeding the scanner (size/type/AV checks, ephemeral storage), and populate the model
picker from the live allowlist/registry (6.C, §3).

**For 6.J (efficacy) — measure on real corpora and publish.** Stand up a reproducible benchmark
harness over NIST SARD/Juliet, OWASP Benchmark, WebGoat/Juice Shop/NodeGoat, curated real-CVE
reproductions, and a held-out set of labeled real repositories; report precision/recall/F1,
false-positive rate, mean-time-to-detect, and verified-patch-correctness, benchmarked against baselines
(Semgrep, CodeQL, Snyk, OWASP ZAP), and gate releases on those numbers.

### 6.L — Confirmed real at this commit (NOT part of the gap — keep)

For fairness and to scope the work, these subsystems execute real logic and should be preserved:

- Audit ledger: real SHA-256 hash-chained entries with a working `verifyIntegrity`
  (`packages/audit-ledger/src/index.ts:40-67`). Caveat: the running service never calls it on load and
  persisted rows are overwritable — see 4.8; the primitive is real but its guarantee is not enforced.
- SQLite persistence: real `node:sqlite` WAL store
  (`services/closed-loop-orchestrator/src/sqliteStore.ts`).
- Egress proxy: real L7 HTTP/WS proxy, real `fetch`/WebSocket forwarding, real token-bucket rate
  limiting and scope allowlist enforcement (`services/red-team/src/egressProxy.ts`). (Weakness is the
  self-signed key, GAP in §1.1 — not fakeness.)
- Sandbox runtime: real disposable sandbox, real `process-confined` execution, real recursive file
  erasure and SHA-256 teardown attestation (`packages/sandbox-runtime/src/index.ts`).
- Repository scanner: real regex/heuristic SAST over real files (shallow but genuinely executed,
  `services/defense-factory/src/repositoryScanner.ts`).
- Git packager mechanics: real `git` clone/commit/push and real GitHub PR API POST
  (`services/defense-factory/src/gitPackager.ts`) — the defect is GAP-18 (what it writes), not that it
  runs.
- UI data path: real API client + SSE subscription rendering real backend state, no embedded fake data
  (`apps/nightfall-ui/src/api/nightfall-client.ts`, `.../hooks/use-nightfall-workspace.ts`).
- CLI: real `validate` / `sign` / `status` / `verify-audit` (`apps/nightfall-cli/src/index.ts`).

### 6.M — Definition of done for "nothing mocked/faked/hardcoded"

The gap is closed when, for an arbitrary user-connected repository and target: findings come from real
analysis (6.B, 6.C), patches are synthesized for the real file and applied as shown (6.D, 6.F), proofs
run against the real checkout/target (6.E), credentials and sandbox isolation are real and honestly
labeled (6.G, 6.H), the UI affordances are wired (6.I), and efficacy is demonstrated on real corpora
(6.J) — with the 6.L subsystems retained.

---

## Priority order for remediation

1. Stop the destructive/unsafe paths: 2.1 (whole-file overwrite), 4.5 (unauthenticated safety
   controls), 1.1 (self-signed scope).
2. Make the premise true: 0.1–0.3, 2.2, 2.3, 3.1 (real offensive model behind the gateway).
3. Make it governable: 3.2 / 3.3 (trusted-vendor configuration page), 1.2–1.3 (honest verification).
4. Make it adoptable: 4.1, 4.2, 4.3, 4.4, 4.6; then the S3 polish items.
