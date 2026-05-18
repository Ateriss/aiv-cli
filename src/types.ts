// ─── GitHub account ───────────────────────────────────────────────────────────

export interface GithubAccount {
  token_env: string;
  username?: string;
  description?: string;
}

// ─── Global config (~/.aiv/config.yml) ───────────────────────────────────────
// Agent providers, model settings, default GH account.
// Shared across all repos on this machine.

export interface CustomProviderConfig {
  base_url: string;
  api_key_env: string;
  model: string;
}

export interface BuiltinProviderConfig {
  model: string;
  api_key_env: string;
}

export interface GlobalConfig {
  lang?: 'en' | 'es';
  providers: {
    default: string;                 // 'claude' | 'openai' | 'gemini' | 'mock' | custom name
    fallback?: string[];
    agents?: Record<string, string>; // { business: 'claude/claude-sonnet-4-6', security: 'kimi' }
  };
  claude?: BuiltinProviderConfig;
  openai?: BuiltinProviderConfig;
  gemini?: BuiltinProviderConfig;
  custom_providers?: Record<string, CustomProviderConfig>;
  review?: {
    max_tokens: number;
    max_findings: number;
  };
  github: {
    default_account: string;
    accounts: Record<string, GithubAccount>;
  };
}

// ─── Repo config (.aiv/config.yml) ────────────────────────────────────────────
// Per-repository overrides: which GH account to use, owner/repo, token limits.

export interface RepoConfig {
  github?: {
    account?: string;   // references a name in GlobalConfig.github.accounts
    owner?: string;
    repo?: string;
  };
  context?: {
    provider: 'local';
  };
  review?: {
    max_tokens?: number;
    max_findings?: number;
  };
}

// ─── Resolved config (global + repo merged, ready to use) ─────────────────────

export interface ResolvedConfig {
  lang: 'en' | 'es';
  providers: {
    default: string;
    fallback: string[];
    agents: Record<string, string>;
  };
  claude: BuiltinProviderConfig;
  openai: BuiltinProviderConfig;
  gemini: BuiltinProviderConfig;
  custom_providers: Record<string, CustomProviderConfig>;
  review: { max_tokens: number; max_findings: number };
  github: {
    accountName: string;
    token_env: string;
    username?: string;
    owner?: string;
    repo?: string;
  };
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface AivRules {
  sensitive_modules?: string[];
  business_rules?: Record<string, {
    required_calls?: string[];
    required_checks?: string[];
    forbidden_patterns?: string[];
  }>;
}

export interface TreeNode {
  path: string;
  type: 'file' | 'directory';
  module_type?: 'auth' | 'sql' | 'frontend' | 'backend' | 'infra' | 'config' | 'test' | 'other';
  sensitivity?: 'low' | 'medium' | 'high';
  children?: TreeNode[];
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  url: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: string[];
  description?: string;
}

export interface PRFile {
  filename: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface PRDiff {
  pr: PullRequest;
  files: PRFile[];
  rawDiff: string;
}

export interface AgentFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  file?: string;
  suggestion?: string;
}

export interface AgentResult {
  agentName: string;
  findings: AgentFinding[];
  summary: string;
  riskScore: number;
}

export interface ReviewResult {
  prNumber: number;
  prTitle: string;
  executiveSummary: string;
  riskScore: number;
  riskLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  agents: AgentResult[];
  businessRisks: AgentFinding[];
  architectureIssues: AgentFinding[];
  securityIssues: AgentFinding[];
  possibleRegressions: string[];
  generatedAt: string;
}

export interface ProjectContext {
  architecture: string;
  modules: string[];
  technologies: string[];
  criticalDependencies: string[];
  sensitiveZones: string[];
  businessRules: string[];
  systemSummary: string;
}
