import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { en, TranslationKeys } from './en';
import { es } from './es';

export type SupportedLang = 'en' | 'es';

const translations: Record<SupportedLang, TranslationKeys> = { en, es };

let _lang: SupportedLang = 'en';

export function initLang(): void {
  // 1. AIV_LANG env var — instant override
  const envLang = process.env['AIV_LANG'];
  if (envLang && isSupported(envLang)) {
    _lang = envLang;
    return;
  }

  // 2. Global config (~/.aiv/config.yml) — lang is a global setting
  try {
    const globalConfig = path.join(os.homedir(), '.aiv', 'config.yml');
    if (fs.existsSync(globalConfig)) {
      const content = fs.readFileSync(globalConfig, 'utf8');
      const match = /^\s*lang:\s*['"]?(\w+)['"]?\s*$/m.exec(content);
      if (match && isSupported(match[1])) {
        _lang = match[1];
        return;
      }
    }
  } catch { /* unreadable — continue */ }

  // 3. System locale fallback
  const sysLang = process.env['LANG'] ?? process.env['LANGUAGE'] ?? '';
  if (sysLang.startsWith('es')) {
    _lang = 'es';
  }
}

export function setLang(lang: SupportedLang): void {
  _lang = lang;
}

export function getLang(): SupportedLang {
  return _lang;
}

export function t(): TranslationKeys {
  return translations[_lang] ?? en;
}

export function isSupported(lang: string): lang is SupportedLang {
  return lang === 'en' || lang === 'es';
}

export const SUPPORTED_LANGS: SupportedLang[] = ['en', 'es'];
