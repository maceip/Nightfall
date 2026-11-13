// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.js';

afterEach(() => {
  cleanup();
});

describe('@nightfall/nightfall-ui Three-Column Shell & Views', () => {
  it('renders Nightfall sidebar branding, Sankey Findings, Defense Factory drawers, and Red Team views with zero legacy labels', async () => {
    const { container } = render(<App />);

    // Wait for bootstrap state to render
    await waitFor(() => {
      expect(screen.getByText('Nightfall')).toBeTruthy();
    });

    // Enforce zero legacy brand leakage anywhere in rendered DOM
    expect(container.innerHTML.toLowerCase()).not.toContain('daybreak');
    expect(container.innerHTML.toLowerCase()).not.toContain('codex');

    // Findings Sankey click-to-focus on Critical (31)
    const criticalNode = container.querySelector('#sankey-node-critical');
    expect(criticalNode).toBeTruthy();
    fireEvent.click(criticalNode!);
    await waitFor(() => {
      expect(container.querySelector('#findings-sankey-focused')).toBeTruthy();
    });

    // Clear Sankey filter and open SEC-1034 Finding Detail + Fix with Nightfall drawer
    fireEvent.click(container.querySelector('#btn-reset-sankey-filter')!);
    fireEvent.click(container.querySelector('#finding-row-SEC-1034')!);
    await waitFor(() => {
      expect(screen.getByText('REPORTED SEVERITY')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('#btn-detail-open-fix')!);
    await waitFor(() => {
      expect(screen.getByText('Fix with Nightfall')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('#btn-close-fix-drawer')!);

    // Navigate across Overview, Fixes, Repositories, and New Scan drawer
    fireEvent.click(container.querySelector('#nav-btn-overview')!);
    await waitFor(() => {
      expect(screen.getByText('Proposed fixes')).toBeTruthy();
    });

    fireEvent.click(container.querySelector('#nav-btn-repositories')!);
    await waitFor(() => {
      expect(screen.getByText('PR review coverage')).toBeTruthy();
    });

    fireEvent.click(container.querySelector('#nav-btn-new-scan')!);
    await waitFor(() => {
      expect(screen.getByText('Scan method')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('#btn-close-new-scan')!);

    // Switch to Nightfall Red Team live campaign, F-002 report, and campaign.yaml split builder
    fireEvent.click(container.querySelector('#nav-btn-red-team')!);
    await waitFor(() => {
      expect(screen.getByText('Safety monitor')).toBeTruthy();
      expect(screen.getByText('Nine findings confirmed')).toBeTruthy();
    });

    fireEvent.click(container.querySelector('#rt-finding-row-F-002')!);
    await waitFor(() => {
      expect(screen.getAllByText('Architecture').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Open Tested Fix in Defense Factory →')).toBeTruthy();
    });

    fireEvent.click(container.querySelector('#top-tab-campaign-yaml')!);
    await waitFor(() => {
      expect(screen.getByText('Download v5 YAML')).toBeTruthy();
    });
  });
});
