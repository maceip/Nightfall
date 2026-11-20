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
  type DesktopPlatformId,
  NIGHTFALL_CHECKSUMS_URL,
  NIGHTFALL_RELEASES_LATEST_URL,
  type PlatformInstallerSpec,
} from './platform-downloads.js';

export function LandingPlatformDownloadsSection({
  installers,
  detectedPlatform,
}: {
  installers: ReadonlyArray<PlatformInstallerSpec>;
  detectedPlatform: DesktopPlatformId;
}): React.ReactElement {
  return (
    <section id="platform-downloads" aria-labelledby="downloads-heading" className="pt-10 md:pt-12">
      <VStack gap={3}>
        <HStack justify="between" vAlign="center" wrap="wrap" gap={2}>
          <h2 id="downloads-heading" className="m-0 text-base font-semibold text-ink">
            Desktop installers
          </h2>
          <a
            id="download-link-checksums"
            href={NIGHTFALL_CHECKSUMS_URL}
            className="font-mono text-[13px] text-ink-secondary underline decoration-hairline-strong underline-offset-4 hover:text-ink"
          >
            SHA256SUMS.txt
          </a>
        </HStack>

        <div className="grid grid-cols-1 divide-y divide-hairline-strong overflow-hidden rounded-2xl border border-hairline-strong bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
          {installers.map((item) => {
            const isCurrent = item.id === detectedPlatform;
            return (
              <div key={item.id} className="flex flex-col justify-between gap-2.5 p-4 md:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-ink">{item.platformLabel}</span>
                  {isCurrent ? (
                    <span className="text-[13px] font-medium text-accent-blue">Detected</span>
                  ) : null}
                </div>
                <a
                  id={`download-link-${item.id}`}
                  href={item.url}
                  className="inline-flex items-center gap-1.5 font-mono text-[13.5px] font-medium text-ink-secondary hover:text-accent-blue"
                >
                  <DownloadIcon size={14} />
                  <span>{item.fileName}</span>
                </a>
              </div>
            );
          })}
        </div>
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
            <span className="text-sm font-medium text-ink-secondary">Nightfall</span>
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
