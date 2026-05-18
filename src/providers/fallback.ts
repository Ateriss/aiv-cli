import { LLMProvider, LLMMessage, LLMResponse } from './base';

type FallbackCallback = (from: string, to: string) => void;

export class FallbackProvider implements LLMProvider {
  private index = 0;

  constructor(
    private readonly chain: LLMProvider[],
    private readonly onFallback?: FallbackCallback,
  ) {
    if (chain.length === 0) throw new Error('FallbackProvider requires at least one provider');
  }

  get name(): string  { return this.chain[this.index].name; }
  get model(): string { return this.chain[this.index].model; }

  async complete(messages: LLMMessage[], systemPrompt?: string, maxTokens?: number): Promise<LLMResponse> {
    for (let i = this.index; i < this.chain.length; i++) {
      try {
        const result = await this.chain[i].complete(messages, systemPrompt, maxTokens);
        this.index = i;
        return result;
      } catch (e: unknown) {
        if (!isRetriableError(e) || i + 1 >= this.chain.length) throw e;
        this.onFallback?.(this.chain[i].name, this.chain[i + 1].name);
        this.index = i + 1;
      }
    }
    throw new Error('All providers in fallback chain exhausted');
  }
}

function isRetriableError(e: unknown): boolean {
  const status = (e as any)?.status ?? (e as any)?.statusCode ?? (e as any)?.httpStatus;
  if (status === 429 || status === 529) return true;

  const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
  return (
    msg.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('overloaded') ||
    msg.includes('too many requests') ||
    msg.includes('insufficient_quota')
  );
}
