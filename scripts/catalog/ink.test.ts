import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { RawDataset, RawGame } from './crawler';
import type { GameRecord } from './ifdb';
import {
  exportsToInspect,
  inkKey,
  inkStoryFrom,
  inspectExport,
  isFresh,
  pageScripts,
  storyInZip,
  type FetchBytes,
} from './ink';

const JSON_TEXT = readFileSync('tests/fixtures/ink/lamp.json', 'utf8').replace(/^\uFEFF/, '');
const STORY_JS = 'var storyContent = ' + JSON_TEXT + ';';
const PAGE =
  '<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"></head><body>' +
  '<script src="ink.js"></script><script src="The Tide.js"></script><script src="main.js"></script></body></html>';
const NOW = new Date('2026-10-01T00:00:00.000Z');

function zip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const name of Object.keys(files)) entries[name] = strToU8(files[name]);
  return zipSync(entries);
}

function unzipped(files: Record<string, string>): Record<string, Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  for (const name of Object.keys(files)) entries[name] = strToU8(files[name]);
  return entries;
}

describe("a web export's scripts", () => {
  it('lists the scripts a page loads from its own files, in order, without the ink runtime', () => {
    const html =
      '<script src="ink.js"></script><script src=\'Him (and Us)/dialogue.js\'></script>' +
      '<script type="text/javascript" src=story.js></script><script src="js/ink-full.min.js"></script>' +
      '<script src="https://cdn.example/jquery.js"></script><script src="//cdn.example/x.js"></script>' +
      '<script src="/root.js"></script><script>var inline = 1;</script><script src="main.js"></script>';
    expect(pageScripts(html)).toEqual(['Him (and Us)/dialogue.js', 'story.js', 'main.js']);
  });
});

describe('the story in a zipped export', () => {
  it('follows the page IFDB names to the script holding the story, whatever its name', () => {
    const files = { 'Tide/index.html': PAGE, 'Tide/The Tide.js': STORY_JS, 'Tide/main.js': '' };
    expect(storyInZip(unzipped(files), 'Tide/index.html')).toBe('Tide/The Tide.js');
    // IFDB names the page without its folder, or in another case.
    expect(storyInZip(unzipped(files), 'index.html')).toBe('Tide/The Tide.js');
    expect(storyInZip(unzipped(files), 'tide/INDEX.html')).toBe('Tide/The Tide.js');
  });

  it('resolves the script from the folder of the page, with %20 and ../', () => {
    const page = PAGE.replace('The Tide.js', '../js/The%20Tide.js');
    const files = { 'Tide/web/index.html': page, 'Tide/js/The Tide.js': STORY_JS };
    expect(storyInZip(unzipped(files), 'Tide/web/index.html')).toBe('Tide/js/The Tide.js');
  });

  it('takes the file IFDB names when it holds the story: inline, a script or a compiled .json', () => {
    const inline =
      '<html><body><script>var storyContent = ' + JSON_TEXT + ';</script></body></html>';
    expect(storyInZip(unzipped({ 'a/index.html': inline }), 'a/index.html')).toBe('a/index.html');
    expect(storyInZip(unzipped({ 'a/story.js': STORY_JS }), 'a/story.js')).toBe('a/story.js');
    expect(storyInZip(unzipped({ 'a/tide.json': JSON_TEXT }), 'a/tide.json')).toBe('a/tide.json');
  });

  it('finds none without a story, or without the page IFDB names', () => {
    const files = { 'Tide/index.html': PAGE, 'Tide/The Tide.js': 'console.log(1)' };
    expect(storyInZip(unzipped(files), 'Tide/index.html')).toBeNull();
    expect(storyInZip(unzipped({ 'a/index.html': PAGE, 'b/index.html': PAGE }), 'index.html')).toBe(
      null,
    );
    expect(storyInZip(unzipped({ 'Tide/The Tide.js': STORY_JS }), 'Tide/index.html')).toBeNull();
    // A script outside the zip.
    const out = PAGE.replace('The Tide.js', '../../The Tide.js');
    expect(
      storyInZip(unzipped({ 'Tide/index.html': out, 'The Tide.js': STORY_JS }), 'Tide/index.html'),
    ).toBe(null);
  });
});

