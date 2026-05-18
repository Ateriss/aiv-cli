import * as fs from 'node:fs';
import * as path from 'node:path';

const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage',
  '.aiv', '.cache', 'vendor', '__pycache__', '.venv', 'venv',
]);

const TECH_SIGNATURES: Array<[string, string]> = [
  ['package.json', 'Node.js'],
  ['tsconfig.json', 'TypeScript'],
  ['requirements.txt', 'Python'],
  ['Pipfile', 'Python (Pipenv)'],
  ['pyproject.toml', 'Python (Poetry)'],
  ['pom.xml', 'Java (Maven)'],
  ['build.gradle', 'Java/Kotlin (Gradle)'],
  ['Cargo.toml', 'Rust'],
  ['go.mod', 'Go'],
  ['composer.json', 'PHP (Composer)'],
  ['Gemfile', 'Ruby'],
  ['docker-compose.yml', 'Docker Compose'],
  ['Dockerfile', 'Docker'],
  ['terraform.tf', 'Terraform'],
  ['.terraform', 'Terraform'],
  ['kubernetes', 'Kubernetes'],
  ['k8s', 'Kubernetes'],
  ['prisma', 'Prisma ORM'],
  ['drizzle.config', 'Drizzle ORM'],
  ['sequelize', 'Sequelize ORM'],
  ['typeorm', 'TypeORM'],
  ['mongoose', 'MongoDB (Mongoose)'],
  ['next.config', 'Next.js'],
  ['nuxt.config', 'Nuxt.js'],
  ['vite.config', 'Vite'],
  ['webpack.config', 'Webpack'],
  ['jest.config', 'Jest'],
  ['vitest.config', 'Vitest'],
];

const SENSITIVE_PATTERNS = [
  'auth', 'login', 'password', 'token', 'session', 'jwt', 'oauth',
  'payment', 'billing', 'invoice', 'stripe', 'paypal',
  'payroll', 'salary', 'compensation',
  'admin', 'permission', 'role', 'acl', 'rbac',
  'crypto', 'encrypt', 'decrypt', 'hash', 'secret',
  'migration', 'seed', 'database', 'schema',
];

export async function buildContext(cwd: string): Promise<string> {
  const name = path.basename(cwd);
  const entries = fs.readdirSync(cwd);

  const technologies = detectTechnologies(cwd, entries);
  const modules = detectModules(cwd);
  const sensitiveZones = detectSensitiveZones(cwd);
  const dependencies = detectCriticalDeps(cwd);

  return `# Project Context: ${name}

## Architecture
${inferArchitecture(cwd, entries, technologies)}

## Modules
${modules.map(m => `- ${m}`).join('\n') || '- (not detected)'}

## Technologies
${technologies.map(t => `- ${t}`).join('\n') || '- (not detected)'}

## Critical Dependencies
${dependencies.map(d => `- ${d}`).join('\n') || '- (not detected)'}

## Sensitive Zones
${sensitiveZones.map(z => `- ${z}`).join('\n') || '- (none detected)'}

## Business Rules
(Edit this section to document key business rules for the AI reviewers)

## System Summary
${name} — ${technologies.slice(0, 3).join(', ')} project.
Auto-generated context. Edit ${cwd}/.aiv/context.md to add business-specific knowledge.
`;
}

const DEP_TECH_MAP: Array<[string[], string]> = [
  [['react'], 'React'],
  [['vue'], 'Vue.js'],
  [['@angular/core'], 'Angular'],
  [['express'], 'Express.js'],
  [['fastify'], 'Fastify'],
  [['nestjs', '@nestjs/core'], 'NestJS'],
  [['graphql'], 'GraphQL'],
  [['apollo-server', '@apollo/server'], 'Apollo Server'],
  [['knex'], 'Knex.js'],
];

function detectTechnologies(cwd: string, entries: string[]): string[] {
  const found: string[] = [];

  for (const [sig, tech] of TECH_SIGNATURES) {
    if (entries.some(e => e.toLowerCase().startsWith(sig.toLowerCase()))) {
      found.push(tech);
    }
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      const allDeps = { ...(pkg['dependencies'] as object), ...(pkg['devDependencies'] as object) } as Record<string, unknown>;
      for (const [keys, tech] of DEP_TECH_MAP) {
        if (keys.some(k => k in allDeps)) found.push(tech);
      }
    } catch { /* unreadable package.json — skip */ }
  }

  return [...new Set(found)];
}

function detectModules(cwd: string): string[] {
  const srcPaths = ['src', 'app', 'lib', 'packages', 'modules'];
  const modules: string[] = [];

  for (const base of srcPaths) {
    const p = path.join(cwd, base);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const dirs = fs.readdirSync(p).filter(e => {
        try { return fs.statSync(path.join(p, e)).isDirectory(); } catch { return false; }
      });
      dirs.forEach(d => modules.push(`${base}/${d}`));
    }
  }

  return modules.slice(0, 20);
}

function detectSensitiveZones(cwd: string): string[] {
  const zones: string[] = [];

  function scan(dir: string, depth: number = 0): void {
    if (depth > 3) return;
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch { return; }

    for (const entry of entries) {
      if (IGNORED.has(entry)) continue;
      const lower = entry.toLowerCase();
      for (const pattern of SENSITIVE_PATTERNS) {
        if (lower.includes(pattern)) {
          const rel = path.relative(cwd, path.join(dir, entry));
          zones.push(rel);
          break;
        }
      }
      const full = path.join(dir, entry);
      try {
        if (fs.statSync(full).isDirectory()) scan(full, depth + 1);
      } catch {}
    }
  }

  scan(cwd);
  return [...new Set(zones)].slice(0, 15);
}

function detectCriticalDeps(cwd: string): string[] {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const all = { ...pkg.dependencies };
    const critical = Object.keys(all).filter(dep => {
      const d = dep.toLowerCase();
      return d.includes('auth') || d.includes('jwt') || d.includes('passport') ||
        d.includes('crypto') || d.includes('stripe') || d.includes('paypal') ||
        d.includes('prisma') || d.includes('typeorm') || d.includes('sequelize') ||
        d.includes('mongoose') || d.includes('knex') || d.includes('pg') ||
        d.includes('mysql') || d.includes('redis') || d.includes('aws-sdk') ||
        d.includes('@aws') || d.includes('firebase');
    });
    return critical.slice(0, 15);
  } catch {
    return [];
  }
}

function inferArchitecture(cwd: string, entries: string[], technologies: string[]): string {
  const hasSrc = entries.includes('src');
  const hasPackages = entries.includes('packages');
  const hasApps = entries.includes('apps');
  const hasModules = entries.includes('modules');

  if (hasPackages && hasApps) return 'Monorepo (apps/ + packages/ structure)';
  if (hasModules) return 'Modular monolith (modules/ structure)';
  if (hasSrc) return 'Standard source layout (src/)';
  if (technologies.includes('NestJS')) return 'NestJS application (controllers/services/modules)';
  if (technologies.includes('Next.js')) return 'Next.js application (pages/ or app/ router)';
  return 'Standard project layout';
}
