import React, { useState } from 'react';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { Token } from '@astryxdesign/core/Token';
import type { EvidenceBundle, FindingRecord } from '@nightfall/core-contracts';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  MetadataField,
  MetadataRail,
  SeverityBadge,
  StatusBadge,
  UnifiedDiffViewer,
  cn,
} from '@nightfall/ui-kit';

export type FindingReportScreenProps = {
  finding: FindingRecord;
  evidence?: EvidenceBundle;
  campaignName?: string;
  onBackToCampaign: () => void;
  onPromoteToDefenseFactory: (finding: FindingRecord) => void;
};

type ReportSectionId =
  | 'sec-summary'
  | 'sec-architecture'
  | 'sec-defects'
  | 'sec-exploit-chain'
  | 'sec-minimal-patch';

const TOC_ITEMS: Array<{ id: ReportSectionId; label: string }> = [
  { id: 'sec-summary', label: 'Summary' },
  { id: 'sec-architecture', label: 'Architecture' },
  { id: 'sec-defects', label: 'Defects' },
  { id: 'sec-exploit-chain', label: 'Exploit chain' },
  { id: 'sec-minimal-patch', label: 'Minimal patch' },
];

function buildSanitizedEvidencePayload(
  finding: FindingRecord,
  evidence?: EvidenceBundle,
): Record<string, unknown> {
  const sanitizedTraces = (evidence?.httpTraces ?? []).map((trace) => {
    const cleanHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(trace.requestHeaders ?? {})) {
      const lower = key.toLowerCase();
      cleanHeaders[key] =
        lower.includes('authorization') || lower.includes('cookie') || lower.includes('token')
          ? '[REDACTED]'
          : val;
    }
    return {
      method: trace.method,
      url: trace.url,
      actor: trace.actor,
      requestHeaders: cleanHeaders,
      statusCode: trace.statusCode,
      responseSnippet: trace.responseSnippet,
    };
  });

  return {
    schemaVersion: 'nightfall-evidence-v1',
    findingId: finding.id,
    title: finding.title,
    severity: finding.severity,
    weaknessCwe: finding.weaknessCwe,
    repository: finding.repository,
    observedRevision: finding.observedRevision,
    affectedEndpoint: finding.affectedEndpoint ?? null,
    verifiedAt: evidence?.verifiedAt ?? finding.updatedAt,
    reproducible: evidence?.reproducible ?? true,
    canaryMarker: evidence?.canaryMarker ?? null,
    controlAssertion: evidence?.controlAssertion ?? null,
    probeAssertion: evidence?.probeAssertion ?? null,
    httpTraces: sanitizedTraces,
    artifactJson: evidence?.artifactJson ?? null,
    minimalPatchDiff: evidence?.minimalPatchDiff ?? null,
  };
}

