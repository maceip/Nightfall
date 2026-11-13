import React from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  ComputerTerminal01Icon,
  DashboardSquare01Icon,
  Download01Icon,
  File02Icon,
  FilterHorizontalIcon,
  Folder01Icon,
  GitBranchIcon as HugeGitBranchIcon,
  Globe02Icon,
  Home01Icon,
  MoreHorizontalIcon as HugeMoreHorizontalIcon,
  Radar01Icon,
  ScanIcon as HugeScanIcon,
  Search01Icon,
  SecurityBlockIcon,
  SecurityCheckIcon,
  Setting07Icon,
  SidebarLeftIcon as HugeSidebarLeftIcon,
  SourceCodeIcon,
  SparklesIcon as HugeSparklesIcon,
  WavingHand01Icon,
} from '@hugeicons/core-free-icons';
import { cn } from '../../lib/utils.js';

export type NightfallIconProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-label'?: string;
};

function renderHugeIcon(icon: IconSvgElement, props: NightfallIconProps): React.ReactElement {
  const { size = 20, strokeWidth = 1.5, className, 'aria-label': ariaLabel } = props;
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      className={cn('shrink-0', className)}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
    />
  );
}

export function SearchIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Search01Icon, props);
}

export function FilterIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(FilterHorizontalIcon, props);
}

export function SettingsIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Setting07Icon, props);
}

export function SidebarLeftIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(HugeSidebarLeftIcon, props);
}

export function PlusIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Add01Icon, props);
}

export function ArrowLeftIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(ArrowLeft02Icon, props);
}

export function ArrowRightIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(ArrowRight02Icon, props);
}

export function ArrowUpIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(ArrowUp02Icon, props);
}

export function ShieldAlertIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(SecurityBlockIcon, props);
}

export function ShieldCheckIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(SecurityCheckIcon, props);
}

export function CodeIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(SourceCodeIcon, props);
}

export function FileCodeIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(File02Icon, props);
}

export function GitBranchIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(HugeGitBranchIcon, props);
}

export function GlobeIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Globe02Icon, props);
}

export function FolderIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Folder01Icon, props);
}

export function TerminalIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(ComputerTerminal01Icon, props);
}

export function HandApprovalIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(WavingHand01Icon, props);
}

export function CheckCircleIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(CheckmarkCircle02Icon, props);
}

export function CloseIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Cancel01Icon, props);
}

export function HomeWorkspaceIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Home01Icon, props);
}

export function HistoryClockIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Clock01Icon, props);
}

export function SparklesIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(HugeSparklesIcon, props);
}

export function DownloadIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Download01Icon, props);
}

export function ChevronRightIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(ArrowRight01Icon, props);
}

export function ChevronDownIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(ArrowDown01Icon, props);
}

export function GridIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(DashboardSquare01Icon, props);
}

export function RadarIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(Radar01Icon, props);
}

export function ScanIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(HugeScanIcon, props);
}

export function MoreHorizontalIcon(props: NightfallIconProps): React.ReactElement {
  return renderHugeIcon(HugeMoreHorizontalIcon, props);
}

export function NightfallHorizonIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
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
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 text-blue-600', className)}
    >
      <path
        d="M9 1.8L10.9 7.1L16.2 9L10.9 10.9L9 16.2L7.1 10.9L1.8 9L7.1 7.1L9 1.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function RedTeamCampaignBadge({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 text-blue-600', className)}
    >
      <path
        d="M16 2.5L27.5 9.1V22.9L16 29.5L4.5 22.9V9.1L16 2.5Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M16 6.2L24.4 11V21L16 25.8L7.6 21V11L16 6.2Z" fill="currentColor" />
      <circle cx="16" cy="16" r="5" className="fill-primary-950" />
      <circle cx="16" cy="16" r="1.9" className="fill-surface" />
    </svg>
  );
}
