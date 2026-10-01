// TEMPORARY (S2.7 first step): counts the crawled ink games and what their links hold. Removed before merge.
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { searchAll } from '../../scripts/catalog/crawler.ts';
import {
  liveFetcher,
  withRetries,
  RateLimiter,
  USER_AGENT,
} from '../../scripts/catalog/fetcher.ts';
import { parseViewgame } from '../../scripts/catalog/ifdb.ts';

const fetcher = withRetries(liveFetcher(new RateLimiter(1000)), { retries: 3, baseDelay: 2000 });
const summary = process.env.GITHUB_STEP_SUMMARY;
const out = (line: string) => {
  console.log(line);
  if (summary) appendFileSync(summary, line + '\n');
};

const rows = await searchAll(fetcher, 'downloadable:yes system:ink');
const systems = new Map<string, number>();
for (const r of rows) systems.set(r.devsys, (systems.get(r.devsys) || 0) + 1);
out('## Ink probe\n\nSearch rows: ' + rows.length + '\n');
out('| devsys | games |\n|---|---|');
for (const [d, n] of [...systems].sort((a, b) => b[1] - a[1])) out('| ' + d + ' | ' + n + ' |');

const INK = /ink/i;
const games = rows.filter((r) => INK.test(r.devsys));
out('\nGames with an ink / inkle / inky system: ' + games.length + '\n');

const files = new Map<string, number>();
const tally = (k: string) => files.set(k, (files.get(k) || 0) + 1);
const archive = new RateLimiter(1000);

async function get(url: string, origin = false) {
  await archive.wait();
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (origin) headers.Origin = 'https://yciabaud.github.io';
  const r = await fetch(url, { headers, redirect: 'follow' });
  return {
    status: r.status,
    cors: r.headers.get('access-control-allow-origin'),
    bytes: new Uint8Array(await r.arrayBuffer()),
  };
}

const STORY = /\b(?:var|let|const)\s+storyContent\s*=\s*\{/;
function inspectText(name: string, text: string): string[] {
  const found: string[] = [];
  if (STORY.test(text)) found.push('storyContent in ' + name + ' (' + text.length + ' B)');
  if (/\.json$/i.test(name) && /"inkVersion"\s*:/.test(text))
    found.push('compiled json ' + name + ' (' + text.length + ' B)');
  if (/\.html?$/i.test(name)) {
    const scripts = [...text.matchAll(/<script[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(
      (m) => m[1],
    );
    if (scripts.length) found.push(name + ' scripts: ' + scripts.join(', '));
  }
  if (/bindExternalFunction|BindExternalFunction/.test(text))
    found.push('external functions in ' + name);
  return found;
}

const perGame: string[] = [];
let n = 0;
for (const row of games) {
  n++;
  const cached = 'catalog-data/cache/viewgame/' + row.tuid + '.json';
  let record;
  if (existsSync(cached)) record = JSON.parse(readFileSync(cached, 'utf8')).record;
  else {
    const res = await fetcher('https://ifdb.org/viewgame?json&id=' + row.tuid);
    record = parseViewgame(res.body, row.tuid);
  }
  const links = (record.ifdb.downloads && record.ifdb.downloads.links) || [];
  const notes: string[] = [];
  const kinds = new Set<string>();
  for (const link of links as Array<Record<string, string>>) {
    if (!link.url) continue;
    let host = '';
    try {
      host = new URL(link.url).hostname;
    } catch {
      /* bad url */
    }
    const name = (link.compressedPrimary || link.url).split(/[?#]/)[0];
    let kind: string;
    if (/\.json$/i.test(name)) kind = 'json';
    else if (link.compression) kind = 'zip';
    else if (/itch\.io$/i.test(host)) kind = 'itch.io';
    else if (/inklestudios\.com$|inklewriter\.com$/i.test(host)) kind = 'inklewriter';
    else if (link.format === 'hypertextgame' || /\.html?$/i.test(name) || /\/$/.test(link.url))
      kind = 'html page';
    else kind = 'other (' + (link.format || '?') + ')';
    const onArchive = /(^|\.)ifarchive\.org$/i.test(host);
    kind += onArchive ? ' @archive' : '';
    kinds.add(kind);
    tally('link: ' + kind);
    try {
      if (kind === 'zip @archive') {
        const res = await get(link.url.replace(/^http:/, 'https:'));
        if (res.status !== 200) {
          notes.push('zip HTTP ' + res.status);
          continue;
        }
        const zip = unzipSync(res.bytes);
        const found: string[] = [];
        for (const [entry, data] of Object.entries(zip)) {
          if (/\.(js|json|html?)$/i.test(entry) && !/(^|\/)ink(\.min)?\.js$/i.test(entry)) {
            const text = strFromU8(data);
            for (const f of inspectText(entry, text)) found.push(f);
          }
        }
        const has = found.some((f) => /storyContent|compiled json/.test(f));
        tally(has ? 'zip @archive: story found' : 'zip @archive: NO story');
        notes.push(
          'primary=' +
            link.compressedPrimary +
            ' ' +
            Object.keys(zip).length +
            ' entries; ' +
            found.join('; '),
        );
      } else if (kind === 'html page' || kind === 'html page @archive' || kind === 'json') {
        const res = await get(link.url, true);
        const text = strFromU8(res.bytes);
        const found = inspectText(kind === 'json' ? 'file.json' : 'page.html', text);
        const cors = res.cors ? 'CORS ' + res.cors : 'no CORS';
        let story = found.some((f) => /storyContent|compiled json/.test(f));
        const src = /<script[^>]*\bsrc\s*=\s*["']([^"']*story[^"']*\.js)["']/i.exec(text);
        if (!story && src) {
          const js = await get(new URL(src[1], link.url).href, true);
          const t = strFromU8(js.bytes);
          if (STORY.test(t)) {
            story = true;
            found.push(
              src[1] +
                ' has storyContent (' +
                t.length +
                ' B, ' +
                (js.cors ? 'CORS' : 'no CORS') +
                ')',
            );
          }
        }
        tally(
          kind + ': ' + (story ? 'story' : 'no story') + ', ' + (res.cors ? 'CORS' : 'no CORS'),
        );
        notes.push(kind + ' HTTP ' + res.status + ' ' + cors + '; ' + found.join('; '));
      }
    } catch (e) {
      notes.push(kind + ' error ' + String(e));
    }
  }
  perGame.push(
    '- **' +
      row.title +
      '** (' +
      row.tuid +
      ', ' +
      row.devsys +
      '): ' +
      [...kinds].join(', ') +
      (notes.length ? '\n  - ' + notes.join('\n  - ') : ''),
  );
  if (n % 20 === 0) console.log('…', n, '/', games.length);
}

out('\n| links | count |\n|---|---|');
for (const [k, v] of [...files].sort()) out('| ' + k + ' | ' + v + ' |');
out('\n### Games\n');
for (const line of perGame) out(line);
