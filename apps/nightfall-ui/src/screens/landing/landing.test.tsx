// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setNightfallApiBaseUrl } from '../../api/nightfall-client.js';
import { NightfallShowcaseRoot } from '../../nightfall-showcase-root.js';
import {
  type EphemeralTestServer,
  startContractValidatedTestServer,
} from '../../test-http-server.js';
import {
  detectClientPlatformSync,
  refineClientPlatformAsync,
  resolvePlatformDownloadPlan,
} from './platform-downloads.js';

let testServer: EphemeralTestServer | null = null;

afterEach(async () => {
  cleanup();
  window.history.replaceState({}, '', '/');
  window.localStorage.clear();
  if (testServer) {
    await testServer.close();
    testServer = null;
  }
});

describe('Nightfall platform detection & Outrider-flow landing showcase', () => {
  it('resolves macOS Apple Silicon, macOS Intel, Windows x64, and Linux download links accurately', async () => {
    expect(
      detectClientPlatformSync(
        { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel' },
        'ANGLE (Apple, Apple M3 Max, OpenGL 4.1)',
      ),
    ).toBe('mac-arm64');

    expect(
      detectClientPlatformSync(
        { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel' },
        'Intel(R) Iris(TM) Plus Graphics 655',
      ),
    ).toBe('mac-x64');

    expect(
      await refineClientPlatformAsync({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        userAgentData: {
          platform: 'macOS',
          getHighEntropyValues: async () => ({ platform: 'macOS', architecture: 'x86' }),
        },
      }),
    ).toBe('mac-x64');

    expect(
      detectClientPlatformSync({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
      }),
    ).toBe('win-x64');

    expect(
      detectClientPlatformSync({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        platform: 'Linux x86_64',
      }),
    ).toBe('other');

    const macArmPlan = resolvePlatformDownloadPlan('mac-arm64');
    expect(macArmPlan.primaryCta.url).toContain('/releases/latest/download/Nightfall-mac-arm64.dmg');
    expect(macArmPlan.alternateInstallers.map((x) => x.id)).toEqual(['mac-x64', 'win-x64']);

    const winPlan = resolvePlatformDownloadPlan('win-x64');
    expect(winPlan.primaryCta.url).toContain('/releases/latest/download/Nightfall-win-x64.msi');
    expect(winPlan.alternateInstallers.map((x) => x.id)).toEqual(['mac-arm64', 'mac-x64']);
  });

  it('mounts live Nightfall components in the 3-card hero, renders problem-first headers, and transitions to the Web Console', async () => {
    testServer = await startContractValidatedTestServer();
    setNightfallApiBaseUrl(testServer.baseUrl);
    window.history.replaceState({}, '', '/');

    render(<NightfallShowcaseRoot />);

    expect(screen.getByTestId('nightfall-landing-page')).toBeTruthy();
    expect(
      screen.getByText('Vulnerabilities linger when proof and patch live in separate tools.'),
    ).toBeTruthy();
    expect(
      screen.getByText("Audit private repos and localhost targets that can't touch the cloud."),
    ).toBeTruthy();

    // Verify all 3 hero cards mount live @nightfall/ui-kit components populated by real backend state
    await waitFor(() => {
      expect(document.querySelector('#hero-pillar-defense pre')).toBeTruthy();
      expect(
        document.querySelector('#hero-pillar-red-team [aria-label="Confirmed findings timeline ticks"]'),
      ).toBeTruthy();
      expect(document.querySelector('#hero-live-scorecard-meter')).toBeTruthy();
    });

    expect(document.querySelector('#hero-launch-console')).toBeTruthy();
    expect(document.querySelector('#hero-download-installer')).toBeTruthy();
    expect(document.querySelector('#download-link-mac-arm64')).toBeTruthy();
    expect(document.querySelector('#download-link-mac-x64')).toBeTruthy();
    expect(document.querySelector('#download-link-win-x64')).toBeTruthy();
    expect(document.querySelector('#download-link-checksums')).toBeTruthy();
    expect(document.body.innerHTML.toLowerCase()).not.toContain('daybreak');
    expect(document.body.innerHTML.toLowerCase()).not.toContain('codex');

    // Toggle dark mode in landing footer and verify persistence
    fireEvent.click(screen.getByText('Dark'));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(window.localStorage.getItem('nightfall.themeMode')).toBe('dark');
    });

    // Primary CTA launches live Web Console
    fireEvent.click(document.querySelector('#hero-launch-console')!);
    await waitFor(() => {
      expect(document.querySelector('#nightfall-three-col-app')).toBeTruthy();
      expect(window.location.search).toContain('view=console');
    });

    // Return to landing via header button
    fireEvent.click(document.querySelector('#btn-back-to-landing')!);
    await waitFor(() => {
      expect(screen.getByTestId('nightfall-landing-page')).toBeTruthy();
      expect(window.location.search).toBe('');
    });

    // Pillar CTA jumps directly into Scorecard section in Web Console
    fireEvent.click(document.querySelector('#hero-pillar-scorecard')!);
    await waitFor(() => {
      expect(document.querySelector('#scorecard-posture-meter')).toBeTruthy();
      expect(window.location.hash).toBe('#/scorecard');
    });
  });
});
