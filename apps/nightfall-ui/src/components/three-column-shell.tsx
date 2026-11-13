import React from 'react';
import type { FindingRecord, RepositoryRecord } from '@nightfall/core-contracts';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Badge,
  Button,
  CodeIcon,
  FileCodeIcon,
  FilterIcon,
  FolderIcon,
  GitBranchIcon,
  GridIcon,
  HistoryClockIcon,
  HomeWorkspaceIcon,
  MoreHorizontalIcon,
  NightfallHorizonIcon,
  PlusIcon,
  RadarIcon,
  RedTeamCampaignBadge,
  ScanIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SidebarLeftIcon,
  cn,
} from '@nightfall/ui-kit';
import { platformBridge, type WindowControlsOverlayMetrics } from '../bridge/platform-bridge';

export type PrimarySection =
  | 'overview'
  | 'fixes'
  | 'findings'
  | 'finding-detail'
  | 'repositories'
  | 'scans'
  | 'red-team'
  | 'settings';

export type RedTeamStage = 'composer' | 'yaml-builder' | 'live-campaign' | 'finding-report';

export type ThreeColumnShellProps = {
  section: PrimarySection;
  rtStage: RedTeamStage;
  sidebarOpen: boolean;
  canGoBack: boolean;
  connectedLiveApi: boolean;
  killSwitchEngaged: boolean;
  proposedFixesCount: number;
  openFindingsCount: number;
  selectedRepo: string;
  repositories: RepositoryRecord[];
  activeFinding?: FindingRecord;
  onToggleSidebar: () => void;
  onHistoryBack: () => void;
  onNavigate: (section: PrimarySection, rtStage?: RedTeamStage) => void;
  onOpenNewScan: () => void;
  onToggleKillSwitch: () => void;
  onChangeSelectedRepo: (repo: string) => void;
  onMarkDuplicate?: (findingId: string) => void;
  onContinueFix?: (finding: FindingRecord) => void;
  children: React.ReactNode;
};

const SECTION_TITLES: Record<Exclude<PrimarySection, 'red-team'>, string> = {
  overview: 'Overview',
  fixes: 'Fixes',
  findings: 'Findings',
  'finding-detail': 'Finding Detail',
  repositories: 'Repositories',
  scans: 'Scans & Audit',
  settings: 'Settings',
};

