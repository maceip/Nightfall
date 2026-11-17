import React from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import type { FindingRecord, RepositoryRecord } from '@nightfall/core-contracts';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Button,
  CloseIcon,
  ExpandDiagonalIcon,
  FileCodeIcon,
  GitBranchIcon,
  GridIcon,
  HandApprovalIcon,
  HistoryClockIcon,
  HomeWorkspaceIcon,
  MoreHorizontalIcon,
  NightfallHorizonIcon,
  PlusIcon,
  RadarIcon,
  RedTeamSparkIcon,
  ScorecardPostureIcon,
  SidebarLeftIcon,
  cn,
} from '@nightfall/ui-kit';
import { platformBridge, type WindowControlsOverlayMetrics } from '../bridge/platform-bridge.js';
import type { PrimarySection, RedTeamStage } from '../hooks/use-nightfall-router.js';
import { DefenseContentHeader } from './defense-content-header.js';
import { ProductSidebar } from './product-sidebar.js';

export type { PrimarySection, RedTeamStage };

export type ThreeColumnShellProps = {
  section: PrimarySection;
  rtStage: RedTeamStage;
  sidebarOpen: boolean;
  canGoBack: boolean;
  canGoForward?: boolean;
  killSwitchEngaged: boolean;
  pendingApprovalsCount?: number;
  proposedFixesCount: number;
  openFindingsCount: number;
  averageScorecardScore?: number | null;
  selectedRepo: string;
  repositories: RepositoryRecord[];
  activeFinding?: FindingRecord;
  onToggleSidebar: () => void;
  onOpenDefenseFactory: () => void;
  onHistoryBack: () => void;
  onHistoryForward?: () => void;
  onNavigate: (section: PrimarySection, rtStage?: RedTeamStage) => void;
  onOpenNewScan: () => void;
  onOpenApprovals?: () => void;
  onToggleKillSwitch: () => void;
  onChangeSelectedRepo: (repo: string) => void;
  onMarkDuplicate?: (findingId: string) => void;
  onContinueFix?: (finding: FindingRecord) => void;
  children: React.ReactNode;
};

function toggleWindowFullscreen(): void {
  if (typeof document === 'undefined') return;
  try {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.();
  } catch {
    // ignore fullscreen restriction in test sandboxes
  }
}

