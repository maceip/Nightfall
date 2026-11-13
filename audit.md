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

### 4.2 — S1 (fixed in this PR) — CI ran the test suite without building the toolchain it requires
- Correction: earlier drafts of this item said first that CI did not exist, then that LiteBox was
  unprovisionable. Both were wrong. `.github/workflows/desktop-debug-installers.yml` runs
  `pnpm typecheck` and `pnpm test` on push and pull request, and LiteBox builds from the pinned commit.
- Evidence: 9 tests in 6 files assert the LiteBox backend (`sandbox-runtime.test.ts:29,47,94`,
  `defenseFactory.test.ts:281`, `apiGateway.test.ts:38`, `orchestrator.test.ts:54`, `cli.test.ts:84`,
  `benchmarks.test.ts:283,366`), but the `verify` job never ran `infra/litebox/build-litebox.sh`, so
  the runtime fell back to `process-confined` and those tests failed on every run, including `main`.
  A second cause hid behind it: the script invoked `cargo` from outside the checkout and LiteBox
  tracks current stable Rust, so an older stable fails with `E0658` (`map_or_default`).
- Verified: with the toolchain built, all 44 tests in 15 files pass locally.
- Fix applied: the `verify` job now builds LiteBox (cached on the script hash) and checks the three
  binaries exist before testing; the script refreshes stable Rust and builds from inside the checkout;
  the README states the requirement.
- Still required: pin the Rust toolchain version and verify the built binaries by digest (5.5); decide
  whether contributors on macOS/Windows should get skipped LiteBox tests rather than failures.

### 4.3 — S1 — LiteBox isolation is real but partial, and its absence is silent
- Correction: an earlier draft said LiteBox never runs. It does: built from the pinned commit, Python
  workloads execute inside it and a host file read is blocked (`sandbox-runtime.test.ts:47-61`).
- Evidence of what remains:
  - The default mode `litebox-preferred` falls back to an ordinary child process with no warning when
    the binaries are missing (`packages/sandbox-runtime/src/index.ts:754-795`). That is every macOS
    and Windows desktop install and any Linux host that has not run the build script.
  - Node workloads are never run in LiteBox even when it is available (`isMultiThreadedV8Runtime`,
    `:358-361,754-759`), so every JavaScript/TypeScript two-stage proof and every Red Team replay
    script is `process-confined`; `git clone` is explicitly `process-confined`
    (`services/defense-factory/src/repositoryScanner.ts:654-665`).
  - The runner is invoked with `--unstable` (`:248`), and the build is not reproducible (floating
    stable Rust, no digest check).
  - A sandbox that never executed anything is attested as `microsoft-litebox` if the toolchain is
    merely present (`:826-830`).
- Required change: fail closed (or warn loudly in UI and attestation) when isolation is unavailable;
  isolate Node workloads by another real mechanism; state per platform and per language which backend
  actually ran; attest only what executed.

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
  the port, which the entrypoint binds to `0.0.0.0` (all interfaces), not loopback
  (`services/api-gateway/src/server.ts:22`).
- Required change: add authentication/authorization, scope CORS, and protect all policy/approval/
  kill-switch endpoints with an operator role.

### 4.6 — S2 — No durable, collision-free finding history
- Evidence: the orchestrator/CLI default to `:memory:` (`closed-loop-orchestrator/src/index.ts:181`),
  so any embedding using the default loses state on restart; the API server entrypoint does pass a
  durable path (`services/api-gateway/src/server.ts:7-9`), but non-unique finding IDs (1.4) still mean
  there is no reliable re-scannable history — the one thing a vulnerability-management platform must
  have.
- Required change: default to a durable DB path everywhere, make IDs unique, and support idempotent
  re-scan / finding-lifecycle updates.

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
  exists and the CLI uses it, but the running service never does. The same `ON CONFLICT(id) DO UPDATE`
  pattern is used by every table including `evidence_bundles` (`sqliteStore.ts:181-458`), so even the
  reproducible proof bundles can be silently overwritten; nothing is append-only or content-addressed.
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

### 4.12 — S2 — No schema versioning or migration path
- Evidence: `initSchema` runs `CREATE TABLE IF NOT EXISTS ...` with no `user_version`/migration framework
  (`services/closed-loop-orchestrator/src/sqliteStore.ts:49-121`). Any schema change against an existing
  durable DB silently diverges or breaks on upgrade.
- Required change: add a versioned migration system (tracked `user_version` + ordered migrations) before
  shipping a durable store to users.

### 4.13 — S2 — The "shared control plane" knowledge/work-queue is single-process in-memory
- Evidence: `SharedKnowledgeStore` holds all campaign queues, leases (30s TTL), and knowledge in a
  process-local `Map` (`packages/shared-memory/src/index.ts:55-65`). The TTL lease logic is real but
  per-process only, so the advertised cross-agent "Shared Knowledge graph & TTL-leased Work Queue" is
  neither shared across instances nor durable (reinforces 4.10).
- Required change: back the queue/knowledge/leases with a shared, durable store (DB or queue service)
  if multi-worker or HA operation is intended, or scope the "shared control plane" claim to single-process.

### 4.14 — S1 — Scan endpoint accepts arbitrary server paths and clone URLs
- Evidence: `triggerScan` forwards caller-supplied `localPath` and `cloneUrl` unchanged
  (`services/closed-loop-orchestrator/src/index.ts:749-759`); `RepositoryScanner.scanRepository` then
  walks any readable server-side directory or runs `git clone` against any endpoint
  (`services/defense-factory/src/repositoryScanner.ts:653-673`). With the API unauthenticated (4.5), a
  caller can read source from arbitrary filesystem trees via findings, or induce outbound Git
  connections to internal hosts.
- Required change: restrict local paths to an approved workspace root or a user-selected desktop
  handle, validate clone schemes/hosts against connected repositories, and never accept inline
  credentials — in addition to endpoint authorization.

