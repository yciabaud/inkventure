import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryBackend } from '../storage/backend';
import { cacheFile } from '../storage/files';
import { keys } from '../storage/keys';
import { createStore } from '../storage/store';
import {
  download,
  extractPrimary,
  extractTwine,
  fetchStory,
  isStoryFileError,
  MAX_STORY_FILES_BYTES,
  storyData,
  type StoryFileError,
} from './storyFile';

/** A minimal Z-machine story: version 5, then padding. */
const STORY = new Uint8Array(128).fill(1);
STORY[0] = 5;

const URL_Z = 'https://ifarchive.org/if-archive/games/zcode/lamp.z5';
const URL_ZIP = 'https://ifarchive.org/if-archive/games/zcode/hollow.zip';

type Reply =
  | { status: number; body?: Uint8Array; chunks?: number; total?: boolean }
  | { error: true }
  | { stall: true };

/** A fake XMLHttpRequest answering `reply` on send(), with progress events. */
function fakeXhr(reply: Reply, log: string[] = []) {
  return () => {
    const xhr = {
      status: 0,
      response: null as ArrayBuffer | null,
      responseType: '',
      onprogress: null as ((e: ProgressEvent) => void) | null,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      open: (method: string, url: string) => log.push(method + ' ' + url),
      abort: () => log.push('abort'),
      send: () => {
        if ('stall' in reply) return;
        setTimeout(() => {
          if ('error' in reply) {
            xhr.onerror!();
            return;
          }
          const body = reply.body || new Uint8Array(0);
          const chunks = reply.chunks || 1;
          for (let i = 1; i <= chunks; i++) {
            xhr.onprogress!({
              loaded: Math.round((body.length * i) / chunks),
              total: reply.total === false ? 0 : body.length,
              lengthComputable: reply.total !== false,
            } as ProgressEvent);
          }
          xhr.status = reply.status;
          xhr.response = body.slice().buffer;
          xhr.onload!();
        }, 0);
      },
    };
    return xhr as unknown as XMLHttpRequest;
  };
}

function failure(promise: Promise<unknown>): Promise<StoryFileError> {
  return promise.then(
    () => {
      throw new Error('expected a failure');
    },
    (error: unknown) => {
      expect(isStoryFileError(error)).toBe(true);
      return error as StoryFileError;
    },
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('download', () => {
  it('returns the bytes and reports progress', async () => {
    const progress: Array<[number, number]> = [];
    const log: string[] = [];
    const bytes = await download(URL_Z, {
      createXhr: fakeXhr({ status: 200, body: STORY, chunks: 4 }, log),
      onProgress: (loaded, total) => progress.push([loaded, total]),
    }).promise;
    expect(bytes).toEqual(STORY);
    expect(log).toEqual(['GET ' + URL_Z]);
    expect(progress).toEqual([
      [32, 128],
      [64, 128],
      [96, 128],
      [128, 128],
    ]);
  });

  it('reports an unknown size as 0', async () => {
    const progress: number[] = [];
    await download(URL_Z, {
      createXhr: fakeXhr({ status: 200, body: STORY, total: false }),
      onProgress: (_loaded, total) => progress.push(total),
    }).promise;
    expect(progress).toEqual([0]);
  });

  it('fails on an HTTP error, a network error or an empty status-0 answer', async () => {
    const http = await failure(
      download(URL_Z, { createXhr: fakeXhr({ status: 404, body: new Uint8Array(3) }) }).promise,
    );
    expect(http.reason).toBe('http');
    expect(http.status).toBe(404);
    const network = await failure(download(URL_Z, { createXhr: fakeXhr({ error: true }) }).promise);
    expect(network.reason).toBe('network');
    const blocked = await failure(download(URL_Z, { createXhr: fakeXhr({ status: 0 }) }).promise);
    expect(blocked.reason).toBe('network');
  });

  it('gives up when nothing arrives for a while', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const loading = download(URL_Z, {
      createXhr: fakeXhr({ stall: true }, log),
      stallTimeoutMs: 1000,
    });
    const result = failure(loading.promise);
    vi.advanceTimersByTime(1000);
    expect((await result).reason).toBe('timeout');
    expect(log).toEqual(['GET ' + URL_Z, 'abort']);
  });

  it('can be aborted', () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const loading = download(URL_Z, { createXhr: fakeXhr({ stall: true }, log) });
    loading.abort();
    vi.advanceTimersByTime(60000);
    expect(log).toEqual(['GET ' + URL_Z, 'abort']);
  });
});

