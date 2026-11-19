import React from 'react';
import { cn } from '../../lib/utils.js';

export type SegmentedOption<V extends string> = {
  value: V;
  label: React.ReactNode;
  id?: string;
};

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (next: V) => void;
  className?: string;
}): React.ReactElement {
  return (
    <div
      role="tablist"
      className={cn('inline-flex w-fit items-center gap-0.5 rounded-full bg-pill p-1', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            id={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1 text-[12.5px] font-medium transition-all cursor-pointer',
              active
                ? 'bg-canvas text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-ink-secondary hover:text-ink',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function MetadataField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </div>
      <div className="text-[13.5px] text-ink">{children}</div>
    </div>
  );
}

export function MetadataRail({
  ariaLabel,
  children,
  className,
}: {
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <aside aria-label={ariaLabel} className={cn('space-y-4 self-start bg-transparent', className)}>
      {children}
    </aside>
  );
}

export function LifecycleStepper({
  stages,
  activeIndex,
  className,
}: {
  stages: string[];
  activeIndex: number;
  className?: string;
}): React.ReactElement {
  return (
    <ol
      aria-label="Finding remediation lifecycle"
      className={cn('flex flex-wrap items-center gap-1.5 text-[12px]', className)}
    >
      {stages.map((stage, idx) => {
        const done = idx < activeIndex;
        const current = idx === activeIndex;
        return (
          <li key={stage} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium',
                done
                  ? 'bg-status-mint text-status-mint-ink'
                  : current
                    ? 'bg-ink text-canvas'
                    : 'bg-muted text-ink-secondary',
              )}
            >
              <span className="tabular-nums">{done ? '✓' : idx + 1}</span>
              <span>{stage}</span>
            </span>
            {idx < stages.length - 1 ? <span className="text-ink-muted">→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
