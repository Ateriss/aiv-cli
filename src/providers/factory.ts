import chalk from 'chalk';
import { ResolvedConfig } from '../types';
import { LLMProvider } from './base';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { MockProvider } from './mock';
import { FallbackProvider } from './fallback';

export function createProvider(config: ResolvedConfig): LLMProvider {
  return createProviderFor(config, '__default__');
}

export function createProviderFor(config: ResolvedConfig, role: string): LLMProvider {
  const spec = config.providers.agents[role];
  const primary = spec
    ? resolveSpec(config, spec)
    : resolveNamed(config, config.providers.default);

  const fallbackNames = config.providers.fallback;
  if (fallbackNames.length === 0) return primary;

  const chain: LLMProvider[] = [primary];
  for (const name of fallbackNames) {
    const candidate = tryResolveNamed(config, name);
    if (candidate && !isSameProvider(candidate, primary)) {
      chain.push(candidate);
    }
  }

  if (chain.length === 1) return primary;

  return new FallbackProvider(chain, (from, to) => {
    console.log(chalk.yellow(`\n  ⚡ ${from} quota/rate limit — switching to ${to}`));
  });
}

// Resolves "provider" or "provider/model" spec string
function resolveSpec(config: ResolvedConfig, spec: string): LLMProvider {
  const slash = spec.indexOf('/');
  const providerName = slash === -1 ? spec : spec.slice(0, slash);
  const model        = slash === -1 ? undefined : spec.slice(slash + 1);
  return resolveNamed(config, providerName, model);
}

// Resolves a provider by name, with an optional model override
function resolveNamed(config: ResolvedConfig, name: string, modelOverride?: string): LLMProvider {
  if (name === 'claude') {
    const apiKey = process.env[config.claude.api_key_env];
    if (!apiKey) throw new Error(`Missing env var: ${config.claude.api_key_env}`);
    return new ClaudeProvider(apiKey, modelOverride ?? config.claude.model);
  }

  if (name === 'openai') {
    const apiKey = process.env[config.openai.api_key_env];
    if (!apiKey) throw new Error(`Missing env var: ${config.openai.api_key_env}`);
    return new OpenAIProvider(apiKey, modelOverride ?? config.openai.model);
  }

  if (name === 'gemini') {
    const apiKey = process.env[config.gemini.api_key_env];
    if (!apiKey) throw new Error(`Missing env var: ${config.gemini.api_key_env}`);
    return new GeminiProvider(apiKey, modelOverride ?? config.gemini.model);
  }

  if (name === 'mock') return new MockProvider();

  // Custom OpenAI-compatible provider
  const custom = config.custom_providers[name];
  if (custom) {
    const apiKey = custom.api_key_env ? (process.env[custom.api_key_env] ?? '') : '';
    return new OpenAIProvider(apiKey, modelOverride ?? custom.model, custom.base_url, name);
  }

  throw new Error(`Unknown provider: "${name}". Add it with: aiv config add-provider ${name} --base-url <url> --api-key-env <VAR> --model <model>`);
}

function tryResolveNamed(config: ResolvedConfig, name: string): LLMProvider | null {
  try { return resolveNamed(config, name); } catch { return null; }
}

function isSameProvider(a: LLMProvider, b: LLMProvider): boolean {
  return a.name === b.name && a.model === b.model;
}
