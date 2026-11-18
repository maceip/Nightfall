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
  it('renders Nightfall shell, Defense Factory drawers, Scorecard posture & check inspector, Microsoft LiteBox status, and Red Team views against real HTTP endpoints', async () => {
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

    // 4. Overview, Repositories (with Scorecard pill), Scorecard screen + check inspector + live scan, and Settings
    fireEvent.click(document.querySelector('#nav-btn-overview')!);
    await waitFor(() => expect(screen.getByText('Proposed fixes')).toBeTruthy());

    fireEvent.click(document.querySelector('#nav-btn-repositories')!);
    await waitFor(() => expect(screen.getByText('PR review coverage')).toBeTruthy());
    expect(document.querySelector('#btn-repo-scorecard-northstar-docs')).toBeTruthy();

    fireEvent.click(document.querySelector('#nav-btn-scorecard')!);
    await waitFor(() => {
      expect(document.querySelector('#scorecard-posture-meter')).toBeTruthy();
      expect(screen.getByText('Dangerous-Workflow')).toBeTruthy();
      expect(screen.getByText('Token-Permissions')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#btn-inspect-check-Dangerous-Workflow')!);
    await waitFor(() => {
      expect(screen.getByText('PROBE EVIDENCE (1)')).toBeTruthy();
      expect(screen.getByText('SUGGESTED REMEDIATION DIFF')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#btn-close-scorecard-check-drawer')!);

    fireEvent.click(document.querySelector('#btn-run-scorecard-scan')!);
    await waitFor(() => {
      expect(testServer?.capturedScorecardScans.length).toBe(1);
      expect(testServer?.capturedScorecardScans[0]?.repository).toBe('northstar-docs');
    });

    fireEvent.click(document.querySelector('#nav-btn-settings')!);
    await waitFor(() => {
      expect(screen.getByText('Microsoft LiteBox Library OS Sandbox')).toBeTruthy();
      expect(screen.getByText('Nightfall Scorecard Supply-Chain Engine')).toBeTruthy();
      expect(screen.getByText('daemon-http')).toBeTruthy();
      expect(screen.getByText('Mantis Autonomous Vulnerability Pipeline')).toBeTruthy();
      expect(screen.getByText('Mantis Engine Integrated ✓')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#btn-open-mantis-pipeline-drawer')!);
    await waitFor(() => {
      expect(screen.getByText('Mantis 20-Stage Reference Pipeline')).toBeTruthy();
      expect(screen.getByText('Export workflow.local.json')).toBeTruthy();
    });
    fireEvent.keyDown(document, { key: 'Escape' });

    // Repo-scoped workspace selector + Back/Forward history router
    const repoSelect = document.querySelector('#select-global-repo-filter') as HTMLSelectElement;
    expect(repoSelect).toBeTruthy();
    fireEvent.change(repoSelect, { target: { value: 'auth-gateway' } });
    fireEvent.change(repoSelect, { target: { value: 'all' } });

    fireEvent.click(document.querySelector('#btn-history-back')!);
    fireEvent.click(document.querySelector('#btn-history-forward')!);

    fireEvent.click(document.querySelector('#nav-btn-new-scan')!);
    await waitFor(() => {
      expect(screen.getByText('Scan method')).toBeTruthy();
      expect(screen.getByText('Supply-chain & Scorecard posture')).toBeTruthy();
      expect(screen.getByText('Mantis autonomous deep review')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#btn-scan-mode-local')!);
    fireEvent.click(document.querySelector('#btn-submit-start-scan')!);
    await waitFor(() => {
      expect(testServer?.capturedScans[0]?.mode).toBe('local');
      expect(testServer?.capturedScans[0]?.localPath).toBe('/workspace/northstar-docs');
    });

    // Verify Defense Factory views have zero leaked campaign.yaml tabs and zero segmented rail dividers
    expect(document.querySelector('#top-tab-campaign-yaml')).toBeNull();
    expect(document.querySelectorAll('#nightfall-product-sidebar [role="separator"]').length).toBe(0);
    fireEvent.click(document.querySelector('#btn-toggle-sidebar')!);
    expect(document.querySelector('#nightfall-product-sidebar')?.getAttribute('data-collapsed')).toBe('true');
    fireEvent.click(document.querySelector('#btn-toggle-sidebar')!);
    expect(document.querySelector('#nightfall-product-sidebar')?.getAttribute('data-collapsed')).toBe('false');

    // 5. Red Team Live Campaign, Finding Report (NS-7b64c9e2), and Scope YAML builder + ScopeAuthorizationPanel
    fireEvent.click(document.querySelector('#nav-btn-red-team')!);
    await waitFor(() => {
      expect(screen.getByText('Safety monitor')).toBeTruthy();
      expect(screen.getByText('Confirmed cross-tenant finding')).toBeTruthy();
      expect(document.querySelector('#select-global-repo-filter')).toBeNull();
    });
    fireEvent.click(document.querySelector('#rt-finding-row-SEC-1034')!);
    await waitFor(() => {
      expect(screen.getByText('See the private document in the downloaded ZIP ↓')).toBeTruthy();
      expect(screen.getByText('Promote to Defense Factory')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('#top-tab-campaign-yaml')!);
    await waitFor(() => {
      expect(screen.getByText('Download v5 YAML')).toBeTruthy();
      expect(screen.getByText('Cryptographic Scope Authorization (Ed25519)')).toBeTruthy();
    });
    expect(container.innerHTML).not.toContain('NaN');
  });
});
