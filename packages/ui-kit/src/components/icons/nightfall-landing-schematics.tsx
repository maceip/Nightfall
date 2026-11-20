import React from 'react';
import { cn } from '../../lib/utils.js';
import {
  CheckCircleIcon,
  CloseIcon,
  FileCodeIcon,
  GitBranchIcon,
  ShieldCheckIcon,
} from './nightfall-icons.js';

export type LandingSchematicProps = {
  className?: string;
};

function VignetteShell({
  label,
  icon,
  title,
  pillText,
  pillTone,
  children,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  title: string;
  pillText: string;
  pillTone: 'pass' | 'info' | 'fail';
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  const pillClasses =
    pillTone === 'pass'
      ? 'bg-status-mint text-status-mint-ink'
      : pillTone === 'fail'
        ? 'bg-status-danger text-status-danger-ink'
        : 'bg-status-info text-status-info-ink';

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'nf-nightfall-vignette w-full overflow-hidden rounded-xl text-left select-none',
        className,
      )}
    >
      <div className="nf-nightfall-vignette-header flex h-9 items-center justify-between gap-2 px-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-mono text-[11.5px] font-medium text-ink-secondary">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10.5px] leading-tight font-semibold',
            pillClasses,
          )}
        >
          {pillText}
        </span>
      </div>
      <div className="divide-y divide-hairline font-mono text-[11.5px]">{children}</div>
    </div>
  );
}

export function DefensePatchSchematic({ className }: LandingSchematicProps): React.ReactElement {
  return (
    <VignetteShell
      className={className}
      label="Sandboxed patch diff replacing unauthenticated export with tenant check"
      icon={<GitBranchIcon size={13} />}
      title="fix/tenant-acl"
      pillText="Verified"
      pillTone="pass"
    >
      <div className="flex h-8 items-center bg-status-danger/45 px-3 text-status-danger-ink">
        <span className="truncate">- return exportDoc(id);</span>
      </div>
      <div className="flex h-8 items-center bg-status-mint/50 px-3 text-status-mint-ink">
        <span className="truncate">+ checkTenant(ctx, id);</span>
      </div>
      <div className="flex h-8 items-center bg-status-mint/50 px-3 text-status-mint-ink">
        <span className="truncate">+ return exportDoc(id);</span>
      </div>
    </VignetteShell>
  );
}

export function ScopedProbeSchematic({ className }: LandingSchematicProps): React.ReactElement {
  return (
    <VignetteShell
      className={className}
      label="Ed25519 signed scope manifest allowing staging routes and blocking production"
      icon={<ShieldCheckIcon size={13} />}
      title="scope.manifest"
      pillText="Ed25519"
      pillTone="info"
    >
      <div className="flex h-8 items-center justify-between gap-2 px-3">
        <span className="truncate text-ink">GET /api/docs</span>
        <span className="shrink-0 rounded-[5px] bg-status-mint px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-status-mint-ink">
          Allow
        </span>
      </div>
      <div className="flex h-8 items-center justify-between gap-2 px-3">
        <span className="truncate text-ink">WSS /realtime</span>
        <span className="shrink-0 rounded-[5px] bg-status-mint px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-status-mint-ink">
          Allow
        </span>
      </div>
      <div className="flex h-8 items-center justify-between gap-2 px-3">
        <span className="truncate text-ink-muted">POST /prod/pay</span>
        <span className="shrink-0 rounded-[5px] bg-status-danger px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-status-danger-ink">
          Block
        </span>
      </div>
    </VignetteShell>
  );
}

export function PreMergeGateSchematic({ className }: LandingSchematicProps): React.ReactElement {
  return (
    <VignetteShell
      className={className}
      label="Pre-merge CI workflow check catching unpinned action and broad permissions"
      icon={<FileCodeIcon size={13} />}
      title="workflows/ci.yml"
      pillText="Blocked"
      pillTone="fail"
    >
      <div className="flex h-8 items-center gap-2 px-3 text-ink-secondary">
        <CheckCircleIcon size={13} className="text-status-mint-ink" />
        <span className="truncate">checkout@11bd719</span>
      </div>
      <div className="flex h-8 items-center gap-2 bg-status-danger/35 px-3 text-status-danger-ink">
        <CloseIcon size={13} />
        <span className="truncate font-medium">deploy-action@main</span>
      </div>
      <div className="flex h-8 items-center gap-2 bg-status-danger/35 px-3 text-status-danger-ink">
        <CloseIcon size={13} />
        <span className="truncate font-medium">permissions: write-all</span>
      </div>
    </VignetteShell>
  );
}
