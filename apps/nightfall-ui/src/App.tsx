import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Code2,
  FileCode2,
  Folder,
  GitBranch,
  Home,
  LayoutGrid,
  ListFilter,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Radar,
  ScanLine,
  Settings,
  Shield,
} from 'lucide-react';
import type {
  FindingRecord,
  FixProposal,
  NewScanRequest,
  Severity,
} from '@nightfall/core-contracts';
import { NightfallHorizonIcon, RedTeamCampaignBadge } from '@nightfall/ui-kit';
import {
  fetchBootstrapState,
  launchCampaignApi,
  markFindingDuplicateApi,
  mergeAndVerifyFixApi,
  type NightfallBootstrapPayload,
  prepareCampaignApi,
  resolveApprovalApi,
  sendFixFollowUpApi,
  startFixProposalApi,
  subscribeLiveEvents,
  toggleKillSwitchApi,
  toggleRepositoryCoverageApi,
  triggerNewScanApi,
} from './api/nightfallClient.js';
import {
  EmergencyKillSwitchButton,
  FindingDetailView,
  FindingsView,
  FixesView,
  FixWithNightfallDrawer,
  NewScanDrawer,
  OverviewView,
  RepositoriesView,
  ScansAndAuditView,
} from './views/DefenseFactoryViews.js';
import {
  CampaignYamlSplitView,
  LiveCampaignWorkspaceView,
  RedTeamComposerView,
  RedTeamFindingReportView,
  type RedTeamStage,
} from './views/RedTeamViews.js';

export type PrimarySection =
  | 'overview'
  | 'fixes'
  | 'findings'
  | 'finding-detail'
  | 'repositories'
  | 'scans'
  | 'red-team'
  | 'settings';