describe('zip extraction', () => {
  const zip = zipSync({
    'hollow/HOLLOW.Z3': STORY,
    'hollow/readme.txt': new Uint8Array([65, 66]),
  });

  it('extracts the primary file the catalogue names', () => {
    expect(extractPrimary(zip, 'hollow/HOLLOW.Z3')).toEqual(STORY);
  });

  it('accepts the same file name in another case or folder', () => {
    expect(extractPrimary(zip, 'Hollow.z3')).toEqual(STORY);
    expect(extractPrimary(zip, 'other/hollow.z3')).toEqual(STORY);
  });

  it('fails when the file is missing, ambiguous, or the data is not a zip', () => {
    expect(() => extractPrimary(zip, 'hollow/OTHER.Z3')).toThrow(/No single/);
    const twice = zipSync({ 'a/game.z5': STORY, 'b/game.z5': STORY });
    expect(() => extractPrimary(twice, 'game.z5')).toThrow(/No single/);
    let error: unknown;
    try {
      extractPrimary(STORY, 'game.z5');
    } catch (e) {
      error = e;
    }
    expect(isStoryFileError(error) && error.reason).toBe('format');
  });

  it('unzips only when the catalogue says so, and keeps other files for a Twine story only', () => {
    expect(storyData({ url: URL_Z }, 'zmachine', STORY)).toEqual({ bytes: STORY });
    expect(
      storyData(
        { url: URL_ZIP, archive: { type: 'zip', primary: 'hollow/HOLLOW.Z3' } },
        'zmachine',
        zip,
      ),
    ).toEqual({ bytes: STORY });
  });
});

describe('fetchStory', () => {
  const now = (write: () => void) => write();

  it('downloads, then caches a small file for next time', async () => {
    const store = createStore(new MemoryBackend());
    const log: string[] = [];
    const game = { tuid: 'lamp', file: { url: URL_Z } };
    const first = await fetchStory(game, 'zmachine', store, {
      createXhr: fakeXhr({ status: 200, body: STORY }, log),
      defer: now,
    }).promise;
    expect(first).toEqual({ bytes: STORY });
    expect(store.keys()).toContain(keys.file('lamp'));

    const second = await fetchStory(game, 'zmachine', store, {
      createXhr: fakeXhr({ status: 200, body: STORY }, log),
    }).promise;
    expect(second).toEqual({ bytes: STORY });
    expect(log).toEqual(['GET ' + URL_Z]);
  });

  it('downloads again when the catalogue points to a new file', async () => {
    const store = createStore(new MemoryBackend());
    cacheFile(store, 'lamp', URL_Z.replace('lamp', 'old'), new Uint8Array(64).fill(3));
    const log: string[] = [];
    const story = await fetchStory({ tuid: 'lamp', file: { url: URL_Z } }, 'zmachine', store, {
      createXhr: fakeXhr({ status: 200, body: STORY }, log),
      defer: now,
    }).promise;
    expect(story).toEqual({ bytes: STORY });
    expect(log).toEqual(['GET ' + URL_Z]);
  });

  it('unzips the story, and rejects a file that is not one', async () => {
    const store = createStore(new MemoryBackend());
    const zipped = { url: URL_ZIP, archive: { type: 'zip' as const, primary: 'hollow/HOLLOW.Z3' } };
    const zip = zipSync({ 'hollow/HOLLOW.Z3': STORY });
    const story = await fetchStory({ tuid: 'hollow', file: zipped }, 'zmachine', store, {
      createXhr: fakeXhr({ status: 200, body: zip }),
      defer: now,
    }).promise;
    expect(story).toEqual({ bytes: STORY });

    const page = new TextEncoder().encode('<!DOCTYPE html><html>' + ' '.repeat(100));
    const error = await failure(
      fetchStory({ tuid: 'web', file: { url: URL_Z } }, 'zmachine', store, {
        createXhr: fakeXhr({ status: 200, body: page }),
        defer: now,
      }).promise,
    );
    expect(error.reason).toBe('format');
    expect(store.keys()).not.toContain(keys.file('web'));
  });
});

