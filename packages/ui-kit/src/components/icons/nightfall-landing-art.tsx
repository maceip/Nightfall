import React from 'react';
import { cn } from '../../lib/utils.js';

export type PillarArtProps = {
  active?: boolean;
  className?: string;
};

export function DefenseFactoryPillarArt({
  active = false,
  className,
}: PillarArtProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 320 200"
      fill="none"
      aria-hidden="true"
      className={cn(
        'h-full w-full select-none transition-transform duration-200',
        active ? 'scale-[1.025]' : 'scale-100',
        className,
      )}
    >
      <rect
        x="22"
        y="40"
        width="104"
        height="120"
        rx="10"
        fill="var(--color-background-body)"
        stroke="var(--color-border-emphasized)"
        strokeWidth="1.25"
      />
      <circle cx="36" cy="54" r="3" fill="var(--nf-posture-fail-fg)" />
      <rect x="45" y="51" width="52" height="6" rx="3" fill="var(--color-text-tertiary)" opacity="0.45" />
      <rect x="34" y="72" width="78" height="7" rx="3.5" fill="var(--nf-posture-fail-bg)" />
      <rect x="34" y="86" width="64" height="6" rx="3" fill="var(--color-border-emphasized)" />
      <rect x="34" y="99" width="72" height="6" rx="3" fill="var(--color-border-emphasized)" />
      <rect x="34" y="122" width="54" height="18" rx="9" fill="var(--nf-pill-bg)" stroke="var(--color-border)" />
      <circle cx="45" cy="131" r="3" fill="var(--nf-accent-violet)" />
      <rect x="53" y="128.5" width="26" height="5" rx="2.5" fill="var(--color-text-secondary)" opacity="0.65" />

      <path
        d="M128 100H190"
        stroke={active ? 'var(--nf-accent-blue)' : 'var(--color-border-emphasized)'}
        strokeWidth="1.75"
        strokeDasharray="4 4"
      />
      <rect
        x="141"
        y="80"
        width="38"
        height="40"
        rx="10"
        fill="var(--color-background-surface)"
        stroke={active ? 'var(--nf-accent-blue)' : 'var(--color-border-emphasized)'}
        strokeWidth="1.5"
      />
      <path
        d="M160 89L169 93V100C169 105.5 165.2 109.8 160 111.5C154.8 109.8 151 105.5 151 100V93L160 89Z"
        stroke="var(--nf-accent-blue)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      <rect
        x="194"
        y="40"
        width="104"
        height="120"
        rx="10"
        fill="var(--color-background-body)"
        stroke={active ? 'var(--nf-status-green-dot)' : 'var(--color-border-emphasized)'}
        strokeWidth="1.4"
      />
      <circle cx="208" cy="54" r="3" fill="var(--nf-status-green-dot)" />
      <rect x="217" y="51" width="58" height="6" rx="3" fill="var(--color-text-secondary)" opacity="0.55" />
      <rect x="206" y="72" width="80" height="8" rx="4" fill="var(--nf-posture-pass-bg)" />
      <rect x="206" y="87" width="74" height="8" rx="4" fill="var(--nf-posture-pass-bg)" />
      <rect x="206" y="103" width="62" height="6" rx="3" fill="var(--color-border-emphasized)" />
      <path
        d="M210 132L216 138L228 125"
        stroke="var(--nf-status-green-dot)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="236" y="129" width="46" height="6" rx="3" fill="var(--color-text-primary)" opacity="0.7" />
    </svg>
  );
}

