import React from 'react';
import type { PrimarySection } from '../../hooks/use-nightfall-router.js';

export type LandingLaunchTarget = Extract<
  PrimarySection,
  'findings' | 'fixes' | 'red-team' | 'scorecard' | 'overview'
>;

type LandingPillarCardSpec = {
  id: 'defense' | 'red-team' | 'scorecard';
  target: LandingLaunchTarget;
  imageSrc: string;
  imageAlt: string;
  title: string;
  body: string;
};

const PILLAR_CARDS: ReadonlyArray<LandingPillarCardSpec> = [
  {
    id: 'defense',
    target: 'fixes',
    imageSrc: './pillar-defense.webp',
    imageAlt:
      'Glass sandbox enclosing an exploit lightning fracture flowing through a cyan Git branch merge into verified emerald patch bars',
    title: 'Prove exploits before patching.',
    body: 'Reproduces real attack paths in LiteBox and stages tested branches.',
  },
  {
    id: 'red-team',
    target: 'red-team',
    imageSrc: './pillar-red-team.webp',
    imageAlt:
      'Shield gate confining cyan network routes to staging nodes inside a scope ring while padlocks block off-scope branches',
    title: 'Probe staging without scope creep.',
    body: 'Signed manifests confine HTTP and WebSocket tests to approved routes.',
  },
  {
    id: 'scorecard',
    target: 'scorecard',
    imageSrc: './pillar-scorecard.webp',
    imageAlt:
      'CI pipeline rail where a cyan scanner gate quarantines an unlocked key-bearing package before the Git merge node',
    title: 'Block risky CI workflows pre-merge.',
    body: 'Continuous Scorecard checks catch unpinned actions and broad tokens.',
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
            <img
              src={card.imageSrc}
              alt={card.imageAlt}
              width={1280}
              height={715}
              decoding="async"
              className="block aspect-16/10 w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
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
