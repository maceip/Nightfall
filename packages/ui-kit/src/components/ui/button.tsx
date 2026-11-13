import React from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary-950 text-surface hover:bg-primary-800 shadow-2xs',
        secondary: 'bg-primary-100 text-ink hover:bg-primary-200 border border-primary-200',
        outline: 'border border-primary-200 bg-surface text-ink hover:bg-primary-100',
        ghost: 'text-primary-700 hover:bg-primary-100 hover:text-ink',
        destructive:
          'border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 data-[engaged=true]:bg-rose-700 data-[engaged=true]:border-rose-800 data-[engaged=true]:text-white',
      },
      size: {
        default: 'h-8 px-3 text-[13px]',
        sm: 'h-7 px-2.5 text-xs rounded-md',
        lg: 'h-9 px-4 text-sm',
        icon: 'size-8 p-0',
        'icon-sm': 'size-7 p-0 rounded-md',
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
