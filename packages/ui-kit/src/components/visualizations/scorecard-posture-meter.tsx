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
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : safe >= 5
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-rose-200 bg-rose-50 text-rose-800';

  const formatted = Number.isInteger(safe) ? String(safe) : safe.toFixed(1);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap tabular-nums',
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
      ? 'bg-primary-200'
      : safeScore >= 8
        ? 'bg-emerald-600'
        : safeScore >= 5
          ? 'bg-amber-500'
          : 'bg-rose-600';

  const displayScore =
    safeScore === null ? '—' : safeScore.toFixed(1);

  return (
    <div
      id="scorecard-posture-meter"
      className={cn(
        'rounded-xl border border-primary-200 bg-surface p-5 shadow-2xs tabular-nums',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary-500">
            <ScorecardPostureIcon size={14} />
            <span>Supply-Chain &amp; CI Workflow Posture</span>
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-3xl font-semibold tracking-tight text-ink">{displayScore}</span>
            <span className="text-sm font-medium text-primary-500">/ 10.0</span>
            <span className="text-xs text-primary-600">· {repository}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {observedRevision ? (
            <span className="rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 font-mono text-primary-700">
              {observedRevision.slice(0, 12)}
            </span>
          ) : null}
          {scorecardVersion ? (
            <Badge variant="informational">nightfall-scorecard {scorecardVersion}</Badge>
          ) : null}
          {evaluatedAt ? (
            <span className="text-primary-500">{evaluatedAt.slice(0, 19).replace('T', ' ')}Z</span>
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
              'h-2.5 rounded-sm transition-colors',
              idx < filledSegments ? activeSegmentClass : 'bg-primary-100',
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
