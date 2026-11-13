import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitPatchPackagerOptions {
  workspaceReposRoot?: string;
  githubToken?: string;
  githubRepo?: string;
  fetchImpl?: typeof fetch;
}

export interface PackageVerifiedFixInput {
  findingId: string;
  repository: string;
  commitMessage: string;
  prTitle?: string;
  prBody?: string;
  repoRootDir?: string;
  targetFilePath: string;
  unmodifiedSource?: string;
  patchedSource: string;
  securityTestFilePath: string;
  securityTestSource: string;
}

export interface PackagedGitArtifact {
  branchName: string;
  commitSha: string;
  prNumber?: number;
  prUrl?: string;
}

function sanitizeRelativeRepoPath(relPath: string): string {
  const normalized = path.posix
    .normalize(relPath.replace(/\\/g, '/').replace(/^\/+/, ''))
    .replace(/^(\.\.\/)+/, '');
  if (!normalized || normalized === '.' || normalized.startsWith('..')) {
    throw new Error(`Invalid repository relative file path: "${relPath}"`);
  }
  return normalized;
}

function repoShortName(repository: string): string {
  const parts = repository.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? repository;
}

async function hasGitDirectory(dirPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(dirPath, '.git'));
    return true;
  } catch {
    return false;
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: cwd,
      TMPDIR: os.tmpdir(),
      GIT_TERMINAL_PROMPT: '0',
      LANG: 'C.UTF-8',
    },
    timeout: 20_000,
  });
  return stdout;
}

export class GitPatchPackager {
  private readonly workspaceReposRoot?: string;
  private readonly githubToken?: string;
  private readonly githubRepo?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: GitPatchPackagerOptions) {
    this.workspaceReposRoot = options?.workspaceReposRoot;
    this.githubToken = options?.githubToken;
    this.githubRepo = options?.githubRepo;
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  }

  private async resolveExistingRepoRoot(
    repository: string,
    explicitRepoRoot?: string,
  ): Promise<string | null> {
    if (explicitRepoRoot && (await hasGitDirectory(explicitRepoRoot))) {
      return explicitRepoRoot;
    }
    if (!this.workspaceReposRoot) {
      return null;
    }
    const short = repoShortName(repository);
    const candidates = [
      path.resolve(this.workspaceReposRoot, short),
      path.resolve(this.workspaceReposRoot, repository),
    ];
    for (const candidate of candidates) {
      if (await hasGitDirectory(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  async packageVerifiedFix(input: PackageVerifiedFixInput): Promise<PackagedGitArtifact> {
    const cleanId = input.findingId
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const branchName = `nightfall/fix-${cleanId || 'remediation'}`;
    const safeTargetRel = sanitizeRelativeRepoPath(input.targetFilePath);
    const safeTestRel = sanitizeRelativeRepoPath(input.securityTestFilePath);

    const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-git-pkg-'));
    const workRepoDir = path.join(stagingRoot, 'repo');

    let commitSha = '';
    try {
      const originRepoRoot = await this.resolveExistingRepoRoot(
        input.repository,
        input.repoRootDir,
      );

      if (originRepoRoot) {
        await runGit(stagingRoot, ['clone', '--quiet', originRepoRoot, workRepoDir]);
        // Check if branch already exists on origin (e.g. engineer follow-up commit)
        let hasExistingBranch = false;
        try {
          await runGit(workRepoDir, [
            'rev-parse',
            '--verify',
            `refs/remotes/origin/${branchName}`,
          ]);
          hasExistingBranch = true;
        } catch {
          hasExistingBranch = false;
        }

        if (hasExistingBranch) {
          await runGit(workRepoDir, [
            'checkout',
            '-B',
            branchName,
            `refs/remotes/origin/${branchName}`,
          ]);
        } else {
          await runGit(workRepoDir, ['checkout', '-B', branchName]);
        }
      } else {
        await fs.mkdir(workRepoDir, { recursive: true });
        await runGit(workRepoDir, ['init', '-q', '-b', 'main']);

        if (input.unmodifiedSource !== undefined) {
          const baseTargetAbs = path.join(workRepoDir, safeTargetRel);
          await fs.mkdir(path.dirname(baseTargetAbs), { recursive: true });
          await fs.writeFile(baseTargetAbs, input.unmodifiedSource, 'utf8');
          await runGit(workRepoDir, ['add', '--', safeTargetRel]);
          await runGit(workRepoDir, [
            '-c',
            'user.name=Nightfall Defense Factory',
            '-c',
            'user.email=defense-factory@nightfall.local',
            'commit',
            '-q',
            '-m',
            `chore(${repoShortName(input.repository)}): snapshot pre-remediation baseline`,
          ]);
        }

        await runGit(workRepoDir, ['checkout', '-q', '-b', branchName]);
      }

      const patchedTargetAbs = path.join(workRepoDir, safeTargetRel);
      const securityTestAbs = path.join(workRepoDir, safeTestRel);
      await fs.mkdir(path.dirname(patchedTargetAbs), { recursive: true });
      await fs.mkdir(path.dirname(securityTestAbs), { recursive: true });
      await fs.writeFile(patchedTargetAbs, input.patchedSource, 'utf8');
      await fs.writeFile(securityTestAbs, input.securityTestSource, 'utf8');

      await runGit(workRepoDir, ['add', '--', safeTargetRel, safeTestRel]);
      await runGit(workRepoDir, [
        '-c',
        'user.name=Nightfall Defense Factory',
        '-c',
        'user.email=defense-factory@nightfall.local',
        'commit',
        '--allow-empty',
        '-q',
        '-m',
        input.commitMessage,
      ]);

      commitSha = (await runGit(workRepoDir, ['rev-parse', 'HEAD'])).trim();

      if (originRepoRoot) {
        await runGit(workRepoDir, [
          'push',
          '--quiet',
          'origin',
          `HEAD:refs/heads/${branchName}`,
          '--force',
        ]);
      }
    } finally {
      await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    }

    let prNumber: number | undefined;
    let prUrl: string | undefined;

    const githubToken = (this.githubToken ?? process.env.GITHUB_TOKEN ?? '').trim();
    const githubRepo = (this.githubRepo ?? process.env.NIGHTFALL_GITHUB_REPO ?? '').trim();

    if (githubToken && githubRepo && githubRepo.includes('/')) {
      try {
        const res = await this.fetchImpl(
          `https://api.github.com/repos/${githubRepo}/pulls`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'Nightfall-Defense-Factory/0.1',
            },
            body: JSON.stringify({
              title: input.prTitle ?? input.commitMessage,
              head: branchName,
              base: 'main',
              body:
                input.prBody ??
                `Automated two-stage verified security remediation for ${input.findingId} (${commitSha.slice(0, 7)}).`,
            }),
          },
        );
        if (res.ok) {
          const payload = (await res.json()) as {
            number?: unknown;
            html_url?: unknown;
          };
          if (
            typeof payload.number === 'number' &&
            Number.isInteger(payload.number) &&
            typeof payload.html_url === 'string' &&
            payload.html_url.length > 0
          ) {
            prNumber = payload.number;
            prUrl = payload.html_url;
          }
        }
      } catch {
        // Leave prNumber/prUrl undefined when GitHub API is unreachable or unauthorized
      }
    }

    return {
      branchName,
      commitSha,
      ...(prNumber !== undefined && prUrl ? { prNumber, prUrl } : {}),
    };
  }
}
