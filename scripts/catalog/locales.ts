// The UI locales (SPEC §7), from the translation files in src/i18n/ (the scripts cannot import the app's i18n
// module, which needs the bundler). A unit test checks they match the app's LOCALES.
import { readdirSync } from 'node:fs';

export function uiLocales(dir = 'src/i18n'): string[] {
  return readdirSync(dir)
    .filter((name) => /^[a-z]{2,3}\.json$/.test(name))
    .map((name) => name.replace(/\.json$/, ''))
    .sort();
}
