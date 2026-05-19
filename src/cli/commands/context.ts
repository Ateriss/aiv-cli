import { Command } from 'commander';
import * as fs from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import { isInitialized, contextPath, rulesPath, resolveConfig, ResolvedConfig } from '../../config';
import { refreshContextFiles } from '../../context/manager';
import { generateContextAndRules } from '../../context/generator';
import { createProviderFor } from '../../providers/factory';
import { hasGraphifyGraph } from '../../context/graphify';
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
    .description('Show context.md and rules.yml contents')
    .action(() => {
      if (!isInitialized()) {
        console.log(chalk.red(t().notInitialized));
        return;
      }
      const ctxFile = contextPath();
      if (!fs.existsSync(ctxFile)) {
        console.log(chalk.yellow(t().contextNoFile));
        return;
      }
      console.log('\n' + chalk.bold('── context.md ──────────────────────────────────────'));
      console.log(fs.readFileSync(ctxFile, 'utf8'));

      const rFile = rulesPath();
      if (fs.existsSync(rFile)) {
        console.log(chalk.bold('── rules.yml ───────────────────────────────────────'));
        console.log(fs.readFileSync(rFile, 'utf8'));
      }
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
      if (!checkProviderKey(config)) return;

      let provider: ReturnType<typeof createProviderFor>;
      try {
        provider = createProviderFor(config, 'context');
      } catch (e: any) {
        console.log(chalk.red(`\n  ✗ ${e.message}`));
        console.log(chalk.dim(`  Fix: aiv config add-provider claude --api-key-env YOUR_KEY_VAR\n`));
        return;
      }

      console.log(chalk.bold(t().contextGenerateTitle));

      const cwd = process.cwd();
      if (hasGraphifyGraph(cwd)) {
        console.log(chalk.dim('  graphify graph detected — knowledge graph will be included in analysis'));
      }

      const spinner = ora(t().contextGenerating).start();
      let generated: { context: string; rules: string };

      try {
        generated = await generateContextAndRules(cwd, provider);
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

function resolveKeyEnvVar(config: ResolvedConfig): string {
  const name = config.providers.default;
  if (name === 'claude') return config.claude.api_key_env;
  if (name === 'openai') return config.openai.api_key_env;
  if (name === 'gemini') return config.gemini.api_key_env;
  return '(custom)';
}

function checkProviderKey(config: ResolvedConfig): boolean {
  const providerName = config.providers.default;
  const keyEnvVar = resolveKeyEnvVar(config);
  const isCustom = keyEnvVar === '(custom)';
  const keyFound = !isCustom && !!process.env[keyEnvVar];
  const keyStatus = keyFound ? chalk.green('✓ set') : chalk.red('✗ missing');
  console.log(chalk.dim(`\n  Provider: ${providerName}  |  Key env: ${keyEnvVar}: ${keyStatus}`));
  if (!keyFound && !isCustom) {
    console.log(chalk.red(`\n  ✗ Env var "${keyEnvVar}" is not set.`));
    console.log(chalk.dim(`  Run: aiv config add-provider ${providerName} --api-key-env YOUR_ACTUAL_KEY_VAR\n`));
    return false;
  }
  return true;
}

const AI_GENERATED_MARKER = 'aiv context.md — auto-generated by';

function isAiGenerated(filePath: string): boolean {
  try {
    return fs.readFileSync(filePath, 'utf8').includes(AI_GENERATED_MARKER);
  } catch {
    return false;
  }
}

async function writeWithConfirm(filePath: string, content: string, label: string, force: boolean): Promise<void> {
  if (fs.existsSync(filePath) && !force && isAiGenerated(filePath)) {
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
