import React, { useMemo, useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Token } from '@astryxdesign/core/Token';
import type { ModelDescriptor, RedTeamCampaignRun, RepositoryRecord } from '@nightfall/core-contracts';
import {
  ArrowUpIcon, ChevronDownIcon, CloudTerminalHeroIcon, FolderIcon, GlobeIcon, HandApprovalIcon,
  MantisClawIcon, MicIcon, NightfallHorizonIcon, PlusIcon, PromptInput, PromptInputAction,
  PromptInputActions, PromptInputTextarea, RedTeamSparkIcon, SettingsIcon, cn,
} from '@nightfall/ui-kit';

export type ComposerScreenProps = {
  models: ModelDescriptor[];
  activeCampaign?: RedTeamCampaignRun;
  activeFindingsCount: number;
  repositories?: RepositoryRecord[];
  selectedRepo?: string;
  openSastFindingsCount?: number;
  onPrepareCampaign: (input: {
    prompt: string;
    targetUrl: string;
    sourceLabel: string;
    askForApproval: boolean;
    modelId: string;
  }) => Promise<void>;
  onJumpToActiveCampaign: () => void;
};

function formatRepoTitle(slug?: string): string {
  if (!slug || slug === 'all' || slug === 'northstar-docs') return 'Northstar Docs';
  return slug.split(/[-_/]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function formatTargetPillLabel(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host.includes('northstar') || host === 'localhost' || host.startsWith('127.') ? 'Northstar staging' : host;
  } catch {
    return 'Staging target';
  }
}

export function ComposerScreen({
  models, activeCampaign, activeFindingsCount, repositories = [], selectedRepo,
  openSastFindingsCount, onPrepareCampaign, onJumpToActiveCampaign,
}: ComposerScreenProps): React.ReactElement {
  const defaultRepoSlug = selectedRepo && selectedRepo !== 'all' ? selectedRepo : repositories[0]?.name ?? 'northstar-docs';
  const initialUrl = activeCampaign?.targetUrl ?? 'https://staging.northstardocs.com';

  const [repoSlug, setRepoSlug] = useState<string>(defaultRepoSlug);
  const [repoMenuOpen, setRepoMenuOpen] = useState<boolean>(false);
  const [showTargetConfig, setShowTargetConfig] = useState<boolean>(false);
  const [targetUrl, setTargetUrl] = useState<string>(initialUrl);
  const [sourceLabel, setSourceLabel] = useState<string>(activeCampaign?.sourceLabel ?? `${defaultRepoSlug}-source.tar.gz`);
  const [prompt, setPrompt] = useState<string>(`to assess: ${initialUrl}`);
  const [askForApproval, setAskForApproval] = useState<boolean>(true);
  const [modelId, setModelId] = useState<string>(models[0]?.id ?? 'gpt-6-cyber-ultra');
  const [busy, setBusy] = useState<boolean>(false);

  const safeFindingsCount = Number.isFinite(activeFindingsCount) ? activeFindingsCount : 0;
  const seedCount = Number.isFinite(openSastFindingsCount) ? Number(openSastFindingsCount) : safeFindingsCount;
  const repoTitle = useMemo(() => formatRepoTitle(repoSlug), [repoSlug]);
  const modelOptions = useMemo(
    () => (models.length > 0 ? models : [{ id: 'gpt-6-cyber-ultra', label: 'GPT-6 Cyber Ultra', provider: 'openai' as const, tier: 'frontier-cyber' as const }]),
    [models],
  );

  async function handleSubmit(): Promise<void> {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const normalizedPrompt = prompt.trim().toLowerCase().startsWith('use ')
        ? prompt.trim()
        : `Use Nightfall Red Team ${prompt.trim()}`;
      await onPrepareCampaign({
        prompt: normalizedPrompt, targetUrl, sourceLabel: sourceLabel.trim() || `${repoSlug}-source.tar.gz`, askForApproval, modelId,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="view-redteam-composer"
      className="flex flex-1 flex-col items-center justify-center bg-canvas px-6 pb-12"
    >
      {activeCampaign ? (
        <button
          id="btn-open-running-campaign"
          type="button"
          onClick={onJumpToActiveCampaign}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-sidebar px-3.5 py-1 text-[12px] font-medium text-ink-secondary transition-colors hover:bg-pill hover:text-ink cursor-pointer"
        >
          <StatusDot
            variant={activeCampaign.status === 'running' ? 'success' : 'neutral'}
            isPulsing={activeCampaign.status === 'running'}
            label={activeCampaign.status}
          />
          <span>
            Active campaign: <strong className="font-semibold text-ink">{activeCampaign.name}</strong>{' '}
            ({safeFindingsCount} {safeFindingsCount === 1 ? 'finding' : 'findings'}) →
          </span>
        </button>
      ) : null}

      <div className="mb-8 flex max-w-2xl flex-col items-center text-center">
        <CloudTerminalHeroIcon size={46} className="mb-4 text-ink opacity-45" />
        <div className="relative">
          <h1 className="m-0 text-[28px] leading-[1.22] font-semibold tracking-[-0.02em] text-ink">
            What should we work on in{' '}
            <button
              id="btn-composer-repo-trigger"
              type="button"
              onClick={() => (repositories.length > 1 ? setRepoMenuOpen((v) => !v) : setShowTargetConfig((v) => !v))}
              className="inline font-semibold text-ink underline decoration-primary-400 decoration-dotted underline-offset-4 transition-opacity hover:opacity-80 cursor-pointer"
            >
              {repoTitle}
            </button>
            ?
          </h1>

          {repoMenuOpen && repositories.length > 1 ? (
            <div className="absolute top-full right-0 z-20 mt-2 min-w-52 rounded-2xl border border-hairline-strong bg-canvas p-1.5 text-left shadow-md">
              {repositories.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => {
                    setRepoSlug(repo.name);
                    setSourceLabel(`${repo.name}-source.tar.gz`);
                    setRepoMenuOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-[12.5px] cursor-pointer',
                    repo.name === repoSlug ? 'bg-pill font-semibold text-ink' : 'text-ink-secondary hover:bg-sidebar hover:text-ink',
                  )}
                >
                  <span>{formatRepoTitle(repo.name)}</span>
                  <span className="font-mono text-[11px] text-ink-muted">{repo.openFindingsCount}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="w-full max-w-[720px] rounded-[24px] bg-pill p-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-1.5 text-[12.5px] text-ink-secondary">
          <HStack gap={3} align="center" wrap="wrap">
            <button
              type="button"
              onClick={() => setShowTargetConfig((v) => !v)}
              className="inline-flex items-center gap-1.5 font-medium text-ink transition-opacity hover:opacity-80 cursor-pointer"
            >
              <GlobeIcon size={14} className="text-ink-secondary" />
              <span className="size-2 rounded-full bg-status-green-dot" />
              <span>{formatTargetPillLabel(targetUrl)}</span>
            </button>
            <span className="inline-flex items-center gap-1.5 text-ink-secondary">
              <FolderIcon size={14} />
              <span>{repoTitle}</span>
            </span>
            <Token size="sm" color="purple" icon={<MantisClawIcon size={12} />} label={`${seedCount} SAST + Mantis seeds`} />
          </HStack>

          <button
            id="btn-toggle-composer-settings"
            type="button"
            aria-label="Configure staging target and source archive"
            aria-expanded={showTargetConfig}
            onClick={() => setShowTargetConfig((v) => !v)}
            className="inline-flex size-6 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-canvas hover:text-ink cursor-pointer"
          >
            <SettingsIcon size={14} />
          </button>
        </div>

        {showTargetConfig ? (
          <div className="mx-2 mb-1.5 grid grid-cols-1 gap-2 rounded-2xl border border-hairline-strong bg-canvas px-3.5 py-2.5 sm:grid-cols-2">
            <label className="space-y-1 text-[11.5px] font-medium text-ink-secondary">
              <span>Staging target URL</span>
              <input
                id="input-composer-target-url"
                type="url"
                value={targetUrl}
                onChange={(e) => {
                  const nextUrl = e.target.value;
                  setTargetUrl(nextUrl);
                  setPrompt((prev) => prev.replace(/https?:\/\/[^\s]+/, nextUrl) || `Use Nightfall Red Team to assess: ${nextUrl}`);
                }}
                className="h-8 w-full rounded-xl border border-hairline-strong bg-sidebar px-2.5 font-mono text-[12px] text-ink outline-none"
              />
            </label>
            <label className="space-y-1 text-[11.5px] font-medium text-ink-secondary">
              <span>Source archive / workspace snapshot</span>
              <input
                id="input-composer-source-label"
                type="text"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                className="h-8 w-full rounded-xl border border-hairline-strong bg-sidebar px-2.5 font-mono text-[12px] text-ink outline-none"
              />
            </label>
          </div>
        ) : null}

        <PromptInput
          value={prompt}
          onValueChange={(next) => {
            setPrompt(next);
            const urlMatch = /https?:\/\/[^\s]+/.exec(next);
            if (urlMatch?.[0]) setTargetUrl(urlMatch[0]);
          }}
          onSubmit={() => void handleSubmit()}
          disabled={busy}
          className="rounded-[20px] border border-hairline-strong bg-canvas px-4 py-3 shadow-xs"
        >
          <div className="flex items-center gap-1.5 py-0.5 text-[14px]">
            <span className="shrink-0 text-ink">Use</span>
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-accent-blue">
              <RedTeamSparkIcon size={14} className="text-accent-blue" />
              <span>Nightfall Red Team</span>
            </span>
            <PromptInputTextarea
              id="textarea-redteam-prompt"
              rows={1}
              placeholder="to assess: https://staging.northstardocs.com"
              className="min-h-0 flex-1 px-0.5 py-0.5 text-[14px]"
            />
          </div>

          <PromptInputActions className="mt-2.5 px-0">
            <div className="flex items-center gap-1.5">
              <PromptInputAction tooltip="Attach source archive or synthetic credentials">
                <button
                  type="button"
                  aria-label="Attach context"
                  onClick={() => setShowTargetConfig((v) => !v)}
                  className="inline-flex size-7 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-pill hover:text-ink cursor-pointer"
                >
                  <PlusIcon size={16} />
                </button>
              </PromptInputAction>

              <button
                id="btn-toggle-ask-approval"
                type="button"
                onClick={() => setAskForApproval((v) => !v)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors cursor-pointer',
                  askForApproval ? 'bg-pill text-ink' : 'text-ink-muted hover:bg-sidebar hover:text-ink',
                )}
              >
                <HandApprovalIcon size={14} />
                <span>{askForApproval ? 'Ask for approval' : 'Auto within Tier 1'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12.5px] text-ink">
                <NightfallHorizonIcon size={13} className="text-ink-secondary" />
                <select
                  id="select-redteam-model"
                  aria-label="Red Team reasoning model"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="appearance-none bg-transparent pr-1 text-[12.5px] font-medium text-ink outline-none cursor-pointer"
                >
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <span className="text-[12px] font-semibold text-accent-violet">Ultra</span>
                <ChevronDownIcon size={12} className="text-ink-muted" />
              </div>

              <span className="inline-flex size-7 items-center justify-center text-ink-muted" aria-hidden="true">
                <MicIcon size={15} />
              </span>

              <button
                id="btn-prepare-campaign"
                type="button"
                disabled={busy || !prompt.trim()}
                aria-label="Prepare campaign.yaml"
                onClick={() => void handleSubmit()}
                className="inline-flex size-8 items-center justify-center rounded-full bg-accent-blue text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
              >
                <ArrowUpIcon size={16} strokeWidth={2.2} />
              </button>
            </div>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  );
}
