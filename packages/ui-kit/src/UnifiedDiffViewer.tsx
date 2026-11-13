import React from 'react';

export interface UnifiedDiffViewerProps {
  filePath?: string;
  unifiedDiff: string;
}

export function UnifiedDiffViewer({
  filePath,
  unifiedDiff,
}: UnifiedDiffViewerProps): React.ReactElement {
  const lines = unifiedDiff.split('\n');
  return (
    <div className="nf-diff-card">
      {filePath ? (
        <div className="nf-diff-header">{filePath.toUpperCase()}</div>
      ) : null}
      <pre className="nf-diff-pre">
        {lines.map((line, index) => {
          let cls = 'nf-diff-line';
          if (line.startsWith('---')) cls += ' nf-diff-header-del';
          else if (line.startsWith('+++')) cls += ' nf-diff-header-add';
          else if (line.startsWith('@@')) cls += ' nf-diff-hunk';
          else if (line.startsWith('-')) cls += ' nf-diff-del';
          else if (line.startsWith('+')) cls += ' nf-diff-add';
          return (
            <div key={index} className={cls}>
              <code>{line || ' '}</code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
