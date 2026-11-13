import React from 'react';
import type { EvidenceBundle, FindingRecord } from '@nightfall/core-contracts';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  MetadataField,
  MetadataRail,
  SeverityBadge,
  StatusBadge,
  UnifiedDiffViewer,
} from '@nightfall/ui-kit';

export type FindingReportScreenProps = {
  finding: FindingRecord;
  evidence?: EvidenceBundle;
  onBackToCampaign: () => void;
  onPromoteToDefenseFactory: (finding: FindingRecord) => void;
};

export function FindingReportScreen({
  finding,
  evidence,
  onBackToCampaign,
  onPromoteToDefenseFactory,
}: FindingReportScreenProps): React.ReactElement {
  return (
    <div
      id={`view-rt-report-${finding.id}`}
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]"
    >
      <div className="space-y-6">
        <div>
          <Button
            id="btn-back-rt-overview"
            variant="ghost"
            size="sm"
            className="mb-3 -ml-2"
            onClick={onBackToCampaign}
          >
            <ArrowLeftIcon size={15} />
            <span>Overview</span>
          </Button>

          <h1 className="m-0 text-xl font-semibold tracking-tight text-ink">{finding.title}</h1>
          <p className="mt-1 mb-0 text-[13px] text-primary-600">{finding.subtitle}</p>
        </div>

        <section id="sec-summary" className="space-y-2">
          <h2 className="m-0 text-base font-semibold text-ink">Summary</h2>
          <p className="m-0 text-[13.5px] leading-relaxed text-primary-800">{finding.summary}</p>
          <p className="m-0 pt-1">
            <a
              href="#sec-evidence"
              className="text-[13px] font-medium text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900"
            >
              See the private document in the downloaded ZIP ↓
            </a>
          </p>
        </section>

        <section id="sec-architecture" className="space-y-2.5">
          <h2 className="m-0 text-base font-semibold text-ink">Architecture</h2>
          <p className="m-0 text-[13.5px] leading-relaxed text-primary-800">
            {finding.architectureNotes ?? finding.rootCause}
          </p>
          {finding.codeReferences.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {finding.codeReferences.map((ref, idx) => (
                <span key={idx} className="inline-code text-xs">
                  {ref.file}:{ref.startLine}–{ref.endLine}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section id="sec-defects" className="space-y-2">
          <h2 className="m-0 text-base font-semibold text-ink">Defects</h2>
          <p className="m-0 text-[13.5px] leading-relaxed text-primary-800">
            {finding.defectsNotes ?? finding.rootCause}
          </p>
        </section>

        <section id="sec-evidence" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-base font-semibold text-ink">Verification HTTP traces</h2>
            {evidence?.canaryMarker ? (
              <Badge variant="accent">Canary {evidence.canaryMarker}</Badge>
            ) : null}
          </div>
          <p className="m-0 text-[13.5px] leading-relaxed text-primary-800">
            {finding.verificationChainSummary ?? evidence?.summary ?? finding.impactAndAttackPath}
          </p>

          {evidence?.httpTraces && evidence.httpTraces.length > 0 ? (
            <div className="space-y-2.5">
              {evidence.httpTraces.map((trace, idx) => (
                <Card key={idx} className="space-y-1.5 bg-primary-50/70 p-3.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-ink">
                      {trace.method} {trace.url}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Badge variant="informational">{trace.actor}</Badge>
                      <StatusBadge
                        status={trace.statusCode < 400 ? 'verified' : 'not_recorded'}
                        label={`HTTP ${trace.statusCode}`}
                      />
                    </span>
                  </div>
                  <pre className="m-0 overflow-x-auto rounded border border-primary-200 bg-surface p-2 font-mono text-[11.5px] text-primary-800">
                    {trace.responseSnippet}
                  </pre>
                </Card>
              ))}
            </div>
          ) : null}

          {evidence?.artifactJson ? (
            <pre className="m-0 overflow-x-auto rounded-xl border border-primary-200 bg-primary-50 p-3.5 font-mono text-xs text-ink">
              {JSON.stringify(evidence.artifactJson, null, 2)}
            </pre>
          ) : null}
        </section>

        {evidence?.minimalPatchDiff ? (
          <section id="sec-minimal-patch" className="space-y-2.5">
            <h2 className="m-0 text-base font-semibold text-ink">Minimal patch</h2>
            <p className="m-0 text-[13.5px] leading-relaxed text-primary-800">
              {evidence.minimalPatchDiff.explanation}
            </p>
            <UnifiedDiffViewer
              filePath={evidence.minimalPatchDiff.filePath}
              unifiedDiff={evidence.minimalPatchDiff.unifiedDiff}
            />
          </section>
        ) : null}

        <div className="pt-2">
          <Button
            id="btn-promote-defense-factory"
            onClick={() => onPromoteToDefenseFactory(finding)}
          >
            Promote to Defense Factory
          </Button>
        </div>
      </div>

      <MetadataRail ariaLabel="Confirmed finding report metadata">
        <MetadataField label="SEVERITY">
          <SeverityBadge severity={finding.severity} />
        </MetadataField>
        <MetadataField label="STATUS">
          <StatusBadge status="confirmed" label="Confirmed" />
        </MetadataField>
        {finding.affectedEndpoint ? (
          <MetadataField label="AFFECTED ENDPOINT">
            <span className="font-mono text-xs break-all">{finding.affectedEndpoint}</span>
          </MetadataField>
        ) : null}

        <nav
          aria-label="Report sections"
          className="flex flex-col gap-2 border-t border-primary-200 pt-3.5 text-[13px] text-primary-600"
        >
          <a href="#sec-summary" className="no-underline hover:text-ink">
            Summary
          </a>
          <a href="#sec-architecture" className="no-underline hover:text-ink">
            Architecture
          </a>
          <a href="#sec-defects" className="no-underline hover:text-ink">
            Defects
          </a>
          <a href="#sec-evidence" className="no-underline hover:text-ink">
            Verification HTTP traces
          </a>
          <a href="#sec-minimal-patch" className="no-underline hover:text-ink">
            Minimal patch
          </a>
        </nav>
      </MetadataRail>
    </div>
  );
}
