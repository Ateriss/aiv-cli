import * as fs from 'node:fs';
import { contextPath, treePath, isInitialized } from '../config';
import { buildContext } from './builder';
import { buildTree } from './tree';
import { PRDiff } from '../types';
import { queryGraphifyForDiff, hasGraphifyGraph } from './graphify';

export async function refreshContextFiles(cwd: string): Promise<{ treeOk: boolean; contextOk: boolean }> {
  let treeOk = false;
  let contextOk = false;

  try {
    const tree = await buildTree(cwd);
    fs.writeFileSync(treePath(cwd), JSON.stringify(tree, null, 2), 'utf8');
    treeOk = true;
  } catch {}

  try {
    const context = await buildContext(cwd);
    fs.writeFileSync(contextPath(cwd), context, 'utf8');
    contextOk = true;
  } catch {}

  return { treeOk, contextOk };
}

export class ContextManager {
  private readonly cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  readContext(): string {
    if (!isInitialized(this.cwd)) return '';
    const file = contextPath(this.cwd);
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8');
  }

  readTree(): object | null {
    const file = treePath(this.cwd);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }

  buildReviewContext(prDiff: PRDiff): string {
    const context = this.readContext();

    const tree = this.readTree();
    const changedPaths = new Set(prDiff.files.map(f => f.filename));
    const relevantTree = tree ? summarizeRelevantTree(tree, changedPaths) : '';

    const graphifyCtx = hasGraphifyGraph(this.cwd)
      ? queryGraphifyForDiff(this.cwd, prDiff.files.map(f => f.filename))
      : '';

    return [
      context,
      relevantTree ? `\n## Relevant Project Tree\n\`\`\`json\n${relevantTree}\n\`\`\`` : '',
      graphifyCtx ? `\n## Knowledge Graph — changed file relationships\n${graphifyCtx}` : '',
    ].filter(Boolean).join('\n');
  }
}

function summarizeRelevantTree(tree: object, changedPaths: Set<string>): string {
  // Extract top-level structure only, to keep token count low
  const topLevel = (tree as any).children ?? [];
  const relevant = topLevel
    .filter((node: any) => {
      const nodePath = node.path ?? '';
      return Array.from(changedPaths).some(p => p.startsWith(nodePath)) ||
        node.sensitivity === 'high';
    })
    .map((node: any) => ({
      path: node.path,
      type: node.type,
      module_type: node.module_type,
      sensitivity: node.sensitivity,
    }));

  if (relevant.length === 0) return '';
  return JSON.stringify(relevant, null, 2);
}
