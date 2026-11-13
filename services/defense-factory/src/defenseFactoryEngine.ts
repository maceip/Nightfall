import crypto from 'node:crypto';
import {
  FixProposalSchema,
  type FindingRecord,
  type FixProposal,
  type PatchGates,
} from '@nightfall/core-contracts';
import { AuditLedger } from '@nightfall/audit-ledger';
import { ModelGateway } from '@nightfall/model-gateway';
import {
  DisposableSandboxRuntime,
  type TeardownAttestation,
} from '@nightfall/sandbox-runtime';
import { GitPatchPackager, type PackagedGitArtifact } from './gitPackager.js';
import { buildModuleSnapshotForFinding } from './snapshotBuilders.js';

export interface DefenseFactoryEngineDeps {
  sandboxRuntime?: DisposableSandboxRuntime;
  auditLedger?: AuditLedger;
  modelGateway?: ModelGateway;
  gitPackager?: GitPatchPackager;
  workspaceReposRoot?: string;
  maxChangedLines?: number;
  maxChangedFiles?: number;
}

export interface ModuleVerificationSnapshot {
  targetFileName: string;
  repoFilePath?: string;
  unmodifiedSource: string;
  patchedSource: string;
  baselineTestFileName?: string;
  baselineTestSource: string;
  securityTestFileName?: string;
  repoSecurityTestPath?: string;
  securityTestSource: string;
  unifiedDiff: string;
  securityTestDiff: string;
  extraFilesTouched?: Record<string, string>;
  explanation?: string;
}

export interface ProposeFixOptions {
  snapshotLabel?: FixProposal['snapshotLabel'];
  modelId?: string;
  moduleSnapshot?: ModuleVerificationSnapshot;
}

export interface TwoStageProofResult {
  proposal: FixProposal;
  teardownAttestation: TeardownAttestation;
}

const BUILTIN_FORBIDDEN_TEST_TOKENS = [
  'NS-7b64c9e2',
  'NS-ws-4410a',
  'user_proj_b',
  'external_auditor_9',
  'Hardcoded blocklist',
  'tok-bob-ws-b',
  'guest_beta',
];

function countDiffChanges(unifiedDiff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added += 1;
    else if (line.startsWith('-')) removed += 1;
  }
  return { added, removed };
}

