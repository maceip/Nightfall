import type {
  FindingRecord,
  FixProposal,
  OwnerInfo,
  Severity,
} from '@nightfall/core-contracts';

export interface DeduplicatorOptions {
  maxOpenProposalsPerTeam?: number;
  teamDirectory?: Record<string, OwnerInfo>;
}

export interface DeduplicatedWorkCluster {
  clusterKey: string;
  primaryFinding: FindingRecord;
  findings: FindingRecord[];
  findingIds: string[];
  owner: OwnerInfo;
  repository: string;
  highestSeverity: Severity;
  dispatchable: boolean;
  deferredReason?: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  informational: 1,
};

const DEFAULT_TEAM_DIRECTORY: Record<string, OwnerInfo> = {
  'asset-servicing': { name: 'Leo', initials: 'L', team: 'Assets', avatarColor: '#dceeff' },
  'identity-platform': { name: 'Maya', initials: 'M', team: 'Identity', avatarColor: '#efe3ff' },
  'northstar-docs': { name: 'Leo', initials: 'L', team: 'Experience', avatarColor: '#dceeff' },
  'document-processing': {
    name: 'Amara Okafor',
    initials: 'A',
    team: 'Experience',
    avatarColor: '#dff3ff',
  },
  'nightfall/agent-runtime': {
    name: 'Devon',
    initials: 'D',
    team: 'Infrastructure',
    avatarColor: '#e2f5ea',
  },
  'northstar/media-proxy': {
    name: 'Amara Okafor',
    initials: 'A',
    team: 'Experience',
    avatarColor: '#dff3ff',
  },
};

export class RootCauseDeduplicator {
  private readonly maxOpenProposalsPerTeam: number;
  private readonly teamDirectory: Record<string, OwnerInfo>;

  constructor(options?: DeduplicatorOptions) {
    this.maxOpenProposalsPerTeam = options?.maxOpenProposalsPerTeam ?? 5;
    this.teamDirectory = {
      ...DEFAULT_TEAM_DIRECTORY,
      ...(options?.teamDirectory ?? {}),
    };
  }

  resolveCodeOwner(repository: string, fallbackOwner?: OwnerInfo): OwnerInfo {
    const mapped = this.teamDirectory[repository];
    if (mapped) {
      return { ...mapped };
    }
    if (fallbackOwner) {
      return { ...fallbackOwner };
    }
    return {
      name: 'Platform Security',
      initials: 'PS',
      team: 'Infrastructure',
      avatarColor: '#e2f5ea',
    };
  }

  clusterAndRoute(
    findings: FindingRecord[],
    existingFixes: FixProposal[] = [],
  ): DeduplicatedWorkCluster[] {
    const openCandidates = findings.filter(
      (f) => f.status !== 'fixed' && f.status !== 'discarded_fp' && !f.duplicateOfId,
    );

    const grouped = new Map<string, FindingRecord[]>();
    for (const finding of openCandidates) {
      const key = finding.rootCauseClusterKey || `${finding.repository}:${finding.id}`;
      const list = grouped.get(key);
      if (list) {
        list.push(finding);
      } else {
        grouped.set(key, [finding]);
      }
    }

    // Count active open proposals per team
    const findingById = new Map(findings.map((f) => [f.id, f]));
    const activeWipByTeam = new Map<string, number>();

    for (const fix of existingFixes) {
      if (fix.status !== 'proposed' && fix.status !== 'in_progress') {
        continue;
      }
      const linkedFinding = fix.findingIds
        .map((id) => findingById.get(id))
        .find((f): f is FindingRecord => f !== undefined);
      const owner = linkedFinding?.owner ?? this.resolveCodeOwner(fix.repository);
      activeWipByTeam.set(owner.team, (activeWipByTeam.get(owner.team) ?? 0) + 1);
    }

    // Sort clusters by highest severity first so critical fixes always claim WIP budget first
    const rawClusters = Array.from(grouped.entries()).map(([clusterKey, members]) => {
      const sortedMembers = [...members].sort(
        (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
      );
      const primaryFinding = sortedMembers[0]!;
      const owner = primaryFinding.owner ?? this.resolveCodeOwner(primaryFinding.repository);
      return {
        clusterKey,
        primaryFinding,
        findings: sortedMembers,
        findingIds: sortedMembers.map((m) => m.id),
        owner,
        repository: primaryFinding.repository,
        highestSeverity: primaryFinding.severity,
      };
    });

    rawClusters.sort(
      (a, b) => SEVERITY_RANK[b.highestSeverity] - SEVERITY_RANK[a.highestSeverity],
    );

    return rawClusters.map((cluster) => {
      const team = cluster.owner.team;
      const currentTeamWip = activeWipByTeam.get(team) ?? 0;

      // Check if an existing active fix already covers this cluster
      const alreadyCovered = existingFixes.some(
        (fix) =>
          (fix.status === 'proposed' || fix.status === 'in_progress') &&
          fix.findingIds.some((id) => cluster.findingIds.includes(id)),
      );

      if (alreadyCovered) {
        return {
          ...cluster,
          dispatchable: false,
          deferredReason: 'Active FixProposal already exists for this root-cause cluster.',
        };
      }

      if (currentTeamWip >= this.maxOpenProposalsPerTeam) {
        return {
          ...cluster,
          dispatchable: false,
          deferredReason: `Team "${team}" WIP limit reached (${currentTeamWip}/${this.maxOpenProposalsPerTeam} open proposals).`,
        };
      }

      activeWipByTeam.set(team, currentTeamWip + 1);
      return {
        ...cluster,
        dispatchable: true,
      };
    });
  }
}
