import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { resolveConfig, getGithubToken, isInitialized } from '../../config';
import { GithubClient } from '../../git/github';
import { detectRepoInfo } from '../../git/utils';
import { selectPR, confirmReview } from '../selector';
import { runReview } from './review';
import { t } from '../../i18n';

export function prsCommand(): Command {
  return new Command('prs')
    .alias('p')
    .description('List open pull requests and optionally launch a review')
    .option('--limit <n>', 'Max number of PRs to show', '20')
    .option('--owner <owner>', 'GitHub owner (overrides auto-detect)')
    .option('--repo <repo>', 'GitHub repo (overrides auto-detect)')
    .option('--no-select', 'Skip interactive selector, just list PRs')
    .action(async (opts) => {
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

      const spinner = ora(t().prsFetching(chalk.cyan(`${owner}/${repo}`))).start();
      let prs: Awaited<ReturnType<GithubClient['listPRs']>>;

      try {
        const client = new GithubClient(token);
        prs = await client.listPRs(owner, repo, Number.parseInt(opts.limit));
        spinner.stop();
      } catch (e: any) {
        spinner.fail(chalk.red(t().prsFailed(e.message)));
        return;
      }

      if (prs.length === 0) {
        console.log(chalk.yellow(t().prsNoneFound));
        return;
      }

      // ── Table ──────────────────────────────────────────────────────────────
      const rows = prs.map(pr => [
        chalk.cyan(`#${pr.number}`),
        truncate(pr.title, 50),
        chalk.dim(pr.author),
        chalk.dim(pr.branch) + chalk.dim(' → ') + chalk.cyan(pr.base),
        chalk.green(`+${pr.additions}`) + chalk.dim('/') + chalk.red(`-${pr.deletions}`),
        chalk.dim(formatDate(pr.createdAt)),
      ]);

      const header = [
        chalk.bold(t().prsColPR),
        chalk.bold(t().prsColTitle),
        chalk.bold(t().prsColAuthor),
        chalk.bold(t().prsColBranch),
        chalk.bold(t().prsColChanges),
        chalk.bold(t().prsColCreated),
      ];

      console.log('\n' + table([header, ...rows], {
        border: {
          topBody: '─', topJoin: '┬', topLeft: '╭', topRight: '╮',
          bottomBody: '─', bottomJoin: '┴', bottomLeft: '╰', bottomRight: '╯',
          bodyLeft: '│', bodyRight: '│', bodyJoin: '│',
          joinBody: '─', joinLeft: '├', joinRight: '┤', joinJoin: '┼',
        },
        columnDefault: { paddingLeft: 1, paddingRight: 1 },
      }));

      console.log(chalk.dim(`  ${t().prsFooter(prs.length).trim()}`));
      console.log(chalk.dim(`  ${t().reviewAccount(config.github.accountName, config.github.token_env)}\n`));

      // ── Interactive selector ───────────────────────────────────────────────
      if (opts.select === false || !process.stdout.isTTY) return;

      const selected = await selectPR(prs, t().selectorSelectPR);
      if (!selected) {
        console.log(chalk.dim(t().selectorCancelled));
        return;
      }

      const confirmed = await confirmReview(selected, t().selectorConfirmReview);
      if (!confirmed) {
        console.log(chalk.dim(t().selectorCancelled));
        return;
      }

      await runReview({ prNumber: selected.number, owner, repo, config, token });
    });
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}