export function RedTeamPillarArt({
  active = false,
  className,
}: PillarArtProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 320 200"
      fill="none"
      aria-hidden="true"
      className={cn(
        'h-full w-full select-none transition-transform duration-200',
        active ? 'scale-[1.025]' : 'scale-100',
        className,
      )}
    >
      <rect
        x="24"
        y="52"
        width="88"
        height="96"
        rx="10"
        fill="var(--color-background-body)"
        stroke="var(--color-border-emphasized)"
        strokeWidth="1.25"
      />
      <rect x="36" y="68" width="46" height="6" rx="3" fill="var(--nf-accent-blue)" opacity="0.85" />
      <rect x="36" y="82" width="64" height="5" rx="2.5" fill="var(--color-border-emphasized)" />
      <rect x="36" y="94" width="56" height="5" rx="2.5" fill="var(--color-border-emphasized)" />
      <rect x="36" y="106" width="60" height="5" rx="2.5" fill="var(--color-border-emphasized)" />
      <circle cx="43" cy="128" r="5" stroke="var(--nf-status-green-dot)" strokeWidth="1.5" />
      <rect x="53" y="125.5" width="42" height="5" rx="2.5" fill="var(--color-text-secondary)" opacity="0.65" />

      <path d="M112 86H150" stroke="var(--nf-accent-blue)" strokeWidth="1.75" />
      <path d="M112 116H146" stroke="var(--color-border-emphasized)" strokeWidth="1.5" strokeDasharray="3 3" />

      <rect
        x="150"
        y="44"
        width="40"
        height="112"
        rx="12"
        fill="var(--color-background-surface)"
        stroke={active ? 'var(--nf-accent-blue)' : 'var(--color-border-emphasized)'}
        strokeWidth="1.5"
      />
      <path
        d="M170 76L173.2 84.8L182 88L173.2 91.2L170 100L166.8 91.2L158 88L166.8 84.8L170 76Z"
        fill="var(--nf-accent-blue)"
      />
      <path
        d="M165 122L175 132M175 122L165 132"
        stroke="var(--nf-posture-fail-fg)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />

      <path d="M190 86H226" stroke="var(--nf-status-green-dot)" strokeWidth="1.75" />
      <rect
        x="226"
        y="52"
        width="70"
        height="96"
        rx="10"
        fill="var(--color-background-body)"
        stroke="var(--color-border-emphasized)"
        strokeWidth="1.25"
      />
      <circle cx="261" cy="86" r="16" fill="var(--nf-posture-pass-bg)" stroke="var(--nf-status-green-dot)" strokeWidth="1.4" />
      <circle cx="261" cy="86" r="5" fill="var(--nf-status-green-dot)" />
      <rect x="240" y="116" width="42" height="6" rx="3" fill="var(--color-text-secondary)" opacity="0.6" />
      <rect x="245" y="128" width="32" height="5" rx="2.5" fill="var(--color-border-emphasized)" />
    </svg>
  );
}

export function ScorecardPillarArt({
  active = false,
  className,
}: PillarArtProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 320 200"
      fill="none"
      aria-hidden="true"
      className={cn(
        'h-full w-full select-none transition-transform duration-200',
        active ? 'scale-[1.025]' : 'scale-100',
        className,
      )}
    >
      <rect
        x="28"
        y="42"
        width="264"
        height="116"
        rx="12"
        fill="var(--color-background-body)"
        stroke={active ? 'var(--nf-status-green-dot)' : 'var(--color-border-emphasized)'}
        strokeWidth="1.35"
      />
      <circle
        cx="90"
        cy="100"
        r="34"
        stroke="var(--color-border)"
        strokeWidth="6"
      />
      <path
        d="M90 66A34 34 0 1 1 59.5 115"
        stroke="var(--nf-status-green-dot)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M83 100.5L88.5 106L99 94.5"
        stroke="var(--nf-status-green-dot)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <rect x="148" y="64" width="120" height="8" rx="4" fill="var(--color-border)" />
      <rect x="148" y="64" width="104" height="8" rx="4" fill="var(--nf-status-green-dot)" />

      <rect x="148" y="86" width="120" height="8" rx="4" fill="var(--color-border)" />
      <rect x="148" y="86" width="92" height="8" rx="4" fill="var(--nf-accent-blue)" />

      <rect x="148" y="108" width="120" height="8" rx="4" fill="var(--color-border)" />
      <rect x="148" y="108" width="110" height="8" rx="4" fill="var(--nf-status-green-dot)" />

      <rect x="148" y="128" width="76" height="6" rx="3" fill="var(--color-text-secondary)" opacity="0.55" />
    </svg>
  );
}
