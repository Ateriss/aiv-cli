import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMMessage, LLMResponse } from './base';

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-6') {
    this.model = model;
    this.client = new Anthropic({ apiKey });
  }

  async complete(messages: LLMMessage[], systemPrompt?: string, maxTokens: number = 4096): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
    });

    const content = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
