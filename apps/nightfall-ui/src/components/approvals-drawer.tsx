import React, { useState } from 'react';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import type { HitlApprovalRequest } from '@nightfall/core-contracts';
import {
  Button,
  CloseIcon,
  DialogClose,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DrawerContent,
  HandApprovalIcon,
  ShieldCheckIcon,
} from '@nightfall/ui-kit';

export type ApprovalsDrawerProps = {
  open: boolean;
  approvals: HitlApprovalRequest[];
  onClose: () => void;
  onResolveApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
};

export function ApprovalsDrawer({
  open,
  approvals,
  onClose,
  onResolveApproval,
}: ApprovalsDrawerProps): React.ReactElement {
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const pending = approvals.filter((a) => a.status === 'pending');
  const resolved = approvals.filter((a) => a.status !== 'pending');
  const ordered = [...pending, ...resolved];

  async function handleDecision(id: string, decision: 'approved' | 'rejected'): Promise<void> {
    setResolvingId(id);
    try {
      await onResolveApproval(id, decision);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DrawerContent
        id="nightfall-approvals-drawer"
        floating
        className="border-hairline-strong bg-canvas text-ink"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-hairline px-6 py-4">
          <VStack gap={1}>
            <HStack gap={2} align="center">
              <HandApprovalIcon size={16} className="text-status-amber-ink" />
              <DialogTitle className="text-ink">Human-in-the-Loop Approvals</DialogTitle>
            </HStack>
            <DialogDescription className="text-ink-secondary">
              Review pending Tier 2+ state-mutating probe requests constrained by Ed25519
              ScopeManifest v5.
            </DialogDescription>
          </VStack>
          <DialogClose id="btn-close-approvals-drawer" aria-label="Close approvals drawer">
            <CloseIcon size={15} />
          </DialogClose>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {ordered.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-muted p-6 text-center">
              <VStack gap={1.5} align="center">
                <ShieldCheckIcon size={20} className="text-ink-muted" />
                <p className="m-0 text-[13.5px] font-medium text-ink">
                  No pending HITL approval gates
                </p>
                <p className="m-0 text-xs text-ink-secondary">
                  All active Red Team probes are operating within pre-approved Tier 0/1 bounds.
                </p>
              </VStack>
            </div>
          ) : (
            <VStack gap={3}>
              {ordered.map((item, idx) => {
                const isPending = item.status === 'pending';
                const statusVariant = isPending
                  ? 'warning'
                  : item.status === 'approved'
                    ? 'success'
                    : 'error';
                const tierColor = item.riskTier === 'TIER_3_RESTRICTED' ? 'red' : 'orange';
                return (
                  <React.Fragment key={item.id}>
                    {idx > 0 ? <Divider variant="subtle" /> : null}
                    <div
                      id={`hitl-drawer-item-${item.id}`}
                      className="rounded-xl border border-hairline bg-canvas p-4"
                    >
                      <VStack gap={2}>
                        <HStack gap={2} align="center" justify="between" wrap="wrap">
                          <HStack gap={2} align="center">
                            <StatusDot variant={statusVariant} label={item.status} />
                            <span className="text-[13px] font-semibold text-ink">
                              {item.actionSummary}
                            </span>
                          </HStack>
                          <Token size="sm" color={tierColor} label={item.riskTier} />
                        </HStack>

                        <div className="font-mono text-xs text-ink-secondary">
                          {item.targetEndpoint}
                        </div>
                        <p className="m-0 text-[12.5px] leading-relaxed text-ink-secondary">
                          {item.rationale}
                        </p>

                        {isPending ? (
                          <HStack gap={2} align="center" justify="end">
                            <Button
                              id={`btn-drawer-reject-${item.id}`}
                              variant="outline"
                              size="sm"
                              disabled={resolvingId === item.id}
                              onClick={() => void handleDecision(item.id, 'rejected')}
                            >
                              Reject probe
                            </Button>
                            <Button
                              id={`btn-drawer-approve-${item.id}`}
                              size="sm"
                              disabled={resolvingId === item.id}
                              onClick={() => void handleDecision(item.id, 'approved')}
                            >
                              Approve probe
                            </Button>
                          </HStack>
                        ) : (
                          <span className="text-[11.5px] text-ink-muted">
                            Decision: {item.status}
                            {item.resolvedBy ? ` · ${item.resolvedBy}` : ''}
                          </span>
                        )}
                      </VStack>
                    </div>
                  </React.Fragment>
                );
              })}
            </VStack>
          )}
        </div>
      </DrawerContent>
    </DialogRoot>
  );
}
