import React, { useState, type CSSProperties } from 'react';
import {
  AstryxButton,
  AstryxSegmentedControl,
  Divider,
  DownloadIcon,
  Heading,
  HStack,
  SegmentedControlItem,
  StackItem,
  Text,
  VStack,
} from '@nightfall/ui-kit';
import {
  type DesktopPlatformId,
  NIGHTFALL_CHECKSUMS_URL,
  NIGHTFALL_RELEASES_LATEST_URL,
  type PlatformInstallerSpec,
} from './platform-downloads.js';

const triggerResetStyle: CSSProperties = {
  all: 'unset',
  display: 'block',
  width: '100%',
  cursor: 'pointer',
  textAlign: 'left',
};

const previewWindowStyle: CSSProperties = {
  width: '100%',
  padding: 6,
  borderRadius: 14,
  backgroundColor: 'var(--color-background-surface)',
  border: 'var(--border-width) solid var(--color-border-emphasized)',
  boxShadow: '0 20px 56px rgba(0, 0, 0, 0.16)',
  transition: 'border-color 180ms ease, transform 180ms ease',
  boxSizing: 'border-box',
};

const previewWindowActiveStyle: CSSProperties = {
  border: 'var(--border-width) solid var(--color-accent)',
  transform: 'translateY(-2px)',
};

export function LandingWorkbenchPreviewSection({
  colorMode,
  onOpenConsole,
}: {
  colorMode: 'dark' | 'light';
  onOpenConsole: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const previewSrc =
    colorMode === 'dark' ? './preview-console-dark.png' : './preview-console-light.png';

  return (
    <section aria-labelledby="preview-heading" className="pt-12 md:pt-14">
      <VStack gap={4}>
        <div className="max-w-2xl">
          <VStack gap={1}>
            <Heading level={2} type="display-3">
              <span id="preview-heading">
                Vulnerabilities linger when proof and patch live in separate tools.
              </span>
            </Heading>
            <Text type="supporting" color="secondary">
              Tossing CSV exports into a backlog leaves engineers guessing how to reproduce the
              bug. One shared queue links the live HTTP exploit trace, the vulnerable line of code,
              and the verified branch ready to merge.
            </Text>
          </VStack>
        </div>

        <button
          id="hero-product-preview"
          type="button"
          aria-label="Open interactive Nightfall Web Console"
          style={triggerResetStyle}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          onClick={onOpenConsole}
        >
          <div
            style={{
              ...previewWindowStyle,
              ...(hovered ? previewWindowActiveStyle : null),
            }}
          >
            <img
              src={previewSrc}
              alt="Nightfall unified security queue linking exploit traces, root-cause findings, and verified patches"
              width={1440}
              height={900}
              className="block h-auto w-full rounded-[9px] border border-hairline"
            />
          </div>
        </button>
      </VStack>
    </section>
  );
}

export function LandingPlatformDownloadsSection({
  installers,
  detectedPlatform,
}: {
  installers: ReadonlyArray<PlatformInstallerSpec>;
  detectedPlatform: DesktopPlatformId;
}): React.ReactElement {
  return (
    <section id="platform-downloads" aria-labelledby="downloads-heading" className="pt-12">
      <VStack gap={3}>
        <HStack justify="between" vAlign="end" wrap="wrap" gap={2}>
          <div className="max-w-xl space-y-1">
            <Heading level={3}>
              <span id="downloads-heading">
                Audit private repos and localhost targets that can&apos;t touch the cloud.
              </span>
            </Heading>
            <Text type="supporting" color="secondary">
              Run the orchestrator, Go Scorecard daemon, and sandboxed patch proofs locally on
              macOS or Windows with zero source code uploaded externally.
            </Text>
          </div>
          <a
            id="download-link-checksums"
            href={NIGHTFALL_CHECKSUMS_URL}
            className="font-mono text-xs text-ink-secondary underline decoration-hairline-strong underline-offset-3 hover:text-ink"
          >
            SHA256SUMS.txt
          </a>
        </HStack>

        <div className="nf-elevated-surface grid grid-cols-1 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
          {installers.map((item) => {
            const isCurrent = item.id === detectedPlatform;
            return (
              <div key={item.id} className="flex flex-col justify-between gap-3 p-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">
                      {item.platformLabel}
                    </span>
                    {isCurrent ? (
                      <span className="text-[11.5px] font-medium text-accent-blue">Detected</span>
                    ) : null}
                  </div>
                  <p className="m-0 text-xs text-ink-secondary">{item.archSummary}</p>
                </div>
                <a
                  id={`download-link-${item.id}`}
                  href={item.url}
                  className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-ink hover:text-accent-blue"
                >
                  <DownloadIcon size={13} />
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
    <footer className="pt-12">
      <VStack gap={4}>
        <Divider />
        <HStack gap={3} vAlign="center" wrap="wrap">
          <StackItem size="fill">
            <Text type="supporting" color="secondary">
              Nightfall · Desktop builds for macOS (Apple Silicon &amp; Intel) and Windows x64
            </Text>
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
