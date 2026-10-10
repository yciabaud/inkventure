// The app's Service Worker (SPEC §6.2; story S5.3), dist/sw.js: the template src/sw/sw.js with the precache list of
// this build, generated from Vite's manifest. The shell (page, JS and CSS bundles, modern and legacy, fonts, the French
// dictionary and the other small chunks the app loads on demand) is cached when the worker installs; each engine's
// chunks only when an adventure of its format is kept offline.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import type { Manifest } from '../size/budget.ts';

export interface Precache {
  /** Changes with every build: names the cache, so a new build gets a new one. */
  version: string;
  /** Paths relative to the app's folder; `./` is the page. */
  shell: string[];
  /** Each engine kind's chunks (and the chunks only they import). */
  engines: Record<string, string[]>;
}

/** Engine kinds (src/engines/engine.ts EngineKind) by the folder of their code; Twine's reader is its engine. */
const ENGINE_SOURCES: Array<[RegExp, string]> = [
  [/^src\/engines\/zvm\//, 'zmachine'],
  [/^src\/engines\/quixe\//, 'glulx'],
  [/^src\/engines\/ink\//, 'ink'],
  [/^src\/engines\/twine\/|^_?TwineReader[-.]|\/TwineReader\./, 'twine'],
  [
    /^src\/engines\/decker\/|^_?DeckerReader[-.]|\/DeckerReader\.|^virtual:decker-runtime/,
    'decker',
  ],
];

/** The Decker runtime's scripts (S1.29): assets the Decker reader fetches, not chunks, so not in the manifest. */
const DECKER_RUNTIME = /^assets\/decker-(lil|ui)-[^/]+\.js$/;

const FONT = /\.(woff2?)$/;

function engineOf(key: string, src?: string): string | undefined {
  for (const [pattern, kind] of ENGINE_SOURCES) {
    if (pattern.test(key) || (src && pattern.test(src))) return kind;
  }
  return undefined;
}

/** The chunk `key` and every chunk it imports statically, as manifest keys. */
function closure(manifest: Manifest, key: string, seen: Set<string> = new Set()): Set<string> {
  if (seen.has(key) || !manifest[key]) return seen;
  seen.add(key);
  for (const dep of manifest[key].imports || []) closure(manifest, dep, seen);
  return seen;
}

function filesOf(manifest: Manifest, chunkKeys: Iterable<string>): string[] {
  const files = new Set<string>();
  for (const key of chunkKeys) {
    const chunk = manifest[key];
    files.add(chunk.file);
    for (const css of chunk.css || []) files.add(css);
  }
  return Array.from(files);
}

/**
 * The shell and the engines' chunks of a build, from its manifest. Entries (modern and legacy, with the polyfills) and
 * what they import make the shell, with the fonts; every chunk loaded on demand joins it too, unless it belongs to an
 * engine. Other assets (the test stories the demo imports) are left to the network.
 */
export function precacheList(manifest: Manifest, files: string[] = []): Omit<Precache, 'version'> {
  const shellKeys = new Set<string>();
  const engineKeys: Record<string, Set<string>> = {};
  const fonts = new Set<string>();
  for (const key of Object.keys(manifest)) {
    const chunk = manifest[key];
    if (FONT.test(chunk.file)) fonts.add(chunk.file);
    if (!/\.js$/.test(chunk.file) || !(chunk.isEntry || chunk.isDynamicEntry)) continue;
    const kind = chunk.isEntry ? undefined : engineOf(key, chunk.src);
    if (kind) {
      if (!engineKeys[kind]) engineKeys[kind] = new Set();
      closure(manifest, key, engineKeys[kind]);
    } else {
      closure(manifest, key, shellKeys);
    }
  }
  const shell = ['./'].concat(filesOf(manifest, shellKeys).sort(), Array.from(fonts).sort());
  const engines: Record<string, string[]> = {};
  for (const kind of Object.keys(engineKeys).sort()) {
    // What the shell already holds is not cached twice.
    engines[kind] = filesOf(manifest, engineKeys[kind])
      .concat(kind === 'decker' ? files.filter((file) => DECKER_RUNTIME.test(file)) : [])
      .filter((file) => shell.indexOf(file) < 0)
      .sort();
  }
  return { shell: shell, engines: engines };
}

/** A short hash of the list and the page (whose build meta tag changes with every build). */
export function precacheVersion(list: Omit<Precache, 'version'>, page: string): string {
  return createHash('sha256').update(JSON.stringify(list)).update(page).digest('hex').slice(0, 12);
}

const PLACEHOLDER = 'var PRECACHE = self.__PRECACHE__;';

/** The worker's source: the template with the list in place of its placeholder (exactly one). */
export function serviceWorkerSource(template: string, precache: Precache): string {
  const at = template.indexOf(PLACEHOLDER);
  if (at < 0 || template.indexOf(PLACEHOLDER, at + 1) >= 0) {
    throw new Error('sw.js needs exactly one "' + PLACEHOLDER + '"');
  }
  return template.replace(PLACEHOLDER, 'var PRECACHE = ' + JSON.stringify(precache) + ';');
}

/** Vite plugin: writes dist/sw.js once the bundle (and its manifest) is written. */
export function serviceWorkerPlugin(template = 'src/sw/sw.js'): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'inkventure-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const manifest = JSON.parse(
        readFileSync(join(outDir, '.vite', 'manifest.json'), 'utf8'),
      ) as Manifest;
      const assets = readdirSync(join(outDir, 'assets')).map((name) => 'assets/' + name);
      const list = precacheList(manifest, assets);
      const page = readFileSync(join(outDir, 'index.html'), 'utf8');
      const precache: Precache = { version: precacheVersion(list, page), ...list };
      const source = readFileSync(resolve(config.root, template), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource(source, precache));
    },
  };
}
