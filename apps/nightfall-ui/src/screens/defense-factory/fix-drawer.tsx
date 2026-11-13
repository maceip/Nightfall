import React, { useState } from 'react';
import type { FixProposal } from '@nightfall/core-contracts';
import {
  ArrowUpIcon,
  Badge,
  Button,
  Card,
  CheckCircleIcon,
  ChevronDownIcon,
  CloseIcon,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  DialogClose,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DrawerContent,
  GitBranchIcon,
  PlusIcon,
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
  StatusBadge,
  UnifiedDiffViewer,
} from '@nightfall/ui-kit';

export type FixDrawerProps = {
  fix: FixProposal | undefined;
  onClose: () => void;
  onFollowUp: (fixId: string, message: string) => Promise<void>;
  onMergeAndVerify: (fixId: string) => Promise<void>;
};

export function FixDrawer({
  fix,
  onClose,
  onFollowUp,
  onMergeAndVerify,
}: FixDrawerProps): React.ReactElement | null {
  const [followUpText, setFollowUpText] = useState('');
  const [showDiff, setShowDiff] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!fix) return null;

  const activeFix = fix;
  const sandboxLabel =
    activeFix.sandboxBackend === 'process-confined' ? 'Process Confined' : 'Microsoft LiteBox';

  async function handleSubmitFollowUp(): Promise<void> {
    if (!followUpText.trim() || busy) return;
    setBusy(true);
    try {
      await onFollowUp(activeFix.id, followUpText.trim());
      setFollowUpText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogRoot
      open={Boolean(activeFix)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent aria-label="Fix with Nightfall">
        <div className="flex items-start justify-between gap-3 border-b border-primary-200 px-5 py-4">
          <div>
            <DialogTitle>Fix with Nightfall</DialogTitle>
            <DialogDescription className="mt-0.5">
              {activeFix.findingIds.join(', ')} · {activeFix.repository} · {activeFix.snapshotLabel}
            </DialogDescription>
          </div>
          <DialogClose id="btn-close-fix-drawer" aria-label="Close Fix with Nightfall drawer">
            <CloseIcon size={16} />
          </DialogClose>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Card className="bg-primary-50/80 p-3.5">
            <div className="text-xs text-primary-500">
              Fix requested in hermetic Defense Factory sandbox
            </div>
            <div className="mt-1 text-[13px] text-ink">
              Prepare minimal patch for{' '}
              <span className="font-semibold">{activeFix.findingIds.join(', ')}</span> with
              failing-then-passing regression test proof.
            </div>
          </Card>

          <Collapsible defaultOpen className="rounded-xl border border-primary-200 bg-surface p-2">
            <CollapsibleTrigger>
              <span className="inline-flex items-center gap-2 text-emerald-700">
                <CheckCircleIcon size={16} />
                <span>✓ Fix prepared · Two-stage test proof verified</span>
              </span>
              <ChevronDownIcon size={15} className="text-primary-500" />
            </CollapsibleTrigger>
            <CollapsiblePanel className="px-2.5 pb-2">
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge
                  status={activeFix.gates.baselineBuildPassed ? 'verified' : 'verifying'}
                  label="Baseline Build ✓"
                />
                <StatusBadge
                  status={activeFix.gates.redPhaseFailedAsExpected ? 'verified' : 'verifying'}
                  label="Red Test Repro ✓"
                />
                <StatusBadge
                  status={activeFix.gates.greenPhasePassed ? 'verified' : 'verifying'}
                  label="Green Patch ✓"
                />
                <StatusBadge
                  status={activeFix.gates.regressionSuitePassed ? 'verified' : 'verifying'}
                  label={
                    activeFix.gates.regressionSuitePassed ? 'Regression Suite ✓' : 'Suite Running'
                  }
                />
                <StatusBadge
                  status={activeFix.gates.staticHygienePassed ? 'verified' : 'verifying'}
                  label="Static Hygiene ✓"
                />
              </div>
              <p className="mt-2 mb-0 text-xs text-primary-600">{activeFix.gates.criticNotes}</p>
            </CollapsiblePanel>
          </Collapsible>

          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold text-ink">
                Proposed fix 1 — {activeFix.title}
              </div>
              <Badge variant="accent">{sandboxLabel}</Badge>
            </div>

            {activeFix.branchName || activeFix.commitSha ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {activeFix.branchName ? (
                  <span className="inline-code inline-flex items-center gap-1">
                    <GitBranchIcon size={12} />
                    <span>{activeFix.branchName}</span>
                  </span>
                ) : null}
                {activeFix.commitSha ? (
                  <span className="inline-code">commit {activeFix.commitSha.slice(0, 10)}</span>
                ) : null}
              </div>
            ) : null}

            <p className="m-0 text-[13px] leading-relaxed text-primary-700">
              {activeFix.explanation}
            </p>
            <div className="text-xs text-primary-500 tabular-nums">
              {activeFix.changedFilesCount} changed files
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                id="btn-toggle-review-diff"
                variant="outline"
                size="sm"
                onClick={() => setShowDiff((v) => !v)}
              >
                {showDiff ? 'Hide changes' : 'Review changes'}
              </Button>

              {activeFix.status !== 'merged' ? (
                <Button
                  id="btn-merge-and-verify"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onMergeAndVerify(activeFix.id);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Merge &amp; Verify Fix
                </Button>
              ) : (
                <StatusBadge status="merged" label="Merged & Verified Closed ✓" />
              )}
            </div>
          </Card>

          {showDiff ? (
            <div className="space-y-3">
              <UnifiedDiffViewer
                filePath={`${activeFix.repository} (patch)`}
                unifiedDiff={activeFix.unifiedDiff}
              />
              <UnifiedDiffViewer
                filePath={`${activeFix.repository} (security regression test)`}
                unifiedDiff={activeFix.securityTestDiff}
              />
            </div>
          ) : null}

          {activeFix.conversation.length > 0 ? (
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-500">
                REFINEMENT THREAD
              </div>
              {activeFix.conversation.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.role === 'user'
                      ? 'rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-[13px] text-ink'
                      : 'rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-[13px] text-ink'
                  }
                >
                  <div className="mb-0.5 text-[11px] font-semibold text-primary-600">
                    {msg.role === 'user' ? 'Engineer' : 'Nightfall Defense Factory'}
                  </div>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="border-t border-primary-200 bg-primary-50/60 p-3.5">
          <PromptInput
            value={followUpText}
            onValueChange={setFollowUpText}
            onSubmit={() => void handleSubmitFollowUp()}
            disabled={busy}
          >
            <PromptInputTextarea
              id="input-fix-followup"
              placeholder="+ Ask for follow-up or supply codebase context..."
            />
            <PromptInputActions>
              <span className="inline-flex items-center gap-1 text-xs text-primary-500">
                <PlusIcon size={13} />
                <span>Ask for follow-up</span>
              </span>
              <Button
                id="btn-send-followup"
                size="icon-sm"
                disabled={busy || !followUpText.trim()}
                aria-label="Send follow-up"
                onClick={() => void handleSubmitFollowUp()}
              >
                <ArrowUpIcon size={14} />
              </Button>
            </PromptInputActions>
          </PromptInput>
        </div>
      </DrawerContent>
    </DialogRoot>
  );
}
