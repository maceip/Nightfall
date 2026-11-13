import React from 'react';

export function NightfallHorizonIcon({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="nf-icon-horizon"
    >
      <path
        d="M3 13.5H17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6.2 13.5C6.2 11.4 7.9 9.7 10 9.7C12.1 9.7 13.8 11.4 13.8 13.5"
        fill="currentColor"
      />
      <path
        d="M10 5.2V6.8M5.4 7.2L6.5 8.3M14.6 7.2L13.5 8.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RedTeamSparkIcon({ size = 16 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 1.8L10.9 7.1L16.2 9L10.9 10.9L9 16.2L7.1 10.9L1.8 9L7.1 7.1L9 1.8Z"
        fill="#1a73e8"
      />
    </svg>
  );
}

export function RedTeamCampaignBadge({ size = 28 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 2.5L27.5 9.1V22.9L16 29.5L4.5 22.9V9.1L16 2.5Z"
        fill="#1a56ff"
        fillOpacity="0.16"
        stroke="#1a56ff"
        strokeWidth="1.5"
      />
      <path
        d="M16 6.2L24.4 11V21L16 25.8L7.6 21V11L16 6.2Z"
        fill="#1a56ff"
      />
      <circle cx="16" cy="16" r="5" fill="#0b132b" />
      <circle cx="16" cy="16" r="1.9" fill="#ffffff" />
    </svg>
  );
}

export function BudgetSignalBars({ pct }: { pct: number }): React.ReactElement {
  const activeBars = pct >= 75 ? 4 : pct >= 50 ? 3 : pct >= 25 ? 2 : 1;
  const heights = [6, 9, 13, 17];
  return (
    <div className="nf-budget-meter" title={`Campaign budget remaining: ${pct}%`}>
      <div className="nf-signal-bars" aria-hidden="true">
        {heights.map((h, i) => (
          <span
            key={h}
            className={i < activeBars ? 'nf-signal-bar active' : 'nf-signal-bar'}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
      <div className="nf-budget-label">
        <strong>{pct}%</strong>
        <span>Left</span>
      </div>
    </div>
  );
}
