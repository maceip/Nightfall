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
  { key: 'critical', label: 'Critical', accent: '#EF1E28', ribbon: 'rgba(239, 30, 40, 0.14)' },
  { key: 'high', label: 'High', accent: '#EB6836', ribbon: 'rgba(235, 104, 54, 0.14)' },
  { key: 'medium', label: 'Medium', accent: '#ECC147', ribbon: 'rgba(236, 193, 71, 0.17)' },
  { key: 'low', label: 'Low', accent: '#2563EB', ribbon: 'rgba(37, 99, 235, 0.14)' },
  {
    key: 'informational',
    label: 'Informational',
    accent: '#8A8C88',
    ribbon: 'rgba(138, 140, 136, 0.14)',
  },
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
  barHeight = 40,
  accent,
  label,
  count,
}: {
  x: number;
  y: number;
  barHeight?: number;
  accent: string;
  label: string;
  count: number;
}): React.ReactElement {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x="0" y="2" width="3.5" height={barHeight} rx="1.75" fill={accent} />
      <text x="11" y="17" className="fill-[#5E605D] text-[12px] font-medium">
        {label}
      </text>
      <text x="11" y="38" className="fill-[#141514] text-[16px] font-semibold">
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
    safeCount(totalOpen) ||
    SEV_META.reduce((acc, s) => acc + safeCount(severityCounts[s.key]), 0);

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
        className={cn('relative bg-transparent py-1 tabular-nums', className)}
      >
        <svg
          viewBox="0 0 880 185"
          className="block h-auto w-full select-none"
          role="img"
          aria-label={`Filtered ${sevMeta.label} findings Sankey chart`}
        >
          <path
            d="M 102 48 C 195 48, 215 48, 292 48"
            stroke="rgba(160, 162, 159, 0.24)"
            strokeWidth={ribbonWidth(sevTotal, denom, 5, 24)}
            fill="none"
          />
          <path
            d="M 392 38 C 520 38, 610 36, 755 36"
            stroke="rgba(29, 116, 245, 0.18)"
            strokeWidth={ribbonWidth(toInProgress, denom, 2.5, 17)}
            fill="none"
          />
          <path
            d="M 392 48 C 500 58, 560 95, 625 95"
            stroke={sevMeta.ribbon}
            strokeWidth={ribbonWidth(toTriaged, denom, 2.5, 17)}
            fill="none"
          />
          <path
            d="M 392 58 C 460 88, 505 145, 550 145"
            stroke={sevMeta.ribbon}
            strokeWidth={ribbonWidth(toNew, denom, 2.5, 17)}
            fill="none"
          />

          <SankeyNodeLabel
            x={16}
            y={24}
            barHeight={46}
            accent="#8A8C88"
            label="Findings"
            count={sevTotal}
          />

          <g
            transform="translate(292, 14)"
            className="cursor-pointer"
            onClick={() => onSelectSeverity(null)}
          >
            <rect
              x="0"
              y="0"
              width="102"
              height="62"
              rx="12"
              fill="#FFFFFF"
              stroke="#DCDED9"
              strokeWidth="1.25"
            />
            <rect x="8" y="11" width="3.5" height="40" rx="1.75" fill={sevMeta.accent} />
            <text x="20" y="27" className="fill-[#141514] text-[12px] font-semibold">
              {sevMeta.label}
            </text>
            <text x="20" y="48" className="fill-[#141514] text-[16px] font-semibold">
              {sevTotal}
            </text>
          </g>

          <SankeyNodeLabel
            x={758}
            y={16}
            accent="#1D74F5"
            label="In Progress"
            count={toInProgress}
          />
          <SankeyNodeLabel x={628} y={76} accent="#8A8C88" label="Triaged" count={toTriaged} />
          <SankeyNodeLabel x={552} y={126} accent="#8A8C88" label="New" count={toNew} />
        </svg>

        <div className="mt-1 flex justify-end">
          <button
            type="button"
            id="btn-reset-sankey-filter"
            onClick={() => onSelectSeverity(null)}
            className="inline-flex items-center gap-1 rounded-full border border-[#E2E3E1] bg-white px-3 py-1 text-[12px] font-medium text-[#434542] hover:bg-[#F6F7F5] cursor-pointer"
          >
            Showing {sevMeta.label} ({sevTotal}) · Clear filter ×
          </button>
        </div>
      </div>
    );
  }

  const sevY = [18, 74, 130, 186, 240];
  const statusNodes = [
    {
      label: 'In Progress',
      count: safeCount(statusCounts.in_progress),
      x: 758,
      y: 24,
      stroke: '#1D74F5',
    },
    { label: 'Triaged', count: safeCount(statusCounts.triaged), x: 622, y: 88, stroke: '#8A8C88' },
    { label: 'New', count: safeCount(statusCounts.new), x: 534, y: 152, stroke: '#8A8C88' },
  ];

  return (
    <div id="findings-sankey-full" className={cn('bg-transparent py-1 tabular-nums', className)}>
      <svg
        viewBox="0 0 880 288"
        className="block h-auto w-full select-none"
        role="img"
        aria-label="Findings severity to status Sankey flow"
      >
        {SEV_META.map((sev, idx) => {
          const val = safeCount(severityCounts[sev.key]);
          const y2 = (sevY[idx] ?? 18) + 21;
          const y1 = 128 + (idx - 2) * 12;
          return (
            <path
              key={sev.key}
              d={`M 92 ${y1} C 185 ${y1}, 205 ${y2}, 296 ${y2}`}
              stroke="rgba(165, 167, 164, 0.22)"
              strokeWidth={ribbonWidth(val, computedOpen, 2.5, 24)}
              fill="none"
            />
          );
        })}

        {SEV_META.map((sev, idx) => {
          const y1 = (sevY[idx] ?? 18) + 21;
          return statusNodes.map((st, sIdx) => {
            const linkVal = safeCount(
              links.find((l) => l.source === sev.label && l.target === st.label)?.value,
            );
            if (linkVal <= 0) return null;
            const y2 = st.y + 19 + (idx - 2) * 2.5;
            return (
              <path
                key={`${sev.key}-${st.label}`}
                d={`M 380 ${y1 + (sIdx - 1) * 4} C 455 ${y1}, ${st.x - 85} ${y2}, ${st.x - 6} ${y2}`}
                stroke={sIdx === 0 ? 'rgba(29, 116, 245, 0.16)' : sev.ribbon}
                strokeWidth={ribbonWidth(linkVal, computedOpen, 1.5, 18)}
                fill="none"
              />
            );
          });
        })}

        <SankeyNodeLabel
          x={14}
          y={102}
          barHeight={56}
          accent="#8A8C88"
          label="Findings"
          count={computedOpen}
        />

        {SEV_META.map((sev, idx) => {
          const y = sevY[idx] ?? 18;
          const count = safeCount(severityCounts[sev.key]);
          return (
            <g
              key={sev.key}
              id={`sankey-node-${sev.key}`}
              transform={`translate(298, ${y})`}
              className="group cursor-pointer"
              onClick={() => onSelectSeverity(sev.key)}
            >
              <rect
                x="-8"
                y="-5"
                width="108"
                height="52"
                rx="10"
                className="fill-transparent transition-colors group-hover:fill-[#F4F5F3]"
              />
              <rect x="0" y="2" width="3.5" height="40" rx="1.75" fill={sev.accent} />
              <text x="11" y="17" className="fill-[#5E605D] text-[12px] font-medium">
                {sev.label}
              </text>
              <text x="11" y="38" className="fill-[#141514] text-[16px] font-semibold">
                {count}
              </text>
            </g>
          );
        })}

        {statusNodes.map((st) => (
          <SankeyNodeLabel
            key={st.label}
            x={st.x}
            y={st.y}
            accent={st.stroke}
            label={st.label}
            count={st.count}
          />
        ))}
      </svg>
    </div>
  );
}
