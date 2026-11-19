import React from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default: 'bg-ink text-canvas hover:opacity-90',
        secondary: 'border border-hairline-strong bg-canvas text-ink hover:bg-muted',
        outline: 'border border-hairline-strong bg-canvas text-ink hover:bg-muted',
        ghost: 'rounded-lg text-ink-secondary hover:bg-muted hover:text-ink',
        destructive:
          'border border-hairline-strong bg-status-danger text-status-danger-ink hover:opacity-90 data-[engaged=true]:bg-[#B91C1C] data-[engaged=true]:border-[#991B1B] data-[engaged=true]:text-white',
      },
      size: {
        default: 'h-8 px-3.5 text-[13px]',
        sm: 'h-7 px-3 text-[12.5px]',
        lg: 'h-9 px-4 text-[13.5px]',
        icon: 'size-8 p-0',
        'icon-sm': 'size-7 p-0 rounded-[8px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonProps = useRender.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  render,
  ...props
}: ButtonProps): React.ReactElement {
  return useRender({
    defaultTagName: 'button',
    render,
    props: mergeProps<'button'>(
      {
        type,
        className: cn(buttonVariants({ variant, size }), className),
      },
      props,
    ),
  });
}
