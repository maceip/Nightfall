import fs from 'node:fs/promises';
import path from 'node:path';
import {
  generateScopeKeyPair,
  parseCampaignYaml,
  signCampaignManifest,
  verifySignedCampaignManifest,
  type AuditEntry,
  type SignedScopeManifest,
} from '@nightfall/core-contracts';
import { AuditLedger } from '@nightfall/audit-ledger';
import { NightfallOrchestrator } from '@nightfall/closed-loop-orchestrator';

export const PACKAGE_NAME = '@nightfall/nightfall-cli';

export interface CliExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  signedManifest?: SignedScopeManifest;
  publicKeyPem?: string;
}

export interface RunCliOptions {
  orchestrator?: NightfallOrchestrator;
  sqlitePath?: string;
  cwd?: string;
}

const USAGE_TEXT = `Nightfall CLI (@nightfall/nightfall-cli)

Usage:
  nightfall validate <campaign.yaml>
  nightfall sign <campaign.yaml> [--out <signed.json>]
  nightfall status
  nightfall verify-audit [--file <entries.json>]
`;

export async function runNightfallCli(
  argv: string[],
  options?: RunCliOptions,
): Promise<CliExecutionResult> {
  const cwd = options?.cwd ?? process.cwd();
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    return {
      exitCode: command ? 0 : 1,
      stdout: USAGE_TEXT,
      stderr: '',
    };
  }

  if (command === 'validate') {
    const fileArg = rest[0];
    if (!fileArg) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Error: Missing <campaign.yaml> path for "validate".',
      };
    }

    try {
      const resolvedPath = path.resolve(cwd, fileArg);
      const rawYaml = await fs.readFile(resolvedPath, 'utf8');
      const manifest = parseCampaignYaml(rawYaml);
      const wsRules = manifest.websocket?.allow.length ?? 0;

      const summary = [
        `Nightfall Scope Manifest Validated (v5): ${manifest.campaign.name}`,
        `  Objective : ${manifest.objective}`,
        `  Targets   : ${manifest.campaign.targets.join(', ')}`,
        `  Max Dur   : ${manifest.campaign.max_duration}`,
        `  Max RPS   : ${manifest.campaign.max_requests_per_second}`,
        `  HTTP Rules: ${manifest.http.allow.length} | WS Rules: ${wsRules}`,
      ].join('\n');

      return {
        exitCode: 0,
        stdout: summary,
        stderr: '',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        stdout: '',
        stderr: `Manifest validation failed: ${msg}`,
      };
    }
  }

  if (command === 'sign') {
    const fileArg = rest[0];
    if (!fileArg) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Error: Missing <campaign.yaml> path for "sign".',
      };
    }

    const outFlagIdx = rest.indexOf('--out');
    const explicitOut =
      outFlagIdx >= 0 && rest[outFlagIdx + 1] ? rest[outFlagIdx + 1] : undefined;

    try {
      const resolvedInput = path.resolve(cwd, fileArg);
      const rawYaml = await fs.readFile(resolvedInput, 'utf8');
      const manifest = parseCampaignYaml(rawYaml);

      const keys = generateScopeKeyPair();
      const signed = signCampaignManifest(manifest, keys.privateKeyPem, keys.keyId);
      const verified = verifySignedCampaignManifest(signed, keys.publicKeyPem);
      if (!verified) {
        throw new Error('Self-verification of newly signed scope manifest failed.');
      }

      const outPath = explicitOut
        ? path.resolve(cwd, explicitOut)
        : `${resolvedInput}.signed.json`;

      await fs.writeFile(
        outPath,
        JSON.stringify(
          {
            signedManifest: signed,
            publicKeyPem: keys.publicKeyPem,
          },
          null,
          2,
        ),
        'utf8',
      );

      return {
        exitCode: 0,
        stdout: [
          `Signed Nightfall v5 manifest "${manifest.campaign.name}"`,
          `  Key ID : ${signed.keyId}`,
          `  SHA256 : ${signed.canonicalDigestSha256}`,
          `  Output : ${outPath}`,
        ].join('\n'),
        stderr: '',
        signedManifest: signed,
        publicKeyPem: keys.publicKeyPem,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        stdout: '',
        stderr: `Manifest signing failed: ${msg}`,
      };
    }
  }

  if (command === 'status') {
    const ownOrchestrator = !options?.orchestrator;
    const orchestrator =
      options?.orchestrator ??
      new NightfallOrchestrator({
        sqlitePath: options?.sqlitePath ?? process.env.NIGHTFALL_SQLITE_PATH ?? ':memory:',
      });
    try {
      await orchestrator.ensureBootstrapped();
      const state = orchestrator.getBootstrapState();
      const activeCampaign = state.campaigns[0];
      const liteboxLabel = state.sandboxToolchain.available
        ? `Microsoft LiteBox (ready · ${state.sandboxToolchain.southPlatform})`
        : 'process-confined fallback';

      const stdout = [
        'Nightfall Platform Status',
        `  Open Findings     : ${state.overview.openFindingsCount}`,
        `  Fixed Findings    : ${state.overview.fixedFindingsCount}`,
        `  Proposed Fixes    : ${state.overview.proposedFixesCount}`,
        `  Repositories      : ${state.repositories.filter((r) => r.prReviewsEnabled).length}/${state.repositories.length} monitored`,
        `  Active Campaign   : ${activeCampaign ? `${activeCampaign.name} (${activeCampaign.status})` : 'none'}`,
        `  Sandbox Backend   : ${liteboxLabel}`,
        `  Safety Monitor    : ${state.safetyMonitor.message}`,
        `  Kill-Switch       : ${state.killSwitchEngaged ? 'ENGAGED' : 'nominal (disengaged)'}`,
      ].join('\n');

      return {
        exitCode: 0,
        stdout,
        stderr: '',
      };
    } finally {
      if (ownOrchestrator) {
        await orchestrator.dispose();
      }
    }
  }

  if (command === 'verify-audit') {
    const fileFlagIdx = rest.indexOf('--file');
    const fileArg = fileFlagIdx >= 0 ? rest[fileFlagIdx + 1] : rest[0];

    try {
      let ledger: AuditLedger;
      let ownOrchestrator: NightfallOrchestrator | null = null;

      if (fileArg && !fileArg.startsWith('--')) {
        const resolvedFile = path.resolve(cwd, fileArg);
        const rawJson = await fs.readFile(resolvedFile, 'utf8');
        const entries = JSON.parse(rawJson) as AuditEntry[];
        ledger = new AuditLedger({ initialEntries: entries });
      } else if (options?.orchestrator) {
        await options.orchestrator.ensureBootstrapped();
        ledger = options.orchestrator.auditLedger;
      } else {
        ownOrchestrator = new NightfallOrchestrator({
          sqlitePath: options?.sqlitePath ?? process.env.NIGHTFALL_SQLITE_PATH ?? ':memory:',
        });
        await ownOrchestrator.ensureBootstrapped();
        ledger = ownOrchestrator.auditLedger;
      }

      const verification = ledger.verifyIntegrity();
      if (ownOrchestrator) {
        await ownOrchestrator.dispose();
      }

      if (!verification.valid) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: `Audit ledger integrity verification FAILED at entry index ${verification.brokenAtIndex ?? 0}.`,
        };
      }

      return {
        exitCode: 0,
        stdout: `Audit ledger integrity VERIFIED (${verification.checkedCount} hash-chained entries intact).`,
        stderr: '',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        stdout: '',
        stderr: `Audit verification error: ${msg}`,
      };
    }
  }

  return {
    exitCode: 1,
    stdout: '',
    stderr: `Unknown Nightfall CLI command: "${command}"\n\n${USAGE_TEXT}`,
  };
}
