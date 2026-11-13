import React from 'react';
import { cn } from '../../lib/utils.js';

export type CardProps = React.ComponentProps<'div'>;

export function Card({ className, ...props }: CardProps): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-xl border border-primary-200 bg-surface p-4 text-ink shadow-2xs',
        className,
      )}
      {...props}
    />
  );
}

export type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  caption?: React.ReactNode;
  className?: string;
};

export function KpiCard({ label, value, suffix, caption, className }: KpiCardProps): React.ReactElement {
  return (
    <Card className={cn('flex flex-col justify-between gap-2 p-4', className)}>
      <div className="text-xs font-medium text-primary-600">{label}</div>
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-2xl font-semibold tracking-tight text-ink">{value}</span>
        {suffix ? <span className="text-sm text-primary-500">{suffix}</span> : null}
      </div>
      {caption ? <div className="text-xs text-primary-500">{caption}</div> : null}
    </Card>
  );
}

export type SectionHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function SectionHeader({ title, subtitle, actions, className }: SectionHeaderProps): React.ReactElement {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="m-0 text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 mb-0 text-xs text-primary-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  className?: string;
  cell: (row: T, index: number) => React.ReactNode;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  rowId?: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: React.ReactNode;
  ariaLabel?: string;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowId,
  onRowClick,
  emptyMessage = 'No records match the current filter.',
  ariaLabel,
  className,
}: DataTableProps<T>): React.ReactElement {
  return (
    <div className={cn('w-full overflow-x-auto rounded-xl border border-primary-200 bg-surface', className)}>
      <table className="w-full border-collapse text-left text-[13px] tabular-nums" aria-label={ariaLabel}>
        <thead>
          <tr className="border-b border-primary-200 bg-primary-50 text-xs font-medium text-primary-600">
            {columns.map((col) => (
              <th key={col.key} className={cn('px-3.5 py-2.5 font-medium', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-primary-200/70">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-primary-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={rowKey(row, idx)}
                id={rowId ? rowId(row) : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-primary-100/70')}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-3.5 py-3 align-middle', col.className)}>
                    {col.cell(row, idx)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

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
      className={cn(
        'inline-grid w-full grid-flow-col auto-cols-fr gap-1 rounded-lg border border-primary-200 bg-primary-100 p-1',
        className,
      )}
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
              'inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer',
              active ? 'bg-surface text-ink shadow-2xs' : 'text-primary-600 hover:text-ink',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function MetadataField({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wider text-primary-500">{label}</div>
      <div className="text-[13px] text-ink">{children}</div>
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
    <aside
      aria-label={ariaLabel}
      className={cn(
        'sticky top-4 space-y-4 self-start rounded-xl border border-primary-200 bg-primary-50/70 p-4',
        className,
      )}
    >
      {children}
    </aside>
  );
}
