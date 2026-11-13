import React from 'react';
import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible';
import { cn } from '../../lib/utils.js';

export type CollapsibleProps = React.ComponentProps<typeof BaseCollapsible.Root>;
export type CollapsibleTriggerProps = React.ComponentProps<typeof BaseCollapsible.Trigger>;
export type CollapsiblePanelProps = React.ComponentProps<typeof BaseCollapsible.Panel>;

export function Collapsible({ className, ...props }: CollapsibleProps): React.ReactElement {
  return <BaseCollapsible.Root className={cn('w-full', className)} {...props} />;
}

export function CollapsibleTrigger({
  className,
  ...props
}: CollapsibleTriggerProps): React.ReactElement {
  return (
    <BaseCollapsible.Trigger
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-ink transition-colors hover:bg-primary-100 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
        className,
      )}
      {...props}
    />
  );
}

export function CollapsiblePanel({
  className,
  ...props
}: CollapsiblePanelProps): React.ReactElement {
  return (
    <BaseCollapsible.Panel
      className={cn('overflow-hidden pt-2 text-[13px] text-primary-700', className)}
      {...props}
    />
  );
}
