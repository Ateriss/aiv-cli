import { PRDiff } from '../types';
import { LLMProvider } from '../providers/base';

export type TriageResult = {
  agents: Array<'business' | 'architecture' | 'security'>;
  reasoning: string;
};

const ALL_AGENTS: TriageResult['agents'] = ['business', 'architecture', 'security'];

const SYSTEM_PROMPT = `You are a code review triage specialist.
Given a PR's metadata and changed file list, decide which review agents are needed.

Available agents:
- business: domain logic, business rules, calculations, state transitions, data integrity
- architecture: layer violations, module coupling, structural patterns, dependency direction
- security: auth, injection, data exposure, input validation, access control, secrets

Rules:
- Only include an agent if the changes are genuinely relevant to its domain
- Cosmetic changes (styles, colors, copy, console.log removal, comment edits) need NO agents — return []
- CSS/SCSS/style-only changes → skip all agents
- Purely adding tests with no production code change → business only (regression check), skip security and architecture
- Config-only changes (env vars, CI files) → security only if secrets/permissions involved, otherwise skip
- When in doubt about an agent, skip it — it's better to miss a low-risk finding than waste tokens

Return ONLY valid JSON: { "agents": ["security", "business"], "reasoning": "one sentence" }
No markdown fences. No explanation outside the JSON.`;

export async function triageAgents(diff: PRDiff, provider: LLMProvider): Promise<TriageResult> {
  const fileList = diff.files
    .map(f => `${f.status.toUpperCase()} ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join('\n');

  const message = `PR #${diff.pr.number}: ${diff.pr.title}
Branch: ${diff.pr.branch} → ${diff.pr.base}
Description: ${diff.pr.description ?? 'none'}

Changed files (${diff.files.length}):
${fileList}`;

  try {
    const response = await provider.complete(
      [{ role: 'user', content: message }],
      SYSTEM_PROMPT,
      256,
    );

    const match = /\{[\s\S]*\}/.exec(response.content.trim());
    if (!match) return fallback();

    const parsed = JSON.parse(match[0]) as { agents?: unknown; reasoning?: string };
    const agents = (Array.isArray(parsed.agents) ? parsed.agents : [])
      .filter((a): a is TriageResult['agents'][number] =>
        a === 'business' || a === 'architecture' || a === 'security'
      );

    return { agents, reasoning: parsed.reasoning ?? '' };
  } catch {
    return fallback();
  }
}

function fallback(): TriageResult {
  return { agents: ALL_AGENTS, reasoning: 'triage failed — running all agents' };
}
