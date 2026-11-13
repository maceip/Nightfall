import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { Severity } from '@nightfall/core-contracts';
import { cn } from '../../lib/utils.js';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap tabular-nums',
  {
    variants: {
      variant: {
        critical: 'border-rose-200 bg-rose-50 text-rose-800',
        high: 'border-orange-200 bg-orange-50 text-orange-800',
        medium: 'border-amber-200 bg-amber-50 text-amber-800',
        low: 'border-blue-200 bg-blue-50 text-blue-800',
        informational: 'border-primary-200 bg-primary-100 text-primary-700',
        new: 'border-primary-200 bg-primary-100 text-primary-700',
        triaged: 'border-sky-200 bg-sky-50 text-sky-800',
        in_progress: 'border-blue-200 bg-blue-50 text-blue-800',
        proposed: 'border-indigo-200 bg-indigo-50 text-indigo-800',
        merged: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        suppressed: 'border-primary-200 bg-primary-100 text-primary-600',
        fixed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        discarded_fp: 'border-primary-200 bg-primary-100 text-primary-600',
        verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        verifying: 'border-amber-200 bg-amber-50 text-amber-800',
        not_recorded: 'border-primary-200 bg-primary-100 text-primary-600',
        enabled: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        accent: 'border-blue-200 bg-blue-50 text-blue-700',
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
