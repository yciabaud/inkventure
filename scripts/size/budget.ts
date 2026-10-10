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
  /** The baseline Kindle's first load: modern JS + CSS + .woff2 (S0.3 measured both, S0.10). */
  firstLoad: number;
  /** Old e-readers' first load: legacy JS + CSS + .woff (best effort, SPEC §2.2). */
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

/** The app's Service Worker, counted as initial JS of the modern bundle. */
export const SERVICE_WORKER = 'sw.js';

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
 * The baseline Kindle loads the modern bundle and the .woff2 fonts (measured in S0.3, SPEC §2.2); old e-readers load
 * the legacy bundle and the .woff fallback. Each gets a first-load row (S0.10).
 */
export function evaluate(
  manifest: Manifest,
  files: string[],
  sizes: Sizes,
  budgets: Budgets,
): Row[] {
  // The Service Worker (S5.3) counts with the modern bundle: a browser that needs the legacy one (no ES modules) has
  // in practice no Service Worker either.
  const worker = files.indexOf(SERVICE_WORKER) >= 0 ? [SERVICE_WORKER] : [];
  const legacyJs = initialChunks(manifest, true);
  const modernJs = initialChunks(manifest, false).concat(worker);
  const css = files.filter((f) => /\.css$/.test(f)).sort();
  const woff = files.filter((f) => /\.woff$/.test(f)).sort();
  const woff2 = files.filter((f) => /\.woff2$/.test(f)).sort();
  // Index shards and meta.json each get a row; the per-game details (thousands of small files) are checked together.
  const shards = files.filter((f) => /^catalog\/[^/]+\.json$/.test(f)).sort();
  const details = files.filter((f) => /^catalog\/games\/[^/]+\.json$/.test(f));

  const rows: Row[] = [
    row('Initial JS (legacy, old e-readers)', legacyJs, sizes, 'gzip', budgets.initialJsLegacy),
    row('Initial JS (modern, Kindle)', modernJs, sizes, 'gzip', budgets.initialJsModern),
    row('CSS', css, sizes, 'gzip', budgets.css),
    row('Fonts (.woff, old e-readers)', woff, sizes, 'raw', budgets.fontsWoff),
    row('Fonts (.woff2, Kindle)', woff2, sizes, 'raw', budgets.fontsWoff2),
  ];
  for (const chunk of lazyChunks(manifest)) {
    rows.push(row('Lazy chunk ' + chunk, [chunk], sizes, 'gzip', budgets.lazyChunk));
  }
  // The Decker runtime's scripts (S1.29) are assets the Decker reader fetches, not chunks: budgeted as lazy chunks.
  for (const script of files.filter((f) => /^assets\/decker-(lil|ui)-[^/]+\.js$/.test(f)).sort()) {
    rows.push(row('Lazy chunk ' + script, [script], sizes, 'gzip', budgets.lazyChunk));
  }
  for (const shard of shards) {
    rows.push(row('Catalogue ' + shard, [shard], sizes, 'raw', budgets.catalogShard));
  }
  if (details.length) {
    const largest = details.reduce((max, f) => (sizes[f].raw > sizes[max].raw ? f : max));
    rows.push(row('Largest catalogue game detail', [largest], sizes, 'raw', budgets.catalogShard));
  }
  rows.push(
    firstLoad(
      'First load (Kindle: modern JS + CSS + .woff2)',
      [rows[1], rows[2], rows[4]],
      budgets.firstLoad,
    ),
    firstLoad(
      'First load (old e-readers: legacy JS + CSS + .woff)',
      [rows[0], rows[2], rows[3]],
      budgets.firstLoadLegacy,
    ),
  );
  return rows;
}

/** A first-load row: the sum of `parts` (JS, CSS, fonts) against `budget`. */
function firstLoad(label: string, parts: Row[], budget: number): Row {
  let bytes = 0;
  let files: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    bytes += parts[i].bytes;
    files = files.concat(parts[i].files);
  }
  return { label, files, bytes, measure: 'gzip', budget, ok: bytes <= budget * KIB };
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
