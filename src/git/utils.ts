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

export function appendGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  const entry = '.aiv/';

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, entry + '\n', 'utf8');
    return;
  }

  const content = fs.readFileSync(gitignorePath, 'utf8');
  if (!content.includes('.aiv')) {
    fs.appendFileSync(gitignorePath, `\n# aiv local context\n${entry}\n`, 'utf8');
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
