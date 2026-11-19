import React from 'react';
import type { FindingRecord, RepositoryRecord } from '@nightfall/core-contracts';
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
  onBackToLanding?: () => void;
  children: React.ReactNode;
};

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
    onHistoryBack,
    onHistoryForward,
    onNavigate,
    onOpenNewScan,
    onOpenApprovals,
    onToggleKillSwitch,
    onChangeSelectedRepo,
    onMarkDuplicate,
    onContinueFix,
    onBackToLanding,
    children,
  } = props;

  const [overlayMetrics, setOverlayMetrics] = React.useState<WindowControlsOverlayMetrics>(
    () => platformBridge.getWindowControlsMetrics?.() ?? {},
  );

  React.useEffect(() => {
    if (!platformBridge.onWindowControlsMetricsChanged) return undefined;
    return platformBridge.onWindowControlsMetricsChanged(setOverlayMetrics);
  }, []);

  return (
    <div
      id="nightfall-three-col-app"
      className="flex h-dvh w-full overflow-hidden bg-canvas text-ink"
    >
      <ProductSidebar
        section={section}
        collapsed={!sidebarOpen}
        leftInsetPx={overlayMetrics.leftPaddingPx}
        proposedFixesCount={proposedFixesCount}
        openFindingsCount={openFindingsCount}
        averageScorecardScore={averageScorecardScore}
        onToggleSidebar={onToggleSidebar}
        onOpenNewScan={onOpenNewScan}
        onNavigate={onNavigate}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
        <DefenseContentHeader
          section={section}
          rtStage={rtStage}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          rightInsetPx={overlayMetrics.rightPaddingPx}
          pendingApprovalsCount={pendingApprovalsCount}
          killSwitchEngaged={killSwitchEngaged}
          selectedRepo={selectedRepo}
          repositories={repositories}
          activeFinding={activeFinding}
          onHistoryBack={onHistoryBack}
          onHistoryForward={onHistoryForward}
          onNavigate={onNavigate}
          onOpenNewScan={onOpenNewScan}
          onOpenApprovals={onOpenApprovals}
          onToggleKillSwitch={onToggleKillSwitch}
          onChangeSelectedRepo={onChangeSelectedRepo}
          onMarkDuplicate={onMarkDuplicate}
          onContinueFix={onContinueFix}
          onBackToLanding={onBackToLanding}
        />
        {children}
      </main>
    </div>
  );
}
