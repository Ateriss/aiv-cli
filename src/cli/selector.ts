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

export type PostReviewAction = 'approve' | 'request_changes' | 'skip';

export async function selectPostReviewAction(message: string): Promise<PostReviewAction> {
  const inquirer = await getInquirer();

  const answers = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message,
    choices: [
      { name: chalk.green('✔  Approve PR'),        value: 'approve',          short: 'Approve' },
      { name: chalk.yellow('⚑  Request Changes'),  value: 'request_changes',  short: 'Request Changes' },
      new inquirer.Separator('─'.repeat(42)),
      { name: chalk.dim('↩  Skip'),                value: 'skip',             short: 'Skip' },
    ],
    pageSize: 4,
    loop: false,
  }]);

  return answers['action'] as PostReviewAction;
}

export async function confirmReview(pr: PullRequest, label: string): Promise<boolean> {
  const inquirer = await getInquirer();

  const answers = await inquirer.prompt([{
    type: 'confirm',
    name: 'ok',
    message: `${label} ${chalk.cyan(`#${pr.number}`)} — ${pr.title}?`,
    default: true,
  }]);

  return Boolean(answers['ok']);
}
