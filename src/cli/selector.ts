import chalk from 'chalk';
import { PullRequest } from '../types';

// Inquirer v9 is ESM-only — must be loaded via dynamic import in CJS projects
async function getInquirer() {
  const mod = await import('inquirer');
  return (mod as any).default as {
    prompt: (questions: object[]) => Promise<Record<string, unknown>>;
    Separator: new (line?: string) => object;
  };
}

const CANCEL = -1;

function prLabel(pr: PullRequest): string {
  const num   = chalk.cyan(`#${pr.number}`);
  const title = pr.title.length > 52 ? pr.title.slice(0, 51) + '…' : pr.title;
  const meta  = chalk.dim(`${pr.author} · ${pr.branch}`);
  const diff  = chalk.green(`+${pr.additions}`) + chalk.dim('/') + chalk.red(`-${pr.deletions}`);
  return `${num}  ${title}  ${meta}  ${diff}`;
}

export async function selectPR(prs: PullRequest[], message: string): Promise<PullRequest | null> {
  const inquirer = await getInquirer();

  const choices = [
    ...prs.map(pr => ({ name: prLabel(pr), value: pr.number, short: `#${pr.number}` })),
    new inquirer.Separator('─'.repeat(62)),
    { name: chalk.dim('↩  Cancel'), value: CANCEL, short: 'Cancel' },
  ];

  const answers = await inquirer.prompt([{
    type: 'list',
    name: 'prNumber',
    message,
    choices,
    pageSize: 14,
    loop: false,
  }]);

  const selected = answers['prNumber'] as number;
  return selected === CANCEL ? null : (prs.find(pr => pr.number === selected) ?? null);
}

export type PostReviewAction = 'approve' | 'request_changes' | 'post_comment' | 'skip';
export type MergeStrategy = 'merge' | 'squash' | 'rebase';

export async function selectPostReviewAction(message: string): Promise<PostReviewAction> {
  const inquirer = await getInquirer();

  const answers = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message,
    choices: [
      { name: chalk.green('✔  Approve PR'),             value: 'approve',          short: 'Approve' },
      { name: chalk.yellow('⚑  Request Changes'),       value: 'request_changes',  short: 'Request Changes' },
      { name: chalk.cyan('💬  Post as PR comment'),     value: 'post_comment',     short: 'Post Comment' },
      new inquirer.Separator('─'.repeat(42)),
      { name: chalk.dim('↩  Skip'),                     value: 'skip',             short: 'Skip' },
    ],
    pageSize: 5,
    loop: false,
  }]);

  return answers['action'] as PostReviewAction;
}

export async function confirmMerge(message: string): Promise<boolean> {
  const inquirer = await getInquirer();
  const answers = await inquirer.prompt([{
    type: 'confirm',
    name: 'ok',
    message,
    default: false,
  }]);
  return Boolean(answers['ok']);
}

export async function selectMergeStrategy(message: string): Promise<MergeStrategy> {
  const inquirer = await getInquirer();
  const answers = await inquirer.prompt([{
    type: 'list',
    name: 'strategy',
    message,
    choices: [
      { name: chalk.cyan('Squash and merge'),  value: 'squash', short: 'Squash' },
      { name: 'Merge commit',                  value: 'merge',  short: 'Merge' },
      { name: chalk.dim('Rebase and merge'),   value: 'rebase', short: 'Rebase' },
    ],
    pageSize: 3,
    loop: false,
  }]);
  return answers['strategy'] as MergeStrategy;
}

export type PrecheckAction = 'create_pr' | 'save_checklist' | 'skip';

export async function selectPrecheckAction(message: string, needsPush: boolean): Promise<PrecheckAction> {
  const inquirer = await getInquirer();
  const prLabel = needsPush
    ? chalk.cyan('🚀  Push y crear PR en GitHub')
    : chalk.cyan('🚀  Crear PR en GitHub');
  const answers = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message,
    choices: [
      { name: prLabel,                                         value: 'create_pr',      short: 'Crear PR' },
      { name: chalk.yellow('📋  Guardar checklist en .aiv/'), value: 'save_checklist', short: 'Guardar Checklist' },
      new inquirer.Separator('─'.repeat(42)),
      { name: chalk.dim('↩  Skip'),                           value: 'skip',           short: 'Skip' },
    ],
    pageSize: 4,
    loop: false,
  }]);
  return answers['action'] as PrecheckAction;
}

export async function promptPRDetails(defaultTitle: string): Promise<{ title: string; body: string }> {
  const inquirer = await getInquirer();
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: 'PR title:',
      default: defaultTitle,
    },
    {
      type: 'input',
      name: 'body',
      message: 'PR description (optional, Enter to skip):',
      default: '',
    },
  ]);
  return {
    title: answers['title'] as string,
    body: answers['body'] as string,
  };
}

export async function confirmReview(pr: PullRequest, label: string): Promise<boolean> {
  const inquirer = await getInquirer();

  const answers = await inquirer.prompt([{
    type: 'confirm',
    name: 'ok',
    message: `${label} ${chalk.cyan('#' + pr.number)} — ${pr.title}?`,
    default: true,
  }]);

  return Boolean(answers['ok']);
}
