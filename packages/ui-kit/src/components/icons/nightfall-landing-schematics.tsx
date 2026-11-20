import React, { useId } from 'react';
import { cn } from '../../lib/utils.js';

export type LandingSchematicProps = {
  className?: string;
};

const MONO = 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace';

function SchematicBackdrop({
  gridId,
  children,
  className,
  label,
}: {
  gridId: string;
  children: React.ReactNode;
  className?: string;
  label: string;
}): React.ReactElement {
  return (
    <svg
      viewBox="0 0 360 220"
      fill="none"
      role="img"
      aria-label={label}
      className={cn('block aspect-16/10 h-auto w-full select-none', className)}
    >
      <defs>
        <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="0.9" fill="var(--nf-schem-grid)" fillOpacity="0.2" />
        </pattern>
      </defs>
      <rect width="360" height="220" fill="var(--nf-schem-bg)" />
      <rect width="360" height="220" fill={`url(#${gridId})`} />
      <path d="M-20 212 Q 180 186 380 212" stroke="var(--nf-schem-horizon)" strokeOpacity="0.26" strokeWidth="1.25" />
      {children}
    </svg>
  );
}

export function DefensePatchSchematic({ className }: LandingSchematicProps): React.ReactElement {
  const gridId = useId();
  return (
    <SchematicBackdrop
      gridId={gridId}
      className={className}
      label="LiteBox sandbox reproducing an exploit and staging a verified Git branch patch"
    >
      <rect x="20" y="18" width="320" height="176" rx="10" stroke="var(--nf-schem-frame)" strokeWidth="1.25" strokeDasharray="4 4" />
      <path d="M20 28V20H28M332 20H340V28M20 184V192H28M332 192H340V184" stroke="var(--nf-schem-bracket)" strokeWidth="1.5" strokeLinecap="round" />
      <text x="32" y="35" fill="var(--nf-schem-kicker)" fontFamily={MONO} fontSize="9.5" fontWeight="600" letterSpacing="0.06em">
        LITEBOX SANDBOX
      </text>

      <rect x="32" y="46" width="124" height="134" rx="8" fill="var(--nf-schem-surface)" stroke="var(--nf-schem-border)" strokeWidth="1.25" />
      <circle cx="46" cy="61" r="3.2" fill="var(--nf-schem-fail)" />
      <text x="55" y="64.5" fill="var(--nf-schem-ink)" fontFamily={MONO} fontSize="10" fontWeight="600">exploit.poc</text>
      <line x1="32" y1="74" x2="156" y2="74" stroke="var(--nf-schem-divider)" strokeWidth="1" />
      <text x="43" y="93" fill="var(--nf-schem-ink-muted)" fontFamily={MONO} fontSize="9.5">POST /export</text>
      <rect x="42" y="104" width="104" height="22" rx="4" fill="var(--nf-schem-fail)" fillOpacity="0.11" stroke="var(--nf-schem-fail)" strokeOpacity="0.42" strokeWidth="1" />
      <text x="49" y="118.5" fill="var(--nf-schem-fail-ink)" fontFamily={MONO} fontSize="9.5" fontWeight="500">- missing_acl</text>
      <text x="43" y="162" fill="var(--nf-schem-fail)" fontFamily={MONO} fontSize="9" fontWeight="600">REPRODUCED</text>

      <line x1="156" y1="113" x2="167" y2="113" stroke="var(--nf-schem-cyan)" strokeWidth="1.5" />
      <line x1="193" y1="113" x2="204" y2="113" stroke="var(--nf-schem-cyan)" strokeWidth="1.5" />
      <path d="M200 109.5L204 113L200 116.5" stroke="var(--nf-schem-cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="180" cy="113" r="13" fill="var(--nf-schem-surface)" stroke="var(--nf-schem-cyan)" strokeWidth="1.5" />
      <circle cx="176" cy="108" r="2" stroke="var(--nf-schem-cyan-ink)" strokeWidth="1.4" />
      <circle cx="176" cy="118" r="2" stroke="var(--nf-schem-cyan-ink)" strokeWidth="1.4" />
      <circle cx="185" cy="111" r="2" stroke="var(--nf-schem-cyan-ink)" strokeWidth="1.4" />
      <path d="M176 110V116M176 114C180 114 181 111 183 111" stroke="var(--nf-schem-cyan-ink)" strokeWidth="1.4" strokeLinecap="round" />

      <rect x="204" y="46" width="124" height="134" rx="8" fill="var(--nf-schem-surface-accent)" stroke="var(--nf-schem-cyan)" strokeOpacity="0.45" strokeWidth="1.25" />
      <circle cx="218" cy="61" r="3.2" fill="var(--nf-schem-pass)" />
      <text x="227" y="64.5" fill="var(--nf-schem-ink)" fontFamily={MONO} fontSize="10" fontWeight="600">fix/sec-104</text>
      <line x1="204" y1="74" x2="328" y2="74" stroke="var(--nf-schem-divider)" strokeWidth="1" />
      <rect x="214" y="84" width="104" height="22" rx="4" fill="var(--nf-schem-pass)" fillOpacity="0.12" stroke="var(--nf-schem-pass)" strokeOpacity="0.42" strokeWidth="1" />
      <text x="221" y="98.5" fill="var(--nf-schem-pass-ink)" fontFamily={MONO} fontSize="9.5" fontWeight="500">+ checkMember()</text>
      <rect x="214" y="112" width="104" height="22" rx="4" fill="var(--nf-schem-pass)" fillOpacity="0.12" stroke="var(--nf-schem-pass)" strokeOpacity="0.42" strokeWidth="1" />
      <text x="221" y="126.5" fill="var(--nf-schem-pass-ink)" fontFamily={MONO} fontSize="9.5" fontWeight="500">+ return 403</text>
      <path d="M215 158.5L218.5 162L225 155" stroke="var(--nf-schem-pass)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="230" y="162" fill="var(--nf-schem-pass)" fontFamily={MONO} fontSize="9" fontWeight="600">VERIFIED</text>
    </SchematicBackdrop>
  );
}

