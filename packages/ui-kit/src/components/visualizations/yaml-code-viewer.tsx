import React from 'react';
import { cn } from '../../lib/utils.js';

export type YamlCodeViewerProps = {
  yamlText: string;
  onChange?: (next: string) => void;
  textareaId?: string;
  ariaLabel?: string;
  editable?: boolean;
  className?: string;
};

function renderHighlightedYamlLine(line: string): React.ReactNode {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) {
    return <span className="text-ink-muted">{line}</span>;
  }

  const keyMatch = /^(\s*-?\s*)([A-Za-z0-9_.-]+)(:)(\s*)(.*)$/.exec(line);
  if (keyMatch) {
    const [, prefix, key, colon, space, rest] = keyMatch;
    const isNumber = /^-?\d+(\.\d+)?$/.test(rest ?? '');
    const restStyle = !rest
      ? undefined
      : { color: isNumber ? 'var(--nf-syn-num)' : 'var(--nf-syn-str)' };
    return (
      <>
        <span className="text-ink-secondary">{prefix}</span>
        <span style={{ color: 'var(--nf-syn-key)' }}>{key}</span>
        <span className="text-ink-secondary">{colon}</span>
        <span>{space}</span>
        <span className={!rest ? 'text-ink' : undefined} style={restStyle}>
          {rest}
        </span>
      </>
    );
  }

  const listMatch = /^(\s*-\s+)(.+)$/.exec(line);
  if (listMatch) {
    const [, dash, item] = listMatch;
    return (
      <>
        <span className="text-ink-secondary">{dash}</span>
        <span style={{ color: 'var(--nf-syn-str)' }}>{item}</span>
      </>
    );
  }

  return <span className="text-ink">{line || ' '}</span>;
}

export function YamlCodeViewer({
  yamlText,
  onChange,
  textareaId = 'textarea-campaign-yaml',
  ariaLabel = 'campaign.yaml v5 manifest editor',
  editable = false,
  className,
}: YamlCodeViewerProps): React.ReactElement {
  const lines = (yamlText || '').split('\n');

  if (editable && onChange) {
    return (
      <div
        className={cn(
          'grid grid-cols-[36px_1fr] bg-canvas font-mono text-[12.5px] leading-[1.65]',
          className,
        )}
      >
        <div
          aria-hidden="true"
          className="select-none py-3 pr-2 text-right text-ink-muted tabular-nums"
        >
          {lines.map((_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>
        <textarea
          id={textareaId}
          value={yamlText}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label={ariaLabel}
          className="min-h-[420px] w-full resize-none border-0 bg-canvas px-2 py-3 font-mono text-[12.5px] leading-[1.65] text-ink outline-none"
        />
      </div>
    );
  }

  return (
    <div className={cn('relative bg-canvas text-ink', className)}>
      <pre className="m-0 overflow-x-auto py-2 font-mono text-[12.5px] leading-[1.65] tabular-nums">
        {lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-[36px_1fr] px-2">
            <span className="select-none pr-3 text-right text-ink-muted">{idx + 1}</span>
            <code className="whitespace-pre">{renderHighlightedYamlLine(line)}</code>
          </div>
        ))}
      </pre>
      {onChange ? (
        <textarea
          id={textareaId}
          tabIndex={-1}
          value={yamlText}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className="sr-only"
        />
      ) : null}
    </div>
  );
}
