import { describe, expect, it } from 'vitest';
import { PolicyGate } from './index.js';

describe('@nightfall/policy-gate', () => {
  it('classifies HTTP and WebSocket action risk tiers deterministically', () => {
    const gate = new PolicyGate();

    expect(
      gate.classifyActionRisk({
        method: 'GET',
        path: '/openapi.json',
        passive: true,
      }),
    ).toBe('TIER_0_PASSIVE');

    expect(gate.classifyActionRisk({ method: 'GET', path: '/api/me' })).toBe('TIER_1_SAFE_PROBE');
    expect(gate.classifyActionRisk({ method: 'HEAD', path: '/health' })).toBe('TIER_1_SAFE_PROBE');
    expect(gate.classifyActionRisk({ method: 'OPTIONS', path: '/api/me' })).toBe(
      'TIER_1_SAFE_PROBE',
    );
    expect(gate.classifyActionRisk({ method: 'POST', path: '/api/search' })).toBe(
      'TIER_1_SAFE_PROBE',
    );
    expect(
      gate.classifyActionRisk({ method: 'GET', path: '/ws/documents', isWebSocket: true }),
    ).toBe('TIER_1_SAFE_PROBE');

    expect(gate.classifyActionRisk({ method: 'PUT', path: '/api/documents/1' })).toBe(
      'TIER_2_STATE_MUTATING',
    );
    expect(gate.classifyActionRisk({ method: 'PATCH', path: '/api/documents/1' })).toBe(
      'TIER_2_STATE_MUTATING',
    );
    expect(gate.classifyActionRisk({ method: 'DELETE', path: '/api/documents/1' })).toBe(
      'TIER_2_STATE_MUTATING',
    );
    expect(
      gate.classifyActionRisk({
        method: 'POST',
        path: '/api/workspaces/1/retention-policy',
        mutatesState: true,
      }),
    ).toBe('TIER_2_STATE_MUTATING');

    expect(
      gate.classifyActionRisk({
        method: 'GET',
        path: 'https://prod.northstardocs.com/api/me',
        outsideStaging: true,
      }),
    ).toBe('TIER_3_RESTRICTED');
  });

  it('enforces HITL pause/approve/reject workflow on TIER_2 (when askForApproval=true) and always on TIER_3', () => {
    const gate = new PolicyGate();

    // TIER_2 allowed when askForApproval is false
    const autonomousEval = gate.evaluateRequest({
      campaignId: 'camp-1',
      workItemId: 'wq-10',
      askForApproval: false,
      riskTier: 'TIER_2_STATE_MUTATING',
      actionSummary: 'Update staging test workspace label',
      targetEndpoint: 'PATCH /api/workspaces/test',
    });
    expect(autonomousEval.allowed).toBe(true);

    // TIER_2 paused when askForApproval is true
    const pausedEval1 = gate.evaluateRequest({
      campaignId: 'camp-1',
      workItemId: 'wq-11',
      askForApproval: true,
      riskTier: 'TIER_2_STATE_MUTATING',
      actionSummary: 'Delete staging saved search',
      targetEndpoint: 'DELETE /api/saved-searches/12',
    });
    expect(pausedEval1.allowed).toBe(false);
    expect(pausedEval1.reason).toBe('Awaiting HITL approval');
    expect(pausedEval1.pendingApproval?.status).toBe('pending');

    // Duplicate evaluation returns existing pending approval rather than creating duplicates
    const pausedEval2 = gate.evaluateRequest({
      campaignId: 'camp-1',
      workItemId: 'wq-11',
      askForApproval: true,
      riskTier: 'TIER_2_STATE_MUTATING',
      actionSummary: 'Delete staging saved search',
      targetEndpoint: 'DELETE /api/saved-searches/12',
    });
    expect(pausedEval2.pendingApproval?.id).toBe(pausedEval1.pendingApproval?.id);
    expect(gate.listApprovals('pending')).toHaveLength(1);

    // Operator approves -> subsequent evaluation with approvalId succeeds
    const resolved = gate.resolveApproval(
      pausedEval1.pendingApproval!.id,
      'approved',
      'operator-leo',
    );
    expect(resolved.status).toBe('approved');
    expect(resolved.resolvedBy).toBe('operator-leo');

    const approvedEval = gate.evaluateRequest({
      campaignId: 'camp-1',
      workItemId: 'wq-11',
      askForApproval: true,
      riskTier: 'TIER_2_STATE_MUTATING',
      actionSummary: 'Delete staging saved search',
      targetEndpoint: 'DELETE /api/saved-searches/12',
      approvalId: resolved.id,
    });
    expect(approvedEval.allowed).toBe(true);

    // TIER_3_RESTRICTED always requires approval even when askForApproval is false
    const restrictedPending = gate.evaluateRequest({
      campaignId: 'camp-1',
      workItemId: 'wq-12',
      askForApproval: false,
      riskTier: 'TIER_3_RESTRICTED',
      actionSummary: 'Cross-boundary probe',
      targetEndpoint: 'POST https://external.example.com/hook',
    });
    expect(restrictedPending.allowed).toBe(false);
    expect(restrictedPending.reason).toBe('Awaiting HITL approval');

    gate.resolveApproval(restrictedPending.pendingApproval!.id, 'rejected', 'operator-maya');
    const rejectedEval = gate.evaluateRequest({
      campaignId: 'camp-1',
      workItemId: 'wq-12',
      askForApproval: false,
      riskTier: 'TIER_3_RESTRICTED',
      actionSummary: 'Cross-boundary probe',
      targetEndpoint: 'POST https://external.example.com/hook',
      approvalId: restrictedPending.pendingApproval!.id,
    });
    expect(rejectedEval.allowed).toBe(false);
    expect(rejectedEval.reason).toContain('rejected');
  });

  it('engages emergency kill-switch in < 1s and blocks all actions until reset', () => {
    const callbackReasons: string[] = [];
    const gate = new PolicyGate([], (reason) => callbackReasons.push(reason));

    expect(gate.isKillSwitchEngaged()).toBe(false);

    const t0 = performance.now();
    const state = gate.engageKillSwitch('Anomalous staging error rate spike');
    const elapsedMs = performance.now() - t0;

    expect(elapsedMs).toBeLessThan(1000);
    expect(state.engaged).toBe(true);
    expect(gate.isKillSwitchEngaged()).toBe(true);
    expect(callbackReasons).toEqual(['Anomalous staging error rate spike']);

    const passiveDenied = gate.evaluateRequest({
      campaignId: 'camp-1',
      askForApproval: false,
      riskTier: 'TIER_0_PASSIVE',
      actionSummary: 'Read health endpoint',
      targetEndpoint: 'GET /health',
    });
    expect(passiveDenied.allowed).toBe(false);
    expect(passiveDenied.reason).toContain('Emergency kill-switch engaged');

    gate.resetKillSwitch();
    expect(gate.isKillSwitchEngaged()).toBe(false);

    const passiveAllowed = gate.evaluateRequest({
      campaignId: 'camp-1',
      askForApproval: false,
      riskTier: 'TIER_0_PASSIVE',
      actionSummary: 'Read health endpoint',
      targetEndpoint: 'GET /health',
    });
    expect(passiveAllowed.allowed).toBe(true);
  });
});
