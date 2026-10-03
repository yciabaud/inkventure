import { describe, expect, it } from 'vitest';
import type { Manifest } from '../size/budget.ts';
import {
  precacheList,
  precacheVersion,
  serviceWorkerSource,
  type Precache,
} from './service-worker.ts';

// The shape of a real build's manifest (modern and legacy, engines, a shared chunk, fonts and a test story asset).
const manifest: Manifest = {
  'index.html': {
    file: 'assets/index-A.js',
    isEntry: true,
    imports: [],
    dynamicImports: [
      'src/i18n/fr.json',
      'src/engines/zvm/zvmEngine.ts',
      'src/engines/ink/inkEngine.ts',
      '_TwineReader-B.js',
      'src/catalog/storyFile.ts',
    ],
    css: ['assets/index-C.css'],
  },
  'index-legacy.html': {
    file: 'assets/index-legacy-A.js',
    isEntry: true,
    dynamicImports: ['src/engines/zvm/zvmEngine-legacy.ts'],
  },
  'vite/legacy-polyfills-legacy': { file: 'assets/polyfills-legacy-P.js', isEntry: true },
  'src/i18n/fr.json': { file: 'assets/fr-F.js', isDynamicEntry: true },
  'src/catalog/storyFile.ts': {
    file: 'assets/storyFile-S.js',
    isDynamicEntry: true,
    imports: ['_browser-W.js', 'index.html', '_compress-Z.js'],
  },
  '_browser-W.js': { file: 'assets/browser-W.js' },
  '_compress-Z.js': { file: 'assets/compress-Z.js', imports: ['_browser-W.js'] },
  '_bridge-G.js': { file: 'assets/bridge-G.js' },
  '_bridge-legacy-G.js': { file: 'assets/bridge-legacy-G.js' },
  'src/engines/zvm/zvmEngine.ts': {
    file: 'assets/zvmEngine-Z.js',
    src: 'src/engines/zvm/zvmEngine.ts',
    isDynamicEntry: true,
    imports: ['_browser-W.js', '_bridge-G.js'],
  },
  'src/engines/zvm/zvmEngine-legacy.ts': {
    file: 'assets/zvmEngine-legacy-Z.js',
    src: 'src/engines/zvm/zvmEngine-legacy.ts',
    isDynamicEntry: true,
    imports: ['_bridge-legacy-G.js'],
  },
  'src/engines/ink/inkEngine.ts': {
    file: 'assets/inkEngine-I.js',
    src: 'src/engines/ink/inkEngine.ts',
    isDynamicEntry: true,
    imports: ['_browser-W.js'],
  },
  '_TwineReader-B.js': {
    file: 'assets/TwineReader-B.js',
    isDynamicEntry: true,
    imports: ['index.html'],
    dynamicImports: ['src/engines/twine/twineHtml.ts'],
  },
  'src/engines/twine/twineHtml.ts': {
    file: 'assets/twineHtml-H.js',
    src: 'src/engines/twine/twineHtml.ts',
    isDynamicEntry: true,
    imports: ['_TwineReader-B.js', '_compress-Z.js'],
  },
  'node_modules/@fontsource/literata/files/literata-latin-400-normal.woff2': {
    file: 'assets/literata-L.woff2',
  },
  'node_modules/@fontsource/literata/files/literata-latin-400-normal.woff': {
    file: 'assets/literata-L.woff',
  },
  'tests/fixtures/zmachine/lamp.z5': { file: 'assets/lamp-Q.z5' },
};

describe('precacheList', () => {
  const list = precacheList(manifest);

  it('makes the shell of the page, both bundles, their CSS, fonts and the non-engine lazy chunks', () => {
    expect(list.shell).toEqual([
      './',
      'assets/browser-W.js',
      'assets/compress-Z.js',
      'assets/fr-F.js',
      'assets/index-A.js',
      'assets/index-C.css',
      'assets/index-legacy-A.js',
      'assets/polyfills-legacy-P.js',
      'assets/storyFile-S.js',
      'assets/literata-L.woff',
      'assets/literata-L.woff2',
    ]);
  });

  it("lists each engine's chunks, modern and legacy, without what the shell holds", () => {
    expect(list.engines).toEqual({
      ink: ['assets/inkEngine-I.js'],
      twine: ['assets/TwineReader-B.js', 'assets/twineHtml-H.js'],
      zmachine: [
        'assets/bridge-G.js',
        'assets/bridge-legacy-G.js',
        'assets/zvmEngine-Z.js',
        'assets/zvmEngine-legacy-Z.js',
      ],
    });
  });

  it('leaves out other assets (the test stories)', () => {
    const all = list.shell.concat(...Object.values(list.engines));
    expect(all).not.toContain('assets/lamp-Q.z5');
  });
});

describe('precacheVersion', () => {
  it('changes with the list or the page, and only then', () => {
    const list = precacheList(manifest);
    const version = precacheVersion(list, '<html>1</html>');
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(precacheVersion(list, '<html>1</html>')).toBe(version);
    expect(precacheVersion(list, '<html>2</html>')).not.toBe(version);
    expect(precacheVersion({ ...list, shell: list.shell.slice(1) }, '<html>1</html>')).not.toBe(
      version,
    );
  });
});

describe('serviceWorkerSource', () => {
  const precache: Precache = { version: 'v1', shell: ['./'], engines: { ink: ['a.js'] } };

  it('puts the list in place of the placeholder', () => {
    const source = serviceWorkerSource(
      '/* uses self.__PRECACHE__ */\nvar PRECACHE = self.__PRECACHE__;\nrun(PRECACHE);',
      precache,
    );
    expect(source).toContain('var PRECACHE = ' + JSON.stringify(precache) + ';');
    expect(source).toContain('/* uses self.__PRECACHE__ */');
  });

  it('refuses a template without exactly one placeholder', () => {
    expect(() => serviceWorkerSource('run();', precache)).toThrow();
    const twice = 'var PRECACHE = self.__PRECACHE__;\n'.repeat(2);
    expect(() => serviceWorkerSource(twice, precache)).toThrow();
  });

  it('the real template has its placeholder', async () => {
    const { readFileSync } = await import('node:fs');
    const source = serviceWorkerSource(readFileSync('src/sw/sw.js', 'utf8'), precache);
    expect(source).toContain('"version":"v1"');
  });
});
