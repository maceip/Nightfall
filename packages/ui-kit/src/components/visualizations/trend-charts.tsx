import React from 'react';
import type { CampaignActivityPoint } from '@nightfall/core-contracts';
import { cn } from '../../lib/utils.js';

export type DailyTrendPoint = {
  date: string;
  currentlyFixed: number;
  newFindings: number;
};

export function DailyTrendChart({
  data,
  className,
}: {
  data: DailyTrendPoint[];
  className?: string;
}): React.ReactElement {
  const width = 400;
  const height = 124;
  const padX = 8;
  const padY = 14;

  const safePoints: DailyTrendPoint[] =
    data.length >= 2
      ? data
      : data.length === 1
        ? [data[0]!, data[0]!]
        : [
            { date: 'D-1', currentlyFixed: 0, newFindings: 0 },
            { date: 'D-0', currentlyFixed: 0, newFindings: 0 },
          ];

  const values = safePoints.flatMap((d) => [
    Number.isFinite(d.currentlyFixed) ? d.currentlyFixed : 0,
    Number.isFinite(d.newFindings) ? d.newFindings : 0,
  ]);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 4);
  const span = Math.max(1, rawMax - rawMin);

  function toX(idx: number): number {
    return Number((padX + (idx / Math.max(1, safePoints.length - 1)) * (width - padX * 2)).toFixed(1));
  }

  function toY(val: number): number {
    const clean = Number.isFinite(val) ? val : 0;
    return Number((height - padY - ((clean - rawMin) / span) * (height - padY * 2)).toFixed(1));
  }

  const fixedPoints = safePoints.map((d, i) => `${toX(i)},${toY(d.currentlyFixed)}`).join(' ');
  const newPoints = safePoints.map((d, i) => `${toX(i)},${toY(d.newFindings)}`).join(' ');
  const areaPath = `M ${toX(0)} ${height - padY} L ${safePoints
    .map((d, i) => `${toX(i)} ${toY(d.currentlyFixed)}`)
    .join(' L ')} L ${toX(safePoints.length - 1)} ${height - padY} Z`;

  return (
    <div className={cn('space-y-2 tabular-nums', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block"
        role="img"
        aria-label="7-day fixed vs new findings trend"
      >
        <defs>
          <linearGradient id="nfFixedTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.58 0.16 150)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="oklch(0.58 0.16 150)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke="oklch(0.928 0.004 80)"
          strokeWidth="1"
        />
        <path d={areaPath} fill="url(#nfFixedTrendFill)" />
        <polyline
          fill="none"
          stroke="oklch(0.52 0.2 18)"
          strokeWidth="1.75"
          strokeDasharray="4 4"
          points={newPoints}
        />
        <polyline
          fill="none"
          stroke="oklch(0.55 0.16 150)"
          strokeWidth="2"
          points={fixedPoints}
        />
      </svg>
      <div className="flex items-center gap-4 text-xs text-primary-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-emerald-600" />
          <span>Currently fixed</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 border-t-2 border-dashed border-rose-700" />
          <span>New findings</span>
        </span>
      </div>
    </div>
  );
}

export function CampaignActivityTimeline({
  series,
  startLabel = 'Window start',
  endLabel = 'Latest tick',
  className,
}: {
  series: CampaignActivityPoint[];
  startLabel?: string;
  endLabel?: string;
  className?: string;
}): React.ReactElement {
  const width = 420;
  const height = 44;
  const safeSeries: CampaignActivityPoint[] =
    series.length >= 2
      ? series
      : series.length === 1
        ? [series[0]!, series[0]!]
        : [
            { timestamp: 't0', requestsCount: 0, findingConfirmedTick: false },
            { timestamp: 't1', requestsCount: 0, findingConfirmedTick: false },
          ];
  const maxReq = Math.max(...safeSeries.map((s) => s.requestsCount || 0), 10);
  const points = safeSeries
    .map((pt, idx) => {
      const x = (idx / Math.max(1, safeSeries.length - 1)) * width;
      const y = height - 4 - ((pt.requestsCount || 0) / maxReq) * (height - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className={cn('space-y-2.5 tabular-nums', className)}>
      <div className="grid grid-cols-[76px_1fr] items-center gap-3">
        <span className="text-xs font-medium text-primary-600">Activity</span>
        <div>
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-11 block">
            <line
              x1="0"
              y1={height - 2}
              x2={width}
              y2={height - 2}
              stroke="oklch(0.928 0.004 80)"
              strokeWidth="1"
            />
            <polyline
              fill="none"
              stroke="oklch(0.55 0.18 255)"
              strokeWidth="1.75"
              points={points}
            />
          </svg>
          <div className="mt-0.5 flex justify-between text-[11px] text-primary-500">
            <span>{startLabel}</span>
            <span>{endLabel}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[76px_1fr] items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600">
          <span className="size-2 rounded-full bg-emerald-600" />
          <span>Findings</span>
        </span>
        <div
          className="flex h-4 items-center gap-0.5"
          role="img"
          aria-label="Confirmed findings timeline ticks"
        >
          {safeSeries.map((pt, idx) => (
            <span
              key={idx}
              title={`${pt.timestamp}: ${pt.requestsCount} reqs${pt.findingConfirmedTick ? ' · Finding confirmed' : ''}`}
              className={cn(
                'h-3.5 flex-1 rounded-[1px]',
                pt.findingConfirmedTick ? 'bg-emerald-600' : 'bg-primary-200',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function BudgetSignalBars({
  pct,
  className,
}: {
  pct: number;
  className?: string;
}): React.ReactElement {
  const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
  const activeBars = safePct >= 75 ? 4 : safePct >= 50 ? 3 : safePct >= 25 ? 2 : safePct > 0 ? 1 : 0;
  const barClasses = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4'];

  return (
    <div
      title={`Campaign budget remaining: ${safePct}%`}
      className={cn('inline-flex items-center gap-2 tabular-nums', className)}
    >
      <div className="inline-flex items-end gap-0.5" aria-hidden="true">
        {barClasses.map((heightCls, idx) => (
          <span
            key={idx}
            className={cn(
              'w-1 rounded-[1px]',
              heightCls,
              idx < activeBars ? 'bg-emerald-600' : 'bg-primary-300',
            )}
          />
        ))}
      </div>
      <div className="text-xs text-primary-700">
        <span className="font-semibold text-ink">{safePct}%</span>{' '}
        <span className="text-primary-500">Left</span>
      </div>
    </div>
  );
}
