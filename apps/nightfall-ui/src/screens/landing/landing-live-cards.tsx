import React from 'react';
import {
  DefensePatchSchematic,
  PreMergeGateSchematic,
  ScopedProbeSchematic,
} from '@nightfall/ui-kit';
import type { PrimarySection } from '../../hooks/use-nightfall-router.js';

export type LandingLaunchTarget = Extract<
  PrimarySection,
  'findings' | 'fixes' | 'red-team' | 'scorecard' | 'overview'
>;

type LandingPillarCardSpec = {
  id: 'defense' | 'red-team' | 'scorecard';
  target: LandingLaunchTarget;
  title: string;
  body: string;
  renderSchematic: () => React.ReactElement;
};

const PILLAR_CARDS: ReadonlyArray<LandingPillarCardSpec> = [
  {
    id: 'defense',
    target: 'fixes',
    title: 'Prove exploits before patching.',
    body: 'Reproduces real attack paths in LiteBox and stages tested branches.',
    renderSchematic: () => <DefensePatchSchematic />,
  },
  {
    id: 'red-team',
    target: 'red-team',
    title: 'Probe staging without scope creep.',
    body: 'Signed manifests confine HTTP and WebSocket tests to approved routes.',
    renderSchematic: () => <ScopedProbeSchematic />,
  },
  {
    id: 'scorecard',
    target: 'scorecard',
    title: 'Block risky CI workflows pre-merge.',
    body: 'Continuous Scorecard checks catch unpinned actions and broad tokens.',
    renderSchematic: () => <PreMergeGateSchematic />,
  },
];

export function LandingLiveHeroGrid({
  onLaunchConsole,
}: {
  onLaunchConsole: (target: LandingLaunchTarget) => void;
}): React.ReactElement {
  return (
    <div className="mt-3 grid w-full grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
      {PILLAR_CARDS.map((card) => (
        <button
          key={card.id}
          id={`hero-pillar-${card.id}`}
          type="button"
          onClick={() => onLaunchConsole(card.target)}
          className="nf-nightfall-card group flex h-full w-full cursor-pointer flex-col rounded-2xl p-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue md:p-4"
        >
          <div className="nf-nightfall-stage w-full overflow-hidden rounded-xl">
            <div className="transition-transform duration-200 ease-out group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
              {card.renderSchematic()}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-1.5 px-1 pt-4 pb-1">
            <h2 className="nf-nightfall-card-title m-0 text-[18px] leading-[1.28] font-semibold text-balance">
              {card.title}
            </h2>
            <p className="nf-nightfall-card-body m-0 text-[15px] leading-[1.5] font-normal text-pretty">
              {card.body}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
