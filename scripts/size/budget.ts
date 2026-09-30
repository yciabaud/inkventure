// Pure budget logic for check-size.ts (kept free of I/O so it can be unit tested).

export interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}

export type Manifest = Record<string, ManifestChunk>;

export interface Budgets {
  initialJsLegacy: number;
  initialJsModern: number;
  css: number;
  fontsWoff: number;
  fontsWoff2: number;
  lazyChunk: number;
  catalogShard: number;
  firstLoadLegacy: number;
}

/** Size of each built file, in bytes. */
export interface FileSize {
  raw: number;
  gzip: number;
}

export type Sizes = Record<string, FileSize>;

export interface Row {
  label: string;
  files: string[];
  bytes: number;
  measure: 'gzip' | 'raw';
  /** Budget in KiB. */
  budget: number;
  ok: boolean;
}

export const KIB = 1024;

const LEGACY_POLYFILLS = 'vite/legacy-polyfills-legacy';

function isLegacyEntry(key: string, chunk: ManifestChunk): boolean {
  return key === LEGACY_POLYFILLS || (!!chunk.isEntry && /-legacy\.html$/.test(key));
}

function isModernEntry(key: string, chunk: ManifestChunk): boolean {
  return !!chunk.isEntry && !isLegacyEntry(key, chunk) && key !== LEGACY_POLYFILLS;
}

/** Entry chunks plus everything they import statically (what the browser loads before first render). */
export function initialChunks(manifest: Manifest, legacy: boolean): string[] {
  const seen = new Set<string>();
  const visit = (key: string) => {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    for (const dep of manifest[key].imports || []) visit(dep);
  };
  for (const key of Object.keys(manifest)) {
    const chunk = manifest[key];
    if (legacy ? isLegacyEntry(key, chunk) : isModernEntry(key, chunk)) visit(key);
  }
  return Array.from(seen)
    .map((key) => manifest[key].file)
    .sort();
}

/** JS chunks loaded on demand (engines, screens): every JS file that is not part of an initial set. */
export function lazyChunks(manifest: Manifest): string[] {
  const initial = new Set(initialChunks(manifest, true).concat(initialChunks(manifest, false)));
  const files = new Set<string>();
  for (const key of Object.keys(manifest)) {
    const file = manifest[key].file;
    if (/\.js$/.test(file) && !initial.has(file)) files.add(file);
  }
  return Array.from(files).sort();
}

function total(files: string[], sizes: Sizes, measure: 'gzip' | 'raw'): number {
  return files.reduce((sum, file) => sum + (sizes[file] ? sizes[file][measure] : 0), 0);
}

function row(
  label: string,
  files: string[],
  sizes: Sizes,
  measure: 'gzip' | 'raw',
  budget: number,
): Row {
  const bytes = total(files, sizes, measure);
  return { label, files, bytes, measure, budget, ok: bytes <= budget * KIB };
}

/**
 * Builds the report. `files` lists every file in dist/ (relative paths, forward slashes).
 * Fonts: the Kindle browser is assumed to use the .woff fallback, so the Kindle first load counts .woff files.
 */
export function evaluate(
  manifest: Manifest,
  files: string[],
  sizes: Sizes,
  budgets: Budgets,
): Row[] {
  const legacyJs = initialChunks(manifest, true);
  const modernJs = initialChunks(manifest, false);
  const css = files.filter((f) => /\.css$/.test(f)).sort();
  const woff = files.filter((f) => /\.woff$/.test(f)).sort();
  const woff2 = files.filter((f) => /\.woff2$/.test(f)).sort();
  // Index shards and meta.json each get a row; the per-game details (thousands of small files) are checked together.
  const shards = files.filter((f) => /^catalog\/[^/]+\.json$/.test(f)).sort();
  const details = files.filter((f) => /^catalog\/games\/[^/]+\.json$/.test(f));

  const rows: Row[] = [
    row('Initial JS (legacy / Kindle)', legacyJs, sizes, 'gzip', budgets.initialJsLegacy),
    row('Initial JS (modern)', modernJs, sizes, 'gzip', budgets.initialJsModern),
    row('CSS', css, sizes, 'gzip', budgets.css),
    row('Fonts (.woff, Kindle)', woff, sizes, 'raw', budgets.fontsWoff),
    row('Fonts (.woff2)', woff2, sizes, 'raw', budgets.fontsWoff2),
  ];
  for (const chunk of lazyChunks(manifest)) {
    rows.push(row('Lazy chunk ' + chunk, [chunk], sizes, 'gzip', budgets.lazyChunk));
  }
  for (const shard of shards) {
    rows.push(row('Catalogue ' + shard, [shard], sizes, 'raw', budgets.catalogShard));
  }
  if (details.length) {
    const largest = details.reduce((max, f) => (sizes[f].raw > sizes[max].raw ? f : max));
    rows.push(row('Largest catalogue game detail', [largest], sizes, 'raw', budgets.catalogShard));
  }
  const firstLoad = rows[0].bytes + rows[2].bytes + rows[3].bytes;
  rows.push({
    label: 'First load (Kindle: legacy JS + CSS + .woff)',
    files: legacyJs.concat(css, woff),
    bytes: firstLoad,
    measure: 'gzip',
    budget: budgets.firstLoadLegacy,
    ok: firstLoad <= budgets.firstLoadLegacy * KIB,
  });
  return rows;
}

function kib(bytes: number): string {
  return (bytes / KIB).toFixed(1) + ' KiB';
}

export function toMarkdown(rows: Row[]): string {
  const lines = ['| Asset | Size | Budget | Status |', '|---|---:|---:|:---:|'];
  for (const r of rows) {
    const measure = r.measure === 'gzip' ? ' gz' : '';
    lines.push(
      `| ${r.label} | ${kib(r.bytes)}${measure} | ${r.budget} KiB | ${r.ok ? '✅' : '❌ over'} |`,
    );
  }
  return lines.join('\n');
}
