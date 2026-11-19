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
        'overflow-hidden rounded-xl border border-hairline bg-canvas text-xs',
        className,
      )}
    >
      {filePath ? (
        <div className="border-b border-hairline bg-sidebar px-3.5 py-2 font-mono text-[11px] font-medium tracking-[0.03em] text-ink-secondary truncate">
          {filePath}
        </div>
      ) : null}
      <pre className="m-0 overflow-x-auto py-1.5 font-mono text-[11.5px] leading-[1.55] tabular-nums">
        {lines.map((line, index) => {
          let lineTone = 'bg-canvas text-ink';
          if (line.startsWith('---') || line.startsWith('-')) {
            lineTone = 'bg-status-danger text-status-danger-ink';
          } else if (line.startsWith('+++') || line.startsWith('+')) {
            lineTone = 'bg-status-mint text-status-mint-ink';
          } else if (line.startsWith('@@')) {
            lineTone = 'bg-canvas text-ink-muted';
          }
          return (
            <div key={index} className={cn('px-3.5 py-0.5', lineTone)}>
              <code className="whitespace-pre">{line || ' '}</code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