### 4.15 — S1 — Electron navigation guard uses string-prefix matching
- Evidence: `will-navigate` allows any URL that `startsWith` the dev origin or `file://`
  (`apps/nightfall-ui/electron/main.ts:341-343`). `http://localhost:5173@attacker.example/` passes the
  prefix test, and any local HTML file is accepted; such content loads in the privileged window with
  the preload bridge and the embedded API.
- Required change: compare the parsed origin exactly in development and the exact packaged renderer
  path in production; validate IPC senders.

### 4.16 — S1 — Custom-CA trust bypasses hostname and validity checks
- Evidence: when a custom CA is configured, the verifier accepts any connection Chromium rejected if
  any certificate in the chain matches a configured fingerprint, without checking why it was rejected
  (`apps/nightfall-ui/electron/network-policy.ts:107-119`). A certificate from that CA for a different
  hostname, or an expired one, is accepted.
- Required change: add the CA as a trust anchor only; keep hostname, validity-period and chain
  verification, accepting solely the unknown-authority error.

### 4.17 — S2 — Live UI state misses new approvals and repositories
- Evidence: the SSE handler only updates approvals already in state and never inserts a new one
  (`apps/nightfall-ui/src/hooks/use-nightfall-workspace.ts:59-63`), so a campaign that pauses for
  approval shows no Approve/Reject card until reload. `triggerScan` returns no repository list and
  emits no repository event (`services/closed-loop-orchestrator/src/index.ts:871-875`), so a newly
  scanned local repository does not appear until reload.
- Required change: upsert unknown approvals from SSE; return or emit repository updates after scans.

---

## 5. Enterprise legitimacy and trust (what is required beyond "nothing faked")

Sections 0–4 and 6 are about making what exists real. This section lists what a respected, legitimate
enterprise security tool needs in addition — gaps that would remain even if every fabrication above
were replaced with a real implementation.

### 5.1 — S1 — There is no identity: every action is attributed to a hardcoded actor
- Evidence: approvals, kill-switch, campaign launch, coverage toggles and duplicate marking are
  recorded as `'security-operator'` / `'security-engineer'` / `'engineer'` string literals
  (`services/closed-loop-orchestrator/src/index.ts:908,1141,1211,1294,1302,1379,1389`;
  `packages/policy-gate/src/index.ts:225`; `services/defense-factory/src/defenseFactoryEngine.ts:701`).
  The audit trail cannot say which person approved a state-mutating probe or disengaged the
  kill-switch, and the approver is never distinguished from the requester.
- Required change: SSO/OIDC sign-in, the authenticated principal on every audit entry, role-based
  access control, and enforced separation of duties (the approver of a mutating action cannot be its
  requester; kill-switch reset requires a distinct role).

### 5.2 — S1 — No proof of authorization to test a target
- Evidence: `POST /api/red-team/campaigns/prepare` accepts any `targetUrl`
  (`services/api-gateway/src/index.ts:188-209`); on launch the orchestrator mints its own key and signs
  the scope itself (`services/closed-loop-orchestrator/src/index.ts:1186-1187`) and sends real requests
  to that host; the API is unauthenticated and bound to `0.0.0.0` (4.5). Anyone who can reach the port
  can direct probes at a third party's system, and nothing records that the target's owner consented.
- Required change: verify target ownership before any request is sent (DNS TXT record, well-known
  file, or a signed authorization from a named accountable person), require the scope to be signed by
  an authorized human-held key (1.1), and record rules of engagement and the legal basis per campaign.

### 5.3 — S1 — The tool stores the sensitive data it finds, in plaintext, with no retention policy
- Evidence: evidence bundles persist raw response bodies and, for the export finding, the full text
  of the leaked documents (`services/red-team/src/redTeamEngine.ts:580,588,759,768,783-785`) as
  plaintext JSON in SQLite (`services/closed-loop-orchestrator/src/sqliteStore.ts:369-393`). There is
  no redaction, no encryption at rest, no retention or deletion, and no per-tenant isolation. A tool
  that proves a data leak thereby becomes a second copy of the leaked data.
- Required change: minimize and redact evidence at capture (hashes and canary markers rather than
  payloads), encrypt at rest, define retention/deletion, restrict evidence access by role, and isolate
  tenants.

### 5.4 — S2 — Customer code and findings can be sent to third-party models with no governance
- See 3.2 / 3.3. Required in addition: a published subprocessor list, per-vendor data-processing
  terms, and a no-third-party (self-hosted model) mode for regulated customers.

### 5.5 — S2 — The tool's own supply chain is unprotected
- Evidence: the only pipeline builds unsigned debug installers (`CSC_IDENTITY_AUTO_DISCOVERY: 'false'`,
  `.github/workflows/desktop-debug-installers.yml:120,218`; macOS signing is opt-in via
  `NIGHTFALL_ENABLE_MAC_SIGN`, `apps/nightfall-ui/electron-builder.config.mjs:44-48`); the update feed
  is a placeholder `http://localhost:8081` (`electron-builder.config.mjs:362-366`); there is no SBOM,
  provenance attestation, or dependency-update/scanning configuration (no Dependabot/Renovate); and the
  sandbox toolchain is compiled from an upstream fetched at build time (`infra/litebox/Dockerfile.litebox`).
- Required change: a release pipeline that signs and notarizes installers, publishes an SBOM and
  provenance attestation, scans and updates dependencies, serves updates over HTTPS with signature
  verification, and pins/verifies third-party toolchains by digest.

### 5.6 — S2 — The deployment topology's isolation claim is not what executes
- See GAP-36: the "zero-egress runner pool" container is idle and sandboxed commands run in the API
  container with normal egress. Required: route real sandbox execution through an isolated network
  whose only exit is the policy proxy, and test that property.

### 5.7 — S2 — No observability or operability
- Evidence: no logging, metrics, or tracing dependency exists in any `package.json`; failures are
  swallowed silently in several places (`services/defense-factory/src/gitPackager.ts:258`,
  `packages/model-gateway/src/index.ts:225`); the API maps every non-"not found" error to HTTP 400
  (`services/api-gateway/src/index.ts:249-253`). An operator cannot tell that PR creation or a model
  call failed.
