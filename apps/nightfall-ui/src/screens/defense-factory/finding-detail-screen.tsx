import React from 'react';
import type { FindingRecord, FixProposal } from '@nightfall/core-contracts';
import {
  Button,
  MetadataField,
  MetadataRail,
  NightfallHorizonIcon,
  RedTeamSparkIcon,
  SeverityBadge,
  StatusBadge,
  UnifiedDiffViewer,
} from '@nightfall/ui-kit';

export type FindingDetailScreenProps = {
  finding: FindingRecord;
  linkedFix?: FixProposal;
  onOpenFixDrawer: () => void;
  onMarkDuplicate: (findingId: string) => void;
};

export function FindingDetailScreen({
  finding,
  linkedFix,
  onOpenFixDrawer,
  onMarkDuplicate,
}: FindingDetailScreenProps): React.ReactElement {
  return (
    <div
      id={`view-finding-detail-${finding.id}`}
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]"
    >
      <div className="space-y-5">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-tight text-ink">{finding.title}</h1>
          <p className="mt-1 mb-0 text-[13px] text-primary-600">
            <span className="font-mono">{finding.id}</span> · {finding.repository}
          </p>
        </div>

        <DetailSection kicker="SUMMARY">
          <p className="m-0 text-[13.5px] leading-relaxed text-primary-800">{finding.summary}</p>
        </DetailSection>

        <DetailSection kicker="ROOT CAUSE">
          <p className="m-0 text-[13.5px] leading-relaxed text-primary-800">{finding.rootCause}</p>
        </DetailSection>

        <DetailSection kicker="IMPACT AND ATTACK PATH">
          <p className="m-0 text-[13.5px] leading-relaxed text-primary-800">
            {finding.impactAndAttackPath}
          </p>
          {finding.preconditions.length > 0 ? (
            <div className="mt-3">
              <div className="mb-1.5 text-[13px] font-semibold text-ink">Preconditions</div>
              <ul className="m-0 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-primary-800">
                {finding.preconditions.map((pre, idx) => (
                  <li key={idx}>{pre}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </DetailSection>

        <DetailSection kicker="REMEDIATION">
          <p className="m-0 text-[13.5px] leading-relaxed text-primary-800">
            {finding.remediation}
          </p>
        </DetailSection>

        {linkedFix ? (
          <DetailSection kicker={`PROPOSED PATCH PREVIEW (${linkedFix.snapshotLabel})`}>
            <UnifiedDiffViewer
              filePath={finding.codeReferences[0]?.file ?? linkedFix.repository}
              unifiedDiff={linkedFix.unifiedDiff}
            />
          </DetailSection>
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5 pt-2">
          <Button id="btn-detail-open-fix" onClick={onOpenFixDrawer}>
            {linkedFix ? 'Continue fix' : 'Fix with Nightfall'}
          </Button>
          <Button
            id="btn-detail-mark-dup"
            variant="outline"
            onClick={() => onMarkDuplicate(finding.id)}
          >
            Mark as duplicate
          </Button>
        </div>
      </div>

      <MetadataRail ariaLabel="Finding metadata">
        <MetadataField label="REPORTED SEVERITY">
          <SeverityBadge severity={finding.severity} />
        </MetadataField>
        <MetadataField label="STATUS">
          <StatusBadge status={finding.status} />
        </MetadataField>
        <MetadataField label="FIX VERIFICATION">
          <StatusBadge status={finding.fixVerification} />
        </MetadataField>
        <MetadataField label="REPOSITORY">{finding.repository}</MetadataField>
        <MetadataField label="OBSERVED REVISION">
          <span className="inline-code">{finding.observedRevision}</span>
        </MetadataField>
        <MetadataField label="WEAKNESS">{finding.weaknessCwe}</MetadataField>
        <MetadataField label="OBSERVED BY">
          <span className="inline-flex items-center gap-1.5">
            <NightfallHorizonIcon size={16} />
            {finding.sources.includes('red-team') ? <RedTeamSparkIcon size={14} /> : null}
          </span>
        </MetadataField>
        <MetadataField label="OWNER">
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary-800 text-[10px] font-semibold text-surface">
              {finding.owner.initials}
            </span>
            <span>{finding.owner.name}</span>
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
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-500">
        {kicker}
      </div>
      {children}
    </section>
  );
}
