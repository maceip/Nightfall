import React from 'react';
import {
  AstryxButton,
  AstryxSegmentedControl,
  Divider,
  DownloadIcon,
  HStack,
  SegmentedControlItem,
  StackItem,
  VStack,
} from '@nightfall/ui-kit';
import {
  NIGHTFALL_CHECKSUMS_URL,
  NIGHTFALL_RELEASES_LATEST_URL,
  type PlatformDownloadPlan,
} from './platform-downloads.js';

export function LandingPlatformDownloadsSection({
  plan,
  isMobile,
}: {
  plan: PlatformDownloadPlan;
  isMobile: boolean;
}): React.ReactElement {
  const matched = plan.allInstallers.find((item) => item.id === plan.detectedPlatform);
  const orderedInstallers = matched
    ? [matched, ...plan.allInstallers.filter((item) => item.id !== matched.id)]
    : plan.allInstallers;

  return (
    <section id="platform-downloads" aria-label="Download Nightfall desktop builds" className="pt-8 md:pt-10">
      <VStack gap={3} hAlign="center">
        <HStack gap={isMobile ? 2 : 3} wrap="wrap" hAlign="center" vAlign="center">
          {orderedInstallers.map((item, idx) => {
            const isDetected = matched ? item.id === matched.id : idx === 0;
            return (
              <AstryxButton
                key={item.id}
                id={`download-link-${item.id}`}
                size={isMobile ? 'md' : 'lg'}
                variant={isDetected ? 'primary' : 'secondary'}
                label={isDetected ? item.ctaLabel : item.shortLabel}
                endContent={<DownloadIcon size={15} />}
                href={item.url}
              />
            );
          })}
        </HStack>
      </VStack>
    </section>
  );
}

export function LandingFooterSection({
  colorMode,
  onColorModeChange,
}: {
  colorMode: 'dark' | 'light';
  onColorModeChange: (mode: 'dark' | 'light') => void;
}): React.ReactElement {
  return (
    <footer className="pt-10">
      <VStack gap={4}>
        <Divider />
        <HStack gap={3} vAlign="center" wrap="wrap">
          <StackItem size="fill">
            <HStack gap={3} vAlign="center" wrap="wrap">
              <span className="text-sm font-medium text-ink-secondary">Nightfall</span>
              <a
                id="download-link-checksums"
                href={NIGHTFALL_CHECKSUMS_URL}
                className="font-mono text-xs text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
              >
                SHA256SUMS.txt
              </a>
            </HStack>
          </StackItem>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <AstryxButton
              id="footer-releases"
              size="sm"
              variant="ghost"
              label="Latest Release"
              href={NIGHTFALL_RELEASES_LATEST_URL}
            />
            <AstryxSegmentedControl
              size="sm"
              label="Color mode"
              value={colorMode}
              onChange={(v) => onColorModeChange(v as 'dark' | 'light')}
            >
              <SegmentedControlItem value="dark" label="Dark" />
              <SegmentedControlItem value="light" label="Light" />
            </AstryxSegmentedControl>
          </HStack>
        </HStack>
      </VStack>
    </footer>
  );
}
