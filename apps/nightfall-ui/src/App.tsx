import React, { useEffect, useMemo, useState } from 'react';
import { Theme, type ThemeMode } from '@astryxdesign/core/theme';
import { VStack } from '@astryxdesign/core/VStack';
import type { FixProposal, NewScanRequest, Severity } from '@nightfall/core-contracts';
import { Button, Card, nightfallTheme, ShieldAlertIcon, TooltipProvider } from '@nightfall/ui-kit';
import { ApprovalsDrawer } from './components/approvals-drawer.js';
import { type PrimarySection, type RedTeamStage, ThreeColumnShell } from './components/three-column-shell.js';
import { useNightfallRouter } from './hooks/use-nightfall-router.js';
import { useNightfallWorkspace } from './hooks/use-nightfall-workspace.js';
import { selectRepoScopedWorkspace } from './hooks/workspace-selectors.js';
import { FindingDetailScreen } from './screens/defense-factory/finding-detail-screen.js';
import { FindingsScreen } from './screens/defense-factory/findings-screen.js';
import { FixDrawer } from './screens/defense-factory/fix-drawer.js';
import { FixesScreen } from './screens/defense-factory/fixes-screen.js';
import { NewScanDrawer } from './screens/defense-factory/new-scan-drawer.js';
import { OverviewScreen } from './screens/defense-factory/overview-screen.js';
import { RepositoriesScreen } from './screens/defense-factory/repositories-screen.js';
import { ScansAuditScreen } from './screens/defense-factory/scans-audit-screen.js';
import { ScorecardScreen } from './screens/defense-factory/scorecard-screen.js';
import { SettingsScreen } from './screens/defense-factory/settings-screen.js';
import { RedTeamStageSwitch } from './screens/red-team/red-team-stage-switch.js';

export type { PrimarySection, RedTeamStage };

const THEME_STORAGE_KEY = 'nightfall.themeMode';

function readInitialThemeMode(): Exclude<ThemeMode, 'system'> {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore restricted storage contexts
  }
  return 'light';
}

export type AppProps = {
  themeModeOverride?: Exclude<ThemeMode, 'system'>;
  onBackToLanding?: () => void;
};

