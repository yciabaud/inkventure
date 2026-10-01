// The ebook download page (SPEC §8, story S6.3), written at build time to dist/ebook/: index.html with the
// ebookPage.* strings of every locale, and page.js, src/ebook-page/page.ts compiled to ES5 on its own (checked by
// `npm run check:es5`). It is not a Vite entry, so the app's size budgets do not count it. The books themselves
// and books.json are added by the Deploy workflow.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Plugin } from 'vite';
import { uiLocales } from '../catalog/locales.ts';

type Strings = Record<string, string>;

const PREFIX = 'ebookPage.';

/** The ebookPage.* strings of each locale's catalogue. */
export function pageStrings(
  catalogues: Record<string, Record<string, unknown>>,
): Record<string, Strings> {
  const all: Record<string, Strings> = {};
  for (const locale of Object.keys(catalogues).sort()) {
    const strings: Strings = {};
    for (const [key, value] of Object.entries(catalogues[locale])) {
      if (key.indexOf(PREFIX) === 0 && typeof value === 'string') strings[key] = value;
    }
    all[locale] = strings;
  }
  return all;
}

/** The page module as an ES5 script that runs it with the strings the page defines. */
export function compilePage(source: string): string {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      removeComments: true,
    },
  }).outputText;
  return (
    '(function () {\nvar exports = {};\n' +
    output +
    '\nexports.start(window, window.INKVENTURE_EBOOK_STRINGS);\n})();\n'
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** JSON safe inside a <script> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function pageHtml(all: Record<string, Strings>, fallback: string): string {
  const title = escapeHtml(all[fallback][PREFIX + 'title']);
  const noScript = escapeHtml(all[fallback][PREFIX + 'noScript']);
  return `<!doctype html>
<html lang="${fallback}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      /* Same e-ink design as the app: black on white, no animations, tap targets of 48 px or more. */
      body { margin: 0; background: #fff; color: #000; font-family: Georgia, serif; font-size: 18px; line-height: 1.45; }
      #page { max-width: 720px; margin: 0 auto; padding: 16px; }
      h1 { font-size: 28px; margin: 8px 0; }
      h2 { font-size: 22px; margin: 24px 0 8px; }
      .book h2 { margin-top: 0; }
      p { margin: 0 0 12px; }
      .header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; }
      .languages { margin: 0; }
      .language { display: inline-block; min-height: 48px; min-width: 48px; line-height: 48px; padding: 0 12px;
        color: #000; font-family: Arial, sans-serif; }
      .language[aria-current] { font-weight: bold; text-decoration: none; border-bottom: 3px solid #000; }
      .unavailable { border: 2px solid #000; padding: 12px; font-weight: bold; }
      .book { display: flex; border-top: 2px solid #000; padding: 16px 0; }
      .cover { width: 120px; height: 192px; margin-right: 16px; border: 1px solid #555; flex: none; }
      .book-body { flex: 1; min-width: 0; }
      .format { margin: 12px 0; }
      .button { display: inline-block; box-sizing: border-box; min-height: 48px; min-width: 48px; line-height: 44px;
        padding: 0 20px; border: 2px solid #000; background: #fff; color: #000; text-decoration: none;
        font-family: Arial, sans-serif; font-weight: bold; }
      .button--disabled { border-style: dashed; color: #555; }
      .info { margin: 4px 0 0; color: #333; font-size: 16px; }
      @media (max-width: 480px) { .cover { width: 72px; height: 115px; } }
    </style>
    <script>window.INKVENTURE_EBOOK_STRINGS = ${scriptJson(all)};</script>
  </head>
  <body>
    <div id="page"><h1>${title}</h1><noscript>${noScript}</noscript></div>
    <script src="page.js"></script>
  </body>
</html>
`;
}

/** Vite plugin: writes ebook/index.html and ebook/page.js into the build. */
export function ebookPagePlugin(): Plugin {
  return {
    name: 'inkventure-ebook-page',
    apply: 'build',
    generateBundle() {
      const catalogues: Record<string, Record<string, unknown>> = {};
      for (const locale of uiLocales()) {
        catalogues[locale] = JSON.parse(readFileSync('src/i18n/' + locale + '.json', 'utf8'));
      }
      const all = pageStrings(catalogues);
      this.emitFile({ type: 'asset', fileName: 'ebook/index.html', source: pageHtml(all, 'en') });
      this.emitFile({
        type: 'asset',
        fileName: 'ebook/page.js',
        source: compilePage(readFileSync('src/ebook-page/page.ts', 'utf8')),
      });
    },
  };
}
