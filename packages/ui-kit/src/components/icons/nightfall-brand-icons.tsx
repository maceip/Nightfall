import React, { type SVGProps } from 'react';
import { cn } from '../../lib/utils.js';

export type BrandSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export function NightfallHorizonIcon({
  size = 18,
  className,
  ...rest
}: BrandSvgProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
      {...rest}
    >
      <path d="M3 13.5H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M6.2 13.5C6.2 11.4 7.9 9.7 10 9.7C12.1 9.7 13.8 11.4 13.8 13.5"
        fill="currentColor"
      />
      <path
        d="M10 5.2V6.8M5.4 7.2L6.5 8.3M14.6 7.2L13.5 8.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RedTeamSparkIcon({
  size = 15,
  className,
  ...rest
}: BrandSvgProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 text-[#1D74F5]', className)}
      {...rest}
    >
      <path
        d="M9 1.6L11.05 6.95L16.4 9L11.05 11.05L9 16.4L6.95 11.05L1.6 9L6.95 6.95L9 1.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function RedTeamCampaignBadge({
  size = 26,
  className,
  ...rest
}: BrandSvgProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 text-[#1D74F5]', className)}
      {...rest}
    >
      <path
        d="M16 2.5C18.2 2.5 19.8 4.4 21.8 5.2C23.8 6 26.2 5.7 27.5 7.5C28.8 9.3 27.9 11.6 28.4 13.8C28.9 16 30.2 17.9 29.5 20.1C28.8 22.3 26.5 23 25 24.8C23.5 26.6 23.2 29 21 29.7C18.8 30.4 17.1 28.8 14.9 28.8C12.7 28.8 11 30.4 8.8 29.7C6.6 29 6.3 26.6 4.8 24.8C3.3 23 1 22.3 0.3 20.1C-0.4 17.9 0.9 16 1.4 13.8C1.9 11.6 1 9.3 2.3 7.5C3.6 5.7 6 6 8 5.2C10 4.4 11.6 2.5 13.8 2.5H16Z"
        transform="translate(1, 0) scale(0.94)"
        fill="currentColor"
      />
      <circle cx="16" cy="16" r="5.6" fill="#141514" />
      <path
        d="M16 12.2L17.1 14.9L19.8 16L17.1 17.1L16 19.8L14.9 17.1L12.2 16L14.9 14.9L16 12.2Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function CloudTerminalHeroIcon({
  size = 44,
  className,
  ...rest
}: BrandSvgProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 text-[#9A9C99]', className)}
      {...rest}
    >
      <path
        d="M13.5 33.5H31.5C35.64 33.5 39 30.14 39 26C39 22.19 36.16 19.04 32.47 18.56C31.26 13.65 26.82 10 21.5 10C15.28 10 10.22 14.96 10.01 21.13C6.89 21.82 4.5 24.61 4.5 28C4.5 31.04 6.96 33.5 10 33.5H13.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 22L19.8 25L16.5 28M22.5 28H27"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScorecardPostureIcon({
  size = 16,
  className,
  ...rest
}: BrandSvgProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
      {...rest}
    >
      <path
        d="M10 2.2L16.4 4.9V9.8C16.4 13.7 13.7 16.9 10 17.9C6.3 16.9 3.6 13.7 3.6 9.8V4.9L10 2.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7.3 10.1L9.2 12L13 8.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MantisClawIcon({
  size = 16,
  className,
  ...rest
}: BrandSvgProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
      {...rest}
    >
      <path
        d="M4 15.5L8.5 6L11.5 10.5L16 4.5M8.5 6L5 4.5M16 4.5L16.5 8.5M6.5 15.5H14.5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
