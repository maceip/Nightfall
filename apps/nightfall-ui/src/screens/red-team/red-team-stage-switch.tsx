import React from 'react';
import type {
  EvidenceBundle,
  FindingRecord,
  HitlApprovalRequest,
  ModelDescriptor,
  RedTeamCampaignRun,
  RepositoryRecord,
} from '@nightfall/core-contracts';
import type { RedTeamStage } from '../../components/three-column-shell.js';
import { CampaignYamlScreen } from './campaign-yaml-screen.js';
import { ComposerScreen } from './composer-screen.js';
import { FindingReportScreen } from './finding-report-screen.js';
import { LiveCampaignScreen } from './live-campaign-screen.js';

export type RedTeamStageSwitchProps = {
  rtStage: RedTeamStage;
  models: ModelDescriptor[];
  activeCampaign?: RedTeamCampaignRun;
  campaigns?: RedTeamCampaignRun[];
  rtFindings: FindingRecord[];
  rtReportFinding?: FindingRecord;
  rtReportEvidence?: EvidenceBundle;
  approvals: HitlApprovalRequest[];
  killSwitchEngaged: boolean;
  yamlDraft: string;
  repositories?: RepositoryRecord[];
  selectedRepo?: string;
  openSastFindingsCount?: number;
  onChangeStage: (stage: RedTeamStage) => void;
  onChangeYaml: (yaml: string) => void;
  onSelectCampaign?: (campaignId: string) => void;
  onSelectFindingReport: (finding: FindingRecord) => void;
  onPrepareCampaign: (input: {
    prompt: string;
    targetUrl: string;
    sourceLabel?: string;
    askForApproval: boolean;
    modelId: string;
  }) => Promise<void>;
  onLaunchCampaign: (signedManifest?: unknown) => Promise<void>;
  onResolveApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
  onPromoteToDefenseFactory: (finding: FindingRecord) => void;
  onToggleKillSwitch?: () => void;
};

export function RedTeamStageSwitch({
  rtStage,
  models,
  activeCampaign,
  campaigns,
  rtFindings,
  rtReportFinding,
  rtReportEvidence,
  approvals,
  killSwitchEngaged,
  yamlDraft,
  repositories,
  selectedRepo,
  openSastFindingsCount,
  onChangeStage,
  onChangeYaml,
  onSelectCampaign,
  onSelectFindingReport,
  onPrepareCampaign,
  onLaunchCampaign,
  onResolveApproval,
  onPromoteToDefenseFactory,
  onToggleKillSwitch,
}: RedTeamStageSwitchProps): React.ReactElement {
  return (
    <>
      {rtStage === 'composer' ? (
        <ComposerScreen
          models={models}
          activeCampaign={activeCampaign}
          activeFindingsCount={rtFindings.length}
          repositories={repositories}
          selectedRepo={selectedRepo}
          openSastFindingsCount={openSastFindingsCount}
          onJumpToActiveCampaign={() => onChangeStage('live-campaign')}
          onPrepareCampaign={onPrepareCampaign}
        />
      ) : null}

      {rtStage === 'yaml-builder' && activeCampaign ? (
        <CampaignYamlScreen
          campaign={activeCampaign}
          yamlDraft={yamlDraft || activeCampaign.yamlText}
          models={models}
          onChangeYaml={onChangeYaml}
          onLaunchCampaign={onLaunchCampaign}
        />
      ) : null}

      {rtStage === 'live-campaign' && activeCampaign ? (
        <LiveCampaignScreen
          campaign={activeCampaign}
          campaigns={campaigns}
          campaignFindings={rtFindings}
          approvals={approvals}
          killSwitchEngaged={killSwitchEngaged}
          onSelectCampaign={onSelectCampaign}
          onOpenYamlBuilder={() => {
            onChangeYaml(activeCampaign.yamlText);
            onChangeStage('yaml-builder');
          }}
          onSelectFindingReport={onSelectFindingReport}
          onResolveApproval={onResolveApproval}
          onToggleKillSwitch={onToggleKillSwitch}
        />
      ) : null}

      {rtStage === 'finding-report' && rtReportFinding ? (
        <div className="flex-1 overflow-y-auto bg-canvas px-8 py-7">
          <FindingReportScreen
            finding={rtReportFinding}
            evidence={rtReportEvidence}
            campaignName={activeCampaign?.name}
            onBackToCampaign={() => onChangeStage('live-campaign')}
            onPromoteToDefenseFactory={onPromoteToDefenseFactory}
          />
        </div>
      ) : null}
    </>
  );
}
