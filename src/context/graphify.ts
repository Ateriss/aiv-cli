import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const GRAPH_FILE = path.join('graphify-out', 'graph.json');

function findBin(): string | null {
  // Try graphify in PATH first
  try {
    execSync('graphify --help', { stdio: 'pipe' });
    return 'graphify';
  } catch {}

  // Locate via Python's Scripts directory
  try {
    const pyExec = execSync('python -c "import sys; print(sys.executable)"', { stdio: 'pipe' })
      .toString().trim();
    const candidates = [
      path.join(path.dirname(pyExec), 'Scripts', 'graphify.exe'),
      path.join(path.dirname(pyExec), 'graphify'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return `"${c}"`;
    }
  } catch {}

  return null;
}

export function hasGraphifyGraph(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, GRAPH_FILE));
}

function runQuery(bin: string, graphPath: string, question: string, budget: number): string {
  try {
    return execSync(
      `${bin} query "${question}" --budget ${budget} --graph "${graphPath}"`,
      { stdio: 'pipe', timeout: 15000 },
    ).toString().trim();
  } catch { return ''; }
}

export function buildGraphifyContext(cwd: string): string {
  if (!hasGraphifyGraph(cwd)) return '';

  const bin = findBin();
  if (!bin) return '';

  const graphPath = path.join(cwd, GRAPH_FILE);

  const queries = [
    { q: 'describe the architecture, main entry points and module responsibilities', budget: 1500 },
    { q: 'what are the main business entities, data types and their relationships', budget: 1000 },
    { q: 'what handles authentication, payments, sensitive operations or external APIs', budget: 800 },
  ];

  const parts = queries
    .map(({ q, budget }) => runQuery(bin, graphPath, q, budget))
    .filter(Boolean);

  if (parts.length === 0) return '';
  return parts.join('\n\n');
}

export function queryGraphifyForDiff(cwd: string, changedFiles: string[]): string {
  if (!hasGraphifyGraph(cwd) || changedFiles.length === 0) return '';

  const bin = findBin();
  if (!bin) return '';

  const graphPath = path.join(cwd, GRAPH_FILE);
  const fileList = changedFiles.slice(0, 10).join(', ');
  const question = `what modules, functions and types are related to these changed files: ${fileList}`;

  return runQuery(bin, graphPath, question, 1500);
}
