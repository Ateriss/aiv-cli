import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAivDir } from '../config';

const CACHE_DIR = 'cache';
const TTL_MS = 1000 * 60 * 60; // 1 hour

export class Cache {
  private readonly dir: string;

  constructor(cwd: string = process.cwd()) {
    this.dir = path.join(getAivDir(cwd), CACHE_DIR);
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  get<T>(key: string): T | null {
    const file = this.keyPath(key);
    if (!fs.existsSync(file)) return null;

    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - raw.ts > TTL_MS) {
        fs.unlinkSync(file);
        return null;
      }
      return raw.data as T;
    } catch {
      return null;
    }
  }

  set<T>(key: string, data: T): void {
    fs.writeFileSync(this.keyPath(key), JSON.stringify({ ts: Date.now(), data }), 'utf8');
  }

  invalidate(key: string): void {
    const file = this.keyPath(key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  private keyPath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dir, `${safe}.json`);
  }
}
