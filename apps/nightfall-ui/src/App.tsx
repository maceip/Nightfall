import React, { useMemo, useState } from 'react';
import type { FixProposal, NewScanRequest, Severity } from '@nightfall/core-contracts';
import { Button, Card, ShieldAlertIcon, TooltipProvider } from '@nightfall/ui-kit';
import {
  type PrimarySection,
  type RedTeamStage,
  ThreeColumnShell,
} from './components/three-column-shell.js';
import { useNightfallWorkspace } from './hooks/use-nightfall-workspace.js';
import { FindingDetailScreen } from './screens/defense-factory/finding-detail-screen.js';
import { FindingsScreen } from './screens/defense-factory/findings-screen.js';
import { FixDrawer } from './screens/defense-factory/fix-drawer.js';
import { FixesScreen } from './screens/defense-factory/fixes-screen.js';
import { NewScanDrawer } from './screens/defense-factory/new-scan-drawer.js';
import { OverviewScreen } from './screens/defense-factory/overview-screen.js';
import { RepositoriesScreen } from './screens/defense-factory/repositories-screen.js';
import { ScansAuditScreen } from './screens/defense-factory/scans-audit-screen.js';
import { SettingsScreen } from './screens/defense-factory/settings-screen.js';
import { CampaignYamlScreen } from './screens/red-team/campaign-yaml-screen.js';
import { ComposerScreen } from './screens/red-team/composer-screen.js';
import { FindingReportScreen } from './screens/red-team/finding-report-screen.js';
import { LiveCampaignScreen } from './screens/red-team/live-campaign-screen.js';

export type { PrimarySection, RedTeamStage };

