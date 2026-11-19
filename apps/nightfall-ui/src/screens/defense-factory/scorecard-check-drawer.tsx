import React from 'react';
import { Code } from '@astryxdesign/core/Code';
import { HStack } from '@astryxdesign/core/HStack';
import type {
  FindingRecord,
  ScorecardCheckResult,
  ScorecardCheckRisk,
  Severity,
} from '@nightfall/core-contracts';
import {
  Button,
  CloseIcon,
  DialogClose,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DrawerContent,
  ScorecardScorePill,
  SeverityBadge,
  UnifiedDiffViewer,
} from '@nightfall/ui-kit';

export type ScorecardCheckDrawerProps = {
  check: ScorecardCheckResult | null;
  repository: string;
  linkedFinding?: FindingRecord;
  onClose: () => void;
  onFixWithNightfall?: (finding: FindingRecord) => void;
};

export function mapScorecardRiskToSeverity(risk: ScorecardCheckRisk): Severity {
  if (risk === 'Critical') return 'critical';
  if (risk === 'High') return 'high';
  if (risk === 'Medium') return 'medium';
  return 'low';
}

export function ScorecardCheckDrawer({
  check,
  repository,
  linkedFinding,
  onClose,
  onFixWithNightfall,
}: ScorecardCheckDrawerProps): React.ReactElement | null {
  if (!check) return null;

  const patchFindings = check.findings.filter((f) => Boolean(f.remediation?.patch));

  return (
    <DialogRoot
      open={Boolean(check)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DrawerContent
        floating
        className="w-[min(580px,calc(100vw-24px))]"
        aria-label={`Scorecard check ${check.name}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline bg-canvas px-5 py-4">
          <div className="space-y-1">
            <HStack gap={2} align="center" wrap="wrap">
              <DialogTitle>{check.name}</DialogTitle>
              <ScorecardScorePill score={check.score} />
              <SeverityBadge severity={mapScorecardRiskToSeverity(check.risk)} />
            </HStack>
            <DialogDescription>
              <span className="font-mono">{repository}</span> ·{' '}
              <span className="font-mono">{check.status}</span> · {check.short || check.reason}
            </DialogDescription>
          </div>
          <DialogClose id="btn-close-scorecard-check-drawer" aria-label="Close check inspector">
            <CloseIcon size={16} />
          </DialogClose>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto bg-canvas px-5 py-4 tabular-nums">
          <section className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase text-ink-muted">
              EVALUATION REASON
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-ink text-pretty">{check.reason}</p>
            {check.description ? (
              <p className="m-0 text-xs leading-relaxed text-ink-secondary text-pretty">
                {check.description}
              </p>
            ) : null}
          </section>

          {check.findings.length > 0 ? (
            <section className="space-y-2">
              <div className="text-[11px] font-semibold uppercase text-ink-muted">
                PROBE EVIDENCE ({check.findings.length})
              </div>
              <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
                {check.findings.map((probe, idx) => (
                  <div
                    key={`${probe.probe}-${idx}`}
                    className="p-3 text-xs"
                  >
                    <HStack justify="between" align="center" wrap="wrap" gap={2}>
                      <Code size="inherit">{probe.probe}</Code>
                      <span className="font-mono text-[11px] text-ink-muted">{probe.outcome}</span>
                    </HStack>
                    <p className="mt-1.5 mb-0 text-ink text-pretty">{probe.message}</p>
                    {probe.location?.path ? (
                      <div className="mt-1.5 font-mono text-[11px] text-ink-muted">
                        {probe.location.path}
                        {probe.location.lineStart ? `:${probe.location.lineStart}` : ''}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {patchFindings.map((pf, idx) => (
            <section key={`patch-${idx}`} className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase text-ink-muted">
                SUGGESTED REMEDIATION DIFF
              </div>
              <UnifiedDiffViewer
                filePath={pf.location?.path ?? repository}
                unifiedDiff={pf.remediation!.patch!}
              />
            </section>
          ))}

          {check.remediationSteps.length > 0 ? (
            <section className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase text-ink-muted">
                REMEDIATION STEPS
              </div>
              <ol className="m-0 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-secondary">
                {check.remediationSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline bg-canvas px-5 py-3.5">
          {check.documentationUrl ? (
            <span className="truncate font-mono text-[11px] text-ink-muted">
              {check.documentationUrl}
            </span>
          ) : (
            <span />
          )}
          <HStack gap={2} align="center">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {linkedFinding && onFixWithNightfall ? (
              <Button
                id="btn-drawer-scorecard-fix"
                onClick={() => {
                  onClose();
                  onFixWithNightfall(linkedFinding);
                }}
              >
                {linkedFinding.fixId ? 'Continue fix' : 'Fix with Nightfall'}
              </Button>
            ) : null}
          </HStack>
        </div>
      </DrawerContent>
    </DialogRoot>
  );
}
