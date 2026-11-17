import React, { useState } from 'react';
import { Code } from '@astryxdesign/core/Code';
import { HStack } from '@astryxdesign/core/HStack';
import { Token } from '@astryxdesign/core/Token';
import type { FindingRecord, FixProposal } from '@nightfall/core-contracts';
import {
  Button,
  Input,
  LifecycleStepper,
  MetadataField,
  MetadataRail,
  SeverityBadge,
  StatusBadge,
  UnifiedDiffViewer,
} from '@nightfall/ui-kit';

export type FindingDetailScreenProps = {
  finding: FindingRecord;
  linkedFix?: FixProposal;
  onOpenFixDrawer: () => void;
  onMarkDuplicate: (findingId: string, duplicateOfId?: string) => void;
};

const LIFECYCLE_STAGES = [
  'Discovered',
  'Verified',
  'Patch Synthesized',
  'Gates Passed',
  'Closed',
];

function computeLifecycleIndex(finding: FindingRecord, linkedFix?: FixProposal): number {
  const fixStatus = linkedFix?.status as string | undefined;
  if (
    finding.status === 'fixed' ||
    finding.fixVerification === 'verified' ||
    fixStatus === 'merged' ||
    fixStatus === 'merged_verified'
  ) {
    return 4;
  }
  if (linkedFix) {
    const g = linkedFix.gates;
    const allGatesPassed =
      g.baselineBuildPassed &&
      g.redPhaseFailedAsExpected &&
      g.greenPhasePassed &&
      g.regressionSuitePassed &&
      g.staticHygienePassed &&
      g.criticApproved;
    return allGatesPassed ? 3 : 2;
  }
  if (
    finding.status === 'triaged' ||
    finding.status === 'in_progress' ||
    Boolean(finding.evidenceBundleId) ||
    Boolean(finding.verificationChainSummary)
  ) {
    return 1;
  }
  return 0;
}

function resolveFindingLocation(finding: FindingRecord): string {
  const ref = finding.codeReferences[0];
  if (ref) return `${ref.file}:${ref.startLine}`;
  return finding.affectedEndpoint ?? finding.subtitle;
}

function formatSourceLabel(raw: string): string {
  if (raw === 'red-team' || raw === 'nightfall_red_team') return 'Nightfall Red Team';
  if (raw === 'scorecard' || raw === 'nightfall_scorecard') return 'Nightfall Scorecard';
  if (raw === 'sast') return 'Nightfall SAST';
  if (raw === 'nightfall' || raw === 'nightfall_defense_factory') return 'Defense Factory';
  return raw;
}

