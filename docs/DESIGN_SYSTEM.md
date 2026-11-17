# Nightfall Repo-Wide Design System (`@nightfall/ui-kit` · Facebook `Astryx`)

Nightfall standardizes 100% of UI tokens, primitives, icons, prompt inputs, and security visualizations in `packages/ui-kit` (`@nightfall/ui-kit`), built on **Facebook/Meta's `Astryx` design system** (`@astryxdesign/core@0.7.16`, `@astryxdesign/theme-neutral@0.7.16`, `@astryxdesign/cli@0.7.16`, and `@stylexjs/stylex@0.19.2`), layered cleanly with Tailwind CSS v4 semantic tokens and `@hugeicons/react`.

## 1. Astryx Theme & 3-Tier Surface Architecture
- **Theme Definition (`packages/ui-kit/src/theme/nightfall-theme.ts`)**: Extends `neutralTheme` (`@astryxdesign/theme-neutral`) via `extendTheme(...)` and compiles statically via `astryx theme build` into `packages/ui-kit/src/theme/built/nightfall.css` & `nightfall.js`.
- **3-Tier Desktop Frame Contrast**:
  1. **Outer Window L-Frame (`bg-shell` / `#F4F5F3`)**: Seamless `38px` window bar + `48px` monochrome left icon rail with zero dividing rules.
  2. **2nd-Column Product Sidebar (`bg-sidebar` / `#FAFBF9`)**: `224px` inset Defense Factory navigation column inside the rounded workspace sheet (`rounded-tl-[12px]`), automatically collapsing when switching to **Nightfall Red Team** for full-bleed canvas focus.
  3. **Workspace Sheet (`bg-canvas` / `#FFFFFF`)**: Pure crisp white workspace canvas for tables, Sankey flows, split `campaign.yaml` builders, and floating drawers.
- **CSS Cascade Order (`packages/ui-kit/src/styles/webclaw.css`)**:
  `@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;` ensures Astryx StyleX component tokens and Tailwind CSS v4 semantic utilities compose with zero specificity clashes.

## 2. Astryx & Domain Primitives (`packages/ui-kit/src/`)
| Module | Exported Components | Backing Primitive |
| :--- | :--- | :--- |
| `astryx.ts` | `Theme`, `nightfallTheme`, `VStack`, `HStack`, `Stack`, `Divider`, `ScrollableArea`, `Heading`, `Text`, `Code`, `CodeBlock`, `AstryxButton`, `IconButton`, `Selector`, `TabList`, `Drawer`, `Banner`, `StatusDot`, `Token`, `MetadataList`, `Table` | `@astryxdesign/core/*` |
| `components/ui/button.tsx` | `Button`, `buttonVariants` (charcoal pill `rounded-full` primary/outline/secondary/ghost/destructive) | Astryx token-aligned pill button |
| `components/ui/badge.tsx` | `Badge`, `SeverityBadge`, `StatusBadge` (soft borderless `rounded-[6px]` severity & lifecycle pills) | Semantic severity & status tokens |
| `components/ui/dialog.tsx` | `DialogRoot`, `DrawerContent` (supports `floating` inset card sheet), `DialogTitle`, `DialogClose` | `@base-ui/react/dialog` + Astryx surface tokens |
| `components/ui/surfaces.tsx` | `Card`, `KpiCard`, `ConnectedKpiStrip`, `SectionHeader`, `DataTable` (flush borderless canvas table) | Composable layout & data-grid primitives |
| `components/ui/metadata-surfaces.tsx` | `SegmentedControl`, `MetadataField`, `MetadataRail`, `LifecycleStepper` | Unified 5-stage Finding Lifecycle & rail |

## 3. Prompt Kit & Security Visualizations
- **`components/prompt-kit/prompt-input.tsx`**: `PromptInput`, `PromptInputTextarea`, `PromptInputActions` (`rounded-[22px]` composer).
- **`components/visualizations/sankey-diagram.tsx`**: Flush borderless 3-stage `Findings -> Severity -> Status` `SankeyDiagram` with repo-scoped click-to-focus filtering.
- **`components/visualizations/trend-charts.tsx`**: `SeverityProportionalBars` (trackless hover-dimming proportional severity bars), `DailyTrendChart`, `CampaignActivityTimeline` (`#1D74F5` area sparkline + 48-tick barcode), and `BudgetSignalBars`.
- **`components/visualizations/yaml-code-viewer.tsx` & `unified-diff-viewer.tsx`**: Line-numbered syntax-highlighted `campaign.yaml` v5 viewer and clean line-number-free unified patch diff viewer.
- **`components/visualizations/scorecard-posture-meter.tsx`**: Fused `Nightfall Scorecard` aggregate `0–10` gauge and risk distribution strip.

## 4. Purity & Anti-Bloat Verification
- Run `pnpm --filter @nightfall/ui-kit run theme:build` to compile `nightfall-theme.ts` and `pnpm --filter @nightfall/nightfall-ui run astryx:doctor` to audit built Astryx usage.
- Every `.ts` / `.tsx` file in `packages/ui-kit/src/` and `apps/nightfall-ui/src/` is strictly `< 320` LOC, `kebab-case`, and free of raw `#hex` colors or inline `<svg>` tags in `apps/nightfall-ui/src/**`.
