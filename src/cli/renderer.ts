import chalk from 'chalk';
import { ReviewResult, AgentFinding } from '../types';
import { t } from '../i18n';

export function renderReview(result: ReviewResult): void {
  const tr = t();
  const riskColor = riskChalk(result.riskLabel);
  const riskBadge = riskColor(`${result.riskScore}/100 [${result.riskLabel}]`);

  console.log('\n' + chalk.bold('━'.repeat(60)));
  console.log(chalk.bold(tr.renderReviewTitle(result.prNumber, result.prTitle)));
  console.log(chalk.bold('━'.repeat(60)));

  console.log(`\n  ${chalk.bold(tr.renderRiskScore)} ${riskBadge}`);
  console.log(`  ${chalk.bold(tr.renderGenerated)} ${chalk.dim(result.generatedAt)}\n`);

  console.log(chalk.bold(tr.renderExecutiveSummary));
  console.log(chalk.dim('  ' + '─'.repeat(56)));
  console.log(indent(result.executiveSummary, 2));

  if (result.securityIssues.length > 0) {
    console.log('\n' + chalk.bold.red(tr.renderSecurityIssues));
    console.log(chalk.dim('  ' + '─'.repeat(56)));
    renderFindings(result.securityIssues);
  }

  if (result.businessRisks.length > 0) {
    console.log('\n' + chalk.bold.yellow(tr.renderBusinessRisks));
    console.log(chalk.dim('  ' + '─'.repeat(56)));
    renderFindings(result.businessRisks);
  }

  if (result.architectureIssues.length > 0) {
    console.log('\n' + chalk.bold.blue(tr.renderArchitectureIssues));
    console.log(chalk.dim('  ' + '─'.repeat(56)));
    renderFindings(result.architectureIssues);
  }

  if (result.possibleRegressions.length > 0) {
    console.log('\n' + chalk.bold.magenta(tr.renderRegressions));
    console.log(chalk.dim('  ' + '─'.repeat(56)));
    result.possibleRegressions.forEach(r => {
      console.log(`  ${chalk.magenta('◆')} ${r}`);
    });
  }

  console.log('\n' + chalk.bold(tr.renderAgentSummaries));
  console.log(chalk.dim('  ' + '─'.repeat(56)));
  result.agents.forEach(agent => {
    const score = riskChalk(scoreLabel(agent.riskScore));
    const scoreBadge = score(`[${agent.riskScore}/100]`);
    console.log(`\n  ${chalk.bold(agent.agentName.toUpperCase())} ${scoreBadge}`);
    console.log(indent(agent.summary, 2));
  });

  console.log('\n' + chalk.bold('━'.repeat(60)) + '\n');
}

function renderFindings(findings: AgentFinding[]): void {
  const tr = t();
  findings.forEach(f => {
    const sev = severityBadge(f.severity);
    const file = f.file ? chalk.dim(` → ${f.file}`) : '';
    console.log(`\n  ${sev} ${chalk.bold(f.title)}${file}`);
    console.log(indent(f.description, 2));
    if (f.suggestion) {
      console.log(`  ${chalk.dim(tr.renderSuggestion)} ${f.suggestion}`);
    }
  });
}

function severityBadge(sev: string): string {
  const tr = t();
  switch (sev) {
    case 'critical': return chalk.bgRed.white(` ${tr.severityCritical} `);
    case 'high':     return chalk.red(`[${tr.severityHigh}]`);
    case 'medium':   return chalk.yellow(`[${tr.severityMedium}]`);
    case 'low':      return chalk.blue(`[${tr.severityLow}]`);
    default:         return chalk.dim(`[${tr.severityInfo}]`);
  }
}

function riskChalk(label: string) {
  switch (label) {
    case 'CRITICAL': return chalk.bgRed.white;
    case 'HIGH':     return chalk.red;
    case 'MEDIUM':   return chalk.yellow;
    default:         return chalk.green;
  }
}

function scoreLabel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map(l => pad + l).join('\n');
}
