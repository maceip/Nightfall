import React from 'react';
import { cn } from '../../lib/utils.js';

export type InputProps = React.ComponentProps<'input'>;

export function Input({ className, ...props }: InputProps): React.ReactElement {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-full border border-hairline-strong bg-canvas px-3.5 py-1.5 text-[13px] text-ink placeholder:text-ink-muted outline-none transition-colors focus:border-ink-secondary focus-visible:ring-2 focus-visible:ring-accent-blue/35 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
