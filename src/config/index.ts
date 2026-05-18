import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';
import { GlobalConfig, RepoConfig, ResolvedConfig, AivRules, GithubAccount, CustomProviderConfig } from '../types';
import { t } from '../i18n';

// ─── Paths ─────────────────────────────────────────────────────────────────────

export function globalAivDir(): string {
  return path.join(os.homedir(), '.aiv');
}

export function globalConfigPath(): string {
  return path.join(globalAivDir(), 'config.yml');
}

export function getAivDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '.aiv');
}

export function configPath(cwd?: string): string {
  return path.join(getAivDir(cwd), 'config.yml');
}

export function rulesPath(cwd?: string): string {
  return path.join(getAivDir(cwd), 'rules.yml');
}

export function contextPath(cwd?: string): string {
  return path.join(getAivDir(cwd), 'context.md');
}

export function treePath(cwd?: string): string {
  return path.join(getAivDir(cwd), 'tree.json');
}

// ─── State checks ──────────────────────────────────────────────────────────────

export function isInitialized(cwd?: string): boolean {
  return fs.existsSync(configPath(cwd));
}

export function isGlobalSetup(): boolean {
  return fs.existsSync(globalConfigPath());
}

// ─── Global config (~/.aiv/config.yml) ────────────────────────────────────────

export function loadGlobalConfig(): GlobalConfig {
  const file = globalConfigPath();
  if (!fs.existsSync(file)) return { ...DEFAULT_GLOBAL_CONFIG };
  const parsed = yaml.load(fs.readFileSync(file, 'utf8')) as GlobalConfig;
  parsed.github ??= DEFAULT_GLOBAL_CONFIG.github;
  parsed.github.accounts ??= {};
  return parsed;
}

export function saveGlobalConfig(config: GlobalConfig): void {
  const dir = globalAivDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(globalConfigPath(), yaml.dump(config, { lineWidth: 120 }), 'utf8');
}

// ─── Repo config (.aiv/config.yml) ────────────────────────────────────────────

export function loadRepoConfig(cwd?: string): RepoConfig {
  const file = configPath(cwd);
  if (!fs.existsSync(file)) return {};
  return yaml.load(fs.readFileSync(file, 'utf8')) as RepoConfig;
}

export function saveRepoConfig(config: RepoConfig, cwd?: string): void {
  fs.writeFileSync(configPath(cwd), yaml.dump(config, { lineWidth: 120 }), 'utf8');
}

// ─── Rules (always per-repo) ───────────────────────────────────────────────────

export function loadRules(cwd?: string): AivRules {
  const file = rulesPath(cwd);
  if (!fs.existsSync(file)) return {};
  return yaml.load(fs.readFileSync(file, 'utf8')) as AivRules;
}

export function saveRules(rules: AivRules, cwd?: string): void {
  fs.writeFileSync(rulesPath(cwd), yaml.dump(rules, { lineWidth: 120 }), 'utf8');
}

// ─── Resolution ───────────────────────────────────────────────────────────────

export function resolveConfig(cwd?: string): ResolvedConfig {
  const global = loadGlobalConfig();
  const repo = loadRepoConfig(cwd);

  const accountName = repo.github?.account ?? global.github.default_account ?? 'default';
  const account: GithubAccount =
    global.github.accounts[accountName] ??
    global.github.accounts[global.github.default_account] ??
    Object.values(global.github.accounts)[0] ??
    { token_env: 'GITHUB_TOKEN' };

  const globalReview = global.review ?? DEFAULT_GLOBAL_CONFIG.review!;

  const gProviders = global.providers ?? DEFAULT_GLOBAL_CONFIG.providers;

  return {
    lang: global.lang ?? 'en',
    providers: {
      default: gProviders.default ?? 'claude',
      fallback: gProviders.fallback ?? [],
      agents: gProviders.agents ?? {},
    },
    claude:           global.claude           ?? DEFAULT_GLOBAL_CONFIG.claude!,
    openai:           global.openai           ?? DEFAULT_GLOBAL_CONFIG.openai!,
    gemini:           global.gemini           ?? DEFAULT_GLOBAL_CONFIG.gemini!,
    custom_providers: global.custom_providers ?? {},
    review: {
      max_tokens: repo.review?.max_tokens ?? globalReview.max_tokens,
      max_findings: repo.review?.max_findings ?? globalReview.max_findings,
    },
    github: {
      accountName,
      token_env: account.token_env,
      username: account.username,
      owner: repo.github?.owner,
      repo: repo.github?.repo,
    },
  };
}

