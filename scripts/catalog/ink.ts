// Ink games published as web exports (SPEC §5.2 step 2; story S2.7). Authors of ink games rarely publish the compiled
// story (`.json`); they publish Inky's web export: an `index.html` with `ink.js`, `main.js` and the story in a script
// (`var storyContent = {…};`), named after the project more often than `story.js`, zipped or as a page. The weekly
// build opens each export once (a zip from the IF Archive, a page and its scripts elsewhere) and records which file
// holds the story; the resolver then points the game at it. Results are cached per link, like the Blorb checks.
import { strFromU8, unzipSync } from 'fflate';
import { inkStoryJson } from '../../src/catalog/inkStory.ts';
import type { RawDataset } from './crawler.ts';
import { linkFormat, secureUrl } from './resolver.ts';

export { inkStoryJson };

/** A check is reused this long; exports seldom change. */
export const INK_MAX_AGE_DAYS = 90;

/** An export bigger than this is not opened (a game shipped with its music, or a desktop build). */
export const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

export interface InkEntry {
  /** Date of the check (ISO). */
  checked: string;
  /** Where the story is: its path in the zip, or the URL of the page or script that holds it. */
  story?: string;
  /** Why there is no story: none in the export, an HTTP error… */
  detail?: string;
  /** A network or server error: checked again at the next run. */
  transient?: boolean;
}

/** Export link (`inkKey`) → last check. Kept on the `catalog` branch with the record cache. */
export type InkCache = Record<string, InkEntry>;

/** A web export to open: a zip (with the file IFDB names in it) or a page. */
export interface InkExport {
  url: string;
  primary?: string;
}

/** The cache key of an export: its URL, and the file IFDB names in a zip. */
export function inkKey(link: InkExport): string {
  return link.primary ? link.url + '#' + link.primary : link.url;
}

/** Whether a cached check is recent enough to reuse. */
export function isFresh(entry: InkEntry | undefined, now: Date): boolean {
  if (!entry || entry.transient) return false;
  const age = now.getTime() - new Date(entry.checked).getTime();
  return age >= 0 && age < INK_MAX_AGE_DAYS * 24 * 3600 * 1000;
}

/** Scripts a page loads from its own files, in order (absolute URLs and the ink runtime left out). */
export function pageScripts(html: string): string[] {
  const scripts: string[] = [];
  const pattern = /<script\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const src = (match[1] ?? match[2] ?? match[3]).trim();
    if (!src || /^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(src)) continue;
    if (/(^|\/)ink(-full)?(\.min)?\.js$/i.test(src.split(/[?#]/)[0])) continue;
    scripts.push(src);
  }
  return scripts;
}

/** `ref` relative to the file at `base` (a path in a zip), without `./` and `..`; null when it leaves the zip. */
function joinPath(base: string, ref: string): string | null {
  const parts = base.split('/').slice(0, -1);
  let decoded: string;
  try {
    decoded = decodeURI(ref.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  for (const part of decoded.split('/')) {
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

function holdsStory(bytes: Uint8Array | undefined): boolean {
  return !!bytes && inkStoryJson(strFromU8(bytes)) !== null;
}

/**
 * The path of the file holding the story in an unzipped export: the file IFDB names (a compiled `.json`, a script, or
 * a page with the story inline), else the first of the page's own scripts that holds it. Names are matched without
 * case, and the file IFDB names may be in another folder when it is the only one of its name (as for other zips).
 */
export function storyInZip(entries: Record<string, Uint8Array>, primary: string): string | null {
  const names = Object.keys(entries);
  const lower: Record<string, string> = {};
  for (const name of names) lower[name.toLowerCase()] = name;
  let page: string | undefined = lower[primary.toLowerCase()];
  if (!page) {
    const base = primary.slice(primary.lastIndexOf('/') + 1).toLowerCase();
    const named = names.filter(
      (name) => name.slice(name.lastIndexOf('/') + 1).toLowerCase() === base,
    );
    if (named.length !== 1) return null;
    page = named[0];
  }
  if (holdsStory(entries[page])) return page;
  if (!/\.html?$/i.test(page)) return null;
  for (const src of pageScripts(strFromU8(entries[page]))) {
    const path = joinPath(page, src);
    const found = path !== null ? lower[path.toLowerCase()] : undefined;
    if (found && holdsStory(entries[found])) return found;
  }
  return null;
}

/** One GET, the whole body. */
export type FetchBytes = (url: string) => Promise<{ status: number; bytes: Uint8Array }>;

function failure(response: { status: number }, checked: string): InkEntry {
  const entry: InkEntry = { checked: checked, detail: 'HTTP ' + response.status };
  if (response.status >= 500 || response.status === 429) entry.transient = true;
  return entry;
}

/** Opens an export and finds its story. */
export async function inspectExport(
  link: InkExport,
  fetchBytes: FetchBytes,
  now: Date,
): Promise<InkEntry> {
  const checked = now.toISOString();
  const response = await fetchBytes(link.url);
  if (response.status !== 200) return failure(response, checked);
  if (link.primary) {
    if (response.bytes.length > MAX_EXPORT_BYTES) return { checked: checked, detail: 'too large' };
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(response.bytes, {
        filter: (file) => /\.(html?|js|json)$/i.test(file.name),
      });
    } catch {
      return { checked: checked, detail: 'not a zip' };
    }
    const story = storyInZip(entries, link.primary);
    return story
      ? { checked: checked, story: story }
      : { checked: checked, detail: 'no ink story' };
  }
  const html = strFromU8(response.bytes);
  if (inkStoryJson(html) !== null) return { checked: checked, story: link.url };
  for (const src of pageScripts(html)) {
    const url = new URL(src, link.url).toString();
    const script = await fetchBytes(url);
    if (script.status !== 200) continue;
    if (holdsStory(script.bytes)) return { checked: checked, story: url };
  }
  return { checked: checked, detail: 'no ink story' };
}

/** The resolver's `inkStory` for a cache: where the story of an export is, or null when it has none or is unchecked. */
export function inkStoryFrom(cache: InkCache): (link: InkExport) => string | null {
  return (link) => {
    const entry = cache[inkKey(link)];
    return entry && entry.story ? entry.story : null;
  };
}

/** The web exports of the ink games of a dataset, each once, sorted by key: the links `check-ink.ts` opens. */
export function exportsToInspect(dataset: RawDataset): InkExport[] {
  const found: Record<string, InkExport> = {};
  for (const game of dataset.games) {
    const devsys = game.search.devsys || '';
    const downloads = game.record.ifdb.downloads;
    const links = ((downloads && downloads.links) || []) as Array<{
      url: string;
      format?: string;
      compression?: string;
      compressedPrimary?: string;
    }>;
    for (const link of links) {
      if (!link.url) continue;
      const detected = linkFormat(link, devsys);
      if (!detected || !detected.inkExport) continue;
      if (link.compression && !(link.compression === 'zip' && link.compressedPrimary)) continue;
      const url = secureUrl(link.url);
      if (!url) continue;
      const item: InkExport = link.compression
        ? { url: url, primary: link.compressedPrimary }
        : { url: url };
      found[inkKey(item)] = item;
    }
  }
  return Object.keys(found)
    .sort()
    .map((key) => found[key]);
}
