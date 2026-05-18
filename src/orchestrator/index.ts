import chalk from 'chalk';
import ora from 'ora';
import { ResolvedConfig, AivRules, PRDiff, ReviewResult, AgentFinding } from '../types';
import { createProviderFor } from '../providers/factory';
import { BusinessReviewer } from '../agents/business';
import { ArchitectureReviewer } from '../agents/architecture';
import { SecurityReviewer } from '../agents/security';
import { BaseAgent, AgentContext } from '../agents/base';
import { triageAgents } from '../agents/triage';
import { t } from '../i18n';

export class Orchestrator {
  constructor(
    private readonly config: ResolvedConfig,
    private readonly rules: AivRules,
  ) {}

  async run(prDiff: PRDiff, projectContext: string, requestedAgents: string[], auto: boolean): Promise<ReviewResult> {
    const agentNames = auto
      ? await this.triage(prDiff, requestedAgents)
      : requestedAgents;

    if (agentNames.length === 0) {
      return buildEmptyResult(prDiff);
    }

    const agents = buildAgents(agentNames, this.config);
    const agentCtx: AgentContext = { diff: prDiff, projectContext, rules: this.rules };
    const agentResults = await runAgents(agents, agentCtx);

    const overallScore = computeOverallScore(agentResults.map(r => r.riskScore));
    const regressions = agentResults.flatMap(r => (r as any).possibleRegressions ?? []) as string[];

    return {
      prNumber: prDiff.pr.number,
      prTitle: prDiff.pr.title,
      executiveSummary: buildExecutiveSummary(agentResults, overallScore),
      riskScore: overallScore,
      riskLabel: scoreToLabel(overallScore),
      agents: agentResults,
      businessRisks: agentResults.find(r => r.agentName === 'business')?.findings ?? [],
      architectureIssues: agentResults.find(r => r.agentName === 'architecture')?.findings ?? [],
      securityIssues: agentResults.find(r => r.agentName === 'security')?.findings ?? [],
      possibleRegressions: regressions,
      generatedAt: new Date().toISOString(),
    };
  }

  private async triage(prDiff: PRDiff, requested: string[]): Promise<string[]> {
    const spinner = ora(t().orchestratorTriaging).start();
    try {
      const provider = createProviderFor(this.config, 'triage');
      const result = await triageAgents(prDiff, provider);
      const selected = result.agents.filter(a => requested.includes(a));

      if (selected.length === 0) {
        spinner.succeed(chalk.dim(t().orchestratorTriageSkipped));
      } else {
        spinner.succeed(chalk.dim(t().orchestratorTriageResult(
          selected.map(a => chalk.cyan(a)).join(', '),
          result.reasoning,
        )));
      }
      return selected;
    } catch {
      spinner.warn(chalk.yellow('Triage failed — running all agents'));
      return requested;
    }
  }
}

function buildEmptyResult(prDiff: PRDiff): ReviewResult {
  return {
    prNumber: prDiff.pr.number,
    prTitle: prDiff.pr.title,
    executiveSummary: t().orchestratorTriageSkipped,
    riskScore: 0,
    riskLabel: 'LOW',
    agents: [],
    businessRisks: [],
    architectureIssues: [],
    securityIssues: [],
    possibleRegressions: [],
    generatedAt: new Date().toISOString(),
  };
}

function buildAgents(names: string[], config: ResolvedConfig): BaseAgent[] {
  const map: Record<string, (p: ReturnType<typeof createProviderFor>) => BaseAgent> = {
    business:     p => new BusinessReviewer(p),
    architecture: p => new ArchitectureReviewer(p),
    security:     p => new SecurityReviewer(p),
  };
  return names.filter(n => n in map).map(n => map[n](createProviderFor(config, n)));
}

async function runAgents(agents: BaseAgent[], ctx: AgentContext) {
  const results = await Promise.allSettled(
    agents.map(async agent => {
      const spinner = ora(t().orchestratorRunning(chalk.cyan(agent.agentName))).start();
      try {
        const result = await agent.run(ctx);
        spinner.succeed(t().orchestratorDone(chalk.cyan(agent.agentName), result.findings.length, result.riskScore));
        return result;
      } catch (e: any) {
        spinner.fail(chalk.red(t().orchestratorAgentFailed(chalk.cyan(agent.agentName), e.message)));
        return {
          agentName: agent.agentName,
          findings: [],
          summary: t().orchestratorFailedMsg(e.message),
          riskScore: 0,
        };
      }
    })
  );

  return results.map(r =>
    r.status === 'fulfilled'
      ? r.value
      : { agentName: 'unknown', findings: [], summary: t().orchestratorFailedUnexpected, riskScore: 0 }
  );
}

function computeOverallScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const max = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(max * 0.6 + avg * 0.4);
}

function buildExecutiveSummary(
  agents: Array<{ agentName: string; summary: string; riskScore: number; findings: AgentFinding[] }>,
  overallScore: number,
): string {
  const label = scoreToLabel(overallScore);
  const totalFindings = agents.reduce((acc, a) => acc + a.findings.length, 0);
  const critical = agents.flatMap(a => a.findings).filter(f => f.severity === 'critical' || f.severity === 'high').length;

  const criticalLine = critical > 0
    ? t().orchestratorCriticalFound(critical)
    : t().orchestratorNoCritical;

  return [
    t().orchestratorOverallRisk(label, overallScore, totalFindings, agents.length),
    criticalLine,
    '',
    ...agents.map(a => `[${a.agentName.toUpperCase()}] ${a.summary}`),
  ].join('\n');
}

function scoreToLabel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}
