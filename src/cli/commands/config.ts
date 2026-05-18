import { Command } from 'commander';
import * as fs from 'node:fs';
import chalk from 'chalk';
import { table } from 'table';
import {
  isInitialized, loadRepoConfig, saveRepoConfig,
  loadGlobalConfig, saveGlobalConfig,
  configPath, rulesPath, globalConfigPath,
  addAccount, removeAccount, setDefaultAccount, setRepoAccount, listAccounts,
  addCustomProvider, removeCustomProvider, listCustomProviders,
} from '../../config';
import { t, setLang, isSupported, SUPPORTED_LANGS } from '../../i18n';
import { GithubAccount } from '../../types';

export function configCommand(): Command {
  const cmd = new Command('config').alias('cf').description('View or update aiv configuration');

  // ── show ──────────────────────────────────────────────────────────────────────
  cmd
    .command('show')
    .description('Show global and repo config')
    .action(() => {
      const tr = t();
      console.log('\n' + chalk.bold(tr.configGlobalTitle) + '\n');
      const gPath = globalConfigPath();
      console.log(fs.existsSync(gPath)
        ? fs.readFileSync(gPath, 'utf8')
        : chalk.dim(tr.configNotCreated));

      if (isInitialized()) {
        console.log(chalk.bold(tr.configRepoConfigTitle) + '\n');
        console.log(fs.readFileSync(configPath(), 'utf8'));
      }
    });

  // ── set-provider ──────────────────────────────────────────────────────────────
  cmd
    .command('set-provider <provider>')
    .description('Set default AI provider (claude | openai | gemini | mock | <custom-name>)')
    .action((provider: string) => {
      const BUILTIN = new Set(['claude', 'openai', 'gemini', 'mock']);
      const config  = loadGlobalConfig();
      const isKnown = BUILTIN.has(provider) || provider in (config.custom_providers ?? {});
      if (!isKnown) {
        console.log(chalk.red(t().invalidProvider));
        return;
      }
      config.providers.default = provider;
      saveGlobalConfig(config);
      console.log(chalk.green(t().configProviderSet(provider)));
    });

  // ── add-provider ──────────────────────────────────────────────────────────────
  cmd
    .command('add-provider <name>')
    .description('Register an AI provider. Built-in: gemini. Custom: any OpenAI-compatible endpoint.')
    .option('--base-url <url>',     'Base URL for OpenAI-compatible providers (required for custom)')
    .option('--api-key-env <var>',  'Env var holding the API key')
    .option('--model <model>',      'Default model for this provider')
    .option('--force',              'Overwrite if provider already exists')
    .action((name: string, opts) => {
      const BUILTIN_NAMES = new Set(['claude', 'openai', 'gemini', 'mock']);
      if (BUILTIN_NAMES.has(name)) {
        applyBuiltinProviderUpdate(name, opts);
      } else {
        applyCustomProviderAdd(name, opts);
      }
    });

  // ── remove-provider ───────────────────────────────────────────────────────────
  cmd
    .command('remove-provider <name>')
    .description('Remove a custom provider from global config')
    .action((name: string) => {
      try {
        removeCustomProvider(name);
        console.log(chalk.green(t().customProviderRemoved(name)));
      } catch {
        console.log(chalk.red(t().customProviderNotFound(name)));
      }
    });

  // ── list-providers ────────────────────────────────────────────────────────────
  cmd
    .command('list-providers')
    .description('List all configured providers (built-in and custom)')
    .action(() => {
      const tr      = t();
      const config  = loadGlobalConfig();
      const customs = listCustomProviders();

      // Built-ins
      console.log(chalk.bold('\n  Built-in Providers\n'));
      for (const name of ['claude', 'openai', 'gemini'] as const) {
        const s    = config[name];
        const mark = config.providers.default === name ? chalk.green(' ✔ default') : '';
        if (s) {
          console.log(`  ${chalk.cyan(name.padEnd(8))} model=${chalk.dim(s.model)}  key_env=${chalk.dim(s.api_key_env)}${mark}`);
        }
      }

      // Custom
      console.log(chalk.bold(tr.customProviderTitle));
      if (customs.length === 0) {
        console.log(chalk.dim(tr.customProviderNone));
      } else {
        const rows = customs.map(({ name, cfg, hasToken }) => [
          config.providers.default === name ? chalk.green(name) : name,
          chalk.dim(cfg.base_url),
          chalk.dim(cfg.model),
          chalk.dim(cfg.api_key_env),
          hasToken ? chalk.green('found') : chalk.red('missing'),
        ]);
        const header = [
          chalk.bold(tr.customProviderColName),
          chalk.bold(tr.customProviderColUrl),
          chalk.bold(tr.customProviderColModel),
          chalk.bold(tr.customProviderColEnvVar),
          chalk.bold(tr.customProviderColToken),
        ];
        console.log(table([header, ...rows], {
          border: {
            topBody: '─', topJoin: '┬', topLeft: '╭', topRight: '╮',
            bottomBody: '─', bottomJoin: '┴', bottomLeft: '╰', bottomRight: '╯',
            bodyLeft: '│', bodyRight: '│', bodyJoin: '│',
            joinBody: '─', joinLeft: '├', joinRight: '┤', joinJoin: '┼',
          },
          columnDefault: { paddingLeft: 1, paddingRight: 1 },
        }));
      }
      console.log();
    });

  // ── set-repo ──────────────────────────────────────────────────────────────────
  cmd
    .command('set-repo <owner> <repo>')
    .description('Set GitHub owner and repo in repo config')
    .action((owner: string, repo: string) => {
      if (!isInitialized()) { console.log(chalk.red(t().notInitialized)); return; }
      const config = loadRepoConfig();
      config.github ??= {};
      config.github.owner = owner;
      config.github.repo = repo;
      saveRepoConfig(config);
      console.log(chalk.green(t().configRepoSet(owner, repo)));
    });

  // ── set-lang ──────────────────────────────────────────────────────────────────
  cmd
    .command(`set-lang <lang>`)
    .description(`Set display language (${SUPPORTED_LANGS.join(' | ')})`)
    .action((lang: string) => {
      if (!isSupported(lang)) {
        console.log(chalk.red(t().configInvalidLang));
        return;
      }
      const config = loadGlobalConfig();
      config.lang = lang;
      saveGlobalConfig(config);
      setLang(lang);
      console.log(chalk.green(t().configLangSet(lang)));
    });

  // ── rules ─────────────────────────────────────────────────────────────────────
  cmd
    .command('rules')
    .description('Show repo rules.yml')
    .action(() => {
      if (!isInitialized()) { console.log(chalk.red(t().notInitialized)); return; }
      const tr = t();
      console.log('\n' + chalk.bold(tr.configRulesTitle) + '\n');
      const rPath = rulesPath();
      console.log(fs.existsSync(rPath) ? fs.readFileSync(rPath, 'utf8') : chalk.yellow(tr.configNoRules));
    });

  // ── accounts ──────────────────────────────────────────────────────────────────
  cmd
    .command('accounts')
    .description('List GitHub accounts in global config')
    .action(() => {
      const tr = t();
      const accounts = listAccounts();

      console.log(chalk.bold(tr.accountsTitle));

      if (accounts.length === 0) {
        console.log(chalk.yellow(tr.accountsNone));
        return;
      }

      const rows = accounts.map(({ name, account, isDefault, hasToken }) => [
        isDefault ? chalk.green(name) : name,
        isDefault ? chalk.green(tr.accountsDefaultMark) : '',
        account.username ? chalk.dim(account.username) : chalk.dim('—'),
        chalk.dim(account.token_env),
        hasToken ? chalk.green(tr.accountsTokenFound) : chalk.red(tr.accountsTokenMissing),
        chalk.dim(account.description ?? ''),
      ]);

      const header = [
        chalk.bold(tr.accountsColName),
        chalk.bold(tr.accountsColDefault),
        chalk.bold(tr.accountsColUser),
        chalk.bold(tr.accountsColEnvVar),
        chalk.bold(tr.accountsColToken),
        chalk.bold(tr.accountsColDesc),
      ];

      console.log(table([header, ...rows], {
        border: {
          topBody: '─', topJoin: '┬', topLeft: '╭', topRight: '╮',
          bottomBody: '─', bottomJoin: '┴', bottomLeft: '╰', bottomRight: '╯',
          bodyLeft: '│', bodyRight: '│', bodyJoin: '│',
          joinBody: '─', joinLeft: '├', joinRight: '┤', joinJoin: '┼',
        },
        columnDefault: { paddingLeft: 1, paddingRight: 1 },
      }));

      console.log(chalk.dim(tr.accountsGlobalHint));
      if (isInitialized()) {
        const repoAccount = loadRepoConfig().github?.account;
        if (repoAccount) {
          console.log(chalk.dim(tr.configRepoAccountHint(repoAccount)));
        }
      }
      console.log(chalk.dim(tr.accountsRepoHint));
    });

  // ── add-account ───────────────────────────────────────────────────────────────
  cmd
    .command('add-account <name>')
    .description('Add a GitHub account to global config')
    .requiredOption('--token-env <envVar>', 'Environment variable holding the GitHub token')
    .option('--username <username>', 'GitHub username (optional, for display)')
    .option('--description <desc>', 'Short description (optional)')
    .option('--force', 'Overwrite if account already exists')
    .action((name: string, opts) => {
      const existing = listAccounts().find(a => a.name === name);
      if (existing && !opts.force) {
        console.log(chalk.yellow(t().accountsAlreadyExists(name)));
        return;
      }
      const account: GithubAccount = {
        token_env: opts.tokenEnv,
        username: opts.username,
        description: opts.description,
      };
      addAccount(name, account);
      console.log(chalk.green(t().accountsAdded(name)));
      console.log(chalk.dim(t().configTokenEnvHint(opts.tokenEnv)));
      if (opts.username) console.log(chalk.dim(t().configUsernameHint(opts.username)));
    });

  // ── remove-account ────────────────────────────────────────────────────────────
  cmd
    .command('remove-account <name>')
    .description('Remove a GitHub account from global config')
    .action((name: string) => {
      try {
        removeAccount(name);
        console.log(chalk.green(t().accountsRemoved(name)));
      } catch {
        console.log(chalk.red(t().accountsNotFound(name)));
      }
    });

  // ── default-account ───────────────────────────────────────────────────────────
  cmd
    .command('default-account <name>')
    .description('Set the global default GitHub account')
    .action((name: string) => {
      try {
        setDefaultAccount(name);
        console.log(chalk.green(t().accountsDefaultSet(name)));
      } catch {
        console.log(chalk.red(t().accountsNotFound(name)));
      }
    });

  // ── use-account ───────────────────────────────────────────────────────────────
  cmd
    .command('use-account <name>')
    .description('Use a specific GitHub account for this repo (overrides global default)')
    .action((name: string) => {
      if (!isInitialized()) { console.log(chalk.red(t().notInitialized)); return; }
      try {
        setRepoAccount(name);
        console.log(chalk.green(t().accountsRepoSet(name)));
        console.log(chalk.dim(t().configSavedToRepo));
      } catch (e: any) {
        console.log(chalk.red((e as Error).message));
      }
    });

  // ── set-agent-provider ────────────────────────────────────────────────────────
  cmd
    .command('set-agent-provider <agent> [spec]')
    .description('Assign a provider+model to a specific agent (e.g. business claude/claude-haiku-4-5)')
    .option('--clear', 'Remove the override for this agent')
    .action((agent: string, spec: string | undefined, opts) => {
      const VALID_AGENTS = new Set(['business', 'architecture', 'security', 'context']);
      if (!VALID_AGENTS.has(agent)) {
        console.log(chalk.red(t().configInvalidAgentName(agent)));
        return;
      }

      const config = loadGlobalConfig();
      config.providers.agents ??= {};

      if (opts.clear) {
        delete config.providers.agents[agent];
        saveGlobalConfig(config);
        console.log(chalk.green(t().configAgentProviderSet(agent, '(default)')));
        return;
      }

      if (!spec) {
        console.log(chalk.red(t().configInvalidProviderSpec('')));
        return;
      }

      const BUILTIN_PROVIDERS = new Set(['claude', 'openai', 'gemini', 'mock']);
      const providerName = spec.split('/')[0];
      const knownCustom  = Object.keys(loadGlobalConfig().custom_providers ?? {});
      if (!BUILTIN_PROVIDERS.has(providerName) && !knownCustom.includes(providerName)) {
        console.log(chalk.red(t().configInvalidProviderSpec(spec)));
        return;
      }

      config.providers.agents[agent] = spec;
      saveGlobalConfig(config);
      console.log(chalk.green(t().configAgentProviderSet(agent, spec)));
    });

  // ── set-fallback ─────────────────────────────────────────────────────────────
  cmd
    .command('set-fallback [providers...]')
    .description('Set ordered fallback provider chain (e.g. openai claude). Pass no args to clear.')
    .action((providers: string[]) => {
      const cfg     = loadGlobalConfig();
      const VALID   = new Set(['claude', 'openai', 'gemini', 'mock', ...Object.keys(cfg.custom_providers ?? {})]);
      const invalid = providers.filter(p => !VALID.has(p));
      if (invalid.length > 0) {
        console.log(chalk.red(t().configInvalidProviderSpec(invalid.join(', '))));
        return;
      }

      const config = cfg;
      config.providers.fallback = providers;
      saveGlobalConfig(config);

      if (providers.length === 0) {
        console.log(chalk.green(t().configFallbackCleared));
      } else {
        console.log(chalk.green(t().configFallbackSet(providers.join(' → '))));
      }
    });

  // ── show-agent-providers ──────────────────────────────────────────────────────
  cmd
    .command('show-agents')
    .description('Show per-agent provider assignments and fallback chain')
    .action(() => {
      const config = loadGlobalConfig();
      const tr = t();
      const agents = config.providers.agents ?? {};
      const fallback = config.providers.fallback ?? [];

      console.log(chalk.bold(tr.configAgentProviderShow));

      if (Object.keys(agents).length === 0) {
        console.log(chalk.dim(tr.configAgentProviderNone));
      } else {
        for (const [agent, spec] of Object.entries(agents)) {
          console.log(`  ${chalk.cyan(agent.padEnd(14))} ${spec}`);
        }
      }

      console.log();
      console.log(`  ${'default'.padEnd(14)} ${chalk.dim(config.providers.default)}`);

      if (fallback.length > 0) {
        console.log(`  ${'fallback'.padEnd(14)} ${chalk.dim(fallback.join(' → '))}`);
      }

      console.log();
    });

  cmd.action(() => cmd.help());

  return cmd;
}

