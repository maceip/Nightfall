import crypto from 'node:crypto';
import {
  FindingRecordSchema,
  type CodeReference,
  type FindingRecord,
  type OwnerInfo,
  type ScorecardCheckResult,
  type ScorecardProbeFinding,
  type ScorecardReportRecord,
  type Severity,
} from '@nightfall/core-contracts';

export const ACTIONABLE_SCORECARD_CHECKS = new Set<string>([
  'Dangerous-Workflow',
  'Token-Permissions',
  'Pinned-Dependencies',
  'Binary-Artifacts',
  'Vulnerabilities',
]);

export const GOVERNANCE_SCORECARD_CHECKS = new Set<string>([
  'Security-Policy',
  'Dependency-Update-Tool',
  'SAST',
  'Fuzzing',
  'License',
  'Branch-Protection',
  'Code-Review',
  'Signed-Releases',
  'Packaging',
]);

const CHECK_CWE_MAP: Record<string, string> = {
  'Dangerous-Workflow':
    'CWE-78 · Improper Neutralization of Special Elements used in an OS Command',
  'Token-Permissions': 'CWE-250 · Execution with Unnecessary Privileges',
  'Pinned-Dependencies':
    'CWE-829 · Inclusion of Functionality from Untrusted Control Sphere',
  'Binary-Artifacts': 'CWE-494 · Download of Code Without Integrity Check',
  Vulnerabilities: 'CWE-1395 · Dependency on Vulnerable Third-Party Component',
  'Security-Policy': 'CWE-1059 · Insufficient Technical Documentation',
  'Dependency-Update-Tool': 'CWE-1104 · Use of Unmaintained Third Party Components',
  SAST: 'CWE-710 · Improper Adherence to Coding Standards',
  Fuzzing: 'CWE-20 · Improper Input Validation',
  License: 'CWE-1059 · Insufficient Technical Documentation',
  'Branch-Protection': 'CWE-284 · Improper Access Control',
  'Code-Review': 'CWE-284 · Improper Access Control',
  'Signed-Releases': 'CWE-345 · Insufficient Verification of Data Authenticity',
  Packaging: 'CWE-494 · Download of Code Without Integrity Check',
};

const CHECK_TITLE_MAP: Record<string, string> = {
  'Dangerous-Workflow': 'Dangerous GitHub Actions workflow pattern allows untrusted code injection',
  'Token-Permissions': 'GitHub Actions workflow token lacks explicit least-privilege permissions',
  'Pinned-Dependencies': 'Supply-chain dependencies or CI actions are not pinned to immutable digests',
  'Binary-Artifacts': 'Unverified binary artifacts checked directly into repository source tree',
  Vulnerabilities: 'Known open-source vulnerabilities detected in repository dependency graph',
  'Security-Policy': 'Repository lacks a published SECURITY.md vulnerability disclosure policy',
  'Dependency-Update-Tool': 'Automated dependency update tooling (Dependabot / Renovate) not configured',
  SAST: 'Static application security testing workflow not detected in CI pipeline',
  Fuzzing: 'Continuous fuzzing harness not detected for repository targets',
  License: 'Machine-readable open-source or commercial license file not detected',
};

const DEFAULT_SUPPLY_CHAIN_OWNER: OwnerInfo = {
  name: 'Supply Chain Security',
  initials: 'SC',
  team: 'Platform Supply-Chain',
  avatarColor: 'var(--accent)',
};

function mapRiskToSeverity(check: ScorecardCheckResult): Severity {
  if (check.name === 'License') {
    return 'informational';
  }
  switch (check.risk) {
    case 'Critical':
      return 'critical';
    case 'High':
      return 'high';
    case 'Medium':
      return 'medium';
    case 'Low':
    default:
      return 'low';
  }
}

function isActionableProbeFinding(finding: ScorecardProbeFinding): boolean {
  if (finding.remediation?.patch || finding.remediation?.text) {
    return true;
  }
  const outcome = finding.outcome.toLowerCase();
  const positiveHazardProbe =
    finding.probe.startsWith('hasDangerous') ||
    finding.probe === 'archived' ||
    finding.probe.includes('Unpinned');
  if (positiveHazardProbe) {
    return outcome === 'true' || outcome === 'negative';
  }
  return outcome === 'false' || outcome === 'negative';
}

function extractCodeReferences(check: ScorecardCheckResult): CodeReference[] {
  const refs: CodeReference[] = [];
  const seen = new Set<string>();

  for (const pf of check.findings) {
    if (!isActionableProbeFinding(pf) || !pf.location?.path) {
      continue;
    }
    const startLine = Math.max(1, pf.location.lineStart ?? 1);
    const endLine = Math.max(startLine, pf.location.lineEnd ?? startLine);
    const key = `${pf.location.path}:${startLine}:${endLine}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    refs.push({
      file: pf.location.path,
      startLine,
      endLine,
      description: pf.message,
    });
    if (refs.length >= 8) {
      return refs;
    }
  }

  if (refs.length === 0) {
    for (const detail of check.details) {
      const match = /:\s*([^\s:]+\.[a-zA-Z0-9_-]+):(\d+)/.exec(detail);
      if (match?.[1]) {
        const line = Math.max(1, Number.parseInt(match[2] ?? '1', 10) || 1);
        const key = `${match[1]}:${line}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push({
            file: match[1],
            startLine: line,
            endLine: line,
            description: detail.replace(/^(Warn|Info|Debug):\s*/i, ''),
          });
        }
      }
    }
  }

  return refs;
}

