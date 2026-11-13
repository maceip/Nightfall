import React from 'react';
import type { SankeyLink, Severity } from '@nightfall/core-contracts';

export interface SankeyDiagramProps {
  totalOpen: number;
  severityCounts: Record<Severity, number>;
  statusCounts: { new: number; triaged: number; in_progress: number };
  links: SankeyLink[];
  selectedSeverity: Severity | null;
  onSelectSeverity: (sev: Severity | null) => void;
}

const SEV_META: Array<{ key: Severity; label: string; color: string; ribbon: string }> = [
  { key: 'critical', label: 'Critical', color: '#9f1239', ribbon: 'rgba(190, 24, 93, 0.16)' },
  { key: 'high', label: 'High', color: '#ea580c', ribbon: 'rgba(234, 88, 12, 0.16)' },
  { key: 'medium', label: 'Medium', color: '#a16207', ribbon: 'rgba(180, 130, 20, 0.16)' },
  { key: 'low', label: 'Low', color: '#1d4ed8', ribbon: 'rgba(37, 99, 235, 0.15)' },
  {
    key: 'informational',
    label: 'Informational',
    color: '#6b7280',
    ribbon: 'rgba(107, 114, 128, 0.14)',
  },
];

export function SankeyDiagram({
  totalOpen,
  severityCounts,
  statusCounts,
  links,
  selectedSeverity,
  onSelectSeverity,
}: SankeyDiagramProps): React.ReactElement {
  // Focused single-severity view matching Screenshot_20261112-201801~2.jpg
  if (selectedSeverity) {
    const sevMeta = SEV_META.find((s) => s.key === selectedSeverity) ?? SEV_META[0]!;
    const sevTotal = severityCounts[selectedSeverity] ?? 0;
    const toInProgress =
      links.find((l) => l.source === sevMeta.label && l.target === 'In Progress')?.value ?? 0;
    const toTriaged =
      links.find((l) => l.source === sevMeta.label && l.target === 'Triaged')?.value ?? 0;
    const toNew =
      links.find((l) => l.source === sevMeta.label && l.target === 'New')?.value ?? 0;

    return (
      <div className="nf-sankey-wrap focused" id="findings-sankey-focused">
        <svg viewBox="0 0 880 185" className="nf-sankey-svg" role="img" aria-label={`Filtered ${sevMeta.label} findings Sankey chart`}>
          {/* Left -> Selected Severity Ribbon */}
          <path
            d="M 102 48 C 195 48, 215 48, 295 48"
            stroke="rgba(148, 163, 184, 0.25)"
            strokeWidth="22"
            fill="none"
          />
          {/* Selected Severity -> Right Status Ribbons */}
          <path
            d="M 380 38 C 520 38, 610 36, 755 36"
            stroke="rgba(59, 130, 246, 0.18)"
            strokeWidth="12"
            fill="none"
          />
          <path
            d="M 380 48 C 500 58, 560 95, 625 95"
            stroke={sevMeta.ribbon}
            strokeWidth="12"
            fill="none"
          />
          <path
            d="M 380 58 C 460 88, 505 145, 550 145"
            stroke="rgba(190, 24, 93, 0.12)"
            strokeWidth="6"
            fill="none"
          />

          {/* Left Node */}
          <g transform="translate(26, 26)">
            <rect x="0" y="2" width="3.5" height="40" rx="1.75" fill="#64748b" />
            <text x="11" y="18" className="nf-sankey-label">Findings</text>
            <text x="11" y="38" className="nf-sankey-count">{sevTotal}</text>
          </g>

          {/* Center Selected Card */}
          <g
            transform="translate(295, 16)"
            className="nf-sankey-node clickable selected"
            onClick={() => onSelectSeverity(null)}
          >
            <rect
              x="0"
              y="0"
              width="88"
              height="58"
              rx="10"
              fill="#ffffff"
              stroke="#9ca3af"
              strokeWidth="1.2"
            />
            <rect x="0" y="9" width="3.5" height="40" rx="1.75" fill={sevMeta.color} />
            <text x="12" y="25" className="nf-sankey-label bold">{sevMeta.label}</text>
            <text x="12" y="46" className="nf-sankey-count">{sevTotal}</text>
          </g>

          {/* Right Nodes */}
          <g transform="translate(758, 16)">
            <rect x="0" y="2" width="3.5" height="38" rx="1.75" fill="#2563eb" />
            <text x="10" y="17" className="nf-sankey-label">In Progress</text>
            <text x="10" y="37" className="nf-sankey-count">{toInProgress}</text>
          </g>
          <g transform="translate(628, 76)">
            <rect x="0" y="2" width="3.5" height="38" rx="1.75" fill="#64748b" />
            <text x="10" y="17" className="nf-sankey-label">Triaged</text>
            <text x="10" y="37" className="nf-sankey-count">{toTriaged}</text>
          </g>
          <g transform="translate(552, 126)">
            <rect x="0" y="2" width="3.5" height="38" rx="1.75" fill="#64748b" />
            <text x="10" y="17" className="nf-sankey-label">New</text>
            <text x="10" y="37" className="nf-sankey-count">{toNew}</text>
          </g>
        </svg>
        <button
          type="button"
          id="btn-reset-sankey-filter"
          className="nf-sankey-reset-chip"
          onClick={() => onSelectSeverity(null)}
        >
          Showing {sevMeta.label} ({sevTotal}) · Clear filter ×
        </button>
      </div>
    );
  }

  // Full 5-severity -> 3-status Sankey matching IMG-20261112-WA8349.jpg
  const sevY = [28, 82, 138, 194, 248];
  const statusNodes = [
    { label: 'In Progress', count: statusCounts.in_progress, x: 752, y: 28, color: '#2563eb' },
    { label: 'Triaged', count: statusCounts.triaged, x: 616, y: 86, color: '#64748b' },
    { label: 'New', count: statusCounts.new, x: 526, y: 148, color: '#64748b' },
  ];

  return (
    <div className="nf-sankey-wrap" id="findings-sankey-full">
      <svg viewBox="0 0 880 296" className="nf-sankey-svg" role="img" aria-label="Findings severity to status Sankey flow">
        {/* Left root -> Severities */}
        {SEV_META.map((sev, idx) => {
          const val = severityCounts[sev.key] ?? 0;
          const y2 = (sevY[idx] ?? 28) + 20;
          const y1 = 128 + (idx - 2) * 14;
          const strokeW = Math.max(3, Math.min(26, Math.round((val / Math.max(1, totalOpen)) * 68)));
          return (
            <path
              key={sev.key}
              d={`M 96 ${y1} C 185 ${y1}, 205 ${y2}, 295 ${y2}`}
              stroke="rgba(148, 163, 184, 0.22)"
              strokeWidth={strokeW}
              fill="none"
            />
          );
        })}

        {/* Severities -> Statuses */}
        {SEV_META.map((sev, idx) => {
          const y1 = (sevY[idx] ?? 28) + 20;
          return statusNodes.map((st, sIdx) => {
            const link = links.find((l) => l.source === sev.label && l.target === st.label);
            if (!link || link.value <= 0) return null;
            const y2 = st.y + 18 + (idx - 2) * 2;
            const strokeW = Math.max(1.5, Math.min(18, (link.value / Math.max(1, totalOpen)) * 58));
            return (
              <path
                key={`${sev.key}-${st.label}`}
                d={`M 366 ${y1 + (sIdx - 1) * 4} C 455 ${y1}, ${st.x - 85} ${y2}, ${st.x - 6} ${y2}`}
                stroke={sIdx === 0 ? 'rgba(59, 130, 246, 0.16)' : sev.ribbon}
                strokeWidth={strokeW}
                fill="none"
              />
            );
          });
        })}

        {/* Root Node */}
        <g transform="translate(26, 108)">
          <rect x="0" y="0" width="3.5" height="46" rx="1.75" fill="#64748b" />
          <text x="11" y="19" className="nf-sankey-label">Findings</text>
          <text x="11" y="40" className="nf-sankey-count">{totalOpen}</text>
        </g>

        {/* Severity Column (Clickable!) */}
        {SEV_META.map((sev, idx) => {
          const y = sevY[idx] ?? 28;
          const count = severityCounts[sev.key] ?? 0;
          return (
            <g
              key={sev.key}
              id={`sankey-node-${sev.key}`}
              transform={`translate(298, ${y})`}
              className="nf-sankey-node clickable"
              onClick={() => onSelectSeverity(sev.key)}
            >
              <rect x="-6" y="-4" width="110" height="48" rx="8" fill="transparent" className="nf-sankey-hover-bg" />
              <rect x="0" y="2" width="3.5" height="38" rx="1.75" fill={sev.color} />
              <text x="10" y="17" className="nf-sankey-label">{sev.label}</text>
              <text x="10" y="37" className="nf-sankey-count">{count}</text>
            </g>
          );
        })}

        {/* Status Column */}
        {statusNodes.map((st) => (
          <g key={st.label} transform={`translate(${st.x}, ${st.y})`}>
            <rect x="0" y="2" width="3.5" height="38" rx="1.75" fill={st.color} />
            <text x="10" y="17" className="nf-sankey-label">{st.label}</text>
            <text x="10" y="37" className="nf-sankey-count">{st.count}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
