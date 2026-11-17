import React, { useMemo, useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import type {
  ModelDescriptor,
  RedTeamCampaignRun,
  SignedScopeManifest,
} from '@nightfall/core-contracts';
import {
  ArrowUpIcon,
  Badge,
  ChevronDownIcon,
  FileCodeIcon,
  HandApprovalIcon,
  MicIcon,
  NightfallHorizonIcon,
  PlusIcon,
  RedTeamSparkIcon,
  YamlCodeViewer,
  cn,
} from '@nightfall/ui-kit';
import { ScopeAuthorizationPanel } from './scope-authorization-panel.js';

export type CampaignYamlScreenProps = {
  campaign: RedTeamCampaignRun;
  yamlDraft: string;
  models?: ModelDescriptor[];
  onChangeYaml: (next: string) => void;
  onLaunchCampaign: (signedManifest?: unknown) => Promise<void>;
};

type ManifestSummary = {
  maxDuration: string;
  maxRps: string;
  httpMethods: string;
  wsPath: string;
  credentialActors: string;
};

function summarizeYamlDraft(yamlText: string): ManifestSummary {
  const durationMatch = /max_duration:\s*([^\s#]+)/.exec(yamlText);
  const rpsMatch = /max_requests_per_second:\s*(\d+)/.exec(yamlText);
  const methodsMatch = /methods:\s*\[([^\]]+)\]/.exec(yamlText);
  const wsPathsMatch = /paths:\s*\[([^\]]+)\]/.exec(yamlText);

  const actorMatches: string[] = [];
  const credBlock = /credentials:\s*\n((?:[ ]{2,}[A-Za-z0-9_-]+:.*\n?)*)/.exec(yamlText);
  if (credBlock?.[1]) {
    for (const line of credBlock[1].split('\n')) {
      const m = /^[ ]{2}([A-Za-z0-9_-]+):/.exec(line);
      if (m?.[1]) actorMatches.push(m[1]);
    }
  }

  return {
    maxDuration: durationMatch?.[1] ?? '8h',
    maxRps: rpsMatch?.[1] ?? '10',
    httpMethods: methodsMatch?.[1]?.trim() ?? 'GET, POST',
    wsPath: wsPathsMatch?.[1]?.trim() ?? '/ws/documents',
    credentialActors:
      actorMatches.length > 0
        ? actorMatches.map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(' and ')
        : 'Alice and Bob',
  };
}

export function CampaignYamlScreen({
  campaign,
  yamlDraft,
  models = [],
  onChangeYaml,
  onLaunchCampaign,
}: CampaignYamlScreenProps): React.ReactElement {
  const [launching, setLaunching] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [launchMessage, setLaunchMessage] = useState<string>('Launch the campaign.');
  const [signedManifest, setSignedManifest] = useState<SignedScopeManifest | undefined>(
    undefined,
  );

  const summary = useMemo(() => summarizeYamlDraft(yamlDraft), [yamlDraft]);
  const activeModelLabel = useMemo(() => {
    const found = models.find((m) => m.id === campaign.modelId) ?? models[0];
    return found?.label ?? 'GPT-6 Cyber';
  }, [models, campaign.modelId]);

  function handleDownloadYaml(): void {
    if (typeof URL.createObjectURL !== 'function') return;
    const blob = new Blob([yamlDraft], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'campaign.yaml';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleLaunch(): Promise<void> {
    if (launching) return;
    setLaunching(true);
    try {
      await onLaunchCampaign(signedManifest);
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div
      id="view-campaign-yaml-builder"
      className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-hairline overflow-hidden bg-canvas lg:grid-cols-[42%_58%] lg:divide-x lg:divide-y-0"
    >
      <div className="flex min-h-0 flex-col justify-between overflow-y-auto bg-canvas p-6">
        <div className="space-y-5">
          <div className="text-center text-[11.5px] text-ink-muted">Today 10:27 AM</div>

          <div className="ml-auto max-w-[88%] rounded-2xl bg-pill px-4 py-3 text-[13.5px] leading-relaxed text-ink">
            <div>
              Use{' '}
              <span className="inline-flex items-center gap-1 font-medium text-accent-blue">
                <RedTeamSparkIcon size={13} className="text-accent-blue" />
                <span>Nightfall Red Team</span>
              </span>{' '}
              to assess: <span className="break-all">{campaign.targetUrl}</span>
            </div>
            {campaign.objective ? (
              <div className="mt-1 text-[12.5px] text-ink-secondary">{campaign.objective}</div>
            ) : null}
          </div>

          <div className="space-y-3 text-[13.5px] leading-[1.6] text-ink">
            <p className="m-0">
              I&apos;ve prepared{' '}
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="font-mono text-[13px] font-medium text-accent-blue underline underline-offset-4 transition-opacity hover:opacity-80 cursor-pointer"
              >
                campaign.yaml
              </button>{' '}
              for <span className="font-medium">{campaign.name}</span>, using the attached source
              (<span className="font-mono text-[12.5px]">{campaign.sourceLabel}</span>) and
              bearer-token credentials for {summary.credentialActors}.
            </p>
            <p className="m-0">
              It covers HTTP (<span className="font-mono text-[12.5px]">{summary.httpMethods}</span>
              ) and WebSocket (<span className="font-mono text-[12.5px]">{summary.wsPath}</span>),
              with an <span className="font-mono text-[12.5px]">{summary.maxDuration}</span> limit
              and up to <span className="font-mono text-[12.5px]">{summary.maxRps}</span> requests
              per second inside an isolated Microsoft LiteBox sandbox.
            </p>
          </div>

          <ScopeAuthorizationPanel
            yamlDraft={yamlDraft}
            fallbackTargetUrl={campaign.targetUrl}
            signedManifest={signedManifest}
            onSignedManifestChange={setSignedManifest}
          />
        </div>

        <div className="mt-6 rounded-3xl border border-hairline-strong bg-canvas px-4 py-3 shadow-xs">
          <input
            id="input-launch-campaign-note"
            type="text"
            aria-label="Campaign launch command"
            value={launchMessage}
            onChange={(e) => setLaunchMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleLaunch();
              }
            }}
            className="w-full border-0 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-muted"
          />

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <HStack gap={2} align="center">
              <span className="inline-flex size-6 items-center justify-center text-ink-secondary">
                <PlusIcon size={15} />
              </span>
              <span
                title={
                  campaign.askForApproval
                    ? 'HITL approval gate active for Tier 2+ probes'
                    : 'Tier 1 differential probes auto-authorized'
                }
                className="inline-flex items-center gap-1 text-[12px] text-ink-muted"
              >
                <HandApprovalIcon size={14} />
                <span className="hidden sm:inline">
                  {campaign.askForApproval ? 'HITL gate' : 'Tier 1 auto'}
                </span>
              </span>
            </HStack>

            <HStack gap={2} align="center">
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ink">
                <NightfallHorizonIcon size={13} className="text-ink-secondary" />
                <span>{activeModelLabel}</span>
                <span className="font-semibold text-accent-violet">Ultra</span>
                <ChevronDownIcon size={12} className="text-ink-muted" />
              </span>
              <span className="inline-flex size-6 items-center justify-center text-ink-muted" aria-hidden="true">
                <MicIcon size={14} />
              </span>
              <button
                id="btn-launch-campaign"
                type="button"
                disabled={launching}
                aria-label="Launch the campaign"
                title="Sign ScopeManifest & launch campaign"
                onClick={() => void handleLaunch()}
                className="inline-flex size-8 items-center justify-center rounded-full bg-accent-blue text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
              >
                <ArrowUpIcon size={16} strokeWidth={2.2} />
              </button>
            </HStack>
          </div>
        </div>
      </div>

      <div className="flex min-h-[360px] flex-col overflow-hidden bg-canvas">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-hairline bg-canvas px-4">
          <HStack gap={2} align="center">
            <FileCodeIcon size={15} className="text-ink-secondary" />
            <span className="font-mono text-[13px] font-semibold text-ink">campaign.yaml</span>
            <Badge variant="informational">v5</Badge>
          </HStack>

          <HStack gap={3} align="center">
            <button
              id="btn-toggle-yaml-edit-mode"
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors cursor-pointer',
                editMode ? 'bg-pill text-ink' : 'text-ink-secondary hover:bg-sidebar hover:text-ink',
              )}
            >
              {editMode ? 'Highlighted' : 'Edit YAML'}
            </button>

            <button
              id="btn-download-v5-yaml"
              type="button"
              onClick={handleDownloadYaml}
              className="text-[12.5px] font-medium text-ink-secondary underline underline-offset-4 transition-colors hover:text-ink cursor-pointer"
            >
              Download v5 YAML
            </button>
          </HStack>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas">
          <YamlCodeViewer
            yamlText={yamlDraft}
            onChange={onChangeYaml}
            editable={editMode}
            textareaId="textarea-campaign-yaml"
          />
        </div>
      </div>
    </div>
  );
}
