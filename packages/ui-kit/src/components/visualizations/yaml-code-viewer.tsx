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
    return <span className="text-[#7A7C78]">{line}</span>;
  }

  const keyMatch = /^(\s*-?\s*)([A-Za-z0-9_.-]+)(:)(\s*)(.*)$/.exec(line);
  if (keyMatch) {
    const [, prefix, key, colon, space, rest] = keyMatch;
    const isNumber = /^-?\d+(\.\d+)?$/.test(rest ?? '');
    const restCls = !rest
      ? 'text-[#141514]'
      : isNumber
        ? 'text-[#0550AE]'
        : 'text-[#116329]';
    return (
      <>
        <span className="text-[#5E605D]">{prefix}</span>
        <span className="text-[#9E2A2B]">{key}</span>
        <span className="text-[#5E605D]">{colon}</span>
        <span>{space}</span>
        <span className={restCls}>{rest}</span>
      </>
    );
  }

  const listMatch = /^(\s*-\s+)(.+)$/.exec(line);
  if (listMatch) {
    const [, dash, item] = listMatch;
    return (
      <>
        <span className="text-[#5E605D]">{dash}</span>
        <span className="text-[#116329]">{item}</span>
      </>
    );
  }

  return <span className="text-[#141514]">{line || ' '}</span>;
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
      <div className={cn('grid grid-cols-[36px_1fr] bg-white font-mono text-[12.5px] leading-[1.65]', className)}>
        <div
          aria-hidden="true"
          className="select-none py-3 pr-2 text-right text-[#A0A29F] tabular-nums"
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
          className="min-h-[420px] w-full resize-none border-0 bg-white px-2 py-3 font-mono text-[12.5px] leading-[1.65] text-[#141514] outline-none"
        />
      </div>
    );
  }

  return (
    <div className={cn('relative bg-white', className)}>
      <pre className="m-0 overflow-x-auto py-2 font-mono text-[12.5px] leading-[1.65] tabular-nums">
        {lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-[36px_1fr] px-2">
            <span className="select-none pr-3 text-right text-[#A0A29F]">{idx + 1}</span>
            <code className="whitespace-pre">{renderHighlightedYamlLine(line)}</code>
          </div>
        ))}
      </pre>
      {onChange ? (
        <textarea
          id={textareaId}
          value={yamlText}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className="sr-only"
        />
      ) : null}
    </div>
  );
}
