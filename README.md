# Nightfall

**Nightfall** is a unified, closed-loop application security platform combining two autonomous subprojects inside a native-style three-column **Electron + Web** workspace:

1. **Nightfall Red Team (`services/red-team`)** — Automated Application Security Assessment Platform. Combines source-archive/repository code intelligence with isolated, scope-enforced HTTP and WebSocket dynamic verification (`campaign.yaml` v5) to confirm real weaknesses with reproducible `EvidenceBundle` proofs, discard unreachable static false positives, and re-test fixes post-deployment.
2. **Nightfall Defense Factory (`services/defense-factory`)** — Continuous Vulnerability Remediation Platform. Deduplicates multi-tool findings by root cause, routes work items to code owners within WIP velocity caps, and synthesizes minimal patches inside hermetic snapshots verified by a mandatory **Two-Stage Test Proof** (`Red` failing reproduction test → `Green` minimal patch + full regression suite + independent Critic gate).
3. **Nightfall Three-Column Desktop & Web UI (`apps/nightfall-ui`)** — Shared React 19 + TypeScript + Vite web core wrapped in a hardened `hiddenInset` Electron shell (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`) supporting both `Cloud` snapshots and `Local` workspace scans.

---

## Monorepo Architecture

```text
Nightfall/
├── apps/
│   ├── nightfall-ui/                # Three-column Electron + Web UI (Vanilla CSS design system)
│   └── nightfall-cli/               # CLI for campaign.yaml signing/validation, scans & audit checks
├── packages/
│   ├── core-contracts/              # Zod/TS schemas: CampaignYamlV5, Ed25519 ScopeManifest, Finding, Fix
│   ├── ui-kit/                      # Brand emblems, interactive 3-stage Sankey, unified diff & charts
│   ├── mock-fixtures/               # Deterministic multi-repo & northstar-docs-staging replay datasets
│   ├── sandbox-runtime/             # Disposable sandbox provisioner with SHA-256 TeardownAttestation
│   ├── policy-gate/                 # Risk-tier evaluator, Ask-for-Approval HITL gate & <1s Kill-Switch
│   ├── shared-memory/               # Cross-agent Shared Knowledge graph & TTL-leased Work Queue
│   ├── audit-ledger/                # Append-only SHA-256 hash-chained ledger & Safety Monitor status
│   └── model-gateway/               # Provider-agnostic model router & cost-budget circuit breaker
├── services/
│   ├── api-gateway/                 # Zero-dependency Node HTTP + live SSE streaming BFF (port 4000)
│   ├── red-team/                    # Campaign compiler, L7 HTTP+WS Egress Policy Proxy & verifier agents
│   ├── defense-factory/             # Root-cause deduplicator, hermetic 2-stage proof & PR packager
│   └── closed-loop-orchestrator/    # Closed-loop state machine (Red Team -> Defense Factory -> Re-verify)
└── benchmarks/
    └── testbeds/                    # Safe local synthetic multi-tenant staging server & E2E suites
```

---

## Quickstart

```bash
# Install workspace dependencies
pnpm install

# Run full TypeScript check and Vitest suite across all packages, services, UI & E2E benchmarks
pnpm typecheck
pnpm test

# Start the live REST + SSE API Gateway (http://localhost:4000)
pnpm dev:api

# Start the Nightfall Web UI (http://localhost:5173)
pnpm dev:web

# Launch the native hiddenInset Electron shell (on macOS/Windows/Linux workstations)
pnpm dev:desktop
```

See [docs/BUILD_PLAN.md](./docs/BUILD_PLAN.md) for the complete architectural specification, safety invariants, closed-loop state machine, and phased milestone gates.