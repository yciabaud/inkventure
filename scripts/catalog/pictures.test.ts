import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { packBlorb } from '../fixtures/build-blorb';
import {
  HEAD_BYTES,
  inspect,
  isCandidate,
  isFresh,
  parseBlorbHead,
  picturesFrom,
  PICTURES_MAX_AGE_DAYS,
  readHead,
  urlsToInspect,
  type FetchHead,
} from './pictures';
import type { ResolvedGame } from './resolver';

// Story files made by the fixture packer (scripts/fixtures/build-blorb.ts): a game and a few stand-in pictures (only
// the index is read). The committed tests/fixtures/glulx/picture.gblorb has one picture and no cover.
const GAME = new Uint8Array(64).fill(7);
const png = (n: number) => ({ png: new Uint8Array(40 + n).fill(n) });
const pictures = (n: number) => Array.from({ length: n }, (_, i) => png(i + 1));
const SEVERAL = packBlorb(GAME, pictures(4), { picture: 1, at: 'head' });
const COVER_ONLY = packBlorb(GAME, pictures(1), { picture: 1, at: 'head' });
const NO_PICTURES = packBlorb(GAME, []);
const COVER_AT_END = packBlorb(GAME, pictures(3), { picture: 2, at: 'end' });
const RECORDED = new Uint8Array(readFileSync('tests/fixtures/glulx/picture.gblorb'));

describe('Blorb resource index', () => {
  it('counts the pictures besides the cover named by Fspc', () => {
    expect(parseBlorbHead(SEVERAL)).toEqual({
      kind: 'blorb',
      pictures: 4,
      cover: 1,
      besidesCover: 3,
    });
    expect(parseBlorbHead(COVER_ONLY)).toEqual({
      kind: 'blorb',
      pictures: 1,
      cover: 1,
      besidesCover: 0,
    });
    expect(parseBlorbHead(NO_PICTURES)).toEqual({ kind: 'blorb', pictures: 0, besidesCover: 0 });
    // Every chunk walked, no Fspc: no cover.
    expect(parseBlorbHead(RECORDED)).toEqual({ kind: 'blorb', pictures: 1, besidesCover: 1 });
  });

  it('assumes one picture is the cover when Fspc is past the head', () => {
    expect(parseBlorbHead(COVER_AT_END)).toMatchObject({ pictures: 3, cover: 2, besidesCover: 2 });
    const head = COVER_AT_END.subarray(0, 120);
    expect(parseBlorbHead(head)).toEqual({ kind: 'blorb', pictures: 3, besidesCover: 2 });
  });

  it('asks for more bytes when the index goes past the head', () => {
    // FORM header (12) + RIdx header (8) + count (4) + 5 entries of 12 bytes.
    expect(parseBlorbHead(SEVERAL.subarray(0, 40))).toEqual({ kind: 'truncated', needed: 84 });
    expect(parseBlorbHead(SEVERAL.subarray(0, 10))).toEqual({ kind: 'truncated', needed: 12 });
    expect(parseBlorbHead(SEVERAL.subarray(0, 84))).toMatchObject({ kind: 'blorb', pictures: 4 });
  });

  it('recognises a file that is not a Blorb', () => {
    const ulx = new Uint8Array(readFileSync('tests/fixtures/glulx/lamp.ulx')).subarray(0, 4096);
    expect(parseBlorbHead(ulx)).toEqual({ kind: 'not-blorb' });
    const aiff = SEVERAL.slice();
    aiff.set([0x41, 0x49, 0x46, 0x46], 8); // FORM AIFF
    expect(parseBlorbHead(aiff)).toEqual({ kind: 'not-blorb' });
    const noIndex = SEVERAL.slice();
    noIndex.set([0x49, 0x46, 0x68, 0x64], 12); // IFhd first
    expect(parseBlorbHead(noIndex)).toEqual({ kind: 'not-blorb' });
  });
});

/** Recorded answers of a host to Range requests, as `fetch` gives them, with the requests made. */
function host(file: Uint8Array, options: { range: boolean; lastModified?: string }) {
  const requests: Array<{ length: number; headers: Record<string, string> }> = [];
  const fetchHead: FetchHead = (_url, length, headers) => {
    requests.push({ length: length, headers: headers });
    const common: Record<string, string> = {};
    if (options.lastModified) common['last-modified'] = options.lastModified;
    if (headers['If-Modified-Since'] && headers['If-Modified-Since'] === options.lastModified) {
      return readHead(new Response(null, { status: 304, headers: common }), length);
    }
    if (!options.range) {
      return readHead(
        new Response(new Uint8Array(file), {
          status: 200,
          headers: { ...common, 'content-length': String(file.length) },
        }),
        length,
      );
    }
    const part = file.slice(0, length);
    return readHead(
      new Response(new Uint8Array(part), {
        status: 206,
        headers: {
          ...common,
          'content-range': `bytes 0-${part.length - 1}/${file.length}`,
        },
      }),
      length,
    );
  };
  return { fetchHead, requests };
}

const URL_A = 'https://ifarchive.org/if-archive/games/glulx/a.gblorb';
const NOW = new Date('2026-10-01T00:00:00.000Z');
const LAST_MODIFIED = 'Tue, 01 Sep 2026 10:00:00 GMT';

/** A Blorb whose index does not fit in the first HEAD_BYTES. */
function bigIndex(): Uint8Array {
  return packBlorb(GAME, pictures(400), { picture: 1, at: 'head' });
}

