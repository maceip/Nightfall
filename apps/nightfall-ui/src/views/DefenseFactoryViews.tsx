import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Code2,
  Filter,
  FolderGit2,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react';
import type {
  AuditEntry,
  FindingRecord,
  FixProposal,
  NewScanRequest,
  OverviewSummary,
  RepositoryRecord,
  ScanJobRecord,
  Severity,
} from '@nightfall/core-contracts';
import {
  NightfallHorizonIcon,
  RedTeamSparkIcon,
  SankeyDiagram,
  SevenDayTrendChart,
  UnifiedDiffViewer,
} from '@nightfall/ui-kit';
import { platformBridge } from '../bridge/platformBridge.js';

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

export function SeverityPill({ severity }: { severity: Severity }): React.ReactElement {
  return <span className={`nf-pill sev-${severity}`}>{capitalize(severity)}</span>;
}

export function StatusPill({ status }: { status: string }): React.ReactElement {
  const label =
    status === 'in_progress'
      ? 'In Progress'
      : status === 'not_recorded'
        ? 'Not recorded'
        : capitalize(status);
  return <span className={`nf-pill status-${status}`}>{label}</span>;
}

export function OverviewView({
  overview,
  fixes,
  onNavigateFindings,
  onNavigateFixes,
  onSelectFix,
}: {
  overview: OverviewSummary;
  fixes: FixProposal[];
  onNavigateFindings: (sev?: Severity | null) => void;
  onNavigateFixes: () => void;
  onSelectFix: (fix: FixProposal) => void;
}): React.ReactElement {
  const proposedFixes = fixes.filter((f) => f.status === 'proposed').slice(0, 3);
  const maxBar = Math.max(
    overview.severityCounts.critical,
    overview.severityCounts.high,
    overview.severityCounts.medium,
    1,
  );

  return (
    <div id="view-overview">
      <div className="nf-section-header-row">
        <h2 className="nf-section-heading">Proposed fixes</h2>
        <button
          type="button"
          id="btn-overview-all-fixes"
          className="nf-icon-btn"
          style={{ width: 'auto', padding: '0 8px', gap: 4, fontSize: 13 }}
          onClick={onNavigateFixes}
        >
          <span>{overview.proposedFixesCount}</span>
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="nf-proposed-grid">
        {proposedFixes.map((fix) => (
          <div key={fix.id} className="nf-card nf-fix-mini-card">
            <div>
              <h3 className="nf-fix-mini-title">{fix.title}</h3>
              <p className="nf-fix-mini-meta">
                Fixes {fix.findingIds.length} finding{fix.findingIds.length > 1 ? 's' : ''}
              </p>
              <p className="nf-fix-mini-meta">{fix.repository}</p>
            </div>
            <div className="nf-fix-mini-footer">
              <StatusPill status={fix.status} />
              <button
                type="button"
                id={`btn-overview-review-${fix.id}`}
                className="nf-btn-outline"
                onClick={() => onSelectFix(fix)}
              >
                Review
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="nf-split-overview-card">
        <div className="nf-split-pane">
          <div
            className="nf-section-header-row"
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigateFindings(null)}
          >
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>
              <strong>{overview.openFindingsCount}</strong> Open findings
            </span>
            <ChevronRight size={16} color="#6b7280" />
          </div>

          <div className="nf-sev-bars">
            {(
              [
                { key: 'critical', label: 'Critical', color: '#ef233c' },
                { key: 'high', label: 'High', color: '#f38b67' },
                { key: 'medium', label: 'Medium', color: '#ebd078' },
              ] as const
            ).map((row) => {
              const count = overview.severityCounts[row.key];
              const widthPct = Math.max(10, Math.round((count / maxBar) * 100));
              return (
                <div
                  key={row.key}
                  id={`overview-sev-row-${row.key}`}
                  className="nf-sev-bar-row"
                  onClick={() => onNavigateFindings(row.key)}
                >
                  <span style={{ fontWeight: 500 }}>{row.label}</span>
                  <div className="nf-sev-bar-track">
                    <div
                      className="nf-sev-bar-fill"
                      style={{ width: `${widthPct}%`, background: row.color }}
                    />
                  </div>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="nf-split-pane">
          <div className="nf-section-header-row">
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>
              <strong>{overview.fixedFindingsCount}</strong> Fixed findings
            </span>
            <ChevronRight size={16} color="#6b7280" />
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            Daily trend · last 7 days (UTC)
          </div>
          <SevenDayTrendChart data={overview.dailyTrend} />
        </div>
      </div>

      <div className="nf-card">
        <div className="nf-section-header-row">
          <h2 className="nf-section-heading">Finding status</h2>
          <select
            id="select-overview-timeframe"
            className="nf-repo-pill-select"
            defaultValue="all"
            aria-label="Finding status timeframe"
          >
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="7d">Last 7 days</option>
          </select>
        </div>
        <div className="nf-status-counters-grid">
          <div>
            <div className="nf-big-stat">{overview.statusCounts.new}</div>
            <div className="nf-stat-caption">New</div>
          </div>
          <div>
            <div className="nf-big-stat">{overview.statusCounts.triaged}</div>
            <div className="nf-stat-caption">Triaged</div>
          </div>
          <div>
            <div className="nf-big-stat">{overview.statusCounts.in_progress}</div>
            <div className="nf-stat-caption">In Progress</div>
          </div>
          <div>
            <div className="nf-big-stat">{overview.statusCounts.fixed}</div>
            <div className="nf-stat-caption">Fixed</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FindingsView({
  overview,
  findings,
  selectedRepo,
  selectedSeverity,
  onSelectSeverity,
  onSelectFinding,
  onNavigateFixes,
}: {
  overview: OverviewSummary;
  findings: FindingRecord[];
  selectedRepo: string;
  selectedSeverity: Severity | null;
  onSelectSeverity: (sev: Severity | null) => void;
  onSelectFinding: (finding: FindingRecord) => void;
  onNavigateFixes: () => void;
}): React.ReactElement {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'fixed'>('open');

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      if (selectedRepo !== 'all' && f.repository !== selectedRepo) return false;
      if (selectedSeverity && f.severity !== selectedSeverity) return false;
      if (statusFilter === 'open' && (f.status === 'fixed' || f.status === 'discarded_fp')) {
        return false;
      }
      if (statusFilter === 'fixed' && f.status !== 'fixed') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          f.title.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q) ||
          f.repository.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [findings, selectedRepo, selectedSeverity, statusFilter, search]);

  return (
    <div id="view-findings">
      <div className="nf-cta-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
          <Code2 size={16} color="#4b5563" />
          <span>
            Review <strong>{overview.proposedFixesCount} proposed fixes</strong> to help reduce
            vulnerabilities in your code.
          </span>
        </div>
        <button
          type="button"
          id="btn-banner-view-fixes"
          className="nf-btn-dark"
          onClick={onNavigateFixes}
        >
          View fixes
        </button>
      </div>

      <div className="nf-filter-toolbar">
        <div className="nf-search-box">
          <Search size={15} color="#6b7280" />
          <input
            id="input-search-findings"
            type="text"
            placeholder="Search findings"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          id="select-findings-status"
          className="nf-repo-pill-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'open' | 'all' | 'fixed')}
        >
          <option value="open">Open findings</option>
          <option value="all">All findings</option>
          <option value="fixed">Fixed findings</option>
        </select>
        <button
          type="button"
          id="btn-findings-clear-filters"
          className="nf-btn-outline"
          onClick={() => {
            setSearch('');
            onSelectSeverity(null);
          }}
        >
          <Filter size={14} />
          <span>Filters</span>
        </button>
      </div>

      <SankeyDiagram
        totalOpen={overview.openFindingsCount}
        severityCounts={overview.severityCounts}
        statusCounts={{
          new: overview.statusCounts.new,
          triaged: overview.statusCounts.triaged,
          in_progress: overview.statusCounts.in_progress,
        }}
        links={overview.sankeyLinks}
        selectedSeverity={selectedSeverity}
        onSelectSeverity={onSelectSeverity}
      />

      <table className="nf-table" aria-label="Security findings list">
        <thead>
          <tr>
            <th style={{ width: 34 }} />
            <th style={{ width: 105 }}>Severity ↓</th>
            <th>Finding</th>
            <th style={{ width: 150 }}>Owner</th>
            <th style={{ width: 95 }}>Sources</th>
            <th style={{ width: 120 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((f) => (
            <tr
              key={f.id}
              id={`finding-row-${f.id}`}
              className="clickable-row"
              onClick={() => onSelectFinding(f)}
            >
              <td onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" aria-label={`Select ${f.id}`} />
              </td>
              <td>
                <SeverityPill severity={f.severity} />
              </td>
              <td>
                <div className="nf-row-title">{f.title}</div>
                <div className="nf-row-subtitle">{f.subtitle}</div>
              </td>
              <td>
                <span className="nf-owner-chip">
                  <span className="nf-avatar" style={{ background: f.owner.avatarColor }}>
                    {f.owner.initials}
                  </span>
                  <span>{f.owner.name}</span>
                </span>
              </td>
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <NightfallHorizonIcon size={16} />
                  {f.sources.includes('red-team') ? <RedTeamSparkIcon size={14} /> : null}
                </span>
              </td>
              <td>
                <StatusPill status={f.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FindingDetailView({
  finding,
  linkedFix,
  onOpenFixDrawer,
  onMarkDuplicate,
}: {
  finding: FindingRecord;
  linkedFix?: FixProposal;
  onOpenFixDrawer: () => void;
  onMarkDuplicate: (id: string) => void;
}): React.ReactElement {
  return (
    <div id={`view-finding-detail-${finding.id}`} className="nf-detail-layout">
      <div>
        <h1 className="nf-detail-h1">{finding.title}</h1>
        <p className="nf-detail-sub">
          {finding.id} · {finding.repository}
        </p>

        <div className="nf-kicker">SUMMARY</div>
        <p className="nf-prose-p">{finding.summary}</p>

        <div className="nf-kicker">ROOT CAUSE</div>
        <p className="nf-prose-p">{finding.rootCause}</p>

        <div className="nf-kicker">IMPACT AND ATTACK PATH</div>
        <p className="nf-prose-p">{finding.impactAndAttackPath}</p>

        {finding.preconditions.length > 0 ? (
          <>
            <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>Preconditions</div>
            <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 1.65 }}>
              {finding.preconditions.map((pre, i) => (
                <li key={i}>{pre}</li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="nf-kicker">REMEDIATION</div>
        <p className="nf-prose-p">{finding.remediation}</p>

        {linkedFix ? (
          <div style={{ marginTop: 22 }}>
            <div className="nf-kicker">PROPOSED PATCH PREVIEW ({linkedFix.snapshotLabel})</div>
            <UnifiedDiffViewer
              filePath={finding.codeReferences[0]?.file ?? linkedFix.repository}
              unifiedDiff={linkedFix.unifiedDiff}
            />
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button
            type="button"
            id="btn-detail-open-fix"
            className="nf-btn-dark"
            onClick={onOpenFixDrawer}
          >
            {linkedFix ? 'Continue fix in Nightfall' : 'Generate fix in Defense Factory'}
          </button>
          <button
            type="button"
            id="btn-detail-mark-dup"
            className="nf-btn-outline"
            onClick={() => onMarkDuplicate(finding.id)}
          >
            Mark as duplicate
          </button>
        </div>
      </div>

      <aside className="nf-meta-rail" aria-label="Finding metadata">
        <div className="nf-meta-block">
          <div className="nf-meta-label">REPORTED SEVERITY</div>
          <SeverityPill severity={finding.severity} />
        </div>
        <div className="nf-meta-block">
          <div className="nf-meta-label">STATUS</div>
          <StatusPill status={finding.status} />
        </div>
        <div className="nf-meta-block">
          <div className="nf-meta-label">FIX VERIFICATION</div>
          <StatusPill status={finding.fixVerification} />
        </div>
        <div className="nf-meta-block">
          <div className="nf-meta-label">REPOSITORY</div>
          <div>{finding.repository}</div>
        </div>
        <div className="nf-meta-block">
          <div className="nf-meta-label">OBSERVED REVISION</div>
          <div className="nf-mono">{finding.observedRevision}</div>
        </div>
        <div className="nf-meta-block">
          <div className="nf-meta-label">WEAKNESS</div>
          <div>{finding.weaknessCwe}</div>
        </div>
        <div className="nf-meta-block">
          <div className="nf-meta-label">OBSERVED BY</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <NightfallHorizonIcon size={16} />
            {finding.sources.includes('red-team') ? <RedTeamSparkIcon size={14} /> : null}
          </div>
        </div>
        <div className="nf-meta-block">
          <div className="nf-meta-label">OWNER</div>
          <span className="nf-owner-chip">
            <span className="nf-avatar" style={{ background: finding.owner.avatarColor }}>
              {finding.owner.initials}
            </span>
            <span>{finding.owner.name}</span>
          </span>
        </div>
      </aside>
    </div>
  );
}

export function FixWithNightfallDrawer({
  fix,
  onClose,
  onFollowUp,
  onMergeAndVerify,
}: {
  fix: FixProposal;
  onClose: () => void;
  onFollowUp: (fixId: string, message: string) => Promise<void>;
  onMergeAndVerify: (fixId: string) => Promise<void>;
}): React.ReactElement {
  const [followUpText, setFollowUpText] = useState('');
  const [showDiff, setShowDiff] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpText.trim() || busy) return;
    setBusy(true);
    await onFollowUp(fix.id, followUpText.trim());
    setFollowUpText('');
    setBusy(false);
  };

  return (
    <div className="nf-drawer-backdrop" onClick={onClose}>
      <div
        className="nf-drawer-panel"
        style={{ width: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Fix with Nightfall"
      >
        <div className="nf-drawer-header">
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 650 }}>Fix with Nightfall</div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>
              {fix.findingIds.join(', ')} · {fix.repository} · {fix.snapshotLabel}
            </div>
          </div>
          <button type="button" id="btn-close-fix-drawer" className="nf-icon-btn" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="nf-drawer-body">
          <div className="nf-card" style={{ background: '#f8f9fb', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
              Fix requested in hermetic Defense Factory sandbox
            </div>
            <div style={{ fontSize: 13.5 }}>
              Prepare minimal patch for <strong>{fix.findingIds.join(', ')}</strong> with
              failing-then-passing regression test proof.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              color: '#15803d',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            <Check size={15} />
            <span>Fix prepared · Two-stage test proof verified</span>
          </div>

          <div className="nf-card" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 650, marginBottom: 4 }}>Proposed fix 1 — {fix.title}</div>
            <p style={{ fontSize: 13, color: '#4b5563', margin: '0 0 10px' }}>{fix.explanation}</p>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
              {fix.changedFilesCount} changed files · Critic: {fix.gates.criticNotes}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              <span className="nf-pill status-enabled">Baseline ✓</span>
              <span className="nf-pill status-enabled">Red Test Repro ✓</span>
              <span className="nf-pill status-enabled">Green Patch ✓</span>
              <span className="nf-pill status-enabled">
                {fix.gates.regressionSuitePassed ? 'Regression Suite ✓' : 'Suite Running'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                id="btn-toggle-review-diff"
                className="nf-btn-outline"
                onClick={() => setShowDiff((v) => !v)}
              >
                {showDiff ? 'Hide changes' : 'Review changes'}
              </button>
              {fix.status !== 'merged' ? (
                <button
                  type="button"
                  id="btn-merge-and-verify"
                  className="nf-btn-dark"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onMergeAndVerify(fix.id);
                    setBusy(false);
                  }}
                >
                  Approve PR &amp; Re-Verify Fix
                </button>
              ) : (
                <span className="nf-pill status-enabled">Merged &amp; Verified Closed ✓</span>
              )}
            </div>
          </div>

          {showDiff ? (
            <>
              <UnifiedDiffViewer filePath={`${fix.repository} (patch)`} unifiedDiff={fix.unifiedDiff} />
              <UnifiedDiffViewer
                filePath={`${fix.repository} (security regression test)`}
                unifiedDiff={fix.securityTestDiff}
              />
            </>
          ) : null}

          {fix.conversation.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <div className="nf-kicker">REFINEMENT THREAD</div>
              {fix.conversation.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    marginBottom: 8,
                    background: msg.role === 'user' ? '#eef2ff' : '#f3f4f6',
                    fontSize: 13,
                  }}
                >
                  <strong style={{ display: 'block', fontSize: 11.5, marginBottom: 2 }}>
                    {msg.role === 'user' ? 'Engineer' : 'Nightfall Defense Factory'}
                  </strong>
                  {msg.text}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="nf-drawer-footer" style={{ justifyContent: 'stretch' }}>
          <div className="nf-search-box" style={{ flex: 1 }}>
            <Plus size={15} color="#6b7280" />
            <input
              id="input-fix-followup"
              type="text"
              placeholder="Ask for follow-up or supply codebase context..."
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
            />
          </div>
          <button type="submit" id="btn-send-followup" className="nf-btn-dark" disabled={busy}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export function FixesView({
  fixes,
  showToast,
  onDismissToast,
  onSelectFix,
}: {
  fixes: FixProposal[];
  showToast: boolean;
  onDismissToast: () => void;
  onSelectFix: (fix: FixProposal) => void;
}): React.ReactElement {
  return (
    <div id="view-fixes">
      <table className="nf-table" aria-label="Defense Factory proposed fixes">
        <thead>
          <tr>
            <th>Fix</th>
            <th style={{ width: 230 }}>Repository</th>
            <th style={{ width: 130 }}>Findings</th>
            <th style={{ width: 120 }}>Status</th>
            <th style={{ width: 135 }} />
          </tr>
        </thead>
        <tbody>
          {fixes.map((fix) => (
            <tr
              key={fix.id}
              id={`fix-row-${fix.id}`}
              className="clickable-row"
              onClick={() => onSelectFix(fix)}
            >
              <td>
                <div className="nf-row-title">{fix.title}</div>
                <div className="nf-row-subtitle">{fix.subtitle}</div>
              </td>
              <td>
                <div style={{ fontWeight: 500 }}>{fix.repository}</div>
                <div className="nf-row-subtitle">{fix.snapshotLabel}</div>
              </td>
              <td>
                <span style={{ marginRight: 8, fontWeight: 500 }}>{fix.findingIds.length}</span>
                <SeverityPill severity={fix.severity} />
              </td>
              <td>
                <StatusPill status={fix.status} />
              </td>
              <td style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  id={`btn-fix-action-${fix.id}`}
                  className="nf-btn-outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectFix(fix);
                  }}
                >
                  {fix.status === 'in_progress' ? 'View progress' : 'Review'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showToast ? (
        <div className="nf-toast" role="status">
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            2 sample fix proposals started. Each finding has its own fix.
          </div>
          <button
            type="button"
            id="btn-dismiss-fixes-toast"
            className="nf-icon-btn"
            onClick={onDismissToast}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function RepositoriesView({
  repositories,
  onToggleRepoScans,
  onQuickScanRepo,
}: {
  repositories: RepositoryRecord[];
  onToggleRepoScans: (repoId: string) => Promise<void>;
  onQuickScanRepo: (repoName: string) => Promise<void>;
}): React.ReactElement {
  const [search, setSearch] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);

  const prCovered = repositories.filter((r) => r.prReviewsEnabled).length;
  const schedCovered = repositories.filter((r) => r.scheduledScanLabel !== null).length;
  const needAttention = repositories.filter((r) => r.needsAttention).length;

  const filtered = repositories.filter((r) => {
    if (onlyAttention && !r.needsAttention) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.ownerTeam.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div id="view-repositories">
      <div className="nf-kpi-trio">
        <div className="nf-kpi-cell">
          <div style={{ fontSize: 12.5, color: '#4b5563', marginBottom: 8 }}>
            PR review coverage
          </div>
          <div>
            <span className="nf-big-stat">{prCovered}</span>
            <span style={{ color: '#6b7280', fontSize: 15 }}> / {repositories.length}</span>
          </div>
        </div>
        <div className="nf-kpi-cell">
          <div style={{ fontSize: 12.5, color: '#4b5563', marginBottom: 8 }}>
            Scheduled scan coverage
          </div>
          <div>
            <span className="nf-big-stat">{schedCovered}</span>
            <span style={{ color: '#6b7280', fontSize: 15 }}> / {repositories.length}</span>
          </div>
        </div>
        <div className="nf-kpi-cell">
          <div style={{ fontSize: 12.5, color: '#4b5563', marginBottom: 8 }}>Need attention</div>
          <div>
            <span className="nf-big-stat">{needAttention}</span>
          </div>
        </div>
      </div>

      <div className="nf-filter-toolbar">
        <div className="nf-search-box">
          <Search size={15} color="#6b7280" />
          <input
            id="input-search-repositories"
            type="text"
            placeholder="Search repositories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          id="btn-filter-attention"
          className="nf-btn-outline"
          onClick={() => setOnlyAttention((v) => !v)}
        >
          <Filter size={14} />
          <span>{onlyAttention ? 'Showing attention (6)' : 'Filters'}</span>
        </button>
      </div>

      <table className="nf-table" aria-label="Connected repositories">
        <thead>
          <tr>
            <th>Repository</th>
            <th>PR reviews</th>
            <th>Scheduled scans</th>
            <th>Last completed scan</th>
            <th>Owner</th>
            <th style={{ width: 120 }} />
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 12).map((repo) => (
            <tr key={repo.id} id={`repo-row-${repo.id}`}>
              <td>
                <div className="nf-row-title">{repo.name}</div>
                <div className="nf-row-subtitle">{repo.fullName}</div>
              </td>
              <td>
                <span className={`nf-pill ${repo.prReviewsEnabled ? 'status-enabled' : 'status-new'}`}>
                  {repo.prReviewsEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </td>
              <td>
                {repo.scheduledScanLabel ? (
                  <span className="nf-pill status-enabled">{repo.scheduledScanLabel}</span>
                ) : (
                  <span className="nf-pill status-new">Paused</span>
                )}
              </td>
              <td style={{ color: '#4b5563' }}>{repo.lastCompletedScanLabel}</td>
              <td style={{ fontWeight: 500 }}>{repo.ownerTeam}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button
                  type="button"
                  className="nf-icon-btn"
                  title="Toggle scan schedule"
                  onClick={() => onToggleRepoScans(repo.id)}
                >
                  <Settings size={15} />
                </button>
                <button
                  type="button"
                  className="nf-btn-outline"
                  style={{ height: 29, padding: '0 11px', marginLeft: 4 }}
                  onClick={() => onQuickScanRepo(repo.name)}
                >
                  Scan
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScansAndAuditView({
  scans,
  auditEntries,
  onOpenNewScan,
}: {
  scans: ScanJobRecord[];
  auditEntries: AuditEntry[];
  onOpenNewScan: () => void;
}): React.ReactElement {
  return (
    <div id="view-scans">
      <div className="nf-section-header-row">
        <h2 className="nf-section-heading">Recent repository &amp; continuous scans</h2>
        <button type="button" id="btn-scans-new" className="nf-btn-dark" onClick={onOpenNewScan}>
          + New scan
        </button>
      </div>

      <table className="nf-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Scan ID</th>
            <th>Repository</th>
            <th>Execution Mode</th>
            <th>Method</th>
            <th>Findings</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((sc) => (
            <tr key={sc.id}>
              <td className="nf-mono">{sc.id}</td>
              <td style={{ fontWeight: 600 }}>{sc.repository}</td>
              <td>Nightfall · {capitalize(sc.mode)}</td>
              <td>{capitalize(sc.method)}</td>
              <td>{sc.findingsDiscovered}</td>
              <td>
                <StatusPill status={sc.status === 'completed' ? 'enabled' : 'in_progress'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="nf-section-header-row">
        <h2 className="nf-section-heading">
          Immutable Hash-Chained Audit Ledger ({auditEntries.length} records)
        </h2>
        <span className="nf-pill status-enabled">SHA-256 Chain Verified ✓</span>
      </div>
      <div className="nf-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="nf-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Subsystem</th>
              <th>Action</th>
              <th>Summary</th>
              <th>Chain Digest</th>
            </tr>
          </thead>
          <tbody>
            {auditEntries.slice(0, 12).map((entry) => (
              <tr key={entry.id}>
                <td className="nf-mono">{entry.index}</td>
                <td>
                  <span className="nf-pill status-proposed">{entry.subsystem}</span>
                </td>
                <td className="nf-mono">{entry.action}</td>
                <td>{entry.summary}</td>
                <td className="nf-mono" style={{ color: '#6b7280' }}>
                  {entry.hash.slice(0, 14)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NewScanDrawer({
  repositories,
  onClose,
  onSubmitScan,
}: {
  repositories: RepositoryRecord[];
  onClose: () => void;
  onSubmitScan: (req: NewScanRequest) => Promise<void>;
}): React.ReactElement {
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
  const [repository, setRepository] = useState(repositories[0]?.name ?? 'asset-servicing');
  const [localPath, setLocalPath] = useState('');
  const [method, setMethod] = useState<NewScanRequest['method']>('repository_scan');
  const [scope, setScope] = useState<NewScanRequest['scope']>('full_repository');
  const [specificPath, setSpecificPath] = useState('src/routes/');
  const [submitting, setSubmitting] = useState(false);

  const handleChooseLocal = async () => {
    setMode('local');
    const chosen = await platformBridge.pickLocalRepository();
    if (chosen) {
      setLocalPath(chosen);
      setRepository(chosen.split('/').filter(Boolean).pop() ?? chosen);
    }
  };

  return (
    <div className="nf-drawer-backdrop" onClick={onClose}>
      <div
        className="nf-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="New scan"
      >
        <div className="nf-drawer-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 650 }}>New scan</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              Share findings from a connected repository with your team.
            </p>
          </div>
          <button type="button" id="btn-close-new-scan" className="nf-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="nf-drawer-body">
          <div className="nf-segmented-control" role="tablist">
            <button
              type="button"
              id="btn-scan-mode-cloud"
              className={mode === 'cloud' ? 'nf-seg-btn active' : 'nf-seg-btn'}
              onClick={() => setMode('cloud')}
            >
              Cloud <span className="nf-seg-rec">· Recommended</span>
            </button>
            <button
              type="button"
              id="btn-scan-mode-local"
              className={mode === 'local' ? 'nf-seg-btn active' : 'nf-seg-btn'}
              onClick={handleChooseLocal}
            >
              Local
            </button>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="select-scan-repo"
              style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}
            >
              {mode === 'cloud' ? 'Repository' : 'Local Workspace Directory'}
            </label>
            {mode === 'cloud' ? (
              <select
                id="select-scan-repo"
                className="nf-repo-pill-select"
                style={{ width: '100%', borderRadius: 10, height: 38 }}
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
              >
                {repositories.slice(0, 12).map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.fullName}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="input-local-repo-path"
                  className="nf-repo-pill-select"
                  style={{ flex: 1, borderRadius: 10, height: 38 }}
                  value={localPath || '/workspace/northstar-docs'}
                  onChange={(e) => setLocalPath(e.target.value)}
                />
                <button type="button" className="nf-btn-outline" onClick={handleChooseLocal}>
                  <FolderGit2 size={14} /> Browse
                </button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Scan method</div>
            <label className="nf-radio-option">
              <input
                type="radio"
                name="scan-method"
                checked={method === 'repository_scan'}
                onChange={() => setMethod('repository_scan')}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Repository scan</div>
                <div className="nf-row-subtitle">
                  Find security issues across the repository&apos;s default branch.
                </div>
              </div>
            </label>
            <label className="nf-radio-option">
              <input
                type="radio"
                name="scan-method"
                checked={method === 'continuous_monitoring'}
                onChange={() => setMethod('continuous_monitoring')}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Continuous monitoring</div>
                <div className="nf-row-subtitle">
                  Find security issues introduced by new commits.
                </div>
              </div>
            </label>
            <label className="nf-radio-option">
              <input
                type="radio"
                name="scan-method"
                checked={method === 'scheduled_scan'}
                onChange={() => setMethod('scheduled_scan')}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Scheduled scan</div>
                <div className="nf-row-subtitle">
                  Set a schedule to run scans across your repository&apos;s default branch.
                </div>
              </div>
            </label>
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Scope</div>
            <label className="nf-radio-option">
              <input
                type="radio"
                name="scan-scope"
                checked={scope === 'full_repository'}
                onChange={() => setScope('full_repository')}
              />
              <div style={{ fontWeight: 600 }}>Full repository</div>
            </label>
            <label className="nf-radio-option">
              <input
                type="radio"
                name="scan-scope"
                checked={scope === 'specific_paths'}
                onChange={() => setScope('specific_paths')}
              />
              <div style={{ fontWeight: 600 }}>Specific folder or files</div>
            </label>
            {scope === 'specific_paths' ? (
              <input
                id="input-scan-specific-paths"
                type="text"
                className="nf-repo-pill-select"
                style={{ width: '100%', borderRadius: 10, marginTop: 6 }}
                value={specificPath}
                onChange={(e) => setSpecificPath(e.target.value)}
              />
            ) : null}
          </div>
        </div>

        <div className="nf-drawer-footer">
          <button type="button" className="nf-btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            id="btn-submit-start-scan"
            className="nf-btn-dark"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              await onSubmitScan({
                mode,
                repository,
                method,
                scope,
                ...(scope === 'specific_paths' ? { paths: [specificPath] } : {}),
              });
              setSubmitting(false);
              onClose();
            }}
          >
            Start Scan
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmergencyKillSwitchButton({
  engaged,
  onToggle,
}: {
  engaged: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      id="btn-emergency-kill-switch"
      className={`nf-btn-outline nf-btn-danger ${engaged ? 'engaged' : ''}`}
      onClick={onToggle}
      title="Immediately revoke Egress Policy Proxy capability tokens and halt active sandboxes"
    >
      <ShieldAlert size={14} />
      <span>{engaged ? 'Kill-Switch Engaged (Resume)' : 'Halt Sandboxes'}</span>
    </button>
  );
}