describe('zipped Twine stories (S1.11)', () => {
  const enc = (text: string) => Uint8Array.from(new TextEncoder().encode(text));
  const PAGE = enc(
    '<html><head><link rel="stylesheet" href="css/story.css"></head><body><tw-storydata>' +
      '[img[img/b.png]] [img[img/a.png]]</tw-storydata></body></html>',
  );
  const bytes = (size: number, fill: number) => new Uint8Array(size).fill(fill);
  const ZIP = zipSync({
    'Lamp/index.html': PAGE,
    'Lamp/css/story.css': enc('@font-face{src:url(../fonts/f.woff2)}'),
    'Lamp/img/a.png': bytes(10, 1),
    'Lamp/img/b.png': bytes(10, 2),
    'Lamp/fonts/f.woff2': bytes(10, 3),
    'Lamp/js/extra.js': enc('window.x = 1;'),
    'Lamp/audio/sea.mp3': bytes(10, 4),
    'Lamp/video/intro.webm': bytes(10, 5),
    'Lamp/readme.txt': enc('Hello'),
    'Other/img/c.png': bytes(10, 6),
    'cover.png': bytes(10, 7),
  });

  it("keeps the files of the primary's folder the frame can use, by path from that folder", () => {
    const story = extractTwine(ZIP, 'Lamp/index.html');
    expect(story.bytes).toEqual(PAGE);
    expect(Object.keys(story.files!).sort()).toEqual([
      'css/story.css',
      'fonts/f.woff2',
      'img/a.png',
      'img/b.png',
      'js/extra.js',
    ]);
    expect(story.files!['img/b.png']).toEqual(bytes(10, 2));
  });

  it('finds the primary in another case or folder, and keeps that folder', () => {
    const story = extractTwine(ZIP, 'lamp/INDEX.html');
    expect(story.bytes).toEqual(PAGE);
    expect(Object.keys(story.files!)).toContain('img/a.png');
    const flat = extractTwine(zipSync({ 'index.html': PAGE, 'a.png': bytes(4, 1) }), 'index.html');
    expect(Object.keys(flat.files!)).toEqual(['a.png']);
  });

  it('a story with no other files has none', () => {
    const story = extractTwine(zipSync({ 'Lamp/index.html': PAGE }), 'Lamp/index.html');
    expect(story).toEqual({ bytes: PAGE, files: {} });
  });

  it('over the size limit, keeps the files in their order of reference and drops the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const big = Math.floor(MAX_STORY_FILES_BYTES / 2) - 1000;
    const zip = zipSync(
      {
        'Lamp/index.html': PAGE,
        'Lamp/css/story.css': enc('@font-face{src:url(../fonts/f.woff2)}'),
        'Lamp/img/a.png': bytes(big, 1),
        'Lamp/img/b.png': bytes(big, 2),
        'Lamp/fonts/f.woff2': bytes(100, 3),
        'Lamp/img/unused.png': bytes(big, 4),
      },
      { level: 0 },
    );
    const story = extractTwine(zip, 'Lamp/index.html');
    // The page names the stylesheet, b, then a; the stylesheet names the font; unused.png is never named.
    expect(Object.keys(story.files!).sort()).toEqual([
      'css/story.css',
      'fonts/f.woff2',
      'img/a.png',
      'img/b.png',
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('img/unused.png'));
    warn.mockRestore();
  });

  it('downloads a zipped Twine story with its files, then plays it from the cache', async () => {
    const store = createStore(new MemoryBackend());
    const game = {
      tuid: 'lamp-zip',
      file: { url: URL_ZIP, archive: { type: 'zip' as const, primary: 'Lamp/index.html' } },
    };
    const page = enc('<html><body><tw-storydata name="Lamp"></tw-storydata>' + ' '.repeat(100));
    const zip = zipSync({ 'Lamp/index.html': page, 'Lamp/img/a.png': bytes(10, 1) });
    const log: string[] = [];
    const first = await fetchStory(game, 'twine', store, {
      createXhr: fakeXhr({ status: 200, body: zip }, log),
      defer: (write) => write(),
    }).promise;
    expect(first).toEqual({ bytes: page, files: { 'img/a.png': bytes(10, 1) } });
    const second = await fetchStory(game, 'twine', store, {
      createXhr: fakeXhr({ status: 200, body: zip }, log),
    }).promise;
    expect(second).toEqual(first);
    expect(log).toEqual(['GET ' + URL_ZIP]);
  });
});

