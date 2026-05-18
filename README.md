# aiv — AI PR Reviewer

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

## What is aiv?

Code review is one of the most important quality gates in a software team — and also one of the most time-consuming. Reviewers need to understand the business context, track architectural decisions, spot security risks, and catch regressions, all while reading through a diff that may span dozens of files.

**aiv** is a local-first CLI that runs that analysis for you, before a human ever opens the PR.

It sends the diff to three specialized AI agents in parallel — one focused on **business logic and domain rules**, one on **architecture and structural patterns**, and one on **security vulnerabilities** — and returns a structured risk report with severity-rated findings, specific suggestions per file, and an executive summary. The report is anchored to your project: aiv reads your `context.md` (project background, architecture decisions, sensitive zones) and `rules.yml` (custom business rules, required calls, forbidden patterns) so findings are relevant to your codebase, not just generic linting advice.

**What aiv catches that linters miss:**

- A retry loop that could cause duplicate charges because it skips the idempotency check your team agreed on
- A service that imports directly from a handler, breaking the layer contract
- A new endpoint that reads user data without going through the authorization middleware
- A payroll mutation that doesn't call `auditLog()` as required by your rules
- A function moved to a shared module that now exposes internal state to layers that shouldn't see it

**What happens after the review:**

Once the report is in, aiv lets you act on it directly from the terminal — approve the PR, request changes, post the full report as a formatted GitHub comment, or merge with your preferred strategy (squash, merge, rebase). If you've already reviewed the PR in a previous session, aiv detects the cached analysis in the PR comments and asks if you want to reuse it instead of re-running the agents.