export interface MapScorecardFindingsOptions {
  owner?: OwnerInfo;
  includeGovernanceChecks?: boolean;
  maxScoreThreshold?: number;
  checkFilter?: (check: ScorecardCheckResult) => boolean;
  nowIso?: string;
}

export function deterministicScorecardFindingId(repository: string, checkName: string): string {
  const shortRepo = repository.split('/').filter(Boolean).pop() ?? repository;
  const digest = crypto
    .createHash('sha256')
    .update(`nightfall-scorecard:${shortRepo}:${checkName}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `F-SC-${digest}`;
}

export function mapScorecardReportToFindings(
  report: ScorecardReportRecord,
  options?: MapScorecardFindingsOptions,
): FindingRecord[] {
  const maxScore = options?.maxScoreThreshold ?? 7;
  const includeGov = options?.includeGovernanceChecks ?? false;
  const owner = options?.owner ?? DEFAULT_SUPPLY_CHAIN_OWNER;
  const nowIso = options?.nowIso ?? report.evaluatedAt ?? new Date().toISOString();
  const shortRepo = report.repository.split('/').filter(Boolean).pop() ?? report.repository;

  const findings: FindingRecord[] = [];

  for (const check of report.checks) {
    if (check.score < 0 || check.score > maxScore) {
      continue;
    }
    if (options?.checkFilter && !options.checkFilter(check)) {
      continue;
    }
    const isActionable = ACTIONABLE_SCORECARD_CHECKS.has(check.name);
    const isGovernance = GOVERNANCE_SCORECARD_CHECKS.has(check.name);
    if (!options?.checkFilter && !isActionable && !(includeGov && isGovernance)) {
      continue;
    }

    const codeReferences = extractCodeReferences(check);
    const patchFinding = check.findings.find((f) => Boolean(f.remediation?.patch));
    const actionableMessages = check.findings
      .filter(isActionableProbeFinding)
      .map((f) => f.message)
      .filter(Boolean)
      .slice(0, 4);

    const primaryFile = codeReferences[0]?.file;
    const primaryLine = codeReferences[0]?.startLine;
    const locationSuffix = primaryFile
      ? ` · ${primaryFile}${primaryLine ? `:${primaryLine}` : ''}`
      : '';

    const remediationText = [
      ...(check.remediationSteps.length > 0
        ? check.remediationSteps
        : ['Apply Nightfall Scorecard supply-chain hardening guidance.']),
      patchFinding?.remediation?.patch
        ? `\nScorecard candidate patch:\n${patchFinding.remediation.patch.trim()}`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    const record = FindingRecordSchema.parse({
      id: deterministicScorecardFindingId(shortRepo, check.name),
      title:
        CHECK_TITLE_MAP[check.name] ??
        `Nightfall Scorecard ${check.name} posture check scored ${check.score}/10`,
      subtitle: `Nightfall Scorecard · ${check.name} (${check.score}/10)${locationSuffix}`,
      repository: report.repository,
      observedRevision: report.observedRevision,
      severity: mapRiskToSeverity(check),
      status: 'new',
      fixVerification: 'not_recorded',
      weaknessCwe:
        CHECK_CWE_MAP[check.name] ??
        'CWE-693 · Protection Mechanism Failure',
      owner,
      sources: ['nightfall', 'scorecard'],
      summary: `${check.short || check.reason} Nightfall Scorecard evaluated ${check.name} at ${check.score}/10 (${check.reason}).`,
      rootCause:
        actionableMessages.length > 0
          ? actionableMessages.join('; ')
          : check.details.slice(0, 3).join('; ') || check.reason,
      impactAndAttackPath:
        check.description.split('\n\n')[0]?.trim() ||
        `Weak supply-chain posture in ${check.name} increases CI/CD compromise or unverified artifact execution risk.`,
      preconditions: [
        `Repository ${report.repository} evaluated at revision ${report.observedRevision}`,
        `Scorecard check ${check.name} (${check.risk} risk) scored ${check.score}/10`,
      ],
      remediation: remediationText,
      affectedEndpoint: primaryFile,
      architectureNotes: `Evaluated by fused Nightfall Scorecard engine (${report.scorecardVersion}) against ${report.targetUri}.`,
      defectsNotes:
        check.details.length > 0
          ? check.details.slice(0, 6).join('\n')
          : check.reason,
      verificationChainSummary: `Scorecard check ${check.name} -> ${check.findings.length} probe finding(s) -> deterministic Nightfall remediation gate.`,
      codeReferences,
      rootCauseClusterKey: `scorecard:${shortRepo.toLowerCase()}:${check.name.toLowerCase()}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    findings.push(record);
  }

  return findings;
}
