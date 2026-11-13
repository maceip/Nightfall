import { describe, expect, it } from 'vitest';
import {
  generateScopeKeyPair,
  parseCampaignYaml,
  parseDurationMs,
  serializeCampaignYaml,
  signCampaignManifest,
  verifySignedCampaignManifest,
} from './index.js';

const SAMPLE_V5_YAML = `objective: Check document and workspace access.

campaign:
  name: northstar-docs-staging
  targets: [https://staging.northstardocs.com]
  source: { archive: northstar-docs-source.tar.gz }
  max_duration: 8h
  max_requests_per_second: 10

credentials:
  alice: { file: credentials/alice.token }
  bob:   { file: credentials/bob.token }

http:
  allow:
    - { methods: [GET, POST], path_prefixes: [/] }

websocket:
  allow:
    - { paths: [/ws/documents], origins: ["*"],
        operations: [open, send] }
`;

describe('@nightfall/core-contracts campaign.yaml v5 & signing', () => {
  it('parses and round-trips v5 campaign.yaml with HTTP and WebSocket rules', () => {
    const parsed = parseCampaignYaml(SAMPLE_V5_YAML);
    expect(parsed.campaign.name).toBe('northstar-docs-staging');
    expect(parsed.campaign.max_requests_per_second).toBe(10);
    expect(parsed.http.allow[0]?.methods).toEqual(['GET', 'POST']);
    expect(parsed.websocket?.allow[0]?.paths).toEqual(['/ws/documents']);
    expect(parseDurationMs(parsed.campaign.max_duration)).toBe(8 * 60 * 60 * 1000);

    const roundTripped = parseCampaignYaml(serializeCampaignYaml(parsed));
    expect(roundTripped).toEqual(parsed);
  });

  it('cryptographically signs and detects tampering on ScopeManifest', () => {
    const parsed = parseCampaignYaml(SAMPLE_V5_YAML);
    const keys = generateScopeKeyPair('test-key-1');
    const signed = signCampaignManifest(parsed, keys.privateKeyPem, keys.keyId);

    expect(verifySignedCampaignManifest(signed, keys.publicKeyPem)).toBe(true);

    const tampered = {
      ...signed,
      manifest: {
        ...signed.manifest,
        campaign: {
          ...signed.manifest.campaign,
          targets: ['https://unauthorized.example.com'],
        },
      },
    };
    expect(verifySignedCampaignManifest(tampered, keys.publicKeyPem)).toBe(false);
  });
});