**Works with any AI provider.** Claude, OpenAI, Gemini, Groq, Mistral, DeepSeek, Kimi, Ollama, or any OpenAI-compatible endpoint. Mix providers per agent — use a fast model for routine checks and a powerful one for security. Configure a fallback chain so a quota error on one provider silently switches to the next without losing the run.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [Configuration](#configuration)
  - [Global Config](#global-config)
  - [Repo Config](#repo-config)
  - [Rules](#rules)
  - [Context](#context)
- [GitHub Account Management](#github-account-management)
- [AI Providers](#ai-providers)
  - [Built-in: Claude](#claude-default)
  - [Built-in: OpenAI](#openai)
  - [Built-in: Gemini](#google-gemini)
  - [OpenAI-compatible (custom)](#openai-compatible-providers)
  - [Per-agent assignment](#per-agent-provider-assignment)
  - [Fallback chain](#fallback-chain)
  - [Mock](#mock-offline-testing)
- [Review Output](#review-output)
- [Post-review Actions](#post-review-actions)
- [Multi-language](#multi-language)
- [Environment Variables](#environment-variables)
- [Error Reference](#error-reference)
- [Best Practices](#best-practices)

---

## Requirements

- Node.js 18 or higher
- A GitHub personal access token with `repo` scope (or `public_repo` for public repos)
- An API key for at least one supported AI provider (see [AI Providers](#ai-providers))

---

## Installation

```bash
npm install -g @ateriss_/aiv-cli
```

---

## Quick Start

**1. Initialize aiv in your project repository:**

```bash
cd your-repo
aiv init
```

This creates:
- `~/.aiv/config.yml` — global config (AI providers, GitHub accounts)
- `.aiv/config.yml` — repo config (owner, repo, account override)
- `.aiv/rules.yml` — custom review rules for agents
- `.aiv/context.md` — auto-generated project context
- `.aiv/tree.json` — project file structure snapshot

**2. Set your API key and GitHub token as persistent environment variables:**

```bash
# macOS / Linux (add to ~/.bashrc or ~/.zshrc)
export CLAUDE_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...

# Windows (PowerShell — persists across sessions)
[System.Environment]::SetEnvironmentVariable("CLAUDE_API_KEY", "sk-ant-...", "User")
[System.Environment]::SetEnvironmentVariable("GITHUB_TOKEN", "ghp_...", "User")
```

**3. (Optional) Let AI generate your context and rules:**

```bash
aiv context generate
```

**4. List open pull requests:**

```bash
aiv prs
```

**5. Review a PR:**

```bash
aiv review 42
```

After the report, aiv asks if you want to approve, request changes, post the report as a PR comment, or merge directly from the terminal.

---

## Commands Reference

Every command has a short alias. Long and short forms are identical.

### Core

| Long form | Short | Description |
|-----------|-------|-------------|
| `aiv init` | `aiv i` | Initialize aiv globally and in the current repo |
| `aiv prs` | `aiv p` | List open PRs, then optionally review one |
| `aiv review [pr-number]` | `aiv r` | Review a PR or pick interactively |
| `aiv agents` | `aiv a` | List available agents and their focus areas |

### Context

| Long form | Short | Description |
|-----------|-------|-------------|
| `aiv context refresh` | `aiv ctx refresh` | Rebuild `context.md` and `tree.json` from the codebase |
| `aiv context show` | `aiv ctx show` | Print current `context.md` |
| `aiv context generate` | `aiv ctx generate` | Use AI to generate `context.md` and `rules.yml` |

### Config — general

| Long form | Short | Description |
|-----------|-------|-------------|
| `aiv config show` | `aiv cf show` | Show global and repo config files |
| `aiv config set-provider <name>` | `aiv cf set-provider` | Set default AI provider |
| `aiv config set-repo <owner> <repo>` | `aiv cf set-repo` | Set GitHub owner/repo in repo config |
| `aiv config set-lang <lang>` | `aiv cf set-lang` | Change display language (`en` / `es`) |
| `aiv config rules` | `aiv cf rules` | Print `rules.yml` |

### Config — providers

| Long form | Description |
|-----------|-------------|
| `aiv config add-provider <name>` | Add or update a provider (built-in or custom OpenAI-compatible) |
| `aiv config remove-provider <name>` | Remove a custom provider |
| `aiv config list-providers` | List all configured providers and their status |
| `aiv config set-agent-provider <agent> [spec]` | Assign a specific provider/model to one agent |
| `aiv config set-fallback [providers...]` | Set ordered fallback chain for quota/rate errors |
| `aiv config show-agents` | Show per-agent provider assignments and fallback chain |

### Config — GitHub accounts

| Long form | Description |
|-----------|-------------|
| `aiv config accounts` | List GitHub accounts |
| `aiv config add-account <name>` | Add a GitHub account |
| `aiv config remove-account <name>` | Remove a GitHub account |
| `aiv config default-account <name>` | Set global default account |
| `aiv config use-account <name>` | Use a specific account for this repo |

---

### `aiv init`

```bash
aiv init
aiv i
```

Safe to re-run — if `~/.aiv/config.yml` already exists it is preserved. Re-running inside a repo always rebuilds `context.md` and `tree.json`.

---

### `aiv prs`

Fetches open PRs in a table, then launches an interactive selector.

```bash
aiv prs
aiv p

aiv prs --limit 10
aiv prs --owner myorg --repo myrepo
aiv prs --no-select           # list only, skip selector
```

**Repo auto-detection:** reads `git remote get-url origin`. If it fails, pass `--owner`/`--repo` or set them with `aiv config set-repo`.

---

### `aiv review`

Reviews a pull request. Omit the number to pick interactively.

```bash
aiv review 42
aiv r 42

aiv review                    # interactive selector
aiv review 42 --owner myorg --repo myrepo
aiv review 42 --agent security
aiv review 42 --agent business architecture
aiv review 42 --json          # raw JSON, no interactive prompt
```

If a previous aiv analysis exists as a comment on the PR, aiv asks whether to reuse it or run a fresh analysis. After the report, the post-review action menu lets you approve, request changes, post the report as a comment, or skip.

---

### `aiv context`

```bash
aiv context refresh            # rebuild from codebase (static analysis)
aiv ctx refresh

aiv context show               # print context.md
aiv ctx show

aiv context generate           # AI-powered generation
aiv ctx generate
aiv ctx generate --context-only
aiv ctx generate --rules-only
aiv ctx generate --force       # overwrite without asking
```

`generate` uses the configured AI provider (or `providers.agents.context` if set) to analyze the project structure and produce a `context.md` and `rules.yml` tailored to your stack. Run it after `init` or whenever the project changes significantly — edit the output only where needed.

---

### `aiv agents`

```bash
aiv agents
aiv a
```

| Agent | Focus areas |
|-------|-------------|
| business | Business logic, domain invariants, rule violations, functional regressions |
| architecture | Layer violations, coupling, SRP, dependency direction, abstraction quality |
| security | Auth bypass, injection, data leakage, OWASP Top 10, sensitive data handling |

---

## Configuration

aiv uses a two-level configuration system:

| File | Scope | Purpose |
|------|-------|---------|
| `~/.aiv/config.yml` | Global | AI providers, GitHub accounts, defaults |
| `.aiv/config.yml` | Repo | Owner/repo override, account override, token limits |

Repo settings always override global defaults.

---

### Global Config

`~/.aiv/config.yml` — created by `aiv init`, shared across all repos.

```yaml
lang: en                        # 'en' or 'es'

providers:
  default: claude               # active provider
  fallback: [openai, gemini]    # tried in order on quota/rate errors
  agents:                       # per-agent overrides (provider or provider/model)
    business:     claude/claude-sonnet-4-6
    architecture: gemini/gemini-2.0-flash
    security:     openai/gpt-4.1
    context:      claude/claude-sonnet-4-6

# Built-in providers
claude:
  model: claude-sonnet-4-6
  api_key_env: CLAUDE_API_KEY

openai:
  model: gpt-4.1
  api_key_env: OPENAI_API_KEY

gemini:
  model: gemini-2.0-flash
  api_key_env: GEMINI_API_KEY

# Custom OpenAI-compatible providers
custom_providers:
  kimi:
    base_url: https://api.moonshot.cn/v1
    api_key_env: KIMI_API_KEY
    model: moonshot-v1-8k
  groq:
    base_url: https://api.groq.com/openai/v1
    api_key_env: GROQ_API_KEY
    model: llama-3.3-70b-versatile

review:
  max_tokens: 20000
  max_findings: 20

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

### Repo Config

`.aiv/config.yml` — created per repository by `aiv init`.

```yaml
github:
  account: work                 # use the 'work' account from global config
  owner: myorg                  # override auto-detected GitHub owner
  repo: backend-api             # override auto-detected GitHub repo

review:
  max_tokens: 30000             # allow larger diffs for this repo
  max_findings: 30
```

---

### Rules

`.aiv/rules.yml` — custom review rules passed to every agent on every review.

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

The more specific your rules, the fewer false positives and the more actionable the findings.

---

### Context

`.aiv/context.md` — project background that agents read before analyzing the diff.

Auto-generated by `aiv init`, `aiv context refresh`, and `aiv context generate`. You can edit it freely — the richer this file, the more accurate the findings.

```markdown
## Business Context

E-commerce platform handling real-money transactions.
All changes in `src/payments/` must include an audit log entry.
`UserBalance` must never be modified outside the `billing` module.

## Architecture

Three-layer: HTTP handlers → service layer → repositories.
Services must not import from handlers.

## Sensitive Zones

- src/auth/ — JWT issuance and validation
- src/payments/ — Stripe integration, never bypass PaymentGateway
```

---

## GitHub Account Management

### Add accounts

```bash
aiv config add-account personal --token-env GITHUB_TOKEN
aiv config add-account work \
  --token-env GITHUB_TOKEN_WORK \
  --username alice-corp \
  --description "Work GitHub"
aiv config add-account work --token-env NEW_VAR --force   # overwrite
```

### Manage accounts

```bash
aiv config accounts                     # list all accounts + token status
aiv config default-account work         # set global default
aiv config use-account work             # use this account for current repo
aiv config remove-account old-account
```

### Account resolution order

1. `github.account` in `.aiv/config.yml`
2. `github.default_account` in `~/.aiv/config.yml`
3. First account in `~/.aiv/config.yml`
4. `GITHUB_TOKEN` env var directly

---

## AI Providers

aiv supports three kinds of providers:

| Type | Examples | Notes |
|------|----------|-------|
| **Built-in** | Claude, OpenAI, Gemini | Native adapters, no extra setup |
| **OpenAI-compatible** | Kimi, Groq, Mistral, DeepSeek, Ollama, … | Any provider with a compatible endpoint |
| **Mock** | — | Deterministic offline responses |

---

### Claude (default)

```bash
export CLAUDE_API_KEY=sk-ant-...
aiv config set-provider claude
```

Update model or key env:

```bash
aiv config add-provider claude --model claude-opus-4-7
aiv config add-provider claude --api-key-env MY_CLAUDE_KEY
```

```yaml
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

Gemini uses a dedicated REST adapter — no extra SDK or dependency required.

```bash
export GEMINI_API_KEY=AIza...
aiv config set-provider gemini
aiv config add-provider gemini --model gemini-2.0-flash-exp   # change model
```

```yaml
gemini:
  model: gemini-2.0-flash
  api_key_env: GEMINI_API_KEY
```

---

### OpenAI-compatible providers

Any provider that exposes an OpenAI-compatible API can be registered with one command — no code changes needed when new providers launch.

```bash
# Kimi (Moonshot AI)
aiv config add-provider kimi \
  --base-url https://api.moonshot.cn/v1 \
  --api-key-env KIMI_API_KEY \
  --model moonshot-v1-8k

# Groq
aiv config add-provider groq \
  --base-url https://api.groq.com/openai/v1 \
  --api-key-env GROQ_API_KEY \
  --model llama-3.3-70b-versatile

# Mistral
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

# Ollama (local, no key required)
aiv config add-provider ollama \
  --base-url http://localhost:11434/v1 \
  --api-key-env OLLAMA_API_KEY \
  --model llama3.2
```

Once registered, custom providers work exactly like built-ins:

```bash
aiv config set-provider kimi
aiv config list-providers                    # built-ins + custom
aiv config remove-provider kimi
aiv config add-provider kimi --model moonshot-v1-32k --force  # update
```

---

### Per-agent provider assignment

Each agent (and the context generator) can use a different provider or model:

```bash
aiv config set-agent-provider business    claude/claude-sonnet-4-6
aiv config set-agent-provider security    openai/gpt-4.1
aiv config set-agent-provider architecture gemini/gemini-2.0-flash
aiv config set-agent-provider context     kimi/moonshot-v1-8k

# Use just a provider name (uses that provider's default model)
aiv config set-agent-provider business groq

# View current assignments
aiv config show-agents

# Remove override (reverts to default provider)
aiv config set-agent-provider business --clear
```

Valid agent roles: `business`, `architecture`, `security`, `context`.

---

### Fallback chain

If any provider hits a rate limit or quota error (HTTP 429, overloaded, insufficient quota), aiv automatically switches to the next provider in the chain — for the rest of that run.

```bash
aiv config set-fallback openai gemini groq   # try in this order
aiv config set-fallback                       # clear the chain
```

When a fallback fires:

```
  ⚡ "claude" quota/rate limit — switching to "openai"
```

---

### Mock (offline testing)

```bash
aiv config set-provider mock
```

Returns deterministic placeholder findings. Use this to test the CLI without consuming API credits.

---

## Review Output

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
          Suggestion: Pass a stable idempotency key derived from
          the original transaction ID.

  Business Risks
  ──────────────
  [CRITICAL]  auditLog() not called in retry path
              rules.yml requires auditLog for all payroll mutations.

  Architecture Issues
  ───────────────────
  [MEDIUM]  Direct database write outside billing module

  Agent Summaries
  ───────────────
  business      — 2 finding(s)  [score: 88]
  architecture  — 1 finding(s)  [score: 55]
  security      — 1 finding(s)  [score: 74]
```

### Risk score

| Score  | Label    |
|--------|----------|
| 0–25   | LOW      |
| 26–50  | MEDIUM   |
| 51–75  | HIGH     |
| 76–100 | CRITICAL |

Computed as `max_score × 0.6 + average_score × 0.4` across all agents.

### JSON output

```bash
aiv review 42 --json | jq '.riskScore'
aiv review 42 --json > review-42.json
```

Shape: `prNumber`, `prTitle`, `riskScore`, `riskLabel`, `executiveSummary`, `agents[]`, `securityIssues[]`, `businessRisks[]`, `architectureIssues[]`, `possibleRegressions[]`.

`--json` skips the post-review action prompt.

---

## Post-review Actions

After every review in an interactive terminal, aiv asks:

```
? What would you like to do with this PR?
❯ ✔  Approve PR
  ⚑  Request Changes
  💬  Post as PR comment
  ────────────────────────────────────────
  ↩  Skip
```

- **Approve** — submits an `APPROVE` review to GitHub, then asks if you want to merge:

  ```
  ? Merge this PR now? (y/N)

  ? Select merge strategy:
  ❯ Squash and merge
    Merge commit
    Rebase and merge
  ```

  After approving (with or without merge), `context.md` and `tree.json` are refreshed automatically.

- **Request Changes** — submits a `REQUEST_CHANGES` review to GitHub.
- **Post as PR comment** — publishes the full report as a formatted GitHub comment. The comment includes severity-rated findings, suggestions, and agent summaries. It also embeds the analysis data so aiv can detect it on future runs.
- **Skip** — does nothing, exits cleanly.

### Analysis cache

When you run `aiv review` on a PR that already has an aiv comment, aiv detects the previous analysis and asks:

```
  Found a previous aiv analysis on this PR.
? Use cached analysis? (Y/n)
```

Choosing yes skips the AI agents entirely and uses the stored result — no API calls, instant output. Choose no to run a fresh analysis (useful after new commits are pushed).

---

## Multi-language

aiv supports English and Spanish. All output — errors, spinners, table headers, severity labels, and AI agent responses — follows the configured language.

```bash
aiv config set-lang es
aiv config set-lang en

AIV_LANG=es aiv prs      # per-session override
```

### Detection order

1. `AIV_LANG` environment variable
2. `lang` in `~/.aiv/config.yml`
3. System `LANG` variable (`es_*` locales → Spanish)
4. Default: `en`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub personal access token (default account) |
| `CLAUDE_API_KEY` | Yes* | Anthropic API key (*when using Claude) |
| `OPENAI_API_KEY` | Yes* | OpenAI API key (*when using OpenAI) |
| `GEMINI_API_KEY` | Yes* | Google AI API key (*when using Gemini) |
| `AIV_LANG` | No | Override display language (`en` or `es`) |
| `LANG` | No | System locale (auto-detected by aiv) |

For custom providers, the env var name is whatever you passed to `--api-key-env`.

### GitHub token permissions

| Scope | Required for |
|-------|-------------|
| `repo` (private repos) or `public_repo` | Reading PRs and diffs |
| `pull_requests: write` (fine-grained PAT) | Submitting reviews, posting comments, merging |

---

## Error Reference

### `Not initialized. Run aiv init first.`

`.aiv/config.yml` does not exist in the current directory.

```bash
cd your-repo && aiv init
```

---

### `Missing env var: GITHUB_TOKEN (account: default)`

The token env var for the active account is not set. Check which variable name the account expects:

```bash
aiv config accounts
```

Then set it (once, permanently on Windows):

```powershell
[System.Environment]::SetEnvironmentVariable("GITHUB_TOKEN", "ghp_...", "User")
```

---

### `Missing env var: CLAUDE_API_KEY`

```bash
export CLAUDE_API_KEY=sk-ant-...
# or switch providers:
aiv config set-provider openai
```

---

### `Unknown provider: "xyz".`

```bash
aiv config list-providers
aiv config add-provider xyz --base-url <url> --api-key-env XYZ_API_KEY --model <model>
```

---

### `Could not detect GitHub owner/repo.`

```bash
aiv prs --owner myorg --repo myrepo
# or set permanently:
aiv config set-repo myorg myrepo
```

---

### `Failed to fetch PR: ...`

- Token lacks `repo` scope — regenerate with the correct scopes
- PR number doesn't exist in this repo
- GitHub rate limit — wait or switch to a different account
- Wrong owner/repo — verify with `aiv config show`

---

### `Review failed: ...`

- API key invalid or expired
- Model quota exceeded — configure a [fallback chain](#fallback-chain)
- Diff too large — reduce `max_tokens` in `.aiv/config.yml`:

```yaml
review:
  max_tokens: 10000
```

---

## Best Practices

### Let AI bootstrap your context and rules

Right after `aiv init`, run:

```bash
aiv context generate
```

This produces a `context.md` and `rules.yml` based on what the AI infers from your project structure. Tune what it gets wrong rather than writing from scratch.

### Write specific rules

Generic rules produce generic findings. The more specific `rules.yml` is, the more precise the business agent becomes:

```yaml
business_rules:
  orders:
    required_calls: [validateInventory, reserveStock]
    forbidden_patterns: [skipFraudCheck, directInventoryWrite]
```

### Post the report as a PR comment

After reviewing, choose **Post as PR comment** to make the findings visible to the whole team directly in GitHub. The comment is also used as a cache — the next time anyone runs `aiv review` on the same PR, aiv detects it and offers to skip the AI calls.

### Refresh context after structural changes

```bash
aiv context refresh
```

Run after merging large refactors, adding new modules, or reorganizing the project layout.

### Use a fallback chain for reliability

```bash
aiv config set-fallback openai gemini
```

If your primary provider is rate-limited mid-review, aiv switches automatically without losing the run.

### Match model to task

Use a fast/cheap model for straightforward agents and a stronger one for the most critical:

```bash
aiv config set-agent-provider business    claude/claude-haiku-4-5
aiv config set-agent-provider architecture claude/claude-haiku-4-5
aiv config set-agent-provider security    claude/claude-sonnet-4-6
```

### Use `--agent` to narrow focus

```bash
aiv review 101 --agent security           # dependency bump — only security matters
aiv review 202 --agent business architecture  # domain change
```

Fewer agents = faster, cheaper, more focused output.

### Commit `.aiv/` to the repository

Committing `config.yml`, `rules.yml`, and `context.md` means every team member gets identical review behavior with no local setup. Only exclude `tree.json`:

```
# .gitignore
.aiv/tree.json
```

`aiv init` adds this entry automatically.

### CI integration with `--json`

```bash
SCORE=$(aiv review $PR_NUMBER --json | jq '.riskScore')
if [ "$SCORE" -gt 75 ]; then
  echo "High-risk PR — human review required"
  exit 1
fi
```

### What aiv is not

- Not a linter — it won't flag semicolons or indentation
- Not a replacement for static analysis (ESLint, SonarQube)
- Not a style checker

Its value is **semantic understanding**: catching business rule violations, architectural drift, and security risks that automated tools miss because they don't know your project's context, rules, or intent.

---

## Project Structure

```
src/
  agents/          — business, architecture, security reviewers
  cli/
    commands/      — init, prs, review, config, context, agents
    banner.ts      — ASCII welcome banner
    renderer.ts    — terminal renderer + GitHub comment builder
    selector.ts    — interactive PR/action picker (inquirer)
  config/          — two-level config load/save/merge
  context/
    builder.ts     — static project analysis
    generator.ts   — AI-powered context + rules generation
    manager.ts     — context reader + refreshContextFiles helper
    tree.ts        — file tree scanner
  git/             — GitHub REST client + remote detection
  i18n/            — EN/ES translations (all user-facing strings)
  orchestrator/    — runs agents in parallel, aggregates results
  providers/
    claude.ts      — Anthropic adapter
    openai.ts      — OpenAI adapter (supports custom baseURL)
    gemini.ts      — Google Gemini REST adapter
    fallback.ts    — FallbackProvider (quota/rate pivot)
    factory.ts     — resolves provider by name or agent role
    mock.ts        — offline test provider
  types.ts         — shared TypeScript interfaces
  index.ts         — CLI entry point
```

---

## License

MIT