describe('inspection over HTTP', () => {
  it('reads the head with a Range request', async () => {
    const { fetchHead, requests } = host(SEVERAL, { range: true, lastModified: LAST_MODIFIED });
    expect(await inspect(URL_A, fetchHead, NOW)).toEqual({
      checked: NOW.toISOString(),
      pictures: 3,
      size: SEVERAL.length,
      lastModified: LAST_MODIFIED,
    });
    expect(requests).toEqual([{ length: HEAD_BYTES, headers: {} }]);
  });

  it('falls back on the first bytes of the whole file when Range is not honoured', async () => {
    const file = bigIndex();
    const head = await readHead(new Response(new Uint8Array(file), { status: 200 }), 100);
    expect(head.bytes).toEqual(file.subarray(0, 100));
    const { fetchHead } = host(file, { range: false });
    expect(await inspect(URL_A, fetchHead, NOW)).toMatchObject({
      pictures: 399,
      size: file.length,
    });
  });

  it('asks once more for an index longer than the head', async () => {
    const file = bigIndex();
    const { fetchHead, requests } = host(file, { range: true });
    expect((await inspect(URL_A, fetchHead, NOW)).pictures).toBe(399);
    expect(requests.map((r) => r.length)).toEqual([HEAD_BYTES, 24 + 401 * 12]);
  });

  it('records why a file has no count: not a Blorb, truncated, an HTTP error', async () => {
    const ulx = new Uint8Array(readFileSync('tests/fixtures/glulx/media.ulx'));
    expect(await inspect(URL_A, host(ulx, { range: true }).fetchHead, NOW)).toMatchObject({
      detail: 'not a Blorb',
    });
    const cut = bigIndex().slice(0, HEAD_BYTES + 10);
    expect(await inspect(URL_A, host(cut, { range: true }).fetchHead, NOW)).toMatchObject({
      detail: 'not a Blorb (truncated)',
    });
    const gone: FetchHead = async () => ({ status: 404, bytes: new Uint8Array(0) });
    expect(await inspect(URL_A, gone, NOW)).toEqual({
      checked: NOW.toISOString(),
      detail: 'HTTP 404',
    });
    const down: FetchHead = async () => ({ status: 503, bytes: new Uint8Array(0) });
    expect(await inspect(URL_A, down, NOW)).toMatchObject({ transient: true });
  });

  it('revalidates an old check with If-Modified-Since, keeping the count of an unchanged file', async () => {
    const old = {
      checked: '2026-01-01T00:00:00.000Z',
      pictures: 3,
      size: SEVERAL.length,
      lastModified: LAST_MODIFIED,
    };
    const same = host(SEVERAL, { range: true, lastModified: LAST_MODIFIED });
    expect(await inspect(URL_A, same.fetchHead, NOW, old)).toEqual({
      ...old,
      checked: NOW.toISOString(),
    });
    expect(same.requests[0].headers).toEqual({ 'If-Modified-Since': LAST_MODIFIED });

    const changed = host(COVER_ONLY, {
      range: true,
      lastModified: 'Wed, 30 Sep 2026 10:00:00 GMT',
    });
    expect(await inspect(URL_A, changed.fetchHead, NOW, old)).toMatchObject({ pictures: 0 });
  });
});

describe('cache', () => {
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();

  it('reuses a check for PICTURES_MAX_AGE_DAYS, network errors checked again', () => {
    expect(isFresh(undefined, NOW)).toBe(false);
    expect(isFresh({ checked: daysAgo(10), pictures: 2 }, NOW)).toBe(true);
    expect(isFresh({ checked: daysAgo(10), detail: 'not a Blorb' }, NOW)).toBe(true);
    expect(isFresh({ checked: daysAgo(PICTURES_MAX_AGE_DAYS + 1), pictures: 2 }, NOW)).toBe(false);
    expect(isFresh({ checked: daysAgo(1), detail: 'network', transient: true }, NOW)).toBe(false);
  });

  it('gives the count of the files checked', () => {
    const count = picturesFrom({
      [URL_A]: { checked: daysAgo(1), pictures: 4 },
      'https://example.com/b.gblorb': { checked: daysAgo(1), detail: 'not a Blorb' },
    });
    expect(count(URL_A)).toBe(4);
    expect(count('https://example.com/b.gblorb')).toBeUndefined();
    expect(count('https://example.com/never.gblorb')).toBeUndefined();
  });
});

describe('candidates', () => {
  const game = (format: ResolvedGame['format'], file: ResolvedGame['file']) =>
    ({ format: format, file: file }) as ResolvedGame;

  it('inspects uncompressed Blorbs of the formats whose engine draws pictures', () => {
    expect(isCandidate(game('glulx', { url: URL_A }))).toBe(true);
    expect(isCandidate(game('glulx', { url: 'https://x.org/a', ifdbFormat: 'blorb/glulx' }))).toBe(
      true,
    );
    expect(isCandidate(game('glulx', { url: 'https://x.org/a.ulx' }))).toBe(false);
    expect(
      isCandidate(
        game('glulx', {
          url: 'https://x.org/a.zip',
          archive: { type: 'zip', primary: 'a.gblorb' },
        }),
      ),
    ).toBe(false);
    // The Z-machine engine does not draw pictures (yet).
    expect(isCandidate(game('zcode', { url: 'https://x.org/a.zblorb' }))).toBe(false);
    expect(
      urlsToInspect([
        game('glulx', { url: 'https://x.org/b.gblorb' }),
        game('glulx', { url: URL_A }),
        game('glulx', { url: URL_A }),
      ]),
    ).toEqual([URL_A, 'https://x.org/b.gblorb']);
  });
});
