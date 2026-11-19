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
  id?: string;
  compact?: boolean;
  repository: string;
  aggregateScore: number | null | undefined;
  riskSummary: ScorecardRiskSummary;
  observedRevision?: string;
  evaluatedAt?: string;
  scorecardVersion?: string;
  className?: string;
};

export function ScorecardPostureMeter({
  id = 'scorecard-posture-meter',
  compact = false,
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
      ? 'bg-pill'
      : safeScore >= 8
        ? 'bg-[#15803D]'
        : safeScore >= 5
          ? 'bg-[#ECC147]'
          : 'bg-[#EF1E28]';

  const displayScore = safeScore === null ? '—' : safeScore.toFixed(1);

  return (
    <div
      id={id}
      className={cn(
        'rounded-2xl border border-hairline bg-canvas tabular-nums',
        compact ? 'p-3.5' : 'p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
            <ScorecardPostureIcon size={14} className="text-status-mint-ink" />
            <span>Supply-Chain &amp; CI Workflow Posture</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn('font-semibold leading-none text-ink', compact ? 'text-[24px]' : 'text-[30px]')}>
              {displayScore}
            </span>
            <span className="text-xs font-medium text-ink-muted">/ 10.0</span>
            <span className="font-mono text-xs text-ink-secondary">· {repository}</span>
          </div>
        </div>

        {!compact ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            {observedRevision ? (
              <span className="font-mono text-ink-secondary">{observedRevision.slice(0, 12)}</span>
            ) : null}
            {scorecardVersion ? (
              <span className="font-mono">nightfall-scorecard {scorecardVersion}</span>
            ) : null}
            {evaluatedAt ? (
              <span>· {evaluatedAt.slice(0, 19).replace('T', ' ')}Z</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={cn('grid grid-cols-10 gap-1.5', compact ? 'mt-3' : 'mt-4')}
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
              compact ? 'h-2.5 rounded-[3px]' : 'h-3 rounded-[4px]',
              idx < filledSegments ? activeSegmentClass : 'bg-pill',
            )}
          />
        ))}
      </div>

      {compact ? (
        <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2.5 text-xs text-ink-secondary">
          <span>
            Critical failing:{' '}
            <strong className={riskSummary.criticalFailing > 0 ? 'font-semibold text-status-danger-ink' : 'font-semibold text-ink'}>
              {riskSummary.criticalFailing}
            </strong>
          </span>
          <span>
            Passing: <strong className="font-semibold text-ink">{riskSummary.passingChecks}</strong>
          </span>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-hairline pt-3 text-xs text-ink-secondary">
          <span>
            Critical failing:{' '}
            <strong className={riskSummary.criticalFailing > 0 ? 'font-semibold text-status-danger-ink' : 'font-semibold text-ink'}>
              {riskSummary.criticalFailing}
            </strong>
          </span>
          <span>
            High failing:{' '}
            <strong className={riskSummary.highFailing > 0 ? 'font-semibold text-status-amber-ink' : 'font-semibold text-ink'}>
              {riskSummary.highFailing}
            </strong>
          </span>
          <span>
            Medium failing: <strong className="font-semibold text-ink">{riskSummary.mediumFailing}</strong>
          </span>
          <span>
            Passing: <strong className="font-semibold text-ink">{riskSummary.passingChecks}</strong>
          </span>
          <span>
            Inconclusive: <strong className="font-semibold text-ink">{riskSummary.inconclusiveChecks}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