- Required change: structured logs with correlation IDs, metrics and health/readiness endpoints,
  surfaced (not swallowed) errors with correct status codes, backup/restore, and an upgrade path (4.12).

### 5.8 — S1 — Public claims that must be made true or withdrawn (claims register)

In security, being caught overclaiming costs more than under-claiming. Each row is a statement made
in `README.md`, `AGENTS.md`, `docs/`, or the UI, against what the code does at this commit.

| Claim | Reality | Reference |
| --- | --- | --- |
| "Isolated with Microsoft LiteBox" | True for Python on Linux with the toolchain built; Node workloads and other platforms are `process-confined`, silently | 4.3, GAP-20 |
| "Zero runtime mock fallbacks" | Findings, patches and model output are fixtures/fallbacks | §0, GAP-08, GAP-10 |
| "Confirm real weaknesses with reproducible `EvidenceBundle` proofs" | Two hardcoded findings; sandbox re-asserts host values | GAP-04, GAP-13 |
| "Ed25519-signed `campaign.yaml` enforces scope" | Self-signed by the runner; redirects not re-checked | 1.1, 1.7 |
| "Mandatory Two-Stage Test Proof + independent Critic gate" | Runs on fixtures; critic is a fallback value | GAP-15, GAP-08 |
| "Commits reviewable Git branches/PRs" | Whole-file overwrite differing from the shown diff | GAP-18 |
| "Re-test fixes post-deployment" | Nothing is merged; closure asserts precomputed booleans | 2.7, GAP-14 |
| "Ask-for-Approval HITL gate" | POST mutations bypass it; approved actions never run | 1.6, 1.8 |
| "<1s Kill-Switch" | Cannot abort in-flight requests; endpoint is unauthenticated | 1.9, 4.5 |
| "Append-only / Immutable hash-chained ledger" | Rows overwritable; chain never verified by the service | 4.8, GAP-32 |
| "Cross-agent Shared Knowledge graph & TTL-leased Work Queue" | Process-local `Map`, lost on crash | 4.10, 4.13 |
| "Routes work to code owners within WIP velocity caps" | Hardcoded owner table; cap never enforced | GAP-12, 2.8 |
| "Zero-egress Docker Compose network" | Idle container; real execution has egress | GAP-36 |
| "Scheduled / continuous monitoring" | One immediate scan plus a label | 4.9 |
| "OS Keychain" bridge | Not implemented | GAP-22 |
| "1-to-1 mapping of every wireframe control to real implementations" | Several controls are unwired or show false state | GAP-23, GAP-28, GAP-31, GAP-32, GAP-35 |

- Required change: reduce every public statement to what is true today, keep this register in the
  repository, and restore each claim only when its referenced gap is closed and tested.

### 5.9 — S2 — Efficacy is asserted, not measured
- See GAP-25 and 6.K (6.J). Required in addition: publish detection-rate, false-positive rate and
  verified-patch-correctness numbers with methodology, and commit to a false-positive ceiling before
  any automated patching is enabled on customer repositories.