// ─── Token helper ─────────────────────────────────────────────────────────────

export function getGithubToken(config: ResolvedConfig): string {
  const token = process.env[config.github.token_env];
  if (!token) throw new Error(t().errorMissingToken(config.github.token_env, config.github.accountName));
  return token;
}

// ─── Account management ───────────────────────────────────────────────��───────

export function addAccount(name: string, account: GithubAccount): void {
  const config = loadGlobalConfig();
  config.github.accounts[name] = account;
  if (Object.keys(config.github.accounts).length === 1) {
    config.github.default_account = name;
  }
  saveGlobalConfig(config);
}

export function removeAccount(name: string): void {
  const config = loadGlobalConfig();
  if (!(name in config.github.accounts)) throw new Error(t().errorAccountNotFound(name));
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete config.github.accounts[name];
  if (config.github.default_account === name) {
    config.github.default_account = Object.keys(config.github.accounts)[0] ?? '';
  }
  saveGlobalConfig(config);
}

export function setDefaultAccount(name: string): void {
  const config = loadGlobalConfig();
  if (!(name in config.github.accounts)) throw new Error(t().errorAccountNotFound(name));
  config.github.default_account = name;
  saveGlobalConfig(config);
}

export function setRepoAccount(name: string, cwd?: string): void {
  const global = loadGlobalConfig();
  if (!(name in global.github.accounts)) throw new Error(t().errorAccountNotFoundGlobal(name));
  const repo = loadRepoConfig(cwd);
  repo.github ??= {};
  repo.github.account = name;
  saveRepoConfig(repo, cwd);
}

export function listAccounts(): Array<{ name: string; account: GithubAccount; isDefault: boolean; hasToken: boolean }> {
  const config = loadGlobalConfig();
  return Object.entries(config.github.accounts).map(([name, account]) => ({
    name,
    account,
    isDefault: name === config.github.default_account,
    hasToken: Boolean(process.env[account.token_env]),
  }));
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  lang: 'en',
  providers: { default: 'claude' },
  claude:  { model: 'claude-sonnet-4-6', api_key_env: 'CLAUDE_API_KEY' },
  openai:  { model: 'gpt-4.1',           api_key_env: 'OPENAI_API_KEY' },
  gemini:  { model: 'gemini-2.0-flash',  api_key_env: 'GEMINI_API_KEY' },
  custom_providers: {},
  review: { max_tokens: 20000, max_findings: 20 },
  github: {
    default_account: 'default',
    accounts: {
      default: { token_env: 'GITHUB_TOKEN', description: 'Default GitHub account' },
    },
  },
};

// ─── Custom provider management ───────────────────────────────────────────────

export function addCustomProvider(name: string, cfg: CustomProviderConfig): void {
  const config = loadGlobalConfig();
  config.custom_providers ??= {};
  config.custom_providers[name] = cfg;
  saveGlobalConfig(config);
}

export function removeCustomProvider(name: string): void {
  const config = loadGlobalConfig();
  if (!config.custom_providers?.[name]) throw new Error(t().customProviderNotFound(name));
  delete config.custom_providers[name];
  saveGlobalConfig(config);
}

export function listCustomProviders(): Array<{ name: string; cfg: CustomProviderConfig; hasToken: boolean }> {
  const config = loadGlobalConfig();
  return Object.entries(config.custom_providers ?? {}).map(([name, cfg]) => ({
    name,
    cfg,
    hasToken: Boolean(process.env[cfg.api_key_env]),
  }));
}

export const DEFAULT_REPO_CONFIG: RepoConfig = {
  github: {},
  context: { provider: 'local' },
};

export const DEFAULT_RULES: AivRules = {
  sensitive_modules: ['auth', 'payroll', 'payments', 'billing'],
  business_rules: {
    payroll: { required_calls: ['auditLog', 'validateTransaction'] },
    auth: { required_checks: ['permissionValidation'] },
  },
};
