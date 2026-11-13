import React from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { cn } from '../../lib/utils.js';

export type SwitchProps = React.ComponentProps<typeof BaseSwitch.Root>;

export function Switch({ className, ...props }: SwitchProps): React.ReactElement {
  return (
    <BaseSwitch.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-primary-300 bg-primary-200 p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-400 data-[checked]:border-primary-950 data-[checked]:bg-primary-950 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb className="pointer-events-none block size-3.5 rounded-full bg-surface shadow-xs transition-transform data-[checked]:translate-x-4" />
    </BaseSwitch.Root>
  );
}
