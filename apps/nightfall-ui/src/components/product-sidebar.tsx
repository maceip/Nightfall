import React from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import {
  BulletListIcon,
  CodeIcon,
  FolderIcon,
  GridIcon,
  PlusIcon,
  ScanIcon,
  ScorecardPostureIcon,
  ScorecardScorePill,
  SettingsIcon,
  ShieldCheckIcon,
  SidebarLeftIcon,
  cn,
} from '@nightfall/ui-kit';
import type { PrimarySection, RedTeamStage } from '../hooks/use-nightfall-router.js';

export type ProductSidebarProps = {
  section: PrimarySection;
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
  proposedFixesCount,
  openFindingsCount,
  averageScorecardScore,
  onToggleSidebar,
  onOpenNewScan,
  onNavigate,
}: ProductSidebarProps): React.ReactElement {
  const cleanFixes = safeCount(proposedFixesCount);
  const cleanFindings = safeCount(openFindingsCount);
  const hasValidScorecard =
    averageScorecardScore !== null &&
    averageScorecardScore !== undefined &&
    Number.isFinite(averageScorecardScore);

  return (
    <nav
      id="nightfall-product-sidebar"
      aria-label="Nightfall navigation"
      className="flex w-56 shrink-0 flex-col justify-between border-r border-hairline bg-sidebar px-2.5 py-3 select-none"
    >
      <VStack gap={0}>
        <HStack align="center" justify="between" className="mb-2.5 px-2">
          <span className="text-[15px] font-semibold tracking-tight text-ink">Nightfall</span>
          <button
            type="button"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            onClick={onToggleSidebar}
            className="inline-flex size-7 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-pill/70 hover:text-ink cursor-pointer"
          >
            <SidebarLeftIcon size={15} />
          </button>
        </HStack>

        <div className="space-y-0.5 tabular-nums">
          <SidebarNavItem
            id="nav-btn-new-scan"
            active={false}
            icon={<PlusIcon size={15} />}
            label="New scan"
            onClick={onOpenNewScan}
          />
          <SidebarNavItem
            id="nav-btn-overview"
            active={section === 'overview'}
            icon={<GridIcon size={15} />}
            label="Overview"
            onClick={() => onNavigate('overview')}
          />
          <SidebarNavItem
            id="nav-btn-fixes"
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
            active={section === 'repositories'}
            icon={<FolderIcon size={15} />}
            label="Repositories"
            onClick={() => onNavigate('repositories')}
          />
          <SidebarNavItem
            id="nav-btn-scorecard"
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
            active={section === 'scans'}
            icon={<ScanIcon size={15} />}
            label="Scans"
            onClick={() => onNavigate('scans')}
          />
          <div className="my-2 h-px bg-hairline" role="separator" />
          <SidebarNavItem
            id="nav-btn-red-team"
            active={section === 'red-team'}
            icon={<ShieldCheckIcon size={15} />}
            label="Red Team"
            trailing={
              <span className="rounded-full bg-accent-violet-soft px-2 py-0.5 text-[11px] leading-4 font-medium text-accent-violet">
                New
              </span>
            }
            onClick={() => onNavigate('red-team', 'live-campaign')}
          />
        </div>
      </VStack>

      <SidebarNavItem
        id="nav-btn-settings"
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
  active,
  icon,
  label,
  trailing,
  onClick,
}: {
  id: string;
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
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer',
        active
          ? 'bg-pill text-ink'
          : 'text-ink-secondary hover:bg-pill/60 hover:text-ink',
      )}
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </span>
      {trailing}
    </button>
  );
}