export function ScopedProbeSchematic({ className }: LandingSchematicProps): React.ReactElement {
  const gridId = useId();
  return (
    <SchematicBackdrop
      gridId={gridId}
      className={className}
      label="Signed Ed25519 manifest confining HTTP and WebSocket probes to approved staging routes"
    >
      <rect x="20" y="90" width="72" height="40" rx="8" fill="var(--nf-schem-surface)" stroke="var(--nf-schem-cyan)" strokeOpacity="0.48" strokeWidth="1.25" />
      <circle cx="33" cy="110" r="3" fill="var(--nf-schem-cyan)" />
      <text x="41" y="113.5" fill="var(--nf-schem-ink)" fontFamily={MONO} fontSize="9.5" fontWeight="600">PROBE</text>

      <line x1="138" y1="24" x2="138" y2="190" stroke="var(--nf-schem-cyan)" strokeOpacity="0.35" strokeWidth="1.25" strokeDasharray="4 4" />
      <line x1="92" y1="110" x2="106" y2="110" stroke="var(--nf-schem-cyan)" strokeWidth="1.5" />
      <rect x="106" y="96" width="64" height="28" rx="14" fill="var(--nf-schem-surface)" stroke="var(--nf-schem-cyan)" strokeWidth="1.5" />
      <text x="138" y="113.5" textAnchor="middle" fill="var(--nf-schem-cyan-ink)" fontFamily={MONO} fontSize="9.5" fontWeight="600">ED25519</text>

      <path d="M170 104 C 190 104, 190 52, 212 52" stroke="var(--nf-schem-cyan)" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="212" y="34" width="128" height="36" rx="7" fill="var(--nf-schem-surface)" stroke="var(--nf-schem-cyan)" strokeOpacity="0.42" strokeWidth="1.25" />
      <text x="223" y="55.5" fill="var(--nf-schem-cyan-ink)" fontFamily={MONO} fontSize="9.5" fontWeight="600">GET</text>
      <text x="247" y="55.5" fill="var(--nf-schem-ink)" fontFamily={MONO} fontSize="9.5">/api/docs</text>
      <circle cx="326" cy="52" r="3.2" fill="var(--nf-schem-pass)" />

      <line x1="170" y1="110" x2="212" y2="110" stroke="var(--nf-schem-cyan)" strokeWidth="1.5" />
      <rect x="212" y="92" width="128" height="36" rx="7" fill="var(--nf-schem-surface)" stroke="var(--nf-schem-cyan)" strokeOpacity="0.42" strokeWidth="1.25" />
      <text x="223" y="113.5" fill="var(--nf-schem-cyan-ink)" fontFamily={MONO} fontSize="9.5" fontWeight="600">WSS</text>
      <text x="247" y="113.5" fill="var(--nf-schem-ink)" fontFamily={MONO} fontSize="9.5">/realtime</text>
      <circle cx="326" cy="110" r="3.2" fill="var(--nf-schem-pass)" />

      <path d="M170 116 C 184 116, 184 168, 194 168" stroke="var(--nf-schem-fail)" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="196" cy="168" r="8" fill="var(--nf-schem-surface-danger)" stroke="var(--nf-schem-fail)" strokeWidth="1.5" />
      <path d="M193.2 165.2L198.8 170.8M198.8 165.2L193.2 170.8" stroke="var(--nf-schem-fail)" strokeWidth="1.5" strokeLinecap="round" />
      <g opacity="0.62">
        <rect x="212" y="150" width="128" height="36" rx="7" fill="var(--nf-schem-surface-muted)" stroke="var(--nf-schem-border)" strokeWidth="1.25" />
        <text x="223" y="171.5" fill="var(--nf-schem-ink-muted)" fontFamily={MONO} fontSize="9.5">/prod/admin</text>
      </g>
    </SchematicBackdrop>
  );
}