export function App({ themeModeOverride, onBackToLanding }: AppProps = {}): React.ReactElement {
  const ws = useNightfallWorkspace();
  const { data } = ws;
  const router = useNightfallRouter();
  const { section, rtStage, sidebarOpen, navigateTo } = router;

  const [storedThemeMode] = useState<Exclude<ThemeMode, 'system'>>(readInitialThemeMode);
  const themeMode = themeModeOverride ?? storedThemeMode;
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | null>(null);
  const [showNewScanDrawer, setShowNewScanDrawer] = useState(false);
  const [showApprovalsDrawer, setShowApprovalsDrawer] = useState(false);
  const [showFixesToast, setShowFixesToast] = useState(true);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = themeMode;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // ignore storage write errors
    }
  }, [themeMode]);

  const scoped = useMemo(
    () => (data ? selectRepoScopedWorkspace(data, selectedRepo) : null),
    [data, selectedRepo],
  );
  const activeCampaign = useMemo(
    () => data?.campaigns.find((c) => c.id === ws.activeCampaignId) ?? data?.campaigns[0],
    [data, ws.activeCampaignId],
  );
  const resolvedFindingId = router.findingId || ws.activeFindingId;
  const activeFinding = useMemo(
    () => data?.findings.find((f) => f.id === resolvedFindingId) ?? data?.findings[0],
    [data, resolvedFindingId],
  );
  const activeFixDrawer = useMemo(
    () => (ws.activeFixDrawerId ? data?.fixes.find((fx) => fx.id === ws.activeFixDrawerId) : undefined),
    [data, ws.activeFixDrawerId],
  );

  if (ws.loadError) {
    return (
      <Theme theme={nightfallTheme} mode={themeMode}>
        <div className="flex h-dvh w-full items-center justify-center bg-shell p-6 text-ink">
          <Card id="nightfall-bootstrap-error" className="max-w-md border-hairline-strong bg-canvas p-6">
            <VStack gap={3}>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-status-danger-ink">
                <ShieldAlertIcon size={18} />
                <span>Nightfall API Unavailable</span>
              </div>
              <p className="m-0 text-[13px] text-ink-secondary">{ws.loadError}</p>
              <div>
                <Button onClick={() => void ws.loadBootstrap()}>Retry connection</Button>
              </div>
            </VStack>
          </Card>
        </div>
      </Theme>
    );
  }

  if (!data || !scoped) {
    return (
      <Theme theme={nightfallTheme} mode={themeMode}>
        <div className="flex h-dvh w-full items-center justify-center bg-shell text-sm font-medium text-ink-secondary">
          Loading Nightfall Workspace…
        </div>
      </Theme>
    );
  }

  async function handleNewScan(req: NewScanRequest): Promise<void> {
    await ws.submitNewScan(req);
    navigateTo(req.method === 'scorecard_scan' ? 'scorecard' : 'scans');
  }

  const proposedCount = scoped.fixes.filter((f) => f.status === 'proposed').length;
  const pendingApprovalsCount = data.approvals.filter((a) => a.status === 'pending').length;
  const rtFindings = data.findings.filter((f) => f.campaignId === activeCampaign?.id);
  const rtReportFinding =
    (router.rtReportFindingId ? data.findings.find((f) => f.id === router.rtReportFindingId) : undefined) ??
    rtFindings[0] ??
    data.findings[0];
  const rtReportEvidence = rtReportFinding
    ? data.evidenceBundles.find((ev) => ev.findingId === rtReportFinding.id)
    : undefined;

  return (
    <Theme theme={nightfallTheme} mode={themeMode}>
      <TooltipProvider>
        <ThreeColumnShell
          section={section}
          rtStage={rtStage}
          sidebarOpen={sidebarOpen}
          canGoBack={router.canGoBack}
          canGoForward={router.canGoForward}
          killSwitchEngaged={data.killSwitchEngaged}
          pendingApprovalsCount={pendingApprovalsCount}
          proposedFixesCount={proposedCount}
          openFindingsCount={scoped.overview.openFindingsCount}
          averageScorecardScore={scoped.overview.averageScorecardScore}
          selectedRepo={selectedRepo}
          repositories={data.repositories}
          activeFinding={activeFinding}
          onToggleSidebar={router.toggleSidebar}
          onOpenDefenseFactory={() => {
            router.setSidebarOpen(true);
            navigateTo('findings');
          }}
          onHistoryBack={router.goBack}
          onHistoryForward={router.goForward}
          onNavigate={navigateTo}
          onOpenNewScan={() => setShowNewScanDrawer(true)}
          onOpenApprovals={() => setShowApprovalsDrawer(true)}
          onToggleKillSwitch={() => void ws.toggleKillSwitch()}
          onChangeSelectedRepo={setSelectedRepo}
          onMarkDuplicate={(id) => void ws.markDuplicate(id)}
          onContinueFix={(f) => void ws.startOrOpenFix(f)}
          onBackToLanding={onBackToLanding}
        >
          {ws.actionError ? (
            <div className="flex items-center justify-between border-b border-hairline-strong bg-status-danger px-6 py-2 text-xs text-status-danger-ink">
              <span>{ws.actionError}</span>
              <Button variant="ghost" size="sm" onClick={() => ws.setActionError(null)}>Dismiss</Button>
            </div>
          ) : null}

          {section !== 'red-team' ? (
            <div className={section === 'finding-detail' ? 'flex-1 overflow-y-auto bg-canvas' : 'flex-1 overflow-y-auto bg-canvas p-6'}>
              {section === 'overview' ? (
                <OverviewScreen
                  overview={scoped.overview}
                  findings={scoped.findings}
                  fixes={scoped.fixes}
                  scorecardReports={data.scorecardReports}
                  mantisToolchain={data.mantisToolchain}
                  onNavigateFindings={(sev) => {
                    setSelectedSeverity(sev ?? null);
                    navigateTo('findings');
                  }}
                  onNavigateFixes={() => navigateTo('fixes')}
                  onSelectFix={(fix: FixProposal) => ws.setActiveFixDrawerId(fix.id)}
                  onNavigateScorecard={() => navigateTo('scorecard')}
                  onNavigateSettings={() => navigateTo('settings')}
                />
              ) : null}
              {section === 'findings' ? (
                <FindingsScreen
                  overview={scoped.overview}
                  findings={scoped.findings}
                  selectedRepo={selectedRepo}
                  selectedSeverity={selectedSeverity}
                  onSelectSeverity={setSelectedSeverity}
                  onSelectFinding={(f) => {
                    ws.setActiveFindingId(f.id);
                    navigateTo('finding-detail', { findingId: f.id });
                  }}
                  onNavigateFixes={() => navigateTo('fixes')}
                />
              ) : null}
              {section === 'finding-detail' && activeFinding ? (
                <FindingDetailScreen finding={activeFinding} linkedFix={data.fixes.find((fx) => fx.id === activeFinding.fixId)} onOpenFixDrawer={() => void ws.startOrOpenFix(activeFinding)} onMarkDuplicate={(id, dupOf) => void ws.markDuplicate(id, dupOf)} />
              ) : null}
              {section === 'fixes' ? (
                <FixesScreen fixes={scoped.fixes} showToast={showFixesToast} onDismissToast={() => setShowFixesToast(false)} onSelectFix={(fix) => ws.setActiveFixDrawerId(fix.id)} />
              ) : null}
              {section === 'repositories' ? (
                <RepositoriesScreen
                  repositories={data.repositories}
                  onToggleRepoScans={ws.toggleRepositoryCoverage}
                  onQuickScanRepo={(repoName) => handleNewScan({ mode: 'cloud', repository: repoName, method: 'repository_scan', scope: 'full_repository' })}
                  onOpenRepoScorecard={(repoName) => { setSelectedRepo(repoName); navigateTo('scorecard'); }}
                />
              ) : null}
              {section === 'scorecard' ? (
                <ScorecardScreen
                  reports={data.scorecardReports}
                  repositories={data.repositories}
                  findings={data.findings}
                  selectedRepo={selectedRepo}
                  onSelectRepo={setSelectedRepo}
                  onRunScorecardScan={ws.runScorecardScan}
                  onFixFinding={(finding) => { ws.setActiveFindingId(finding.id); void ws.startOrOpenFix(finding); }}
                />
              ) : null}
              {section === 'scans' ? (
                <ScansAuditScreen scans={scoped.scans} auditEntries={data.auditEntries} onOpenNewScan={() => setShowNewScanDrawer(true)} />
              ) : null}
              {section === 'settings' ? (
                <SettingsScreen
                  sandboxToolchain={data.sandboxToolchain}
                  scorecardToolchain={data.scorecardToolchain}
                  mantisToolchain={data.mantisToolchain}
                  models={data.models}
                  auditEntryCount={data.auditEntries.length}
                  killSwitchEngaged={data.killSwitchEngaged}
                  connectedLiveApi={data.connectedLiveApi}
                  repositories={data.repositories}
                  selectedRepo={selectedRepo}
                  onToggleKillSwitch={() => void ws.toggleKillSwitch()}
                  onOpenRedTeamComposer={() => navigateTo('red-team', 'composer')}
                  onOpenAuditLedger={() => navigateTo('scans')}
                />
              ) : null}
            </div>
          ) : (
            <RedTeamStageSwitch
              rtStage={rtStage}
              models={data.models}
              activeCampaign={activeCampaign}
              campaigns={data.campaigns}
              onSelectCampaign={(id) => {
                ws.setActiveCampaignId(id);
                const found = data.campaigns.find((c) => c.id === id);
                if (found) ws.setYamlDraft(found.yamlText);
              }}
              repositories={data.repositories}
              selectedRepo={selectedRepo}
              openSastFindingsCount={scoped.overview.openFindingsCount}
              rtFindings={rtFindings}
              rtReportFinding={rtReportFinding}
              rtReportEvidence={rtReportEvidence}
              approvals={data.approvals}
              killSwitchEngaged={data.killSwitchEngaged}
              yamlDraft={ws.yamlDraft}
              onChangeStage={(stage) => navigateTo('red-team', stage)}
              onChangeYaml={ws.setYamlDraft}
              onSelectFindingReport={(f) => navigateTo('red-team', { rtStage: 'finding-report', rtReportFindingId: f.id })}
              onPrepareCampaign={async (input) => { await ws.prepareCampaign(input); navigateTo('red-team', 'yaml-builder'); }}
              onLaunchCampaign={async (signedManifest?: unknown) => {
                if (!activeCampaign) return;
                const launched = await ws.launchCampaign(activeCampaign.id, ws.yamlDraft || activeCampaign.yamlText, signedManifest);
                if (launched) navigateTo('red-team', 'live-campaign');
              }}
              onResolveApproval={ws.resolveApproval}
              onPromoteToDefenseFactory={(finding) => {
                ws.setActiveFindingId(finding.id);
                navigateTo('finding-detail', { findingId: finding.id });
                void ws.startOrOpenFix(finding);
              }}
            />
          )}

          <FixDrawer fix={activeFixDrawer} onClose={() => ws.setActiveFixDrawerId(null)} onFollowUp={ws.followUpFix} onMergeAndVerify={ws.mergeAndVerifyFix} />
          <NewScanDrawer open={showNewScanDrawer} repositories={data.repositories} onClose={() => setShowNewScanDrawer(false)} onSubmitScan={handleNewScan} />
          <ApprovalsDrawer open={showApprovalsDrawer} approvals={data.approvals} onClose={() => setShowApprovalsDrawer(false)} onResolveApproval={ws.resolveApproval} />
        </ThreeColumnShell>
      </TooltipProvider>
    </Theme>
  );
}
