import React from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import {
  BulletListIcon,
  CodeIcon,
  FolderIcon,
  GridIcon,
  NightfallHorizonIcon,
  PlusIcon,
  RedTeamSparkIcon,
  ScanIcon,
  ScorecardPostureIcon,
  ScorecardScorePill,
  SettingsIcon,
  SidebarLeftIcon,
  cn,
} from '@nightfall/ui-kit';
import type { PrimarySection, RedTeamStage } from '../hooks/use-nightfall-router.js';

export type ProductSidebarProps = {
  section: PrimarySection;
  collapsed: boolean;
  leftInsetPx?: number;
  proposedFixesCount: number;
  openFindingsCount: number;
  averageScorecardScore?: number | null;
  onToggleSidebar: () => void;
  onOpenNewScan: () => void;
  onNavigate: (section: PrimarySection, rtStage?: RedTeamStage) => void;
};

function safeCount(raw: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 0;
}

export function ProductSidebar({
  section,
  collapsed,
  leftInsetPx = 0,
  proposedFixesCount,
  openFindingsCount,
  averageScorecardScore,
  onToggleSidebar,
  onOpenNewScan,
  onNavigate,
}: ProductSidebarProps): React.ReactElement {
  const cleanFixes = safeCount(proposedFixesCount);
  const cleanFindings = safeCount(openFindingsCount);
  const isRedTeam = section === 'red-team';
  const hasValidScorecard =
    averageScorecardScore !== null &&
    averageScorecardScore !== undefined &&
    Number.isFinite(averageScorecardScore);

  const headerStyle: React.CSSProperties | undefined = leftInsetPx
    ? { paddingLeft: `${leftInsetPx}px` }
    : undefined;

  return (
    <nav
      id="nightfall-product-sidebar"
      aria-label="Nightfall navigation"
      data-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        'flex shrink-0 flex-col justify-between border-r border-hairline bg-sidebar select-none',
        collapsed ? 'w-14 px-2 py-2.5' : 'w-[236px] px-3 py-2.5',
      )}
    >
      <VStack gap={3}>
        <header
          style={headerStyle}
          className={cn(
            'wc-drag flex h-8 items-center',
            collapsed ? 'justify-center' : 'justify-between px-1.5',
          )}
        >
          {!collapsed ? (
            <HStack gap={2} align="center">
              <NightfallHorizonIcon size={17} className="text-ink" />
              <span className="text-[15px] font-semibold tracking-tight text-ink">Nightfall</span>
            </HStack>
          ) : null}
          <button
            type="button"
            id="btn-toggle-sidebar"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleSidebar}
            className="wc-no-drag inline-flex size-7 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-pill/70 hover:text-ink cursor-pointer"
          >
            <SidebarLeftIcon size={15} />
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Nightfall product mode"
          className={cn(
            'wc-no-drag rounded-xl border border-hairline bg-canvas p-0.5',
            collapsed ? 'flex flex-col gap-0.5' : 'grid grid-cols-2 gap-0.5',
          )}
        >
          <button
            type="button"
            role="tab"
            id="nav-btn-defense"
            aria-selected={!isRedTeam}
            title="Defense Factory"
            onClick={() => {
              if (isRedTeam) onNavigate('findings');
            }}
            className={cn(
              'inline-flex h-7 items-center justify-center gap-1.5 rounded-[9px] px-2 text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer',
              !isRedTeam
                ? 'bg-pill text-ink shadow-2xs'
                : 'text-ink-secondary hover:text-ink',
            )}
          >
            <NightfallHorizonIcon size={13} />
            {!collapsed ? <span>Defense</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            id="nav-btn-red-team"
            aria-selected={isRedTeam}
            title="Red Team Assessment"
            onClick={() => onNavigate('red-team', 'live-campaign')}
            className={cn(
              'inline-flex h-7 items-center justify-center gap-1.5 rounded-[9px] px-2 text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer',
              isRedTeam
                ? 'bg-pill text-ink shadow-2xs'
                : 'text-ink-secondary hover:text-ink',
            )}
          >
            <RedTeamSparkIcon size={13} />
            {!collapsed ? <span>Red Team</span> : null}
          </button>
        </div>

        <div className="space-y-0.5 tabular-nums">
          <SidebarNavItem
            id="nav-btn-new-scan"
            collapsed={collapsed}
            active={false}
            icon={<PlusIcon size={15} />}
            label="New scan"
            onClick={onOpenNewScan}
          />
          <SidebarNavItem
            id="nav-btn-overview"
            collapsed={collapsed}
            active={section === 'overview'}
            icon={<GridIcon size={15} />}
            label="Overview"
            onClick={() => onNavigate('overview')}
          />
          <SidebarNavItem
            id="nav-btn-fixes"
            collapsed={collapsed}
            active={section === 'fixes'}
            icon={<CodeIcon size={15} />}
            label="Fixes"
            trailing={
              <span className="relative inline-flex items-center justify-center rounded-full bg-pill px-2 py-0.5 text-[11.5px] leading-4 font-medium text-ink-secondary">
                <span>{cleanFixes}</span>
                {cleanFixes > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-accent-blue"
                  />
                ) : null}
              </span>
            }
            onClick={() => onNavigate('fixes')}
          />
          <SidebarNavItem
            id="nav-btn-findings"
            collapsed={collapsed}
            active={section === 'findings' || section === 'finding-detail'}
            icon={<BulletListIcon size={15} />}
            label="Findings"
            trailing={
              <span className="inline-flex items-center justify-center rounded-full bg-pill px-2 py-0.5 text-[11.5px] leading-4 font-medium text-ink-secondary">
                {cleanFindings}
              </span>
            }
            onClick={() => onNavigate('findings')}
          />
          <SidebarNavItem
            id="nav-btn-repositories"
            collapsed={collapsed}
            active={section === 'repositories'}
            icon={<FolderIcon size={15} />}
            label="Repositories"
            onClick={() => onNavigate('repositories')}
          />
          <SidebarNavItem
            id="nav-btn-scorecard"
            collapsed={collapsed}
            active={section === 'scorecard'}
            icon={<ScorecardPostureIcon size={15} />}
            label="Scorecard"
            trailing={
              hasValidScorecard ? <ScorecardScorePill score={averageScorecardScore} /> : undefined
            }
            onClick={() => onNavigate('scorecard')}
          />
          <SidebarNavItem
            id="nav-btn-scans"
            collapsed={collapsed}
            active={section === 'scans'}
            icon={<ScanIcon size={15} />}
            label="Scans"
            onClick={() => onNavigate('scans')}
          />
        </div>
      </VStack>

      <SidebarNavItem
        id="nav-btn-settings"
        collapsed={collapsed}
        active={section === 'settings'}
        icon={<SettingsIcon size={15} />}
        label="Settings"
        onClick={() => onNavigate('settings')}
      />
    </nav>
  );
}

function SidebarNavItem({
  id,
  collapsed,
  active,
  icon,
  label,
  trailing,
  onClick,
}: {
  id: string;
  collapsed: boolean;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      id={id}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        'wc-no-drag flex w-full items-center rounded-lg py-1.5 text-[13px] font-medium transition-colors cursor-pointer',
        collapsed ? 'justify-center px-0' : 'justify-between px-2.5',
        active ? 'bg-pill text-ink' : 'text-ink-secondary hover:bg-pill/60 hover:text-ink',
      )}
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {!collapsed ? <span>{label}</span> : null}
      </span>
      {!collapsed ? trailing : null}
    </button>
  );
}
