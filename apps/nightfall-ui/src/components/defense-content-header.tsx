import React from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import type { FindingRecord, RepositoryRecord } from '@nightfall/core-contracts';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  ExpandDiagonalIcon,
  FileCodeIcon,
  FolderIcon,
  HandApprovalIcon,
  HomeWorkspaceIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RadarIcon,
  RedTeamSparkIcon,
  ShieldAlertIcon,
  cn,
} from '@nightfall/ui-kit';
import type { PrimarySection, RedTeamStage } from '../hooks/use-nightfall-router.js';

export type DefenseContentHeaderProps = {
  section: PrimarySection;
  rtStage: RedTeamStage;
  canGoBack: boolean;
  canGoForward?: boolean;
  rightInsetPx?: number;
  pendingApprovalsCount?: number;
  killSwitchEngaged: boolean;
  selectedRepo: string;
  repositories: RepositoryRecord[];
  activeFinding?: FindingRecord;
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
};

const SECTION_TITLES: Record<Exclude<PrimarySection, 'red-team'>, string> = {
  overview: 'Overview',
  fixes: 'Fixes',
  findings: 'Findings',
  'finding-detail': 'Finding Detail',
  repositories: 'Repositories',
  scorecard: 'Scorecard',
  scans: 'Scans & Audit',
  settings: 'Settings',
};

