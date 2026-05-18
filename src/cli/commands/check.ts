import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveConfig, loadRules, getGithubToken, isInitialized } from '../../config';
import type { ReviewResult, AgentFinding } from '../../types';
import { GithubClient } from '../../git/github';
import { detectRepoInfo, isGitRepo } from '../../git/utils';
import { getCurrentBranch, detectBaseBranch, buildLocalPRDiff, getLastCommitTitle, hasUnpushedCommits } from '../../git/local';
import { Orchestrator } from '../../orchestrator';
import { ContextManager } from '../../context/manager';
import { renderReview } from '../renderer';
import { selectPrecheckAction, promptPRDetails } from '../selector';
import { t } from '../../i18n';

export function checkCommand(): Command {
  return new Command('check')
    .alias('c')
    .description('Analyze local diff before creating a PR')
    .argument('[base]', 'Base branch to compare against (default: main/master)')
    .option('--owner <owner>', 'GitHub owner (for PR creation)')
    .option('--repo <repo>', 'GitHub repo (for PR creation)')
    .option('--agent <agents...>', 'Run specific agents only (business, architecture, security)')
    .option('--json', 'Output raw JSON result')
    .action(async (baseArg: string | undefined, opts) => {
      if (!isInitialized()) {
        console.log(chalk.red(t().notInitialized));
        return;
      }

      const cwd = process.cwd();

      if (!isGitRepo(cwd)) {
        console.log(chalk.red(t().precheckNotGitRepo));
        return;
      }

      const head = getCurrentBranch(cwd);
      const base = baseArg ?? detectBaseBranch(cwd);

      console.log(chalk.bold(t().precheckTitle(head, base)));

      const diffSpinner = ora(t().precheckBuilding(base)).start();
      let prDiff: ReturnType<typeof buildLocalPRDiff>;
      try {
        prDiff = buildLocalPRDiff(cwd, base);
        if (prDiff.files.length === 0) {
          diffSpinner.warn(chalk.yellow(t().precheckNoChanges));
          return;
        }
        diffSpinner.succeed(t().precheckDiffBuilt(prDiff.files.length));
      } catch (e: any) {
        diffSpinner.fail(chalk.red(t().precheckDiffFailed(e.message)));
        return;
      }

      const config = resolveConfig();
      const rules = loadRules();
      const activeAgents = opts.agent ?? ['business', 'architecture', 'security'];
      const auto = !opts.agent;

      const ctxSpinner = ora(t().reviewLoadingContext).start();
      const context = new ContextManager(cwd).buildReviewContext(prDiff);
      ctxSpinner.succeed(t().reviewContextLoaded);
      console.log(chalk.dim(t().reviewRunningAgents(activeAgents.join(', '))));

      let result: ReviewResult;
      try {
        result = await new Orchestrator(config, rules).run(prDiff, context, activeAgents, auto);
      } catch (e: any) {
        console.log(chalk.red(t().reviewFailed(e.message)));
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      renderReview(result);
      if (!process.stdout.isTTY) return;

      const needsPush = hasUnpushedCommits(cwd, head);
      const action = await selectPrecheckAction(t().precheckSelectAction, needsPush);

      if (action === 'skip') return;

      if (action === 'save_checklist') {
        await doSaveChecklist(cwd, result, head, base);
        return;
      }

      if (action === 'create_pr') {
        await doCreatePR(cwd, opts, config, result, head, base, needsPush);
      }
    });
}

async function doCreatePR(
  cwd: string,
  opts: any,
  config: ReturnType<typeof resolveConfig>,
  result: ReviewResult,
  head: string,
  base: string,
  needsPush: boolean,
): Promise<void> {
  let token: string;
  try {
    token = getGithubToken(config);
  } catch {
    console.log(chalk.red(t().prsMissingToken(config.github.token_env)));
    return;
  }

  const repoInfo = detectRepoInfo(cwd);
  const owner = opts.owner ?? config.github.owner ?? repoInfo?.owner;
  const repo = opts.repo ?? config.github.repo ?? repoInfo?.repo;

  if (!owner || !repo) {
    console.log(chalk.red(t().precheckMissingConfig));
    return;
  }

  if (needsPush) {
    const pushSpinner = ora(`Pushing ${chalk.cyan(head)}...`).start();
    try {
      const { execSync } = await import('node:child_process');
      execSync(`git push origin ${head}`, { cwd, stdio: 'pipe' });
      pushSpinner.succeed(chalk.green(`Branch ${chalk.cyan(head)} pushed.`));
    } catch (e: any) {
      pushSpinner.fail(chalk.red(`Push failed: ${e.message}`));
      return;
    }
  }

  const defaultTitle = getLastCommitTitle(cwd) || head;
  const { title, body } = await promptPRDetails(defaultTitle);

  const spinner = ora(t().precheckCreatingPR).start();
  try {
    const pr = await new GithubClient(token).createPR(owner, repo, title, body, head, base);
    spinner.succeed(chalk.green(t().precheckPRCreated(pr.url)));
  } catch (e: any) {
    spinner.fail(chalk.red(t().precheckPRFailed(e.message)));
  }
}

async function doSaveChecklist(cwd: string, result: ReviewResult, head: string, base: string): Promise<void> {
  const aivDir = path.join(cwd, '.aiv');
  if (!fs.existsSync(aivDir)) fs.mkdirSync(aivDir, { recursive: true });

  const filePath = path.join(aivDir, 'checklist.md');
  const content = buildChecklist(result, head, base);

  const spinner = ora(t().precheckSavingChecklist).start();
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    spinner.succeed(chalk.green(t().precheckChecklistSaved('.aiv/checklist.md')));
  } catch (e: any) {
    spinner.fail(chalk.red(`Failed to save checklist: ${e.message}`));
  }
}

