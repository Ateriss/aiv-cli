import { LLMProvider, LLMMessage, LLMResponse } from './base';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string = 'gemini-2.0-flash') {
    this.apiKey  = apiKey;
    this.model   = model;
  }

  async complete(messages: LLMMessage[], systemPrompt?: string, maxTokens: number = 4096): Promise<LLMResponse> {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    };

    if (systemPrompt) {
      body['systemInstruction'] = { parts: [{ text: systemPrompt }] };
    }

    const url = `${GEMINI_BASE}/${this.model}:generateContent?key=${this.apiKey}`;
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json() as any;
      const status = res.status;
      const msg = err?.error?.message ?? 'unknown error';
      throw Object.assign(new Error(`Gemini API error (${status}): ${msg}`), { status });
    }

    const data = await res.json() as any;
    const content = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p.text ?? '')
      .join('');

    return {
      content,
      inputTokens:  data?.usageMetadata?.promptTokenCount,
      outputTokens: data?.usageMetadata?.candidatesTokenCount,
    };
  }
}
