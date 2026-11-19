import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  AppShell,
  ArrowRightIcon,
  AstryxButton,
  DefenseFactoryPillarArt,
  DownloadIcon,
  Grid,
  Heading,
  HStack,
  NightfallHorizonIcon,
  nightfallTheme,
  RedTeamPillarArt,
  ScorecardPillarArt,
  Text,
  Theme,
  TopNav,
  TopNavHeading,
  useMediaQuery,
  VStack,
} from '@nightfall/ui-kit';
import type { PrimarySection } from '../../hooks/use-nightfall-router.js';
import {
  LandingFooterSection,
  LandingPlatformDownloadsSection,
  LandingWorkbenchPreviewSection,
} from './landing-sections.js';
import {
  detectClientPlatformSync,
  type DesktopPlatformId,
  NIGHTFALL_REPO_URL,
  refineClientPlatformAsync,
  resolvePlatformDownloadPlan,
} from './platform-downloads.js';

export type LandingLaunchTarget = Extract<
  PrimarySection,
  'findings' | 'fixes' | 'red-team' | 'scorecard' | 'overview'
>;

export type NightfallLandingPageProps = {
  colorMode: 'dark' | 'light';
  onColorModeChange: (mode: 'dark' | 'light') => void;
  onLaunchConsole: (target?: LandingLaunchTarget) => void;
};

type PillarItem = {
  id: 'defense' | 'red-team' | 'scorecard';
  title: string;
  body: string;
  ctaLabel: string;
  target: LandingLaunchTarget;
  renderArt: (active: boolean) => React.ReactNode;
};

const PILLARS: ReadonlyArray<PillarItem> = [
  {
    id: 'defense',
    title: 'Defense Factory.',
    body: 'Root-cause SAST, Mantis 20-stage deep review, and two-stage exploit/fix verification in Microsoft LiteBox.',
    ctaLabel: 'Inspect verified fixes →',
    target: 'fixes',
    renderArt: (active) => <DefenseFactoryPillarArt active={active} />,
  },
  {
    id: 'red-team',
    title: 'Scope-signed Red Team.',
    body: 'Ed25519 campaign manifests enforced mid-flight by EgressPolicyProxy across live HTTP and WebSocket probes.',
    ctaLabel: 'Open live campaign →',
    target: 'red-team',
    renderArt: (active) => <RedTeamPillarArt active={active} />,
  },
  {
    id: 'scorecard',
    title: 'Supply-chain Scorecard.',
    body: 'Continuous CI workflow and dependency posture evaluation powered by the vendored Go Scorecard daemon.',
    ctaLabel: 'Review posture checks →',
    target: 'scorecard',
    renderArt: (active) => <ScorecardPillarArt active={active} />,
  },
];

const styles: Record<string, CSSProperties> = {
  pageBodyDesktop: { maxWidth: 1120, width: '100%', marginInline: 'auto', paddingBlock: '36px 28px' },
  pageBodyMobile: { width: '100%', paddingBlock: '16px 24px' },
  heroHeadlineWrap: { maxWidth: 840, marginInline: 'auto' },
  heroSubheadWrap: { maxWidth: 640, marginInline: 'auto' },
  heroHeadingDesktop: { fontSize: 'clamp(2rem, 4.1vw, 3.25rem)', lineHeight: 1.12, letterSpacing: '-0.025em' },
  heroHeadingMobile: { fontSize: '1.85rem', lineHeight: 1.14, letterSpacing: '-0.022em' },
  heroLead: { display: 'block', fontWeight: 'var(--font-weight-normal)' },
  heroPunch: { display: 'block', fontWeight: 'var(--font-weight-semibold)' },
  pillarButton: { all: 'unset', display: 'block', width: '100%', cursor: 'pointer', textAlign: 'left' },
  artFrame: {
    width: '100%',
    aspectRatio: '16 / 10',
    borderRadius: 12,
    backgroundColor: 'var(--color-background-surface)',
    border: 'var(--border-width) solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    transition: 'border-color 180ms ease, transform 180ms ease',
  },
  artFrameActive: { borderColor: 'var(--color-accent)', transform: 'translateY(-2px)' },
};