function findingLine(f: AgentFinding, bold: boolean): string[] {
  const loc = f.file ? ` — \`${f.file}\`` : '';
  const label = bold ? `**[${f.severity.toUpperCase()}]**` : `[${f.severity.toUpperCase()}]`;
  const row = `- [ ] ${label} ${f.title}${loc}`;
  return f.suggestion ? [row, `  > ${f.suggestion}`] : [row];
}

function section(heading: string, items: string[]): string[] {
  return [`## ${heading}`, '', ...items, ''];
}

function buildChecklist(result: ReviewResult, head: string, base: string): string {
  const date = new Date(result.generatedAt).toISOString().split('T')[0];
  const all = [...result.securityIssues, ...result.businessRisks, ...result.architectureIssues];

  const critical = all.filter(f => f.severity === 'critical');
  const high     = all.filter(f => f.severity === 'high');
  const medium   = all.filter(f => f.severity === 'medium');
  const low      = all.filter(f => f.severity === 'low' || f.severity === 'info');

  const body: string[] = [];

  if (critical.length > 0 || high.length > 0) {
    body.push(...section('Critical & High', [...critical, ...high].flatMap(f => findingLine(f, true))));
  }
  if (medium.length > 0) {
    body.push(...section('Medium', medium.flatMap(f => findingLine(f, true))));
  }
  if (low.length > 0) {
    body.push(...section('Low / Info', low.flatMap(f => findingLine(f, false))));
  }
  if (result.possibleRegressions.length > 0) {
    body.push(...section('Possible Regressions', result.possibleRegressions.map(r => `- [ ] ${r}`)));
  }

  return [
    `# aiv Check: ${head} → ${base}`,
    `Generated: ${date}  |  Risk: ${result.riskLabel} (${result.riskScore}/100)`,
    '',
    ...body,
    '---',
    '*Generated by [aiv](https://www.npmjs.com/package/@ateriss_/aiv-cli)*',
  ].join('\n');
}
