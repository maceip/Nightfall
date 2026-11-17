import { describe, expect, it } from 'vitest';
import {
  NightfallWireScorecardEnvelopeSchema,
  ScorecardReportRecordSchema,
  ScorecardScanRequestSchema,
  StreamEventSchema,
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

  it('validates Nightfall Scorecard wire envelopes, report records, and stream events', () => {
    const req = ScorecardScanRequestSchema.parse({
      repository: 'auth-gateway',
      localPath: '/tmp/auth-gateway',
    });
    expect(req.targetType).toBe('local');
    expect(req.promoteFindings).toBe(true);

    const wire = NightfallWireScorecardEnvelopeSchema.parse({
      service: 'nightfall-scorecard',
      date: '2026-11-17T17:17:48Z',
      repo: { name: 'file:///tmp/auth-gateway', commit: 'abc1234', targetType: 'local' },
      scorecard: { version: 'v5.6.0-nightfall', commit: '6eb56f6' },
      score: 6.5,
      riskSummary: {
        criticalFailing: 1,
        highFailing: 0,
        mediumFailing: 0,
        lowFailing: 0,
        passingChecks: 2,
        inconclusiveChecks: 0,
      },
      checks: [
        {
          name: 'Dangerous-Workflow',
          score: 0,
          status: 'fail',
          risk: 'Critical',
          reason: 'dangerous workflow patterns detected',
          short: 'Determines if the project workflows have dangerous code patterns.',
          description: 'Checks untrusted script injection.',
          tags: ['ci-cd'],
          remediationSteps: ['Avoid interpolating github.event.* directly in run scripts.'],
          documentationUrl: 'https://github.com/ossf/scorecard/blob/main/docs/checks.md',
          details: ['Warn: untrusted code checkout'],
          findings: [
            {
              probe: 'hasNoGitHubWorkflowScriptInjection',
              outcome: 'FindingOutcomeTrue',
              message: 'script injection with untrusted input github.event.issue.title',
              location: {
                path: '.github/workflows/ci.yml',
                type: 'source',
                lineStart: 18,
                lineEnd: 20,
              },
            },
          ],
        },
      ],
      metadata: [],
    });
    expect(wire.checks[0]?.findings[0]?.location?.lineStart).toBe(18);

    const report = ScorecardReportRecordSchema.parse({
      id: 'SCR-auth-gateway',
      repository: 'auth-gateway',
      targetUri: 'file:///tmp/auth-gateway',
      targetType: 'local',
      observedRevision: 'abc1234',
      evaluatedAt: '2026-11-17T17:17:48Z',
      aggregateScore: 6.5,
      scorecardVersion: 'v5.6.0-nightfall',
      scorecardCommit: '6eb56f6',
      riskSummary: wire.riskSummary,
      checks: [
        {
          ...wire.checks[0]!,
          risk: 'Critical',
        },
      ],
      promotedFindingIds: ['F-SC-001'],
    });
    const ev = StreamEventSchema.parse({ type: 'scorecard.updated', report });
    expect(ev.type).toBe('scorecard.updated');
  });
});