export function PreMergeGateSchematic({ className }: LandingSchematicProps): React.ReactElement {
  const gridId = useId();
  return (
    <SchematicBackdrop
      gridId={gridId}
      className={className}
      label="Scorecard pre-merge workflow check blocking unpinned actions and write-all token permissions"
    >
      <rect x="20" y="28" width="216" height="160" rx="9" fill="var(--nf-schem-surface)" stroke="var(--nf-schem-border)" strokeWidth="1.25" />
      <text x="33" y="47.5" fill="var(--nf-schem-ink-muted)" fontFamily={MONO} fontSize="9.5" fontWeight="600">workflows/release.yml</text>
      <line x1="20" y1="58" x2="236" y2="58" stroke="var(--nf-schem-divider)" strokeWidth="1" />

      <path d="M34 80.5L37.5 84L43.5 77.5" stroke="var(--nf-schem-pass)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="51" y="84" fill="var(--nf-schem-ink)" fontFamily={MONO} fontSize="9.5">checkout@11bd719</text>

      <rect x="30" y="98" width="196" height="30" rx="5" fill="var(--nf-schem-fail)" fillOpacity="0.10" stroke="var(--nf-schem-fail)" strokeOpacity="0.40" strokeWidth="1" />
      <path d="M37 110.2L42.6 115.8M42.6 110.2L37 115.8" stroke="var(--nf-schem-fail)" strokeWidth="1.5" strokeLinecap="round" />
      <text x="51" y="116.5" fill="var(--nf-schem-fail-ink)" fontFamily={MONO} fontSize="9.5" fontWeight="500">deploy-action@main</text>

      <rect x="30" y="136" width="196" height="30" rx="5" fill="var(--nf-schem-fail)" fillOpacity="0.10" stroke="var(--nf-schem-fail)" strokeOpacity="0.40" strokeWidth="1" />
      <path d="M37 148.2L42.6 153.8M42.6 148.2L37 153.8" stroke="var(--nf-schem-fail)" strokeWidth="1.5" strokeLinecap="round" />
      <text x="51" y="154.5" fill="var(--nf-schem-fail-ink)" fontFamily={MONO} fontSize="9.5" fontWeight="500">permissions: write-all</text>

      <line x1="236" y1="110" x2="262" y2="110" stroke="var(--nf-schem-fail)" strokeWidth="1.5" />
      <line x1="262" y1="90" x2="262" y2="130" stroke="var(--nf-schem-fail)" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="272" y="76" width="68" height="68" rx="8" fill="var(--nf-schem-surface-danger)" stroke="var(--nf-schem-fail)" strokeOpacity="0.50" strokeWidth="1.25" />
      <circle cx="298" cy="99" r="3" stroke="var(--nf-schem-fail)" strokeWidth="1.5" />
      <circle cx="298" cy="115" r="3" stroke="var(--nf-schem-fail)" strokeWidth="1.5" />
      <circle cx="314" cy="107" r="3" stroke="var(--nf-schem-fail)" strokeWidth="1.5" />
      <path d="M298 102V112M301 99C308 99 309 107 311 107" stroke="var(--nf-schem-fail)" strokeWidth="1.5" strokeLinecap="round" />
      <text x="306" y="133" textAnchor="middle" fill="var(--nf-schem-fail-ink)" fontFamily={MONO} fontSize="9" fontWeight="600">BLOCKED</text>
    </SchematicBackdrop>
  );
}
