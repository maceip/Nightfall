import React from 'react';
import { Input as BaseInput } from '@base-ui/react/input';
import { cn } from '../../lib/utils.js';

export type InputProps = React.ComponentProps<typeof BaseInput>;

export function Input({ className, ...props }: InputProps): React.ReactElement {
  return (
    <BaseInput
      className={cn(
        'flex h-8 w-full rounded-lg border border-primary-200 bg-surface px-3 py-1 text-[13px] text-ink transition-colors placeholder:text-primary-400 focus-visible:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
