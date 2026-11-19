import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Download,
  FileCode2,
  Folder,
  GitBranch,
  Globe,
  Hand,
  Home,
  Layers,
  LayoutGrid,
  List,
  Maximize2,
  Mic,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Radar,
  ScanLine,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils.js';

export * from './nightfall-brand-icons.js';

export type NightfallIconProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
  filled?: boolean;
  'aria-label'?: string;
};

function renderLucide(IconComp: LucideIcon, props: NightfallIconProps): React.ReactElement {
  const {
    size = 17,
    strokeWidth = 1.65,
    className,
    filled = false,
    'aria-label': ariaLabel,
  } = props;
  return (
    <IconComp
      size={size}
      strokeWidth={strokeWidth}
      fill={filled ? 'currentColor' : 'none'}
      className={cn('shrink-0', className)}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
    />
  );
}

export function SearchIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Search, props);
}
export function FilterIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(SlidersHorizontal, props);
}
export function BulletListIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(List, props);
}
export function SettingsIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Settings, props);
}
export function SidebarLeftIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(PanelLeft, props);
}
export function PlusIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Plus, props);
}
export function ArrowLeftIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(ArrowLeft, props);
}
export function ArrowRightIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(ArrowRight, props);
}
export function ArrowUpIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(ArrowUp, props);
}
export function ShieldAlertIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(ShieldAlert, props);
}
export function ShieldCheckIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(ShieldCheck, props);
}
export function CodeIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Code2, props);
}
export function FileCodeIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(FileCode2, props);
}
export function ThreadsStackIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Layers, props);
}
export function GitBranchIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(GitBranch, props);
}
export function GlobeIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Globe, props);
}
export function FolderIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Folder, props);
}
export function TerminalIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Terminal, props);
}
export function HandApprovalIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Hand, props);
}
export function BellIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Bell, props);
}
export function MicIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Mic, props);
}
export function ExpandDiagonalIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Maximize2, props);
}
export function CheckCircleIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(CheckCircle2, props);
}
export function CloseIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(X, props);
}
export function HomeWorkspaceIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Home, props);
}
export function HistoryClockIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Clock, props);
}
export function SparklesIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Sparkles, props);
}
export function DownloadIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Download, props);
}
export function ChevronRightIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(ChevronRight, props);
}
export function ChevronDownIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(ChevronDown, props);
}
export function GridIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(LayoutGrid, props);
}
export function RadarIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(Radar, props);
}
export function ScanIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(ScanLine, props);
}
export function MoreHorizontalIcon(props: NightfallIconProps): React.ReactElement {
  return renderLucide(MoreHorizontal, props);
}