export function ThreeColumnShell(props: ThreeColumnShellProps): React.ReactElement {
  const {
    section,
    rtStage,
    sidebarOpen,
    canGoBack,
    canGoForward = false,
    killSwitchEngaged,
    pendingApprovalsCount = 0,
    proposedFixesCount,
    openFindingsCount,
    averageScorecardScore,
    selectedRepo,
    repositories,
    activeFinding,
    onToggleSidebar,
    onOpenDefenseFactory,
    onHistoryBack,
    onHistoryForward,
    onNavigate,
    onOpenNewScan,
    onOpenApprovals,
    onToggleKillSwitch,
    onChangeSelectedRepo,
    onMarkDuplicate,
    onContinueFix,
    children,
  } = props;

  const topRailGroup = [
    { id: 'rail-btn-home', title: 'Red Team Prompt Composer', active: section === 'red-team' && rtStage === 'composer', icon: <HomeWorkspaceIcon size={17} />, onClick: () => onNavigate('red-team', 'composer') },
    { id: 'rail-btn-yaml', title: 'Campaign YAML Manifest', active: section === 'red-team' && rtStage === 'yaml-builder', icon: <FileCodeIcon size={17} />, onClick: () => onNavigate('red-team', 'yaml-builder') },
    { id: 'rail-btn-history', title: 'Scans & Immutable Audit Ledger', active: section === 'scans', icon: <HistoryClockIcon size={17} />, onClick: () => onNavigate('scans') },
    { id: 'rail-btn-redteam', title: 'Nightfall Red Team Live Campaign', active: section === 'red-team' && (rtStage === 'live-campaign' || rtStage === 'finding-report'), icon: <RadarIcon size={17} />, onClick: () => onNavigate('red-team', 'live-campaign') },
    { title: 'Workspace settings & runtime', active: section === 'settings', icon: <MoreHorizontalIcon size={17} />, onClick: () => onNavigate('settings') },
  ];

  const productRailGroup = [
    { id: 'rail-btn-nightfall', title: 'Nightfall Defense Factory', active: section === 'findings' || section === 'finding-detail' || section === 'overview', icon: <NightfallHorizonIcon size={18} />, onClick: onOpenDefenseFactory },
    { id: 'rail-btn-fixes', title: 'Defense Factory Fixes', active: section === 'fixes', icon: <GitBranchIcon size={17} />, onClick: () => onNavigate('fixes') },
    { id: 'rail-btn-scorecard', title: 'Supply-Chain & Scorecard Posture', active: section === 'scorecard', icon: <ScorecardPostureIcon size={17} />, onClick: () => onNavigate('scorecard') },
    { id: 'rail-btn-repos', title: 'Repositories', active: section === 'repositories', icon: <GridIcon size={17} />, onClick: () => onNavigate('repositories') },
  ];

  const topTabs = [
    {
      id: 'top-tab-red-team',
      label: 'Nightfall Red Team',
      active: section === 'red-team' && rtStage !== 'yaml-builder',
      icon: <RedTeamSparkIcon size={13} />,
      onClick: () => onNavigate('red-team', 'live-campaign'),
      onClose: () => onNavigate('findings'),
    },
    {
      id: 'top-tab-campaign-yaml',
      label: 'campaign.yaml',
      active: section === 'red-team' && rtStage === 'yaml-builder',
      icon: <FileCodeIcon size={13} className="text-ink-secondary" />,
      onClick: () => onNavigate('red-team', 'yaml-builder'),
      onClose: () => onNavigate('red-team', 'live-campaign'),
    },
  ];

  const [overlayMetrics, setOverlayMetrics] = React.useState<WindowControlsOverlayMetrics>(
    () => platformBridge.getWindowControlsMetrics?.() ?? {},
  );

  React.useEffect(() => {
    if (!platformBridge.onWindowControlsMetricsChanged) return undefined;
    return platformBridge.onWindowControlsMetricsChanged(setOverlayMetrics);
  }, []);

  const headerStyle: React.CSSProperties = {
    ...(overlayMetrics.leftPaddingPx ? { paddingLeft: `${overlayMetrics.leftPaddingPx}px` } : {}),
    ...(overlayMetrics.rightPaddingPx ? { paddingRight: `${overlayMetrics.rightPaddingPx}px` } : {}),
  };

  return (
    <div id="nightfall-three-col-app" className="flex h-screen w-screen flex-col overflow-hidden bg-shell text-ink">
      <header style={headerStyle} className="wc-drag flex h-[38px] shrink-0 items-center gap-2 border-b-0 bg-shell px-2.5 select-none">
        <HStack gap={0.5} align="center" className="wc-no-drag">
          <Button id="btn-history-back" variant="ghost" size="icon-sm" title="Back" aria-label="Back" disabled={!canGoBack} onClick={onHistoryBack}>
            <ArrowLeftIcon size={15} />
          </Button>
          <Button id="btn-history-forward" variant="ghost" size="icon-sm" title="Forward" aria-label="Forward" disabled={!canGoForward} onClick={onHistoryForward}>
            <ArrowRightIcon size={15} />
          </Button>
          <Button id="btn-toggle-sidebar" variant="ghost" size="icon-sm" title="Toggle Nightfall navigation sidebar" aria-label="Toggle Nightfall navigation sidebar" onClick={onToggleSidebar}>
            <SidebarLeftIcon size={15} />
          </Button>
        </HStack>

        <div className="wc-no-drag flex items-center gap-1" role="tablist" aria-label="Workspace tabs">
          {topTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.active}
              id={tab.id}
              onClick={tab.onClick}
              className={cn(
                'group inline-flex h-[27px] items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-medium transition-colors cursor-pointer',
                tab.active
                  ? 'border-hairline-strong bg-canvas text-ink shadow-2xs'
                  : 'border-transparent text-ink-secondary hover:bg-pill/70 hover:text-ink',
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                role="presentation"
                onClick={(e) => {
                  e.stopPropagation();
                  tab.onClose();
                }}
                className={cn(
                  'ml-0.5 inline-flex size-4 items-center justify-center rounded text-ink-muted transition-opacity hover:bg-pill hover:text-ink',
                  tab.active ? 'opacity-75' : 'opacity-0 group-hover:opacity-70',
                )}
              >
                <CloseIcon size={11} />
              </span>
            </button>
          ))}
          <Button id="btn-new-redteam-prompt-tab" variant="ghost" size="icon-sm" title="New Red Team assessment prompt" aria-label="New Red Team assessment prompt" onClick={() => onNavigate('red-team', 'composer')}>
            <PlusIcon size={14} />
          </Button>
        </div>

        <div className="flex-1" />

        <HStack gap={1.5} align="center" className="wc-no-drag">
          {pendingApprovalsCount > 0 ? (
            <button
              type="button"
              id="btn-open-approvals-drawer"
              onClick={onOpenApprovals}
              className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline-strong bg-status-amber px-2.5 text-[11.5px] font-medium text-status-amber-ink transition-opacity hover:opacity-90 cursor-pointer tabular-nums"
            >
              <HandApprovalIcon size={12} />
              <span>{pendingApprovalsCount} {pendingApprovalsCount === 1 ? 'approval' : 'approvals'}</span>
            </button>
          ) : null}
          <Button variant="ghost" size="icon-sm" title="Toggle fullscreen workspace" aria-label="Toggle fullscreen workspace" onClick={toggleWindowFullscreen}>
            <ExpandDiagonalIcon size={13} />
          </Button>
        </HStack>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-12 shrink-0 flex-col items-center gap-1 bg-shell py-2 select-none" aria-label="Global workspace switcher">
          {topRailGroup.map((rb, idx) => (
            <RailIconButton key={rb.id ?? idx} {...rb} />
          ))}
          <div className="my-1 h-px w-5 bg-hairline-strong" role="separator" />
          {productRailGroup.map((rb) => (
            <RailIconButton key={rb.id} {...rb} />
          ))}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-tl-[12px] border-t border-l border-hairline-strong bg-canvas">
          {sidebarOpen ? (
            <ProductSidebar
              section={section}
              proposedFixesCount={proposedFixesCount}
              openFindingsCount={openFindingsCount}
              averageScorecardScore={averageScorecardScore}
              onToggleSidebar={onToggleSidebar}
              onOpenNewScan={onOpenNewScan}
              onNavigate={onNavigate}
            />
          ) : null}

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
            <DefenseContentHeader
              section={section}
              killSwitchEngaged={killSwitchEngaged}
              selectedRepo={selectedRepo}
              repositories={repositories}
              activeFinding={activeFinding}
              onNavigate={onNavigate}
              onOpenNewScan={onOpenNewScan}
              onToggleKillSwitch={onToggleKillSwitch}
              onChangeSelectedRepo={onChangeSelectedRepo}
              onMarkDuplicate={onMarkDuplicate}
              onContinueFix={onContinueFix}
            />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function RailIconButton({
  id, title, active, icon, onClick,
}: {
  id?: string; title: string; active: boolean; icon: React.ReactNode; onClick?: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      id={id}
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-[9px] transition-colors cursor-pointer',
        active ? 'bg-pill text-ink' : 'text-ink-secondary hover:bg-pill/60 hover:text-ink',
      )}
    >
      {icon}
    </button>
  );
}
