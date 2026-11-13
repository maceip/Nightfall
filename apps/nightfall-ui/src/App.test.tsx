// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button, SankeyDiagram } from '@nightfall/ui-kit';
import { setNightfallApiBaseUrl } from './api/nightfall-client.js';
import { App } from './App.js';
import { type EphemeralTestServer, startContractValidatedTestServer } from './test-http-server.js';

let testServer: EphemeralTestServer | null = null;

afterEach(async () => {
  cleanup();
  if (testServer) {
    await testServer.close();
    testServer = null;
  }
});

describe('@nightfall/nightfall-ui + @nightfall/ui-kit over real HTTP server', () => {
  it('renders Nightfall shell, Defense Factory drawers, Microsoft LiteBox status, and Red Team views against real HTTP endpoints with zero mock fallbacks', async () => {
    testServer = await startContractValidatedTestServer({ failFirstBootstrap: true });
    setNightfallApiBaseUrl(testServer.baseUrl);

    const { container } = render(
      <>
        <Button className="hidden">Kit check</Button>
        <SankeyDiagram
          totalOpen={0}
          severityCounts={{ critical: 0, high: 0, medium: 0, low: 0, informational: 0 }}
          statusCounts={{ new: 0, triaged: 0, in_progress: 0 }}
          links={[]}
          selectedSeverity={null}
          onSelectSeverity={() => {}}
          className="hidden"
        />
        <App />
      </>,
    );

    // 1. Real error state when /api/bootstrap fails (proving zero silent mock fallback)
    await waitFor(() => {
      expect(screen.getByText('Nightfall API Unavailable')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Retry connection'));

    // 2. Live bootstrap state renders cleanly with zero legacy brand strings or NaN
    await waitFor(() => {
      expect(screen.getByText('Nightfall')).toBeTruthy();
    });
    expect(document.body.innerHTML.toLowerCase()).not.toContain('daybreak');
    expect(document.body.innerHTML.toLowerCase()).not.toContain('codex');
    expect(container.innerHTML).not.toContain('NaN');

    // 3. Sankey click-to-focus + Finding Detail + Fix with Nightfall Drawer
    fireEvent.click(document.querySelectorAll('#sankey-node-critical')[1]!);
    await waitFor(() => {
      expect(document.querySelector('#findings-sankey-focused')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#btn-reset-sankey-filter')!);
    fireEvent.click(document.querySelector('#finding-row-SEC-1034')!);
    await waitFor(() => {
      expect(screen.getByText('REPORTED SEVERITY')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#btn-detail-open-fix')!);
    await waitFor(() => {
      expect(screen.getByText('Fix with Nightfall')).toBeTruthy();
      expect(screen.getByText('nightfall/fix-sec-1034')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#btn-merge-and-verify')!);
    await waitFor(() => {
      expect(screen.getByText('Merged & Verified Closed ✓')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#btn-close-fix-drawer')!);

    // 4. Overview, Repositories, Settings (Microsoft LiteBox), and Local New Scan passing localPath
    fireEvent.click(document.querySelector('#nav-btn-overview')!);
    await waitFor(() => expect(screen.getByText('Proposed fixes')).toBeTruthy());

    fireEvent.click(document.querySelector('#nav-btn-repositories')!);
    await waitFor(() => expect(screen.getByText('PR review coverage')).toBeTruthy());

    fireEvent.click(document.querySelector('#nav-btn-settings')!);
    await waitFor(() => {
      expect(screen.getByText('Microsoft LiteBox Library OS Sandbox')).toBeTruthy();
      expect(screen.getByText('litebox_shim_linux')).toBeTruthy();
    });

    fireEvent.click(document.querySelector('#nav-btn-new-scan')!);
    await waitFor(() => expect(screen.getByText('Scan method')).toBeTruthy());
    fireEvent.click(document.querySelector('#btn-scan-mode-local')!);
    fireEvent.click(document.querySelector('#btn-submit-start-scan')!);
    await waitFor(() => {
      expect(testServer?.capturedScans[0]?.mode).toBe('local');
      expect(testServer?.capturedScans[0]?.localPath).toBe('/workspace/northstar-docs');
    });

    // 5. Red Team Live Campaign, Finding Report (NS-7b64c9e2), and campaign.yaml v5 builder
    fireEvent.click(document.querySelector('#nav-btn-red-team')!);
    await waitFor(() => {
      expect(screen.getByText('Safety monitor')).toBeTruthy();
      expect(screen.getByText('Confirmed cross-tenant finding')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#rt-finding-row-SEC-1034')!);
    await waitFor(() => {
      expect(screen.getByText('See the private document in the downloaded ZIP ↓')).toBeTruthy();
      expect(screen.getByText('Promote to Defense Factory')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#top-tab-campaign-yaml')!);
    await waitFor(() => expect(screen.getByText('Download v5 YAML')).toBeTruthy());
  });
});
