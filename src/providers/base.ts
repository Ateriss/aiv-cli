export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMProvider {
  complete(messages: LLMMessage[], systemPrompt?: string, maxTokens?: number): Promise<LLMResponse>;
  readonly name: string;
  readonly model: string;
}
