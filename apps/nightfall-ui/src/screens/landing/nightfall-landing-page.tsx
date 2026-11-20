import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  AppShell,
  ArrowRightIcon,
  AstryxButton,
  DownloadIcon,
  Heading,
  HStack,
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
  LandingWorkbenchPreviewSection,
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
    paddingBlock: '40px 32px',
  },
  pageBodyMobile: { width: '100%', paddingBlock: '20px 28px' },
  heroHeadlineWrap: { maxWidth: 760, marginInline: 'auto' },
  heroHeadingDesktop: { fontSize: 'clamp(2.4rem, 4.5vw, 3.5rem)', lineHeight: 1.08 },
  heroHeadingMobile: { fontSize: '2.1rem', lineHeight: 1.1 },
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
                      Only ship fixes proven against real exploits.
                    </span>
                  </Heading>
                </div>
                <p className="m-0 max-w-[46ch] text-center text-[16.5px] leading-[1.5] text-pretty text-ink-secondary md:text-[18.5px]">
                  Autonomous red-teaming, sandboxed exploit proof, and verified Git patches.
                </p>
              </VStack>

              <VStack gap={3} hAlign="center" width="100%">
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
                  className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[14px] text-ink-secondary"
                >
                  {plan.alternateInstallers.map((alt, idx) => (
                    <React.Fragment key={alt.id}>
                      {idx > 0 ? <span aria-hidden="true">·</span> : null}
                      <a
                        id={`hero-alt-download-${alt.id}`}
                        href={alt.url}
                        className="font-medium text-ink underline decoration-hairline-strong underline-offset-4 hover:text-accent-blue"
                      >
                        {alt.shortLabel}
                      </a>
                    </React.Fragment>
                  ))}
                </div>
              </VStack>

              <LandingLiveHeroGrid onLaunchConsole={onLaunchConsole} />
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
