import React from 'react';
import type { CampaignActivityPoint } from '@nightfall/core-contracts';

export function SevenDayTrendChart({
  data,
}: {
  data: Array<{ date: string; currentlyFixed: number; newFindings: number }>;
}): React.ReactElement {
  const width = 400;
  const height = 128;
  const padX = 8;
  const padY = 14;

  const values = data.flatMap((d) => [d.currentlyFixed, d.newFindings]);
  const minVal = Math.min(...values, 80) * 0.85;
  const maxVal = Math.max(...values, 180) * 1.05;

  const toX = (i: number) =>
    padX + (i / Math.max(1, data.length - 1)) * (width - padX * 2);
  const toY = (v: number) =>
    height - padY - ((v - minVal) / Math.max(1, maxVal - minVal)) * (height - padY * 2);

  const fixedPoints = data.map((d, i) => `${toX(i)},${toY(d.currentlyFixed)}`).join(' ');
  const newPoints = data.map((d, i) => `${toX(i)},${toY(d.newFindings)}`).join(' ');
  const areaPath = `M ${toX(0)} ${height - padY} L ${data
    .map((d, i) => `${toX(i)} ${toY(d.currentlyFixed)}`)
    .join(' L ')} L ${toX(data.length - 1)} ${height - padY} Z`;

  return (
    <div className="nf-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="nf-trend-svg" role="img" aria-label="7-day fixed vs new findings trend">
        <defs>
          <linearGradient id="nfFixedAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#eef0f3" strokeWidth="1" />
        <path d={areaPath} fill="url(#nfFixedAreaGrad)" />
        <polyline
          fill="none"
          stroke="#9f1239"
          strokeWidth="1.8"
          strokeDasharray="4 4"
          points={newPoints}
        />
        <polyline
          fill="none"
          stroke="#15803d"
          strokeWidth="2"
          points={fixedPoints}
        />
      </svg>
      <div className="nf-trend-legend">
        <span className="nf-legend-item">
          <i className="nf-legend-line fixed" /> Currently fixed
        </span>
        <span className="nf-legend-item">
          <i className="nf-legend-line new-dashed" /> New findings
        </span>
      </div>
    </div>
  );
}

export function CampaignActivityTimeline({
  series,
  startLabel = 'Nov 2, 2:00 AM',
  endLabel = 'Nov 2, 3:00 AM',
}: {
  series: CampaignActivityPoint[];
  startLabel?: string;
  endLabel?: string;
}): React.ReactElement {
  const width = 440;
  const height = 44;
  const maxReq = Math.max(...series.map((s) => s.requestsCount), 50);
  const points = series
    .map((pt, idx) => {
      const x = (idx / Math.max(1, series.length - 1)) * width;
      const y = height - 4 - (pt.requestsCount / maxReq) * (height - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="nf-rt-activity-widget">
      <div className="nf-rt-activity-row">
        <span className="nf-rt-activity-label">Activity</span>
        <div className="nf-rt-sparkline-box">
          <svg viewBox={`0 0 ${width} ${height}`} className="nf-rt-spark-svg">
            <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="#e5e7eb" strokeWidth="1" />
            <polyline fill="none" stroke="#2563eb" strokeWidth="1.75" points={points} />
          </svg>
          <div className="nf-rt-time-axis">
            <span>{startLabel}</span>
            <span>{endLabel}</span>
          </div>
        </div>
      </div>
      <div className="nf-rt-activity-row barcode-row">
        <span className="nf-rt-findings-dot-label">
          <i className="nf-dot-green" /> Findings
        </span>
        <div className="nf-rt-barcode" role="img" aria-label="Confirmed findings timeline ticks">
          {series.map((pt, idx) => (
            <span
              key={idx}
              className={pt.findingConfirmedTick ? 'nf-barcode-tick hit' : 'nf-barcode-tick'}
              title={`${pt.timestamp}: ${pt.requestsCount} reqs${pt.findingConfirmedTick ? ' · Finding confirmed' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
