import React from 'react';
import type { FixProposal, OverviewSummary, Severity } from '@nightfall/core-contracts';
import {
  Button,
  Card,
  ChevronRightIcon,
  DailyTrendChart,
  SectionHeader,
  StatusBadge,
} from '@nightfall/ui-kit';

export type OverviewScreenProps = {
  overview: OverviewSummary;
  fixes: FixProposal[];
  onNavigateFindings: (severity?: Severity | null) => void;
  onNavigateFixes: () => void;
  onSelectFix: (fix: FixProposal) => void;
};

const POSTURE_BARS: Array<{
  key: 'critical' | 'high' | 'medium';
  label: string;
  barClass: string;
}> = [
  { key: 'critical', label: 'Critical', barClass: 'bg-rose-600' },
  { key: 'high', label: 'High', barClass: 'bg-orange-500' },
  { key: 'medium', label: 'Medium', barClass: 'bg-amber-500' },
];

export function OverviewScreen({
  overview,
  fixes,
  onNavigateFindings,
  onNavigateFixes,
  onSelectFix,
}: OverviewScreenProps): React.ReactElement {
  const proposedFixes = fixes.filter((f) => f.status === 'proposed').slice(0, 3);
  const maxBar = Math.max(
    overview.severityCounts.critical,
    overview.severityCounts.high,
    overview.severityCounts.medium,
    1,
  );

  return (
    <div id="view-overview" className="space-y-5 tabular-nums">
      <div>
        <SectionHeader
          title="Proposed fixes"
          actions={
            <Button
              id="btn-overview-all-fixes"
              variant="ghost"
              size="sm"
              onClick={onNavigateFixes}
            >
              <span>{overview.proposedFixesCount}</span>
              <ChevronRightIcon size={15} />
            </Button>
          }
        />

        {proposedFixes.length === 0 ? (
          <Card className="text-[13px] text-primary-600">
            No pending proposed fixes. Select a finding to synthesize a verified patch in Nightfall
            Defense Factory.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {proposedFixes.map((fix) => (
              <Card key={fix.id} className="flex flex-col justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="m-0 text-[13.5px] font-semibold leading-snug text-ink">
                    {fix.title}
                  </h3>
                  <p className="m-0 text-xs text-primary-600">
                    Fixes {fix.findingIds.length} finding{fix.findingIds.length === 1 ? '' : 's'}
                  </p>
                  <p className="m-0 text-xs text-primary-500">{fix.repository}</p>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <StatusBadge status={fix.status} />
                  <Button
                    id={`btn-overview-review-${fix.id}`}
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectFix(fix)}
                  >
                    Review
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-primary-200 bg-surface md:grid-cols-2 md:divide-x md:divide-primary-200">
        <div className="p-5">
          <button
            type="button"
            onClick={() => onNavigateFindings(null)}
            className="mb-4 flex w-full items-center justify-between text-left cursor-pointer"
          >
            <span className="text-[14.5px] font-medium text-ink">
              <span className="font-semibold">{overview.openFindingsCount}</span> Open findings
            </span>
            <ChevronRightIcon size={16} className="text-primary-500" />
          </button>

          <div className="space-y-3">
            {POSTURE_BARS.map((row) => {
              const count = overview.severityCounts[row.key];
              const widthPct = count === 0 ? 4 : Math.max(10, Math.round((count / maxBar) * 100));
              return (
                <div
                  key={row.key}
                  id={`overview-sev-row-${row.key}`}
                  onClick={() => onNavigateFindings(row.key)}
                  className="grid grid-cols-[76px_1fr_40px] items-center gap-3 rounded-md px-1.5 py-1 transition-colors hover:bg-primary-100/70 cursor-pointer"
                >
                  <span className="text-[13px] font-medium text-ink">{row.label}</span>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-primary-100">
                    <div
                      className={`h-full rounded-full ${row.barClass}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="text-right text-[13px] font-medium text-ink">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-primary-200 p-5 md:border-t-0">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[14.5px] font-medium text-ink">
              <span className="font-semibold">{overview.fixedFindingsCount}</span> Fixed findings
            </span>
            <ChevronRightIcon size={16} className="text-primary-500" />
          </div>
          <div className="mb-2 text-xs text-primary-500">Daily trend · last 7 days (UTC)</div>
          <DailyTrendChart data={overview.dailyTrend} />
        </div>
      </div>

      <Card className="p-5">
        <SectionHeader
          title="Finding status"
          actions={
            <select
              id="select-overview-timeframe"
              defaultValue="all"
              aria-label="Finding status timeframe"
              className="h-7 rounded-md border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-ink outline-none"
            >
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="7d">Last 7 days</option>
            </select>
          }
        />

        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatusCounterCell count={overview.statusCounts.new} label="New" />
          <StatusCounterCell count={overview.statusCounts.triaged} label="Triaged" />
          <StatusCounterCell count={overview.statusCounts.in_progress} label="In Progress" />
          <StatusCounterCell count={overview.statusCounts.fixed} label="Fixed" />
        </div>
      </Card>
    </div>
  );
}

function StatusCounterCell({
  count,
  label,
}: {
  count: number;
  label: string;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-primary-200/70 bg-primary-50/60 px-3.5 py-3">
      <div className="text-2xl font-semibold tracking-tight text-ink">{count}</div>
      <div className="mt-0.5 text-xs text-primary-600">{label}</div>
    </div>
  );
}
