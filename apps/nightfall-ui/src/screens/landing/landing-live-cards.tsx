import React, { useEffect, useState, type CSSProperties } from 'react';
import type { FixProposal, RedTeamCampaignRun, ScorecardReportRecord } from '@nightfall/core-contracts';
import {
  BudgetSignalBars,
  CampaignActivityTimeline,
  cn,
  GitBranchIcon,
  Grid,
  Heading,
  RedTeamSparkIcon,
  ScorecardPostureMeter,
  StatusBadge,
  Text,
  UnifiedDiffViewer,
  VStack,
} from '@nightfall/ui-kit';
import {
  fetchBootstrapState,
  type NightfallBootstrapPayload,
  subscribeLiveEvents,
} from '../../api/nightfall-client.js';
import type { PrimarySection } from '../../hooks/use-nightfall-router.js';
import { applyWorkspaceStreamEvent } from '../../hooks/workspace-selectors.js';

export type LandingLaunchTarget = Extract<
  PrimarySection,
  'findings' | 'fixes' | 'red-team' | 'scorecard' | 'overview'
>;

const resetButtonStyle: CSSProperties = {
  all: 'unset',
  display: 'block',
  width: '100%',
  cursor: 'pointer',
  textAlign: 'left',
};

function sliceRealDiffPreview(unifiedDiff: string, maxLines = 6): string {
  const rawLines = unifiedDiff.split('\n').filter((line) => line.length > 0);
  const hunkIdx = rawLines.findIndex((line) => line.startsWith('@@'));
  const start = hunkIdx >= 0 ? hunkIdx + 1 : 0;
  const contentLines = rawLines
    .slice(start)
    .filter((line) => !line.startsWith('---') && !line.startsWith('+++'));
  const picked = contentLines.slice(0, maxLines);
  return (picked.length > 0 ? picked : rawLines.slice(0, maxLines))
    .map((line) => (line.length > 48 ? `${line.slice(0, 47)}…` : line))
    .join('\n');
}

function useLandingLiveWorkspace(): {
  data: NightfallBootstrapPayload | null;
  offline: boolean;
} {
  const [data, setData] = useState<NightfallBootstrapPayload | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    fetchBootstrapState()
      .then((initial) => {
        if (!active) return;
        setData(initial);
        setOffline(false);
      })
      .catch(() => {
        if (active) setOffline(true);
      });

    const unsub = subscribeLiveEvents((ev) => {
      if (!active) return;
      setData((prev) => (prev ? applyWorkspaceStreamEvent(prev, ev) : prev));
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  return { data, offline };
}

function LiveFixDiffStage({
  fix,
  offline,
}: {
  fix: FixProposal | undefined;
  offline: boolean;
}): React.ReactElement {
  if (!fix) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-xs text-ink-muted">
        {offline ? 'Connect Nightfall API to stream live patch diffs' : 'Loading verified patch diff…'}
      </div>
    );
  }
  const verified = fix.gates.greenPhasePassed;
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline bg-sidebar px-3.5 py-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] text-ink-secondary">
          <GitBranchIcon size={12} />
          <span className="truncate">{fix.branchName ?? fix.repository}</span>
        </span>
        <StatusBadge
          status={verified ? 'verified' : 'proposed'}
          label={verified ? 'Verified' : 'Proposed'}
        />
      </div>
      <UnifiedDiffViewer
        unifiedDiff={sliceRealDiffPreview(fix.unifiedDiff, 6)}
        className="flex-1 rounded-none border-0"
      />
    </div>
  );
}

function LiveCampaignStage({
  campaign,
  offline,
}: {
  campaign: RedTeamCampaignRun | undefined;
  offline: boolean;
}): React.ReactElement {
  if (!campaign) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-xs text-ink-muted">
        {offline ? 'Connect Nightfall API to stream campaign telemetry' : 'Loading live campaign…'}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col justify-between overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline bg-sidebar px-3.5 py-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] text-ink-secondary">
          <RedTeamSparkIcon size={12} />
          <span className="truncate">{campaign.name}</span>
        </span>
        <BudgetSignalBars pct={campaign.budgetRemainingPct} />
      </div>
      <div className="flex flex-1 flex-col justify-center px-3.5 py-3">
        <CampaignActivityTimeline
          series={campaign.activitySeries}
          startLabel="Run start"
          endLabel={campaign.updatedLabel}
        />
      </div>
    </div>
  );
}