export function App(): React.ReactElement {
  const ws = useNightfallWorkspace();
  const { data } = ws;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [section, setSection] = useState<PrimarySection>('findings');
  const [navHistory, setNavHistory] = useState<PrimarySection[]>(['findings']);
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | null>(null);
  const [showNewScanDrawer, setShowNewScanDrawer] = useState(false);
  const [showFixesToast, setShowFixesToast] = useState(true);
  const [rtStage, setRtStage] = useState<RedTeamStage>('live-campaign');
  const [rtReportFindingId, setRtReportFindingId] = useState<string>('');

  function navigateTo(next: PrimarySection, nextStage?: RedTeamStage): void {
    setSection(next);
    if (nextStage) setRtStage(nextStage);
    setNavHistory((prev) => [...prev.slice(-12), next]);
  }

  const activeCampaign = useMemo(
    () => data?.campaigns.find((c) => c.id === ws.activeCampaignId) ?? data?.campaigns[0],
    [data, ws.activeCampaignId],
  );
  const activeFinding = useMemo(
    () => data?.findings.find((f) => f.id === ws.activeFindingId) ?? data?.findings[0],
    [data, ws.activeFindingId],
  );
  const activeFixDrawer = useMemo(
    () => (ws.activeFixDrawerId ? data?.fixes.find((fx) => fx.id === ws.activeFixDrawerId) : undefined),
    [data, ws.activeFixDrawerId],
  );

  if (ws.loadError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface p-6 text-ink">
        <Card id="nightfall-bootstrap-error" className="max-w-md space-y-3 p-6">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-rose-800">
            <ShieldAlertIcon size={18} />
            <span>Nightfall API Unavailable</span>
          </div>
          <p className="m-0 text-[13px] text-primary-700">{ws.loadError}</p>
          <Button onClick={() => void ws.loadBootstrap()}>Retry connection</Button>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface text-sm font-medium text-primary-600">
        Loading Nightfall Workspace…
      </div>
    );
  }

  async function handleNewScan(req: NewScanRequest): Promise<void> {
    await ws.submitNewScan(req);
    navigateTo('scans');
  }

  const proposedCount = data.fixes.filter((f) => f.status === 'proposed').length;
  const rtFindings = data.findings.filter((f) => f.campaignId === activeCampaign?.id);
  const rtReportFinding =
    data.findings.find((f) => f.id === rtReportFindingId) ?? rtFindings[0] ?? data.findings[0];
  const rtReportEvidence = rtReportFinding
    ? data.evidenceBundles.find((ev) => ev.findingId === rtReportFinding.id)
    : undefined;

  return (
    <TooltipProvider>
      <ThreeColumnShell
        section={section}
        rtStage={rtStage}
        sidebarOpen={sidebarOpen}
        canGoBack={navHistory.length > 1}
        connectedLiveApi={data.connectedLiveApi}
        killSwitchEngaged={data.killSwitchEngaged}
        proposedFixesCount={proposedCount}
        openFindingsCount={data.overview.openFindingsCount}
        selectedRepo={selectedRepo}
        repositories={data.repositories}
        activeFinding={activeFinding}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onHistoryBack={() => {
          if (navHistory.length > 1) {
            const prev = navHistory[navHistory.length - 2]!;
            setNavHistory((h) => h.slice(0, -1));
            setSection(prev);
          }
        }}
        onNavigate={navigateTo}
        onOpenNewScan={() => setShowNewScanDrawer(true)}
        onToggleKillSwitch={() => void ws.toggleKillSwitch()}
        onChangeSelectedRepo={setSelectedRepo}
        onMarkDuplicate={(id) => void ws.markDuplicate(id)}
        onContinueFix={(f) => void ws.startOrOpenFix(f)}
      >
        {ws.actionError ? (
          <div className="flex items-center justify-between border-b border-rose-200 bg-rose-50 px-6 py-2 text-xs text-rose-800">
            <span>{ws.actionError}</span>
            <Button variant="ghost" size="sm" onClick={() => ws.setActionError(null)}>Dismiss</Button>
          </div>
        ) : null}

        {section !== 'red-team' ? (
          <div className="flex-1 overflow-y-auto p-6">
            {section === 'overview' ? (
              <OverviewScreen
                overview={data.overview}
                fixes={data.fixes}
                onNavigateFindings={(sev) => {
                  setSelectedSeverity(sev ?? null);
                  navigateTo('findings');
                }}
                onNavigateFixes={() => navigateTo('fixes')}
                onSelectFix={(fix: FixProposal) => ws.setActiveFixDrawerId(fix.id)}
              />
            ) : null}
            {section === 'findings' ? (
              <FindingsScreen
                overview={data.overview}
                findings={data.findings}
                selectedRepo={selectedRepo}
                selectedSeverity={selectedSeverity}
                onSelectSeverity={setSelectedSeverity}
                onSelectFinding={(f) => {
                  ws.setActiveFindingId(f.id);
                  navigateTo('finding-detail');
                }}
                onNavigateFixes={() => navigateTo('fixes')}
              />
            ) : null}
            {section === 'finding-detail' && activeFinding ? (
              <FindingDetailScreen
                finding={activeFinding}
                linkedFix={data.fixes.find((fx) => fx.id === activeFinding.fixId)}
                onOpenFixDrawer={() => void ws.startOrOpenFix(activeFinding)}
                onMarkDuplicate={(id) => void ws.markDuplicate(id)}
              />
            ) : null}
            {section === 'fixes' ? (
              <FixesScreen
                fixes={data.fixes}
                showToast={showFixesToast}
                onDismissToast={() => setShowFixesToast(false)}
                onSelectFix={(fix) => ws.setActiveFixDrawerId(fix.id)}
              />
            ) : null}
            {section === 'repositories' ? (
              <RepositoriesScreen
                repositories={data.repositories}
                onToggleRepoScans={async (repoId) => {
                  const res = await ws.toggleRepositoryCoverageApi(repoId);
                  ws.setData((p) => (p ? { ...p, repositories: p.repositories.map((r) => (r.id === repoId ? res.repository : r)) } : p));
                }}
                onQuickScanRepo={(repoName) =>
                  handleNewScan({ mode: 'cloud', repository: repoName, method: 'repository_scan', scope: 'full_repository' })
                }
              />
            ) : null}
            {section === 'scans' ? (
              <ScansAuditScreen scans={data.scans} auditEntries={data.auditEntries} onOpenNewScan={() => setShowNewScanDrawer(true)} />
            ) : null}
            {section === 'settings' ? (
              <SettingsScreen
                sandboxToolchain={data.sandboxToolchain}
                models={data.models}
                auditEntryCount={data.auditEntries.length}
                killSwitchEngaged={data.killSwitchEngaged}
                onOpenRedTeamComposer={() => navigateTo('red-team', 'composer')}
                onOpenAuditLedger={() => navigateTo('scans')}
              />
            ) : null}
          </div>
        ) : (
          <>
            {rtStage === 'composer' ? (
              <ComposerScreen
                models={data.models}
                activeCampaign={activeCampaign}
                activeFindingsCount={rtFindings.length}
                onJumpToActiveCampaign={() => setRtStage('live-campaign')}
                onPrepareCampaign={async (input) => {
                  const res = await ws.prepareCampaignApi(input);
                  ws.setData((p) => (p ? { ...p, campaigns: [res.campaign, ...p.campaigns.filter((c) => c.id !== res.campaign.id)] } : p));
                  ws.setActiveCampaignId(res.campaign.id);
                  ws.setYamlDraft(res.campaign.yamlText);
                  setRtStage('yaml-builder');
                }}
              />
            ) : null}
            {rtStage === 'yaml-builder' && activeCampaign ? (
              <CampaignYamlScreen
                campaign={activeCampaign}
                yamlDraft={ws.yamlDraft || activeCampaign.yamlText}
                onChangeYaml={ws.setYamlDraft}
                onLaunchCampaign={async () => {
                  const res = await ws.launchCampaignApi(activeCampaign.id, ws.yamlDraft || activeCampaign.yamlText);
                  ws.setData((p) => (p ? { ...p, campaigns: p.campaigns.map((c) => (c.id === activeCampaign.id ? res.campaign : c)) } : p));
                  setRtStage('live-campaign');
                }}
              />
            ) : null}
            {rtStage === 'live-campaign' && activeCampaign ? (
              <LiveCampaignScreen
                campaign={activeCampaign}
                campaignFindings={rtFindings}
                approvals={data.approvals}
                killSwitchEngaged={data.killSwitchEngaged}
                onOpenYamlBuilder={() => {
                  ws.setYamlDraft(activeCampaign.yamlText);
                  setRtStage('yaml-builder');
                }}
                onSelectFindingReport={(f) => {
                  setRtReportFindingId(f.id);
                  setRtStage('finding-report');
                }}
                onResolveApproval={async (approvalId, decision) => {
                  const res = await ws.resolveApprovalApi(approvalId, decision);
                  ws.setData((p) => (p ? { ...p, approvals: p.approvals.map((a) => (a.id === approvalId ? res.approval : a)) } : p));
                }}
              />
            ) : null}
            {rtStage === 'finding-report' && rtReportFinding ? (
              <div className="flex-1 overflow-y-auto p-6">
                <FindingReportScreen
                  finding={rtReportFinding}
                  evidence={rtReportEvidence}
                  onBackToCampaign={() => setRtStage('live-campaign')}
                  onPromoteToDefenseFactory={(finding) => {
                    ws.setActiveFindingId(finding.id);
                    navigateTo('finding-detail');
                    void ws.startOrOpenFix(finding);
                  }}
                />
              </div>
            ) : null}
          </>
        )}

        <FixDrawer
          fix={activeFixDrawer}
          onClose={() => ws.setActiveFixDrawerId(null)}
          onFollowUp={async (fixId, message) => {
            const res = await ws.sendFixFollowUpApi(fixId, message);
            ws.setData((p) => (p ? { ...p, fixes: p.fixes.map((fx) => (fx.id === fixId ? res.fix : fx)) } : p));
          }}
          onMergeAndVerify={async (fixId) => {
            const res = await ws.mergeAndVerifyFixApi(fixId);
            ws.setData((p) =>
              p
                ? {
                    ...p,
                    fixes: p.fixes.map((fx) => (fx.id === fixId ? res.fix : fx)),
                    findings: res.finding ? p.findings.map((f) => (f.id === res.finding!.id ? res.finding! : f)) : p.findings,
                    overview: res.overview ?? p.overview,
                  }
                : p,
            );
          }}
        />

        <NewScanDrawer
          open={showNewScanDrawer}
          repositories={data.repositories}
          onClose={() => setShowNewScanDrawer(false)}
          onSubmitScan={handleNewScan}
        />
      </ThreeColumnShell>
    </TooltipProvider>
  );
}
