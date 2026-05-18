import { LLMProvider, LLMMessage, LLMResponse } from './base';

export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  readonly model = 'mock-model';

  async complete(_messages: LLMMessage[], _systemPrompt?: string): Promise<LLMResponse> {
    return {
      content: JSON.stringify({
        summary: 'Mock review: This is a test response from the mock provider.',
        findings: [
          {
            severity: 'low',
            category: 'test',
            title: 'Mock Finding',
            description: 'This is a placeholder finding from the mock provider.',
            suggestion: 'Replace mock provider with a real one.',
          },
        ],
        riskScore: 10,
        possibleRegressions: ['Mock regression note'],
      }),
      inputTokens: 100,
      outputTokens: 100,
    };
  }
}