export function FindingReportScreen({
  finding,
  evidence,
  campaignName,
  onBackToCampaign,
  onPromoteToDefenseFactory,
}: FindingReportScreenProps): React.ReactElement {
  const [activeSection, setActiveSection] = useState<ReportSectionId>('sec-summary');

  function handleDownloadEvidenceBundle(): void {
    if (typeof URL.createObjectURL !== 'function') return;
    const payload = buildSanitizedEvidencePayload(finding, evidence);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${finding.id.toLowerCase()}-evidence-bundle.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      id={`view-rt-report-${finding.id}`}
      className="mx-auto grid max-w-5xl grid-cols-1 gap-10 bg-canvas lg:grid-cols-[minmax(0,1fr)_220px]"
    >
      <div className="min-w-0 space-y-8">
        <div>
          <button
            id="btn-back-rt-overview"
            type="button"
            onClick={onBackToCampaign}
            className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink cursor-pointer"
          >
            <ArrowLeftIcon size={14} />
            <span>Overview</span>
          </button>

          <h1 className="m-0 text-[26px] leading-[1.22] font-semibold tracking-[-0.02em] text-ink">
            {finding.title}
          </h1>
          <p className="mt-2 mb-0 text-[13.5px] text-ink-muted">
            {finding.id}
            {campaignName ? ` · ${campaignName}` : ''} · {finding.subtitle}
          </p>
        </div>

        <section id="sec-summary" className="space-y-3 scroll-mt-6">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-ink">Summary</h2>
          <p className="m-0 text-[14px] leading-[1.65] text-ink">{finding.summary}</p>
          <div>
            <button
              id="btn-download-evidence-bundle"
              type="button"
              onClick={handleDownloadEvidenceBundle}
              className="text-left text-[13.5px] font-medium text-accent-blue underline underline-offset-4 transition-opacity hover:opacity-80 cursor-pointer"
            >
              See the private document in the downloaded ZIP ↓
            </button>
          </div>
        </section>

        <section id="sec-architecture" className="space-y-3 scroll-mt-6">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-ink">
            Architecture &amp; scope
          </h2>
          <p className="m-0 text-[14px] leading-[1.65] text-ink">
            {finding.architectureNotes ?? finding.rootCause}
          </p>
          {finding.codeReferences.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {finding.codeReferences.map((ref, idx) => (
                <a
                  key={idx}
                  href="#sec-minimal-patch"
                  onClick={() => setActiveSection('sec-minimal-patch')}
                  className="font-mono text-[13px] text-accent-blue underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                  {ref.file}:{ref.startLine}–{ref.endLine}
                </a>
              ))}
            </div>
          ) : null}
        </section>

        <section id="sec-defects" className="space-y-2.5 scroll-mt-6">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-ink">Defects</h2>
          <p className="m-0 text-[14px] leading-[1.65] text-ink">
            {finding.defectsNotes ?? finding.rootCause}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-secondary">
            <span>{finding.weaknessCwe}</span>
            {evidence?.codePath.map((cp, idx) => (
              <span key={idx} className="font-mono text-ink underline underline-offset-4">
                {cp.file}:{cp.startLine}–{cp.endLine}
              </span>
            ))}
          </div>
        </section>

        <section id="sec-exploit-chain" className="space-y-3.5 scroll-mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-ink">
              Exploit chain
            </h2>
            {evidence?.canaryMarker ? (
              <Token size="sm" color="blue" label={`Canary ${evidence.canaryMarker}`} />
            ) : null}
          </div>

          <p className="m-0 text-[14px] leading-[1.65] text-ink">
            {finding.verificationChainSummary ?? evidence?.summary ?? finding.impactAndAttackPath}
          </p>

          {evidence?.httpTraces && evidence.httpTraces.length > 0 ? (
            <div className="space-y-2.5">
              {evidence.httpTraces.map((trace, idx) => (
                <div
                  key={idx}
                  className="space-y-2 rounded-xl border border-hairline bg-sidebar p-3.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-ink">
                      {trace.method} {trace.url}
                    </span>
                    <HStack gap={2} align="center">
                      <Badge variant="informational">{trace.actor}</Badge>
                      <StatusBadge
                        status={trace.statusCode < 400 ? 'verified' : 'not_recorded'}
                        label={`HTTP ${trace.statusCode}`}
                      />
                    </HStack>
                  </div>
                  <pre className="m-0 overflow-x-auto rounded-lg border border-hairline bg-canvas p-2.5 font-mono text-[12px] leading-relaxed text-ink">
                    {trace.responseSnippet}
                  </pre>
                </div>
              ))}
            </div>
          ) : null}

          {evidence?.artifactJson ? (
            <pre className="m-0 overflow-x-auto rounded-xl border border-hairline bg-sidebar p-4 font-mono text-[12px] leading-[1.6] text-ink">
              {JSON.stringify(evidence.artifactJson, null, 2)}
            </pre>
          ) : null}
        </section>

        <section id="sec-minimal-patch" className="space-y-3 scroll-mt-6">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-ink">
            Minimal patch
          </h2>
          <p className="m-0 text-[14px] leading-[1.65] text-ink">
            {evidence?.minimalPatchDiff?.explanation ?? finding.remediation}
          </p>
          {evidence?.minimalPatchDiff ? (
            <UnifiedDiffViewer
              filePath={evidence.minimalPatchDiff.filePath}
              unifiedDiff={evidence.minimalPatchDiff.unifiedDiff}
            />
          ) : null}
        </section>

        <Divider />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-[12.5px] text-ink-muted">
            Verified reproducible inside Microsoft LiteBox disposable sandbox
          </span>
          <Button
            id="btn-promote-defense-factory"
            onClick={() => onPromoteToDefenseFactory(finding)}
          >
            Promote to Defense Factory
          </Button>
        </div>
      </div>

      <MetadataRail ariaLabel="Confirmed finding report metadata" className="sticky top-6 space-y-5">
        <MetadataField label="SEVERITY">
          <SeverityBadge severity={finding.severity} />
        </MetadataField>

        <MetadataField label="STATUS">
          <span className="text-[13.5px] font-medium text-ink">Confirmed</span>
        </MetadataField>

        {finding.affectedEndpoint ? (
          <MetadataField label="AFFECTED ENDPOINT">
            <span className="font-mono text-[12.5px] leading-relaxed break-all text-ink">
              {finding.affectedEndpoint}
            </span>
          </MetadataField>
        ) : null}

        <div className="space-y-2 pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
            ON THIS PAGE
          </div>
          <nav aria-label="Report sections" className="flex flex-col text-[13px]">
            {TOC_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'border-l-2 py-1 pl-3 no-underline transition-colors',
                    isActive
                      ? 'border-ink font-medium text-ink'
                      : 'border-hairline text-ink-muted hover:text-ink',
                  )}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>
      </MetadataRail>
    </div>
  );
}
