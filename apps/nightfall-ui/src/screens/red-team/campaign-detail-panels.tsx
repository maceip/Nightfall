import React from 'react';
import type {
  EndpointHitRecord,
  FindingRecord,
  HitlApprovalRequest,
  RedTeamCampaignRun,
  WorkQueueItem,
} from '@nightfall/core-contracts';
import {
  Button,
  CampaignActivityTimeline,
  Card,
  DataTable,
  type DataTableColumn,
  SectionHeader,
  SeverityBadge,
  StatusBadge,
  TabsPanel,
} from '@nightfall/ui-kit';

export type CampaignDetailPanelsProps = {
  campaign: RedTeamCampaignRun;
  campaignFindings: FindingRecord[];
  pendingApprovals: HitlApprovalRequest[];
  endpointColumns: DataTableColumn<EndpointHitRecord>[];
  onSelectFindingReport: (finding: FindingRecord) => void;
  onResolveApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
};

export function CampaignDetailPanels({
  campaign,
  campaignFindings,
  pendingApprovals,
  endpointColumns,
  onSelectFindingReport,
  onResolveApproval,
}: CampaignDetailPanelsProps): React.ReactElement {
  const workColumns: DataTableColumn<WorkQueueItem>[] = [
    {
      key: 'hypothesis',
      header: 'Hypothesis',
      cell: (wq) => (
        <div>
          <div className="font-medium text-ink">{wq.hypothesis}</div>
          {wq.outcomeNote ? <div className="mt-0.5 text-xs text-primary-500">{wq.outcomeNote}</div> : null}
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (wq) => wq.category },
    { key: 'agent', header: 'Assigned Agent', cell: (wq) => <span className="font-mono text-xs">{wq.assignedAgent}</span> },
    { key: 'tier', header: 'Risk Tier', cell: (wq) => <span className="font-mono text-xs">{wq.riskTier}</span> },
    { key: 'status', header: 'Status', cell: (wq) => <StatusBadge status={wq.status} /> },
  ];

  const findingColumns: DataTableColumn<FindingRecord>[] = [
    { key: 'id', header: 'ID', className: 'w-24', cell: (f) => <span className="font-mono text-xs">{f.id}</span> },
    { key: 'severity', header: 'Severity', className: 'w-28', cell: (f) => <SeverityBadge severity={f.severity} /> },
    { key: 'title', header: 'Title', cell: (f) => <span className="font-medium text-ink">{f.title}</span> },
    { key: 'endpoint', header: 'Affected Endpoint', cell: (f) => <span className="font-mono text-xs text-primary-600">{f.affectedEndpoint ?? '—'}</span> },
  ];

  return (
    <>
      <TabsPanel value="activity" className="space-y-5 overflow-y-auto p-6">
        <Card className="p-5">
          <SectionHeader title="Campaign Request Telemetry & Confirmation Ticks" />
          <CampaignActivityTimeline series={campaign.activitySeries} />
        </Card>
        <DataTable
          columns={[
            { key: 'ts', header: 'Timestamp', cell: (pt) => <span className="font-mono text-xs">{pt.timestamp}</span> },
            { key: 'req', header: 'Requests', cell: (pt) => `${pt.requestsCount} reqs` },
            {
              key: 'tick',
              header: 'Signal',
              cell: (pt) =>
                pt.findingConfirmedTick ? (
                  <StatusBadge status="verified" label="Finding confirmed" />
                ) : (
                  <span className="text-xs text-primary-500">Scoped probe window</span>
                ),
            },
          ]}
          rows={campaign.activitySeries}
          rowKey={(pt, i) => `${pt.timestamp}-${i}`}
        />
      </TabsPanel>

      <TabsPanel value="work_queue" className="space-y-4 overflow-y-auto p-6">
        {pendingApprovals.map((app) => (
          <Card key={app.id} className="border-amber-300 bg-amber-50/80">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status="medium" label={`HITL Approval Required (${app.riskTier})`} />
                  <span className="font-semibold text-ink">{app.actionSummary}</span>
                </div>
                <div className="font-mono text-xs text-primary-700">{app.targetEndpoint}</div>
                <div className="text-xs text-primary-600">{app.rationale}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button id={`btn-approve-${app.id}`} size="sm" onClick={() => void onResolveApproval(app.id, 'approved')}>
                  Approve Probe
                </Button>
                <Button id={`btn-reject-${app.id}`} variant="outline" size="sm" onClick={() => void onResolveApproval(app.id, 'rejected')}>
                  Reject
                </Button>
              </div>
            </div>
          </Card>
        ))}
        <SectionHeader title="Parallel Agent Hypothesis Lease Queue" />
        <DataTable columns={workColumns} rows={campaign.workQueue} rowKey={(wq) => wq.id} />
      </TabsPanel>

      <TabsPanel value="shared_knowledge" className="space-y-3 overflow-y-auto p-6">
        <SectionHeader title="Persistent Cross-Agent Shared Memory (Surface, Flows & Negative Results)" />
        {campaign.sharedKnowledge.map((node) => (
          <Card key={node.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{node.title}</span>
              <StatusBadge status="proposed" label={node.kind} />
            </div>
            <p className="m-0 text-[13px] text-primary-700">{node.detail}</p>
            <div className="text-xs text-primary-500">
              Discovered by <span className="inline-code">{node.discoveredBy}</span>
              {node.sourceRef ? ` · Source: ${node.sourceRef}` : ''}
            </div>
          </Card>
        ))}
      </TabsPanel>

      <TabsPanel value="scope_coverage" className="space-y-5 overflow-y-auto p-6">
        <Card className="space-y-2.5">
          <SectionHeader title="Enforced L7 HTTP + WebSocket Scope (campaign.yaml v5)" />
          <pre className="m-0 overflow-x-auto rounded-lg border border-primary-200 bg-primary-50 p-3.5 font-mono text-xs text-ink">
            {campaign.yamlText}
          </pre>
        </Card>
        <SectionHeader title={`Covered Endpoints (${campaign.endpoints.length})`} />
        <DataTable columns={endpointColumns} rows={campaign.endpoints} rowKey={(ep, i) => `${ep.path}-${i}`} />
      </TabsPanel>

      <TabsPanel value="findings" className="space-y-3 overflow-y-auto p-6">
        <SectionHeader title={`Confirmed Campaign Findings (${campaignFindings.length})`} />
        <DataTable columns={findingColumns} rows={campaignFindings} rowKey={(f) => f.id} onRowClick={onSelectFindingReport} />
      </TabsPanel>
    </>
  );
}
