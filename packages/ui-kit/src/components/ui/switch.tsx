import React from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { cn } from '../../lib/utils.js';

export type SwitchProps = React.ComponentProps<typeof BaseSwitch.Root>;

export function Switch({ className, ...props }: SwitchProps): React.ReactElement {
  return (
    <BaseSwitch.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-hairline-strong bg-pill p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 data-[checked]:border-ink data-[checked]:bg-ink disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb className="pointer-events-none block size-3.5 rounded-full bg-canvas shadow-xs transition-transform data-[checked]:translate-x-4" />
    </BaseSwitch.Root>
  );
}
