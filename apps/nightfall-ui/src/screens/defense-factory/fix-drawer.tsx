import React, { useState } from 'react';
import { Code } from '@astryxdesign/core/Code';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import type { FixProposal } from '@nightfall/core-contracts';
import {
  ArrowUpIcon,
  Badge,
  Button,
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

  const gateList = [
    { key: 'baseline', label: 'Baseline Build', passed: activeFix.gates.baselineBuildPassed },
    { key: 'red', label: 'Red Test Repro', passed: activeFix.gates.redPhaseFailedAsExpected },
    { key: 'green', label: 'Green Patch', passed: activeFix.gates.greenPhasePassed },
    { key: 'regression', label: 'Regression Suite', passed: activeFix.gates.regressionSuitePassed },
    { key: 'hygiene', label: 'Static Hygiene', passed: activeFix.gates.staticHygienePassed },
    { key: 'critic', label: 'Critic Review', passed: activeFix.gates.criticApproved },
  ];
  const passedCount = gateList.filter((g) => g.passed).length;
  const allPassed = gateList.length > 0 && passedCount === gateList.length;

  const rawStatus = activeFix.status as string;
  const isMerged = rawStatus === 'merged' || rawStatus === 'merged_verified';

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
      <DrawerContent
        floating
        className="w-[min(560px,calc(100vw-24px))]"
        aria-label="Fix with Nightfall"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline bg-canvas px-5 py-4">
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

        <div className="flex-1 space-y-4 overflow-y-auto bg-canvas px-5 py-4 tabular-nums">
          <div className="space-y-1 border-l-2 border-hairline-strong pl-3 text-[13px] text-ink-secondary">
            <div className="text-xs text-ink-muted">Fix requested in background</div>
            <div className="text-ink">
              Help fix <span className="font-semibold">{activeFix.findingIds.join(', ')}</span> in{' '}
              <span className="font-mono text-xs">{activeFix.repository}</span> with minimal patch
              and failing-then-passing regression proof.
            </div>
          </div>

          <Collapsible defaultOpen className="rounded-xl border border-hairline bg-sidebar p-2">
            <CollapsibleTrigger>
              <HStack gap={2} align="center">
                <StatusDot
                  variant={allPassed ? 'success' : 'warning'}
                  label={allPassed ? 'All gates passed' : 'Verification gates pending'}
                />
                <span className="text-[13px] font-medium text-ink">
                  {allPassed
                    ? `Fix prepared · All ${gateList.length} verification gates passed`
                    : `Verification gates · ${passedCount}/${gateList.length} passed`}
                </span>
              </HStack>
              <ChevronDownIcon size={15} className="text-ink-muted" />
            </CollapsibleTrigger>
            <CollapsiblePanel className="px-2.5 pb-2">
              <div className="flex flex-wrap gap-1.5">
                {gateList.map((g) => (
                  <StatusBadge
                    key={g.key}
                    status={g.passed ? 'verified' : 'verifying'}
                    label={g.passed ? `${g.label} ✓` : `${g.label} Pending`}
                  />
                ))}
              </div>
              <p className="mt-2 mb-0 text-xs text-ink-secondary">{activeFix.gates.criticNotes}</p>
            </CollapsiblePanel>
          </Collapsible>

          <div className="text-[13px] font-medium text-ink">
            {allPassed
              ? 'A fix is ready for your review.'
              : 'Review verification status before merging.'}
          </div>

          <div className="space-y-3 rounded-2xl border border-hairline bg-canvas p-4">
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Proposed fix 1
              </span>
              <Badge variant="accent">{sandboxLabel}</Badge>
            </HStack>

            <div className="space-y-1">
              <div className="text-[14px] font-semibold text-ink">{activeFix.title}</div>
              <p className="m-0 text-[13px] leading-relaxed text-ink-secondary">
                {activeFix.explanation}
              </p>
            </div>

            <HStack gap={2} align="center" wrap="wrap" className="text-xs text-ink-muted">
              <span>{activeFix.changedFilesCount} changed files</span>
              {activeFix.branchName ? (
                <span className="inline-flex items-center gap-1 font-mono text-ink-secondary">
                  <GitBranchIcon size={12} />
                  <span>{activeFix.branchName}</span>
                </span>
              ) : null}
              {activeFix.commitSha ? (
                <Code size="inherit">{activeFix.commitSha.slice(0, 10)}</Code>
              ) : null}
            </HStack>

            <HStack gap={2} align="center" wrap="wrap">
              <Button
                id="btn-toggle-review-diff"
                variant="outline"
                size="sm"
                onClick={() => setShowDiff((v) => !v)}
              >
                {showDiff ? 'Hide changes' : 'Review changes'}
              </Button>

              <Button
                id="btn-merge-and-verify"
                size="sm"
                disabled={busy || isMerged}
                className={
                  isMerged
                    ? 'bg-status-mint text-status-mint-ink hover:bg-status-mint disabled:opacity-100'
                    : undefined
                }
                onClick={async () => {
                  if (isMerged) return;
                  setBusy(true);
                  try {
                    await onMergeAndVerify(activeFix.id);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {isMerged ? 'Merged & Verified Closed ✓' : 'Merge & Verify Closed'}
              </Button>
            </HStack>

            {showDiff ? (
              <div className="space-y-3 pt-1">
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
          </div>

          {activeFix.conversation.length > 0 ? (
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                REFINEMENT THREAD
              </div>
              {activeFix.conversation.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-xl border border-hairline bg-sidebar px-3.5 py-2.5 text-[13px] text-ink"
                >
                  <div className="mb-0.5 text-[11px] font-semibold text-ink-secondary">
                    {msg.role === 'user' ? 'Engineer' : 'Nightfall Defense Factory'}
                  </div>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="border-t border-hairline bg-canvas p-3.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmitFollowUp();
            }}
            className="flex items-center gap-2 rounded-full border border-hairline-strong bg-canvas px-3.5 py-1.5 shadow-2xs"
          >
            <PlusIcon size={15} className="shrink-0 text-ink-muted" />
            <input
              id="input-fix-followup"
              type="text"
              value={followUpText}
              disabled={busy}
              onChange={(e) => setFollowUpText(e.target.value)}
              placeholder="Ask for follow-up..."
              className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[13px] text-ink outline-none placeholder:text-ink-muted"
            />
            <Button
              id="btn-send-followup"
              type="submit"
              size="icon-sm"
              disabled={busy || !followUpText.trim()}
              aria-label="Send follow-up"
            >
              <ArrowUpIcon size={14} />
            </Button>
          </form>
        </div>
      </DrawerContent>
    </DialogRoot>
  );
}
