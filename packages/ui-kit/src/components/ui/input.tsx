import React from 'react';
import { cn } from '../../lib/utils.js';

export type InputProps = React.ComponentProps<'input'>;

export function Input({ className, ...props }: InputProps): React.ReactElement {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-full border border-[#E4E5E3] bg-white px-3.5 py-1.5 text-[13px] text-[#141514] placeholder:text-[#8A8C88] outline-none transition-colors focus:border-[#9A9C99] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
