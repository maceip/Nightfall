# Nightfall Engineering & Agent Guardrails (`AGENTS.md`)

All contributors and coding agents working in `Nightfall` MUST adhere to the following non-negotiable architectural rules:

## 1. Zero Fake, Mocked, or Hardcoded Runtime Implementations
- **No runtime mocks or fixture fallbacks**: Never return static arrays, hardcoded fake PR numbers, synthetic `setTimeout` progress bars, or placeholder strings from runtime services or UI hooks.
- **Real persistence & execution**:
  - Persistence MUST flow through `NightfallSqliteStore` (`node:sqlite` in `WAL` mode) in `services/closed-loop-orchestrator/src/sqliteStore.ts`.
  - Scans MUST execute real file/AST/pattern inspection via `RepositoryScanner` (`services/defense-factory/src/repositoryScanner.ts`) over materialized Git workspaces (`services/closed-loop-orchestrator/src/workspaceMaterializer.ts`) or user-selected local directories.
  - Dynamic verification MUST execute live HTTP + WebSocket probes through `EgressPolicyProxy` (`services/red-team/src/egressProxy.ts`) and `RedTeamEngine` (`services/red-team/src/redTeamEngine.ts`).
  - Supply-chain and CI workflow posture evaluations MUST execute through `ScorecardService` (`services/scorecard/src/scorecardDaemon.ts`) backed by the vendored `nightfall-scorecard` Go binary (`vendor/scorecard/`, provisioned via `infra/scorecard/build-scorecard.sh`).
  - **Mantis (`https://github.com/maceip/mantis`) integration pipeline**: Until the upstream `maceip/mantis` Python/Docker runtime is attached locally, surface Mantis honestly as `Preview · Integration Pipeline` using `@nightfall/core-contracts` (`MANTIS_REFERENCE_PIPELINE_STAGES`, `buildMantisWorkflowLocalJson`, `buildMantisCliCommand`) — never fabricate fake Mantis scan runs.
  - Two-stage exploit/remediation proofs MUST execute inside `DisposableSandboxRuntime` (`packages/sandbox-runtime/src/index.ts`) backed by **Microsoft LiteBox** (`https://github.com/microsoft/litebox`).
  - Remediation patches MUST create real Git branches and commits via `GitPatchPackager` (`services/defense-factory/src/gitPackager.ts`).

## 2. Mandatory Facebook `Astryx` (`@astryxdesign/core`) + `@nightfall/ui-kit` Design System
- **Single source of UI truth**: Every screen in `apps/nightfall-ui/src/screens/**` MUST wrap under `<Theme theme={nightfallTheme}>` (`@astryxdesign/core/theme` + static compiled `packages/ui-kit/src/theme/built/nightfall.ts`) and import layout/control primitives, domain surfaces (`Button`, `Input`, `Tabs`, `DialogRoot`, `DrawerContent`, `Collapsible`, `Switch`, `TooltipRoot`, `Badge`, `SeverityBadge`, `StatusBadge`, `Card`, `KpiCard`, `ConnectedKpiStrip`, `SectionHeader`, `DataTable`, `SegmentedControl`, `MetadataRail`, `LifecycleStepper`, `PromptInput`), visualizations (`SankeyDiagram`, `ScorecardPostureMeter`, `ScorecardScorePill`, `UnifiedDiffViewer`, `YamlCodeViewer`, `DailyTrendChart`, `SeverityProportionalBars`, `CampaignActivityTimeline`, `BudgetSignalBars`), and icons from `@nightfall/ui-kit` / `@astryxdesign/core/*`.
- **Iconography & Purity**: Custom `<svg>` marks and `@hugeicons/react` wrappers live strictly inside `packages/ui-kit/src/components/**`. Never install `lucide-react` or write ad-hoc `<svg>` tags inside `apps/nightfall-ui/src/**`.
- **Styling & Tokens**: Use compiled Astryx theme variables (`packages/ui-kit/src/theme/nightfall-theme.ts` -> `packages/ui-kit/src/theme/built/nightfall.css`) and semantic Tailwind CSS v4 tokens in `packages/ui-kit/src/styles/webclaw.css` (`bg-shell`, `bg-sidebar`, `bg-canvas`, `border-hairline`, `text-ink`, `text-ink-secondary`). Never hardcode `#hex` colors in `apps/nightfall-ui/src/**` screen components.
- **File size & naming ceiling**: Every `.tsx` / `.ts` file in `packages/ui-kit/src/` and `apps/nightfall-ui/src/` MUST use `kebab-case` naming (preserving `App.tsx` / `App.test.tsx`) and remain **under `320` lines of code**.

## 3. Unified `Nightfall` Nomenclature
- Always use **Nightfall**, **Nightfall Red Team**, **Nightfall Defense Factory**, and **Nightfall Scorecard** across every sidebar header, tab, badge, CLI flag, and installer metadata field. Never introduce legacy `"Daybreak"` or `"Codex"` labels.

## 4. `zcode`-Aligned Electron & Packaging Standards
- Keep `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and strict `setWindowOpenHandler` / `will-navigate` guards enabled in `apps/nightfall-ui/electron/main.ts`.
- All desktop packaging changes in `apps/nightfall-ui/electron-builder.config.mjs` and `.github/workflows/desktop-debug-installers.yml` must preserve side-by-side `preview` (`dev.nightfall.app.preview`) vs `production` (`dev.nightfall.app`) channel isolation, `electronLanguages: ['en-US']`, native ASAR unpack verification, and both macOS `.dmg` and Windows WiX `.msi` installer outputs.
