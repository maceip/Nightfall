import React from 'react';
import { cn } from '../../lib/utils.js';

export type UnifiedDiffViewerProps = {
  filePath?: string;
  unifiedDiff: string;
  className?: string;
};

// Matches Screenshot #10 (`SEARCH_EXPORTS.PY` Minimal patch viewer):
// Clean uppercase monospace header, zero sequential line-number gutter,
// soft rose (`#FCEBEA`) for `---` and `-`, soft emerald (`#E6F6EC`) for `+++` and `+`,
// and crisp white background for `@@` hunk headers and context lines.
export function UnifiedDiffViewer({
  filePath,
  unifiedDiff,
  className,
}: UnifiedDiffViewerProps): React.ReactElement {
  const lines = (unifiedDiff || '').split('\n');

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-[#E6E7E5] bg-white text-xs',
        className,
      )}
    >
      {filePath ? (
        <div className="border-b border-[#ECEEE9] bg-[#FAFBF9] px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-[#5E605D]">
          {filePath}
        </div>
      ) : null}
      <pre className="m-0 overflow-x-auto py-1.5 font-mono text-[12px] leading-[1.6] tabular-nums">
        {lines.map((line, index) => {
          let lineTone = 'bg-white text-[#141514]';
          if (line.startsWith('---')) {
            lineTone = 'bg-[#FCEBEA] text-[#8A1F24]';
          } else if (line.startsWith('+++')) {
            lineTone = 'bg-[#E6F6EC] text-[#14532D]';
          } else if (line.startsWith('@@')) {
            lineTone = 'bg-white text-[#5E605D]';
          } else if (line.startsWith('-')) {
            lineTone = 'bg-[#FCEBEA] text-[#8A1F24]';
          } else if (line.startsWith('+')) {
            lineTone = 'bg-[#E6F6EC] text-[#14532D]';
          }
          return (
            <div key={index} className={cn('px-4 py-0.5', lineTone)}>
              <code className="whitespace-pre">{line || ' '}</code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
