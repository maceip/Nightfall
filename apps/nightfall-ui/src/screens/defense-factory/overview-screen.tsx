import React, { useMemo, useState } from 'react';
import { Code } from '@astryxdesign/core/Code';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import type {
  FindingRecord,
  FixProposal,
  MantisToolchainStatus,
  OverviewSummary,
  ScorecardReportRecord,
  Severity,
} from '@nightfall/core-contracts';
import {
  Button,
  ChevronRightIcon,
  ConnectedKpiStrip,
  DailyTrendChart,
  GitBranchIcon,
  MantisClawIcon,
  ScorecardPostureIcon,
  ScorecardScorePill,
  SectionHeader,
  SeverityProportionalBars,
  StatusBadge,
} from '@nightfall/ui-kit';

export type OverviewScreenProps = {
  overview: OverviewSummary;
  findings?: FindingRecord[];
  fixes: FixProposal[];
  scorecardReports?: ScorecardReportRecord[];
  mantisToolchain?: MantisToolchainStatus;
  onNavigateFindings: (severity?: Severity | null) => void;
  onNavigateFixes: () => void;
  onSelectFix: (fix: FixProposal) => void;
  onNavigateScorecard?: () => void;
  onNavigateSettings?: () => void;
};

type TimeframeWindow = 'all' | '30d' | '7d';

