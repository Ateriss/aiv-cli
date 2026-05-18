import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveConfig, loadRules, getGithubToken, isInitialized } from '../../config';
import type { ResolvedConfig, ReviewResult } from '../../types';
import { GithubClient } from '../../git/github';
import { detectRepoInfo } from '../../git/utils';
import { Orchestrator } from '../../orchestrator';
import { ContextManager, refreshContextFiles } from '../../context/manager';
import { renderReview, buildAivComment } from '../renderer';
import { selectPR, selectPostReviewAction, confirmMerge, selectMergeStrategy } from '../selector';
import { t } from '../../i18n';

// ─── Shared review runner (used by prs.ts and review command) ─────────────────

export interface RunReviewOptions {
  prNumber: number;
  owner: string;
  repo: string;
  config: ResolvedConfig;
  token: string;
  agents?: string[];
  json?: boolean;
}

export async function runReview(opts: RunReviewOptions): Promise<void> {
  const { prNumber, owner, repo, config, token } = opts;
  const rules = loadRules();
  const auto = !opts.agents;
  const activeAgents = opts.agents ?? ['business', 'architecture', 'security'];
  const client = new GithubClient(token);

  console.log(chalk.bold(t().reviewTitle(prNumber)));
  console.log(chalk.dim(`  ${t().reviewAccount(config.github.accountName, config.github.token_env)}\n`));

  const fetchSpinner = ora(t().reviewFetching(prNumber, `${owner}/${repo}`)).start();
  let prDiff: Awaited<ReturnType<GithubClient['getPRDiff']>>;
  try {
    prDiff = await client.getPRDiff(owner, repo, prNumber);
    fetchSpinner.succeed(t().reviewLoaded(chalk.cyan(prDiff.pr.title), prDiff.files.length));
  } catch (e: any) {
    fetchSpinner.fail(chalk.red(t().reviewFetchFailed(e.message)));
    return;
  }

  const result = await resolveResult(client, { owner, repo, prNumber }, { config, rules, agents: activeAgents, auto }, prDiff, opts.json);
  if (!result) return;

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  renderReview(result);
  if (!process.stdout.isTTY) return;

  const action = await selectPostReviewAction(t().postReviewSelectAction);
  if (action === 'skip') return;

  if (action === 'post_comment') {
    await doPostComment(client, owner, repo, prNumber, result);
    return;
  }

  const submitted = await doSubmitReview(client, owner, repo, prNumber, action);
  if (!submitted) return;

  if (action === 'approve') {
    await doApproveFlow(client, owner, repo, prNumber, result);
  }
}

interface RepoRef { owner: string; repo: string; prNumber: number; }
interface AgentOpts { config: ResolvedConfig; rules: ReturnType<typeof loadRules>; agents: string[]; auto: boolean; }

async function resolveResult(
  client: GithubClient,
  ref: RepoRef,
  agentOpts: AgentOpts,
  prDiff: Awaited<ReturnType<GithubClient['getPRDiff']>>,
  json?: boolean,
): Promise<ReviewResult | null> {
  const { config, rules, agents: activeAgents, auto } = agentOpts;
  const { owner, repo, prNumber } = ref;
  if (!json && process.stdout.isTTY) {
    const cached = await client.findAivReview(owner, repo, prNumber);
    if (cached) {
      console.log(chalk.cyan(`\n  ${t().reviewCachedFound}`));
      const useCached = await confirmMerge(t().reviewCachedUse);
      if (useCached) {
        console.log(chalk.dim(`  ${t().reviewCachedUsing}`));
        return cached;
      }
      console.log(chalk.dim(`  ${t().reviewCachedSkipping}`));
    }
  }

  const ctxSpinner = ora(t().reviewLoadingContext).start();
  const context = new ContextManager(process.cwd()).buildReviewContext(prDiff);
  ctxSpinner.succeed(t().reviewContextLoaded);
  console.log(chalk.dim(t().reviewRunningAgents(activeAgents.join(', '))));

  try {
    return await new Orchestrator(config, rules).run(prDiff, context, activeAgents, auto);
  } catch (e: any) {
    console.log(chalk.red(t().reviewFailed(e.message)));
    return null;
  }
}

