import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { Severity } from '@nightfall/core-contracts';
import { cn } from '../../lib/utils.js';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-[6px] border-0 px-2 py-0.5 text-[12px] font-semibold leading-4 whitespace-nowrap tabular-nums',
  {
    variants: {
      variant: {
        critical: 'bg-status-danger text-status-danger-ink',
        high: 'bg-status-peach text-status-peach-ink',
        medium: 'bg-status-amber text-status-amber-ink',
        low: 'bg-status-info text-status-info-ink',
        informational: 'bg-status-neutral text-status-neutral-ink',
        new: 'bg-status-neutral text-status-neutral-ink',
        triaged: 'bg-status-neutral text-status-neutral-ink',
        in_progress: 'bg-status-info text-status-info-ink',
        proposed: 'bg-status-neutral text-status-neutral-ink',
        merged: 'bg-status-mint text-status-mint-ink',
        suppressed: 'bg-status-neutral text-ink-secondary',
        fixed: 'bg-status-mint text-status-mint-ink',
        discarded_fp: 'bg-status-neutral text-ink-secondary',
        verified: 'bg-status-mint text-status-mint-ink',
        verifying: 'bg-status-amber text-status-amber-ink',
        not_recorded: 'bg-status-neutral text-status-neutral-ink',
        enabled: 'bg-status-mint text-status-mint-ink',
        accent: 'bg-status-info text-status-info-ink',
        lavender: 'rounded-full bg-accent-violet-soft px-2 py-0.5 text-[11px] text-accent-violet',
        preview: 'rounded-full bg-status-amber px-2.5 py-0.5 text-[11px] text-status-amber-ink',
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
      : status === 'awaiting_approval' || status === 'paused_hitl'
        ? 'verifying'
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
