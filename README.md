# Nightfall

**Nightfall** is a unified, closed-loop application security platform combining two autonomous subprojects inside a native-style three-column **Electron + Web** workspace built on the repo-wide **`webclaw` Design System** and isolated with **Microsoft LiteBox**:

1. **Nightfall Red Team (`services/red-team`)** — Automated Application Security Assessment Platform. Combines source-archive/repository code intelligence with live, scope-enforced HTTP and WebSocket dynamic verification (`campaign.yaml` v5) routed through the **L7 Egress Policy Proxy** and isolated inside **Microsoft LiteBox (`microsoft/litebox`)** sandboxes to confirm real weaknesses with reproducible `EvidenceBundle` proofs, discard unreachable static false positives, and re-test fixes post-deployment.
2. **Nightfall Defense Factory (`services/defense-factory`)** — Continuous Vulnerability Remediation Platform. Scans real repositories and local workspaces (`RepositoryScanner`), deduplicates findings by root cause (`RootCauseDeduplicator`), routes work items to code owners within WIP velocity caps, synthesizes minimal patches verified by a mandatory **Two-Stage Test Proof** (`Red` failing reproduction test → `Green` minimal patch + full regression suite + independent Critic gate) inside **Microsoft LiteBox**, and commits reviewable Git branches/PRs (`GitPatchPackager`).
3. **Nightfall Three-Column Desktop & Web UI (`packages/ui-kit` + `apps/nightfall-ui`)** — Modular React 19 + TypeScript + Vite renderer built exclusively from `@nightfall/ui-kit` (`webclaw` `oklch` design tokens, `@base-ui/react` primitives, `@hugeicons/react` icons, `PromptInput`, interactive 3-stage `SankeyDiagram`, and `UnifiedDiffViewer`), wrapped in a hardened `hiddenInset` Electron shell (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`) and backed by durable `node:sqlite` (`WAL`) persistence with zero runtime mock fallbacks.

---

## Monorepo Architecture

```text
Nightfall/
├── apps/
│   ├── nightfall-ui/                # Modular (<300 LOC/file) Electron + Web UI consuming @nightfall/ui-kit
│   └── nightfall-cli/               # CLI for campaign.yaml signing/validation, scans & audit checks
├── packages/
│   ├── core-contracts/              # Zod/TS schemas: CampaignYamlV5, Ed25519 ScopeManifest, Finding, Fix
│   ├── ui-kit/                      # Repo-wide webclaw Design System (@base-ui/react, @hugeicons/react, oklch tokens)
│   ├── sandbox-runtime/             # Microsoft LiteBox Library OS runtime + SHA-256 TeardownAttestation
│   ├── policy-gate/                 # Risk-tier evaluator, Ask-for-Approval HITL gate & <1s Kill-Switch
│   ├── shared-memory/               # Cross-agent Shared Knowledge graph & TTL-leased Work Queue
│   ├── audit-ledger/                # Append-only SHA-256 hash-chained ledger & Safety Monitor status
│   └── model-gateway/               # Provider-agnostic model router & cost-budget circuit breaker
├── services/
│   ├── api-gateway/                 # Live Node HTTP + SSE streaming BFF (:4000) + staging target (:4010)
│   ├── red-team/                    # Campaign compiler, L7 HTTP+WS Egress Policy Proxy & live verifier agents
│   ├── defense-factory/             # Real RepositoryScanner, LiteBox 2-stage proof & GitPatchPackager
│   └── closed-loop-orchestrator/    # Durable node:sqlite (WAL) closed-loop state machine
├── benchmarks/
│   └── testbeds/                    # Live local multi-tenant staging target & Microsoft LiteBox E2E suites
└── infra/
    ├── litebox/                     # build-litebox.sh & multi-stage Dockerfile.litebox (microsoft/litebox)
    └── deploy/                      # Zero-egress Docker Compose network & persistent SQLite volume
```

---

## Quickstart

```bash
# Optional: build/update Microsoft LiteBox (litebox_runner_linux_userland, litebox_packager, litebox_syscall_rewriter)
./infra/litebox/build-litebox.sh

# Install workspace dependencies
pnpm install

# Run full TypeScript check and Vitest suite across all packages, services, UI & E2E benchmarks
pnpm typecheck
pnpm test

# Start the live REST + SSE API Gateway (:4000) + local staging target (:4010)
pnpm dev:api

# Start the Nightfall Web UI (:5173)
pnpm dev:web

# Launch the native hiddenInset Electron shell (on macOS/Windows/Linux workstations)
pnpm dev:desktop

# Package debug/preview Electron installers (.dmg on macOS, WiX .msi on Windows)
NIGHTFALL_DEBUG_BUILD=1 NIGHTFALL_PREVIEW_IDENTITY=1 pnpm bundle:desktop:dmg
NIGHTFALL_DEBUG_BUILD=1 NIGHTFALL_PREVIEW_IDENTITY=1 pnpm bundle:desktop:msi
```

---

## Documentation & Governance

- [AGENTS.md](./AGENTS.md) — Repo-wide zero-mock rules, `@nightfall/ui-kit` design-system mandate, `<320 LOC` ceiling, and `Nightfall` nomenclature rules
- [docs/BUILD_PLAN.md](./docs/BUILD_PLAN.md) — Architectural specification, Microsoft LiteBox sandbox design, safety invariants, and closed-loop state machine
- [docs/WIREFRAME_CAPABILITY_MAPPING.md](./docs/WIREFRAME_CAPABILITY_MAPPING.md) — 1-to-1 mapping of every wireframe screen & control to real `node:sqlite`, LiteBox, `EgressPolicyProxy`, and Git implementations
- [docs/DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md) — Repo-wide `webclaw` Design System (`@nightfall/ui-kit`: `oklch` tokens, `@base-ui/react`, `@hugeicons/react`, `PromptInput`, charts)
- [docs/DESKTOP_PACKAGING.md](./docs/DESKTOP_PACKAGING.md) — `zcode`-aligned Electron `41.0.3` architecture and GitHub Actions `.msi` & `.dmg` CI workflow ([`.github/workflows/desktop-debug-installers.yml`](./.github/workflows/desktop-debug-installers.yml))