// ─── Helpers for add-provider ─────────────────────────────────────────────────

function applyBuiltinProviderUpdate(name: string, opts: { model?: string; apiKeyEnv?: string }): void {
  if (!opts.model && !opts.apiKeyEnv) {
    console.log(chalk.yellow('  Provide --model, --api-key-env, or both to update a built-in provider.'));
    return;
  }
  const config  = loadGlobalConfig();
  const section = (config as any)[name] ?? {};
  if (opts.model)     section.model       = opts.model;
  if (opts.apiKeyEnv) section.api_key_env = opts.apiKeyEnv;
  (config as any)[name] = section;
  saveGlobalConfig(config);
  console.log(chalk.green(t().builtinProviderSet(name, section.model, section.api_key_env)));
}

function applyCustomProviderAdd(name: string, opts: { baseUrl?: string; apiKeyEnv?: string; model?: string; force?: boolean }): void {
  if (!opts.baseUrl) {
    console.log(chalk.red(t().customProviderBaseUrlRequired));
    return;
  }
  const config = loadGlobalConfig();
  if (config.custom_providers?.[name] && !opts.force) {
    console.log(chalk.yellow(t().customProviderAlreadyExists(name)));
    return;
  }
  addCustomProvider(name, {
    base_url:    opts.baseUrl,
    api_key_env: opts.apiKeyEnv ?? `${name.toUpperCase()}_API_KEY`,
    model:       opts.model     ?? 'unknown',
  });
  console.log(chalk.green(t().customProviderAdded(name)));
}