export function NightfallLandingPage({
  colorMode,
  onColorModeChange,
  onLaunchConsole,
}: NightfallLandingPageProps): React.ReactElement {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [detectedPlatform, setDetectedPlatform] = useState<DesktopPlatformId>(() =>
    detectClientPlatformSync(),
  );
  const [hoveredPillar, setHoveredPillar] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void refineClientPlatformAsync().then((resolved) => {
      if (active) setDetectedPlatform(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  const plan = useMemo(() => resolvePlatformDownloadPlan(detectedPlatform), [detectedPlatform]);

  return (
    <Theme theme={nightfallTheme} mode={colorMode}>
      <AppShell
        height="auto"
        mobileNav={false}
        contentPadding={isMobile ? 4 : 6}
        topNav={
          <TopNav
            label="Nightfall navigation"
            heading={
              <TopNavHeading
                heading="Nightfall"
                logo={<NightfallHorizonIcon size={20} />}
                headingHref="#"
              />
            }
            endContent={
              <>
                <AstryxButton
                  id="nav-github"
                  size={isMobile ? 'sm' : 'md'}
                  label="GitHub"
                  variant="ghost"
                  href={NIGHTFALL_REPO_URL}
                />
                <AstryxButton
                  id="nav-open-console"
                  size={isMobile ? 'sm' : 'md'}
                  label="Web Console"
                  variant="secondary"
                  onClick={() => onLaunchConsole('findings')}
                />
              </>
            }
          />
        }
      >
        <div
          id="nightfall-landing-page"
          data-testid="nightfall-landing-page"
          data-detected-platform={detectedPlatform}
          style={isMobile ? styles.pageBodyMobile : styles.pageBodyDesktop}
        >
          <section aria-labelledby="hero-heading">
            <VStack gap={isMobile ? 4 : 6} hAlign="center">
              <VStack gap={isMobile ? 2 : 3} hAlign="center">
                <div style={styles.heroHeadlineWrap}>
                  <Heading level={1} type="display-1" justify="center" textWrap="balance">
                    <span
                      id="hero-heading"
                      style={isMobile ? styles.heroHeadingMobile : styles.heroHeadingDesktop}
                    >
                      <span style={styles.heroLead}>Exploit traces meet verified patches.</span>
                      <span style={styles.heroPunch}>
                        Close security findings before attackers do.
                      </span>
                    </span>
                  </Heading>
                </div>
                <div style={styles.heroSubheadWrap}>
                  <Text type={isMobile ? 'supporting' : 'body'} color="secondary" justify="center">
                    Nightfall pairs scope-signed Red Team campaigns with Mantis deep static review,
                    Microsoft LiteBox proofs, and Scorecard posture checks in one closed-loop
                    workbench.
                  </Text>
                </div>
              </VStack>

              <VStack gap={2} hAlign="center" width="100%">
                <HStack gap={isMobile ? 2 : 3} wrap="wrap" hAlign="center" vAlign="center">
                  <AstryxButton
                    id="hero-launch-console"
                    size={isMobile ? 'md' : 'lg'}
                    variant="primary"
                    label="Open Web Console"
                    endContent={<ArrowRightIcon size={15} />}
                    onClick={() => onLaunchConsole('findings')}
                  />
                  <AstryxButton
                    id="hero-download-installer"
                    size={isMobile ? 'md' : 'lg'}
                    variant="secondary"
                    label={isMobile ? plan.primaryCta.mobileLabel : plan.primaryCta.label}
                    endContent={<DownloadIcon size={15} />}
                    href={plan.primaryCta.url}
                  />
                </HStack>

                <div
                  id="hero-alternate-platforms"
                  className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-ink-secondary"
                >
                  <span>Other platforms:</span>
                  {plan.alternateInstallers.map((alt, idx) => (
                    <React.Fragment key={alt.id}>
                      {idx > 0 ? <span aria-hidden="true">·</span> : null}
                      <a
                        id={`hero-alt-download-${alt.id}`}
                        href={alt.url}
                        className="font-medium text-ink underline decoration-hairline-strong underline-offset-3 hover:text-accent-blue"
                      >
                        {alt.shortLabel}
                      </a>
                    </React.Fragment>
                  ))}
                </div>
              </VStack>

              <div className="mt-2 w-full">
                <Grid columns={{ minWidth: 260, max: 3, repeat: 'fit' }} gap={6}>
                  {PILLARS.map((pillar) => {
                    const isHovered = hoveredPillar === pillar.id;
                    return (
                      <button
                        key={pillar.id}
                        id={`hero-pillar-${pillar.id}`}
                        type="button"
                        style={styles.pillarButton}
                        onMouseEnter={() => setHoveredPillar(pillar.id)}
                        onMouseLeave={() => setHoveredPillar(null)}
                        onFocus={() => setHoveredPillar(pillar.id)}
                        onBlur={() => setHoveredPillar(null)}
                        onClick={() => onLaunchConsole(pillar.target)}
                      >
                        <VStack gap={3}>
                          <div
                            style={{
                              ...styles.artFrame,
                              ...(isHovered ? styles.artFrameActive : null),
                            }}
                          >
                            {pillar.renderArt(isHovered)}
                          </div>
                          <VStack gap={1}>
                            <Heading level={4}>{pillar.title}</Heading>
                            <Text type="supporting" color="secondary">
                              {pillar.body}
                            </Text>
                            <Text
                              type="supporting"
                              color={isHovered ? 'primary' : 'accent'}
                              weight="medium"
                            >
                              {pillar.ctaLabel}
                            </Text>
                          </VStack>
                        </VStack>
                      </button>
                    );
                  })}
                </Grid>
              </div>
            </VStack>
          </section>

          <LandingWorkbenchPreviewSection
            colorMode={colorMode}
            onOpenConsole={() => onLaunchConsole('findings')}
          />
          <LandingPlatformDownloadsSection
            installers={plan.allInstallers}
            detectedPlatform={detectedPlatform}
          />
          <LandingFooterSection colorMode={colorMode} onColorModeChange={onColorModeChange} />
        </div>
      </AppShell>
    </Theme>
  );
}