export function ThreeColumnShell(props: ThreeColumnShellProps): React.ReactElement {
  const {
    section,
    rtStage,
    sidebarOpen,
    canGoBack,
    connectedLiveApi,
    killSwitchEngaged,
    proposedFixesCount,
    openFindingsCount,
    selectedRepo,
    repositories,
    activeFinding,
    onToggleSidebar,
    onHistoryBack,
    onNavigate,
    onOpenNewScan,
    onToggleKillSwitch,
    onChangeSelectedRepo,
    onMarkDuplicate,
    onContinueFix,
    children,
  } = props;

  const railButtons = [
    { id: 'rail-btn-home', title: 'Red Team Prompt Composer', active: section === 'red-team' && rtStage === 'composer', icon: <HomeWorkspaceIcon size={17} />, onClick: () => onNavigate('red-team', 'composer') },
    { id: 'rail-btn-yaml', title: 'Campaign YAML Manifest', active: section === 'red-team' && rtStage === 'yaml-builder', icon: <FileCodeIcon size={17} />, onClick: () => onNavigate('red-team', 'yaml-builder') },
    { id: 'rail-btn-history', title: 'Scans & Immutable Audit Ledger', active: section === 'scans', icon: <HistoryClockIcon size={17} />, onClick: () => onNavigate('scans') },
    { id: 'rail-btn-redteam', title: 'Nightfall Red Team Live Campaign', active: section === 'red-team' && rtStage === 'live-campaign', icon: <RadarIcon size={17} />, onClick: () => onNavigate('red-team', 'live-campaign') },
    { title: 'More', active: false, icon: <MoreHorizontalIcon size={17} /> },
    { id: 'rail-btn-nightfall', title: 'Nightfall Security', active: section !== 'red-team', icon: <NightfallHorizonIcon size={18} />, onClick: () => onNavigate('overview'), dividerBefore: true },
    { id: 'rail-btn-fixes', title: 'Defense Factory Fixes', active: section === 'fixes', icon: <GitBranchIcon size={17} />, onClick: () => onNavigate('fixes') },
    { id: 'rail-btn-repos', title: 'Repositories', active: section === 'repositories', icon: <GridIcon size={17} />, onClick: () => onNavigate('repositories') },
  ];

  const topTabs = [
    { id: 'top-tab-defense-factory', label: 'Nightfall Defense Factory', active: section !== 'red-team', icon: <NightfallHorizonIcon size={15} />, onClick: () => onNavigate('findings') },
    { id: 'top-tab-campaign-yaml', label: 'campaign.yaml', active: section === 'red-team' && rtStage === 'yaml-builder', icon: <FileCodeIcon size={14} />, onClick: () => onNavigate('red-team', 'yaml-builder') },
    { id: 'top-tab-red-team', label: 'Nightfall Red Team', active: section === 'red-team' && (rtStage === 'live-campaign' || rtStage === 'finding-report'), icon: <RedTeamCampaignBadge size={15} />, onClick: () => onNavigate('red-team', 'live-campaign') },
  ];

  const [overlayMetrics, setOverlayMetrics] = React.useState<WindowControlsOverlayMetrics>(
    () => platformBridge.getWindowControlsMetrics?.() ?? {},
  );
  const isElectron = platformBridge.isElectron;

  React.useEffect(() => {
    if (!platformBridge.onWindowControlsMetricsChanged) return undefined;
    return platformBridge.onWindowControlsMetricsChanged((metrics) => {
      setOverlayMetrics(metrics);
    });
  }, []);

  const headerStyle: React.CSSProperties = {
    ...(overlayMetrics.leftPaddingPx ? { paddingLeft: `${overlayMetrics.leftPaddingPx}px` } : {}),
    ...(overlayMetrics.rightPaddingPx ? { paddingRight: `${overlayMetrics.rightPaddingPx}px` } : {}),
  };

  return (
    <div id="nightfall-three-col-app" className="flex h-screen w-screen flex-col overflow-hidden bg-surface text-ink">
      <header
        style={headerStyle}
        className="wc-drag flex h-10 shrink-0 items-center justify-between border-b border-primary-200 bg-primary-100/80 px-3"
      >
        <div className="wc-no-drag flex items-center gap-1">
          {!isElectron && (
            <div className="mr-2 flex items-center gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-rose-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-emerald-400" />
            </div>
          )}
          <Button id="btn-history-back" variant="ghost" size="icon-sm" title="Back" disabled={!canGoBack} onClick={onHistoryBack}>
            <ArrowLeftIcon size={16} />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Forward" disabled>
            <ArrowRightIcon size={16} />
          </Button>
          <Button id="btn-toggle-sidebar" variant="ghost" size="icon-sm" title="Toggle Nightfall navigation sidebar" onClick={onToggleSidebar}>
            <SidebarLeftIcon size={16} />
          </Button>
        </div>

        <div className="wc-no-drag flex items-center gap-1" role="tablist" aria-label="Workspace tabs">
          {topTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              id={t.id}
              onClick={t.onClick}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer',
                t.active ? 'border border-primary-200 bg-surface text-ink shadow-2xs' : 'text-primary-600 hover:bg-primary-200/60 hover:text-ink',
              )}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
          <Button id="btn-new-redteam-prompt-tab" variant="ghost" size="icon-sm" title="New Red Team assessment prompt" onClick={() => onNavigate('red-team', 'composer')}>
            <PlusIcon size={15} />
          </Button>
        </div>

        <div className="wc-no-drag flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-surface px-2.5 py-0.5 text-xs font-medium text-primary-700">
            <span className={cn('size-2 rounded-full', connectedLiveApi ? 'bg-emerald-600' : 'bg-amber-500')} />
            <span>{connectedLiveApi ? 'Live API + SSE' : 'Disconnected'}</span>
          </span>
          <Button id="btn-emergency-kill-switch" variant="destructive" size="sm" data-engaged={killSwitchEngaged ? 'true' : 'false'} onClick={onToggleKillSwitch}>
            <ShieldAlertIcon size={14} />
            <span>{killSwitchEngaged ? 'Kill-Switch Engaged (Resume)' : 'Halt Sandboxes'}</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-primary-200 bg-primary-100/60 py-2.5" aria-label="Global workspace switcher">
          {railButtons.map((rb, idx) => (
            <React.Fragment key={rb.id ?? idx}>
              {rb.dividerBefore ? <div className="my-1 h-px w-6 bg-primary-200" /> : null}
              <Button id={rb.id} variant={rb.active ? 'secondary' : 'ghost'} size="icon" title={rb.title} onClick={rb.onClick}>
                {rb.icon}
              </Button>
            </React.Fragment>
          ))}
        </aside>

        {sidebarOpen ? (
          <nav id="nightfall-product-sidebar" aria-label="Nightfall navigation" className="flex w-56 shrink-0 flex-col justify-between border-r border-primary-200 bg-primary-50 px-2.5 py-3">
            <div>
              <div className="mb-2.5 flex items-center justify-between px-2">
                <span className="text-[15px] font-semibold tracking-tight text-ink">Nightfall</span>
                <Button variant="ghost" size="icon-sm" title="Collapse sidebar" onClick={onToggleSidebar}>
                  <SidebarLeftIcon size={15} />
                </Button>
              </div>

              <div className="space-y-0.5 tabular-nums">
                <SidebarNavItem id="nav-btn-new-scan" active={false} icon={<PlusIcon size={16} />} label="New scan" onClick={onOpenNewScan} />
                <SidebarNavItem id="nav-btn-overview" active={section === 'overview'} icon={<GridIcon size={15} />} label="Overview" onClick={() => onNavigate('overview')} />
                <SidebarNavItem
                  id="nav-btn-fixes"
                  active={section === 'fixes'}
                  icon={<CodeIcon size={15} />}
                  label="Fixes"
                  trailing={
                    <span className="inline-flex items-center gap-1.5 text-xs text-primary-600">
                      <span>{proposedFixesCount}</span>
                      {proposedFixesCount > 0 ? <span className="size-1.5 rounded-full bg-blue-600" /> : null}
                    </span>
                  }
                  onClick={() => onNavigate('fixes')}
                />
                <SidebarNavItem
                  id="nav-btn-findings"
                  active={section === 'findings' || section === 'finding-detail'}
                  icon={<FilterIcon size={15} />}
                  label="Findings"
                  trailing={<span className="text-xs text-primary-600">{openFindingsCount}</span>}
                  onClick={() => onNavigate('findings')}
                />
                <SidebarNavItem id="nav-btn-repositories" active={section === 'repositories'} icon={<FolderIcon size={15} />} label="Repositories" onClick={() => onNavigate('repositories')} />
                <SidebarNavItem id="nav-btn-scans" active={section === 'scans'} icon={<ScanIcon size={15} />} label="Scans" onClick={() => onNavigate('scans')} />
                <div className="my-2 h-px bg-primary-200" />
                <SidebarNavItem id="nav-btn-red-team" active={section === 'red-team'} icon={<ShieldCheckIcon size={15} />} label="Red Team" trailing={<Badge variant="accent">New</Badge>} onClick={() => onNavigate('red-team', 'live-campaign')} />
              </div>
            </div>
            <SidebarNavItem id="nav-btn-settings" active={section === 'settings'} icon={<SettingsIcon size={15} />} label="Settings" onClick={() => onNavigate('settings')} />
          </nav>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          {section !== 'red-team' ? (
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-primary-200 px-6">
              <div className="flex items-center gap-2">
                {section === 'finding-detail' && activeFinding ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => onNavigate('findings')}>Findings</Button>
                    <span className="text-primary-400">/</span>
                    <h1 className="m-0 text-sm font-semibold text-ink">{activeFinding.id}</h1>
                  </>
                ) : (
                  <>
                    <select id="select-global-repo-filter" value={selectedRepo} onChange={(e) => onChangeSelectedRepo(e.target.value)} className="h-7 rounded-md border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-ink outline-none">
                      <option value="all">All repos</option>
                      {repositories.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                    <span className="text-primary-400">/</span>
                    <h1 className="m-0 text-sm font-semibold text-ink">{SECTION_TITLES[section]}</h1>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {section === 'finding-detail' && activeFinding ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => onMarkDuplicate?.(activeFinding.id)}>Mark as duplicate</Button>
                    <Button id="btn-topbar-continue-fix" variant="default" size="sm" onClick={() => onContinueFix?.(activeFinding)}>
                      {activeFinding.fixId ? 'Continue fix' : 'Fix with Nightfall'}
                    </Button>
                  </>
                ) : section === 'repositories' ? (
                  <Button id="btn-enable-security-scans" size="sm" onClick={onOpenNewScan}>Enable security scans</Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarNavItem({
  id,
  active,
  icon,
  label,
  trailing,
  onClick,
}: {
  id: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer',
        active ? 'bg-primary-200/75 text-ink' : 'text-primary-700 hover:bg-primary-100 hover:text-ink',
      )}
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </span>
      {trailing}
    </button>
  );
}