### 5.10 — S3 — Trust artifacts are absent
- Evidence: no `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, vulnerability-disclosure policy, or
  `security.txt` (4.1).
- Required change: add them; define a responsible-disclosure policy for vulnerabilities the tool finds
  in third-party software; commission an independent security assessment of the tool; and plan the
  compliance posture regulated buyers require (SOC 2 / ISO 27001, DPA).

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

### 6.G — Sandbox / Microsoft LiteBox (isolation is partial and silently absent)

- **GAP-20 — S1 — LiteBox isolation is claimed universally but applies to a subset.** Corrected: the
  toolchain builds and Python workloads do run inside LiteBox. The gap is that README, settings copy
  and fix subtitles present it as the isolation for everything, while Node/TypeScript proofs, Red Team
  replay scripts and `git clone` always run `process-confined`, and all workloads do on macOS, Windows
  or any host without the built binaries — silently (see 4.3). Real-state: fail closed or disclose the
  backend per run, and give non-Python workloads real isolation.
- **GAP-36 — S1 — The "zero-egress LiteBox runner pool" is an idle container.** The compose file
  declares `litebox-sandbox-runner` on an `internal: true` network (`infra/deploy/docker-compose.yml:38-53`),
  but its image's command is `litebox_runner_linux_userland --help` (`infra/litebox/Dockerfile.litebox`,
  final `CMD`), no code dispatches work to it, and `DisposableSandboxRuntime` executes commands locally
  via `execFile` inside the `api-gateway` container, which is also attached to the non-internal
  `control_plane_net`. Sandboxed code therefore has ordinary network egress and does not traverse the
  policy proxy. Real-state: run sandbox workloads in the isolated network with the proxy as the only
  exit, and add a test proving a sandboxed process cannot reach the internet directly.

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
- **GAP-32 — S2 — Unconditional "verified" badges assert checks that never ran.** The audit screen shows
  `SHA-256 Chain Verified ✓` on an "Immutable Hash-Chained Audit Ledger" with no verification behind it
  (`apps/nightfall-ui/src/screens/defense-factory/scans-audit-screen.tsx:116-120`; the running service
  never calls `verifyIntegrity`, 4.8), and the fixes screen labels every proposal — suppressed ones
  included — "N verified fix proposal(s) active" (`fixes-screen.tsx:119-120`). Real-state: show
  integrity/verified state only from an actual check, and exclude suppressed/unverified items from
  "verified" counts.
- **GAP-33 — S3 — The campaign "budget remaining" bar is a synthetic function of request count.**
  `budgetRemainingPct` is hardcoded to 94 at bootstrap (GAP-03) and computed as `100 - totalHits*0.8` on
  launch (`services/closed-loop-orchestrator/src/index.ts:1258-1261`), not derived from real
  model/compute cost; the ModelGateway's real cost budget is never surfaced. Real-state: drive the budget
  display from actual cost/usage accounting.
- **GAP-35 — S2 — No UI path to connect a real remote repository.** The scanner backend accepts
  `cloneUrl`/`localPath` (`services/closed-loop-orchestrator/src/index.ts:749-759`), but `cloneUrl` is
  never referenced anywhere in the UI/client and there is no "add/connect repository" control, so cloud
  scans are confined to the five pre-materialized fixture repos; only desktop local-path mode reaches
  real user code. Real-state: a repo-connect / VCS-integration flow that feeds a real `cloneUrl`.

### 6.J — Efficacy is measured only against synthetic testbeds

- **GAP-25 — S2 — Benchmarks run on fabricated testbeds and a deliberately "defective" patch.**
  `benchmarks/testbeds/src/` defines synthetic documents and
  `DEFECTIVE_HARDCODED_PATCH_ASSET_EXPORT_MJS` (`assetExportFixture.ts:112-148`,
  `northstarTestbed.ts`). There is no measurement against real-world vulnerability corpora
  (OWASP Benchmark, real CVEs). Real-state: a reproducible efficacy suite over real datasets with
  published detection-rate / false-positive numbers.
- **GAP-34 — S2 — The test suite encodes and enforces the fakes.** Unit/integration/benchmark tests
  assert the fabricated outputs as correct: `confirmedFindings === ['F-001','F-002']`
  (`services/red-team/src/redTeam.test.ts:357`, `benchmarks/testbeds/src/benchmarks.test.ts:176`,
  `services/api-gateway/src/apiGateway.test.ts:190`), `sandboxBackend`/`backendUsed === 'microsoft-litebox'`
  (`defenseFactory.test.ts:281`, `sandbox-runtime.test.ts:52,57,61,99`, `apiGateway.test.ts:53`), and
  `finding.status === 'fixed'` after the no-op merge (`orchestrator.test.ts:133`,
  `benchmarks.test.ts:298,312`). The green path validates the fabrications, real behavior has no coverage,
  and the LiteBox assertions failed in CI until the toolchain build was added (4.2). Real-state: tests assert real discovery, an
  actually-available sandbox backend, and a real merge/verification outcome — closing the gaps requires
  rewriting the suite.

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
- Electron shell hardening: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
  `webSecurity: true` are genuinely set (`apps/nightfall-ui/electron/main.ts:284-287`), and the desktop
  proxy + custom-CA code (`electron/network-policy.ts`) is real. Caveats: the navigation guard and
  custom-CA verifier have real defects (4.15, 4.16), and egress defaults to
  `direct` with no restriction unless a proxy is configured, so the "zero-egress" posture is
  deployment-specific, not a desktop default.
- Repository scanner reach: `triggerScan`/`scanRepository` genuinely accept `cloneUrl`/`localPath` and
  run the real SAST over real files — the limitation is UI-only (GAP-35), not the engine.

### 6.M — Definition of done for "nothing mocked/faked/hardcoded"

The gap is closed when, for an arbitrary user-connected repository and target: findings come from real
analysis (6.B, 6.C), patches are synthesized for the real file and applied as shown (6.D, 6.F), proofs
run against the real checkout/target (6.E), credentials and sandbox isolation are real and honestly
labeled (6.G, 6.H), the UI affordances are wired (6.I), and efficacy is demonstrated on real corpora
(6.J) — with the 6.L subsystems retained.

### 6.N — Coverage of this sweep

This audit reviewed the entire repository at `7273506`/HEAD: every service (`red-team`,
`defense-factory`, `closed-loop-orchestrator`, `api-gateway`), every shared package
(`sandbox-runtime`, `policy-gate`, `model-gateway`, `audit-ledger`, `shared-memory`, `core-contracts`,
`ui-kit`), persistence (`sqliteStore`), the Electron shell (`main.ts`, `network-policy.ts`,
`preload.ts`), the web UI data path and screens, the CLI, `infra/litebox`, and the benchmark and test
suites. Items not raised were checked and found acceptable: `core-contracts` `.default()` uses are
benign, `ingestAssessmentResult` is honest plumbing, the `campaign-detail-panels` "confirmed" badge is
properly conditional, and the `ui-kit` visualizations carry no hardcoded sample data. The gap list
(36 GAPs plus the §1–§5 required-changes) is intended to be complete as of this commit; new findings
from ongoing automated review are verified and folded in as they arrive.

---

## 7. Enterprise capability extension (what makes it useful and best in breed)

Sections 0–6 close the gap to "real and trustworthy." This section lists capabilities that do not
exist in any form at this commit and that an enterprise would need for the product to be useful in
practice and competitive. "Today" states what the code has; "Needed" is the best-in-class target.

### 7.1 Coverage breadth
- **Languages and rules.** Today: six regex rule families over `.py/.ts/.tsx/.js/.mjs/.cjs/.go`
  (`services/defense-factory/src/repositoryScanner.ts:19-27,357-625`). Needed: Java, C#, Kotlin, Ruby,
  PHP, Rust, C/C++ plus framework-aware rules (Spring, Django, Rails, Express, ASP.NET), with a
  customer-authorable rule language and per-rule precision data.
- **Finding classes beyond first-party code.** Today: none. Needed: dependency (SCA) analysis with
  reachability, secret detection with validity checks, infrastructure-as-code and container image
  scanning, and API-spec conformance — so one platform covers what buyers otherwise assemble from four.
- **Dynamic testing depth.** Today: three scripted probes. Needed: authenticated crawling with login
  recording (SSO, OAuth, MFA, session refresh), OpenAPI/GraphQL/gRPC-driven testing, the OWASP API
  Top 10 classes (object- and function-level authorization, mass assignment, SSRF, injection), and
  business-logic testing across multiple roles and tenants.

### 7.2 Workflow integration
- **Source control.** Today: one raw GitHub REST call with a personal token
  (`services/defense-factory/src/gitPackager.ts:221-260`). Needed: first-class GitHub App, GitLab,
  Bitbucket and Azure DevOps integrations with PR checks, inline review comments, CODEOWNERS routing,
  and branch-protection awareness.
- **CI/CD gating.** Today: none. Needed: a CI action/CLI that fails builds on policy violations,
  diff-aware scanning of changed code only, and baseline suppression so adoption does not start with
  thousands of legacy findings.
- **Ticketing and chat.** Today: none. Needed: bidirectional Jira/ServiceNow/Linear sync and
  Slack/Teams notifications and approvals, so the human-approval gate reaches people where they work.
- **Interchange.** Today: none. Needed: SARIF import/export, ingestion of third-party scanner output
  for deduplication and verification, and a documented REST/GraphQL API with webhooks and SDKs.
- **Developer surface.** Today: a desktop app and a four-command CLI. Needed: IDE extensions and
  pre-commit hooks so findings and fixes appear before code is pushed.

### 7.3 Risk prioritization and program management
- **Prioritization.** Today: a static severity per rule. Needed: risk scoring that combines
  exploitability evidence (the Red Team confirmation is the differentiator here), reachability,
  internet exposure, asset criticality, data sensitivity, and external signals (EPSS, CISA KEV).
- **Asset inventory.** Today: a flat repository list. Needed: applications, services, owners,
  environments and business units, with repository-to-deployed-service mapping.
- **SLA and exceptions.** Today: none. Needed: remediation SLAs by severity, breach alerts,
  time-boxed risk acceptance with approver and expiry, and false-positive feedback that tunes rules.
- **Reporting.** Today: one overview screen. Needed: trend and mean-time-to-remediate dashboards by
  team, executive and auditor reports, and control mapping to SOC 2, ISO 27001, PCI DSS, NIST SSDF and
  OWASP ASVS, exportable as evidence.

### 7.4 Remediation quality
- Today: fixture patches (GAP-10). Needed beyond making them real: multi-file and cross-service
  fixes, dependency upgrade PRs with breaking-change analysis, fix grouping by root cause across
  repositories, respect for each repository's style, tests and commit conventions, a measured
  fix-acceptance rate, and automatic rollback of a merged fix if post-deploy verification regresses.

### 7.5 Safe offensive operation at scale
- Today: one in-process assessment against one target. Needed: environment classes with different
  permitted risk tiers (production read-only vs. staging mutating), maintenance windows and blackout
  periods, per-target rate and concurrency budgets, automatic test-data cleanup, tamper-evident
  replayable evidence, and continuous re-verification of previously fixed findings on every deploy.

### 7.6 Architecture for scale and availability
- Today: a single Node process with one SQLite file and in-memory queues (4.10, 4.13). Needed: a
  horizontally scalable control plane on a server database (PostgreSQL), a durable job queue with
  isolated worker pools, incremental and cached scanning for monorepos, multi-tenant isolation with
  org/team hierarchy and quotas, high availability, backup and disaster recovery with stated
  recovery objectives, and published performance figures (scan time per 100k lines).

### 7.7 Deployment and administration
- Today: a developer compose file and debug installers. Needed: SaaS, self-hosted (Helm chart,
  Terraform modules) and air-gapped deployment options; customer-managed encryption keys; regional
  data residency; SCIM user provisioning alongside SSO (5.1); fine-grained custom roles; audit-log
  streaming to SIEM (Splunk, Sentinel, Datadog); and admin policy-as-code for scan, approval and
  model-vendor rules (3.2).

### 7.8 Commercial readiness
- Today: none. Needed: usage metering and license enforcement, versioned releases with a changelog
  and deprecation policy, upgrade and migration tooling (4.12), documentation and onboarding that
  reaches first verified finding in under an hour, support tiers with response SLAs, and a public
  status page and security advisory process.

### 7.9 Where to be best in breed rather than at parity
The defensible differentiator is the closed loop itself, once real: a finding that arrives already
proven exploitable in the customer's staging environment, with a patch already proven by a
failing-then-passing test, and re-verified after deploy. Most of 7.1–7.8 is parity with existing
scanners; investment should favor (a) verified-exploitability evidence as the prioritization signal,
(b) measured, published fix-acceptance and false-positive rates, and (c) the safety model for
autonomous testing (5.1, 5.2, 7.5), because that is what lets an enterprise permit the tool to act.

---

## 8. UI/UX gaps (assuming Sections 0–7 are resolved)

This section assumes every backend, safety and enterprise gap above is fixed. What remains are places
where the interface itself would confuse or mislead a user, and capabilities that would complete the
user story. Keyboard navigation, screen-reader behavior and color contrast were not assessed and need
a dedicated accessibility review.

### 8.1 Where a user would be confused
- **UX-01 — Three competing navigation systems.** An icon rail, a row of top "tabs", and a sidebar
  offer overlapping, inconsistent destinations (`apps/nightfall-ui/src/components/three-column-shell.tsx:99-114,196-240`).
  The top tabs look like browser tabs but are three fixed links, with `campaign.yaml` placed as a peer
  of the two products. Needed: one primary navigation model with one place for each destination.
- **UX-02 — Dead and decorative controls.** The rail "More" button has no action (`:104`), Forward is
  permanently disabled (`:150`), and in the browser the header draws fake window-control dots
  (`:140-146`). Needed: remove or implement.
- **UX-03 — Nothing is addressable.** All location state is React state (`apps/nightfall-ui/src/App.tsx:31-39`); a
  refresh loses the user's place and a finding, fix or campaign cannot be linked to. Needed: URL
  routing and shareable deep links.
- **UX-04 — One finding, two identities and two pages.** Red Team findings (`F-…`) open in a "finding
  report" and scanner findings (`SEC-…`) in "finding detail"
  (`apps/nightfall-ui/src/screens/red-team/finding-report-screen.tsx`, `apps/nightfall-ui/src/screens/defense-factory/finding-detail-screen.tsx`).
  Needed: one finding object, one ID scheme, one page.
- **UX-05 — The global repository filter filters one screen.** The selector is shown on every
  Defense Factory section (`three-column-shell.tsx:259`) but its value reaches only the Findings screen
  (`App.tsx:149`). Needed: apply it everywhere it is shown, or show it only where it applies.
- **UX-06 — Status indicators that are not derived from status.** The campaign pill reads
  "In progress" unless the kill-switch is engaged, even when the campaign is completed or paused
  (`apps/nightfall-ui/src/screens/red-team/live-campaign-screen.tsx:101`); the headline dot is always green (`:127`);
  "Updated just now" is a stored string that never ages
  (`services/closed-loop-orchestrator/src/index.ts:528,1178`). Needed: render state and relative time
  from the real status and timestamp.
- **UX-07 — Only one campaign is reachable.** Red Team always opens the first campaign
  (`App.tsx:47`); there is no list, history or comparison. Needed: a campaigns index.
- **UX-08 — Architecture used as interface language.** "Parallel Agent Hypothesis Lease Queue",
  "Persistent Cross-Agent Shared Memory", "HITL Approval Required (TIER_2_STATE_MUTATING)"
  (`apps/nightfall-ui/src/screens/red-team/campaign-detail-panels.tsx:95,112,117`), "Live API + SSE"
  (`three-column-shell.tsx`). Needed: task language ("Needs your approval", "What we tested",
  "What we ruled out").
- **UX-09 — No first-run experience.** The app opens on Findings (`App.tsx:31`) with no path from
  connecting a repository to a first verified result. Needed: guided onboarding and useful empty states.

### 8.2 Where a user would be led astray
- **UX-10 — Consequential actions are one click, with no confirmation or undo.** The kill-switch and
  its reset fire immediately, and its label says "Halt Sandboxes" while it halts campaigns
  (`three-column-shell.tsx:184-187`); "Mark as duplicate" discards a finding with no choice of which
  finding it duplicates (`:279`); "Merge & Verify Fix" merges immediately
  (`apps/nightfall-ui/src/screens/defense-factory/fix-drawer.tsx:170-185`). Needed: confirmation scaled to consequence,
  undo for triage, accurate labels.
- **UX-11 — A fix can be merged without its diff being seen.** The diff is hidden behind a "Review
  changes" toggle next to the merge button (`fix-drawer.tsx:161-185`). Needed: show the diff, the
  failing-then-passing test and regression results by default; make merge a deliberate second step.
- **UX-12 — Navigation starts work as a side effect.** "Promote to Defense Factory" both navigates and
  begins generating a fix (`App.tsx:256-260`). Needed: separate "view" from "start".
- **UX-13 — Approvals are buried and under-explained.** A paused campaign shows only "(1 gate)" on its
  third tab (`live-campaign-screen.tsx:116`); the card shows a method and URL but not what will change,
  how to reverse it, who asked, or when it expires (`campaign-detail-panels.tsx:90-108`). Needed: a
  global approvals inbox with consequence, requester and expiry.
- **UX-14 — Scope is authored as free text.** The most safety-critical input is a raw YAML textarea
  (`apps/nightfall-ui/src/screens/red-team/campaign-yaml-screen.tsx:104`) with no inline validation, plain-language
  summary, or preview. Needed: a structured scope builder with a dry-run listing the requests that
  would be sent.
- **UX-15 — Long operations give no feedback.** Launching a campaign awaits the entire assessment
  (`App.tsx:223-227`) with no progress, partial results or cancel; errors surface as one dismissible
  line of raw text (`App.tsx:122-127`). Needed: asynchronous jobs with progress and cancel, and
  actionable error messages.

### 8.3 Capabilities that would complete the user story
1. **One finding with a visible lifecycle** — detected, confirmed exploitable, fix proposed, merged,
   re-verified — with the evidence for each step on a single page. This is the product's
   differentiator and is currently split across two products and a drawer.
2. **Evidence a non-specialist can follow** — a replayable view of request, response and "what should
   have happened", answering "why is this real?".
3. **Role-based home screens** — developer ("my findings and fixes"), security lead (triage queues and
   SLAs), executive (trend and exposure).
4. **Campaign history and comparison** — what changed since the last run, what regressed, what was
   newly covered.
5. **Triage at scale** — bulk actions, saved views, global search, a command palette, and "what
   changed since my last visit".
6. **Honest uncertainty** — show confidence and what was not tested, so "no findings" is not read as
   "secure".
7. **Notifications** — in-app and external alerts for approvals, completed campaigns and failed
   verifications.

---

## 9. Verification: how to prove each gap is actually closed

A gap is closed only when a test that fails on today's code passes on the fixed code, and cannot be
satisfied by the fixtures. The existing suite cannot serve this purpose (GAP-34).

### 9.1 Rules every acceptance test must follow
1. **Red first.** Commit the test before the fix and record it failing against commit `7273506`. A
   test that passes on today's code proves nothing.
2. **Unseen inputs.** Use repositories, targets, file names, identifiers and secrets generated at
   test time (randomized names and values). Nothing under test may contain `northstar`, `F-001`,
   `F-002`, `NS-7b64c9e2`, `search_exports`, `collab`, or any other fixture token.
3. **Negative control.** Every test that asserts "X is detected / blocked / verified" has a twin that
   asserts the clean or permitted case is not flagged.
4. **Observe from outside.** Assert on effects another system can see — bytes on the wire at the
   target, the diff in the Git remote, rows in the database after restart — not on the product's own
   return values or status fields.
5. **Mutation check.** Deliberately break the fix (remove the guard, hardcode the answer) and confirm
   the test goes red. Run a mutation tool (Stryker) on safety-critical modules.
6. **In CI, required.** Each test runs on every PR as a required check and is linked from the gap ID.

### 9.2 Repository-wide tripwires (cheap, catch regressions to fakery)
- A CI grep that fails if runtime source (non-test) contains fixture tokens, literal finding IDs, or
  hardcoded actor names (`security-operator`).
- A CI check that no runtime module imports from `pythonFixtures`, `stagingTargetServer`, or
  `benchmarks/`.
- A boot test: a fresh instance with an empty database reports zero repositories, findings, fixes and
  campaigns (closes GAP-01, GAP-03).

### 9.3 Acceptance tests by gap

| Gaps | Test that proves the fix | Negative control |
| --- | --- | --- |
| GAP-04, 05, 06; 0.1, 1.5 (real detection) | Generate a small service with a randomly named endpoint and a seeded cross-tenant access flaw; the campaign reports it with the correct endpoint and a unique ID. Repeat with a different seed; IDs differ. | Same service with the check present: no finding. |
| GAP-08, 3.1 (real model) | With the model provider stubbed to return a distinct marker, the marker appears in the output; with the provider failing, the run is labeled degraded, not silently "complete". | Unknown model ID is rejected at configuration time. |
| GAP-09, 3.2, 3.3 (vendor governance) | A request to a provider not on the allowlist is refused and audited; a recording proxy confirms no bytes left the process. | Allowlisted provider succeeds. |
| GAP-10, 11, 2.2 (real patches) | For a generated vulnerable file never seen before, the proposed patch applies to that file and its generated security test goes fail → pass. For an unfixable case, the result is "cannot auto-fix", never a stand-in. | Patch for file A does not apply to unrelated file B. |
| GAP-18, 2.1 (diff equals commit) | After packaging, `git diff base..branch` on the remote is byte-identical to the displayed diff, and all lines outside the hunk are unchanged. | A diff that does not apply fails loudly and commits nothing. |
| GAP-27, 2.7 (real merge) | After "merge", the default branch on the remote contains the commit; with the merge blocked by branch protection, status stays unmerged and the finding stays open. | — |
| GAP-13, 14, 15; 1.2 (real proofs) | Tamper test: make the target or patched code wrong after the host computed its result; the sandbox verdict must flip to failed. | Untampered run passes. |
| GAP-16 (overfitting) | A patch that special-cases the test's literal input is rejected; metamorphic variants of the exploit still fail closed. | A structural fix is accepted. |
| GAP-17 (follow-up) | A follow-up that requests a specific change produces that change in the commit, and a follow-up that breaks the tests results in failed gates. | — |
| 1.1, 5.2 (scope authority) | A manifest signed by an unpinned key is refused; a target with no ownership proof is refused before any packet is sent (assert at a listener on the target). | Pinned key and verified target proceed. |
| 1.6, 1.8, GAP-30 (approvals) | A mutating request does not reach the target until approved (assert at the target); after approval it arrives exactly once; after rejection never. | Read-only request needs no approval. |
| 1.7 (redirects) | An in-scope target that redirects to an out-of-scope listener: the listener receives zero requests. | In-scope redirect is followed and re-checked. |
| 1.9, 4.5 (kill switch, auth) | A target that never completes its response: engaging the kill switch closes the connection within the stated bound; unauthenticated calls to kill-switch and approval endpoints return 401; API is not reachable on a non-loopback interface by default. | Authorized operator succeeds. |
| 4.14 (scan inputs) | `localPath` outside the approved root and `cloneUrl` to an internal address are refused; a canary file outside the root never appears in findings. | Path inside the root scans. |
| 4.15, 4.16 (Electron) | Navigation to `http://localhost:5173@evil.test/` and to an arbitrary `file://` page is blocked; a certificate from the custom CA for the wrong hostname or expired is rejected. | Exact origin and valid certificate pass. |
| 4.8, GAP-32 (ledger) | Modify one persisted audit row and restart: the service refuses to start or serves a visible integrity failure, and the UI badge is not "verified". | Untouched ledger verifies. |
| 4.6, 4.10, 4.12, 4.13 (durability) | Kill the process mid-campaign and restart: queue, leases, findings and approvals are intact; open a database from the previous schema version: it migrates. | — |
| 4.9, GAP-26 (schedules) | With a fake clock advanced past the schedule, a scan runs without user action; disabling the schedule stops it. | — |
| GAP-29 (duplicates) | Marking duplicate without choosing an existing finding is refused; no `SEC-CANONICAL` ever appears. | Valid canonical accepted, and reversible. |
| GAP-20, 36; 4.3, 5.6 (isolation) | From inside a sandboxed job: reading a host canary file fails and a direct internet connection fails; with isolation unavailable, strict mode refuses to run and the attestation names the real backend. Run for Python and Node workloads. | Permitted in-sandbox file read succeeds. |
| GAP-21, 22; 5.3 (secrets, evidence) | Credentials come from the secret store (rotating the secret changes behavior without a code change); a planted sensitive string in a target response is absent from the database file on disk. | — |
| 5.1 (identity) | Every audit entry carries the authenticated user; the requester of a mutating action cannot approve it. | A different authorized approver can. |
| 2.8, GAP-12 (routing) | With a team at its cap, a new proposal is deferred; owners resolve from a generated CODEOWNERS file. | Under the cap, proposal is created. |
| GAP-23, 24, 28, 31, 35; 4.17; Section 8 (UI) | Browser end-to-end tests: connect a new repository by URL; a suppressed fix shows no "verified" text and no enabled merge; a new approval appears without reload; evidence download returns a file. | — |
| GAP-25, 5.9 (efficacy) | Benchmark job publishes precision, recall and false-positive rate on real corpora each release and fails the release if they fall below the committed thresholds. | — |
| 5.8 (claims) | Each row of the claims register links to the passing test above; a claim may be restored in the README only in the same change that turns its test green. | — |

