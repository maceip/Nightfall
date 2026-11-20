// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setNightfallApiBaseUrl } from '../../api/nightfall-client.js';
import { NightfallShowcaseRoot } from '../../nightfall-showcase-root.js';
import { deriveCampaignStatus } from '../red-team/live-campaign-screen.js';
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

  it('mounts Nightfall-tinted illustration cards, concise readable copy, and transitions to the Web Console', async () => {
    testServer = await startContractValidatedTestServer();
    setNightfallApiBaseUrl(testServer.baseUrl);
    window.history.replaceState({}, '', '/');

    render(<NightfallShowcaseRoot />);

    expect(screen.getByTestId('nightfall-landing-page')).toBeTruthy();
    expect(screen.getByText('Persistent Red Teaming.')).toBeTruthy();
    expect(
      screen.getByText(
        'AI-managed pen tests that continuously attack each dependency using real exploits to ship verified patches.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Prove exploits before patching.')).toBeTruthy();
    expect(screen.getByText('Probe staging without scope creep.')).toBeTruthy();
    expect(screen.getByText('Block risky CI workflows pre-merge.')).toBeTruthy();
    expect(document.querySelector('#hero-product-preview')).toBeNull();

    const defenseStage = document.querySelector('#hero-pillar-defense [role="img"]');
    const redTeamStage = document.querySelector('#hero-pillar-red-team [role="img"]');
    const scorecardStage = document.querySelector('#hero-pillar-scorecard [role="img"]');
    expect(defenseStage).toBeTruthy();
    expect(redTeamStage).toBeTruthy();
    expect(scorecardStage).toBeTruthy();
    expect(document.querySelectorAll('.nf-nightfall-card').length).toBe(3);

    const pillarCard = document.querySelector('#hero-pillar-scorecard');
    const downloadsSection = document.querySelector('#platform-downloads');
    expect(pillarCard).toBeTruthy();
    expect(downloadsSection).toBeTruthy();
    expect(
      Boolean(
        pillarCard &&
          downloadsSection &&
          pillarCard.compareDocumentPosition(downloadsSection) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);

    expect(document.querySelector('#hero-launch-console')).toBeTruthy();
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

    // Dark-mode Red Team Live Campaign renders under single dark <Theme> (no nested light reset)
    expect(
      deriveCampaignStatus({ status: 'paused_hitl' } as never, false).label,
    ).toBe('Awaiting approval');
    fireEvent.click(document.querySelector('#nav-btn-red-team')!);
    await waitFor(() => {
      const statusPill = document.querySelector('#rt-campaign-status-pill');
      expect(statusPill).toBeTruthy();
      expect(document.querySelector('#btn-rt-footer-kill-switch')).toBeTruthy();
      expect(document.querySelectorAll('[data-theme="light"]').length).toBe(0);
      expect(
        document.querySelectorAll('div[data-astryx-theme="nightfall"][data-theme="dark"]').length,
      ).toBe(1);
    });
  });
});
