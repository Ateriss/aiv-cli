# aiv — AI PR Reviewer

A local-first, multi-agent CLI for reviewing GitHub pull requests using any supported AI provider. Runs three specialized agents in parallel (Business, Architecture, Security) and produces a structured risk report with findings, suggestions, and an executive summary.

```
 █████╗ ██╗    ██████╗ ██████╗     ██████╗ ███████╗██╗   ██╗██╗███████╗██╗    ██╗███████╗██████╗ 
██╔══██╗██║    ██╔══██╗██╔══██╗    ██╔══██╗██╔════╝██║   ██║██║██╔════╝██║    ██║██╔════╝██╔══██╗
███████║██║    ██████╔╝██████╔╝    ██████╔╝█████╗  ██║   ██║██║█████╗  ██║ █╗ ██║█████╗  ██████╔╝
██╔══██║██║    ██╔═══╝ ██╔══██╗    ██╔══██╗██╔══╝  ╚██╗ ██╔╝██║██╔══╝  ██║███╗██║██╔══╝  ██╔══██╗
██║  ██║██║    ██║     ██║  ██║    ██║  ██║███████╗ ╚████╔╝ ██║███████╗╚███╔███╔╝███████╗██║  ██║
╚═╝  ╚═╝╚═╝    ╚═╝     ╚═╝  ╚═╝    ╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝
                                                                                                
													                                                             by Ateriss
```

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [Configuration](#configuration)
  - [Global Config](#global-config-aivconfig-yml)
  - [Repo Config](#repo-config-aivconfigyml)
  - [Rules](#rules-aivrules-yml)
  - [Context](#context-aivcontextmd)
- [GitHub Account Management](#github-account-management)
- [AI Providers](#ai-providers)
- [Review Output](#review-output)
- [Multi-language](#multi-language)
- [Environment Variables](#environment-variables)
- [Error Reference](#error-reference)
- [Best Practices](#best-practices)

---

## Requirements

- Node.js 18 or higher
- A GitHub personal access token with `repo` scope
- An API key for at least one supported AI provider (see [AI Providers](#ai-providers))

---

## Installation

```bash
npm install -g aiv
```

Or clone and build locally:

```bash
git clone https://github.com/your-org/aiv-cli
cd aiv-cli
npm install
npm run build
npm link
```

---

## Quick Start

**1. Initialize aiv in your project repository:**

```bash
cd your-repo
aiv init
```

This creates:
- `~/.aiv/config.yml` — global config (AI provider, GitHub accounts)
- `.aiv/config.yml` — repo config (owner, repo, account override)
- `.aiv/rules.yml` — custom review rules for agents
- `.aiv/context.md` — auto-generated project context
- `.aiv/tree.json` — project file structure snapshot

**2. Set your API key and GitHub token:**

```bash
export CLAUDE_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...
```

**3. List open pull requests:**

```bash
aiv prs
```

**4. Review a PR:**

```bash
aiv review 42
```

That's it. The three agents run in parallel and print a full report.

---

## Commands Reference

Every command has a short alias. Long and short forms are identical.

| Long form                              | Short alias   | Description                                       |
|----------------------------------------|---------------|---------------------------------------------------|
| `aiv init`                             | `aiv i`       | Initialize aiv in the current repo                |
| `aiv prs`                              | `aiv p`       | List open PRs and optionally review one           |
| `aiv review [pr-number]`               | `aiv r`       | Review a PR or pick one interactively             |
| `aiv context refresh`                  | `aiv ctx refresh` | Rebuild `context.md` and `tree.json`         |
| `aiv context show`                     | `aiv ctx show` | Print current `context.md`                      |
| `aiv config show`                      | `aiv cf show` | Show global and repo config                       |
| `aiv config set-provider <provider>`   | `aiv cf set-provider` | Switch AI provider                      |
| `aiv config set-repo <owner> <repo>`   | `aiv cf set-repo` | Set GitHub owner/repo in repo config        |
| `aiv config set-lang <lang>`           | `aiv cf set-lang` | Change display language (`en` / `es`)       |
| `aiv config rules`                     | `aiv cf rules` | Print `rules.yml`                               |
| `aiv config accounts`                  | `aiv cf accounts` | List GitHub accounts                        |
| `aiv config add-account <name>`        | `aiv cf add-account` | Add a GitHub account                     |
| `aiv config remove-account <name>`     | `aiv cf remove-account` | Remove a GitHub account               |
| `aiv config default-account <name>`    | `aiv cf default-account` | Set global default account           |
| `aiv config use-account <name>`        | `aiv cf use-account` | Use an account for this repo             |
| `aiv agents`                           | `aiv a`       | List available agents and their focus areas       |

---

### `aiv init`

Initializes aiv globally and in the current repository.

```bash
aiv init
aiv i
```

Safe to run in any order — if `~/.aiv/config.yml` already exists it is preserved. Re-running `init` inside a repo always rebuilds `context.md` and `tree.json` to reflect the current state of the project.

---

### `aiv prs`

Fetches and displays open pull requests in a table, then opens an interactive selector.

```bash
aiv prs
aiv p

# Limit results
aiv prs --limit 10

# Override repo auto-detection
aiv prs --owner myorg --repo myrepo

# List only, skip interactive selector
aiv prs --no-select
```

The table shows PR number, title, author, branch, diff size (`+additions/-deletions`), and creation date. After the table, an interactive prompt lets you select a PR and launch a review without typing a number.

**Repo auto-detection:** aiv reads `git remote get-url origin` to detect the GitHub owner and repo. If the remote is not a GitHub URL or is missing, use `--owner`/`--repo` flags or configure them in `.aiv/config.yml`.

---

### `aiv review`

Reviews a pull request. Accepts a PR number directly or launches an interactive selector if omitted.

```bash
# Review by number
aiv review 42
aiv r 42

# Interactive selector (fetches open PRs first)
aiv review
aiv r

# Override repo
aiv review 42 --owner myorg --repo myrepo

# Run specific agents only
aiv review 42 --agent security
aiv review 42 --agent business architecture

# Output raw JSON (useful for scripting and CI)
aiv review 42 --json
```

Available agents: `business`, `architecture`, `security`. All three run in parallel by default.

---

### `aiv context`

Manages the project context used by agents during reviews.

```bash
# Rebuild context.md and tree.json from the current directory
aiv context refresh
aiv ctx refresh

# Print the current context.md
aiv context show
aiv ctx show
```

Run `context refresh` after major structural changes to the project (new modules, new dependencies, large refactors) so agents have accurate background information.

---

### `aiv config`

All configuration subcommands. Running `aiv config` or `aiv cf` alone prints help.

```bash
# Show global and repo config files
aiv config show
aiv cf show

# Switch AI provider
aiv config set-provider openai
aiv cf set-provider claude

# Set repo owner/repo explicitly
aiv config set-repo myorg myrepo

# Change display language
aiv config set-lang es
aiv config set-lang en

# Show rules.yml
aiv config rules
```

---

### `aiv agents`

Lists all available agents with their description and focus areas.

```bash
aiv agents
aiv a
```

| Agent        | Focus areas                                                              |
|--------------|--------------------------------------------------------------------------|
| business     | Business logic, domain invariants, rule violations, functional regressions |
| architecture | Layer violations, coupling, SRP, dependency direction, abstraction quality |
| security     | Auth bypass, injection, data leakage, OWASP Top 10, sensitive data handling |

---

## Configuration

aiv uses a two-level configuration system:

| File                  | Scope  | Purpose                                           |
|-----------------------|--------|---------------------------------------------------|
| `~/.aiv/config.yml`  | Global | AI providers, GitHub accounts, default settings   |
| `.aiv/config.yml`    | Repo   | Owner/repo override, account override, token limits |

Repo-level settings always override global defaults.

---

### Global Config (`~/.aiv/config.yml`)

Created automatically by `aiv init`. Edit manually or use `aiv config` subcommands.

```yaml
lang: en                        # 'en' or 'es'

providers:
  default: claude               # 'claude', 'openai', or 'mock'

claude:
  model: claude-sonnet-4-6
  api_key_env: CLAUDE_API_KEY   # env var holding your Anthropic key

openai:
  model: gpt-4.1
  api_key_env: OPENAI_API_KEY   # env var holding your OpenAI key

review:
  max_tokens: 20000             # max tokens sent to the model per agent
  max_findings: 20              # max findings returned per review

github:
  default_account: personal
  accounts:
    personal:
      token_env: GITHUB_TOKEN
      username: alice
      description: Personal account
    work:
      token_env: GITHUB_TOKEN_WORK
      username: alice-corp
      description: Work account
```

---

### Repo Config (`.aiv/config.yml`)

Created in each repository by `aiv init`. Overrides global defaults for that repo.

```yaml
github:
  account: work                 # use the 'work' account from global config
  owner: myorg                  # override auto-detected GitHub owner
  repo: backend-api             # override auto-detected GitHub repo

review:
  max_tokens: 30000             # allow larger diffs for this repo
  max_findings: 30
```

Leave any field out to inherit from global config. The `account` field references a named account defined in `~/.aiv/config.yml`.

---

### Rules (`.aiv/rules.yml`)

Defines custom rules that all agents respect. Edit after `aiv init`.

```yaml
sensitive_modules:
  - auth
  - payroll
  - payments
  - billing

business_rules:
  payroll:
    required_calls:
      - auditLog
      - validateTransaction
  auth:
    required_checks:
      - permissionValidation
  payments:
    forbidden_patterns:
      - directDbWrite
```

Rules are passed verbatim to every agent on every review. The business and security agents use them to flag violations explicitly.

---

### Context (`.aiv/context.md`)

Auto-generated by `aiv init` and `aiv context refresh`. Contains a summary of the project that agents use as background knowledge before reading the diff. You can append custom sections manually — they are preserved on the next refresh.

```markdown
## Business Context

This is an e-commerce platform handling real-money transactions.
All changes touching `src/payments/` must include an audit log entry.
The `UserBalance` model must never be modified outside the `billing` module.

## Architecture

Three-layer: HTTP handlers → service layer → repositories.
Cross-layer imports are forbidden; services must not import from handlers.

## Sensitive Zones

- src/auth/ — JWT issuance and validation
- src/payments/ — Stripe integration, never bypass PaymentGateway
```

The richer this file, the more accurate the agent findings.

---

## GitHub Account Management

aiv supports multiple GitHub accounts (personal, work, CI bot) stored globally and activated per repo.

### Add accounts

```bash
# Minimum — just the env var name
aiv config add-account personal --token-env GITHUB_TOKEN

# With optional metadata
aiv config add-account work \
  --token-env GITHUB_TOKEN_WORK \
  --username alice-corp \
  --description "Work GitHub account"

# Overwrite an existing account
aiv config add-account work --token-env NEW_VAR --force
```

### List accounts

```bash
aiv config accounts
```

Shows all configured accounts, their token env vars, which ones are set, and which is the global default.

### Set global default

```bash
aiv config default-account work
```

All repos without an explicit account override will use this account.

### Use a specific account for one repo

```bash
cd my-work-repo
aiv config use-account work
```

This writes `github.account: work` into `.aiv/config.yml`. Only affects the current repo.

### Remove an account

```bash
aiv config remove-account old-account
```

### Account resolution order

When aiv needs a GitHub token it checks:

1. `github.account` in `.aiv/config.yml` (repo-level override)
2. `github.default_account` in `~/.aiv/config.yml`
3. First account listed in `~/.aiv/config.yml`
4. Fallback to `GITHUB_TOKEN` env var directly

---

## AI Providers

aiv supports three kinds of providers:

| Type | Examples | Notes |
|------|----------|-------|
| **Built-in** | Claude, OpenAI, Gemini | Native adapters, configured in `~/.aiv/config.yml` |
| **OpenAI-compatible** | Kimi, Groq, Mistral, DeepSeek, Ollama, Together AI, … | Any new provider with a compatible endpoint — no code changes |
| **Mock** | — | Deterministic offline responses for testing |

---

### Claude (default)

```bash
export CLAUDE_API_KEY=sk-ant-...
aiv config set-provider claude
```

Update model or key env without editing the file:

```bash
aiv config add-provider claude --model claude-opus-4-7
aiv config add-provider claude --api-key-env MY_CLAUDE_KEY
```

```yaml
# ~/.aiv/config.yml
claude:
  model: claude-sonnet-4-6
  api_key_env: CLAUDE_API_KEY
```

---

### OpenAI

```bash
export OPENAI_API_KEY=sk-...
aiv config set-provider openai
```

```yaml
openai:
  model: gpt-4.1
  api_key_env: OPENAI_API_KEY
```

---

### Google Gemini

Gemini uses a dedicated REST adapter (no extra SDK required).

```bash
export GEMINI_API_KEY=AIza...
aiv config set-provider gemini
```

Update model:

```bash
aiv config add-provider gemini --model gemini-2.0-flash-exp
```

```yaml
gemini:
  model: gemini-2.0-flash
  api_key_env: GEMINI_API_KEY
```

---

### OpenAI-compatible providers (custom)

Any provider that exposes an OpenAI-compatible API can be registered with one command. This includes every new provider that adopts the OpenAI spec — no code changes or updates needed.

```bash
# Kimi (Moonshot AI)
export KIMI_API_KEY=sk-...
aiv config add-provider kimi \
  --base-url https://api.moonshot.cn/v1 \
  --api-key-env KIMI_API_KEY \
  --model moonshot-v1-8k

# Groq
export GROQ_API_KEY=gsk_...
aiv config add-provider groq \
  --base-url https://api.groq.com/openai/v1 \
  --api-key-env GROQ_API_KEY \
  --model llama-3.3-70b-versatile

# Mistral
export MISTRAL_API_KEY=...
aiv config add-provider mistral \
  --base-url https://api.mistral.ai/v1 \
  --api-key-env MISTRAL_API_KEY \
  --model mistral-large-latest

# DeepSeek
aiv config add-provider deepseek \
  --base-url https://api.deepseek.com/v1 \
  --api-key-env DEEPSEEK_API_KEY \
  --model deepseek-chat

# Together AI
aiv config add-provider together \
  --base-url https://api.together.xyz/v1 \
  --api-key-env TOGETHER_API_KEY \
  --model meta-llama/Llama-3-70b-chat-hf

# Ollama (local, no key needed)
aiv config add-provider ollama \
  --base-url http://localhost:11434/v1 \
  --api-key-env OLLAMA_API_KEY \
  --model llama3.2
```

Once registered, use any custom provider exactly like a built-in:

```bash
aiv config set-provider kimi
aiv config set-agent-provider security groq/llama-3.3-70b-versatile
aiv config set-fallback groq openai
```

Manage custom providers:

```bash
aiv config list-providers                   # show all built-in + custom
aiv config remove-provider kimi             # remove a custom provider
aiv config add-provider kimi --model moonshot-v1-32k --force  # update
```

---

### Per-agent provider assignment

Run each agent with a different provider or model:

```bash
aiv config set-agent-provider business    claude/claude-sonnet-4-6
aiv config set-agent-provider security    openai/gpt-4.1
aiv config set-agent-provider architecture gemini/gemini-2.0-flash
aiv config set-agent-provider context     kimi/moonshot-v1-8k

# View current assignments
aiv config show-agents

# Remove an override (reverts to default)
aiv config set-agent-provider business --clear
```

---

### Fallback chain

If a provider hits a rate limit or quota error, aiv automatically switches to the next in the chain:

```bash
# Try openai first, then gemini, then kimi
aiv config set-fallback openai gemini kimi

# Clear the chain
aiv config set-fallback
```

When a fallback fires, aiv prints:

```
  ⚡ "claude" quota/rate limit — switching to "openai"
```

---

### Mock (offline testing)

```bash
aiv config set-provider mock
```

Returns deterministic placeholder findings. Use this to test the CLI locally without consuming API credits.

---

## Review Output

A typical review looks like:

```
  aiv review — PR #42

  Account: personal (GITHUB_TOKEN)

✔ PR loaded: "Add payment retry logic" (8 files)
✔ Context loaded

  Running agents: business, architecture, security

  Review: PR #42 — Add payment retry logic
  Risk Score: 74/100  HIGH          Generated: 5/17/26

  Executive Summary
  ─────────────────
  High-risk changes to the payment processing pipeline. The retry
  loop lacks idempotency guards and could cause duplicate charges.
  No audit log entries were added for the new retry paths.

  Security Issues
  ───────────────
  [HIGH]  Missing idempotency key on retry
          File: src/payments/retry.ts
          Retry attempts do not include an idempotency key, allowing
          the payment provider to process the same charge multiple times.
          Suggestion: Pass a stable idempotency key derived from the
          original transaction ID.

  Business Risks
  ──────────────
  [CRITICAL]  auditLog() not called in retry path
              rules.yml requires auditLog for all payroll mutations.

  Architecture Issues
  ───────────────────
  [MEDIUM]  Direct database write outside billing module
            src/payments/retry.ts imports UserBalance from outside
            the billing boundary.

  Agent Summaries
  ───────────────
  business      — 2 finding(s)  [score: 88]
  architecture  — 1 finding(s)  [score: 55]
  security      — 1 finding(s)  [score: 74]
```

### Risk score

Computed as `max_score × 0.6 + average_score × 0.4` across all agents.

| Score  | Label    |
|--------|----------|
| 0–25   | LOW      |
| 26–50  | MEDIUM   |
| 51–75  | HIGH     |
| 76–100 | CRITICAL |

### JSON output

Use `--json` to get the full structured result for scripts or CI pipelines:

```bash
aiv review 42 --json | jq '.riskScore'
aiv review 42 --json > review-42.json
```

The JSON shape matches the `ReviewResult` type: `prNumber`, `prTitle`, `riskScore`, `riskLabel`, `executiveSummary`, `agents[]`, `securityIssues[]`, `businessRisks[]`, `architectureIssues[]`, `possibleRegressions[]`.

---

## Multi-language

aiv supports English and Spanish. All terminal output — errors, spinners, table headers, severity labels — follows the configured language.

### Switch language

```bash
# Permanently (saved to ~/.aiv/config.yml)
aiv config set-lang es
aiv config set-lang en

# Per-session via env var (overrides config)
AIV_LANG=es aiv prs
AIV_LANG=en aiv review 42
```

### Language detection order

1. `AIV_LANG` environment variable
2. `lang` in `~/.aiv/config.yml`
3. System `LANG` environment variable (auto-detected `es_*` locales use Spanish)
4. Default: `en`

---

## Environment Variables

| Variable              | Required | Description                                          |
|-----------------------|----------|------------------------------------------------------|
| `GITHUB_TOKEN`        | Yes      | GitHub personal access token (default account)       |
| `CLAUDE_API_KEY`      | Yes*     | Anthropic API key (*required when using Claude)      |
| `OPENAI_API_KEY`      | Yes*     | OpenAI API key (*required when using OpenAI)         |
| `AIV_LANG`            | No       | Override display language (`en` or `es`)             |
| `LANG`                | No       | System locale (auto-detected by aiv)                 |

For additional GitHub accounts, the env var name is whatever you passed to `--token-env`:

```bash
export GITHUB_TOKEN_WORK=ghp_...
aiv config add-account work --token-env GITHUB_TOKEN_WORK
```

GitHub tokens require `repo` scope to read pull requests and diffs.

---

## Error Reference

### `Not initialized. Run aiv init first.`

You ran a command that requires `.aiv/config.yml` but it doesn't exist in the current directory.

```bash
cd your-repo
aiv init
```

---

### `Missing env var: GITHUB_TOKEN (account: default)`

The token env var for the active account is not set in the environment.

```bash
export GITHUB_TOKEN=ghp_...
```

If you use a named account with a different env var, check which account is active and what it expects:

```bash
aiv config accounts
```

---

### `Missing env var: CLAUDE_API_KEY`

The AI provider API key is not set. Set the env var or switch providers:

```bash
export CLAUDE_API_KEY=sk-ant-...
# or switch to OpenAI
aiv config set-provider openai
export OPENAI_API_KEY=sk-...
```

---

### `Could not detect GitHub owner/repo.`

aiv could not parse the GitHub owner and repo from `git remote get-url origin`. This happens when the remote is not a GitHub URL, the repo has no remote, or the remote uses an unsupported format.

Fix — pass flags directly:
```bash
aiv prs --owner myorg --repo myrepo
aiv review 42 --owner myorg --repo myrepo
```

Fix — set permanently in repo config:
```bash
aiv config set-repo myorg myrepo
```

---

### `Account "xyz" not found.`

You referenced an account name that doesn't exist in `~/.aiv/config.yml`.

```bash
aiv config accounts                               # list what's available
aiv config add-account xyz --token-env MY_TOKEN  # add the missing account
```

---

### `Account "xyz" already exists. Use --force to overwrite.`

```bash
aiv config add-account xyz --token-env NEW_VAR --force
```

---

### `Failed to fetch PR: ...`

Network or GitHub API error. Common causes:

- Token lacks `repo` scope — regenerate with full repo permissions
- PR number does not exist in the target repository
- GitHub rate limit hit — wait or switch to a token with higher limits
- Wrong `owner`/`repo` — verify with `aiv config show`

---

### `Review failed: ...`

The AI provider returned an error. Common causes:

- API key is invalid or expired
- Model quota exceeded
- Network timeout on a very large diff — reduce `max_tokens` in config:

```yaml
# .aiv/config.yml
review:
  max_tokens: 10000
```

---

## Best Practices

### Fill in context before the first review

After `aiv init`, open `.aiv/context.md` and describe your project: what it does, which modules are critical, invariants that must never be violated. This is the single most impactful thing you can do to improve finding accuracy.

### Define rules for your domain

Add a rule every time your team agrees on a pattern that reviews should enforce. Rules are passed to every agent on every review — they act as a live checklist that doesn't drift.

```yaml
business_rules:
  orders:
    required_calls:
      - validateInventory
    forbidden_patterns:
      - skipFraudCheck
```

### Refresh context after major changes

```bash
aiv context refresh
```

Run this after merging a large refactor, adding a new module, or changing the project structure significantly. Stale context silently reduces finding quality.

### Use `--agent` to narrow the focus

Not every PR needs all three agents. If you're reviewing a dependency bump, only security matters. If it's a UI-only change, skip security and architecture:

```bash
aiv review 101 --agent security
aiv review 202 --agent business architecture
```

Fewer agents means faster results and lower API cost.

### Use named accounts from day one

Even with a single GitHub account, naming it makes configuration explicit and makes it trivial to add a second account later:

```bash
aiv config add-account personal \
  --token-env GITHUB_TOKEN \
  --username alice \
  --description "Personal GitHub"
```

### Commit `.aiv/` to the repository

Committing `config.yml`, `rules.yml`, and `context.md` means every team member gets identical review behavior without any manual setup. Add only `tree.json` to `.gitignore` since it's a generated snapshot:

```
# .gitignore
.aiv/tree.json
```

`aiv init` adds this entry automatically.

### Integrate into CI with `--json`

```bash
SCORE=$(aiv review $PR_NUMBER --json | jq '.riskScore')
if [ "$SCORE" -gt 75 ]; then
  echo "High-risk PR — human review required before merge"
  exit 1
fi
```

### What aiv is not

- Not a linter or formatter — it won't tell you about semicolons
- Not a replacement for static analysis tools (ESLint, SonarQube)
- Not checking code style

Its value is **semantic understanding**: catching what automated tools miss — business rule violations, architectural drift, and security risks that only make sense in context.

---

## Project Structure

```
src/
  agents/          — business, architecture, security (extend BaseAgent)
  cli/
    commands/      — one file per command (init, prs, review, config, context, agents)
    banner.ts      — ASCII welcome banner
    renderer.ts    — review result pretty-printer
    selector.ts    — interactive PR picker (inquirer)
  config/          — two-level config load/save/merge
  context/         — project tree scanner and context builder
  git/             — GitHub REST client and git remote detection
  i18n/            — EN/ES translations (all user-facing strings)
  orchestrator/    — runs agents in parallel, aggregates results
  providers/       — Claude, OpenAI, Mock AI client wrappers
  types.ts         — shared TypeScript interfaces
  index.ts         — CLI entry point (Commander root)
```

---

## License

MIT
