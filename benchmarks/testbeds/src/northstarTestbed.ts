import {
  STAGING_ALICE_TOKEN,
  STAGING_ALICE_WORKSPACE_ID,
  STAGING_BOB_TOKEN,
  STAGING_BOB_WORKSPACE_ID,
  STAGING_WS_A_CANARY,
  STAGING_WS_CHANNEL_CANARY,
  StagingTargetServer,
  startStagingTargetServer,
  type StartedStagingTargetServer,
  type StagingHitRecord,
  type StagingPrincipal,
  type StagingSavedSearch,
  type StagingSyntheticDocument,
} from '@nightfall/red-team';

export const ALICE_TOKEN = STAGING_ALICE_TOKEN;
export const BOB_TOKEN = STAGING_BOB_TOKEN;
export const ALICE_WORKSPACE_ID = STAGING_ALICE_WORKSPACE_ID;
export const BOB_WORKSPACE_ID = STAGING_BOB_WORKSPACE_ID;
export const WS_A_CANARY = STAGING_WS_A_CANARY;
export const WS_CHANNEL_CANARY = STAGING_WS_CHANNEL_CANARY;

export type TestbedPrincipal = StagingPrincipal;
export type SyntheticDocument = StagingSyntheticDocument;
export type SavedSearchRecord = StagingSavedSearch;
export type UpstreamHitLog = StagingHitRecord;

export {
  StagingTargetServer as NorthstarDocsTestbedServer,
  StagingTargetServer,
  startStagingTargetServer,
  type StartedStagingTargetServer,
};
