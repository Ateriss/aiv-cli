import OpenAI from 'openai';
import { LLMProvider, LLMMessage, LLMResponse } from './base';

export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string = 'gpt-4.1', baseURL?: string, name: string = 'openai') {
    this.name   = name;
    this.model  = model;
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async complete(messages: LLMMessage[], systemPrompt?: string, maxTokens: number = 4096): Promise<LLMResponse> {
    const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }

    allMessages.push(
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    );

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: allMessages,
    });

    return {
      content: response.choices[0]?.message?.content ?? '',
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    };
  }
}
