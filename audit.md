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
  `services/closed-loop-orchestrator/src/sqliteStore.ts:3`) is not available on 22.0; it is
  experimental behind a flag until Node 24. `pnpm dev:api` throws on a compliant install.
- Required change: raise the floor to a version where `node:sqlite` is available/stable and document
  any required flags, or depend on a stable SQLite library.

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

---

## Priority order for remediation

1. Stop the destructive/unsafe paths: 2.1 (whole-file overwrite), 4.5 (unauthenticated safety
   controls), 1.1 (self-signed scope).
2. Make the premise true: 0.1–0.3, 2.2, 2.3, 3.1 (real offensive model behind the gateway).
3. Make it governable: 3.2 / 3.3 (trusted-vendor configuration page), 1.2–1.3 (honest verification).
4. Make it adoptable: 4.1, 4.2, 4.3, 4.4, 4.6; then the S3 polish items.
