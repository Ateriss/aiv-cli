import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import {
  getAivDir, saveGlobalConfig, saveRepoConfig, saveRules,
  contextPath, treePath, isGlobalSetup,
  DEFAULT_GLOBAL_CONFIG, DEFAULT_REPO_CONFIG, DEFAULT_RULES, isInitialized,
} from '../../config';
import { buildContext } from '../../context/builder';
import { buildTree } from '../../context/tree';
import { appendGitignore } from '../../git/utils';
import { t } from '../../i18n';

export function initCommand(): Command {
  return new Command('init')
    .alias('i')
    .description('Initialize aiv in the current repository')
    .option('--force', 'Reinitialize even if already initialized')
    .action(async (opts) => {
      const cwd = process.cwd();

      if (isInitialized(cwd) && !opts.force) {
        console.log(chalk.yellow(t().initAlreadyDone));
        return;
      }

      console.log(chalk.bold(t().initTitle));

      // 1. Global config (~/.aiv/config.yml) — created once, not on every init
      if (isGlobalSetup()) {
        console.log(chalk.dim(`  ↳ ${t().initGlobalConfigExists}`));
      } else {
        const gSpinner = ora(t().initWritingGlobalConfig).start();
        saveGlobalConfig(DEFAULT_GLOBAL_CONFIG);
        gSpinner.succeed(chalk.green(t().initGlobalConfigCreated));
      }

      // 2. Repo .aiv/ folder
      const aivDir = getAivDir(cwd);
      if (!fs.existsSync(aivDir)) fs.mkdirSync(aivDir, { recursive: true });

      const configSpinner = ora(t().initWritingConfig).start();
      saveRepoConfig(DEFAULT_REPO_CONFIG, cwd);
      configSpinner.succeed(chalk.green(t().initConfigCreated));

      // 3. rules.yml
      saveRules(DEFAULT_RULES, cwd);
      console.log(chalk.green(`  ✔ ${t().initRulesCreated}`));

      // 4. tree.json
      const treeSpinner = ora(t().initScanningTree).start();
      try {
        const tree = await buildTree(cwd);
        fs.writeFileSync(treePath(cwd), JSON.stringify(tree, null, 2), 'utf8');
        treeSpinner.succeed(chalk.green(t().initTreeCreated));
      } catch {
        treeSpinner.warn(t().initTreeSkipped);
      }

      // 5. context.md
      const ctxSpinner = ora(t().initBuildingContext).start();
      try {
        const context = await buildContext(cwd);
        fs.writeFileSync(contextPath(cwd), context, 'utf8');
        ctxSpinner.succeed(chalk.green(t().initContextCreated));
      } catch {
        ctxSpinner.warn(t().initContextSkipped);
        fs.writeFileSync(contextPath(cwd), getDefaultContext(cwd), 'utf8');
      }

      // 6. .gitignore
      appendGitignore(cwd);
      console.log(chalk.green(`  ✔ ${t().initGitignoreUpdated}`));

      const apiKeyEnv = DEFAULT_GLOBAL_CONFIG.claude?.api_key_env ?? 'CLAUDE_API_KEY';
      const tokenEnv = DEFAULT_GLOBAL_CONFIG.github.accounts['default']?.token_env ?? 'GITHUB_TOKEN';

      console.log(chalk.bold.green(t().initSuccessTitle));
      console.log(`  ${chalk.cyan('1.')} ${t().initStep1(apiKeyEnv)}`);
      console.log(`  ${chalk.cyan('2.')} ${t().initStep2(tokenEnv)}`);
      console.log(`  ${chalk.cyan('3.')} ${t().initStep3}`);
      console.log(`  ${chalk.cyan('4.')} ${t().initStep4}\n`);
      console.log(`  ${t().initEditContext(chalk.cyan('.aiv/context.md'))}`);
      console.log(`  ${t().initEditRules(chalk.cyan('.aiv/rules.yml'))}\n`);
      console.log(chalk.dim(t().initGlobalHint));
      console.log(chalk.dim(t().initAddAccountHint + '\n'));
    });
}

function getDefaultContext(cwd: string): string {
  const name = path.basename(cwd);
  return `# Project Context: ${name}

## Architecture
(Describe your system architecture here)

## Modules
(List main modules and their responsibilities)

## Technologies
(List key technologies and frameworks)

## Critical Dependencies
(List dependencies that are critical to the system)

## Sensitive Zones
(List sensitive areas: auth, payments, data access, etc.)

## Business Rules
(Describe key business rules the AI should be aware of)

## System Summary
(High-level summary of what this system does)
`;
}
