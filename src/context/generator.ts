import * as fs from 'node:fs';
import * as path from 'node:path';
import { LLMProvider } from '../providers/base';
import { treePath } from '../config';

const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.aiv', '.next', 'coverage']);
const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|java|rb|php|cs|rs)$/;

export async function generateContextAndRules(
  cwd: string,
  provider: LLMProvider,
): Promise<{ context: string; rules: string }> {
  const name = path.basename(cwd);

  const treeFile = treePath(cwd);
  const treeData = fs.existsSync(treeFile)
    ? fs.readFileSync(treeFile, 'utf8').slice(0, 6000)
    : '(tree not available — run aiv context refresh first)';

  const pkgInfo  = readPackageJson(cwd);
  const samples  = readSampleFiles(cwd);

  const userMessage = `
Project name: ${name}

package.json summary:
${pkgInfo}

Project file tree (tree.json):
${treeData}

Sample source files:
${samples}

Generate context.md and rules.yml suitable for AI PR reviewers for this project.
Return ONLY valid JSON with exactly these two fields:
{
  "context": "<full context.md content as a string>",
  "rules": "<full rules.yml content as a string>"
}`;

  const systemPrompt = `You are an expert software architect.
Given a project's structure, dependencies, and sample code, produce:

1. context.md — Markdown file with these sections:
   ## Architecture — overall pattern (monorepo, monolith, microservices, layers, etc.)
   ## Modules — key modules or directories and their responsibilities
   ## Technologies — main frameworks and libraries in use
   ## Critical Dependencies — security-sensitive or infrastructure packages
   ## Sensitive Zones — paths that require extra scrutiny (auth, payments, migrations, etc.)
   ## Business Rules — inferred invariants the codebase enforces (edit this section after generation)
   ## System Summary — one paragraph description

2. rules.yml — YAML file with:
   sensitive_modules: [list of folder/module names that are sensitive]
   business_rules:
     <module>:
       required_calls: [functions that must always be called in this module]
       required_checks: [validations that must be present]
       forbidden_patterns: [patterns that must never appear]

Be specific. Infer real module names from the file tree. Do not invent generic placeholders.
Return ONLY the JSON object — no explanation, no markdown fences.`;

  const response = await provider.complete(
    [{ role: 'user', content: userMessage }],
    systemPrompt,
    4000,
  );

  return parseResponse(response.content);
}

function parseResponse(raw: string): { context: string; rules: string } {
  const jsonMatch = /\{[\s\S]*\}/.exec(raw.trim());
  if (!jsonMatch) throw new Error('AI returned no JSON');

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { context?: string; rules?: string };
    if (!parsed.context || !parsed.rules) throw new Error('missing fields');
    return { context: parsed.context, rules: parsed.rules };
  } catch {
    return {
      context: raw,
      rules: 'sensitive_modules: []\nbusiness_rules: {}\n',
    };
  }
}

function readPackageJson(cwd: string): string {
  const file = path.join(cwd, 'package.json');
  if (!fs.existsSync(file)) return '(not found)';
  try {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 30);
    return `name: ${pkg.name ?? '?'}\nscripts: ${Object.keys(pkg.scripts ?? {}).join(', ')}\ndependencies: ${deps.join(', ')}`;
  } catch {
    return '(unreadable)';
  }
}

function readSampleFiles(cwd: string): string {
  const srcRoots = ['src', 'app', 'lib', 'packages', 'modules']
    .map(d => path.join(cwd, d))
    .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });

  const files: string[] = [];
  for (const root of srcRoots.slice(0, 2)) {
    collectSourceFiles(root, files);
    if (files.length >= 12) break;
  }

  return files.slice(0, 12).map(f => {
    const rel = path.relative(cwd, f);
    const content = fs.readFileSync(f, 'utf8').slice(0, 400);
    return `--- ${rel} ---\n${content}`;
  }).join('\n\n').slice(0, 7000);
}

function collectSourceFiles(dir: string, out: string[], depth = 0): void {
  if (depth > 3 || out.length >= 12) return;
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return; }

  for (const entry of entries) {
    if (IGNORED.has(entry)) continue;
    const full = path.join(dir, entry);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile() && SOURCE_EXT.test(entry)) {
        out.push(full);
      } else if (stat.isDirectory()) {
        collectSourceFiles(full, out, depth + 1);
      }
    } catch {}
    if (out.length >= 12) break;
  }
}
