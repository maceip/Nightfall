import React, { useMemo, useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import type {
  EndpointHitRecord,
  FindingRecord,
  HitlApprovalRequest,
  RedTeamCampaignRun,
} from '@nightfall/core-contracts';
import {
  BudgetSignalBars, Button, CampaignActivityTimeline, DataTable, type DataTableColumn,
  FileCodeIcon, RedTeamCampaignBadge, SeverityBadge, ShieldCheckIcon, Tabs, TabsList,
  TabsPanel, TabsTab,
} from '@nightfall/ui-kit';
import { CampaignDetailPanels, HttpMethodPill } from './campaign-detail-panels.js';

export type CampaignTab =
  | 'overview'
  | 'findings'
  | 'endpoints'
  | 'activity'
  | 'work_queue'
  | 'shared_knowledge';

export type LiveCampaignScreenProps = {
  campaign: RedTeamCampaignRun;
  campaigns?: RedTeamCampaignRun[];
  campaignFindings: FindingRecord[];
  approvals: HitlApprovalRequest[];
  killSwitchEngaged: boolean;
  onSelectCampaign?: (campaignId: string) => void;
  onSelectFindingReport: (finding: FindingRecord) => void;
  onResolveApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
  onOpenYamlBuilder: () => void;
  onToggleKillSwitch?: () => void;
};

export function deriveCampaignStatus(
  campaign: RedTeamCampaignRun,
  killSwitchEngaged: boolean,
): { label: string; dotVariant: 'success' | 'warning' | 'error' | 'neutral'; isPulsing: boolean } {
  if (killSwitchEngaged || campaign.status === 'halted') {
    return { label: 'Halted', dotVariant: 'error', isPulsing: false };
  }
  if (campaign.status === 'paused_hitl') {
    return { label: 'Awaiting approval', dotVariant: 'warning', isPulsing: false };
  }
  if (campaign.status === 'running') {
    return { label: 'In progress', dotVariant: 'success', isPulsing: true };
  }
  if (campaign.status === 'completed') {
    return { label: 'Completed', dotVariant: 'neutral', isPulsing: false };
  }
  return { label: 'Draft', dotVariant: 'neutral', isPulsing: false };
}

function formatElapsed(rawSeconds: number): string {
  const safe = Number.isFinite(rawSeconds) && rawSeconds > 0 ? Math.floor(rawSeconds) : 0;
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hrs > 0
    ? `${hrs}h ${mins}m ${String(secs).padStart(2, '0')}s`
    : `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function formatStartedLabel(isoString: string): string {
  const ms = Date.parse(isoString);
  if (!Number.isFinite(ms)) return isoString;
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function LiveCampaignScreen({
  campaign,
  campaigns = [],
  campaignFindings,
  approvals,
  killSwitchEngaged,
  onSelectCampaign,
  onSelectFindingReport,
  onResolveApproval,
  onOpenYamlBuilder,
}: LiveCampaignScreenProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<CampaignTab>('overview');
  const [sevFilter, setSevFilter] = useState<string>('all');

  const statusInfo = useMemo(
    () => deriveCampaignStatus(campaign, killSwitchEngaged),
    [campaign, killSwitchEngaged],
  );
  const visibleFindings = useMemo(
    () => campaignFindings.filter((f) => sevFilter === 'all' || f.severity === sevFilter),
    [campaignFindings, sevFilter],
  );
  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.campaignId === campaign.id && a.status === 'pending'),
    [approvals, campaign.id],
  );
  const totalRequests = useMemo(
    () => campaign.activitySeries.reduce((acc, pt) => acc + (Number.isFinite(pt.requestsCount) ? pt.requestsCount : 0), 0),
    [campaign.activitySeries],
  );

  const overviewFindingColumns: DataTableColumn<FindingRecord>[] = [
    { key: 'sev', header: 'Severity', className: 'w-24 pl-5', cell: (f) => <SeverityBadge severity={f.severity} /> },
    { key: 'title', header: 'Finding', className: 'pr-5', cell: (f) => <span className="font-medium text-ink">{f.title}</span> },
  ];

  const overviewEndpointColumns: DataTableColumn<EndpointHitRecord>[] = [
    { key: 'method', header: 'Method', className: 'w-16 pl-5', cell: (ep) => <HttpMethodPill method={ep.method} /> },
    { key: 'path', header: 'Path', cell: (ep) => <span className="font-mono text-[12.5px] break-all text-ink">{ep.path}</span> },
    {
      key: 'hits',
      header: 'Hits',
      className: 'w-24 pr-5 text-right',
      cell: (ep) => <span className="text-[12.5px] text-ink-secondary">{Number.isFinite(ep.hits) ? ep.hits : 0} hits</span>,
    },
  ];

  const firstTick = campaign.activitySeries[0]?.timestamp ?? 'Window start';
  const lastTick = campaign.activitySeries[campaign.activitySeries.length - 1]?.timestamp ?? 'Latest tick';
  const findingsRange = visibleFindings.length === 0 ? '0 findings' : `1–${visibleFindings.length} of ${visibleFindings.length}`;
  const endpointsRange = campaign.endpoints.length === 0 ? '0 endpoints' : `1–${campaign.endpoints.length} of ${campaign.endpoints.length}`;

  return (
    <div id="view-redteam-live-workspace" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas tabular-nums">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 bg-canvas px-6 pt-4 pb-2.5">
        <HStack gap={3} align="center">
          <RedTeamCampaignBadge size={26} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-ink">{campaign.name}</span>
              {campaigns.length > 1 && onSelectCampaign ? (
                <select
                  id="select-active-campaign"
                  aria-label="Switch active Red Team campaign"
                  value={campaign.id}
                  onChange={(e) => onSelectCampaign(e.target.value)}
                  className="h-6 rounded-full border border-hairline-strong bg-sidebar px-2.5 text-[11.5px] font-medium text-ink outline-none cursor-pointer"
                >
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : null}
              <button
                id="btn-view-campaign-yaml"
                type="button"
                title="Inspect campaign.yaml v5 manifest"
                onClick={onOpenYamlBuilder}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-hairline-strong bg-canvas px-2.5 font-mono text-[11.5px] font-medium text-ink-secondary transition-colors hover:bg-sidebar hover:text-ink cursor-pointer"
              >
                <FileCodeIcon size={12} />
                <span>campaign.yaml</span>
              </button>
            </div>
            <div className="mt-0.5 text-[12px] text-ink-muted">
              {formatStartedLabel(campaign.startedAt)} · {campaign.targetUrl}
            </div>
          </div>
        </HStack>

        <HStack gap={4} align="center">
          <BudgetSignalBars pct={campaign.budgetRemainingPct} />
          <span className="inline-flex items-center gap-2 rounded-full bg-pill px-3 py-1 text-[12.5px]">
            <StatusDot variant={statusInfo.dotVariant} isPulsing={statusInfo.isPulsing} label={statusInfo.label} />
            <span className="font-semibold text-ink">{statusInfo.label}</span>
            <span className="font-mono text-[12px] text-ink-secondary">{formatElapsed(campaign.elapsedSeconds)}</span>
          </span>
        </HStack>
      </header>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as CampaignTab)} className="min-h-0 flex-1 overflow-hidden bg-canvas">
        <TabsList aria-label="Red Team campaign tabs" className="border-b border-hairline bg-canvas px-6">
          <TabsTab id="rt-tab-overview" value="overview">Overview</TabsTab>
          <TabsTab id="rt-tab-findings" value="findings">
            <span>Findings</span>
            <span className="rounded-full bg-pill px-1.5 py-0.5 text-[11px] font-semibold text-ink-secondary">{campaignFindings.length}</span>
          </TabsTab>
          <TabsTab id="rt-tab-endpoints" value="endpoints">Endpoints</TabsTab>
          <TabsTab id="rt-tab-activity" value="activity">Activity</TabsTab>
          <TabsTab id="rt-tab-work_queue" value="work_queue">
            Work queue{pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ''}
          </TabsTab>
          <TabsTab id="rt-tab-shared_knowledge" value="shared_knowledge">Shared knowledge</TabsTab>
        </TabsList>

        <TabsPanel value="overview" className="flex flex-col overflow-y-auto bg-canvas p-0">
          <div className="grid grid-cols-1 gap-6 border-b border-hairline bg-canvas px-6 py-5 lg:grid-cols-[1fr_460px]">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink">
                <StatusDot variant={statusInfo.dotVariant} isPulsing={statusInfo.isPulsing} label={statusInfo.label} />
                <span>{campaign.headlineStatus || 'Confirmed cross-tenant finding'}</span>
              </div>
              <p className="m-0 text-[13.5px] text-ink-secondary">{campaign.headlineDetail}</p>
              <div className="text-[12px] text-ink-muted">{campaign.updatedLabel} · {totalRequests} scoped requests sent</div>
            </div>
            <CampaignActivityTimeline series={campaign.activitySeries} startLabel={firstTick} endLabel={lastTick} />
          </div>

          <div className="grid flex-1 grid-cols-1 divide-y divide-hairline border-b border-hairline bg-canvas lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="flex flex-col justify-between bg-canvas">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3">
                  <h2 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-ink">Investigation findings</h2>
                  <div className="flex items-center gap-3">
                    <select
                      id="select-rt-findings-sev"
                      aria-label="Filter investigation findings by severity"
                      value={sevFilter}
                      onChange={(e) => setSevFilter(e.target.value)}
                      className="h-7 rounded-full border border-hairline-strong bg-canvas px-2.5 text-[12px] font-medium text-ink outline-none cursor-pointer"
                    >
                      <option value="all">All severities</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveTab('findings')}
                      className="text-[12.5px] font-medium text-ink-secondary transition-colors hover:text-ink cursor-pointer"
                    >
                      View all findings →
                    </button>
                  </div>
                </div>
                <DataTable
                  hideHeader
                  columns={overviewFindingColumns}
                  rows={visibleFindings}
                  rowKey={(f) => f.id}
                  rowId={(f) => `rt-finding-row-${f.id}`}
                  onRowClick={onSelectFindingReport}
                  emptyMessage="No findings yet."
                  footer={<><span>{findingsRange}</span><span>Page 1</span></>}
                />
              </div>
            </div>

            <div className="flex flex-col justify-between bg-canvas">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3">
                  <h2 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-ink">Endpoints</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('endpoints')}
                    className="text-[12.5px] font-medium text-ink-secondary transition-colors hover:text-ink cursor-pointer"
                  >
                    View all endpoints →
                  </button>
                </div>
                <DataTable
                  hideHeader
                  columns={overviewEndpointColumns}
                  rows={campaign.endpoints}
                  rowKey={(ep, i) => `${ep.method}-${ep.path}-${i}`}
                  emptyMessage="No endpoints probed yet."
                  footer={<><span>{endpointsRange}</span><span>Page 1 of 1</span></>}
                />
              </div>
            </div>
          </div>
        </TabsPanel>

        <CampaignDetailPanels
          campaign={campaign}
          campaignFindings={campaignFindings}
          pendingApprovals={pendingApprovals}
          onSelectFindingReport={onSelectFindingReport}
          onResolveApproval={onResolveApproval}
        />
      </Tabs>

      <footer
        id="redteam-safety-monitor"
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-hairline bg-sidebar px-6 py-3 text-[12.5px] text-ink-secondary"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheckIcon size={16} className="text-ink-secondary" />
          <span className="font-semibold text-ink">Safety monitor</span>
          <span>{campaign.safetyMonitorText}</span>
          <span className="text-ink-muted">
            · Within approved v5 scope · Microsoft LiteBox isolated · {pendingApprovals.length} HITL gates
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pendingApprovals[0] ? (
            <>
              <Button id={`btn-footer-approve-${pendingApprovals[0].id}`} size="sm" className="h-6 px-2.5 text-[11.5px]" onClick={() => void onResolveApproval(pendingApprovals[0]!.id, 'approved')}>
                Approve HITL
              </Button>
              <Button id={`btn-footer-reject-${pendingApprovals[0].id}`} variant="outline" size="sm" className="h-6 px-2.5 text-[11.5px]" onClick={() => void onResolveApproval(pendingApprovals[0]!.id, 'rejected')}>
                Reject
              </Button>
            </>
          ) : null}
          <span className="text-ink-muted">{campaign.updatedLabel}</span>
        </div>
      </footer>
    </div>
  );
}
