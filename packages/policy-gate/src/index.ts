import crypto from 'node:crypto';
import {
  HitlApprovalRequestSchema,
  type HitlApprovalRequest,
  type RiskTier,
} from '@nightfall/core-contracts';

export const PACKAGE_NAME = '@nightfall/policy-gate';

export interface ClassifyActionRiskInput {
  method: string;
  path: string;
  isWebSocket?: boolean;
  mutatesState?: boolean;
  outsideStaging?: boolean;
  passive?: boolean;
}

export interface EvaluateRequestInput {
  campaignId: string;
  workItemId?: string;
  askForApproval: boolean;
  riskTier: RiskTier;
  actionSummary: string;
  targetEndpoint: string;
  approvalId?: string;
  rationale?: string;
}

export interface EvaluateRequestResult {
  allowed: boolean;
  reason: string;
  pendingApproval?: HitlApprovalRequest;
}

export interface KillSwitchState {
  engaged: boolean;
  engagedAt: string;
  reason: string;
}

export interface PolicyGateOptions {
  initialApprovals?: HitlApprovalRequest[];
  onKillSwitch?: (reason: string) => void;
}

const STATE_MUTATING_METHODS = new Set(['PUT', 'DELETE', 'PATCH']);
const READ_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class PolicyGate {
  private readonly approvals = new Map<string, HitlApprovalRequest>();
  private readonly onKillSwitch?: (reason: string) => void;
  private killSwitchState: KillSwitchState = {
    engaged: false,
    engagedAt: '',
    reason: '',
  };

  constructor(
    initialApprovalsOrOptions?: HitlApprovalRequest[] | PolicyGateOptions,
    onKillSwitch?: (reason: string) => void,
  ) {
    if (Array.isArray(initialApprovalsOrOptions)) {
      this.seedApprovals(initialApprovalsOrOptions);
      this.onKillSwitch = onKillSwitch;
    } else if (initialApprovalsOrOptions && typeof initialApprovalsOrOptions === 'object') {
      if (initialApprovalsOrOptions.initialApprovals) {
        this.seedApprovals(initialApprovalsOrOptions.initialApprovals);
      }
      this.onKillSwitch = initialApprovalsOrOptions.onKillSwitch ?? onKillSwitch;
    } else {
      this.onKillSwitch = onKillSwitch;
    }
  }

  classifyActionRisk(input: ClassifyActionRiskInput): RiskTier {
    if (input.outsideStaging) {
      return 'TIER_3_RESTRICTED';
    }

    const upperMethod = input.method.trim().toUpperCase();

    if (input.mutatesState || STATE_MUTATING_METHODS.has(upperMethod)) {
      return 'TIER_2_STATE_MUTATING';
    }

    if (input.isWebSocket || upperMethod === 'WS' || upperMethod === 'POST') {
      return 'TIER_1_SAFE_PROBE';
    }

    if (input.passive || upperMethod === 'PASSIVE') {
      return 'TIER_0_PASSIVE';
    }

    if (READ_SAFE_METHODS.has(upperMethod)) {
      return 'TIER_1_SAFE_PROBE';
    }

    return 'TIER_2_STATE_MUTATING';
  }

  evaluateRequest(input: EvaluateRequestInput): EvaluateRequestResult {
    if (this.killSwitchState.engaged) {
      return {
        allowed: false,
        reason: `Emergency kill-switch engaged: ${this.killSwitchState.reason}`,
      };
    }

    const requiresApproval =
      input.riskTier === 'TIER_3_RESTRICTED' ||
      (input.riskTier === 'TIER_2_STATE_MUTATING' && input.askForApproval);

    if (!requiresApproval) {
      return {
        allowed: true,
        reason: `Action permitted under ${input.riskTier} policy.`,
      };
    }

    if (input.approvalId !== undefined) {
      const byId = this.approvals.get(input.approvalId);
      if (byId && byId.campaignId === input.campaignId) {
        if (byId.status === 'approved') {
          return {
            allowed: true,
            reason: `Approved by human operator (${byId.id}).`,
          };
        }
        if (byId.status === 'rejected') {
          return {
            allowed: false,
            reason: `HITL approval rejected (${byId.id}).`,
          };
        }
        return {
          allowed: false,
          reason: 'Awaiting HITL approval',
          pendingApproval: structuredClone(byId),
        };
      }
    } else if (input.workItemId !== undefined) {
      const matchingByWorkItem = Array.from(this.approvals.values()).find(
        (item) => item.campaignId === input.campaignId && item.workItemId === input.workItemId,
      );
      if (matchingByWorkItem) {
        if (matchingByWorkItem.status === 'approved') {
          return {
            allowed: true,
            reason: `Approved by human operator (${matchingByWorkItem.id}).`,
          };
        }
        if (matchingByWorkItem.status === 'rejected') {
          return {
            allowed: false,
            reason: `HITL approval rejected (${matchingByWorkItem.id}).`,
          };
        }
        return {
          allowed: false,
          reason: 'Awaiting HITL approval',
          pendingApproval: structuredClone(matchingByWorkItem),
        };
      }
    }

    const existingPending = Array.from(this.approvals.values()).find(
      (item) =>
        item.status === 'pending' &&
        item.campaignId === input.campaignId &&
        item.targetEndpoint === input.targetEndpoint &&
        item.riskTier === input.riskTier &&
        (input.workItemId === undefined || item.workItemId === input.workItemId),
    );

    if (existingPending) {
      return {
        allowed: false,
        reason: 'Awaiting HITL approval',
        pendingApproval: structuredClone(existingPending),
      };
    }

    const created = HitlApprovalRequestSchema.parse({
      id: `hitl-${crypto.randomUUID().slice(0, 8)}`,
      campaignId: input.campaignId,
      workItemId: input.workItemId ?? 'unassigned',
      riskTier: input.riskTier,
      actionSummary: input.actionSummary,
      targetEndpoint: input.targetEndpoint,
      rationale:
        input.rationale ??
        (input.riskTier === 'TIER_3_RESTRICTED'
          ? 'Restricted action always requires explicit human authorization.'
          : 'State-mutating action requires explicit human authorization when Ask-for-Approval is active.'),
      status: 'pending',
      requestedAt: new Date().toISOString(),
    });

    this.approvals.set(created.id, created);

    return {
      allowed: false,
      reason: 'Awaiting HITL approval',
      pendingApproval: structuredClone(created),
    };
  }

  seedApprovals(items: HitlApprovalRequest[]): void {
    for (const item of items) {
      const parsed = HitlApprovalRequestSchema.parse(structuredClone(item));
      this.approvals.set(parsed.id, parsed);
    }
  }

  listApprovals(status?: HitlApprovalRequest['status']): HitlApprovalRequest[] {
    const all = Array.from(this.approvals.values());
    const filtered = status ? all.filter((item) => item.status === status) : all;
    return filtered.map((item) => structuredClone(item));
  }

  resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    resolvedBy = 'security-operator',
  ): HitlApprovalRequest {
    const existing = this.approvals.get(approvalId);
    if (!existing) {
      throw new Error(`Approval request not found: ${approvalId}`);
    }

    const updated = HitlApprovalRequestSchema.parse({
      ...existing,
      status: decision,
      resolvedAt: new Date().toISOString(),
      resolvedBy,
    });

    this.approvals.set(approvalId, updated);
    return structuredClone(updated);
  }

  engageKillSwitch(reason: string): KillSwitchState {
    this.killSwitchState = {
      engaged: true,
      engagedAt: new Date().toISOString(),
      reason,
    };
    this.onKillSwitch?.(reason);
    return { ...this.killSwitchState };
  }

  resetKillSwitch(): void {
    this.killSwitchState = {
      engaged: false,
      engagedAt: '',
      reason: '',
    };
  }

  isKillSwitchEngaged(): boolean {
    return this.killSwitchState.engaged;
  }
}