### 9.4 Independent confirmation
Tests written by the people who wrote the fix share their blind spots. For the safety-critical rows
(scope, approvals, kill switch, isolation, diff-equals-commit, merge), have someone who did not write
the fix attempt to defeat it, and commission an external assessment before any claim in 5.8 is
restored publicly.

---

## 10. Second-pass review: fundamentals the first passes missed

After Section 9 exposed that the audit had no verification criteria, the document was re-checked
against what any audit of an autonomous security tool must cover, rather than against what the code
happened to show. These were missing.

### 10.1 — S1 — The tool's own threat model: everything it reads is attacker-controlled
Nightfall ingests repositories, target responses and engineer messages, and will feed them to a model
that proposes code and actions. None of Sections 0–9 treat that input as hostile.
- **Prompt injection.** Model prompts are built by string-concatenating untrusted content: the diff
  (`services/defense-factory/src/defenseFactoryEngine.ts:363`), the engineer's message (`:645`) and
  the target URL (`services/red-team/src/redTeamEngine.ts:387`). Today no model reads them (GAP-08);
  the moment one does, text in a repository or a target response can instruct it to approve a bad
  patch, exfiltrate source, or widen scope. Needed: treat all ingested content as data, never
  instructions; constrain model output to schemas; keep every safety decision (scope, approval,
  merge, critic verdict) in deterministic code the model cannot influence; red-team the product with
  injection payloads planted in repos and responses.