export function App(): React.ReactElement {
  const [data, setData] = useState<NightfallBootstrapPayload | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [section, setSection] = useState<PrimarySection>('findings');
  const [navHistory, setNavHistory] = useState<PrimarySection[]>(['findings']);
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | null>(null);
  const [activeFindingId, setActiveFindingId] = useState<string>('SEC-1034');
  const [activeFixDrawerId, setActiveFixDrawerId] = useState<string | null>(null);
  const [showNewScanDrawer, setShowNewScanDrawer] = useState(false);
  const [showFixesToast, setShowFixesToast] = useState(true);

  // Red Team multi-view state
  const [rtStage, setRtStage] = useState<RedTeamStage>('live-campaign');
  const [activeCampaignId, setActiveCampaignId] = useState<string>('camp-northstar-staging');
  const [yamlDraft, setYamlDraft] = useState<string>('');
  const [rtReportFindingId, setRtReportFindingId] = useState<string>('F-002');

  const navigateTo = (next: PrimarySection) => {
    setSection(next);
    setNavHistory((prev) => [...prev.slice(-12), next]);
  };

  useEffect(() => {
    let mounted = true;
    fetchBootstrapState().then((initial) => {
      if (!mounted) return;
      setData(initial);
      if (initial.campaigns[0]) {
        setActiveCampaignId(initial.campaigns[0].id);
        setYamlDraft(initial.campaigns[0].yamlText);
      }
    });

    const unsub = subscribeLiveEvents((ev) => {
      setData((prev) => {
        if (!prev) return prev;
        if (ev.type === 'campaign.updated') {
          const exists = prev.campaigns.some((c) => c.id === ev.campaign.id);
          return {
            ...prev,
            campaigns: exists
              ? prev.campaigns.map((c) => (c.id === ev.campaign.id ? ev.campaign : c))
              : [ev.campaign, ...prev.campaigns],
          };
        }
        if (ev.type === 'finding.updated') {
          return {
            ...prev,
            findings: prev.findings.map((f) => (f.id === ev.finding.id ? ev.finding : f)),
          };
        }
        if (ev.type === 'fix.updated') {
          const exists = prev.fixes.some((fx) => fx.id === ev.fix.id);
          return {
            ...prev,
            fixes: exists
              ? prev.fixes.map((fx) => (fx.id === ev.fix.id ? ev.fix : fx))
              : [ev.fix, ...prev.fixes],
          };
        }
        if (ev.type === 'scan.updated') {
          return {
            ...prev,
            scans: [ev.scan, ...prev.scans.filter((s) => s.id !== ev.scan.id)],
          };
        }
        if (ev.type === 'hitl.updated') {
          return {
            ...prev,
            approvals: prev.approvals.map((a) => (a.id === ev.approval.id ? ev.approval : a)),
          };
        }
        if (ev.type === 'safety.kill_switch') {
          return {
            ...prev,
            killSwitchEngaged: ev.engaged,
          };
        }
        if (ev.type === 'audit.appended') {
          return {
            ...prev,
            auditEntries: [ev.entry, ...prev.auditEntries],
          };
        }
        return prev;
      });
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Gentle live timer increment when viewing an active Red Team campaign
  useEffect(() => {
    const timer = setInterval(() => {
      setData((prev) => {
        if (!prev || prev.killSwitchEngaged) return prev;
        return {
          ...prev,
          campaigns: prev.campaigns.map((c) =>
            c.status === 'running' ? { ...c, elapsedSeconds: c.elapsedSeconds + 1 } : c,
          ),
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeCampaign = useMemo(() => {
    if (!data) return undefined;
    return data.campaigns.find((c) => c.id === activeCampaignId) ?? data.campaigns[0];
  }, [data, activeCampaignId]);

  const activeFinding = useMemo(() => {
    if (!data) return undefined;
    return data.findings.find((f) => f.id === activeFindingId) ?? data.findings[0];
  }, [data, activeFindingId]);

  const activeFixDrawer = useMemo(() => {
    if (!data || !activeFixDrawerId) return undefined;
    return data.fixes.find((fx) => fx.id === activeFixDrawerId);
  }, [data, activeFixDrawerId]);

  if (!data) {
    return (
      <div className="nf-app-window" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontWeight: 600 }}>Loading Nightfall Workspace…</div>
      </div>
    );
  }

  const proposedCount = data.fixes.filter((f) => f.status === 'proposed').length;

  const handleOpenFinding = (f: FindingRecord) => {
    setActiveFindingId(f.id);
    navigateTo('finding-detail');
  };

  const handleSelectFix = (fix: FixProposal) => {
    if (fix.findingIds[0]) {
      const match = data.findings.find((f) => f.id === fix.findingIds[0]);
      if (match) setActiveFindingId(match.id);
    }
    setActiveFixDrawerId(fix.id);
  };

  const handleStartOrOpenFixForFinding = async (finding: FindingRecord) => {
    if (finding.fixId) {
      setActiveFixDrawerId(finding.fixId);
      return;
    }
    const remote = await startFixProposalApi(finding.id);
    if (remote?.fix) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              fixes: [remote.fix!, ...prev.fixes.filter((x) => x.id !== remote.fix!.id)],
              findings: remote.finding
                ? prev.findings.map((x) => (x.id === remote.finding!.id ? remote.finding! : x))
                : prev.findings,
            }
          : prev,
      );
      setActiveFixDrawerId(remote.fix.id);
      return;
    }
    const localFix: FixProposal = {
      id: `FIX-${finding.id}`,
      title: `Fix ${finding.title}`,
      subtitle: `${finding.id} · Ready for review`,
      repository: finding.repository,
      snapshotLabel: 'Nightfall · Cloud snapshot',
      findingIds: [finding.id],
      severity: finding.severity,
      status: 'proposed',
      changedFilesCount: 2,
      explanation: finding.remediation,
      unifiedDiff: `--- a/${finding.codeReferences[0]?.file ?? 'src/handler.ts'}\n+++ b/${finding.codeReferences[0]?.file ?? 'src/handler.ts'}\n@@ -12,3 +12,6 @@\n+  // Enforce authorization & input invariants (${finding.id})\n+  enforceSecurityBoundary(caller, resource);`,
      securityTestDiff: `+++ b/tests/${finding.id.toLowerCase()}.test.ts\n+it('enforces security invariant for ${finding.id}', () => {\n+  expect(verifyUnauthorizedBlocked()).toBe(true);\n+});`,
      gates: {
        baselineBuildPassed: true,
        redPhaseFailedAsExpected: true,
        greenPhasePassed: true,
        regressionSuitePassed: true,
        staticHygienePassed: true,
        criticApproved: true,
        criticNotes: 'Synthesized minimal patch & verified two-stage test proof.',
      },
      conversation: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setData((prev) =>
      prev
        ? {
            ...prev,
            fixes: [localFix, ...prev.fixes],
            findings: prev.findings.map((f) =>
              f.id === finding.id ? { ...f, fixId: localFix.id } : f,
            ),
          }
        : prev,
    );
    setActiveFixDrawerId(localFix.id);
  };

  const handleFollowUpFix = async (fixId: string, message: string) => {
    const remote = await sendFixFollowUpApi(fixId, message);
    if (remote?.fix) {
      setData((prev) =>
        prev
          ? { ...prev, fixes: prev.fixes.map((fx) => (fx.id === fixId ? remote.fix : fx)) }
          : prev,
      );
      return;
    }
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fixes: prev.fixes.map((fx) =>
          fx.id === fixId
            ? {
                ...fx,
                conversation: [
                  ...fx.conversation,
                  {
                    id: `u-${Date.now()}`,
                    role: 'user',
                    text: message,
                    createdAt: new Date().toISOString(),
                  },
                  {
                    id: `a-${Date.now() + 1}`,
                    role: 'nightfall',
                    text: `Updated patch in hermetic sandbox incorporating context ("${message}") and re-verified Red→Green security & regression gates.`,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : fx,
        ),
      };
    });
  };

  const handleMergeAndVerifyFix = async (fixId: string) => {
    const remote = await mergeAndVerifyFixApi(fixId);
    if (remote) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              fixes: prev.fixes.map((fx) => (fx.id === fixId ? remote.fix : fx)),
              findings: remote.finding
                ? prev.findings.map((f) => (f.id === remote.finding!.id ? remote.finding! : f))
                : prev.findings,
              overview: remote.overview ?? prev.overview,
            }
          : prev,
      );
      return;
    }
    setData((prev) => {
      if (!prev) return prev;
      const targetFix = prev.fixes.find((f) => f.id === fixId);
      const affectedIds = new Set(targetFix?.findingIds ?? []);
      return {
        ...prev,
        fixes: prev.fixes.map((fx) => (fx.id === fixId ? { ...fx, status: 'merged' } : fx)),
        findings: prev.findings.map((f) =>
          affectedIds.has(f.id)
            ? { ...f, status: 'fixed', fixVerification: 'verified' }
            : f,
        ),
        overview: {
          ...prev.overview,
          openFindingsCount: Math.max(0, prev.overview.openFindingsCount - affectedIds.size),
          fixedFindingsCount: prev.overview.fixedFindingsCount + affectedIds.size,
        },
      };
    });
  };

  const handleSubmitNewScan = async (req: NewScanRequest) => {
    const res = await triggerNewScanApi(req);
    setData((prev) =>
      prev
        ? {
            ...prev,
            scans: [res.scan, ...prev.scans],
            overview: res.overview ?? prev.overview,
          }
        : prev,
    );
    navigateTo('scans');
  };

  const handleMarkDuplicate = async (findingId: string) => {
    const res = await markFindingDuplicateApi(findingId);
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        findings: prev.findings.map((f) =>
          f.id === findingId ? res?.finding ?? { ...f, status: 'discarded_fp' } : f,
        ),
        overview: res?.overview ?? prev.overview,
      };
    });
  };

  const handleToggleKillSwitch = async () => {
    const next = !data.killSwitchEngaged;
    await toggleKillSwitchApi(
      next,
      next ? 'Operator halted sandboxes from Nightfall UI' : 'Operator resumed Nightfall operations',
    );
    setData((prev) => (prev ? { ...prev, killSwitchEngaged: next } : prev));
  };

  const rtFindings = data.findings.filter(
    (f) => f.campaignId === (activeCampaign?.id ?? 'camp-northstar-staging'),
  );
  const rtReportFinding =
    data.findings.find((f) => f.id === rtReportFindingId) ?? rtFindings[0] ?? data.findings[0]!;
  const rtReportEvidence = data.evidenceBundles.find(
    (ev) => ev.findingId === rtReportFinding.id,
  );

  return (
    <div className="nf-app-window" id="nightfall-three-col-app">
      {/* Native-Style Top Title & Tab Bar */}
      <header className="nf-titlebar">
        <div className="nf-titlebar-left">
          <div className="nf-traffic-lights" aria-hidden="true">
            <span className="nf-traffic-dot close" />
            <span className="nf-traffic-dot min" />
            <span className="nf-traffic-dot max" />
          </div>
          <button
            type="button"
            id="btn-history-back"
            className="nf-icon-btn"
            title="Back"
            onClick={() => {
              if (navHistory.length > 1) {
                const prev = navHistory[navHistory.length - 2]!;
                setNavHistory((h) => h.slice(0, -1));
                setSection(prev);
              }
            }}
          >
            <ArrowLeft size={15} />
          </button>
          <button type="button" className="nf-icon-btn" title="Forward" disabled>
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            id="btn-toggle-sidebar"
            className="nf-icon-btn"
            title="Toggle Nightfall navigation sidebar"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <PanelLeft size={15} />
          </button>
        </div>

        <div className="nf-titlebar-tabs" role="tablist" aria-label="Workspace tabs">
          <button
            type="button"
            id="top-tab-defense-factory"
            className={`nf-top-tab ${section !== 'red-team' ? 'active' : ''}`}
            onClick={() => navigateTo('findings')}
          >
            <NightfallHorizonIcon size={15} />
            <span>Nightfall Defense Factory</span>
          </button>
          <button
            type="button"
            id="top-tab-campaign-yaml"
            className={`nf-top-tab ${section === 'red-team' && rtStage === 'yaml-builder' ? 'active' : ''}`}
            onClick={() => {
              navigateTo('red-team');
              setRtStage('yaml-builder');
            }}
          >
            <FileCode2 size={14} />
            <span>campaign.yaml</span>
          </button>
          <button
            type="button"
            id="top-tab-red-team"
            className={`nf-top-tab ${
              section === 'red-team' &&
              (rtStage === 'live-campaign' || rtStage === 'finding-report')
                ? 'active'
                : ''
            }`}
            onClick={() => {
              navigateTo('red-team');
              setRtStage('live-campaign');
            }}
          >
            <RedTeamCampaignBadge size={15} />
            <span>Nightfall Red Team</span>
          </button>
          <button
            type="button"
            id="btn-new-redteam-prompt-tab"
            className="nf-icon-btn"
            title="New Red Team assessment prompt"
            onClick={() => {
              navigateTo('red-team');
              setRtStage('composer');
            }}
          >
            <Plus size={15} />
          </button>
        </div>

        <div className="nf-titlebar-right">
          <span className="nf-live-indicator" title="Backend connection mode">
            <i className={data.connectedLiveApi ? 'nf-dot-green' : 'nf-dot-green'} />
            <span>{data.connectedLiveApi ? 'Live API + SSE' : 'Interactive Replay'}</span>
          </span>
          <EmergencyKillSwitchButton
            engaged={data.killSwitchEngaged}
            onToggle={handleToggleKillSwitch}
          />
        </div>
      </header>

      {/* Three-Column Workspace Body */}
      <div className="nf-three-col-body">
        {/* Column 1: Slim Global Icon Rail */}
        <aside className="nf-global-rail" aria-label="Global workspace switcher">
          <button
            type="button"
            id="rail-btn-home"
            className={`nf-rail-btn ${section === 'red-team' && rtStage === 'composer' ? 'active' : ''}`}
            title="Red Team Prompt Composer"
            onClick={() => {
              navigateTo('red-team');
              setRtStage('composer');
            }}
          >
            <Home size={17} />
          </button>
          <button
            type="button"
            id="rail-btn-yaml"
            className={`nf-rail-btn ${section === 'red-team' && rtStage === 'yaml-builder' ? 'active' : ''}`}
            title="Campaign YAML Manifest"
            onClick={() => {
              navigateTo('red-team');
              setRtStage('yaml-builder');
            }}
          >
            <FileCode2 size={17} />
          </button>
          <button
            type="button"
            id="rail-btn-history"
            className={`nf-rail-btn ${section === 'scans' ? 'active' : ''}`}
            title="Scans & Immutable Audit Ledger"
            onClick={() => navigateTo('scans')}
          >
            <Clock size={17} />
          </button>
          <button
            type="button"
            id="rail-btn-redteam"
            className={`nf-rail-btn ${section === 'red-team' && rtStage === 'live-campaign' ? 'active' : ''}`}
            title="Nightfall Red Team Live Campaign"
            onClick={() => {
              navigateTo('red-team');
              setRtStage('live-campaign');
            }}
          >
            <Radar size={17} />
          </button>
          <button type="button" className="nf-rail-btn" title="More">
            <MoreHorizontal size={17} />
          </button>
          <div className="nf-rail-divider" />
          <button
            type="button"
            id="rail-btn-nightfall"
            className={`nf-rail-btn ${section !== 'red-team' ? 'active' : ''}`}
            title="Nightfall Security"
            onClick={() => navigateTo('overview')}
          >
            <NightfallHorizonIcon size={19} />
          </button>
          <button
            type="button"
            id="rail-btn-fixes"
            className={`nf-rail-btn ${section === 'fixes' ? 'active' : ''}`}
            title="Defense Factory Fixes"
            onClick={() => navigateTo('fixes')}
          >
            <GitBranch size={17} />
          </button>
          <button
            type="button"
            id="rail-btn-repos"
            className={`nf-rail-btn ${section === 'repositories' ? 'active' : ''}`}
            title="Repositories"
            onClick={() => navigateTo('repositories')}
          >
            <LayoutGrid size={17} />
          </button>
        </aside>

        {/* Column 2: Collapsible Nightfall Product Sidebar */}
        <nav
          id="nightfall-product-sidebar"
          className={sidebarOpen ? 'nf-product-sidebar' : 'nf-product-sidebar collapsed'}
          aria-label="Nightfall navigation"
        >
          <div>
            <div className="nf-sidebar-brand-row">
              <span className="nf-brand-wordmark">Nightfall</span>
              <button
                type="button"
                className="nf-icon-btn"
                title="Collapse sidebar"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeft size={15} />
              </button>
            </div>

            <div className="nf-nav-list">
              <button
                type="button"
                id="nav-btn-new-scan"
                className="nf-nav-item"
                onClick={() => setShowNewScanDrawer(true)}
              >
                <span className="nf-nav-item-left">
                  <Plus size={16} />
                  <span>New scan</span>
                </span>
              </button>

              <button
                type="button"
                id="nav-btn-overview"
                className={`nf-nav-item ${section === 'overview' ? 'active' : ''}`}
                onClick={() => navigateTo('overview')}
              >
                <span className="nf-nav-item-left">
                  <LayoutGrid size={15} />
                  <span>Overview</span>
                </span>
              </button>

              <button
                type="button"
                id="nav-btn-fixes"
                className={`nf-nav-item ${section === 'fixes' ? 'active' : ''}`}
                onClick={() => navigateTo('fixes')}
              >
                <span className="nf-nav-item-left">
                  <Code2 size={15} />
                  <span>Fixes</span>
                </span>
                <span className="nf-nav-counter">
                  {proposedCount}
                  <i className="nf-unread-dot" />
                </span>
              </button>

              <button
                type="button"
                id="nav-btn-findings"
                className={`nf-nav-item ${
                  section === 'findings' || section === 'finding-detail' ? 'active' : ''
                }`}
                onClick={() => navigateTo('findings')}
              >
                <span className="nf-nav-item-left">
                  <ListFilter size={15} />
                  <span>Findings</span>
                </span>
                <span className="nf-nav-counter">{data.overview.openFindingsCount}</span>
              </button>

              <button
                type="button"
                id="nav-btn-repositories"
                className={`nf-nav-item ${section === 'repositories' ? 'active' : ''}`}
                onClick={() => navigateTo('repositories')}
              >
                <span className="nf-nav-item-left">
                  <Folder size={15} />
                  <span>Repositories</span>
                </span>
              </button>

              <button
                type="button"
                id="nav-btn-scans"
                className={`nf-nav-item ${section === 'scans' ? 'active' : ''}`}
                onClick={() => navigateTo('scans')}
              >
                <span className="nf-nav-item-left">
                  <ScanLine size={15} />
                  <span>Scans</span>
                </span>
              </button>

              <div className="nf-sidebar-divider" />

              <button
                type="button"
                id="nav-btn-red-team"
                className={`nf-nav-item ${section === 'red-team' ? 'active' : ''}`}
                onClick={() => {
                  navigateTo('red-team');
                  setRtStage('live-campaign');
                }}
              >
                <span className="nf-nav-item-left">
                  <Shield size={15} />
                  <span>Red Team</span>
                </span>
                <span className="nf-new-badge">New</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            id="nav-btn-settings"
            className={`nf-nav-item ${section === 'settings' ? 'active' : ''}`}
            onClick={() => navigateTo('settings')}
          >
            <span className="nf-nav-item-left">
              <Settings size={15} />
              <span>Settings</span>
            </span>
          </button>
        </nav>

        {/* Column 3: Main Workspace Canvas */}
        <main className="nf-main-column">
          {section !== 'red-team' ? (
            <>
              <div className="nf-page-topbar">
                <div className="nf-breadcrumb">
                  {section === 'finding-detail' && activeFinding ? (
                    <>
                      <button
                        type="button"
                        className="nf-icon-btn"
                        style={{ width: 'auto', padding: '0 6px', fontSize: 13.5 }}
                        onClick={() => navigateTo('findings')}
                      >
                        Findings
                      </button>
                      <span style={{ color: '#9ca3af' }}>/</span>
                      <h1 className="nf-page-title">{activeFinding.id}</h1>
                    </>
                  ) : (
                    <>
                      <select
                        id="select-global-repo-filter"
                        className="nf-repo-pill-select"
                        value={selectedRepo}
                        onChange={(e) => setSelectedRepo(e.target.value)}
                      >
                        <option value="all">All repos</option>
                        {data.repositories.slice(0, 8).map((r) => (
                          <option key={r.id} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <span style={{ color: '#9ca3af' }}>/</span>
                      <h1 className="nf-page-title">
                        {section === 'overview'
                          ? 'Overview'
                          : section === 'fixes'
                            ? 'Fixes'
                            : section === 'findings'
                              ? 'Findings'
                              : section === 'repositories'
                                ? 'Repositories'
                                : section === 'scans'
                                  ? 'Scans & Audit'
                                  : 'Settings'}
                      </h1>
                    </>
                  )}
                </div>

                <div className="nf-topbar-actions">
                  {section === 'finding-detail' && activeFinding ? (
                    <>
                      <button
                        type="button"
                        className="nf-btn-outline"
                        onClick={() => handleMarkDuplicate(activeFinding.id)}
                      >
                        Mark as duplicate
                      </button>
                      <button
                        type="button"
                        id="btn-topbar-continue-fix"
                        className="nf-btn-outline"
                        onClick={() => handleStartOrOpenFixForFinding(activeFinding)}
                      >
                        Continue fix
                      </button>
                    </>
                  ) : section === 'repositories' ? (
                    <button
                      type="button"
                      id="btn-enable-security-scans"
                      className="nf-btn-dark"
                      onClick={() => setShowNewScanDrawer(true)}
                    >
                      Enable security scans
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="nf-scroll-canvas">
                {section === 'overview' ? (
                  <OverviewView
                    overview={data.overview}
                    fixes={data.fixes}
                    onNavigateFindings={(sev) => {
                      setSelectedSeverity(sev ?? null);
                      navigateTo('findings');
                    }}
                    onNavigateFixes={() => navigateTo('fixes')}
                    onSelectFix={handleSelectFix}
                  />
                ) : null}

                {section === 'findings' ? (
                  <FindingsView
                    overview={data.overview}
                    findings={data.findings}
                    selectedRepo={selectedRepo}
                    selectedSeverity={selectedSeverity}
                    onSelectSeverity={setSelectedSeverity}
                    onSelectFinding={handleOpenFinding}
                    onNavigateFixes={() => navigateTo('fixes')}
                  />
                ) : null}

                {section === 'finding-detail' && activeFinding ? (
                  <FindingDetailView
                    finding={activeFinding}
                    linkedFix={data.fixes.find((fx) => fx.id === activeFinding.fixId)}
                    onOpenFixDrawer={() => handleStartOrOpenFixForFinding(activeFinding)}
                    onMarkDuplicate={handleMarkDuplicate}
                  />
                ) : null}

                {section === 'fixes' ? (
                  <FixesView
                    fixes={data.fixes}
                    showToast={showFixesToast}
                    onDismissToast={() => setShowFixesToast(false)}
                    onSelectFix={handleSelectFix}
                  />
                ) : null}

                {section === 'repositories' ? (
                  <RepositoriesView
                    repositories={data.repositories}
                    onToggleRepoScans={async (repoId) => {
                      const res = await toggleRepositoryCoverageApi(repoId);
                      setData((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          repositories: prev.repositories.map((r) =>
                            r.id === repoId
                              ? res?.repository ?? {
                                  ...r,
                                  prReviewsEnabled: !r.prReviewsEnabled,
                                  scheduledScanLabel: r.scheduledScanLabel
                                    ? null
                                    : 'Daily at 8:00 AM UTC',
                                }
                              : r,
                          ),
                        };
                      });
                    }}
                    onQuickScanRepo={async (repoName) => {
                      await handleSubmitNewScan({
                        mode: 'cloud',
                        repository: repoName,
                        method: 'repository_scan',
                        scope: 'full_repository',
                      });
                    }}
                  />
                ) : null}

                {section === 'scans' ? (
                  <ScansAndAuditView
                    scans={data.scans}
                    auditEntries={data.auditEntries}
                    onOpenNewScan={() => setShowNewScanDrawer(true)}
                  />
                ) : null}

                {section === 'settings' ? (
                  <div className="nf-card" id="view-settings">
                    <h2 style={{ marginTop: 0 }}>Nightfall Platform Controls &amp; Model Routing</h2>
                    <p className="nf-prose-p">
                      Active Repository: <code>https://github.com/maceip/Nightfall</code>
                    </p>
                    <p className="nf-prose-p">
                      Subprojects: <strong>Nightfall Red Team</strong> (Disposable L7-Proxied
                      Assessment) &amp; <strong>Nightfall Defense Factory</strong> (Hermetic
                      Two-Stage Patch Synthesis).
                    </p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                      <button
                        type="button"
                        className="nf-btn-outline"
                        onClick={() => {
                          navigateTo('red-team');
                          setRtStage('composer');
                        }}
                      >
                        Configure Red Team Campaign
                      </button>
                      <button
                        type="button"
                        className="nf-btn-outline"
                        onClick={() => navigateTo('scans')}
                      >
                        Inspect Hash-Chained Audit Ledger
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            /* Red Team Subproject Views */
            <>
              {rtStage === 'composer' ? (
                <RedTeamComposerView
                  models={data.models}
                  onJumpToActiveCampaign={() => setRtStage('live-campaign')}
                  onPrepareCampaign={async (input) => {
                    const res = await prepareCampaignApi(input);
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            campaigns: [
                              res.campaign,
                              ...prev.campaigns.filter((c) => c.id !== res.campaign.id),
                            ],
                          }
                        : prev,
                    );
                    setActiveCampaignId(res.campaign.id);
                    setYamlDraft(res.campaign.yamlText);
                    setRtStage('yaml-builder');
                  }}
                />
              ) : null}

              {rtStage === 'yaml-builder' && activeCampaign ? (
                <CampaignYamlSplitView
                  campaign={activeCampaign}
                  yamlDraft={yamlDraft || activeCampaign.yamlText}
                  onChangeYaml={setYamlDraft}
                  onLaunchCampaign={async () => {
                    const res = await launchCampaignApi(
                      activeCampaign.id,
                      yamlDraft || activeCampaign.yamlText,
                    );
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            campaigns: prev.campaigns.map((c) =>
                              c.id === activeCampaign.id
                                ? res?.campaign ?? {
                                    ...c,
                                    yamlText: yamlDraft || c.yamlText,
                                    status: 'running',
                                    headlineStatus: 'Scanning endpoints and files',
                                  }
                                : c,
                            ),
                          }
                        : prev,
                    );
                    setRtStage('live-campaign');
                  }}
                />
              ) : null}

              {rtStage === 'live-campaign' && activeCampaign ? (
                <LiveCampaignWorkspaceView
                  campaign={activeCampaign}
                  campaignFindings={rtFindings}
                  approvals={data.approvals}
                  killSwitchEngaged={data.killSwitchEngaged}
                  onOpenYamlBuilder={() => {
                    setYamlDraft(activeCampaign.yamlText);
                    setRtStage('yaml-builder');
                  }}
                  onSelectFindingReport={(f) => {
                    setRtReportFindingId(f.id);
                    setRtStage('finding-report');
                  }}
                  onResolveApproval={async (approvalId, decision) => {
                    const res = await resolveApprovalApi(approvalId, decision);
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            approvals: prev.approvals.map((a) =>
                              a.id === approvalId
                                ? res?.approval ?? { ...a, status: decision }
                                : a,
                            ),
                          }
                        : prev,
                    );
                  }}
                />
              ) : null}

              {rtStage === 'finding-report' ? (
                <div className="nf-scroll-canvas">
                  <RedTeamFindingReportView
                    finding={rtReportFinding}
                    evidence={rtReportEvidence}
                    onBackToCampaign={() => setRtStage('live-campaign')}
                    onPromoteToDefenseFactory={(finding) => {
                      setActiveFindingId(finding.id);
                      navigateTo('finding-detail');
                      handleStartOrOpenFixForFinding(finding);
                    }}
                  />
                </div>
              ) : null}
            </>
          )}

          {/* Stacked Slide-Over Drawers */}
          {activeFixDrawer ? (
            <FixWithNightfallDrawer
              fix={activeFixDrawer}
              onClose={() => setActiveFixDrawerId(null)}
              onFollowUp={handleFollowUpFix}
              onMergeAndVerify={handleMergeAndVerifyFix}
            />
          ) : null}

          {showNewScanDrawer ? (
            <NewScanDrawer
              repositories={data.repositories}
              onClose={() => setShowNewScanDrawer(false)}
              onSubmitScan={handleSubmitNewScan}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
