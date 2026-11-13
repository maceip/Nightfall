import React, { useState } from 'react';
import type { ModelDescriptor, RedTeamCampaignRun } from '@nightfall/core-contracts';
import {
  ArrowUpIcon,
  Badge,
  Button,
  FolderIcon,
  GlobeIcon,
  HandApprovalIcon,
  PlusIcon,
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
  TerminalIcon,
} from '@nightfall/ui-kit';

export type ComposerScreenProps = {
  models: ModelDescriptor[];
  activeCampaign?: RedTeamCampaignRun;
  activeFindingsCount: number;
  onPrepareCampaign: (input: {
    prompt: string;
    targetUrl: string;
    sourceLabel: string;
    askForApproval: boolean;
    modelId: string;
  }) => Promise<void>;
  onJumpToActiveCampaign: () => void;
};

export function ComposerScreen({
  models,
  activeCampaign,
  activeFindingsCount,
  onPrepareCampaign,
  onJumpToActiveCampaign,
}: ComposerScreenProps): React.ReactElement {
  const initialUrl = activeCampaign?.targetUrl ?? 'https://staging.northstardocs.com';
  const [targetUrl, setTargetUrl] = useState(initialUrl);
  const [prompt, setPrompt] = useState(`Use Nightfall Red Team to assess: ${initialUrl}`);
  const [askForApproval, setAskForApproval] = useState(true);
  const [modelId, setModelId] = useState(models[0]?.id ?? 'gpt-6-cyber-ultra');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(): Promise<void> {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      await onPrepareCampaign({
        prompt,
        targetUrl,
        sourceLabel: activeCampaign?.sourceLabel ?? 'northstar-docs-source.tar.gz',
        askForApproval,
        modelId,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="view-redteam-composer"
      className="flex flex-1 flex-col items-center justify-center px-6 py-10"
    >
      <div className="mb-7 flex max-w-xl flex-col items-center text-center">
        <div className="mb-3 inline-flex size-11 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-600">
          <TerminalIcon size={24} />
        </div>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink">
          What should we assess in{' '}
          <span className="underline decoration-primary-400 decoration-dotted underline-offset-4">
            Northstar Docs
          </span>
          ?
        </h1>
        {activeCampaign ? (
          <div className="mt-4">
            <Button
              id="btn-open-running-campaign"
              variant="outline"
              size="sm"
              onClick={onJumpToActiveCampaign}
            >
              View active campaign: {activeCampaign.name} ({activeFindingsCount} findings) →
            </Button>
          </div>
        ) : null}
      </div>

      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/70 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-200 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <GlobeIcon size={14} className="text-emerald-600" />
              <span>Northstar staging</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-primary-600">
              <FolderIcon size={14} />
              <span>Northstar Docs</span>
            </span>
          </div>
          <Badge variant="accent">Microsoft LiteBox Sandbox</Badge>
        </div>

        <PromptInput
          value={prompt}
          onValueChange={(next) => {
            setPrompt(next);
            const urlMatch = /https?:\/\/[^\s]+/.exec(next);
            if (urlMatch?.[0]) {
              setTargetUrl(urlMatch[0]);
            }
          }}
          onSubmit={() => void handleSubmit()}
          disabled={busy}
          className="rounded-none border-0 bg-surface p-3.5 shadow-none"
        >
          <PromptInputTextarea
            id="textarea-redteam-prompt"
            rows={3}
            placeholder="Describe the staging target URL, credentials, and security invariants to assess..."
          />
          <PromptInputActions>
            <div className="flex items-center gap-2">
              <PromptInputAction tooltip="Attach source archive or synthetic credentials">
                <Button variant="ghost" size="icon-sm" aria-label="Attach context">
                  <PlusIcon size={15} />
                </Button>
              </PromptInputAction>

              <Button
                id="btn-toggle-ask-approval"
                variant={askForApproval ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setAskForApproval((v) => !v)}
              >
                <HandApprovalIcon size={13} />
                <span>{askForApproval ? 'Ask for approval' : 'Auto within Tier 1'}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <select
                id="select-redteam-model"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="h-7 rounded-md border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-ink outline-none"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>

              <Button
                id="btn-prepare-campaign"
                size="icon-sm"
                disabled={busy || !prompt.trim()}
                aria-label="Prepare campaign.yaml"
                onClick={() => void handleSubmit()}
              >
                <ArrowUpIcon size={15} />
              </Button>
            </div>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  );
}
