import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveConfig, loadRules, getGithubToken, isInitialized } from '../../config';
import type { ResolvedConfig } from '../../types';
import { GithubClient } from '../../git/github';
import { detectRepoInfo } from '../../git/utils';
import { Orchestrator } from '../../orchestrator';
import { ContextManager, refreshContextFiles } from '../../context/manager';
import { renderReview } from '../renderer';
import { selectPR, selectPostReviewAction } from '../selector';
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
  const activeAgents = opts.agents ?? ['business', 'architecture', 'security'];

  console.log(chalk.bold(t().reviewTitle(prNumber)));
  console.log(chalk.dim(`  ${t().reviewAccount(config.github.accountName, config.github.token_env)}\n`));

  const fetchSpinner = ora(t().reviewFetching(prNumber, `${owner}/${repo}`)).start();
  let prDiff: Awaited<ReturnType<GithubClient['getPRDiff']>>;

  try {
    const client = new GithubClient(token);
    prDiff = await client.getPRDiff(owner, repo, prNumber);
    fetchSpinner.succeed(t().reviewLoaded(chalk.cyan(prDiff.pr.title), prDiff.files.length));
  } catch (e: any) {
    fetchSpinner.fail(chalk.red(t().reviewFetchFailed(e.message)));
    return;
  }

  const ctxSpinner = ora(t().reviewLoadingContext).start();
  const context = new ContextManager(process.cwd()).buildReviewContext(prDiff);
  ctxSpinner.succeed(t().reviewContextLoaded);

  console.log(chalk.dim(t().reviewRunningAgents(activeAgents.join(', '))));

  try {
    const result = await new Orchestrator(config, rules).run(prDiff, context, activeAgents);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    renderReview(result);
  } catch (e: any) {
    console.log(chalk.red(t().reviewFailed(e.message)));
    return;
  }

  if (!process.stdout.isTTY) return;

  const action = await selectPostReviewAction(t().postReviewSelectAction);
  if (action === 'skip') return;

  const event = action === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES';
  const submitSpinner = ora(t().postReviewSubmitting).start();

  try {
    await new GithubClient(token).submitReview(owner, repo, prNumber, event);
    if (action === 'approve') {
      submitSpinner.succeed(chalk.green(t().postReviewApproved(prNumber)));
    } else {
      submitSpinner.succeed(chalk.yellow(t().postReviewChangesRequested(prNumber)));
    }
  } catch (e: any) {
    submitSpinner.fail(chalk.red(t().postReviewFailed(e.message)));
    return;
  }

  if (action === 'approve') {
    const refreshSpinner = ora(t().postReviewRefreshing).start();
    await refreshContextFiles(process.cwd());
    refreshSpinner.succeed(chalk.green(t().postReviewRefreshed));
  }
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

