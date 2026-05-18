import { AgentResult, AgentFinding, PRDiff, AivRules } from '../types';
import { LLMProvider } from '../providers/base';
import { getLang } from '../i18n';

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

    const langInstruction = getLang() === 'es'
      ? '\n\nIMPORTANT: Respond in Spanish. All string values in the JSON (summary, title, description, suggestion, possibleRegressions) must be written in Spanish.'
      : '';

    const baseBranch = ctx.diff.pr.base;
    const headBranch = ctx.diff.pr.branch;
    const isProductionMerge = /^(main|master|production|prod|release)$/i.test(baseBranch);
    const branchRisk = isProductionMerge
      ? `⚠️ DIRECT MERGE TO ${baseBranch.toUpperCase()} — apply stricter scrutiny. Findings here affect production.`
      : `Target: ${baseBranch} (non-production). Calibrate severity accordingly.`;

    return `## PR: #${ctx.diff.pr.number} — ${ctx.diff.pr.title}

**Author:** ${ctx.diff.pr.author}
**Merge:** \`${headBranch}\` → \`${baseBranch}\`
**${branchRisk}**
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
  "summary": "2-3 sentences max",
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "string",
      "title": "string — 8 words max",
      "description": "1-2 sentences max",
      "file": "string (optional)",
      "suggestion": "1 sentence max (optional)"
    }
  ],
  "riskScore": 0-100,
  "possibleRegressions": ["one short phrase each"]
}

Return ONLY valid JSON. No markdown fences, no explanation outside the JSON.${langInstruction}`;
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
      riskScore: Math.max(0, Math.min(100, Number.parseInt(parsed.riskScore ?? '0'))),
    };
  }
}