- **Hostile targets.** A target can return non-JSON or huge bodies. Responses are parsed with
  unguarded `JSON.parse` (`redTeamEngine.ts:529,691,707,710,1053-1121`) and read fully into memory
  (`services/red-team/src/egressProxy.ts:580`), so one malformed response aborts the whole campaign
  and an unbounded one exhausts memory. Needed: size limits, tolerant parsing, per-probe failure
  isolation.
- **Hostile repositories.** The scanner reads every matching file whole with no size or count limit
  (`services/defense-factory/src/repositoryScanner.ts:713`), and the real-state design runs a
  repository's own tests — arbitrary code execution by design. Needed: resource limits, and strong
  isolation as a precondition for running any repository code (4.3, GAP-36).
- **Malicious or mistaken fixes.** An automated patch can introduce a vulnerability or a backdoor
  while passing its tests. Needed: mandatory human review, patch scanning by the same detectors,
  provenance on every generated change, and no auto-merge on protected branches.

### 10.2 — S2 — Probes leave state behind in the target
- Evidence: every campaign and every fix verification creates saved searches in the target and never
  deletes them (`redTeamEngine.ts:679,1068,1098`). "Non-destructive" is claimed but nothing cleans up.
- Needed: track every object a probe creates and remove it, tag test data, and report residue.

