import React from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

// Pill-shaped action buttons (rounded-full) matching all 19 uploaded Nightfall screenshots
// and synchronized with Nightfall's Astryx theme tokens (--color-accent, --color-border-emphasized).
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default: 'bg-[#141514] text-white hover:bg-[#2A2C29]',
        secondary:
          'border border-[#E2E3E1] bg-white text-[#141514] hover:bg-[#F6F7F5]',
        outline:
          'border border-[#E2E3E1] bg-white text-[#141514] hover:bg-[#F6F7F5]',
        ghost: 'rounded-lg text-[#525451] hover:bg-[#E8EAE7] hover:text-[#141514]',
        destructive:
          'border border-[#F5C2C7] bg-[#FAE5E5] text-[#9E2A2B] hover:bg-[#F6D3D3] data-[engaged=true]:bg-[#B91C1C] data-[engaged=true]:border-[#991B1B] data-[engaged=true]:text-white',
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
