import React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { cn } from '../../lib/utils.js';

export type TooltipProviderProps = React.ComponentProps<typeof BaseTooltip.Provider>;
export type TooltipRootProps = React.ComponentProps<typeof BaseTooltip.Root>;
export type TooltipTriggerProps = React.ComponentProps<typeof BaseTooltip.Trigger>;
export type TooltipContentProps = React.ComponentProps<typeof BaseTooltip.Popup> & {
  sideOffset?: number;
};

export function TooltipProvider({
  delay = 250,
  ...props
}: TooltipProviderProps): React.ReactElement {
  return <BaseTooltip.Provider delay={delay} {...props} />;
}

export function TooltipRoot(props: TooltipRootProps): React.ReactElement {
  return <BaseTooltip.Root {...props} />;
}

export function TooltipTrigger(props: TooltipTriggerProps): React.ReactElement {
  return <BaseTooltip.Trigger {...props} />;
}

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: TooltipContentProps): React.ReactElement {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner sideOffset={sideOffset} className="z-50">
        <BaseTooltip.Popup
          className={cn(
            'rounded-md border border-primary-800 bg-primary-950 px-2.5 py-1 text-xs font-medium text-surface shadow-md outline-none',
            className,
          )}
          {...props}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}
