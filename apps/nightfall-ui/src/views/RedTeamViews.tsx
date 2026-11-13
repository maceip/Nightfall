import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Download,
  Folder,
  Globe,
  Hand,
  Plus,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import type {
  EvidenceBundle,
  FindingRecord,
  HitlApprovalRequest,
  ModelDescriptor,
  RedTeamCampaignRun,
} from '@nightfall/core-contracts';
import {
  BudgetSignalBars,
  CampaignActivityTimeline,
  RedTeamCampaignBadge,
  UnifiedDiffViewer,
} from '@nightfall/ui-kit';
import { SeverityPill, StatusPill } from './DefenseFactoryViews.js';

export type RedTeamStage = 'composer' | 'yaml-builder' | 'live-campaign' | 'finding-report';
export type CampaignTab =
  | 'overview'
  | 'activity'
  | 'work_queue'
  | 'shared_knowledge'
  | 'scope_coverage'
  | 'findings';

function formatElapsed(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function RedTeamComposerView({
  models,
  onPrepareCampaign,
  onJumpToActiveCampaign,
}: {
  models: ModelDescriptor[];
  onPrepareCampaign: (input: {
    prompt: string;
    targetUrl: string;
    sourceLabel: string;
    askForApproval: boolean;
    modelId: string;
  }) => Promise<void>;
  onJumpToActiveCampaign: () => void;
}): React.ReactElement {
  const [targetUrl, setTargetUrl] = useState('https://staging.northstardocs.com');
  const [prompt, setPrompt] = useState(
    'Use Nightfall Red Team to assess: https://staging.northstardocs.com',
  );
  const [askForApproval, setAskForApproval] = useState(true);
  const [modelId, setModelId] = useState(models[0]?.id ?? 'gpt-6-cyber-ultra');

  return (
    <div className="nf-composer-stage" id="view-redteam-composer">
      <div className="nf-composer-hero">
        <Terminal size={36} color="#9ca3af" />
        <h1>
          What should we work on in <u style={{ textDecorationStyle: 'dotted' }}>Northstar Docs</u>?
        </h1>
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            id="btn-open-running-campaign"
            className="nf-btn-outline"
            onClick={onJumpToActiveCampaign}
          >
            View active campaign: northstar-docs-staging (9 findings) →
          </button>
        </div>
      </div>

      <div className="nf-composer-shell">
        <div className="nf-composer-context-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Globe size={14} color="#16a34a" />
              <strong>Northstar staging</strong>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Folder size={14} color="#4b5563" />
              <span>Northstar Docs</span>
            </span>
          </div>
          <span className="nf-mono" style={{ fontSize: 11.5, color: '#6b7280' }}>
            Isolated Disposable Sandbox
          </span>
        </div>

        <div className="nf-composer-box">
          <textarea
            id="textarea-redteam-prompt"
            className="nf-composer-textarea"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              const urlMatch = /https?:\/\/[^\s]+/.exec(e.target.value);
              if (urlMatch?.[0]) setTargetUrl(urlMatch[0]);
            }}
          />
          <div className="nf-composer-controls">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" className="nf-icon-btn" title="Attach source archive or test tokens">
                <Plus size={16} />
              </button>
              <button
                type="button"
                id="btn-toggle-ask-approval"
                className="nf-btn-outline"
                style={{
                  height: 28,
                  padding: '0 10px',
                  fontSize: 12,
                  background: askForApproval ? '#eef2ff' : '#ffffff',
                  borderColor: askForApproval ? '#6366f1' : '#d0d5dd',
                }}
                onClick={() => setAskForApproval((v) => !v)}
              >
                <Hand size={13} />
                <span>{askForApproval ? 'Ask for approval' : 'Auto within Tier 1'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                id="select-redteam-model"
                className="nf-repo-pill-select"
                style={{ height: 29, fontSize: 12.5 }}
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                id="btn-prepare-campaign"
                className="nf-send-circle"
                aria-label="Prepare campaign.yaml"
                onClick={() =>
                  onPrepareCampaign({
                    prompt,
                    targetUrl,
                    sourceLabel: 'northstar-docs-source.tar.gz',
                    askForApproval,
                    modelId,
                  })
                }
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CampaignYamlSplitView({
  campaign,
  yamlDraft,
  onChangeYaml,
  onLaunchCampaign,
}: {
  campaign: RedTeamCampaignRun;
  yamlDraft: string;
  onChangeYaml: (next: string) => void;
  onLaunchCampaign: () => Promise<void>;
}): React.ReactElement {
  const handleDownloadYaml = () => {
    const blob = new Blob([yamlDraft], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaign.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="nf-split-yaml-view" id="view-campaign-yaml-builder">
      <div className="nf-thread-pane">
        <div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
            Today · Nightfall Red Team
          </div>
          <div className="nf-user-bubble">
            Use <strong>Nightfall Red Team</strong> to assess: {campaign.targetUrl}
          </div>
          <p className="nf-prose-p" style={{ fontSize: 13.5 }}>
            I&apos;ve prepared <span className="nf-code-link">campaign.yaml</span> for{' '}
            <strong>{campaign.name}</strong>, using the attached source archive and synthetic bearer
            token files for Alice and Bob.
          </p>
          <p className="nf-prose-p" style={{ fontSize: 13.5 }}>
            It enforces strict L7 proxy rules covering HTTP (<code>GET</code>, <code>POST</code>) and
            WebSocket (<code>/ws/documents</code>), with an 8-hour duration ceiling and up to 10
            requests per second.
          </p>
        </div>

        <div className="nf-composer-box" style={{ padding: 12 }}>
          <div style={{ fontSize: 13.5, marginBottom: 10 }}>Launch the campaign.</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {campaign.askForApproval ? 'Ask-for-approval gate active' : 'Tier 1 scope locked'}
            </span>
            <button
              type="button"
              id="btn-launch-campaign"
              className="nf-send-circle"
              title="Sign ScopeManifest & launch campaign"
              onClick={onLaunchCampaign}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="nf-yaml-pane">
        <div className="nf-yaml-header">
          <strong className="nf-mono">campaign.yaml</strong>
          <button
            type="button"
            id="btn-download-v5-yaml"
            className="nf-btn-outline"
            style={{ height: 29, fontSize: 12 }}
            onClick={handleDownloadYaml}
          >
            <Download size={13} />
            <span>Download v5 YAML</span>
          </button>
        </div>
        <textarea
          id="textarea-campaign-yaml"
          className="nf-yaml-editor"
          value={yamlDraft}
          onChange={(e) => onChangeYaml(e.target.value)}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function LiveCampaignWorkspaceView({
  campaign,
  campaignFindings,
  approvals,
  killSwitchEngaged,
  onSelectFindingReport,
  onResolveApproval,
  onOpenYamlBuilder,
}: {
  campaign: RedTeamCampaignRun;
  campaignFindings: FindingRecord[];
  approvals: HitlApprovalRequest[];
  killSwitchEngaged: boolean;
  onSelectFindingReport: (finding: FindingRecord) => void;
  onResolveApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
  onOpenYamlBuilder: () => void;
}): React.ReactElement {
  const [activeTab, setActiveTab] = useState<CampaignTab>('overview');
  const [sevFilter, setSevFilter] = useState<string>('all');

  const visibleFindings = campaignFindings.filter(
    (f) => sevFilter === 'all' || f.severity === sevFilter,
  );
  const pendingApprovals = approvals.filter(
    (a) => a.campaignId === campaign.id && a.status === 'pending',
  );

  return (
    <div className="nf-rt-workspace" id="view-redteam-live-workspace">
      <header className="nf-rt-header">
        <div className="nf-rt-target-group">
          <RedTeamCampaignBadge size={30} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 16 }}>{campaign.name}</strong>
              <button
                type="button"
                id="btn-view-campaign-yaml"
                className="nf-btn-outline"
                style={{ height: 24, padding: '0 8px', fontSize: 11.5 }}
                onClick={onOpenYamlBuilder}
              >
                campaign.yaml
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {campaign.targetUrl} · {campaign.objective}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BudgetSignalBars pct={campaign.budgetRemainingPct} />
          <span className="nf-live-indicator">
            <i className={killSwitchEngaged ? 'nf-dot-red' : 'nf-dot-green'} />
            <strong>{killSwitchEngaged ? 'Halted' : 'In progress'}</strong>
            <span className="nf-mono">{formatElapsed(campaign.elapsedSeconds)}</span>
          </span>
        </div>
      </header>

      <nav className="nf-rt-tabs" aria-label="Red Team campaign tabs">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'activity', label: 'Activity' },
            {
              id: 'work_queue',
              label: `Work queue${pendingApprovals.length ? ` (${pendingApprovals.length} gate)` : ''}`,
            },
            { id: 'shared_knowledge', label: 'Shared knowledge' },
            { id: 'scope_coverage', label: 'Scope & coverage' },
            { id: 'findings', label: `Findings ${campaignFindings.length}` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            id={`rt-tab-${t.id}`}
            className={activeTab === t.id ? 'nf-rt-tab active' : 'nf-rt-tab'}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <>
          <section className="nf-rt-status-band">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 650 }}>
                <i className="nf-dot-green" />
                <span>{campaign.headlineStatus}</span>
              </div>
              <p style={{ margin: '6px 0 4px', color: '#374151', fontSize: 13.5 }}>
                {campaign.headlineDetail}
              </p>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{campaign.updatedLabel}</span>
            </div>
            <CampaignActivityTimeline series={campaign.activitySeries} />
          </section>

          <section className="nf-rt-lower-split">
            <div className="nf-rt-split-col">
              <div className="nf-section-header-row">
                <h2 className="nf-section-heading">Investigation findings</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    id="select-rt-findings-sev"
                    className="nf-repo-pill-select"
                    style={{ height: 29, fontSize: 12.5 }}
                    value={sevFilter}
                    onChange={(e) => setSevFilter(e.target.value)}
                  >
                    <option value="all">All severities</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <button
                    type="button"
                    className="nf-icon-btn"
                    style={{ width: 'auto', padding: '0 6px', fontSize: 12.5 }}
                    onClick={() => setActiveTab('findings')}
                  >
                    View all findings →
                  </button>
                </div>
              </div>

              {visibleFindings.length === 0 ? (
                <div style={{ padding: '48px 0', textAlign: 'center', fontWeight: 600 }}>
                  No findings yet.
                </div>
              ) : (
                <table className="nf-table">
                  <tbody>
                    {visibleFindings.map((f) => (
                      <tr
                        key={f.id}
                        id={`rt-finding-row-${f.id}`}
                        className="clickable-row"
                        onClick={() => onSelectFindingReport(f)}
                      >
                        <td style={{ width: 78, paddingLeft: 0 }}>
                          <SeverityPill severity={f.severity} />
                        </td>
                        <td>
                          <div className="nf-row-title">{f.title}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>
                1–{visibleFindings.length} of {visibleFindings.length} findings
              </div>
            </div>

            <div className="nf-rt-split-col">
              <div className="nf-section-header-row">
                <h2 className="nf-section-heading">Endpoints</h2>
                <button
                  type="button"
                  className="nf-icon-btn"
                  style={{ width: 'auto', padding: '0 6px', fontSize: 12.5 }}
                  onClick={() => setActiveTab('scope_coverage')}
                >
                  View all endpoints →
                </button>
              </div>
              <table className="nf-table">
                <tbody>
                  {campaign.endpoints.map((ep, idx) => (
                    <tr key={idx}>
                      <td className="nf-mono" style={{ width: 58, color: '#4b5563', paddingLeft: 0 }}>
                        {ep.method}
                      </td>
                      <td className="nf-mono" style={{ wordBreak: 'break-all' }}>
                        {ep.path}
                      </td>
                      <td
                        style={{
                          width: 78,
                          textAlign: 'right',
                          color: '#4b5563',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {ep.hits} hits
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>
                1–{campaign.endpoints.length} of 24 endpoints
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'work_queue' ? (
        <div className="nf-scroll-canvas">
          {pendingApprovals.map((app) => (
            <div
              key={app.id}
              className="nf-card"
              style={{ borderColor: '#f59e0b', background: '#fffbeb', marginBottom: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="nf-pill sev-medium" style={{ marginRight: 8 }}>
                    HITL Approval Required ({app.riskTier})
                  </span>
                  <strong>{app.actionSummary}</strong>
                  <div className="nf-mono" style={{ fontSize: 12, marginTop: 4, color: '#4b5563' }}>
                    {app.targetEndpoint}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 4 }}>
                    {app.rationale}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    id={`btn-approve-${app.id}`}
                    className="nf-btn-dark"
                    onClick={() => onResolveApproval(app.id, 'approved')}
                  >
                    Approve Probe
                  </button>
                  <button
                    type="button"
                    id={`btn-reject-${app.id}`}
                    className="nf-btn-outline"
                    onClick={() => onResolveApproval(app.id, 'rejected')}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}

          <h2 className="nf-section-heading" style={{ marginBottom: 12 }}>
            Parallel Agent Hypothesis Lease Queue
          </h2>
          <table className="nf-table">
            <thead>
              <tr>
                <th>Hypothesis</th>
                <th>Category</th>
                <th>Assigned Agent</th>
                <th>Risk Tier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {campaign.workQueue.map((wq) => (
                <tr key={wq.id}>
                  <td>
                    <div className="nf-row-title">{wq.hypothesis}</div>
                    {wq.outcomeNote ? <div className="nf-row-subtitle">{wq.outcomeNote}</div> : null}
                  </td>
                  <td>{wq.category}</td>
                  <td className="nf-mono">{wq.assignedAgent}</td>
                  <td className="nf-mono">{wq.riskTier}</td>
                  <td>
                    <StatusPill
                      status={wq.status === 'confirmed' ? 'confirmed' : 'in_progress'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === 'shared_knowledge' ? (
        <div className="nf-scroll-canvas">
          <h2 className="nf-section-heading" style={{ marginBottom: 12 }}>
            Persistent Cross-Agent Shared Memory (Surface, Flows &amp; Negative Results)
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {campaign.sharedKnowledge.map((node) => (
              <div key={node.id} className="nf-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong>{node.title}</strong>
                  <span className="nf-pill status-proposed">{node.kind}</span>
                </div>
                <p style={{ margin: '0 0 6px', color: '#374151' }}>{node.detail}</p>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Discovered by <code>{node.discoveredBy}</code>
                  {node.sourceRef ? ` · Source: ${node.sourceRef}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === 'activity' || activeTab === 'scope_coverage' || activeTab === 'findings' ? (
        <div className="nf-scroll-canvas">
          {activeTab === 'scope_coverage' ? (
            <div className="nf-card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginTop: 0 }}>Enforced L7 HTTP + WebSocket Scope (`campaign.yaml` v5)</h3>
              <pre className="nf-mono" style={{ background: '#f8f9fa', padding: 14, borderRadius: 10 }}>
                {campaign.yamlText}
              </pre>
            </div>
          ) : null}
          <h3 style={{ marginTop: 0 }}>Confirmed Campaign Findings ({campaignFindings.length})</h3>
          <table className="nf-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Severity</th>
                <th>Title</th>
                <th>Affected Endpoint</th>
              </tr>
            </thead>
            <tbody>
              {campaignFindings.map((f) => (
                <tr
                  key={f.id}
                  className="clickable-row"
                  onClick={() => onSelectFindingReport(f)}
                >
                  <td className="nf-mono">{f.id}</td>
                  <td>
                    <SeverityPill severity={f.severity} />
                  </td>
                  <td style={{ fontWeight: 600 }}>{f.title}</td>
                  <td className="nf-mono">{f.affectedEndpoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <footer className="nf-safety-monitor-bar" id="redteam-safety-monitor">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={16} color="#15803d" />
          <strong>Safety monitor</strong>
          <span>{campaign.safetyMonitorText}</span>
        </div>
        <span>{campaign.updatedLabel}</span>
      </footer>
    </div>
  );
}

export function RedTeamFindingReportView({
  finding,
  evidence,
  onBackToCampaign,
  onPromoteToDefenseFactory,
}: {
  finding: FindingRecord;
  evidence?: EvidenceBundle;
  onBackToCampaign: () => void;
  onPromoteToDefenseFactory: (finding: FindingRecord) => void;
}): React.ReactElement {
  return (
    <div id={`view-rt-report-${finding.id}`} className="nf-detail-layout">
      <div>
        <button
          type="button"
          id="btn-back-rt-overview"
          className="nf-icon-btn"
          style={{ width: 'auto', padding: '0 8px', gap: 6, marginBottom: 14 }}
          onClick={onBackToCampaign}
        >
          <ArrowLeft size={15} />
          <span>Overview</span>
        </button>

        <h1 className="nf-detail-h1">{finding.title}</h1>
        <p className="nf-detail-sub">{finding.subtitle}</p>

        <h2 id="sec-summary" style={{ fontSize: 19, margin: '22px 0 10px' }}>
          Summary
        </h2>
        <p className="nf-prose-p">{finding.summary}</p>
        {evidence?.artifactJson ? (
          <p>
            <a href="#sec-evidence" className="nf-code-link">
              See the private document verification marker in the downloaded ZIP ↓
            </a>
          </p>
        ) : null}

        <h2 id="sec-architecture" style={{ fontSize: 19, margin: '26px 0 10px' }}>
          Architecture
        </h2>
        <p className="nf-prose-p">{finding.architectureNotes ?? finding.rootCause}</p>
        {finding.codeReferences.length > 0 ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {finding.codeReferences.map((ref, idx) => (
              <span key={idx} className="nf-code-link">
                {ref.file}:{ref.startLine}–{ref.endLine}
              </span>
            ))}
          </div>
        ) : null}

        <h2 id="sec-defects" style={{ fontSize: 19, margin: '26px 0 10px' }}>
          Defects
        </h2>
        <p className="nf-prose-p">{finding.defectsNotes ?? finding.rootCause}</p>

        <h2 id="sec-evidence" style={{ fontSize: 19, margin: '26px 0 10px' }}>
          Verification trace &amp; canary evidence
        </h2>
        <p className="nf-prose-p">
          {finding.verificationChainSummary ?? evidence?.summary ?? finding.impactAndAttackPath}
        </p>
        {evidence?.artifactJson ? (
          <pre
            className="nf-mono"
            style={{
              background: '#f8f9fb',
              border: '1px solid #e6e8ec',
              borderRadius: 12,
              padding: 16,
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(evidence.artifactJson, null, 2)}
          </pre>
        ) : null}

        {evidence?.minimalPatchDiff ? (
          <>
            <h2 id="sec-minimal-patch" style={{ fontSize: 19, margin: '28px 0 10px' }}>
              Minimal patch
            </h2>
            <p className="nf-prose-p">{evidence.minimalPatchDiff.explanation}</p>
            <UnifiedDiffViewer
              filePath={evidence.minimalPatchDiff.filePath}
              unifiedDiff={evidence.minimalPatchDiff.unifiedDiff}
            />
          </>
        ) : null}

        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            id="btn-promote-defense-factory"
            className="nf-btn-dark"
            onClick={() => onPromoteToDefenseFactory(finding)}
          >
            Open Tested Fix in Defense Factory →
          </button>
        </div>
      </div>

      <aside className="nf-meta-rail">
        <div className="nf-meta-block">
          <div className="nf-meta-label">SEVERITY</div>
          <SeverityPill severity={finding.severity} />
        </div>
        <div className="nf-meta-block">
          <div className="nf-meta-label">STATUS</div>
          <div style={{ fontWeight: 600 }}>Confirmed</div>
        </div>
        {finding.affectedEndpoint ? (
          <div className="nf-meta-block">
            <div className="nf-meta-label">AFFECTED ENDPOINT</div>
            <div className="nf-mono" style={{ wordBreak: 'break-all' }}>
              {finding.affectedEndpoint}
            </div>
          </div>
        ) : null}
        <nav
          aria-label="Report sections"
          style={{
            borderTop: '1px solid #e6e8ec',
            paddingTop: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 13,
            color: '#4b5563',
          }}
        >
          <a href="#sec-summary" style={{ color: 'inherit', textDecoration: 'none' }}>
            Summary
          </a>
          <a href="#sec-architecture" style={{ color: 'inherit', textDecoration: 'none' }}>
            Architecture
          </a>
          <a href="#sec-defects" style={{ color: 'inherit', textDecoration: 'none' }}>
            Defects
          </a>
          <a href="#sec-evidence" style={{ color: 'inherit', textDecoration: 'none' }}>
            Verification chain
          </a>
          <a href="#sec-minimal-patch" style={{ color: 'inherit', textDecoration: 'none' }}>
            Minimal patch
          </a>
        </nav>
      </aside>
    </div>
  );
}
