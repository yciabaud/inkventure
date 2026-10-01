// Third-party licences (SPEC §5.6, §10, S7.2): writes dist/licences.txt, the full licence text of every piece of
// third-party code or font the site serves. Vite's `build.license` lists the npm packages bundled into the app
// (.vite/license.md); this plugin adds what it cannot see: Quixe (vendored, outside node_modules), the legacy
// bundle's polyfills (core-js, SystemJS, built separately by @vitejs/plugin-legacy) and the device probe's QR code
// script (a plain file in public/probe/).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { QUIXE_TAG } from './quixe-files.ts';

export interface Notice {
  name: string;
  version?: string;
  licence: string;
  /** What Inkventure uses it for. */
  use: string;
  /** Licence text; read from `file` when not given. */
  text?: string;
  file?: string;
}

/** The MIT licence text, for code that only carries a "Licensed under the MIT license" header. */
export function mitText(copyright: string): string {
  return [
    'Copyright (c) ' + copyright,
    '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated',
    'documentation files (the "Software"), to deal in the Software without restriction, including without limitation',
    'the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and',
    'to permit persons to whom the Software is furnished to do so, subject to the following conditions:',
    '',
    'The above copyright notice and this permission notice shall be included in all copies or substantial portions',
    'of the Software.',
    '',
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO',
    'THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
    'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF',
    'CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER',
    'DEALINGS IN THE SOFTWARE.',
  ].join('\n');
}

function packageVersion(root: string, name: string): string | undefined {
  const path = join(root, 'node_modules', name, 'package.json');
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version
    : undefined;
}

/** What Vite's licence list misses. */
export function extraNotices(root: string): Notice[] {
  return [
    {
      name: 'Quixe',
      version: QUIXE_TAG.replace(/^quixe-/, ''),
      licence: 'MIT',
      use: 'Glulx interpreter, by Andrew Plotkin',
      file: join(root, 'vendor/quixe/LICENSE'),
    },
    {
      name: 'core-js',
      version: packageVersion(root, 'core-js'),
      licence: 'MIT',
      use: 'polyfills of the legacy (ES5) bundle',
      file: join(root, 'node_modules/core-js/LICENSE'),
    },
    {
      name: 'SystemJS',
      version: packageVersion(root, 'systemjs'),
      licence: 'MIT',
      use: 'module loader of the legacy (ES5) bundle',
      file: join(root, 'node_modules/systemjs/LICENSE'),
    },
    {
      name: 'QR Code Generator for JavaScript',
      licence: 'MIT',
      use: 'QR code of the device probe (probe/qrcode.js)',
      text: mitText('2009 Kazuhiko Arase'),
    },
  ];
}

const RULE = '-'.repeat(78);

/** Vite's Markdown list without its title, then the extra notices, as one plain-text file. */
export function formatLicences(viteLicences: string, extras: Notice[]): string {
  const bundled = viteLicences.replace(/^# [^\n]*\n+/, '').trim();
  const parts = [
    'Inkventure: third-party licences',
    '',
    'Inkventure is free software under the MIT licence (https://github.com/yciabaud/inkventure).',
    'It includes the following third-party software and fonts. Games belong to their authors: see each',
    "game's page on IFDB (ifdb.org) for its terms.",
    '',
    RULE,
    '',
    bundled,
  ];
  for (const notice of extras) {
    const text = notice.text ?? readFileSync(notice.file!, 'utf8');
    parts.push(
      '',
      '## ' +
        notice.name +
        (notice.version ? ' - ' + notice.version : '') +
        ' (' +
        notice.licence +
        ')',
      '',
      'Used for: ' + notice.use + '.',
      '',
      text.trim(),
    );
  }
  return parts.join('\n') + '\n';
}

/** Vite plugin: needs `build.license: true` (Vite writes .vite/license.md before the bundle closes). */
export function licencesPlugin(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'inkventure-licences',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const source = join(outDir, '.vite/license.md');
      if (!existsSync(source))
        this.error('build.license must be enabled: ' + source + ' is missing');
      writeFileSync(
        join(outDir, 'licences.txt'),
        formatLicences(readFileSync(source, 'utf8'), extraNotices(root)),
      );
    },
  };
}
