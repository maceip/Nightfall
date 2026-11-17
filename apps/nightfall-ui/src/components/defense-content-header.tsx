import React from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import type { FindingRecord, RepositoryRecord } from '@nightfall/core-contracts';
import {
  Button,
  ChevronDownIcon,
  MoreHorizontalIcon,
  RedTeamSparkIcon,
  ShieldAlertIcon,
} from '@nightfall/ui-kit';
import type { PrimarySection, RedTeamStage } from '../hooks/use-nightfall-router.js';

export type DefenseContentHeaderProps = {
  section: PrimarySection;
  killSwitchEngaged: boolean;
  selectedRepo: string;
  repositories: RepositoryRecord[];
  activeFinding?: FindingRecord;
  onNavigate: (section: PrimarySection, rtStage?: RedTeamStage) => void;
  onOpenNewScan: () => void;
  onToggleKillSwitch: () => void;
  onChangeSelectedRepo: (repo: string) => void;
  onMarkDuplicate?: (findingId: string) => void;
  onContinueFix?: (finding: FindingRecord) => void;
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

export function DefenseContentHeader({
  section,
  killSwitchEngaged,
  selectedRepo,
  repositories,
  activeFinding,
  onNavigate,
  onOpenNewScan,
  onToggleKillSwitch,
  onChangeSelectedRepo,
  onMarkDuplicate,
  onContinueFix,
}: DefenseContentHeaderProps): React.ReactElement {
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
            <span>
              Emergency Sandbox Kill-Switch Engaged — active Red Team &amp; LiteBox probes are halted.
            </span>
          </HStack>
          <Button
            id="btn-emergency-kill-switch-resume"
            variant="outline"
            size="sm"
            onClick={onToggleKillSwitch}
          >
            Resume operations
          </Button>
        </div>
      ) : null}

      {section !== 'red-team' ? (
        <div className="flex h-13 shrink-0 items-center justify-between border-b border-hairline bg-canvas px-6">
          <div className="flex items-center gap-2">
            {section === 'finding-detail' && activeFinding ? (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('findings')}
                  className="text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink cursor-pointer"
                >
                  Findings
                </button>
                <span className="text-ink-muted">/</span>
                <h1 className="m-0 text-[13.5px] font-semibold text-ink">{activeFinding.id}</h1>
              </>
            ) : (
              <>
                <div className="relative inline-flex items-center">
                  <select
                    id="select-global-repo-filter"
                    aria-label="Filter workspace by repository"
                    value={selectedRepo}
                    onChange={(e) => onChangeSelectedRepo(e.target.value)}
                    className="h-7 appearance-none rounded-full border border-hairline-strong bg-canvas pr-7 pl-3 text-[12.5px] font-medium text-ink outline-none transition-colors hover:bg-muted cursor-pointer"
                  >
                    <option value="all">All repos</option>
                    {repositories.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    size={13}
                    className="pointer-events-none absolute right-2.5 text-ink-secondary"
                  />
                </div>
                <span className="text-ink-muted">/</span>
                <h1 className="m-0 text-[14px] font-semibold tracking-tight text-ink">
                  {SECTION_TITLES[section]}
                </h1>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {section === 'finding-detail' && activeFinding ? (
              <>
                <Button
                  id="btn-topbar-mark-duplicate"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-hairline-strong bg-canvas px-3.5 text-ink hover:bg-muted"
                  onClick={() => onMarkDuplicate?.(activeFinding.id)}
                >
                  Mark as duplicate
                </Button>
                <div className="inline-flex h-8 items-center overflow-hidden rounded-full border border-hairline-strong bg-canvas text-[12.5px] font-medium text-ink">
                  <button
                    type="button"
                    id="btn-topbar-continue-fix"
                    onClick={() => onContinueFix?.(activeFinding)}
                    className="inline-flex h-full items-center gap-1.5 px-3.5 transition-colors hover:bg-muted cursor-pointer"
                  >
                    <RedTeamSparkIcon size={13} />
                    <span>{activeFinding.fixId ? 'Continue fix' : 'Start fix'}</span>
                  </button>
                  <span className="h-4 w-px bg-hairline-strong" aria-hidden="true" />
                  <button
                    type="button"
                    aria-label="Fix options"
                    title="Open fix drawer"
                    onClick={() => onContinueFix?.(activeFinding)}
                    className="inline-flex h-full items-center justify-center px-2.5 text-ink-secondary transition-colors hover:bg-muted hover:text-ink cursor-pointer"
                  >
                    <ChevronDownIcon size={13} />
                  </button>
                </div>
              </>
            ) : section === 'repositories' ? (
              <>
                <button
                  type="button"
                  aria-label="Repository options"
                  title="Repository settings"
                  onClick={() => onNavigate('settings')}
                  className="inline-flex size-8 items-center justify-center rounded-full border border-hairline-strong bg-canvas text-ink-secondary transition-colors hover:bg-muted hover:text-ink cursor-pointer"
                >
                  <MoreHorizontalIcon size={15} />
                </button>
                <Button id="btn-enable-security-scans" size="default" onClick={onOpenNewScan}>
                  Enable security scans
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