async function doPostComment(client: GithubClient, owner: string, repo: string, prNumber: number, result: ReviewResult): Promise<void> {
  const spinner = ora(t().postReviewPostingComment).start();
  try {
    await client.postComment(owner, repo, prNumber, buildAivComment(result));
    spinner.succeed(chalk.green(t().postReviewCommentPosted(prNumber)));
  } catch (e: any) {
    spinner.fail(chalk.red(t().postReviewCommentFailed(e.message)));
  }
}

async function doSubmitReview(client: GithubClient, owner: string, repo: string, prNumber: number, action: 'approve' | 'request_changes'): Promise<boolean> {
  const event = action === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES';
  const spinner = ora(t().postReviewSubmitting).start();
  try {
    await client.submitReview(owner, repo, prNumber, event);
    const msg = action === 'approve' ? t().postReviewApproved(prNumber) : t().postReviewChangesRequested(prNumber);
    const color = action === 'approve' ? chalk.green : chalk.yellow;
    spinner.succeed(color(msg));
    return true;
  } catch (e: any) {
    spinner.fail(chalk.red(t().postReviewFailed(e.message)));
    return false;
  }
}

async function doApproveFlow(client: GithubClient, owner: string, repo: string, prNumber: number, result: ReviewResult): Promise<void> {
  const wantsMerge = await confirmMerge(t().postReviewMergeConfirm);
  if (wantsMerge) {
    await doPostComment(client, owner, repo, prNumber, result);
    const strategy = await selectMergeStrategy(t().postReviewSelectMerge);
    const mergeSpinner = ora(t().postReviewMerging(prNumber)).start();
    try {
      await client.mergePR(owner, repo, prNumber, strategy);
      mergeSpinner.succeed(chalk.green(t().postReviewMerged(prNumber)));
    } catch (e: any) {
      mergeSpinner.fail(chalk.red(t().postReviewMergeFailed(e.message)));
    }
  }
  const refreshSpinner = ora(t().postReviewRefreshing).start();
  await refreshContextFiles(process.cwd());
  refreshSpinner.succeed(chalk.green(t().postReviewRefreshed));
}

// ─── CLI command ──────────────────────────────────────────────────────────────

export function reviewCommand(): Command {
  return new Command('review')
    .alias('r')
    .description('Run AI review on a pull request')
    .argument('[pr-number]', 'PR number (omit to pick interactively)')
    .option('--owner <owner>', 'GitHub owner')
    .option('--repo <repo>', 'GitHub repo')
    .option('--agent <agents...>', 'Run specific agents only (business, architecture, security)')
    .option('--json', 'Output raw JSON result')
    .action(async (prArg: string | undefined, opts) => {
      if (!isInitialized()) {
        console.log(chalk.red(t().notInitialized));
        return;
      }

      const config = resolveConfig();
      let token: string;
      try {
        token = getGithubToken(config);
      } catch {
        console.log(chalk.red(t().prsMissingToken(config.github.token_env)));
        return;
      }

      const repoInfo = detectRepoInfo(process.cwd());
      const owner = opts.owner ?? config.github.owner ?? repoInfo?.owner;
      const repo  = opts.repo  ?? config.github.repo  ?? repoInfo?.repo;

      if (!owner || !repo) {
        console.log(chalk.red(t().repoNotDetected));
        return;
      }

      let prNumber: number;

      if (prArg === undefined) {
        // No number — fetch PRs and show interactive selector
        const spinner = ora(t().prsFetching(chalk.cyan(`${owner}/${repo}`))).start();
        let prs: Awaited<ReturnType<GithubClient['listPRs']>>;
        try {
          prs = await new GithubClient(token).listPRs(owner, repo, 30);
          spinner.stop();
        } catch (e: any) {
          spinner.fail(chalk.red(t().prsFailed(e.message)));
          return;
        }

        if (prs.length === 0) {
          console.log(chalk.yellow(t().prsNoneFound));
          return;
        }

        const selected = await selectPR(prs, t().selectorSelectPR);
        if (!selected) {
          console.log(chalk.dim(t().selectorCancelled));
          return;
        }
        prNumber = selected.number;
      } else {
        // PR number provided directly
        prNumber = Number.parseInt(prArg);
        if (Number.isNaN(prNumber)) {
          console.log(chalk.red(t().invalidPrNumber));
          return;
        }
      }

      await runReview({
        prNumber,
        owner,
        repo,
        config,
        token,
        agents: opts.agent,
        json: opts.json,
      });
    });
}

