// Minimal English-only lookup. S0.5 adds French, locale detection, plurals and the key parity test.
import en from './en.json';

export type MessageKey = keyof typeof en;

const messages: Record<string, string> = en;

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = messages[key];
  if (template === undefined) return key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}
