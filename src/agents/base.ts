import { AgentResult, AgentFinding, PRDiff, AivRules } from '../types';
import { LLMProvider } from '../providers/base';

export interface AgentContext {
  projectContext: string;
  rules: AivRules;
  diff: PRDiff;
}

export abstract class BaseAgent {
  abstract readonly agentName: string;
  abstract readonly systemPrompt: string;

  constructor(protected provider: LLMProvider) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const userMessage = this.buildUserMessage(ctx);

    const response = await this.provider.complete(
      [{ role: 'user', content: userMessage }],
      this.systemPrompt,
      4096,
    );

    return this.parseResponse(response.content);
  }

  protected buildUserMessage(ctx: AgentContext): string {
    const rulesSection = JSON.stringify(ctx.rules, null, 2);
    const filesSummary = ctx.diff.files
      .map(f => `${f.status.toUpperCase()} ${f.filename} (+${f.additions}/-${f.deletions})`)
      .join('\n');

    const patches = ctx.diff.files
      .filter(f => f.patch)
      .map(f => `### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``)
      .join('\n\n');

    return `## PR: #${ctx.diff.pr.number} — ${ctx.diff.pr.title}

**Author:** ${ctx.diff.pr.author}
**Branch:** ${ctx.diff.pr.branch} → ${ctx.diff.pr.base}
**Description:** ${ctx.diff.pr.description ?? 'No description provided.'}

---

## Project Context
${ctx.projectContext}

---

## Business Rules (from .aiv/rules.yml)
\`\`\`json
${rulesSection}
\`\`\`

---

## Files Changed (${ctx.diff.files.length} files)
${filesSummary}

---

## Diff
${patches}

---

Analyze the above and return a JSON response matching this schema:
{
  "summary": "string — concise summary of your findings",
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "string",
      "title": "string",
      "description": "string",
      "file": "string (optional)",
      "suggestion": "string (optional)"
    }
  ],
  "riskScore": 0-100,
  "possibleRegressions": ["string"]
}

Return ONLY valid JSON. No markdown fences, no explanation outside the JSON.`;
  }

  protected parseResponse(raw: string): AgentResult {
    let parsed: any;

    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        agentName: this.agentName,
        findings: [{
          severity: 'info',
          category: 'parse-error',
          title: 'Could not parse agent response',
          description: raw.slice(0, 500),
        }],
        summary: 'Agent returned unparseable response.',
        riskScore: 0,
      };
    }

    const findings: AgentFinding[] = (parsed.findings ?? []).map((f: any) => ({
      severity: f.severity ?? 'info',
      category: f.category ?? 'general',
      title: f.title ?? 'Untitled',
      description: f.description ?? '',
      file: f.file,
      suggestion: f.suggestion,
    }));

    return {
      agentName: this.agentName,
      findings,
      summary: parsed.summary ?? '',
      riskScore: Math.max(0, Math.min(100, parseInt(parsed.riskScore ?? '0'))),
    };
  }
}
