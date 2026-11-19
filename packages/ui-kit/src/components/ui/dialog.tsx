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
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px] transition-opacity" />
      <BaseDialog.Popup
        aria-modal="true"
        className={cn(
          'nf-elevated-surface fixed left-1/2 top-1/2 z-50 w-[min(512px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-hairline-strong bg-card p-6 text-ink shadow-2xl outline-none',
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
      <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/30 transition-opacity" />
      <BaseDialog.Popup
        aria-modal="true"
        className={cn(
          floating
            ? 'nf-elevated-surface fixed top-3 right-3 bottom-3 z-50 flex w-[min(620px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-hairline-strong bg-card text-ink shadow-[0_18px_54px_rgba(0,0,0,0.32)] outline-none'
            : 'nf-elevated-surface fixed inset-y-0 right-0 z-50 flex h-full w-[min(540px,100vw)] flex-col border-l border-hairline-strong bg-card text-ink shadow-2xl outline-none',
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
      className={cn('text-[18px] font-semibold tracking-[-0.015em] text-ink', className)}
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
      className={cn('text-[13px] text-ink-secondary', className)}
      {...props}
    />
  );
}

export function DialogClose({ className, ...props }: DialogCloseProps): React.ReactElement {
  return (
    <BaseDialog.Close
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-pill hover:text-ink cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40',
        className,
      )}
      {...props}
    />
  );
}
