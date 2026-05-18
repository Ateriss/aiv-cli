import { Command } from 'commander';
import * as fs from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import { isInitialized, contextPath, rulesPath, resolveConfig } from '../../config';
import { refreshContextFiles } from '../../context/manager';
import { generateContextAndRules } from '../../context/generator';
import { createProviderFor } from '../../providers/factory';
import { t } from '../../i18n';

export function contextCommand(): Command {
  const cmd = new Command('context').alias('ctx').description('Manage local project context');

  // ── refresh ──────────────────────────────────────────────────────────────────
  cmd
    .command('refresh')
    .description('Rebuild project context and tree from current codebase')
    .action(async () => {
      if (!isInitialized()) {
        console.log(chalk.red(t().notInitialized));
        return;
      }

      console.log(chalk.bold(t().contextRefreshTitle));

      const treeSpinner = ora(t().contextScanningTree).start();
      const ctxSpinner = ora(t().contextRebuildingCtx);

      const { treeOk, contextOk } = await refreshContextFiles(process.cwd());

      if (treeOk) {
        treeSpinner.succeed(chalk.green(t().contextTreeUpdated));
      } else {
        treeSpinner.fail(t().contextTreeFailed('scan failed'));
      }

      ctxSpinner.start();
      if (contextOk) {
        ctxSpinner.succeed(chalk.green(t().contextCtxUpdated));
      } else {
        ctxSpinner.fail(t().contextCtxFailed('analysis failed'));
      }

      console.log(chalk.dim(t().contextEditHint(chalk.cyan('.aiv/context.md'))));
    });

  // ── show ──────────────────────────────────────────────────────────────────────
  cmd
    .command('show')
    .description('Show current context.md contents')
    .action(() => {
      if (!isInitialized()) {
        console.log(chalk.red(t().notInitialized));
        return;
      }
      const file = contextPath();
      if (!fs.existsSync(file)) {
        console.log(chalk.yellow(t().contextNoFile));
        return;
      }
      console.log('\n' + fs.readFileSync(file, 'utf8'));
    });

  // ── generate ─────────────────────────────────────────────────────────────────
  cmd
    .command('generate')
    .description('Use AI to generate context.md and rules.yml from the current codebase')
    .option('--context-only', 'Generate only context.md')
    .option('--rules-only', 'Generate only rules.yml')
    .option('--force', 'Overwrite existing files without asking')
    .action(async (opts) => {
      if (!isInitialized()) {
        console.log(chalk.red(t().notInitialized));
        return;
      }

      const config = resolveConfig();
      let provider: ReturnType<typeof createProviderFor>;
      try {
        provider = createProviderFor(config, 'context');
      } catch (e: any) {
        console.log(chalk.red(t().contextGenerateProviderError(e.message)));
        return;
      }

      console.log(chalk.bold(t().contextGenerateTitle));

      const spinner = ora(t().contextGenerating).start();
      let generated: { context: string; rules: string };

      try {
        generated = await generateContextAndRules(process.cwd(), provider);
        spinner.succeed(chalk.green(t().contextGenerateDone));
      } catch (e: any) {
        spinner.fail(chalk.red(t().contextGenerateFailed(e.message)));
        return;
      }

      const writeContext = !opts.rulesOnly;
      const writeRules   = !opts.contextOnly;

      if (writeContext) {
        await writeWithConfirm(contextPath(), generated.context, '.aiv/context.md', opts.force);
      }
      if (writeRules) {
        await writeWithConfirm(rulesPath(), generated.rules, '.aiv/rules.yml', opts.force);
      }

      console.log(chalk.dim(t().contextEditHint(chalk.cyan('.aiv/context.md'))));
    });

  return cmd;
}

async function writeWithConfirm(filePath: string, content: string, label: string, force: boolean): Promise<void> {
  if (fs.existsSync(filePath) && !force) {
    const { default: inquirer } = await import('inquirer') as any;
    const { ok } = await inquirer.prompt([{
      type: 'confirm',
      name: 'ok',
      message: t().contextGenerateConfirmOverwrite(label),
      default: true,
    }]);
    if (!ok) {
      console.log(chalk.dim(t().contextGenerateSkipped(label)));
      return;
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(chalk.green(t().contextGenerateWritten(label)));
}
