import React from 'react';
import type { ScorecardRiskSummary } from '@nightfall/core-contracts';
import { cn } from '../../lib/utils.js';
import { ScorecardPostureIcon } from '../icons/nightfall-icons.js';
import { Badge } from '../ui/badge.js';

export type ScorecardScorePillProps = {
  score: number | null | undefined;
  maxScore?: number;
  size?: 'sm' | 'md';
  className?: string;
};

function normalizeScore(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw) || raw < 0) {
    return null;
  }
  return Math.max(0, Math.min(10, Math.round(raw * 10) / 10));
}

export function ScorecardScorePill({
  score,
  maxScore = 10,
  size = 'sm',
  className,
}: ScorecardScorePillProps): React.ReactElement {
  const safe = normalizeScore(score);
  if (safe === null) {
    return (
      <Badge variant="not_recorded" className={className}>
        Inconclusive
      </Badge>
    );
  }

  const toneClass =
    safe >= 8
      ? 'bg-[var(--nf-posture-pass-bg)] text-[var(--nf-posture-pass-fg)]'
      : safe >= 5
        ? 'bg-[var(--nf-posture-warn-bg)] text-[var(--nf-posture-warn-fg)]'
        : 'bg-[var(--nf-posture-fail-bg)] text-[var(--nf-posture-fail-fg)]';

  const formatted = Number.isInteger(safe) ? String(safe) : safe.toFixed(1);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[6px] border-0 font-semibold whitespace-nowrap tabular-nums',
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-xs leading-4',
        toneClass,
        className,
      )}
    >
      <span>{formatted}</span>
      <span className="opacity-65">/ {maxScore}</span>
    </span>
  );
}

export type ScorecardPostureMeterProps = {
  repository: string;
  aggregateScore: number | null | undefined;
  riskSummary: ScorecardRiskSummary;
  observedRevision?: string;
  evaluatedAt?: string;
  scorecardVersion?: string;
  className?: string;
};

export function ScorecardPostureMeter({
  repository,
  aggregateScore,
  riskSummary,
  observedRevision,
  evaluatedAt,
  scorecardVersion,
  className,
}: ScorecardPostureMeterProps): React.ReactElement {
  const safeScore = normalizeScore(aggregateScore);
  const filledSegments = safeScore === null ? 0 : Math.round(safeScore);
  const activeSegmentClass =
    safeScore === null
      ? 'bg-[#DEDFD9]'
      : safeScore >= 8
        ? 'bg-[#15803D]'
        : safeScore >= 5
          ? 'bg-[#ECC147]'
          : 'bg-[#EF1E28]';

  const displayScore = safeScore === null ? '—' : safeScore.toFixed(1);

  return (
    <div
      id="scorecard-posture-meter"
      className={cn(
        'rounded-2xl border border-[#E6E7E5] bg-white p-5 tabular-nums',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6E706D]">
            <ScorecardPostureIcon size={14} className="text-[#15803D]" />
            <span>Supply-Chain &amp; CI Workflow Posture</span>
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#141514]">
              {displayScore}
            </span>
            <span className="text-sm font-medium text-[#7A7C78]">/ 10.0</span>
            <span className="text-xs text-[#5E605D]">· {repository}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {observedRevision ? (
            <span className="font-mono text-[#5E605D]">{observedRevision.slice(0, 12)}</span>
          ) : null}
          {scorecardVersion ? (
            <Badge variant="informational">nightfall-scorecard {scorecardVersion}</Badge>
          ) : null}
          {evaluatedAt ? (
            <span className="text-[#7A7C78]">{evaluatedAt.slice(0, 19).replace('T', ' ')}Z</span>
          ) : null}
        </div>
      </div>

      <div
        className="mt-4 grid grid-cols-10 gap-1.5"
        role="meter"
        aria-label={`Aggregate Scorecard posture for ${repository}`}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={safeScore ?? 0}
      >
        {Array.from({ length: 10 }, (_, idx) => (
          <div
            key={idx}
            className={cn(
              'h-3 rounded-[4px] transition-colors',
              idx < filledSegments ? activeSegmentClass : 'bg-[#F0F1EE]',
            )}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant={riskSummary.criticalFailing > 0 ? 'critical' : 'informational'}>
          Critical failing: {riskSummary.criticalFailing}
        </Badge>
        <Badge variant={riskSummary.highFailing > 0 ? 'high' : 'informational'}>
          High failing: {riskSummary.highFailing}
        </Badge>
        <Badge variant={riskSummary.mediumFailing > 0 ? 'medium' : 'informational'}>
          Medium failing: {riskSummary.mediumFailing}
        </Badge>
        <Badge variant="verified">Passing: {riskSummary.passingChecks}</Badge>
        <Badge variant="not_recorded">Inconclusive: {riskSummary.inconclusiveChecks}</Badge>
      </div>
    </div>
  );
}