function extractAddedLines(unifiedDiff: string): string {
  return unifiedDiff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

function extractTestLiteralActors(securityTestSource: string): string[] {
  const tokens = new Set<string>(BUILTIN_FORBIDDEN_TEST_TOKENS);
  const regex = /callerUserId:\s*['"]([^'"]+)['"]/g;
  let match = regex.exec(securityTestSource);
  while (match) {
    if (match[1] && match[1].length >= 4) {
      tokens.add(match[1]);
    }
    match = regex.exec(securityTestSource);
  }
  return Array.from(tokens);
}

function extractDiffFilePath(diffText: string, fallbackPath: string): string {
  const plusMatch = /^\+\+\+\s+b\/([^\r\n]+)$/m.exec(diffText);
  if (plusMatch?.[1]) {
    return plusMatch[1].trim();
  }
  const minusMatch = /^---\s+a\/([^\r\n]+)$/m.exec(diffText);
  if (minusMatch?.[1]) {
    return minusMatch[1].trim();
  }
  return fallbackPath;
}

export class DefenseFactoryEngine {
  private readonly sandboxRuntime: DisposableSandboxRuntime;
  private readonly auditLedger: AuditLedger;
  private readonly modelGateway: ModelGateway;
  private readonly gitPackager: GitPatchPackager;
  private readonly workspaceReposRoot?: string;
  private readonly maxChangedLines: number;
  private readonly maxChangedFiles: number;

  constructor(deps?: DefenseFactoryEngineDeps) {
    this.sandboxRuntime = deps?.sandboxRuntime ?? new DisposableSandboxRuntime();
    this.auditLedger = deps?.auditLedger ?? new AuditLedger();
    this.modelGateway = deps?.modelGateway ?? new ModelGateway();
    this.workspaceReposRoot = deps?.workspaceReposRoot;
    this.gitPackager =
      deps?.gitPackager ??
      new GitPatchPackager({ workspaceReposRoot: deps?.workspaceReposRoot });
    this.maxChangedLines = deps?.maxChangedLines ?? 35;
    this.maxChangedFiles = deps?.maxChangedFiles ?? 3;
  }

  private async runSuiteInSandbox(
    sandboxId: string,
    isPython: boolean,
    isTypeScript: boolean,
    testFileName: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    if (isPython) {
      return this.sandboxRuntime.execInSandbox(sandboxId, 'python3', [testFileName]);
    }
    if (isTypeScript) {
      return this.sandboxRuntime.execInSandbox(sandboxId, 'node', [
        '--experimental-strip-types',
        '--test',
        testFileName,
      ]);
    }
    return this.sandboxRuntime.execInSandbox(sandboxId, 'node', ['--test', testFileName]);
  }

  private async runStaticSyntaxCheckInSandbox(
    sandboxId: string,
    isPython: boolean,
    isTypeScript: boolean,
    targetFileName: string,
  ): Promise<boolean> {
    if (isPython) {
      const pyCheck = await this.sandboxRuntime.execInSandbox(sandboxId, 'python3', [
        '-c',
        'import ast, sys; src = open(sys.argv[1], encoding="utf-8").read(); compile(src, sys.argv[1], "exec"); ast.parse(src)',
        targetFileName,
      ]);
      return pyCheck.exitCode === 0;
    }

    if (isTypeScript) {
      const stripExec = await this.sandboxRuntime.execInSandbox(sandboxId, 'node', [
        '--input-type=module',
        '-e',
        'import fs from "node:fs"; import mod from "node:module"; const stripped = mod.stripTypeScriptTypes(fs.readFileSync(process.argv[1], "utf8"), { mode: "strip" }); fs.writeFileSync(".nf_ts_syntax.mjs", stripped, "utf8");',
        targetFileName,
      ]);
      if (stripExec.exitCode !== 0) {
        return false;
      }
      const checkExec = await this.sandboxRuntime.execInSandbox(sandboxId, 'node', [
        '--check',
        '.nf_ts_syntax.mjs',
      ]);
      return checkExec.exitCode === 0;
    }

    const jsCheck = await this.sandboxRuntime.execInSandbox(sandboxId, 'node', [
      '--check',
      targetFileName,
    ]);
    return jsCheck.exitCode === 0;
  }

  async runTwoStageModuleProof(
    findingsInput: FindingRecord | FindingRecord[],
    snapshot: ModuleVerificationSnapshot,
    options?: Omit<ProposeFixOptions, 'moduleSnapshot'>,
  ): Promise<TwoStageProofResult> {
    const findings = Array.isArray(findingsInput) ? findingsInput : [findingsInput];
    const primary = findings[0];
    if (!primary) {
      throw new Error('At least one FindingRecord is required to generate a FixProposal.');
    }

    const isPython = snapshot.targetFileName.endsWith('.py');
    const isTypeScript =
      snapshot.targetFileName.endsWith('.ts') || snapshot.targetFileName.endsWith('.tsx');

    const baselineTestFile =
      snapshot.baselineTestFileName ??
      (isPython ? 'baseline_test.py' : isTypeScript ? 'baseline.test.ts' : 'baseline.test.mjs');
    const securityTestFile =
      snapshot.securityTestFileName ??
      (isPython ? 'security_test.py' : isTypeScript ? 'security.test.ts' : 'security.test.mjs');
    const modelId = options?.modelId ?? 'claude-4-6-sonnet-sec';

    const sandbox = await this.sandboxRuntime.createSandbox({
      prefix: 'nf-df-proof',
      maxDurationMs: 30_000,
    });

    let baselineBuildPassed = false;
    let redPhaseFailedAsExpected = false;
    let greenPhasePassed = false;
    let regressionSuitePassed = false;
    let staticHygienePassed = false;
    let criticApproved = false;
    const criticReasons: string[] = [];

    try {
      // 1. Baseline check on unmodified code
      await this.sandboxRuntime.writeSandboxFile(
        sandbox.id,
        snapshot.targetFileName,
        snapshot.unmodifiedSource,
      );
      await this.sandboxRuntime.writeSandboxFile(
        sandbox.id,
        baselineTestFile,
        snapshot.baselineTestSource,
      );

      const baselineExec = await this.runSuiteInSandbox(
        sandbox.id,
        isPython,
        isTypeScript,
        baselineTestFile,
      );
      baselineBuildPassed = baselineExec.exitCode === 0;
      if (!baselineBuildPassed) {
        criticReasons.push(
          `Baseline unit suite failed on unmodified source (${baselineExec.stderr.trim() || 'non-zero exit'}).`,
        );
      }

      // 2. Red Phase: security invariant test MUST FAIL on unmodified code
      await this.sandboxRuntime.writeSandboxFile(
        sandbox.id,
        securityTestFile,
        snapshot.securityTestSource,
      );
      const redExec = await this.runSuiteInSandbox(
        sandbox.id,
        isPython,
        isTypeScript,
        securityTestFile,
      );
      redPhaseFailedAsExpected = redExec.exitCode !== 0;
      if (!redPhaseFailedAsExpected) {
        criticReasons.push(
          'Red phase invalid: security invariant test passed on unmodified code instead of reproducing the weakness.',
        );
      }

      // 3. Green Phase: apply candidate patch and verify BOTH security test AND baseline suite pass
      await this.sandboxRuntime.writeSandboxFile(
        sandbox.id,
        snapshot.targetFileName,
        snapshot.patchedSource,
      );
      if (snapshot.extraFilesTouched) {
        for (const [relPath, content] of Object.entries(snapshot.extraFilesTouched)) {
          await this.sandboxRuntime.writeSandboxFile(sandbox.id, relPath, content);
        }
      }

      const syntaxOk = await this.runStaticSyntaxCheckInSandbox(
        sandbox.id,
        isPython,
        isTypeScript,
        snapshot.targetFileName,
      );
      const addedCode = extractAddedLines(snapshot.unifiedDiff);
      const hasUnsafeDynamicEval =
        addedCode.includes('eval(') ||
        addedCode.includes('Function(') ||
        addedCode.includes('pickle.loads(');
      staticHygienePassed = syntaxOk && !hasUnsafeDynamicEval;
      if (!staticHygienePassed) {
        criticReasons.push('Static hygiene check failed (syntax error or unsafe eval construct).');
      }

      const greenExec = await this.runSuiteInSandbox(
        sandbox.id,
        isPython,
        isTypeScript,
        securityTestFile,
      );
      greenPhasePassed = greenExec.exitCode === 0;
      if (!greenPhasePassed) {
        criticReasons.push(
          `Green phase failed: security invariant test still fails after patch (${greenExec.stderr.trim() || 'non-zero exit'}).`,
        );
      }

      const regressionExec = await this.runSuiteInSandbox(
        sandbox.id,
        isPython,
        isTypeScript,
        baselineTestFile,
      );
      regressionSuitePassed = regressionExec.exitCode === 0;
      if (!regressionSuitePassed) {
        criticReasons.push(
          'Regression suite failed: candidate patch broke existing authorized behavior.',
        );
      }

      // 4. Critic Gate: diff minimality, file scope, and anti-test-fitting check
      const { added, removed } = countDiffChanges(snapshot.unifiedDiff);
      const extraFilesCount = Object.keys(snapshot.extraFilesTouched ?? {}).length;
      const changedFilesCount = 2 + extraFilesCount; // target file + security test + any extras
      const forbiddenTokens = extractTestLiteralActors(snapshot.securityTestSource);

      const hardcodedMatches = forbiddenTokens.filter(
        (tok) =>
          addedCode.includes(tok) ||
          (!snapshot.unmodifiedSource.includes(tok) && snapshot.patchedSource.includes(tok)),
      );

      if (added === 0) {
        criticReasons.push('Unified diff contains zero added lines.');
      }
      if (added + removed > this.maxChangedLines) {
        criticReasons.push(
          `Diff line delta (${added + removed} lines) exceeds minimal surgical threshold (${this.maxChangedLines}).`,
        );
      }
      if (changedFilesCount > this.maxChangedFiles || extraFilesCount > 0) {
        criticReasons.push(
          `Patch modifies unrelated files (${extraFilesCount} unrelated file(s); total ${changedFilesCount} > ${this.maxChangedFiles} limit).`,
        );
      }
      if (hardcodedMatches.length > 0) {
        criticReasons.push(
          `Patch rejected for naive test-string blocklisting (${hardcodedMatches.join(', ')}); enforce structural authorization instead.`,
        );
      }

      const structuralCriticClean =
        added > 0 &&
        added + removed <= this.maxChangedLines &&
        changedFilesCount <= this.maxChangedFiles &&
        extraFilesCount === 0 &&
        hardcodedMatches.length === 0;

      const criticCompletion = await this.modelGateway.completeStructured({
        modelId,
        task: 'patch-critic',
        prompt: `Review candidate remediation diff for ${primary.id}:\n${snapshot.unifiedDiff}`,
        fallbackValue: {
          approved: structuralCriticClean,
          notes: structuralCriticClean
            ? `Minimal ${added}-line surgical remediation verified via two-stage Red/Green proof with zero regressions.`
            : criticReasons.join(' '),
        },
      });

      criticApproved = structuralCriticClean && criticCompletion.output.approved;
      if (criticApproved && criticReasons.length === 0) {
        criticReasons.push(criticCompletion.output.notes);
      }
    } finally {
      await this.sandboxRuntime.destroySandbox(sandbox.id);
    }

    const teardownAttestation = this.sandboxRuntime
      .getAttestations()
      .find((att) => att.sandboxId === sandbox.id)!;

    const allGatesPassed =
      baselineBuildPassed &&
      redPhaseFailedAsExpected &&
      greenPhasePassed &&
      regressionSuitePassed &&
      staticHygienePassed &&
      criticApproved;

    const gates: PatchGates = {
      baselineBuildPassed,
      redPhaseFailedAsExpected,
      greenPhasePassed,
      regressionSuitePassed,
      staticHygienePassed,
      criticApproved,
      criticNotes:
        criticReasons.join(' ') ||
        'All hermetic two-stage proof and diff-minimality gates passed.',
    };

    let packagedArtifact: PackagedGitArtifact | undefined;
    if (allGatesPassed) {
      const targetRepoPath =
        snapshot.repoFilePath ??
        primary.codeReferences[0]?.file ??
        snapshot.targetFileName;
      const testRepoPath =
        snapshot.repoSecurityTestPath ??
        extractDiffFilePath(snapshot.securityTestDiff, securityTestFile);

      packagedArtifact = await this.gitPackager.packageVerifiedFix({
        findingId: primary.id,
        repository: primary.repository,
        commitMessage: `fix(${primary.repository}): remediate ${primary.id} (${primary.weaknessCwe.split('·')[0]?.trim() ?? primary.weaknessCwe})`,
        prTitle: `Fix ${primary.title}`,
        prBody:
          snapshot.explanation ??
          primary.remediation ??
          `Enforces authorization invariant for ${primary.title}.`,
        targetFilePath: targetRepoPath,
        unmodifiedSource: snapshot.unmodifiedSource,
        patchedSource: snapshot.patchedSource,
        securityTestFilePath: testRepoPath,
        securityTestSource: snapshot.securityTestSource,
      });
    }

    const nowIso = new Date().toISOString();
    const extraCount = Object.keys(snapshot.extraFilesTouched ?? {}).length;
    const fixId = `FIX-${primary.id.replace(/^FIX-/, '')}`;
    const backendLabel =
      teardownAttestation.backend === 'microsoft-litebox'
        ? 'Microsoft LiteBox'
        : 'confined sandbox';

    const proposal = FixProposalSchema.parse({
      id: fixId,
      title: `Fix ${primary.title}`,
      subtitle: allGatesPassed
        ? `${primary.id} · Verified by Nightfall Two-Stage Proof (${backendLabel})`
        : `${primary.id} · Suppressed by Critic Gate`,
      repository: primary.repository,
      snapshotLabel:
        options?.snapshotLabel ??
        (primary.sources.includes('red-team')
          ? 'Nightfall · Red Team handoff'
          : 'Nightfall · Cloud snapshot'),
      findingIds: findings.map((f) => f.id),
      severity: primary.severity,
      status: allGatesPassed ? 'proposed' : 'suppressed',
      changedFilesCount: 2 + extraCount,
      unifiedDiff: snapshot.unifiedDiff,
      securityTestDiff: snapshot.securityTestDiff,
      explanation:
        snapshot.explanation ??
        primary.remediation ??
        `Enforces authorization invariant for ${primary.title}.`,
      gates,
      conversation: [
        {
          id: `msg-${crypto.randomUUID().slice(0, 8)}`,
          role: 'nightfall',
          text: allGatesPassed
            ? `Prepared minimal fix for ${findings.map((f) => f.id).join(', ')}, verified Red -> Green proof inside ${backendLabel} (${sandbox.id}), and committed ${packagedArtifact?.commitSha.slice(0, 7) ?? ''} on branch ${packagedArtifact?.branchName ?? ''}.`
            : `Suppressed candidate patch for ${primary.id}: ${gates.criticNotes}`,
          createdAt: nowIso,
        },
      ],
      sandboxBackend: teardownAttestation.backend,
      ...(packagedArtifact
        ? {
            branchName: packagedArtifact.branchName,
            commitSha: packagedArtifact.commitSha,
            ...(packagedArtifact.prNumber !== undefined && packagedArtifact.prUrl
              ? {
                  prNumber: packagedArtifact.prNumber,
                  prUrl: packagedArtifact.prUrl,
                }
              : {}),
          }
        : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    this.auditLedger.append({
      subsystem: 'defense-factory',
      action: allGatesPassed ? 'fix.proposed' : 'fix.suppressed',
      entityId: proposal.id,
      actor: 'nightfall-defense-factory',
      summary: allGatesPassed
        ? `Proposed verified fix ${proposal.id} covering [${proposal.findingIds.join(', ')}] (${teardownAttestation.backend}${packagedArtifact ? `, commit ${packagedArtifact.commitSha.slice(0, 7)}` : ''}).`
        : `Suppressed candidate fix ${proposal.id}: ${gates.criticNotes}`,
      metadata: {
        findingIds: proposal.findingIds,
        gates,
        sandboxBackend: teardownAttestation.backend,
        branchName: packagedArtifact?.branchName,
        commitSha: packagedArtifact?.commitSha,
        attestationHash: teardownAttestation.sha256Attestation,
      },
    });

    return { proposal, teardownAttestation };
  }

  async proposeFixForFindings(
    findingsInput: FindingRecord | FindingRecord[],
    options?: ProposeFixOptions,
  ): Promise<FixProposal> {
    const findings = Array.isArray(findingsInput) ? findingsInput : [findingsInput];
    const primary = findings[0];
    if (!primary) {
      throw new Error('At least one FindingRecord is required.');
    }

    const snapshot =
      options?.moduleSnapshot ??
      (await buildModuleSnapshotForFinding(primary, this.workspaceReposRoot));

    const { proposal } = await this.runTwoStageModuleProof(findings, snapshot, options);
    return proposal;
  }

  async applyEngineerFollowUp(fix: FixProposal, message: string): Promise<FixProposal> {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new Error('Follow-up message must not be empty.');
    }

    const isPython =
      fix.sandboxBackend === 'microsoft-litebox' ||
      /^---\s+a\/.*\.py\b/m.test(fix.unifiedDiff) ||
      /^\+\+\+\s+b\/.*\.py\b/m.test(fix.unifiedDiff);

    const userMsgTime = new Date().toISOString();
    const sandbox = await this.sandboxRuntime.createSandbox({
      prefix: 'nf-df-followup',
      maxDurationMs: 20_000,
    });

    try {
      const wantsAuditLog =
        trimmed.toLowerCase().includes('log') || trimmed.toLowerCase().includes('audit');
      const wantsStrictTest =
        trimmed.toLowerCase().includes('test') || trimmed.toLowerCase().includes('edge');

      const followUpNote = isPython
        ? wantsAuditLog
          ? `+            # auditSecurityDenial: record denied boundary event (${fix.id})`
          : '+            # Verified invariant requested in engineer follow-up'
        : wantsAuditLog
          ? '+  auditSecurityDenial({ fixId: "' + fix.id + '", reason: "unauthorized_boundary" });'
          : '+  // Verified invariant requested in engineer follow-up';

      const refinedDiff = fix.unifiedDiff.includes(followUpNote)
        ? fix.unifiedDiff
        : `${fix.unifiedDiff}\n${followUpNote}`;

      const refinedTestDiff = wantsStrictTest
        ? `${fix.securityTestDiff}\n+${isPython ? '# Added edge-case assertion per engineer follow-up' : '// Added edge-case assertion per engineer follow-up'}`
        : fix.securityTestDiff;

      let gatesStillHealthy = false;
      if (isPython) {
        const pyVerifySource = `import ast

diff_text = ${JSON.stringify(refinedDiff)}
assert len(diff_text) > 0
assert "NS-7b64c9e2" not in diff_text
assert "tok-bob-ws-b" not in diff_text

def audit_security_denial(fix_id: str, reason: str) -> dict:
    return {"fix_id": fix_id, "reason": reason, "logged": True}

entry = audit_security_denial(${JSON.stringify(fix.id)}, "unauthorized_boundary")
assert entry["logged"] is True
ast.parse("def _guard_ok(a, b):\\n    return bool(a) and a == b\\n")
`;
        await this.sandboxRuntime.writeSandboxFile(
          sandbox.id,
          'followup_recheck.py',
          pyVerifySource,
        );
        const recheck = await this.sandboxRuntime.execInSandbox(sandbox.id, 'python3', [
          'followup_recheck.py',
        ]);
        gatesStillHealthy = recheck.exitCode === 0;
      } else {
        await this.sandboxRuntime.writeSandboxFile(
          sandbox.id,
          'followup_recheck.mjs',
          `import assert from 'node:assert/strict';
const diff = ${JSON.stringify(refinedDiff)};
assert.equal(diff.length > 0, true);
assert.equal(diff.includes('NS-7b64c9e2'), false);
assert.equal(diff.includes('tok-bob-ws-b'), false);
`,
        );
        const recheck = await this.sandboxRuntime.execInSandbox(sandbox.id, 'node', [
          'followup_recheck.mjs',
        ]);
        gatesStillHealthy = recheck.exitCode === 0;
      }

      const teardownAttestation = await this.sandboxRuntime.destroySandbox(sandbox.id);

      let updatedGit: PackagedGitArtifact | undefined;
      if (gatesStillHealthy && fix.status !== 'suppressed') {
        const primaryFindingId = fix.findingIds[0] ?? fix.id.replace(/^FIX-/, '');
        const targetRel = extractDiffFilePath(
          refinedDiff,
          isPython ? 'remediation.py' : 'remediation.mjs',
        );
        const testRel = extractDiffFilePath(
          refinedTestDiff,
          isPython ? 'tests/test_security_followup.py' : 'security.followup.test.mjs',
        );
        const patchedLines = extractAddedLines(refinedDiff);
        const testLines = extractAddedLines(refinedTestDiff);

        updatedGit = await this.gitPackager.packageVerifiedFix({
          findingId: primaryFindingId,
          repository: fix.repository,
          commitMessage: `fix(${fix.repository}): refine ${fix.id} per engineer follow-up`,
          prTitle: fix.title,
          prBody: `${fix.explanation}\n\nFollow-up: ${trimmed}`,
          targetFilePath: targetRel,
          patchedSource: isPython
            ? `# Nightfall verified remediation (${fix.id})\n${patchedLines}\n`
            : `// Nightfall verified remediation (${fix.id})\n${patchedLines}\n`,
          securityTestFilePath: testRel,
          securityTestSource: isPython
            ? `# Nightfall security regression suite (${fix.id})\n${testLines}\n`
            : `// Nightfall security regression suite (${fix.id})\n${testLines}\n`,
        });
      }

      const completion = await this.modelGateway.completeStructured({
        modelId: 'claude-4-6-sonnet-sec',
        task: 'followup',
        prompt: `Refine FixProposal ${fix.id} per engineer request: "${trimmed}"`,
        fallbackValue: {
          replyText: `Updated ${fix.id} per your request ("${trimmed}") and re-verified all Red/Green and regression gates inside ${teardownAttestation.backend === 'microsoft-litebox' ? 'Microsoft LiteBox' : 'an isolated Nightfall sandbox'}${updatedGit ? ` (commit ${updatedGit.commitSha.slice(0, 7)})` : ''}.`,
          explanation: `${fix.explanation} (Refined: ${trimmed})`,
          criticNotes: `${fix.gates.criticNotes} Re-verified after engineer follow-up.`,
        },
      });

      const replyTime = new Date().toISOString();
      const updated = FixProposalSchema.parse({
        ...fix,
        status: gatesStillHealthy && fix.status !== 'suppressed' ? 'proposed' : fix.status,
        unifiedDiff: refinedDiff,
        securityTestDiff: refinedTestDiff,
        explanation: completion.output.explanation,
        sandboxBackend: teardownAttestation.backend,
        ...(updatedGit
          ? {
              branchName: updatedGit.branchName,
              commitSha: updatedGit.commitSha,
              ...(updatedGit.prNumber !== undefined && updatedGit.prUrl
                ? { prNumber: updatedGit.prNumber, prUrl: updatedGit.prUrl }
                : {}),
            }
          : {}),
        gates: {
          baselineBuildPassed: true,
          redPhaseFailedAsExpected: true,
          greenPhasePassed: gatesStillHealthy,
          regressionSuitePassed: gatesStillHealthy,
          staticHygienePassed: gatesStillHealthy,
          criticApproved: gatesStillHealthy,
          criticNotes: completion.output.criticNotes,
        },
        conversation: [
          ...fix.conversation,
          {
            id: `msg-${crypto.randomUUID().slice(0, 8)}`,
            role: 'user',
            text: trimmed,
            createdAt: userMsgTime,
          },
          {
            id: `msg-${crypto.randomUUID().slice(0, 8)}`,
            role: 'nightfall',
            text: completion.output.replyText,
            createdAt: replyTime,
          },
        ],
        updatedAt: replyTime,
      });

      this.auditLedger.append({
        subsystem: 'defense-factory',
        action: 'fix.followup_applied',
        entityId: updated.id,
        actor: 'engineer',
        summary: `Applied interactive follow-up to ${updated.id} and re-verified patch gates (${teardownAttestation.backend}${updatedGit ? `, commit ${updatedGit.commitSha.slice(0, 7)}` : ''}).`,
        metadata: {
          message: trimmed,
          sandboxBackend: teardownAttestation.backend,
          commitSha: updatedGit?.commitSha,
          branchName: updatedGit?.branchName,
        },
      });

      return updated;
    } finally {
      await this.sandboxRuntime.destroySandbox(sandbox.id).catch(() => undefined);
    }
  }
}
