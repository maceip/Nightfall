// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BudgetSignalBars,
  Button,
  CampaignActivityTimeline,
  Card,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  DailyTrendChart,
  DataTable,
  DialogClose,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DrawerContent,
  Input,
  KpiCard,
  MetadataField,
  MetadataRail,
  NightfallHorizonIcon,
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
  RedTeamCampaignBadge,
  SankeyDiagram,
  SearchIcon,
  SegmentedControl,
  SeverityBadge,
  ShieldAlertIcon,
  StatusBadge,
  Switch,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  TooltipProvider,
  UnifiedDiffViewer,
} from './index.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let hostEl: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  if (hostEl) {
    hostEl.remove();
    hostEl = null;
  }
});

function InteractiveKitHarness(): React.ReactElement {
  const [selectedSev, setSelectedSev] = useState<
    'critical' | 'high' | 'medium' | 'low' | 'informational' | null
  >(null);
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [promptVal, setPromptVal] = useState('Assess staging target');

  return (
    <TooltipProvider>
      <div>
        <SearchIcon size={16} aria-label="Search icon" />
        <ShieldAlertIcon size={18} />
        <NightfallHorizonIcon size={18} />
        <RedTeamCampaignBadge size={24} />

        <Button variant="default">Primary Action</Button>
        <Button variant="destructive" data-engaged="true">
          Kill-Switch
        </Button>
        <Input placeholder="Filter findings" />
        <Switch defaultChecked aria-label="HITL switch" />

        <SeverityBadge severity="critical" />
        <StatusBadge status="in_progress" />
        <StatusBadge status="verified" />

        <KpiCard label="PR review coverage" value={14} suffix="/ 18" />
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'cloud', label: 'Cloud' },
            { value: 'local', label: 'Local' },
          ]}
        />

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTab value="overview">Overview Tab</TabsTab>
            <TabsTab value="findings">Findings Tab</TabsTab>
          </TabsList>
          <TabsPanel value="overview">Overview Content</TabsPanel>
          <TabsPanel value="findings">Findings Content</TabsPanel>
        </Tabs>

        <Collapsible defaultOpen>
          <CollapsibleTrigger>Gates Log</CollapsibleTrigger>
          <CollapsiblePanel>Red-to-Green verified</CollapsiblePanel>
        </Collapsible>

        <SankeyDiagram
          totalOpen={0}
          severityCounts={{ critical: 0, high: 0, medium: 0, low: 0, informational: 0 }}
          statusCounts={{ new: 0, triaged: 0, in_progress: 0 }}
          links={[]}
          selectedSeverity={selectedSev}
          onSelectSeverity={setSelectedSev}
        />

        <DailyTrendChart data={[]} />
        <CampaignActivityTimeline series={[]} />
        <BudgetSignalBars pct={84} />
        <UnifiedDiffViewer
          filePath="src/export.ts"
          unifiedDiff={'--- a/src/export.ts\n+++ b/src/export.ts\n@@ -1,2 +1,2 @@\n-allowAll()\n+enforceWorkspaceAcl()'}
        />

        <Card>
          <DataTable
            columns={[{ key: 'id', header: 'ID', cell: (r: { id: string }) => r.id }]}
            rows={[{ id: 'SEC-1034' }]}
            rowKey={(r) => r.id}
          />
        </Card>

        <MetadataRail ariaLabel="Test metadata">
          <MetadataField label="STATUS">Confirmed</MetadataField>
        </MetadataRail>

        <PromptInput value={promptVal} onValueChange={setPromptVal} autoFocusGlobal>
          <PromptInputTextarea aria-label="Prompt editor" />
          <PromptInputActions>
            <span>Actions ready</span>
          </PromptInputActions>
        </PromptInput>

        <DialogRoot open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent>
            <DialogTitle>Fix with Nightfall</DialogTitle>
            <DialogDescription>Hermetic patch verification</DialogDescription>
            <DialogClose id="test-close-drawer">Close Drawer</DialogClose>
          </DrawerContent>
        </DialogRoot>
      </div>
    </TooltipProvider>
  );
}

describe('@nightfall/ui-kit webclaw design system', () => {
  it('renders Base UI primitives, Hugeicons wrappers, prompt-kit, and zero-NaN visualizations cleanly', () => {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);

    act(() => {
      root!.render(<InteractiveKitHarness />);
    });

    expect(document.body.textContent).toContain('Primary Action');
    expect(document.body.textContent).toContain('Critical');
    expect(document.body.textContent).toContain('In Progress');
    expect(document.body.textContent).toContain('Fix with Nightfall');
    expect(document.body.textContent).toContain('84%');
    expect(hostEl.innerHTML).not.toContain('NaN');

    const critNode = hostEl.querySelector('#sankey-node-critical');
    expect(critNode).toBeTruthy();
    act(() => {
      critNode!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(hostEl.querySelector('#findings-sankey-focused')).toBeTruthy();
    expect(hostEl.innerHTML).not.toContain('NaN');

    const closeBtn = document.querySelector('#test-close-drawer') as HTMLElement | null;
    expect(closeBtn).toBeTruthy();
    act(() => {
      closeBtn!.click();
    });
  });
});