function LiveScorecardStage({
  report,
  offline,
}: {
  report: ScorecardReportRecord | undefined;
  offline: boolean;
}): React.ReactElement {
  if (!report) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-xs text-ink-muted">
        {offline ? 'Connect Nightfall API to stream posture checks' : 'Loading posture report…'}
      </div>
    );
  }
  return (
    <ScorecardPostureMeter
      id="hero-live-scorecard-meter"
      compact
      repository={report.repository}
      aggregateScore={report.aggregateScore}
      riskSummary={report.riskSummary}
      className="flex h-full flex-col justify-between rounded-none border-0 p-3.5"
    />
  );
}

export function LandingLiveHeroGrid({
  onLaunchConsole,
}: {
  onLaunchConsole: (target: LandingLaunchTarget) => void;
}): React.ReactElement {
  const { data, offline } = useLandingLiveWorkspace();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const cards = [
    {
      id: 'defense',
      target: 'fixes' as const,
      title: "Stop triaging alerts that can't be exploited.",
      body: 'Fifty duplicate SAST warnings often trace back to one missing check. Nightfall clusters root causes, proves exploitability, and stages a tested Git branch.',
      ctaLabel: 'Review verified patches →',
      stage: <LiveFixDiffStage fix={data?.fixes[0]} offline={offline} />,
    },
    {
      id: 'red-team',
      target: 'red-team' as const,
      title: 'Probe live staging without risking scope creep.',
      body: 'Point-in-time pentests go stale after the next deploy. Ed25519-signed manifests confine HTTP and WebSocket probes to approved routes and rate limits.',
      ctaLabel: 'Inspect live campaign →',
      stage: <LiveCampaignStage campaign={data?.campaigns[0]} offline={offline} />,
    },
    {
      id: 'scorecard',
      target: 'scorecard' as const,
      title: 'Block compromised CI workflows before merge.',
      body: 'Unpinned third-party actions and write-all tokens turn routine PRs into supply-chain incidents. Continuous posture checks catch workflow drift automatically.',
      ctaLabel: 'Audit supply-chain posture →',
      stage: <LiveScorecardStage report={data?.scorecardReports[0]} offline={offline} />,
    },
  ];

  return (
    <div className="mt-2 w-full">
      <Grid columns={{ minWidth: 280, max: 3, repeat: 'fit' }} gap={6}>
        {cards.map((card) => {
          const isHovered = hoveredId === card.id;
          return (
            <button
              key={card.id}
              id={`hero-pillar-${card.id}`}
              type="button"
              style={resetButtonStyle}
              onMouseEnter={() => setHoveredId(card.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(card.id)}
              onBlur={() => setHoveredId(null)}
              onClick={() => onLaunchConsole(card.target)}
            >
              <VStack gap={3}>
                <div
                  className={cn(
                    'pointer-events-none h-[204px] w-full overflow-hidden rounded-xl border bg-canvas transition-all duration-200',
                    isHovered
                      ? '-translate-y-0.5 border-accent-blue'
                      : 'border-hairline',
                  )}
                >
                  {card.stage}
                </div>
                <VStack gap={1}>
                  <Heading level={4}>{card.title}</Heading>
                  <Text type="supporting" color="secondary">
                    {card.body}
                  </Text>
                  <Text
                    type="supporting"
                    color={isHovered ? 'primary' : 'accent'}
                    weight="medium"
                  >
                    {card.ctaLabel}
                  </Text>
                </VStack>
              </VStack>
            </button>
          );
        })}
      </Grid>
    </div>
  );
}
