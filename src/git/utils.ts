import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export interface RepoInfo {
  owner: string;
  repo: string;
}

export function detectRepoInfo(cwd: string): RepoInfo | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd, stdio: 'pipe' }).toString().trim();
    return parseGithubUrl(remoteUrl);
  } catch {
    return null;
  }
}

export function parseGithubUrl(url: string): RepoInfo | null {
  const sshMatch = /github\.com[:/]([^/]+)\/([^/.]+)/.exec(url);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  const httpsMatch = /github\.com\/([^/]+)\/([^/.]+)/.exec(url);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  return null;
}

const GITIGNORE_ENTRIES = [
  '.aiv/tree.json',     // auto-generated snapshot — large, not useful in diffs
  '.aiv/checklist.md',  // personal pre-PR draft — not team-relevant
];

export function appendGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');

  const current = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';

  const missing = GITIGNORE_ENTRIES.filter(e => !current.includes(e));
  if (missing.length === 0) return;

  const block = '\n# aiv — auto-generated / local-only files\n' + missing.join('\n') + '\n';

  if (fs.existsSync(gitignorePath)) {
    fs.appendFileSync(gitignorePath, block, 'utf8');
  } else {
    fs.writeFileSync(gitignorePath, block.trimStart(), 'utf8');
  }
}

export function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
