import React from 'react';
import type {
  EvidenceBundle,
  FindingRecord,
  HitlApprovalRequest,
  ModelDescriptor,
  RedTeamCampaignRun,
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
  rtFindings: FindingRecord[];
  rtReportFinding?: FindingRecord;
  rtReportEvidence?: EvidenceBundle;
  approvals: HitlApprovalRequest[];
  killSwitchEngaged: boolean;
  yamlDraft: string;
  onChangeStage: (stage: RedTeamStage) => void;
  onChangeYaml: (yaml: string) => void;
  onSelectFindingReport: (finding: FindingRecord) => void;
  onPrepareCampaign: (input: {
    prompt: string;
    targetUrl: string;
    sourceLabel?: string;
    askForApproval: boolean;
    modelId: string;
  }) => Promise<void>;
  onLaunchCampaign: () => Promise<void>;
  onResolveApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
  onPromoteToDefenseFactory: (finding: FindingRecord) => void;
};

export function RedTeamStageSwitch({
  rtStage,
  models,
  activeCampaign,
  rtFindings,
  rtReportFinding,
  rtReportEvidence,
  approvals,
  killSwitchEngaged,
  yamlDraft,
  onChangeStage,
  onChangeYaml,
  onSelectFindingReport,
  onPrepareCampaign,
  onLaunchCampaign,
  onResolveApproval,
  onPromoteToDefenseFactory,
}: RedTeamStageSwitchProps): React.ReactElement {
  return (
    <>
      {rtStage === 'composer' ? (
        <ComposerScreen
          models={models}
          activeCampaign={activeCampaign}
          activeFindingsCount={rtFindings.length}
          onJumpToActiveCampaign={() => onChangeStage('live-campaign')}
          onPrepareCampaign={onPrepareCampaign}
        />
      ) : null}
      {rtStage === 'yaml-builder' && activeCampaign ? (
        <CampaignYamlScreen
          campaign={activeCampaign}
          yamlDraft={yamlDraft || activeCampaign.yamlText}
          onChangeYaml={onChangeYaml}
          onLaunchCampaign={onLaunchCampaign}
        />
      ) : null}
      {rtStage === 'live-campaign' && activeCampaign ? (
        <LiveCampaignScreen
          campaign={activeCampaign}
          campaignFindings={rtFindings}
          approvals={approvals}
          killSwitchEngaged={killSwitchEngaged}
          onOpenYamlBuilder={() => {
            onChangeYaml(activeCampaign.yamlText);
            onChangeStage('yaml-builder');
          }}
          onSelectFindingReport={onSelectFindingReport}
          onResolveApproval={onResolveApproval}
        />
      ) : null}
      {rtStage === 'finding-report' && rtReportFinding ? (
        <div className="flex-1 overflow-y-auto p-6">
          <FindingReportScreen
            finding={rtReportFinding}
            evidence={rtReportEvidence}
            onBackToCampaign={() => onChangeStage('live-campaign')}
            onPromoteToDefenseFactory={onPromoteToDefenseFactory}
          />
        </div>
      ) : null}
    </>
  );
}
