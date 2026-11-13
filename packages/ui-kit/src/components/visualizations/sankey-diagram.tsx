import React from 'react';
import type { SankeyLink, Severity } from '@nightfall/core-contracts';
import { cn } from '../../lib/utils.js';

export type SankeyDiagramProps = {
  totalOpen: number;
  severityCounts: Record<Severity, number>;
  statusCounts: { new: number; triaged: number; in_progress: number };
  links: SankeyLink[];
  selectedSeverity: Severity | null;
  onSelectSeverity: (sev: Severity | null) => void;
  className?: string;
};

const SEV_META: Array<{ key: Severity; label: string; accent: string; ribbon: string }> = [
  { key: 'critical', label: 'Critical', accent: 'oklch(0.52 0.2 18)', ribbon: 'oklch(0.58 0.18 18 / 0.18)' },
  { key: 'high', label: 'High', accent: 'oklch(0.64 0.19 42)', ribbon: 'oklch(0.64 0.19 42 / 0.18)' },
  { key: 'medium', label: 'Medium', accent: 'oklch(0.68 0.15 80)', ribbon: 'oklch(0.68 0.15 80 / 0.18)' },
  { key: 'low', label: 'Low', accent: 'oklch(0.55 0.18 255)', ribbon: 'oklch(0.55 0.18 255 / 0.17)' },
  { key: 'informational', label: 'Informational', accent: 'oklch(0.555 0.004 80)', ribbon: 'oklch(0.555 0.004 80 / 0.16)' },
];

function safeCount(val: number | undefined): number {
  if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) return 0;
  return Math.round(val);
}

function ribbonWidth(value: number, total: number, minW: number, maxW: number): number {
  const safeVal = safeCount(value);
  const safeDenom = Math.max(1, safeCount(total));
  if (safeVal === 0) return minW;
  const scaled = (safeVal / safeDenom) * (maxW * 2.4);
  return Number(Math.max(minW, Math.min(maxW, scaled)).toFixed(2));
}

function SankeyNodeLabel({
  x,
  y,
  accent,
  label,
  count,
}: {
  x: number;
  y: number;
  accent: string;
  label: string;
  count: number;
}): React.ReactElement {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x="0" y="2" width="3.5" height="38" rx="1.75" fill={accent} />
      <text x="10" y="17" className="fill-primary-600 text-[12px] font-medium">
        {label}
      </text>
      <text x="10" y="37" className="fill-ink text-[15px] font-semibold">
        {count}
      </text>
    </g>
  );
}

