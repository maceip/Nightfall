import React from 'react';
import { cn } from '../../lib/utils.js';

export type CardProps = React.ComponentProps<'div'>;

export function Card({ className, ...props }: CardProps): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[#EBEBEA] bg-white p-4 text-[#141514]',
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

export function KpiCard({
  label,
  value,
  suffix,
  caption,
  className,
}: KpiCardProps): React.ReactElement {
  return (
    <Card className={cn('flex flex-col justify-between gap-2 p-4', className)}>
      <div className="text-[12.5px] font-medium text-[#5E605D]">{label}</div>
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-[#141514]">
          {value}
        </span>
        {suffix ? <span className="text-[15px] text-[#7A7C78]">{suffix}</span> : null}
      </div>
      {caption ? <div className="text-[12px] text-[#6E706D]">{caption}</div> : null}
    </Card>
  );
}

export type ConnectedKpiCell = {
  key: string;
  label: React.ReactNode;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  caption?: React.ReactNode;
  onClick?: () => void;
};

export function ConnectedKpiStrip({
  cells,
  labelFirst = true,
  className,
}: {
  cells: ConnectedKpiCell[];
  labelFirst?: boolean;
  className?: string;
}): React.ReactElement {
  const colsCls =
    cells.length === 4
      ? 'grid-cols-2 sm:grid-cols-4'
      : cells.length === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-2';
  return (
    <div
      className={cn(
        'grid divide-y sm:divide-y-0 sm:divide-x divide-[#ECEEE9] rounded-2xl border border-[#E6E7E5] bg-white tabular-nums',
        colsCls,
        className,
      )}
    >
      {cells.map((cell) => {
        const Tag = cell.onClick ? 'button' : 'div';
        return (
          <Tag
            key={cell.key}
            type={cell.onClick ? 'button' : undefined}
            onClick={cell.onClick}
            className={cn(
              'flex flex-col justify-between gap-2 px-5 py-4 text-left',
              cell.onClick && 'cursor-pointer transition-colors hover:bg-[#FAFBF9]',
            )}
          >
            {labelFirst ? (
              <>
                <div className="text-[12.5px] font-medium text-[#5E605D]">{cell.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-[#141514]">
                    {cell.value}
                  </span>
                  {cell.suffix ? (
                    <span className="text-[18px] font-medium text-[#8A8C88]">{cell.suffix}</span>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-[#141514]">
                    {cell.value}
                  </span>
                  {cell.suffix ? (
                    <span className="text-[18px] font-medium text-[#8A8C88]">{cell.suffix}</span>
                  ) : null}
                </div>
                <div className="text-[13px] text-[#6E706D]">{cell.label}</div>
              </>
            )}
            {cell.caption ? <div className="text-[12px] text-[#6E706D]">{cell.caption}</div> : null}
          </Tag>
        );
      })}
    </div>
  );
}

export type SectionHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
}: SectionHeaderProps): React.ReactElement {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-[#141514]">{title}</h2>
        {subtitle ? <p className="mt-0.5 mb-0 text-[12.5px] text-[#5E605D]">{subtitle}</p> : null}
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
  hideHeader?: boolean;
  footer?: React.ReactNode;
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
  hideHeader = false,
  footer,
  className,
}: DataTableProps<T>): React.ReactElement {
  return (
    <div className={cn('w-full overflow-x-auto bg-white', className)}>
      <table
        className="w-full border-collapse text-left text-[13.5px] tabular-nums"
        aria-label={ariaLabel}
      >
        {!hideHeader ? (
          <thead>
            <tr className="border-b border-[#ECEEE9] bg-white text-[12px] font-medium text-[#6E706D]">
              {columns.map((col) => (
                <th key={col.key} className={cn('px-3 py-2.5 font-medium', col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody className="divide-y divide-[#F0F1EE]">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-[13px] text-[#7A7C78]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={rowKey(row, idx)}
                id={rowId ? rowId(row) : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-[#F8F9F7]',
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-3 py-3 align-middle', col.className)}>
                    {col.cell(row, idx)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {footer ? (
        <div className="flex items-center justify-between border-t border-[#ECEEE9] px-4 py-2.5 text-[12px] text-[#6E706D]">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

