import { execSync } from 'node:child_process';
import type { PRDiff, PRFile, PullRequest } from '../types';

export function getCurrentBranch(cwd: string): string {
  return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: 'pipe' }).toString().trim();
}

// Always prefers origin/<branch> (remote = source of truth). Falls back to local if no remote.
function resolveRef(cwd: string, branch: string): string {
  try {
    execSync(`git rev-parse --verify origin/${branch}`, { cwd, stdio: 'pipe' });
    return `origin/${branch}`;
  } catch {
    return branch;
  }
}

export function detectBaseBranch(cwd: string): string {
  const head = getCurrentBranch(cwd);
  for (const b of ['main', 'master', 'develop']) {
    if (b === head) continue;
    // Check remote first, then local
    for (const ref of [`origin/${b}`, b]) {
      try {
        execSync(`git rev-parse --verify ${ref}`, { cwd, stdio: 'pipe' });
        return b;
      } catch {}
    }
  }
  return 'main';
}

export function hasUnpushedCommits(cwd: string, branch: string): boolean {
  try {
    execSync(`git rev-parse --verify origin/${branch}`, { cwd, stdio: 'pipe' });
    const out = execSync(`git log origin/${branch}..HEAD --oneline`, { cwd, stdio: 'pipe' })
      .toString().trim();
    return out.length > 0;
  } catch {
    // origin/<branch> doesn't exist — branch was never pushed
    return true;
  }
}

export function getLastCommitTitle(cwd: string): string {
  try {
    return execSync('git log -1 --pretty=%s', { cwd, stdio: 'pipe' }).toString().trim();
  } catch { return ''; }
}

export function buildLocalPRDiff(cwd: string, base: string): PRDiff {
  const head = getCurrentBranch(cwd);
  const ref = resolveRef(cwd, base);

  const numstat = execSync(`git diff ${ref}...HEAD --numstat`, { cwd, stdio: 'pipe' })
    .toString().trim();
  const nameStatus = execSync(`git diff ${ref}...HEAD --name-status`, { cwd, stdio: 'pipe' })
    .toString().trim();
  const rawDiff = execSync(`git diff ${ref}...HEAD`, {
    cwd, stdio: 'pipe', maxBuffer: 5 * 1024 * 1024,
  }).toString();

  const statsMap = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstat.split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      statsMap.set(parts[2], {
        additions: Number.parseInt(parts[0]) || 0,
        deletions: Number.parseInt(parts[1]) || 0,
      });
    }
  }

  const files: PRFile[] = [];
  for (const line of nameStatus.split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const statusChar = parts[0][0];
    const filename = parts[parts.length - 1];
    const statusMap: Record<string, PRFile['status']> = {
      A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'added',
    };
    const status = statusMap[statusChar] ?? 'modified';
    const stats = statsMap.get(filename) ?? { additions: 0, deletions: 0 };
    files.push({ filename, status, ...stats });
  }

  const log = (() => {
    try {
      return execSync(`git log ${ref}...HEAD --oneline`, { cwd, stdio: 'pipe' }).toString().trim();
    } catch { return ''; }
  })();

  const pr: PullRequest = {
    id: 0,
    number: 0,
    title: `${head} → ${base}`,
    author: 'local',
    branch: head,
    base,
    url: '',
    state: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    additions: files.reduce((s, f) => s + f.additions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0),
    changedFiles: files.length,
    labels: [],
    description: log || undefined,
  };

  return { pr, files, rawDiff };
}