describe('ink web exports (S2.7)', () => {
  const now = (write: () => void) => write();
  const json = readFileSync('tests/fixtures/ink/lamp.json', 'utf8').replace(/^\uFEFF/, '');
  const URL_INK = 'https://ifarchive.org/if-archive/games/ink/tide.zip';
  const exported = zipSync({
    'tide/index.html': strToU8('<script src="ink.js"></script><script src="tide.js"></script>'),
    'tide/tide.js': strToU8('var storyContent = ' + json + ';'),
  });
  const file = { url: URL_INK, archive: { type: 'zip' as const, primary: 'tide/tide.js' } };

  it("takes the story out of a zipped export's script, an inline script or a .json", () => {
    expect(strFromU8(storyData(file, 'ink', exported).bytes)).toBe(json);
    const page = strToU8('<html><script>\nlet storyContent = ' + json + '\n</script></html>');
    expect(strFromU8(storyData({ url: URL_INK }, 'ink', page).bytes)).toBe(json);
    expect(strFromU8(storyData({ url: URL_INK }, 'ink', strToU8('\uFEFF' + json)).bytes)).toBe(
      json,
    );
  });

  it('fails as "Not a story file" without a compiled story', () => {
    for (const bytes of [
      strToU8('<html>Play on itch.io</html>'),
      strToU8('var storyContent = {"inkVersion":21,'),
      strToU8('var storyContent = {"root":[]};'),
    ]) {
      let error: unknown;
      try {
        storyData({ url: URL_INK }, 'ink', bytes);
      } catch (e) {
        error = e;
      }
      expect(isStoryFileError(error) && error.reason).toBe('format');
      expect((error as Error).message).toMatch(/^Not a story file/);
    }
    const page = { ...file, archive: { type: 'zip' as const, primary: 'tide/index.html' } };
    expect(() => storyData(page, 'ink', exported)).toThrow(/Not a story file/);
  });

  it('downloads the export once and caches the story alone', async () => {
    const store = createStore(new MemoryBackend());
    const log: string[] = [];
    const game = { tuid: 'tide', file: file };
    const first = await fetchStory(game, 'ink', store, {
      createXhr: fakeXhr({ status: 200, body: exported }, log),
      defer: now,
    }).promise;
    expect(strFromU8(first.bytes)).toBe(json);
    const second = await fetchStory(game, 'ink', store, {
      createXhr: fakeXhr({ status: 200, body: exported }, log),
    }).promise;
    expect(strFromU8(second.bytes)).toBe(json);
    expect(log).toEqual(['GET ' + URL_INK]);
  });
});