export function FindingDetailScreen({
  finding,
  linkedFix,
  onOpenFixDrawer,
  onMarkDuplicate,
}: FindingDetailScreenProps): React.ReactElement {
  const [duplicateOfId, setDuplicateOfId] = useState(finding.duplicateOfId ?? '');
  const lifecycleIndex = computeLifecycleIndex(finding, linkedFix);
  const location = resolveFindingLocation(finding);
  const minimalDiff =
    linkedFix?.unifiedDiff ??
    (finding as FindingRecord & { minimalPatchDiff?: string }).minimalPatchDiff;

  return (
    <div
      id={`view-finding-detail-${finding.id}`}
      className="grid min-h-full grid-cols-1 divide-y divide-hairline bg-canvas lg:grid-cols-[minmax(0,1fr)_280px] lg:divide-x lg:divide-y-0"
    >
      <div className="space-y-6 p-6">
        <div className="space-y-3">
          <div>
            <h1 className="m-0 text-[22px] font-semibold tracking-tight text-ink">
              {finding.title}
            </h1>
            <p className="mt-1 mb-0 text-[13px] text-ink-secondary">
              <Code size="inherit">{finding.id}</Code> ·{' '}
              <span className="font-mono">{finding.repository}</span>
            </p>
          </div>

          <LifecycleStepper stages={LIFECYCLE_STAGES} activeIndex={lifecycleIndex} />
        </div>

        <DetailSection kicker="SUMMARY">
          <p className="m-0 text-[13.5px] leading-relaxed text-ink">{finding.summary}</p>
        </DetailSection>

        <DetailSection kicker="ROOT CAUSE">
          <p className="m-0 text-[13.5px] leading-relaxed text-ink">{finding.rootCause}</p>
        </DetailSection>

        <DetailSection kicker="PROOF & IMPACT">
          <p className="m-0 text-[13.5px] leading-relaxed text-ink">
            {finding.impactAndAttackPath}
          </p>
          {finding.verificationChainSummary ? (
            <p className="mt-2 mb-0 rounded-xl border border-hairline bg-sidebar px-3.5 py-2.5 text-xs text-ink-secondary">
              {finding.verificationChainSummary}
            </p>
          ) : null}
          {finding.preconditions.length > 0 ? (
            <div className="mt-3">
              <div className="mb-1.5 text-[13px] font-semibold text-ink">Preconditions</div>
              <ul className="m-0 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-secondary">
                {finding.preconditions.map((pre, idx) => (
                  <li key={idx}>{pre}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-3">
            <div className="mb-1 text-[13px] font-semibold text-ink">Remediation guidance</div>
            <p className="m-0 text-[13px] leading-relaxed text-ink-secondary">
              {finding.remediation}
            </p>
          </div>
        </DetailSection>

        {minimalDiff ? (
          <DetailSection kicker="PROPOSED MINIMAL PATCH">
            <UnifiedDiffViewer
              filePath={finding.codeReferences[0]?.file ?? finding.repository}
              unifiedDiff={minimalDiff}
            />
          </DetailSection>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
          <Button id="btn-detail-open-fix" onClick={onOpenFixDrawer}>
            {linkedFix ? 'Continue fix' : 'Fix with Nightfall'}
          </Button>

          <HStack gap={2} align="center" wrap="wrap">
            <Input
              id="input-duplicate-of-id"
              type="text"
              value={duplicateOfId}
              onChange={(e) => setDuplicateOfId(e.target.value)}
              placeholder="Canonical ID (optional)"
              aria-label="Duplicate of finding ID"
              className="h-8 w-44 border-hairline-strong bg-canvas text-xs"
            />
            <Button
              id="btn-detail-mark-dup"
              variant="outline"
              size="sm"
              onClick={() => onMarkDuplicate(finding.id, duplicateOfId.trim() || undefined)}
            >
              Mark as duplicate
            </Button>
          </HStack>
        </div>
      </div>

      <MetadataRail ariaLabel="Finding metadata" className="p-6">
        <MetadataField label="REPORTED SEVERITY">
          <SeverityBadge severity={finding.severity} />
        </MetadataField>
        <MetadataField label="STATUS">
          <StatusBadge status={finding.status} />
        </MetadataField>
        <MetadataField label="FIX VERIFICATION">
          <StatusBadge status={finding.fixVerification} />
        </MetadataField>
        <MetadataField label="REPOSITORY">
          <span className="font-mono text-[13px] text-ink">{finding.repository}</span>
        </MetadataField>
        <MetadataField label="LOCATION">
          <span className="font-mono text-[12.5px] break-all text-ink-secondary">{location}</span>
        </MetadataField>
        <MetadataField label="OBSERVED REVISION">
          <span className="font-mono text-[12.5px] text-ink-secondary">
            {finding.observedRevision}
          </span>
        </MetadataField>
        <MetadataField label="WEAKNESS">
          <span className="text-[13px] text-ink-secondary">{finding.weaknessCwe}</span>
        </MetadataField>
        <MetadataField label="SOURCES">
          <HStack gap={1.5} wrap="wrap">
            {finding.sources.map((src) => (
              <Token
                key={src}
                label={formatSourceLabel(src)}
                size="sm"
                color={src === 'red-team' ? 'blue' : src === 'scorecard' ? 'green' : 'gray'}
              />
            ))}
          </HStack>
        </MetadataField>
        <MetadataField label="OWNER">
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-sky-100 text-[10.5px] font-semibold text-sky-800">
              {finding.owner.initials}
            </span>
            <span className="text-[13px] text-ink">{finding.owner.name}</span>
          </span>
        </MetadataField>
      </MetadataRail>
    </div>
  );
}

function DetailSection({
  kicker,
  children,
}: {
  kicker: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {kicker}
      </div>
      {children}
    </section>
  );
}
