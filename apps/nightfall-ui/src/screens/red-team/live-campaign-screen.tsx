import React, { useState } from 'react';
import type {
  EndpointHitRecord,
  FindingRecord,
  HitlApprovalRequest,
  RedTeamCampaignRun,
} from '@nightfall/core-contracts';
import {
  BudgetSignalBars,
  Button,
  CampaignActivityTimeline,
  Card,
  DataTable,
  type DataTableColumn,
  RedTeamCampaignBadge,
  SectionHeader,
  SeverityBadge,
  ShieldCheckIcon,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  cn,
} from '@nightfall/ui-kit';
import { CampaignDetailPanels } from './campaign-detail-panels.js';

export type CampaignTab =
  | 'overview'
  | 'activity'
  | 'work_queue'
  | 'shared_knowledge'
  | 'scope_coverage'
  | 'findings';

export type LiveCampaignScreenProps = {
  campaign: RedTeamCampaignRun;
  campaignFindings: FindingRecord[];
  approvals: HitlApprovalRequest[];
  killSwitchEngaged: boolean;
  onSelectFindingReport: (finding: FindingRecord) => void;
  onResolveApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
  onOpenYamlBuilder: () => void;
};

function formatElapsed(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function LiveCampaignScreen({
  campaign,
  campaignFindings,
  approvals,
  killSwitchEngaged,
  onSelectFindingReport,
  onResolveApproval,
  onOpenYamlBuilder,
}: LiveCampaignScreenProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<CampaignTab>('overview');
  const [sevFilter, setSevFilter] = useState<string>('all');

  const visibleFindings = campaignFindings.filter(
    (f) => sevFilter === 'all' || f.severity === sevFilter,
  );
  const pendingApprovals = approvals.filter(
    (a) => a.campaignId === campaign.id && a.status === 'pending',
  );

  const endpointColumns: DataTableColumn<EndpointHitRecord>[] = [
    { key: 'method', header: 'Method', className: 'w-20', cell: (ep) => <span className="font-mono text-xs font-medium text-primary-700">{ep.method}</span> },
    { key: 'path', header: 'Endpoint Path', cell: (ep) => <span className="font-mono text-xs break-all text-ink">{ep.path}</span> },
    { key: 'auth', header: 'Auth Scope', className: 'w-36', cell: (ep) => <span className="text-xs text-primary-600">{ep.authScope}</span> },
    { key: 'hits', header: 'Hits', className: 'w-24 text-right', cell: (ep) => <span className="text-primary-700">{ep.hits} hits</span> },
  ];

  return (
    <div id="view-redteam-live-workspace" className="flex min-h-0 flex-1 flex-col overflow-hidden tabular-nums">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-200 bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <RedTeamCampaignBadge size={30} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-ink">{campaign.name}</span>
              <Button id="btn-view-campaign-yaml" variant="outline" size="sm" onClick={onOpenYamlBuilder}>
                campaign.yaml
              </Button>
            </div>
            <div className="mt-0.5 text-xs text-primary-600">
              {campaign.targetUrl} · {campaign.objective}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <BudgetSignalBars pct={campaign.budgetRemainingPct} />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs">
            <span className={cn('size-2 rounded-full', killSwitchEngaged ? 'bg-rose-600' : 'bg-emerald-600')} />
            <span className="font-semibold text-ink">{killSwitchEngaged ? 'Halted' : 'In progress'}</span>
            <span className="font-mono text-primary-600">{formatElapsed(campaign.elapsedSeconds)}</span>
          </span>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as CampaignTab)}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList aria-label="Red Team campaign tabs">
          <TabsTab id="rt-tab-overview" value="overview">Overview</TabsTab>
          <TabsTab id="rt-tab-activity" value="activity">Activity</TabsTab>
          <TabsTab id="rt-tab-work_queue" value="work_queue">
            Work queue{pendingApprovals.length ? ` (${pendingApprovals.length} gate)` : ''}
          </TabsTab>
          <TabsTab id="rt-tab-shared_knowledge" value="shared_knowledge">Shared knowledge</TabsTab>
          <TabsTab id="rt-tab-scope_coverage" value="scope_coverage">Scope &amp; coverage</TabsTab>
          <TabsTab id="rt-tab-findings" value="findings">Findings {campaignFindings.length}</TabsTab>
        </TabsList>

        <TabsPanel value="overview" className="space-y-6 overflow-y-auto p-6">
          <Card className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[1fr_420px]">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-ink">
                <span className="size-2 rounded-full bg-emerald-600" />
                <span>{campaign.headlineStatus}</span>
              </div>
              <p className="m-0 text-[13.5px] text-primary-700">{campaign.headlineDetail}</p>
              <div className="text-xs text-primary-500">{campaign.updatedLabel}</div>
            </div>
            <CampaignActivityTimeline series={campaign.activitySeries} />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <SectionHeader
                title="Investigation findings"
                actions={
                  <>
                    <select
                      id="select-rt-findings-sev"
                      value={sevFilter}
                      onChange={(e) => setSevFilter(e.target.value)}
                      className="h-7 rounded-md border border-primary-200 bg-primary-50 px-2 text-xs font-medium text-ink"
                    >
                      <option value="all">All severities</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('findings')}>
                      View all findings →
                    </Button>
                  </>
                }
              />
              <DataTable
                columns={[
                  { key: 'sev', header: 'Severity', className: 'w-24', cell: (f) => <SeverityBadge severity={f.severity} /> },
                  { key: 'title', header: 'Finding', cell: (f) => <span className="font-medium text-ink">{f.title}</span> },
                ]}
                rows={visibleFindings}
                rowKey={(f) => f.id}
                rowId={(f) => `rt-finding-row-${f.id}`}
                onRowClick={onSelectFindingReport}
                emptyMessage="No findings confirmed yet."
              />
            </div>

            <div>
              <SectionHeader
                title="Endpoints"
                actions={
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('scope_coverage')}>
                    View all endpoints →
                  </Button>
                }
              />
              <DataTable
                columns={endpointColumns.filter((c) => c.key !== 'auth')}
                rows={campaign.endpoints}
                rowKey={(ep, i) => `${ep.method}-${ep.path}-${i}`}
              />
            </div>
          </div>
        </TabsPanel>

        <CampaignDetailPanels
          campaign={campaign}
          campaignFindings={campaignFindings}
          pendingApprovals={pendingApprovals}
          endpointColumns={endpointColumns}
          onSelectFindingReport={onSelectFindingReport}
          onResolveApproval={onResolveApproval}
        />
      </Tabs>

      <footer
        id="redteam-safety-monitor"
        className="flex shrink-0 items-center justify-between gap-3 border-t border-primary-200 bg-primary-50 px-6 py-2.5 text-xs text-primary-700"
      >
        <div className="flex items-center gap-2">
          <ShieldCheckIcon size={16} className="text-emerald-700" />
          <span className="font-semibold text-ink">Safety monitor</span>
          <span>{campaign.safetyMonitorText}</span>
        </div>
        <span className="text-primary-500">{campaign.updatedLabel}</span>
      </footer>
    </div>
  );
}