export function SankeyDiagram({
  totalOpen,
  severityCounts,
  statusCounts,
  links,
  selectedSeverity,
  onSelectSeverity,
  className,
}: SankeyDiagramProps): React.ReactElement {
  const computedOpen =
    safeCount(totalOpen) || SEV_META.reduce((acc, s) => acc + safeCount(severityCounts[s.key]), 0);

  if (selectedSeverity) {
    const sevMeta = SEV_META.find((s) => s.key === selectedSeverity) ?? SEV_META[0]!;
    const sevTotal = safeCount(severityCounts[selectedSeverity]);
    const denom = Math.max(1, sevTotal);
    const toInProgress = safeCount(
      links.find((l) => l.source === sevMeta.label && l.target === 'In Progress')?.value,
    );
    const toTriaged = safeCount(
      links.find((l) => l.source === sevMeta.label && l.target === 'Triaged')?.value,
    );
    const toNew = safeCount(
      links.find((l) => l.source === sevMeta.label && l.target === 'New')?.value,
    );

    return (
      <div
        id="findings-sankey-focused"
        className={cn('relative rounded-xl border border-primary-200 bg-surface p-4 tabular-nums', className)}
      >
        <svg
          viewBox="0 0 880 185"
          className="block h-auto w-full select-none"
          role="img"
          aria-label={`Filtered ${sevMeta.label} findings Sankey chart`}
        >
          <path
            d="M 102 48 C 195 48, 215 48, 295 48"
            stroke="oklch(0.715 0.004 80 / 0.28)"
            strokeWidth={ribbonWidth(sevTotal, denom, 4, 22)}
            fill="none"
          />
          <path
            d="M 383 38 C 520 38, 610 36, 755 36"
            stroke="oklch(0.55 0.18 255 / 0.2)"
            strokeWidth={ribbonWidth(toInProgress, denom, 2, 16)}
            fill="none"
          />
          <path
            d="M 383 48 C 500 58, 560 95, 625 95"
            stroke={sevMeta.ribbon}
            strokeWidth={ribbonWidth(toTriaged, denom, 2, 16)}
            fill="none"
          />
          <path
            d="M 383 58 C 460 88, 505 145, 550 145"
            stroke={sevMeta.ribbon}
            strokeWidth={ribbonWidth(toNew, denom, 2, 16)}
            fill="none"
          />

          <SankeyNodeLabel x={26} y={26} accent="oklch(0.555 0.004 80)" label="Findings" count={sevTotal} />

          <g transform="translate(295, 16)" className="cursor-pointer" onClick={() => onSelectSeverity(null)}>
            <rect x="0" y="0" width="92" height="58" rx="10" className="fill-surface stroke-primary-300" strokeWidth="1.2" />
            <rect x="0" y="9" width="3.5" height="40" rx="1.75" fill={sevMeta.accent} />
            <text x="12" y="25" className="fill-ink text-[12px] font-semibold">
              {sevMeta.label}
            </text>
            <text x="12" y="46" className="fill-ink text-[15px] font-semibold">
              {sevTotal}
            </text>
          </g>

          <SankeyNodeLabel x={758} y={16} accent="oklch(0.55 0.18 255)" label="In Progress" count={toInProgress} />
          <SankeyNodeLabel x={628} y={76} accent="oklch(0.555 0.004 80)" label="Triaged" count={toTriaged} />
          <SankeyNodeLabel x={552} y={126} accent="oklch(0.555 0.004 80)" label="New" count={toNew} />
        </svg>

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            id="btn-reset-sankey-filter"
            onClick={() => onSelectSeverity(null)}
            className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-100 px-3 py-1 text-xs font-medium text-ink hover:bg-primary-200 cursor-pointer"
          >
            Showing {sevMeta.label} ({sevTotal}) · Clear filter ×
          </button>
        </div>
      </div>
    );
  }

  const sevY = [24, 78, 134, 190, 244];
  const statusNodes = [
    { label: 'In Progress', count: safeCount(statusCounts.in_progress), x: 752, y: 28, stroke: 'oklch(0.55 0.18 255)' },
    { label: 'Triaged', count: safeCount(statusCounts.triaged), x: 616, y: 88, stroke: 'oklch(0.555 0.004 80)' },
    { label: 'New', count: safeCount(statusCounts.new), x: 526, y: 150, stroke: 'oklch(0.555 0.004 80)' },
  ];

  return (
    <div id="findings-sankey-full" className={cn('rounded-xl border border-primary-200 bg-surface p-4 tabular-nums', className)}>
      <svg viewBox="0 0 880 292" className="block h-auto w-full select-none" role="img" aria-label="Findings severity to status Sankey flow">
        {SEV_META.map((sev, idx) => {
          const val = safeCount(severityCounts[sev.key]);
          const y2 = (sevY[idx] ?? 24) + 20;
          const y1 = 128 + (idx - 2) * 14;
          return (
            <path
              key={sev.key}
              d={`M 98 ${y1} C 185 ${y1}, 205 ${y2}, 295 ${y2}`}
              stroke="oklch(0.715 0.004 80 / 0.24)"
              strokeWidth={ribbonWidth(val, computedOpen, 2.5, 24)}
              fill="none"
            />
          );
        })}

        {SEV_META.map((sev, idx) => {
          const y1 = (sevY[idx] ?? 24) + 20;
          return statusNodes.map((st, sIdx) => {
            const linkVal = safeCount(links.find((l) => l.source === sev.label && l.target === st.label)?.value);
            if (linkVal <= 0) return null;
            const y2 = st.y + 18 + (idx - 2) * 2;
            return (
              <path
                key={`${sev.key}-${st.label}`}
                d={`M 378 ${y1 + (sIdx - 1) * 4} C 455 ${y1}, ${st.x - 85} ${y2}, ${st.x - 6} ${y2}`}
                stroke={sIdx === 0 ? 'oklch(0.55 0.18 255 / 0.18)' : sev.ribbon}
                strokeWidth={ribbonWidth(linkVal, computedOpen, 1.5, 18)}
                fill="none"
              />
            );
          });
        })}

        <SankeyNodeLabel x={26} y={108} accent="oklch(0.555 0.004 80)" label="Findings" count={computedOpen} />

        {SEV_META.map((sev, idx) => {
          const y = sevY[idx] ?? 24;
          const count = safeCount(severityCounts[sev.key]);
          return (
            <g
              key={sev.key}
              id={`sankey-node-${sev.key}`}
              transform={`translate(298, ${y})`}
              className="group cursor-pointer"
              onClick={() => onSelectSeverity(sev.key)}
            >
              <rect x="-6" y="-4" width="108" height="48" rx="8" className="fill-transparent transition-colors group-hover:fill-primary-100" />
              <rect x="0" y="2" width="3.5" height="38" rx="1.75" fill={sev.accent} />
              <text x="10" y="17" className="fill-primary-700 text-[12px] font-medium">{sev.label}</text>
              <text x="10" y="37" className="fill-ink text-[15px] font-semibold">{count}</text>
            </g>
          );
        })}

        {statusNodes.map((st) => (
          <SankeyNodeLabel key={st.label} x={st.x} y={st.y} accent={st.stroke} label={st.label} count={st.count} />
        ))}
      </svg>
    </div>
  );
}