describe('opening an export', () => {
  function host(files: Record<string, { status?: number; body: Uint8Array | string }>) {
    const asked: string[] = [];
    const fetchBytes: FetchBytes = async (url) => {
      asked.push(url);
      const file = files[url];
      if (!file) return { status: 404, bytes: new Uint8Array(0) };
      return {
        status: file.status || 200,
        bytes: typeof file.body === 'string' ? strToU8(file.body) : file.body,
      };
    };
    return { asked, fetchBytes };
  }

  it('records the path of the story in a zip', async () => {
    const url = 'https://ifarchive.org/if-archive/games/ink/tide.zip';
    const { fetchBytes } = host({
      [url]: { body: zip({ 'Tide/index.html': PAGE, 'Tide/The Tide.js': STORY_JS }) },
    });
    expect(await inspectExport({ url: url, primary: 'Tide/index.html' }, fetchBytes, NOW)).toEqual({
      checked: NOW.toISOString(),
      story: 'Tide/The Tide.js',
    });
  });

  it("records the URL of a page's script holding the story, or of the page itself", async () => {
    const base = 'https://abc.unbox.ifarchive.org/abc/Tide/';
    const { asked, fetchBytes } = host({
      [base + 'index.html']: { body: PAGE },
      [base + 'The%20Tide.js']: { body: STORY_JS },
    });
    expect(await inspectExport({ url: base + 'index.html' }, fetchBytes, NOW)).toEqual({
      checked: NOW.toISOString(),
      story: base + 'The%20Tide.js',
    });
    // The ink runtime is not downloaded.
    expect(asked).toEqual([base + 'index.html', base + 'The%20Tide.js']);
    const inline = 'https://author.example/tide.html';
    const page = host({
      [inline]: { body: '<script>const storyContent = ' + JSON_TEXT + '</script>' },
    });
    expect((await inspectExport({ url: inline }, page.fetchBytes, NOW)).story).toBe(inline);
  });

  it('says why there is no story; a server error is checked again next time', async () => {
    const url = 'https://ifarchive.org/if-archive/games/ink/x.zip';
    const none = host({ [url]: { body: zip({ 'index.html': PAGE }) } });
    expect(await inspectExport({ url: url, primary: 'index.html' }, none.fetchBytes, NOW)).toEqual({
      checked: NOW.toISOString(),
      detail: 'no ink story',
    });
    const broken = host({ [url]: { body: 'not a zip' } });
    expect(
      (await inspectExport({ url: url, primary: 'index.html' }, broken.fetchBytes, NOW)).detail,
    ).toBe('not a zip');
    const down = host({ [url]: { status: 503, body: '' } });
    const entry = await inspectExport({ url: url, primary: 'index.html' }, down.fetchBytes, NOW);
    expect(entry).toEqual({ checked: NOW.toISOString(), detail: 'HTTP 503', transient: true });
    expect(isFresh(entry, NOW)).toBe(false);
    expect(isFresh({ checked: NOW.toISOString(), detail: 'no ink story' }, NOW)).toBe(true);
    expect(isFresh({ checked: '2026-01-01T00:00:00.000Z', story: 'a.js' }, NOW)).toBe(false);
  });
});

describe('the exports to open', () => {
  const game = (tuid: string, devsys: string, links: unknown[]): RawGame => ({
    tuid: tuid,
    pageVersion: 1,
    queries: [],
    search: { tuid: tuid, title: tuid, link: '', author: '', hasCoverArt: false, devsys: devsys },
    record: { ifdb: { tuid: tuid, pageversion: 1, downloads: { links: links } } } as GameRecord,
  });

  it('lists the zips and pages of ink games, each once, with their keys and stories', () => {
    const zipLink = {
      url: 'http://www.ifarchive.org/if-archive/games/ink/tide.zip',
      format: 'hypertextgame',
      compression: 'zip',
      compressedPrimary: 'tide/index.html',
    };
    const dataset: RawDataset = {
      source: 'test',
      queries: [],
      games: [
        game('a', 'Ink', [
          zipLink,
          { url: 'https://a.itch.io/tide', format: 'hypertextgame' },
          { url: 'https://author.example/tide/', format: 'hypertextgame' },
          { url: 'https://author.example/tide.json' },
        ]),
        game('b', 'ink', [
          zipLink,
          { url: 'http://author.example/tide.html', format: 'hypertextgame' },
        ]),
        game('c', 'Twine 2', [
          { url: 'https://author.example/twine.html', format: 'hypertextgame' },
        ]),
      ],
    };
    const links = exportsToInspect(dataset);
    expect(links).toEqual([
      { url: 'https://author.example/tide/' },
      {
        url: 'https://www.ifarchive.org/if-archive/games/ink/tide.zip',
        primary: 'tide/index.html',
      },
    ]);
    expect(inkKey(links[1])).toBe(
      'https://www.ifarchive.org/if-archive/games/ink/tide.zip#tide/index.html',
    );
    const story = inkStoryFrom({
      [inkKey(links[1])]: { checked: NOW.toISOString(), story: 'tide/tide.js' },
      [inkKey(links[0])]: { checked: NOW.toISOString(), detail: 'no ink story' },
    });
    expect(story(links[1])).toBe('tide/tide.js');
    expect(story(links[0])).toBeNull();
    expect(story({ url: 'https://unknown.example/' })).toBeNull();
  });
});
