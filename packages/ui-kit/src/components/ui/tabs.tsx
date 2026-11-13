import React from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cn } from '../../lib/utils.js';

export type TabsProps = React.ComponentProps<typeof BaseTabs.Root>;
export type TabsListProps = React.ComponentProps<typeof BaseTabs.List>;
export type TabsTabProps = React.ComponentProps<typeof BaseTabs.Tab>;
export type TabsPanelProps = React.ComponentProps<typeof BaseTabs.Panel>;

export function Tabs({ className, ...props }: TabsProps): React.ReactElement {
  return <BaseTabs.Root className={cn('flex flex-col', className)} {...props} />;
}

export function TabsList({ className, ...props }: TabsListProps): React.ReactElement {
  return (
    <BaseTabs.List
      className={cn(
        'inline-flex items-center gap-1 border-b border-primary-200 px-6 bg-surface',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTab({ className, ...props }: TabsTabProps): React.ReactElement {
  return (
    <BaseTabs.Tab
      className={cn(
        'relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium text-primary-600 transition-colors hover:text-ink cursor-pointer outline-none border-b-2 border-transparent data-[active]:border-ink data-[active]:text-ink',
        className,
      )}
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: TabsPanelProps): React.ReactElement {
  return (
    <BaseTabs.Panel
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}
