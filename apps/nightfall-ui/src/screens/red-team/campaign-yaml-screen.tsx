import React, { useState } from 'react';
import type { RedTeamCampaignRun } from '@nightfall/core-contracts';
import { ArrowUpIcon, Badge, Button, Card, DownloadIcon } from '@nightfall/ui-kit';

export type CampaignYamlScreenProps = {
  campaign: RedTeamCampaignRun;
  yamlDraft: string;
  onChangeYaml: (next: string) => void;
  onLaunchCampaign: () => Promise<void>;
};

export function CampaignYamlScreen({
  campaign,
  yamlDraft,
  onChangeYaml,
  onLaunchCampaign,
}: CampaignYamlScreenProps): React.ReactElement {
  const [launching, setLaunching] = useState(false);

  function handleDownloadYaml(): void {
    const blob = new Blob([yamlDraft], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'campaign.yaml';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      id="view-campaign-yaml-builder"
      className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2 lg:divide-x lg:divide-primary-200"
    >
      <div className="flex flex-col justify-between overflow-y-auto p-6">
        <div className="space-y-4">
          <div className="text-center text-xs text-primary-500">Today · Nightfall Red Team</div>

          <div className="ml-auto max-w-md rounded-2xl border border-primary-200 bg-primary-100 px-4 py-2.5 text-[13.5px] text-ink">
            Use <span className="font-semibold">Nightfall Red Team</span> to assess:{' '}
            <span className="font-mono text-xs">{campaign.targetUrl}</span>
          </div>

          <div className="space-y-3 text-[13.5px] leading-relaxed text-primary-800">
            <p className="m-0">
              I&apos;ve prepared <span className="inline-code">campaign.yaml</span> (v5) for{' '}
              <span className="font-semibold text-ink">{campaign.name}</span>, binding your source
              archive (<span className="inline-code">{campaign.sourceLabel}</span>) and synthetic
              workspace credentials inside an isolated Microsoft LiteBox sandbox.
            </p>
            <p className="m-0">
              The manifest enforces Ed25519-signed L7 egress rules across HTTP (
              <span className="inline-code">GET</span>, <span className="inline-code">POST</span>)
              and WebSocket (<span className="inline-code">/ws/documents</span>) with strict
              rate-limit and duration ceilings.
            </p>
          </div>
        </div>

        <Card className="mt-6 space-y-2.5 bg-primary-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-medium text-ink">Launch the campaign</span>
            <Badge variant="accent">Ed25519 Scope v5</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-primary-600">
              {campaign.askForApproval
                ? 'HITL approval gate active for Tier 2+ probes'
                : 'Tier 1 passive & safe differential probes locked'}
            </span>
            <Button
              id="btn-launch-campaign"
              size="sm"
              disabled={launching}
              title="Sign ScopeManifest & launch campaign"
              onClick={async () => {
                setLaunching(true);
                try {
                  await onLaunchCampaign();
                } finally {
                  setLaunching(false);
                }
              }}
            >
              <span>Launch the campaign</span>
              <ArrowUpIcon size={14} />
            </Button>
          </div>
        </Card>
      </div>

      <div className="flex min-h-[360px] flex-col bg-primary-50/50">
        <div className="flex items-center justify-between border-b border-primary-200 bg-surface px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-ink">campaign.yaml</span>
            <Badge variant="informational">v5</Badge>
          </div>
          <Button id="btn-download-v5-yaml" variant="outline" size="sm" onClick={handleDownloadYaml}>
            <DownloadIcon size={14} />
            <span>Download v5 YAML</span>
          </Button>
        </div>

        <textarea
          id="textarea-campaign-yaml"
          value={yamlDraft}
          onChange={(e) => onChangeYaml(e.target.value)}
          spellCheck={false}
          aria-label="Editable campaign.yaml v5 manifest"
          className="w-full flex-1 resize-none border-0 bg-primary-50/40 p-4 font-mono text-xs leading-relaxed text-ink outline-none"
        />
      </div>
    </div>
  );
}
