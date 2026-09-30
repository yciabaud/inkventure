// Catalogue loader (SPEC §5.2, client side; story S3.1): meta.json, then every index shard, over XHR (the Kindle
// browser's baseline). Loaded once per session and kept in memory.
import type { IndexRow, Meta } from '../../scripts/catalog/emitter';
import { searchKey } from './search';

export type { IndexRow, Meta };

/** Catalogue format this app reads (scripts/catalog/emitter.ts CATALOG_VERSION). */
export const SUPPORTED_VERSION = 1;

/** Relative to the page, so the app works under any path (project site, PR previews). */
export const CATALOG_BASE = 'catalog/';

export interface Catalog {
  meta: Meta;
  /** Every row, in index order (sorted by title). */
  rows: IndexRow[];
  /** Normalised title + author of each row, for search. */
  keys: string[];
}

export type Progress = (loaded: number, total: number) => void;

/** GET `url` as JSON. Status 0 counts as success for file:// pages. */
export function getJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 200 && xhr.status !== 0) {
        reject(new Error('HTTP ' + xhr.status + ' for ' + url));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error('Invalid JSON: ' + url));
      }
    };
    xhr.send();
  });
}

/** Loads meta.json and the shards one after the other (gentler on e-reader memory and Wi-Fi than in parallel). */
export function fetchCatalog(base: string = CATALOG_BASE, onProgress?: Progress): Promise<Catalog> {
  return getJson(base + 'meta.json').then((data) => {
    const meta = data as Meta;
    if (!meta || meta.version !== SUPPORTED_VERSION || !meta.shards) {
      throw new Error('Unsupported catalogue');
    }
    const rows: IndexRow[] = [];
    const total = meta.shards.length;
    if (onProgress) onProgress(0, total);
    let chain: Promise<void> = Promise.resolve();
    meta.shards.forEach((shard, i) => {
      chain = chain.then(() =>
        getJson(base + shard).then((content) => {
          const shardRows = (content as { rows?: IndexRow[] }).rows || [];
          for (let r = 0; r < shardRows.length; r++) rows.push(shardRows[r]);
          if (onProgress) onProgress(i + 1, total);
        }),
      );
    });
    return chain
      .then(() => markStarters(base, rows))
      .then(() => ({ meta: meta, rows: rows, keys: rows.map(searchKey) }));
  });
}

/**
 * Flags the "Start here" games of `featured.json` (curated starters, SPEC §5.3) in `rows`; the index already flags
 * the games tagged newcomer-friendly. Optional: without the file, only the tagged games are starters.
 */
function markStarters(base: string, rows: IndexRow[]): Promise<void> {
  return getJson(base + 'featured.json').then(
    (content) => {
      const locales = (content as { locales?: Record<string, Array<{ t: string; st?: 1 }>> })
        .locales;
      if (!locales) return;
      const starters: Record<string, boolean> = {};
      for (const locale in locales) {
        const list = locales[locale] || [];
        for (let i = 0; i < list.length; i++) if (list[i].st) starters[list[i].t] = true;
      }
      for (let i = 0; i < rows.length; i++) if (starters[rows[i].t]) rows[i].st = 1;
    },
    () => undefined,
  );
}

let cached: Promise<Catalog> | null = null;
let listeners: Progress[] = [];

/** The catalogue, loaded on first use and then shared; a failed load is retried by the next call. */
export function loadCatalog(onProgress?: Progress): Promise<Catalog> {
  if (onProgress) listeners.push(onProgress);
  if (!cached) {
    cached = fetchCatalog(CATALOG_BASE, (loaded, total) => {
      for (let i = 0; i < listeners.length; i++) listeners[i](loaded, total);
    });
    cached.then(
      () => (listeners = []),
      () => {
        cached = null;
        listeners = [];
      },
    );
  }
  return cached;
}

/** For tests: forget the loaded catalogue. */
export function resetCatalog(): void {
  cached = null;
  listeners = [];
}
