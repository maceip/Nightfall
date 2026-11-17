import React from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { Token } from '@astryxdesign/core/Token';
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
  DataTable,
  type DataTableColumn,
  SectionHeader,
  SeverityBadge,
  StatusBadge,
  TabsPanel,
  YamlCodeViewer,
  cn,
} from '@nightfall/ui-kit';

export function HttpMethodPill({
  method,
}: {
  method: EndpointHitRecord['method'];
}): React.ReactElement {
  const toneCls =
    method === 'POST'
      ? 'bg-status-mint text-status-mint-ink'
      : method === 'WS'
        ? 'bg-accent-violet-soft text-accent-violet'
        : method === 'PUT' || method === 'PATCH'
          ? 'bg-status-amber text-status-amber-ink'
          : method === 'DELETE'
            ? 'bg-status-danger text-status-danger-ink'
            : 'bg-pill text-ink-secondary';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold',
        toneCls,
      )}
    >
      {method}
    </span>
  );
}

export type CampaignDetailPanelsProps = {
  campaign: RedTeamCampaignRun;
  campaignFindings: FindingRecord[];
  pendingApprovals: HitlApprovalRequest[];
  onSelectFindingReport: (finding: FindingRecord) => void;
  onResolveApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
};

export function CampaignDetailPanels({
  campaign,
  campaignFindings,
  pendingApprovals,
  onSelectFindingReport,
  onResolveApproval,
}: CampaignDetailPanelsProps): React.ReactElement {
  const findingColumns: DataTableColumn<FindingRecord>[] = [
    {
      key: 'id',
      header: 'ID',
      className: 'w-28',
      cell: (f) => <span className="font-mono text-xs text-ink-secondary">{f.id}</span>,
    },
    {
      key: 'severity',
      header: 'Severity',
      className: 'w-28',
      cell: (f) => <SeverityBadge severity={f.severity} />,
    },
    {
      key: 'title',
      header: 'Confirmed Finding',
      cell: (f) => (
        <div>
          <div className="font-medium text-ink">{f.title}</div>
          <div className="mt-0.5 text-[12px] text-ink-muted">{f.subtitle}</div>
        </div>
      ),
    },
    {
      key: 'endpoint',
      header: 'Affected Endpoint',
      cell: (f) => (
        <span className="font-mono text-xs break-all text-ink-secondary">
          {f.affectedEndpoint ?? '—'}
        </span>
      ),
    },
  ];

  const endpointColumns: DataTableColumn<EndpointHitRecord>[] = [
    {
      key: 'method',
      header: 'Protocol / Method',
      className: 'w-28',
      cell: (ep) => <HttpMethodPill method={ep.method} />,
    },
    {
      key: 'path',
      header: 'Endpoint Path',
      cell: (ep) => <span className="font-mono text-[12.5px] break-all text-ink">{ep.path}</span>,
    },
    {
      key: 'auth',
      header: 'Credential Scope',
      className: 'w-40',
      cell: (ep) => <Token size="sm" label={ep.authScope} />,
    },
    {
      key: 'hits',
      header: 'Probes',
      className: 'w-28 text-right',
      cell: (ep) => (
        <span className="font-mono text-xs text-ink-secondary">
          {Number.isFinite(ep.hits) ? ep.hits : 0} hits
        </span>
      ),
    },
  ];

  const workColumns: DataTableColumn<WorkQueueItem>[] = [
    {
      key: 'hypothesis',
      header: 'Hypothesis',
      cell: (wq) => (
        <div>
          <div className="font-medium text-ink">{wq.hypothesis}</div>
          {wq.outcomeNote ? (
            <div className="mt-0.5 text-xs text-ink-muted">{wq.outcomeNote}</div>
          ) : null}
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (wq) => wq.category },
    {
      key: 'agent',
      header: 'Agent',
      cell: (wq) => <span className="font-mono text-xs text-ink-secondary">{wq.assignedAgent}</span>,
    },
    {
      key: 'tier',
      header: 'Risk Tier',
      cell: (wq) => <span className="font-mono text-xs text-ink-secondary">{wq.riskTier}</span>,
    },
    { key: 'status', header: 'Status', cell: (wq) => <StatusBadge status={wq.status} /> },
  ];

  const approvalCards =
    pendingApprovals.length > 0 ? (
      <div className="space-y-2.5">
        {pendingApprovals.map((app) => (
          <div
            key={app.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline-strong bg-status-amber px-4 py-3 text-status-amber-ink"
          >
            <div className="space-y-1">
              <HStack gap={2} align="center">
                <StatusBadge status="medium" label={`HITL Gate (${app.riskTier})`} />
                <span className="font-semibold text-ink">{app.actionSummary}</span>
              </HStack>
              <div className="font-mono text-xs text-ink">{app.targetEndpoint}</div>
              <div className="text-xs text-ink-secondary">{app.rationale}</div>
            </div>
            <HStack gap={2} align="center">
              <Button
                id={`btn-approve-${app.id}`}
                size="sm"
                onClick={() => void onResolveApproval(app.id, 'approved')}
              >
                Approve Probe
              </Button>
              <Button
                id={`btn-reject-${app.id}`}
                variant="outline"
                size="sm"
                onClick={() => void onResolveApproval(app.id, 'rejected')}
              >
                Reject
              </Button>
            </HStack>
          </div>
        ))}
      </div>
    ) : null;

  return (
    <>
      <TabsPanel value="findings" className="space-y-4 overflow-y-auto bg-canvas p-6">
        <SectionHeader
          title={`Confirmed Campaign Findings (${campaignFindings.length})`}
          subtitle="Select any finding to open its full exploit trace and minimal remediation patch."
        />
        <DataTable
          columns={findingColumns}
          rows={campaignFindings}
          rowKey={(f) => f.id}
          rowId={(f) => `rt-tab-finding-row-${f.id}`}
          onRowClick={onSelectFindingReport}
          emptyMessage="No findings confirmed yet."
        />
      </TabsPanel>

      <TabsPanel value="endpoints" className="space-y-5 overflow-y-auto bg-canvas p-6">
        <SectionHeader
          title={`Covered HTTP & WebSocket Endpoints (${campaign.endpoints.length})`}
          subtitle="Every request traverses EgressPolicyProxy under the active v5 scope manifest."
        />
        <DataTable
          columns={endpointColumns}
          rows={campaign.endpoints}
          rowKey={(ep, i) => `${ep.method}-${ep.path}-${i}`}
          emptyMessage="No endpoints probed yet."
        />
        <div className="rounded-2xl border border-hairline bg-canvas overflow-hidden">
          <div className="border-b border-hairline bg-sidebar px-4 py-2 font-mono text-xs font-medium text-ink-secondary">
            Enforced campaign.yaml (v5)
          </div>
          <YamlCodeViewer yamlText={campaign.yamlText} textareaId="textarea-readonly-scope-yaml" />
        </div>
      </TabsPanel>

      <TabsPanel value="activity" className="space-y-5 overflow-y-auto bg-canvas p-6">
        {approvalCards}
        <div className="rounded-2xl border border-hairline bg-canvas p-5">
          <SectionHeader title="Request Telemetry & Finding Confirmation Ticks" />
          <CampaignActivityTimeline series={campaign.activitySeries} />
        </div>
        <DataTable
          columns={[
            {
              key: 'ts',
              header: 'Window',
              cell: (pt) => <span className="font-mono text-xs text-ink">{pt.timestamp}</span>,
            },
            {
              key: 'req',
              header: 'Requests Sent',
              cell: (pt) => (
                <span className="font-mono text-xs text-ink-secondary">
                  {Number.isFinite(pt.requestsCount) ? pt.requestsCount : 0} reqs
                </span>
              ),
            },
            {
              key: 'tick',
              header: 'Verification Signal',
              cell: (pt) =>
                pt.findingConfirmedTick ? (
                  <StatusBadge status="verified" label="Finding confirmed" />
                ) : (
                  <span className="text-xs text-ink-muted">Scoped differential probe window</span>
                ),
            },
          ]}
          rows={campaign.activitySeries}
          rowKey={(pt, i) => `${pt.timestamp}-${i}`}
        />
      </TabsPanel>

      <TabsPanel value="work_queue" className="space-y-4 overflow-y-auto bg-canvas p-6">
        {approvalCards}
        <SectionHeader title="Parallel Agent Hypothesis Lease Queue" />
        <DataTable columns={workColumns} rows={campaign.workQueue} rowKey={(wq) => wq.id} />
      </TabsPanel>

      <TabsPanel value="shared_knowledge" className="space-y-3 overflow-y-auto bg-canvas p-6">
        <SectionHeader title="Persistent Cross-Agent Shared Memory" />
        {campaign.sharedKnowledge.map((node) => (
          <div key={node.id} className="space-y-1.5 rounded-2xl border border-hairline bg-canvas p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{node.title}</span>
              <StatusBadge status="proposed" label={node.kind} />
            </div>
            <p className="m-0 text-[13px] text-ink-secondary">{node.detail}</p>
            <div className="text-xs text-ink-muted">
              Discovered by <span className="inline-code">{node.discoveredBy}</span>
              {node.sourceRef ? ` · Source: ${node.sourceRef}` : ''}
            </div>
          </div>
        ))}
      </TabsPanel>
    </>
  );
}
