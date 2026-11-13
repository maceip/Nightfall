# Nightfall Repo-Wide Design System (`@nightfall/ui-kit` · `webclaw`)

Nightfall standardizes 100% of UI tokens, primitives, icons, prompt inputs, and security visualizations in `packages/ui-kit` (`@nightfall/ui-kit`), built on the **`webclaw`** design architecture (`@base-ui/react`, Tailwind CSS v4 `oklch` tokens, `class-variance-authority`, and `@hugeicons/react`).

## 1. Token Architecture (`packages/ui-kit/src/styles/webclaw.css`)
- **Color Space**: Warm neutral `oklch(... 80)` scale (`--color-primary-50` through `--color-primary-950`) paired with semantic `--color-surface` and `--color-ink` tokens supporting `.light`, `.dark`, and `.system` (`prefers-color-scheme`) themes.
- **Typography**: Inter / system sans with `-0.15px` body letter-spacing (`text-balance` on headings, `tabular-nums` on KPIs, counts, and timestamps) and `JetBrains Mono` for `.inline-code`, diffs, `campaign.yaml`, and HTTP/WS traces.
- **Desktop Window Drag Regions**: `.wc-drag` (`-webkit-app-region: drag`) on the `40px` `hiddenInset` top bar and `.wc-no-drag` on interactive buttons, tabs, and inputs.

## 2. Shared Primitives (`packages/ui-kit/src/components/ui/`)
| Module | Exported Components | Backing Primitive |
| :--- | :--- | :--- |
| `button.tsx` | `Button`, `buttonVariants` (`default`, `secondary`, `outline`, `ghost`, `destructive`; `sm`, `md`, `lg`, `icon`, `icon-sm`) | `@base-ui/react/use-render` + `merge-props` + `cva` |
| `input.tsx` | `Input` | `@base-ui/react/input` |
| `tabs.tsx` | `Tabs`, `TabsList`, `TabsTab`, `TabsPanel` | `@base-ui/react/tabs` |
| `dialog.tsx` | `DialogRoot`, `DialogTrigger`, `DialogContent`, `DrawerContent`, `DialogTitle`, `DialogDescription`, `DialogClose` | `@base-ui/react/dialog` |
| `collapsible.tsx` | `Collapsible`, `CollapsibleTrigger`, `CollapsiblePanel` | `@base-ui/react/collapsible` |
| `switch.tsx` | `Switch` | `@base-ui/react/switch` |
| `tooltip.tsx` | `TooltipProvider`, `TooltipRoot`, `TooltipTrigger`, `TooltipContent` | `@base-ui/react/tooltip` |
| `badge.tsx` | `Badge`, `SeverityBadge`, `StatusBadge` | `cva` semantic severity & lifecycle pills |
| `surfaces.tsx` | `Card`, `KpiCard`, `SectionHeader`, `DataTable`, `SegmentedControl`, `MetadataField`, `MetadataRail` | Composable layout & data-grid primitives |

## 3. Prompt Kit & Visualizations
- **`components/prompt-kit/prompt-input.tsx`**: `PromptInput`, `PromptInputTextarea`, `PromptInputActions`, `PromptInputAction` (`rounded-[22px]` auto-resizing composer used in both Red Team Campaign Composer and Defense Factory Fix Follow-up Drawer).
- **`components/visualizations/sankey-diagram.tsx`**: Interactive 3-stage `Findings -> Severity -> Status` `SankeyDiagram` with click-to-focus filtering.
- **`components/visualizations/unified-diff-viewer.tsx`**: Line-numbered addition/deletion `UnifiedDiffViewer`.
- **`components/visualizations/trend-charts.tsx`**: `DailyTrendChart`, `CampaignActivityTimeline`, and `BudgetSignalBars`.

## 4. Centralized Icon Registry (`components/icons/nightfall-icons.tsx`)
All icons across Nightfall wrap `@hugeicons/react` + `@hugeicons/core-free-icons` at default `size={20}` and `strokeWidth={1.5}` (`SearchIcon`, `FilterIcon`, `SettingsIcon`, `SidebarLeftIcon`, `PlusIcon`, `ArrowLeftIcon`, `ArrowRightIcon`, `ArrowUpIcon`, `ShieldAlertIcon`, `ShieldCheckIcon`, `CodeIcon`, `FileCodeIcon`, `GitBranchIcon`, `GlobeIcon`, `FolderIcon`, `TerminalIcon`, `HandApprovalIcon`, `CheckCircleIcon`, `CloseIcon`, `HomeWorkspaceIcon`, `HistoryClockIcon`, `SparklesIcon`, `DownloadIcon`, `ChevronRightIcon`, `ChevronDownIcon`, `GridIcon`, `RadarIcon`, `ScanIcon`, `MoreHorizontalIcon`), alongside brand marks `NightfallHorizonIcon`, `RedTeamCampaignBadge`, and `RedTeamSparkIcon`.

## 5. Anti-Bloat Enforcement
- Screen files in `apps/nightfall-ui/src/screens/**` are strictly modular (`115–260 LOC` each) and forbidden from importing `@hugeicons/*`, `lucide-react`, or raw `#hex` styles directly.
