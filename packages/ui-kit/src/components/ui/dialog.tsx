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
  floating?: boolean;
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
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px] transition-opacity" />
      <BaseDialog.Popup
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#E4E5E3] bg-white p-6 text-[#141514] shadow-2xl outline-none',
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
  floating = false,
  ...props
}: DialogContentProps): React.ReactElement {
  return (
    <BaseDialog.Portal container={portalContainer}>
      <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/10 transition-opacity" />
      <BaseDialog.Popup
        className={cn(
          floating
            ? 'fixed top-3 right-3 bottom-3 z-50 flex w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-[#E4E5E3] bg-white text-[#141514] shadow-[0_16px_48px_rgba(20,21,20,0.14)] outline-none'
            : 'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[540px] flex-col border-l border-[#E6E7E5] bg-white text-[#141514] shadow-2xl outline-none',
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
      className={cn('text-[18px] font-semibold tracking-[-0.015em] text-[#141514]', className)}
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
      className={cn('text-[13px] text-[#5E605D]', className)}
      {...props}
    />
  );
}

export function DialogClose({ className, ...props }: DialogCloseProps): React.ReactElement {
  return (
    <BaseDialog.Close
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-full text-[#6E706D] transition-colors hover:bg-[#EFEFED] hover:text-[#141514] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
        className,
      )}
      {...props}
    />
  );
}
