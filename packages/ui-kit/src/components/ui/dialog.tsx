import React from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { cn } from '../../lib/utils.js';

export type DialogRootProps = React.ComponentProps<typeof BaseDialog.Root>;
export type DialogTriggerProps = React.ComponentProps<typeof BaseDialog.Trigger>;
export type DialogTitleProps = React.ComponentProps<typeof BaseDialog.Title>;
export type DialogDescriptionProps = React.ComponentProps<typeof BaseDialog.Description>;
export type DialogCloseProps = React.ComponentProps<typeof BaseDialog.Close>;

export type DialogContentProps = React.ComponentProps<typeof BaseDialog.Popup> & {
  portalContainer?: HTMLElement | React.RefObject<HTMLElement | null> | null;
};

export function DialogRoot(props: DialogRootProps): React.ReactElement {
  return <BaseDialog.Root {...props} />;
}

export function DialogTrigger(props: DialogTriggerProps): React.ReactElement {
  return <BaseDialog.Trigger {...props} />;
}

export function DialogContent({
  className,
  children,
  portalContainer,
  ...props
}: DialogContentProps): React.ReactElement {
  return (
    <BaseDialog.Portal container={portalContainer}>
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[1px] transition-opacity" />
      <BaseDialog.Popup
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-primary-200 bg-surface p-6 text-ink shadow-xl outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DrawerContent({
  className,
  children,
  portalContainer,
  ...props
}: DialogContentProps): React.ReactElement {
  return (
    <BaseDialog.Portal container={portalContainer}>
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-[1px] transition-opacity" />
      <BaseDialog.Popup
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[540px] flex-col border-l border-primary-200 bg-surface text-ink shadow-2xl outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DialogTitle({ className, ...props }: DialogTitleProps): React.ReactElement {
  return (
    <BaseDialog.Title
      className={cn('text-base font-semibold tracking-tight text-ink', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: DialogDescriptionProps): React.ReactElement {
  return (
    <BaseDialog.Description
      className={cn('text-[13px] text-primary-600', className)}
      {...props}
    />
  );
}

export function DialogClose({ className, ...props }: DialogCloseProps): React.ReactElement {
  return (
    <BaseDialog.Close
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-primary-600 transition-colors hover:bg-primary-100 hover:text-ink cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
        className,
      )}
      {...props}
    />
  );
}
