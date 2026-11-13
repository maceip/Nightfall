# Nightfall Engineering & Agent Guardrails (`AGENTS.md`)

All contributors and coding agents working in `Nightfall` MUST adhere to the following non-negotiable architectural rules:

## 1. Zero Fake, Mocked, or Hardcoded Runtime Implementations
- **No runtime mocks or fixture fallbacks**: Never return static arrays, hardcoded fake PR numbers, synthetic `setTimeout` progress bars, or placeholder strings from runtime services or UI hooks.
- **Real persistence & execution**:
  - Persistence MUST flow through `NightfallSqliteStore` (`node:sqlite` in `WAL` mode) in `services/closed-loop-orchestrator/src/sqliteStore.ts`.
  - Scans MUST execute real file/AST/pattern inspection via `RepositoryScanner` (`services/defense-factory/src/repositoryScanner.ts`) over materialized Git workspaces (`services/closed-loop-orchestrator/src/workspaceMaterializer.ts`) or user-selected local directories.
  - Dynamic verification MUST execute live HTTP + WebSocket probes through `EgressPolicyProxy` (`services/red-team/src/egressProxy.ts`) and `RedTeamEngine` (`services/red-team/src/redTeamEngine.ts`).
  - Two-stage exploit/remediation proofs MUST execute inside `DisposableSandboxRuntime` (`packages/sandbox-runtime/src/index.ts`) backed by **Microsoft LiteBox** (`https://github.com/microsoft/litebox`).
  - Remediation patches MUST create real Git branches and commits via `GitPatchPackager` (`services/defense-factory/src/gitPackager.ts`).

## 2. Mandatory `@nightfall/ui-kit` (`webclaw`) Design System
- **Single source of UI truth**: Every screen in `apps/nightfall-ui/src/screens/**` MUST import its primitives (`Button`, `Input`, `Tabs`, `DialogRoot`, `DrawerContent`, `Collapsible`, `Switch`, `TooltipRoot`, `Badge`, `SeverityBadge`, `StatusBadge`, `Card`, `KpiCard`, `SectionHeader`, `DataTable`, `SegmentedControl`, `MetadataRail`, `PromptInput`), visualizations (`SankeyDiagram`, `UnifiedDiffViewer`, `DailyTrendChart`, `CampaignActivityTimeline`, `BudgetSignalBars`), and icons from `@nightfall/ui-kit`.
- **Iconography**: Only `@hugeicons/react` + `@hugeicons/core-free-icons` wrapped inside `packages/ui-kit/src/components/icons/nightfall-icons.tsx` (`size={20}`, `strokeWidth={1.5}` default) are permitted. Never install `lucide-react` or write ad-hoc `<svg>` icons inside `apps/nightfall-ui`.
- **Styling & Tokens**: Use Tailwind CSS v4 semantic `oklch` tokens defined in `packages/ui-kit/src/styles/webclaw.css` (`bg-surface`, `text-ink`, `bg-primary-50`..`bg-primary-950`, `border-primary-200`, `.inline-code`). Never hardcode `#hex` colors in screen components.
- **File size & naming ceiling**: Every `.tsx` / `.ts` file in `packages/ui-kit/src/` and `apps/nightfall-ui/src/` MUST use `kebab-case` naming and remain **under `320` lines of code**. Never create monolithic `1k+ LOC` view files.

## 3. Unified `Nightfall` Nomenclature
- Always use **Nightfall**, **Nightfall Red Team**, and **Nightfall Defense Factory** across every sidebar header, tab, badge, CLI flag, and installer metadata field. Never introduce legacy `"Daybreak"` or `"Codex"` labels.

## 4. `zcode`-Aligned Electron & Packaging Standards
- Keep `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and strict `setWindowOpenHandler` / `will-navigate` guards enabled in `apps/nightfall-ui/electron/main.ts`.
- All desktop packaging changes in `apps/nightfall-ui/electron-builder.config.mjs` and `.github/workflows/desktop-debug-installers.yml` must preserve side-by-side `preview` (`dev.nightfall.app.preview`) vs `production` (`dev.nightfall.app`) channel isolation, `electronLanguages: ['en-US']`, native ASAR unpack verification, and both macOS `.dmg` and Windows WiX `.msi` installer outputs.
