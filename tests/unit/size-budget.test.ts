import { describe, expect, it } from 'vitest';
import {
  KIB,
  evaluate,
  initialChunks,
  lazyChunks,
  toMarkdown,
  type Budgets,
  type Manifest,
  type Sizes,
} from '../../scripts/size/budget.ts';

const manifest: Manifest = {
  'index.html': {
    file: 'assets/index.js',
    isEntry: true,
    imports: ['_shared.js'],
    dynamicImports: ['src/zvm.ts'],
  },
  'index-legacy.html': {
    file: 'assets/index-legacy.js',
    isEntry: true,
    imports: ['_shared-legacy.js'],
  },
  'vite/legacy-polyfills-legacy': { file: 'assets/polyfills-legacy.js', isEntry: true },
  '_shared.js': { file: 'assets/shared.js' },
  '_shared-legacy.js': { file: 'assets/shared-legacy.js' },
  'src/zvm.ts': { file: 'assets/zvm.js', isDynamicEntry: true },
  'font.woff': { file: 'assets/font.woff' },
};

const files = [
  'index.html',
  'assets/index.js',
  'assets/index-legacy.js',
  'assets/polyfills-legacy.js',
  'assets/shared.js',
  'assets/shared-legacy.js',
  'assets/zvm.js',
  'assets/index.css',
  'assets/font.woff',
  'assets/font.woff2',
  'catalog/index-0.json',
  'catalog/meta.json',
  'catalog/games/small.json',
  'catalog/games/big.json',
  'catalog/README.md',
];

function kib(n: number) {
  return { raw: n * KIB, gzip: n * KIB };
}

const budgets: Budgets = {
  initialJsLegacy: 150,
  initialJsModern: 150,
  css: 20,
  fontsWoff: 80,
  fontsWoff2: 70,
  lazyChunk: 100,
  catalogShard: 150,
  firstLoadLegacy: 200,
};

function sizes(overrides: Partial<Record<string, number>> = {}): Sizes {
  const base: Record<string, number> = {
    'assets/index.js': 10,
    'assets/index-legacy.js': 12,
    'assets/polyfills-legacy.js': 40,
    'assets/shared.js': 5,
    'assets/shared-legacy.js': 6,
    'assets/zvm.js': 60,
    'assets/index.css': 2,
    'assets/font.woff': 70,
    'assets/font.woff2': 56,
    'catalog/index-0.json': 120,
    'catalog/meta.json': 1,
    'catalog/games/small.json': 1,
    'catalog/games/big.json': 3,
  };
  const out: Sizes = {};
  for (const key of Object.keys(base)) out[key] = kib(overrides[key] ?? base[key]);
  return out;
}

describe('chunk classification', () => {
  it('collects legacy entries, the polyfills and their static imports', () => {
    expect(initialChunks(manifest, true)).toEqual([
      'assets/index-legacy.js',
      'assets/polyfills-legacy.js',
      'assets/shared-legacy.js',
    ]);
  });

  it('collects modern entries and their static imports', () => {
    expect(initialChunks(manifest, false)).toEqual(['assets/index.js', 'assets/shared.js']);
  });

  it('treats every other JS chunk as lazy', () => {
    expect(lazyChunks(manifest)).toEqual(['assets/zvm.js']);
  });
});

describe('evaluate', () => {
  it('passes when everything is within budget', () => {
    const rows = evaluate(manifest, files, sizes(), budgets);
    expect(rows.every((r) => r.ok)).toBe(true);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.bytes / KIB]));
    expect(byLabel['Initial JS (legacy / Kindle)']).toBe(58);
    expect(byLabel['Initial JS (modern)']).toBe(15);
    expect(byLabel['Lazy chunk assets/zvm.js']).toBe(60);
    expect(byLabel['Catalogue catalog/index-0.json']).toBe(120);
    expect(byLabel['First load (Kindle: legacy JS + CSS + .woff)']).toBe(58 + 2 + 70);
  });

  it('checks shards and meta.json one by one, and only the largest game detail', () => {
    const rows = evaluate(manifest, files, sizes(), budgets);
    const labels = rows.map((r) => r.label).filter((label) => label.indexOf('atalogue') >= 0);
    expect(labels).toEqual([
      'Catalogue catalog/index-0.json',
      'Catalogue catalog/meta.json',
      'Largest catalogue game detail',
    ]);
    expect(rows.find((r) => r.label === 'Largest catalogue game detail')!.files).toEqual([
      'catalog/games/big.json',
    ]);
  });

  it('ignores non-JSON files in the catalogue folder', () => {
    const rows = evaluate(manifest, files, sizes(), budgets);
    expect(rows.some((r) => r.label.indexOf('README') >= 0)).toBe(false);
  });

  it('accepts a size exactly at the budget and rejects one byte more', () => {
    const at = evaluate(manifest, files, sizes({ 'assets/index.css': 20 }), budgets);
    expect(at.find((r) => r.label === 'CSS')!.ok).toBe(true);
    const s = sizes({ 'assets/index.css': 20 });
    s['assets/index.css'].gzip += 1;
    const over = evaluate(manifest, files, s, budgets);
    expect(over.find((r) => r.label === 'CSS')!.ok).toBe(false);
  });

  it('flags each budget category independently', () => {
    const rows = evaluate(
      manifest,
      files,
      sizes({ 'assets/zvm.js': 101, 'catalog/index-0.json': 151, 'assets/font.woff': 81 }),
      budgets,
    );
    const failed = rows.filter((r) => !r.ok).map((r) => r.label);
    expect(failed).toEqual([
      'Fonts (.woff, Kindle)',
      'Lazy chunk assets/zvm.js',
      'Catalogue catalog/index-0.json',
    ]);
  });

  it('checks the Kindle first load as a whole, even when each part is within budget', () => {
    const within = evaluate(
      manifest,
      files,
      sizes({ 'assets/polyfills-legacy.js': 100, 'assets/font.woff': 79 }),
      budgets,
    );
    const firstLoad = within[within.length - 1];
    expect(firstLoad.bytes / KIB).toBe(118 + 2 + 79);
    expect(firstLoad.ok).toBe(true);

    const heavier = evaluate(
      manifest,
      files,
      sizes({ 'assets/polyfills-legacy.js': 102, 'assets/font.woff': 79 }),
      budgets,
    );
    expect(heavier.filter((r) => !r.ok).map((r) => r.label)).toEqual([
      'First load (Kindle: legacy JS + CSS + .woff)',
    ]);
  });
});

describe('toMarkdown', () => {
  it('renders a table with the status of each row', () => {
    const md = toMarkdown(evaluate(manifest, files, sizes({ 'assets/index.css': 21 }), budgets));
    expect(md).toContain('| CSS | 21.0 KiB gz | 20 KiB | ❌ over |');
    expect(md).toContain('| Fonts (.woff, Kindle) | 70.0 KiB | 80 KiB | ✅ |');
  });
});