export function OverviewScreen({
  overview,
  findings,
  fixes,
  scorecardReports,
  mantisToolchain,
  onNavigateFindings,
  onNavigateFixes,
  onSelectFix,
  onNavigateScorecard,
  onNavigateSettings,
}: OverviewScreenProps): React.ReactElement {
  const [timeframe, setTimeframe] = useState<TimeframeWindow>('all');
  const proposedFixes = fixes.filter((f) => f.status === 'proposed').slice(0, 3);

  const avgScore =
    typeof overview.averageScorecardScore === 'number' &&
    Number.isFinite(overview.averageScorecardScore)
      ? overview.averageScorecardScore
      : scorecardReports && scorecardReports.length > 0
        ? scorecardReports.reduce(
            (sum, r) => sum + (Number.isFinite(r.aggregateScore) ? r.aggregateScore : 0),
            0,
          ) / scorecardReports.length
        : null;

  const windowedCounts = useMemo(() => {
    if (timeframe === 'all' || !findings) {
      return {
        new: overview.statusCounts.new,
        triaged: overview.statusCounts.triaged,
        in_progress: overview.statusCounts.in_progress,
        fixed: overview.fixedFindingsCount,
      };
    }
    const days = timeframe === '7d' ? 7 : 30;
    const referenceMs = findings.reduce((maxMs, f) => {
      const parsed = Date.parse(f.updatedAt || f.createdAt);
      return Number.isFinite(parsed) && parsed > maxMs ? parsed : maxMs;
    }, 0);
    const cutoffMs = (referenceMs || Date.now()) - days * 24 * 60 * 60 * 1000;

    const counts = { new: 0, triaged: 0, in_progress: 0, fixed: 0 };
    for (const f of findings) {
      const ts = Date.parse(f.updatedAt || f.createdAt);
      if (Number.isFinite(ts) && ts < cutoffMs) continue;
      if (f.status === 'new') counts.new += 1;
      else if (f.status === 'triaged') counts.triaged += 1;
      else if (f.status === 'in_progress') counts.in_progress += 1;
      else if (f.status === 'fixed') counts.fixed += 1;
    }
    return counts;
  }, [timeframe, findings, overview]);

  const fixedLabel =
    timeframe === '30d' ? 'Fixed in last 30d' : timeframe === '7d' ? 'Fixed in last 7d' : 'Fixed';
  const mantisAvailable = mantisToolchain?.available !== false;

  return (
    <VStack id="view-overview" gap={5} className="tabular-nums">
      <section>
        <SectionHeader
          title="Proposed fixes"
          actions={
            <button
              id="btn-overview-all-fixes"
              type="button"
              onClick={onNavigateFixes}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-muted hover:text-ink"
            >
              <span>View all</span>
              <span className="font-semibold text-ink">{overview.proposedFixesCount}</span>
              <ChevronRightIcon size={15} />
            </button>
          }
        />

        {proposedFixes.length === 0 ? (
          <div className="rounded-2xl border border-hairline bg-canvas p-4 text-[13px] text-ink-secondary">
            No pending proposed fixes. Select a finding to synthesize a verified patch in Nightfall
            Defense Factory.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {proposedFixes.map((fix) => (
              <div
                key={fix.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-hairline bg-canvas p-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-ink-muted">
                    <span>{fix.repository}</span>
                    {fix.branchName ? (
                      <span className="inline-flex items-center gap-1">
                        <span>·</span>
                        <GitBranchIcon size={11} />
                        <span>{fix.branchName}</span>
                      </span>
                    ) : null}
                  </div>
                  <h3 className="m-0 text-[13.5px] font-semibold leading-snug text-ink text-balance">
                    {fix.title}
                  </h3>
                  <p className="m-0 text-xs text-ink-secondary">
                    Fixes {fix.findingIds.length} finding{fix.findingIds.length === 1 ? '' : 's'}
                  </p>
                </div>

                <HStack justify="between" align="center" gap={2}>
                  <span className="text-xs text-ink-muted">{fix.snapshotLabel}</span>
                  <Button
                    id={`btn-overview-review-${fix.id}`}
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectFix(fix)}
                  >
                    Review
                  </Button>
                </HStack>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="grid grid-cols-1 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-canvas lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="space-y-4 p-5">
            <button
              type="button"
              onClick={() => onNavigateFindings(null)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[19px] font-semibold text-ink">
                  {overview.openFindingsCount}
                </span>
                <span className="text-[15px] font-medium text-ink-secondary">Open findings</span>
              </div>
              <ChevronRightIcon size={16} className="text-ink-muted" />
            </button>

            <SeverityProportionalBars
              counts={overview.severityCounts}
              onSelectSeverity={(sev) => onNavigateFindings(sev)}
            />
          </div>

          <div className="space-y-3 p-5">
            <button
              type="button"
              onClick={onNavigateFixes}
              className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
            >
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[19px] font-semibold text-ink">
                    {overview.fixedFindingsCount}
                  </span>
                  <span className="text-[15px] font-medium text-ink-secondary">Fixed findings</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">Daily trend · last 7 days (UTC)</div>
              </div>
              <ChevronRightIcon size={16} className="text-ink-muted" />
            </button>

            <DailyTrendChart data={overview.dailyTrend} />
          </div>
        </div>
      </section>

      <section className="space-y-2.5">
        <SectionHeader
          title="Finding status"
          actions={
            <select
              id="select-overview-timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as TimeframeWindow)}
              aria-label="Finding status timeframe"
              className="h-8 rounded-full border border-hairline-strong bg-canvas px-3 text-xs font-medium text-ink outline-none"
            >
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="7d">Last 7 days</option>
            </select>
          }
        />

        <ConnectedKpiStrip
          labelFirst={false}
          cells={[
            {
              key: 'new',
              label: 'New',
              value: windowedCounts.new,
              onClick: () => onNavigateFindings(null),
            },
            {
              key: 'triaged',
              label: 'Triaged',
              value: windowedCounts.triaged,
              onClick: () => onNavigateFindings(null),
            },
            {
              key: 'in_progress',
              label: 'In progress',
              value: windowedCounts.in_progress,
              onClick: () => onNavigateFindings(null),
            },
            {
              key: 'fixed',
              label: fixedLabel,
              value: windowedCounts.fixed,
              onClick: () => onNavigateFixes(),
            },
          ]}
        />
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          id="btn-overview-scorecard-strip"
          type="button"
          onClick={() => onNavigateScorecard?.()}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-hairline bg-canvas px-4 py-3 text-left transition-colors hover:bg-sidebar"
        >
          <HStack gap={2} align="center" wrap="wrap">
            <ScorecardPostureIcon size={16} className="text-status-mint-ink" />
            <span className="text-[13px] font-semibold text-ink">Nightfall Scorecard</span>
            <ScorecardScorePill score={avgScore} />
          </HStack>
          <ChevronRightIcon size={15} className="text-ink-muted" />
        </button>

        <button
          id="btn-overview-mantis-strip"
          type="button"
          onClick={() => onNavigateSettings?.()}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-hairline bg-canvas px-4 py-3 text-left transition-colors hover:bg-sidebar"
        >
          <HStack gap={2} align="center" wrap="wrap">
            <MantisClawIcon size={16} className="text-accent-violet" />
            <span className="text-[13px] font-semibold text-ink">Mantis Pipeline</span>
            <Code size="inherit">services/mantis-engine</Code>
            {mantisAvailable ? (
              <span className="text-xs text-ink-muted">20-stage DAG</span>
            ) : (
              <StatusBadge status="verifying" label="Engine Unavailable" />
            )}
          </HStack>
          <ChevronRightIcon size={15} className="text-ink-muted" />
        </button>
      </div>
    </VStack>
  );
}
