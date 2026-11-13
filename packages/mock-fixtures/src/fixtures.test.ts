import { describe, expect, it } from 'vitest';
import {
  INITIAL_EVIDENCE_BUNDLES,
  INITIAL_FINDINGS,
  INITIAL_FIXES,
  INITIAL_OVERVIEW,
  INITIAL_RED_TEAM_CAMPAIGN,
  INITIAL_REPOSITORIES,
} from './index.js';

describe('@nightfall/mock-fixtures brand & math invariants', () => {
  it('contains zero legacy Daybreak or Codex brand strings across all fixtures', () => {
    const serialized = JSON.stringify({
      INITIAL_OVERVIEW,
      INITIAL_FINDINGS,
      INITIAL_FIXES,
      INITIAL_REPOSITORIES,
      INITIAL_RED_TEAM_CAMPAIGN,
      INITIAL_EVIDENCE_BUNDLES,
    });
    expect(serialized.toLowerCase()).not.toContain('daybreak');
    expect(serialized.toLowerCase()).not.toContain('codex');
  });

  it('maintains exact Sankey conservation across 550 open findings and 29/36 repo coverage', () => {
    const sevSum = Object.values(INITIAL_OVERVIEW.severityCounts).reduce((a, b) => a + b, 0);
    expect(sevSum).toBe(550);

    const openStatusSum =
      INITIAL_OVERVIEW.statusCounts.new +
      INITIAL_OVERVIEW.statusCounts.triaged +
      INITIAL_OVERVIEW.statusCounts.in_progress;
    expect(openStatusSum).toBe(550);

    expect(INITIAL_REPOSITORIES).toHaveLength(36);
    expect(INITIAL_REPOSITORIES.filter((r) => r.prReviewsEnabled)).toHaveLength(29);
    expect(INITIAL_REPOSITORIES.filter((r) => r.scheduledScanLabel !== null)).toHaveLength(29);
    expect(INITIAL_REPOSITORIES.filter((r) => r.needsAttention)).toHaveLength(6);
  });
});
