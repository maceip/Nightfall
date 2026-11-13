import { describe, expect, it } from 'vitest';
import { AuditLedger, GENESIS_HASH } from './index.js';

describe('@nightfall/audit-ledger', () => {
  it('appends SHA-256 hash-chained entries starting from GENESIS and verifies integrity', () => {
    const observedIds: string[] = [];
    const ledger = new AuditLedger({
      onAppend: (entry) => observedIds.push(entry.id),
    });

    expect(ledger.verifyIntegrity()).toEqual({ valid: true, checkedCount: 0 });
    expect(ledger.getSafetyMonitorStatus().withinApprovedScope).toBe(true);
    expect(ledger.getSafetyMonitorStatus().blockedRequestsCount).toBe(0);
    expect(ledger.getSafetyMonitorStatus().message).toBe(
      'Requests stay within the approved staging scope.',
    );

    const e0 = ledger.append({
      subsystem: 'red-team',
      action: 'campaign.started',
      entityId: 'camp-northstar-staging',
      actor: 'operator-maya',
      summary: 'Started staging red-team campaign',
      metadata: { target: 'https://staging.northstardocs.com', rps: 10 },
    });

    const e1 = ledger.append({
      subsystem: 'sandbox',
      action: 'sandbox.created',
      entityId: 'sbx-001',
      actor: 'verifier-alpha',
      summary: 'Provisioned hermetic replay directory',
    });

    const e2 = ledger.append({
      subsystem: 'defense-factory',
      action: 'patch.synthesized',
      entityId: 'FIX-F002',
      actor: 'patch-synthesizer',
      summary: 'Generated minimal SQL parameterization patch',
      metadata: { findingId: 'F-002', gatesPassed: 6 },
    });

    expect(e0.index).toBe(0);
    expect(e0.prevHash).toBe(GENESIS_HASH);
    expect(e0.hash).toMatch(/^[0-9a-f]{64}$/);

    expect(e1.index).toBe(1);
    expect(e1.prevHash).toBe(e0.hash);
    expect(e2.index).toBe(2);
    expect(e2.prevHash).toBe(e1.hash);

    expect(observedIds).toEqual([e0.id, e1.id, e2.id]);
    expect(ledger.verifyIntegrity()).toEqual({ valid: true, checkedCount: 3 });

    // Returned objects are defensive clones and cannot corrupt the internal chain
    e1.summary = 'external mutation attempt';
    expect(ledger.verifyIntegrity()).toEqual({ valid: true, checkedCount: 3 });
  });

  it('detects tampering at the exact broken index in the hash chain', () => {
    const ledger = new AuditLedger();

    ledger.append({
      subsystem: 'orchestrator',
      action: 'loop.init',
      entityId: 'camp-1',
      actor: 'system',
      summary: 'Initialized closed-loop run',
    });
    ledger.append({
      subsystem: 'red-team',
      action: 'finding.confirmed',
      entityId: 'F-001',
      actor: 'verifier-alpha',
      summary: 'Confirmed WebSocket channel ACL bypass',
    });
    ledger.append({
      subsystem: 'defense-factory',
      action: 'fix.verified',
      entityId: 'FIX-F001',
      actor: 'verifier-alpha',
      summary: 'Verified green phase and clean-room replay blocked',
    });

    expect(ledger.verifyIntegrity().valid).toBe(true);

    ledger.tamperEntryForTestOnly(1, 'Downgraded finding summary illicitly');

    const verification = ledger.verifyIntegrity();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAtIndex).toBe(1);
    expect(verification.checkedCount).toBe(2);

    expect(() => ledger.tamperEntryForTestOnly(99, 'oob')).toThrow(RangeError);
  });

  it('supports filtering by subsystem, entityId, and limit while tracking blocked egress safety status', () => {
    const ledger = new AuditLedger();

    ledger.append({
      subsystem: 'red-team',
      action: 'probe.sent',
      entityId: 'camp-1',
      actor: 'verifier-alpha',
      summary: 'Sent staging GET /api/me',
    });

    const blocked = ledger.recordBlockedEgress('Host prod.northstardocs.com not in allowlist', {
      campaignId: 'camp-1',
      attemptedUrl: 'https://prod.northstardocs.com/api/me',
    });

    ledger.append({
      subsystem: 'defense-factory',
      action: 'patch.verified',
      entityId: 'FIX-1',
      actor: 'critic',
      summary: 'Approved patch FIX-1',
    });

    expect(blocked.subsystem).toBe('policy-gate');
    expect(blocked.action).toBe('egress.blocked');
    expect(blocked.entityId).toBe('camp-1');

    const status = ledger.getSafetyMonitorStatus();
    expect(status.withinApprovedScope).toBe(true);
    expect(status.blockedRequestsCount).toBe(1);
    expect(status.message).toContain('Requests stay within the approved staging scope.');
    expect(status.message).toContain('1 out-of-scope request blocked');

    expect(ledger.list({ entityId: 'camp-1' })).toHaveLength(2);
    expect(ledger.list({ subsystem: 'defense-factory' })).toHaveLength(1);
    expect(ledger.list({ limit: 2 })).toHaveLength(2);
    expect(ledger.list({ limit: 0 })).toHaveLength(0);
    expect(ledger.verifyIntegrity()).toEqual({ valid: true, checkedCount: 3 });
  });
});
