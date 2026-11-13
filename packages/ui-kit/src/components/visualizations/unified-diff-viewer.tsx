import React from 'react';
import { cn } from '../../lib/utils.js';

export type UnifiedDiffViewerProps = {
  filePath?: string;
  unifiedDiff: string;
  className?: string;
};

export function UnifiedDiffViewer({
  filePath,
  unifiedDiff,
  className,
}: UnifiedDiffViewerProps): React.ReactElement {
  const lines = (unifiedDiff || '').split('\n');

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-primary-200 bg-surface text-xs',
        className,
      )}
    >
      {filePath ? (
        <div className="border-b border-primary-200 bg-primary-100 px-3.5 py-2 font-mono text-[11px] font-medium uppercase tracking-wide text-primary-700">
          {filePath}
        </div>
      ) : null}
      <pre className="m-0 overflow-x-auto py-2 font-mono text-[12px] leading-5 tabular-nums">
        {lines.map((line, index) => {
          let lineTone = 'text-primary-800';
          if (line.startsWith('---') || line.startsWith('+++')) {
            lineTone = 'bg-primary-100/80 text-primary-600 font-medium';
          } else if (line.startsWith('@@')) {
            lineTone = 'bg-sky-50 text-sky-800';
          } else if (line.startsWith('-')) {
            lineTone = 'bg-rose-50/90 text-rose-900';
          } else if (line.startsWith('+')) {
            lineTone = 'bg-emerald-50/90 text-emerald-900';
          }
          return (
            <div key={index} className={cn('flex px-3.5 py-0.5', lineTone)}>
              <span className="mr-3 w-6 shrink-0 select-none text-right text-primary-400">
                {index + 1}
              </span>
              <code className="whitespace-pre">{line || ' '}</code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