### 10.3 — S2 — Concurrency is unconsidered
- Evidence: scan IDs are computed before an awaited scan and written after it
  (`services/closed-loop-orchestrator/src/index.ts:747-759`), so two concurrent scans allocate the
  same `SEC-` numbers and overwrite each other; all writes are un-transacted upserts; one shared
  kill-switch and policy gate serve every campaign. Nothing has been tested with two users or two
  jobs at once.
- Needed: database-allocated IDs, transactions, per-campaign controls, and concurrency tests.

### 10.4 — S3 — A persistent device identifier is exposed to page content
- Evidence: a device ID is computed and placed on `window` (`apps/nightfall-ui/electron/main.ts:271,290`;
  `electron/preload.ts:49,82`) with no stated purpose, consent or retention.
- Needed: document its use or remove it.

### 10.5 — Planning information the audit lacked
- **Dependencies.** Several gaps cannot be closed in isolation: real proofs (GAP-15) and running
  repository tests require real isolation (4.3, GAP-36) first; any model integration (3.1) requires
  10.1 and vendor governance (3.2) first; restoring public claims (5.8) requires Section 9 tests.
- **A minimum credible product.** The smallest honest release is: connect one real repository, run
  the real scanner, show findings with real code references, propose nothing automatically, claim
  nothing about isolation or verification. Everything else is added only with its Section 9 test.
