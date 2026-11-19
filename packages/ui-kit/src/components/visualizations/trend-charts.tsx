import React from 'react';
import type { CampaignActivityPoint, Severity } from '@nightfall/core-contracts';
import { cn } from '../../lib/utils.js';

export type DailyTrendPoint = {
  date: string;
  currentlyFixed: number;
  newFindings: number;
};

export function SeverityProportionalBars({
  counts,
  onSelectSeverity,
  className,
}: {
  counts: Record<Severity, number>;
  onSelectSeverity?: (severity: Severity) => void;
  className?: string;
}): React.ReactElement {
  const rows: Array<{ key: Severity; label: string; color: string; count: number }> = [
    { key: 'critical', label: 'Critical', color: '#EF1E28', count: Math.max(0, counts.critical || 0) },
    { key: 'high', label: 'High', color: '#EB6836', count: Math.max(0, counts.high || 0) },
    { key: 'medium', label: 'Medium', color: '#ECC147', count: Math.max(0, counts.medium || 0) },
    { key: 'low', label: 'Low', color: '#2563EB', count: Math.max(0, counts.low || 0) },
  ];
  const maxVal = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className={cn('group/bars space-y-1.5 tabular-nums', className)}>
      {rows.map((row) => {
        const widthPct = row.count === 0 ? 2 : Math.max(5, Math.round((row.count / maxVal) * 100));
        return (
          <button
            key={row.key}
            type="button"
            onClick={onSelectSeverity ? () => onSelectSeverity(row.key) : undefined}
            className="grid w-full grid-cols-[72px_1fr_44px] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-all group-hover/bars:opacity-35 hover:!opacity-100 hover:bg-muted cursor-pointer"
          >
            <span className="text-[13px] font-medium text-ink-secondary">{row.label}</span>
            <span className="flex items-center">
              <span
                className="h-3.5 rounded-[4px] transition-all"
                style={{ width: `${widthPct}%`, backgroundColor: row.color }}
              />
            </span>
            <span className="text-right text-[13.5px] font-semibold text-ink">
              {row.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DailyTrendChart({
  data,
  className,
}: {
  data: DailyTrendPoint[];
  className?: string;
}): React.ReactElement {
  const width = 400;
  const height = 128;
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
    return Number(
      (padX + (idx / Math.max(1, safePoints.length - 1)) * (width - padX * 2)).toFixed(1),
    );
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
        className="block h-auto w-full"
        role="img"
        aria-label="7-day fixed vs new findings trend"
      >
        <defs>
          <linearGradient id="nfFixedTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16A34A" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#16A34A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke="var(--nf-hairline)"
          strokeWidth="1"
        />
        <path d={areaPath} fill="url(#nfFixedTrendFill)" />
        <polyline
          fill="none"
          stroke="#D97706"
          strokeWidth="1.75"
          strokeDasharray="4 4"
          points={newPoints}
        />
        <polyline fill="none" stroke="#15803D" strokeWidth="2" points={fixedPoints} />
      </svg>
      <div className="flex items-center gap-4 text-[12px] text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-[#15803D]" />
          <span>Currently fixed</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 border-t-2 border-dashed border-[#D97706]" />
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
  const height = 46;
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
  const coords = safeSeries.map((pt, idx) => {
    const x = (idx / Math.max(1, safeSeries.length - 1)) * width;
    const y = height - 4 - ((pt.requestsCount || 0) / maxReq) * (height - 10);
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });
  const points = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const fillPath = `M 0 ${height - 2} L ${coords.map((c) => `${c.x} ${c.y}`).join(' L ')} L ${width} ${height - 2} Z`;

  // Normalize barcode to 48 crisp vertical ticks matching Screenshots #6, #7, #8
  const tickCount = 48;
  const ticks = Array.from({ length: tickCount }, (_, idx) => {
    const mappedIdx = Math.floor((idx / tickCount) * safeSeries.length);
    return safeSeries[Math.min(safeSeries.length - 1, mappedIdx)]!;
  });

  return (
    <div className={cn('space-y-3 tabular-nums', className)}>
      <div className="grid grid-cols-[68px_1fr] items-start gap-2.5">
        <span className="pt-1 text-[12px] font-medium text-ink-secondary">Activity</span>
        <div>
          <svg viewBox={`0 0 ${width} ${height}`} className="block h-11 w-full">
            <defs>
              <linearGradient id="nfActivityArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1D74F5" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#1D74F5" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="var(--nf-hairline)" strokeWidth="1" />
            <path d={fillPath} fill="url(#nfActivityArea)" />
            <polyline fill="none" stroke="#1D74F5" strokeWidth="1.8" points={points} />
          </svg>
          <div className="mt-0.5 flex justify-between text-[11px] text-ink-muted">
            <span>{startLabel}</span>
            <span>{endLabel}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[68px_1fr] items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-secondary">
          <span className="size-2 rounded-full bg-status-green-dot" />
          <span>Findings</span>
        </span>
        <div
          className="flex h-4 items-center justify-between gap-[2px]"
          role="img"
          aria-label="Confirmed findings timeline ticks"
        >
          {ticks.map((pt, idx) => (
            <span
              key={idx}
              title={`${pt.timestamp}: ${pt.requestsCount} reqs${pt.findingConfirmedTick ? ' · Finding confirmed' : ''}`}
              className={cn(
                'h-3.5 w-[3px] rounded-full',
                pt.findingConfirmedTick ? 'bg-status-green-dot' : 'bg-hairline-strong',
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
  const activeBars =
    safePct >= 85 ? 4 : safePct >= 60 ? 3 : safePct >= 30 ? 2 : safePct > 0 ? 1 : 0;
  const barClasses = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4'];

  return (
    <div
      title={`Campaign budget remaining: ${safePct}%`}
      className={cn('inline-flex items-center gap-2 tabular-nums', className)}
    >
      <div className="inline-flex items-end gap-[2.5px]" aria-hidden="true">
        {barClasses.map((heightCls, idx) => (
          <span
            key={idx}
            className={cn(
              'w-[3.5px] rounded-[1px]',
              heightCls,
              idx < activeBars ? 'bg-status-green-dot' : 'bg-hairline-strong',
            )}
          />
        ))}
      </div>
      <div className="leading-tight text-[11.5px]">
        <span className="font-bold text-status-mint-ink">{safePct}%</span>{' '}
        <span className="text-ink-secondary">Left</span>
      </div>
    </div>
  );
}
