import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  AppShell,
  ArrowRightIcon,
  AstryxButton,
  Heading,
  NightfallHorizonIcon,
  nightfallTheme,
  Theme,
  TopNav,
  TopNavHeading,
  useMediaQuery,
  VStack,
} from '@nightfall/ui-kit';
import { LandingLiveHeroGrid, type LandingLaunchTarget } from './landing-live-cards.js';
import {
  LandingFooterSection,
  LandingPlatformDownloadsSection,
} from './landing-sections.js';
import {
  detectClientPlatformSync,
  type DesktopPlatformId,
  NIGHTFALL_REPO_URL,
  refineClientPlatformAsync,
  resolvePlatformDownloadPlan,
} from './platform-downloads.js';

export type { LandingLaunchTarget };

export type NightfallLandingPageProps = {
  colorMode: 'dark' | 'light';
  onColorModeChange: (mode: 'dark' | 'light') => void;
  onLaunchConsole: (target?: LandingLaunchTarget) => void;
};

const styles: Record<string, CSSProperties> = {
  pageBodyDesktop: {
    maxWidth: 1160,
    width: '100%',
    marginInline: 'auto',
    paddingBlock: '48px 32px',
  },
  pageBodyMobile: { width: '100%', paddingBlock: '24px 28px' },
  heroHeadlineWrap: { maxWidth: 820, marginInline: 'auto' },
  heroHeadingDesktop: { fontSize: 'clamp(2.75rem, 5.2vw, 4.2rem)', lineHeight: 1.05 },
  heroHeadingMobile: { fontSize: '2.35rem', lineHeight: 1.08 },
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
            <VStack gap={isMobile ? 5 : 6} hAlign="center">
              <VStack gap={3} hAlign="center">
                <div style={styles.heroHeadlineWrap}>
                  <Heading level={1} type="display-1" justify="center" textWrap="balance">
                    <span
                      id="hero-heading"
                      style={isMobile ? styles.heroHeadingMobile : styles.heroHeadingDesktop}
                    >
                      Persistent Red Teaming.
                    </span>
                  </Heading>
                </div>
                <p className="m-0 max-w-[54ch] text-center text-[17px] leading-[1.5] text-balance text-ink-secondary md:text-[19px]">
                  AI-managed pen tests that continuously attack each dependency using real exploits to ship verified patches.
                </p>
              </VStack>

              <AstryxButton
                id="hero-launch-console"
                size={isMobile ? 'md' : 'lg'}
                variant="primary"
                label="Open Web Console"
                endContent={<ArrowRightIcon size={15} />}
                onClick={() => onLaunchConsole('findings')}
              />

              <LandingLiveHeroGrid onLaunchConsole={onLaunchConsole} />
            </VStack>
          </section>

          <LandingPlatformDownloadsSection
            plan={plan}
            isMobile={isMobile}
          />
          <LandingFooterSection colorMode={colorMode} onColorModeChange={onColorModeChange} />
        </div>
      </AppShell>
    </Theme>
  );
}
