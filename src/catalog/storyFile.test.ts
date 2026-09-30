import { zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryBackend } from '../storage/backend';
import { cacheFile } from '../storage/files';
import { keys } from '../storage/keys';
import { createStore } from '../storage/store';
import {
  download,
  extractPrimary,
  fetchStory,
  isStoryFileError,
  storyBytes,
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

  it('unzips only when the catalogue says so', () => {
    expect(storyBytes({ url: URL_Z }, STORY)).toBe(STORY);
    expect(
      storyBytes({ url: URL_ZIP, archive: { type: 'zip', primary: 'hollow/HOLLOW.Z3' } }, zip),
    ).toEqual(STORY);
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
    expect(first).toEqual(STORY);
    expect(store.keys()).toContain(keys.file('lamp'));

    const second = await fetchStory(game, 'zmachine', store, {
      createXhr: fakeXhr({ status: 200, body: STORY }, log),
    }).promise;
    expect(second).toEqual(STORY);
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
    expect(story).toEqual(STORY);
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
    expect(story).toEqual(STORY);

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
