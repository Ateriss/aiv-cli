import { PullRequest, PRDiff, PRFile, ReviewResult } from '../types';

const AIV_COMMENT_TAG = '<!-- aiv-review:';

const GITHUB_API = 'https://api.github.com';

export class GithubClient {
  private headers: Record<string, string>;

  constructor(token: string) {
    this.headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'aiv-cli/0.1.0',
    };
  }

  async listPRs(owner: string, repo: string, limit: number = 20): Promise<PullRequest[]> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&per_page=${Math.min(limit, 100)}&sort=updated&direction=desc`;
    const res = await this.fetch(url);
    if (!res.ok) await this.throwError(res, 'list PRs');

    const data = await res.json() as any[];
    return data.map(pr => this.mapPR(pr));
  }

  async getPR(owner: string, repo: string, prNumber: number): Promise<PullRequest> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`;
    const res = await this.fetch(url);
    if (!res.ok) await this.throwError(res, `get PR #${prNumber}`);
    return this.mapPR(await res.json() as any);
  }

  async getPRFiles(owner: string, repo: string, prNumber: number): Promise<PRFile[]> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`;
    const res = await this.fetch(url);
    if (!res.ok) await this.throwError(res, 'get PR files');

    const data = await res.json() as any[];
    return data.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  }

  async getPRDiff(owner: string, repo: string, prNumber: number): Promise<PRDiff> {
    const [pr, files] = await Promise.all([
      this.getPR(owner, repo, prNumber),
      this.getPRFiles(owner, repo, prNumber),
    ]);

    const rawDiff = files
      .filter(f => f.patch)
      .map(f => `diff --git a/${f.filename} b/${f.filename}\n${f.patch}`)
      .join('\n');

    return { pr, files, rawDiff };
  }

  async findAivReview(owner: string, repo: string, prNumber: number): Promise<ReviewResult | null> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`;
    const res = await this.fetch(url);
    if (!res.ok) return null;

    const comments = await res.json() as any[];
    for (const c of comments) {
      const body: string = c.body ?? '';
      if (!body.startsWith(AIV_COMMENT_TAG)) continue;
      const end = body.indexOf(' -->');
      if (end === -1) continue;
      try {
        const encoded = body.slice(AIV_COMMENT_TAG.length, end).trim();
        return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as ReviewResult;
      } catch { continue; }
    }
    return null;
  }

  async postComment(owner: string, repo: string, prNumber: number, body: string): Promise<void> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments`;
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }) as unknown as Response;
    if (!res.ok) await this.throwError(res, `post comment on PR #${prNumber}`);
  }

  async mergePR(
    owner: string,
    repo: string,
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash',
  ): Promise<void> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/merge`;
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ merge_method: mergeMethod }),
    }) as unknown as Response;
    if (!res.ok) await this.throwError(res, `merge PR #${prNumber}`);
  }

  async submitReview(
    owner: string,
    repo: string,
    prNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES',
    body: string = '',
  ): Promise<void> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`;
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, body }),
    }) as unknown as Response;
    if (!res.ok) await this.throwError(res, `submit review on PR #${prNumber}`);
  }

  private mapPR(pr: any): PullRequest {
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? 'unknown',
      branch: pr.head?.ref ?? '',
      base: pr.base?.ref ?? '',
      url: pr.html_url,
      state: pr.state,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      changedFiles: pr.changed_files ?? 0,
      labels: (pr.labels ?? []).map((l: any) => l.name),
      description: pr.body ?? undefined,
    };
  }

  private async fetch(url: string): Promise<Response> {
    const { default: fetch } = await import('node-fetch');
    return fetch(url, { headers: this.headers }) as unknown as Response;
  }

  private async throwError(res: Response, action: string): Promise<never> {
    let msg = `GitHub API error (${res.status}) while trying to ${action}`;
    try {
      const body = await res.json() as any;
      if (body.message) msg += `: ${body.message}`;
    } catch {}
    throw new Error(msg);
  }
}