- **Not estimated.** This audit gives no effort or cost figures; those need the team's input.

---

## 11. Confidence and limits of this audit

This audit has been wrong three times and corrected each time: it said CI did not exist, then that
LiteBox could not be built, then that LiteBox never ran. Each error came from inferring instead of
running. Readers should weigh the findings accordingly.

- **Verified by execution:** the test suite (9 failures without LiteBox, 44/44 with it, locally); the
  LiteBox build from the pinned commit; the CI failure logs.
- **Verified by reading code only, not by exploitation:** every other finding, including the
  security defects (redirect scope escape, approval bypass, navigation guard, custom-CA verifier,
  arbitrary scan paths). Each is a reading of the cited lines and should be confirmed with the
  Section 9 test before being relied on.
- **Not examined:** the built desktop application on macOS or Windows, the Docker Compose stack
  running, accessibility, performance under load, and the `ui-kit` components beyond a search for
  embedded data. Only some UI screens were read in full; the rest were searched.
- **External review:** three rounds of automated review raised 20 findings; 19 were confirmed against
  the code and included, one was already addressed; that reviewer then reached its usage limit, so the last four sections
  have had no second reviewer.
- **Line references** are to commit `7273506` and will drift.

---

## Priority order for remediation

1. Stop the destructive/unsafe paths: 2.1 (whole-file overwrite), 4.5 (unauthenticated safety
   controls), 1.1 (self-signed scope).
2. Make the premise true: 0.1–0.3, 2.2, 2.3, 3.1 (real offensive model behind the gateway).
3. Make it governable: 3.2 / 3.3 (trusted-vendor configuration page), 1.2–1.3 (honest verification).
4. Make it adoptable: 4.1, 4.2, 4.3, 4.4, 4.6; then the S3 polish items.
5. Make it trustworthy: 5.8 first (withdraw untrue claims immediately — it costs nothing and removes
   the largest reputational risk), then 5.1–5.3 (identity, authorization to test, evidence handling),
   then 5.5–5.7 and 5.9–5.10.
Throughout: no item is closed until its Section 9 test is red on `7273506` and green on the fix.
6. Make it usable: 8.2 first (UX-10 to UX-15 can cause harm), then 8.1, then 8.3.