const RED_TEAM_STAGE_LABELS: Record<RedTeamStage, string> = {
  composer: 'Prompt Composer',
  'yaml-builder': 'Campaign Scope Config',
  'live-campaign': 'Live Campaign',
  'finding-report': 'Finding Evidence Report',
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

export function DefenseContentHeader(props: DefenseContentHeaderProps): React.ReactElement {
  const {
    section, rtStage, canGoBack, canGoForward = false, rightInsetPx = 0,
    pendingApprovalsCount = 0, killSwitchEngaged, selectedRepo, repositories,
    activeFinding, onHistoryBack, onHistoryForward, onNavigate, onOpenNewScan,
    onOpenApprovals, onToggleKillSwitch, onChangeSelectedRepo, onMarkDuplicate, onContinueFix,
    onBackToLanding,
  } = props;

  const barStyle = rightInsetPx ? { paddingRight: `${rightInsetPx}px` } : undefined;

  return (
    <>
      {killSwitchEngaged ? (
        <div
          id="banner-kill-switch-engaged"
          className="flex shrink-0 items-center justify-between border-b border-hairline-strong bg-status-danger px-6 py-2 text-xs font-medium text-status-danger-ink"
        >
          <HStack gap={2} align="center">
            <StatusDot variant="error" label="Halted" />
            <ShieldAlertIcon size={14} />
            <span>Emergency Sandbox Kill-Switch Engaged — active Red Team &amp; LiteBox probes are halted.</span>
          </HStack>
          <Button id="btn-emergency-kill-switch-resume" variant="outline" size="sm" onClick={onToggleKillSwitch}>
            Resume operations
          </Button>
        </div>
      ) : null}

      <div
        style={barStyle}
        className="wc-drag flex h-13 shrink-0 items-center justify-between border-b border-hairline bg-canvas px-5 select-none"
      >
        <div className="wc-no-drag flex items-center gap-2">
          <HStack gap={0.5} align="center" className="mr-1">
            <Button id="btn-history-back" variant="ghost" size="icon-sm" title="Back" aria-label="Back" disabled={!canGoBack} onClick={onHistoryBack}>
              <ArrowLeftIcon size={15} />
            </Button>
            <Button id="btn-history-forward" variant="ghost" size="icon-sm" title="Forward" aria-label="Forward" disabled={!canGoForward} onClick={onHistoryForward}>
              <ArrowRightIcon size={15} />
            </Button>
          </HStack>

          {section === 'red-team' ? (
            <HStack gap={2} align="center">
              <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                <RedTeamSparkIcon size={14} />
                <span>Red Team</span>
              </span>
              <ChevronRightIcon size={14} className="text-ink-muted" />
              <span className="text-[13.5px] font-medium text-ink-secondary">{RED_TEAM_STAGE_LABELS[rtStage]}</span>
              <div role="tablist" aria-label="Red Team assessment stages" className="ml-2 inline-flex items-center gap-1 rounded-full border border-hairline bg-sidebar p-0.5">
                <StagePill id="top-tab-composer" active={rtStage === 'composer'} icon={<HomeWorkspaceIcon size={12} />} label="Prompt" onClick={() => onNavigate('red-team', 'composer')} />
                <StagePill id="top-tab-campaign-yaml" active={rtStage === 'yaml-builder'} icon={<FileCodeIcon size={12} />} label="Scope YAML" onClick={() => onNavigate('red-team', 'yaml-builder')} />
                <StagePill id="top-tab-red-team" active={rtStage === 'live-campaign' || rtStage === 'finding-report'} icon={<RadarIcon size={12} />} label="Live Campaign" onClick={() => onNavigate('red-team', 'live-campaign')} />
              </div>
            </HStack>
          ) : section === 'finding-detail' && activeFinding ? (
            <HStack gap={1.5} align="center">
              <button type="button" onClick={() => onNavigate('findings')} className="text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink cursor-pointer">
                Findings
              </button>
              <ChevronRightIcon size={14} className="text-ink-muted" />
              <h1 className="m-0 text-[13.5px] font-semibold text-ink">{activeFinding.id}</h1>
            </HStack>
          ) : (
            <HStack gap={2} align="center">
              <div className="relative inline-flex items-center">
                <FolderIcon size={13} className="pointer-events-none absolute left-2.5 text-ink-muted" />
                <select
                  id="select-global-repo-filter"
                  aria-label="Filter workspace by repository"
                  value={selectedRepo}
                  onChange={(e) => onChangeSelectedRepo(e.target.value)}
                  className="h-7 appearance-none rounded-full border border-hairline-strong bg-canvas pr-7 pl-7 text-[12.5px] font-medium text-ink outline-none transition-colors hover:bg-muted cursor-pointer"
                >
                  <option value="all">All repos</option>
                  {repositories.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
                <ChevronDownIcon size={13} className="pointer-events-none absolute right-2.5 text-ink-secondary" />
              </div>
              <ChevronRightIcon size={14} className="text-ink-muted" />
              <h1 className="m-0 text-[14px] font-semibold tracking-tight text-ink">{SECTION_TITLES[section]}</h1>
            </HStack>
          )}
        </div>

        <div className="wc-no-drag flex items-center gap-2">
          {pendingApprovalsCount > 0 ? (
            <button
              type="button"
              id="btn-open-approvals-drawer"
              onClick={onOpenApprovals}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline-strong bg-status-amber px-2.5 text-[11.5px] font-medium text-status-amber-ink transition-opacity hover:opacity-90 cursor-pointer tabular-nums"
            >
              <HandApprovalIcon size={12} />
              <span>{pendingApprovalsCount} {pendingApprovalsCount === 1 ? 'approval' : 'approvals'}</span>
            </button>
          ) : null}

          {section === 'red-team' ? (
            <Button id="btn-new-redteam-prompt-tab" variant="outline" size="sm" onClick={() => onNavigate('red-team', 'composer')}>
              <PlusIcon size={13} />
              <span>New assessment</span>
            </Button>
          ) : section === 'finding-detail' && activeFinding ? (
            <>
              <Button id="btn-topbar-mark-duplicate" variant="outline" size="sm" className="h-8 rounded-full border-hairline-strong bg-canvas px-3.5 text-ink hover:bg-muted" onClick={() => onMarkDuplicate?.(activeFinding.id)}>
                Mark as duplicate
              </Button>
              <div className="inline-flex h-8 items-center overflow-hidden rounded-full border border-hairline-strong bg-canvas text-[12.5px] font-medium text-ink">
                <button type="button" id="btn-topbar-continue-fix" onClick={() => onContinueFix?.(activeFinding)} className="inline-flex h-full items-center gap-1.5 px-3.5 transition-colors hover:bg-muted cursor-pointer">
                  <RedTeamSparkIcon size={13} />
                  <span>{activeFinding.fixId ? 'Continue fix' : 'Start fix'}</span>
                </button>
                <span className="h-4 w-px bg-hairline-strong" aria-hidden="true" />
                <button type="button" aria-label="Fix options" title="Open fix drawer" onClick={() => onContinueFix?.(activeFinding)} className="inline-flex h-full items-center justify-center px-2.5 text-ink-secondary transition-colors hover:bg-muted hover:text-ink cursor-pointer">
                  <ChevronDownIcon size={13} />
                </button>
              </div>
            </>
          ) : section === 'repositories' ? (
            <>
              <button type="button" aria-label="Repository options" title="Repository settings" onClick={() => onNavigate('settings')} className="inline-flex size-8 items-center justify-center rounded-full border border-hairline-strong bg-canvas text-ink-secondary transition-colors hover:bg-muted hover:text-ink cursor-pointer">
                <MoreHorizontalIcon size={15} />
              </button>
              <Button id="btn-enable-security-scans" size="default" onClick={onOpenNewScan}>
                Enable security scans
              </Button>
            </>
          ) : null}

          <Button variant="ghost" size="icon-sm" title="Toggle fullscreen workspace" aria-label="Toggle fullscreen workspace" onClick={toggleWindowFullscreen}>
            <ExpandDiagonalIcon size={13} />
          </Button>
          {onBackToLanding ? (
            <Button
              id="btn-back-to-landing"
              variant="ghost"
              size="sm"
              title="Return to Nightfall overview page"
              onClick={onBackToLanding}
            >
              <span>Landing</span>
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function StagePill({ id, active, icon, label, onClick }: { id: string; active: boolean; icon: React.ReactNode; label: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium transition-colors cursor-pointer',
        active ? 'bg-canvas text-ink shadow-2xs' : 'text-ink-secondary hover:text-ink',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
