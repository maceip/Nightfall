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
          <circle cx="12" cy="12" r="0.85" fill="#7EA1C4" fillOpacity="0.18" />
        </pattern>
      </defs>
      <rect width="360" height="220" fill="#08111D" />
      <rect width="360" height="220" fill={`url(#${gridId})`} />
      <path d="M-20 212 Q 180 186 380 212" stroke="#38BDF8" strokeOpacity="0.24" strokeWidth="1.25" />
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
      <rect x="20" y="18" width="320" height="176" rx="10" stroke="#1E334D" strokeWidth="1.25" strokeDasharray="4 4" />
      <path d="M20 28V20H28M332 20H340V28M20 184V192H28M332 192H340V184" stroke="#4B6E94" strokeWidth="1.5" strokeLinecap="round" />
      <text x="32" y="35" fill="#6F8FB2" fontFamily={MONO} fontSize="9.5" fontWeight="500" letterSpacing="0.06em">
        LITEBOX SANDBOX
      </text>

      <rect x="32" y="46" width="124" height="134" rx="8" fill="#0D1726" stroke="#253C59" strokeWidth="1.25" />
      <circle cx="46" cy="61" r="3.2" fill="#F87171" />
      <text x="55" y="64.5" fill="#DCE7F3" fontFamily={MONO} fontSize="10" fontWeight="500">exploit.poc</text>
      <line x1="32" y1="74" x2="156" y2="74" stroke="#1B2D45" strokeWidth="1" />
      <text x="43" y="93" fill="#8DA5C0" fontFamily={MONO} fontSize="9.5">POST /export</text>
      <rect x="42" y="104" width="104" height="22" rx="4" fill="#F87171" fillOpacity="0.12" stroke="#F87171" strokeOpacity="0.45" strokeWidth="1" />
      <text x="49" y="118.5" fill="#FCA5A5" fontFamily={MONO} fontSize="9.5">- missing_acl</text>
      <text x="43" y="162" fill="#F87171" fontFamily={MONO} fontSize="9" fontWeight="500">REPRODUCED</text>

      <line x1="156" y1="113" x2="167" y2="113" stroke="#38BDF8" strokeWidth="1.5" />
      <line x1="193" y1="113" x2="204" y2="113" stroke="#38BDF8" strokeWidth="1.5" />
      <path d="M200 109.5L204 113L200 116.5" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="180" cy="113" r="13" fill="#0E1C2F" stroke="#38BDF8" strokeWidth="1.5" />
      <circle cx="176" cy="108" r="2" stroke="#7DD3FC" strokeWidth="1.4" />
      <circle cx="176" cy="118" r="2" stroke="#7DD3FC" strokeWidth="1.4" />
      <circle cx="185" cy="111" r="2" stroke="#7DD3FC" strokeWidth="1.4" />
      <path d="M176 110V116M176 114C180 114 181 111 183 111" stroke="#7DD3FC" strokeWidth="1.4" strokeLinecap="round" />

      <rect x="204" y="46" width="124" height="134" rx="8" fill="#0E1C2E" stroke="#38BDF8" strokeOpacity="0.5" strokeWidth="1.25" />
      <circle cx="218" cy="61" r="3.2" fill="#34D399" />
      <text x="227" y="64.5" fill="#F0F7FE" fontFamily={MONO} fontSize="10" fontWeight="500">fix/sec-104</text>
      <line x1="204" y1="74" x2="328" y2="74" stroke="#1F3652" strokeWidth="1" />
      <rect x="214" y="84" width="104" height="22" rx="4" fill="#34D399" fillOpacity="0.13" stroke="#34D399" strokeOpacity="0.45" strokeWidth="1" />
      <text x="221" y="98.5" fill="#86EFAC" fontFamily={MONO} fontSize="9.5">+ checkMember()</text>
      <rect x="214" y="112" width="104" height="22" rx="4" fill="#34D399" fillOpacity="0.13" stroke="#34D399" strokeOpacity="0.45" strokeWidth="1" />
      <text x="221" y="126.5" fill="#86EFAC" fontFamily={MONO} fontSize="9.5">+ return 403</text>
      <path d="M215 158.5L218.5 162L225 155" stroke="#34D399" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="230" y="162" fill="#34D399" fontFamily={MONO} fontSize="9" fontWeight="500">VERIFIED</text>
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
      <rect x="20" y="90" width="72" height="40" rx="8" fill="#0E1B2D" stroke="#38BDF8" strokeOpacity="0.5" strokeWidth="1.25" />
      <circle cx="33" cy="110" r="3" fill="#38BDF8" />
      <text x="41" y="113.5" fill="#EAF3FC" fontFamily={MONO} fontSize="9.5" fontWeight="500">PROBE</text>

      <line x1="138" y1="24" x2="138" y2="190" stroke="#38BDF8" strokeOpacity="0.35" strokeWidth="1.25" strokeDasharray="4 4" />
      <line x1="92" y1="110" x2="106" y2="110" stroke="#38BDF8" strokeWidth="1.5" />
      <rect x="106" y="96" width="64" height="28" rx="14" fill="#0B1626" stroke="#38BDF8" strokeWidth="1.5" />
      <text x="138" y="113.5" textAnchor="middle" fill="#7DD3FC" fontFamily={MONO} fontSize="9.5" fontWeight="500">ED25519</text>

      <path d="M170 104 C 190 104, 190 52, 212 52" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="212" y="34" width="128" height="36" rx="7" fill="#0E1C2E" stroke="#38BDF8" strokeOpacity="0.45" strokeWidth="1.25" />
      <text x="223" y="55.5" fill="#7DD3FC" fontFamily={MONO} fontSize="9.5" fontWeight="500">GET</text>
      <text x="247" y="55.5" fill="#EAF3FC" fontFamily={MONO} fontSize="9.5">/api/docs</text>
      <circle cx="326" cy="52" r="3.2" fill="#34D399" />

      <line x1="170" y1="110" x2="212" y2="110" stroke="#38BDF8" strokeWidth="1.5" />
      <rect x="212" y="92" width="128" height="36" rx="7" fill="#0E1C2E" stroke="#38BDF8" strokeOpacity="0.45" strokeWidth="1.25" />
      <text x="223" y="113.5" fill="#7DD3FC" fontFamily={MONO} fontSize="9.5" fontWeight="500">WSS</text>
      <text x="247" y="113.5" fill="#EAF3FC" fontFamily={MONO} fontSize="9.5">/realtime</text>
      <circle cx="326" cy="110" r="3.2" fill="#34D399" />

      <path d="M170 116 C 184 116, 184 168, 194 168" stroke="#F87171" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="196" cy="168" r="8" fill="#261118" stroke="#F87171" strokeWidth="1.5" />
      <path d="M193.2 165.2L198.8 170.8M198.8 165.2L193.2 170.8" stroke="#FCA5A5" strokeWidth="1.5" strokeLinecap="round" />
      <g opacity="0.52">
        <rect x="212" y="150" width="128" height="36" rx="7" fill="#0B1320" stroke="#1E3048" strokeWidth="1.25" />
        <text x="223" y="171.5" fill="#8AA2BD" fontFamily={MONO} fontSize="9.5">/prod/admin</text>
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
      <rect x="20" y="28" width="216" height="160" rx="9" fill="#0D1726" stroke="#253C59" strokeWidth="1.25" />
      <text x="33" y="47.5" fill="#93AECB" fontFamily={MONO} fontSize="9.5" fontWeight="500">workflows/release.yml</text>
      <line x1="20" y1="58" x2="236" y2="58" stroke="#1B2D45" strokeWidth="1" />

      <path d="M34 80.5L37.5 84L43.5 77.5" stroke="#34D399" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="51" y="84" fill="#DCE7F3" fontFamily={MONO} fontSize="9.5">checkout@11bd719</text>

      <rect x="30" y="98" width="196" height="30" rx="5" fill="#F87171" fillOpacity="0.12" stroke="#F87171" strokeOpacity="0.45" strokeWidth="1" />
      <path d="M37 110.2L42.6 115.8M42.6 110.2L37 115.8" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" />
      <text x="51" y="116.5" fill="#FCA5A5" fontFamily={MONO} fontSize="9.5">deploy-action@main</text>

      <rect x="30" y="136" width="196" height="30" rx="5" fill="#F87171" fillOpacity="0.12" stroke="#F87171" strokeOpacity="0.45" strokeWidth="1" />
      <path d="M37 148.2L42.6 153.8M42.6 148.2L37 153.8" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" />
      <text x="51" y="154.5" fill="#FCA5A5" fontFamily={MONO} fontSize="9.5">permissions: write-all</text>

      <line x1="236" y1="110" x2="262" y2="110" stroke="#F87171" strokeWidth="1.5" />
      <line x1="262" y1="90" x2="262" y2="130" stroke="#F87171" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="272" y="76" width="68" height="68" rx="8" fill="#17111A" stroke="#F87171" strokeOpacity="0.55" strokeWidth="1.25" />
      <circle cx="298" cy="99" r="3" stroke="#F87171" strokeWidth="1.5" />
      <circle cx="298" cy="115" r="3" stroke="#F87171" strokeWidth="1.5" />
      <circle cx="314" cy="107" r="3" stroke="#F87171" strokeWidth="1.5" />
      <path d="M298 102V112M301 99C308 99 309 107 311 107" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" />
      <text x="306" y="133" textAnchor="middle" fill="#FCA5A5" fontFamily={MONO} fontSize="9" fontWeight="500">BLOCKED</text>
    </SchematicBackdrop>
  );
}
