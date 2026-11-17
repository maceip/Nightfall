import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { Severity } from '@nightfall/core-contracts';
import { cn } from '../../lib/utils.js';

// Exact borderless rounded-[6px] pills matched to the 19 uploaded Nightfall reference screenshots:
// - Critical: soft rose (#FAE5E5 / #9E2A2B)
// - High: warm peach (#FAE6DC / #9A3412)
// - Medium: warm gold (#F8EFD4 / #855A15)
// - Low: sky tint (#DCEEFB / #1D588F)
// - Proposed / New / Triaged / Not recorded: neutral gray (#EFEFED / #373936)
// - In Progress: cobalt tint (#E1EFFE / #1E5AA8)
// - Enabled / Merged / Fixed / Verified: mint green (#DCFCE7 / #166534)
// - Lavender New tag: (#EFE6FD / #6E42C1)
export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-[6px] border-0 px-2 py-0.5 text-[12px] font-semibold leading-4 whitespace-nowrap tabular-nums',
  {
    variants: {
      variant: {
        critical: 'bg-[#FAE5E5] text-[#9E2A2B]',
        high: 'bg-[#FAE6DC] text-[#9A3412]',
        medium: 'bg-[#F8EFD4] text-[#855A15]',
        low: 'bg-[#DCEEFB] text-[#1D588F]',
        informational: 'bg-[#EFEFED] text-[#4A4C49]',
        new: 'bg-[#EFEFED] text-[#4A4C49]',
        triaged: 'bg-[#EFEFED] text-[#4A4C49]',
        in_progress: 'bg-[#E1EFFE] text-[#1E5AA8]',
        proposed: 'bg-[#EFEFED] text-[#373936]',
        merged: 'bg-[#DCFCE7] text-[#166534]',
        suppressed: 'bg-[#EFEFED] text-[#5E605D]',
        fixed: 'bg-[#DCFCE7] text-[#166534]',
        discarded_fp: 'bg-[#EFEFED] text-[#5E605D]',
        verified: 'bg-[#DCFCE7] text-[#166534]',
        verifying: 'bg-[#F8EFD4] text-[#855A15]',
        not_recorded: 'bg-[#EFEFED] text-[#4A4C49]',
        enabled: 'bg-[#DCFCE7] text-[#166534]',
        accent: 'bg-[#E1EFFE] text-[#1E5AA8]',
        lavender: 'rounded-full bg-[#EFE6FD] px-2 py-0.5 text-[11px] text-[#6E42C1]',
        preview: 'rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] text-[#92400E]',
      },
    },
    defaultVariants: {
      variant: 'informational',
    },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  not_recorded: 'Not recorded',
  discarded_fp: 'Discarded FP',
  regression_detected: 'Regression detected',
  awaiting_approval: 'Awaiting approval',
  paused_hitl: 'Paused (HITL)',
};

function formatBadgeLabel(raw: string): string {
  if (STATUS_LABELS[raw]) return STATUS_LABELS[raw]!;
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
}

export function Badge({ className, variant, ...props }: BadgeProps): React.ReactElement {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}): React.ReactElement {
  return (
    <Badge variant={severity} className={className}>
      {formatBadgeLabel(severity)}
    </Badge>
  );
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}): React.ReactElement {
  const knownVariants = new Set<string>([
    'critical',
    'high',
    'medium',
    'low',
    'informational',
    'new',
    'triaged',
    'in_progress',
    'proposed',
    'merged',
    'suppressed',
    'fixed',
    'discarded_fp',
    'verified',
    'verifying',
    'not_recorded',
    'enabled',
    'accent',
    'lavender',
    'preview',
  ]);
  const mapped: BadgeVariant = knownVariants.has(status)
    ? (status as BadgeVariant)
    : status === 'confirmed' || status === 'completed'
      ? 'verified'
      : status === 'regression_detected' || status === 'failed' || status === 'halted'
        ? 'critical'
        : status === 'running' || status === 'leased'
          ? 'in_progress'
          : 'informational';

  return (
    <Badge variant={mapped} className={className}>
      {label ?? formatBadgeLabel(status)}
    </Badge>
  );
}
