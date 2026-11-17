import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  generateScopeKeyPair,
  isLoopbackUrl,
  loadScopeSignerRegistry,
  parseCampaignYaml,
  scopeSignerRegistryOf,
  signCampaignManifest,
  verifyScopeAuthorization,
  type SignedScopeManifest,
} from './index.js';

const MANIFEST = parseCampaignYaml(`objective: Check access.
campaign:
  name: scope-auth
  targets: [https://staging.example.com]
  source: { archive: src.tar.gz }
  max_duration: 1h
  max_requests_per_second: 5
http:
  allow:
    - { methods: [GET], path_prefixes: [/] }
`);

describe('scope authorization trust anchor', () => {
  const operator = generateScopeKeyPair('ops-lead');
  const registry = scopeSignerRegistryOf([{ ...operator, principal: 'Ops Lead' }]);

  it('authorizes a manifest signed by a pinned signer and names the principal', () => {
    const signed = signCampaignManifest(MANIFEST, operator.privateKeyPem, operator.keyId);
    const result = verifyScopeAuthorization(signed, registry);
    expect(result.authorized).toBe(true);
    expect(result.authorized && result.signer.principal).toBe('Ops Lead');
  });

  it('rejects a key the runtime minted itself (not pinned)', () => {
    const selfMinted = generateScopeKeyPair('key-camp-1');
    const signed = signCampaignManifest(MANIFEST, selfMinted.privateKeyPem, selfMinted.keyId);
    const result = verifyScopeAuthorization(signed, registry);
    expect(result).toMatchObject({ authorized: false });
    expect(!result.authorized && result.reason).toContain('not a pinned authorized signer');
  });

  it('rejects an unpinned key relabelled with a pinned key id', () => {
    const attacker = generateScopeKeyPair('attacker');
    const signed = signCampaignManifest(MANIFEST, attacker.privateKeyPem, operator.keyId);
    expect(verifyScopeAuthorization(signed, registry).authorized).toBe(false);
  });

  it('rejects tampered targets, an extended expiry, and expired or revoked authorizations', () => {
    const signed = signCampaignManifest(MANIFEST, operator.privateKeyPem, operator.keyId, {
      validForMs: 60_000,
    });
    const tampered: SignedScopeManifest = {
      ...signed,
      manifest: {
        ...signed.manifest,
        campaign: { ...signed.manifest.campaign, targets: ['https://third-party.example.org'] },
      },
    };
    expect(verifyScopeAuthorization(tampered, registry).authorized).toBe(false);

    const extended = { ...signed, expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    expect(verifyScopeAuthorization(extended, registry).authorized).toBe(false);

    const later = new Date(Date.now() + 120_000);
    const expired = verifyScopeAuthorization(signed, registry, later);
    expect(!expired.authorized && expired.reason).toContain('expired');

    const revoked = scopeSignerRegistryOf([{ ...operator, revoked: true }]);
    expect(verifyScopeAuthorization(signed, revoked).authorized).toBe(false);
  });

  it('enforces a signer\'s allowed target origins', () => {
    const teamKey = generateScopeKeyPair('team-a');
    const constrained = scopeSignerRegistryOf([
      { ...teamKey, allowedTargetOrigins: ['https://team-a.example.com'] },
    ]);
    const signed = signCampaignManifest(MANIFEST, teamKey.privateKeyPem, teamKey.keyId);
    const result = verifyScopeAuthorization(signed, constrained);
    expect(!result.authorized && result.reason).toContain('may not authorize target');
  });

  it('loads an empty registry when unconfigured and fails closed on a bad file', () => {
    expect(loadScopeSignerRegistry('').signers).toEqual([]);
    expect(() => loadScopeSignerRegistry('/nonexistent/signers.json')).toThrow();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-signers-'));
    const file = path.join(dir, 'signers.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, signers: [{ ...operator, principal: 'Ops' }, { ...operator, principal: 'Dup' }] }),
    );
    expect(() => loadScopeSignerRegistry(file)).toThrow(/Duplicate/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('recognises loopback transport addresses only', () => {
    expect(isLoopbackUrl('http://127.0.0.1:8080/x')).toBe(true);
    expect(isLoopbackUrl('http://localhost:3000')).toBe(true);
    expect(isLoopbackUrl('ws://[::1]:9000')).toBe(true);
    expect(isLoopbackUrl('https://staging.northstardocs.com')).toBe(false);
    expect(isLoopbackUrl('http://127.0.0.1.attacker.example')).toBe(false);
    expect(isLoopbackUrl('http://10.0.0.5')).toBe(false);
  });
});
