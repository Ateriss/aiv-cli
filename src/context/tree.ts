import * as fs from 'node:fs';
import * as path from 'node:path';
import { TreeNode } from '../types';

const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage',
  '.aiv', '.cache', 'vendor', '__pycache__', '.venv', 'venv', '.DS_Store',
]);

const MODULE_TYPE_MAP: Array<[RegExp, TreeNode['module_type']]> = [
  [/auth|login|session|jwt|oauth|passport/i, 'auth'],
  [/sql|database|db|migration|seed|schema|prisma|typeorm|sequelize|knex/i, 'sql'],
  [/component|view|page|template|ui|frontend|client|web/i, 'frontend'],
  [/service|controller|handler|route|api|endpoint|backend|server/i, 'backend'],
  [/infra|terraform|k8s|kubernetes|helm|docker|deploy|ci|cd/i, 'infra'],
  [/config|setting|env|constant/i, 'config'],
  [/test|spec|__test__|__mock__|fixture/i, 'test'],
];

const SENSITIVITY_MAP: Array<[RegExp, TreeNode['sensitivity']]> = [
  [/auth|login|password|jwt|oauth|session|token|secret|crypto|encrypt/i, 'high'],
  [/payment|billing|payroll|salary|invoice|stripe|financial/i, 'high'],
  [/admin|permission|role|acl|rbac|sudo/i, 'high'],
  [/migration|seed|database|schema/i, 'medium'],
  [/service|controller|api|route/i, 'medium'],
  [/test|spec|mock|fixture|config/i, 'low'],
];

export async function buildTree(cwd: string, maxDepth: number = 4): Promise<TreeNode> {
  return scanDir(cwd, cwd, maxDepth);
}

function scanDir(root: string, dir: string, maxDepth: number, depth: number = 0): TreeNode {
  const name = path.basename(dir);
  const rel = path.relative(root, dir) || '.';

  const node: TreeNode = {
    path: rel,
    type: 'directory',
    module_type: detectModuleType(name),
    sensitivity: detectSensitivity(name),
    children: [],
  };

  if (depth >= maxDepth) return node;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return node;
  }

  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      node.children!.push(scanDir(root, fullPath, maxDepth, depth + 1));
    } else if (depth < maxDepth) {
      node.children!.push({
        path: path.relative(root, fullPath),
        type: 'file',
        module_type: detectModuleType(entry.name),
        sensitivity: detectSensitivity(entry.name),
      });
    }
  }

  // Limit children to keep tree.json manageable
  if (node.children!.length > 50) {
    node.children = node.children!.slice(0, 50);
  }

  return node;
}

function detectModuleType(name: string): TreeNode['module_type'] {
  for (const [pattern, type] of MODULE_TYPE_MAP) {
    if (pattern.test(name)) return type;
  }
  return 'other';
}

function detectSensitivity(name: string): TreeNode['sensitivity'] {
  for (const [pattern, level] of SENSITIVITY_MAP) {
    if (pattern.test(name)) return level;
  }
  return 'low';
}
