import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { RawDataset, RawGame } from './crawler';
import type { GameRecord } from './ifdb';
import { chooseFile, resolve } from './resolver';
import {
  HEAD_BYTES,
  inspectStory,
  isFresh,
  sniffStory,
  storiesToCheck,
  storyKey,
  storyVerdictFrom,
  zipStory,
  type FetchRange,
  type StoriesCache,
} from './stories';

// Recorded fixtures (S2.8): the test games, and story files made from them.
const LAMP_Z = new Uint8Array(readFileSync('tests/fixtures/zmachine/lamp.z5'));
const LAMP_G = new Uint8Array(readFileSync('tests/fixtures/glulx/lamp.ulx'));
const PICTURE_G = new Uint8Array(readFileSync('tests/fixtures/glulx/picture.gblorb'));
/** The Z-machine fixture, as if it were a version 6 story (Zork Zero, Arthur…). */
const V6 = LAMP_Z.slice();
V6[0] = 6;
/** What a link to a game's page returns instead of the story. */
const PAGE = strToU8(
  '<!DOCTYPE html>\n<html><head><title>Plaque</title></head><body>Download</body></html>',
);
const NOW = new Date('2026-10-09T00:00:00.000Z');
const CHECKED = NOW.toISOString();

/** A Blorb whose executable chunk (`ZCOD`) comes after a big chunk, beyond the head first read. */
function blorbWithLateStory(story: Uint8Array): Uint8Array {
  const pad = 6000;
  const exec = 12 + 8 + 4 + 12 + 8 + pad;
  const size = exec + 8 + story.length;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, text: string) => bytes.set(strToU8(text), at);
  tag(0, 'FORM');
  view.setUint32(4, size - 8);
  tag(8, 'IFRS');
  tag(12, 'RIdx');
  view.setUint32(16, 4 + 12);
  view.setUint32(20, 1);
  tag(24, 'Exec');
  view.setUint32(28, 0);
  view.setUint32(32, exec);
  tag(36, 'AUTH');
  view.setUint32(40, pad);
  tag(exec, 'ZCOD');
  view.setUint32(exec + 4, story.length);
  bytes.set(story, exec + 8);
  return bytes;
}

/** A host serving `files` (URL → bytes, or an HTTP status), honouring Range; logs the requests. */
function host(files: Record<string, Uint8Array | number>) {
  const log: string[] = [];
  const fetchRange: FetchRange = async (url, start, length) => {
    log.push(url + (length === undefined ? '' : ' ' + start + '+' + length));
    const file = files[url];
    if (file === undefined) return { status: 404, bytes: new Uint8Array(0) };
    if (typeof file === 'number') return { status: file, bytes: new Uint8Array(0) };
    if (length === undefined) return { status: 200, bytes: file };
    return { status: 206, bytes: file.subarray(start, start + length) };
  };
  return { fetchRange, log };
}

describe('reading a story file (S2.8)', () => {
  it('tells Z-machine stories and their version, Glulx stories, Blorbs, pages and other files apart', () => {
    expect(sniffStory(LAMP_Z)).toEqual({ kind: 'zcode', version: 5 });
    expect(sniffStory(V6)).toEqual({ kind: 'zcode', version: 6 });
    expect(sniffStory(LAMP_G)).toEqual({ kind: 'glulx' });
    expect(sniffStory(PICTURE_G)).toEqual({ kind: 'glulx' });
    expect(sniffStory(PAGE)).toEqual({ kind: 'page' });
    expect(sniffStory(strToU8('PK\u0003\u0004 not a story'))).toEqual({ kind: 'unknown' });
    // A byte from 1 to 8 is not enough: the header must hold.
    const noHeader = new Uint8Array(128);
    noHeader[0] = 5;
    expect(sniffStory(noHeader)).toEqual({ kind: 'unknown' });
    expect(sniffStory(LAMP_Z.subarray(0, 32))).toEqual({ kind: 'unknown' });
    const late = blorbWithLateStory(LAMP_Z);
    expect(sniffStory(late.subarray(0, HEAD_BYTES))).toMatchObject({ kind: 'blorb' });
    expect(sniffStory(late)).toEqual({ kind: 'zcode', version: 5 });
  });
});

describe('opening a file as the app would (S2.8)', () => {
  const A = 'https://ifarchive.org/if-archive/games/zcode/';

  it('opens a good story, reading only its head', async () => {
    const h = host({ [A + 'lamp.z5']: LAMP_Z, [A + 'lamp.ulx']: LAMP_G });
    expect(await inspectStory({ url: A + 'lamp.z5', format: 'zcode' }, h.fetchRange, NOW)).toEqual({
      checked: CHECKED,
      ok: true,
      version: 5,
    });
    expect(await inspectStory({ url: A + 'lamp.ulx', format: 'glulx' }, h.fetchRange, NOW)).toEqual(
      {
        checked: CHECKED,
        ok: true,
      },
    );
    expect(h.log).toEqual([A + 'lamp.z5 0+' + HEAD_BYTES, A + 'lamp.ulx 0+' + HEAD_BYTES]);
  });

  it('opens a story of the other format in its own engine (a Glulx game IFDB lists as Z-code)', async () => {
    const h = host({ [A + 'monk.gblorb']: PICTURE_G });
    expect(
      await inspectStory({ url: A + 'monk.gblorb', format: 'zcode' }, h.fetchRange, NOW),
    ).toEqual({ checked: CHECKED, ok: true, format: 'glulx' });
  });

  it("reads a Blorb's executable chunk where its index says, when it lies beyond the head", async () => {
    const late = blorbWithLateStory(LAMP_Z);
    const h = host({ [A + 'late.zblorb']: late });
    const entry = await inspectStory(
      { url: A + 'late.zblorb', format: 'zcode' },
      h.fetchRange,
      NOW,
    );
    expect(entry).toMatchObject({ ok: true, version: 5 });
    expect(h.log[1]).toMatch(/ \d+\+72$/);
  });

  it('leaves out a version 6 story, a page and a broken link', async () => {
    const h = host({
      [A + 'zork0.z6']: V6,
      [A + 'plaque.html']: PAGE,
      [A + 'lamp.z5']: LAMP_Z,
      [A + 'down.z5']: 503,
    });
    const inspect = (url: string, format: 'zcode' | 'glulx') =>
      inspectStory({ url: url, format: format }, h.fetchRange, NOW);
    expect(await inspect(A + 'zork0.z6', 'zcode')).toEqual({
      checked: CHECKED,
      problem: 'unsupported-version',
      detail: 'version 6',
      version: 6,
    });
    expect(await inspect(A + 'plaque.html', 'zcode')).toEqual({
      checked: CHECKED,
      problem: 'not-a-story',
      detail: 'a web page',
    });

    expect(await inspect(A + 'gone.z5', 'zcode')).toEqual({
      checked: CHECKED,
      problem: 'http',
      detail: 'HTTP 404',
    });
    const down = await inspect(A + 'down.z5', 'zcode');
    expect(down).toMatchObject({ problem: 'http', detail: 'HTTP 503', transient: true });
    expect(isFresh(down, NOW)).toBe(false);
  });

  it("finds a zip's story by the name IFDB gives, in any case or folder, or as its only story", () => {
    const named = zipSync({ 'hollow/HOLLOW.Z5': LAMP_Z, 'hollow/readme.txt': strToU8('Hi') });
    expect(zipStory(named, 'hollow/HOLLOW.Z5', 'zcode', CHECKED)).toEqual({
      checked: CHECKED,
      ok: true,
      version: 5,
    });
    // Another case (PLAQUE.Z5 for plaque.z5): the path in the zip is kept for the app.
    expect(zipStory(named, 'Hollow.z5', 'zcode', CHECKED)).toMatchObject({
      ok: true,
      primary: 'hollow/HOLLOW.Z5',
    });
    // A typo in IFDB's name (boinspeed.z5 for boingspeed.z5): the only story of the game's format in the zip.
    const typo = zipSync({ 'boingspeed.z5': LAMP_Z, 'boingspeed.txt': strToU8('Notes') });
    expect(zipStory(typo, 'boinspeed.z5', 'zcode', CHECKED)).toMatchObject({
      ok: true,
      primary: 'boingspeed.z5',
    });
  });

  it('leaves out a zip without the story, with several, of a version 6 story, or damaged', () => {
    const none = zipSync({ 'readme.txt': strToU8('Hi'), 'index.html': PAGE });
    expect(zipStory(none, 'game.z5', 'zcode', CHECKED)).toEqual({
      checked: CHECKED,
      problem: 'not-in-zip',
      detail: 'no game.z5 in 2 file(s)',
    });
    const many = zipSync({ 'one.z5': LAMP_Z, 'two.z5': LAMP_Z });
    expect(zipStory(many, 'three.z5', 'zcode', CHECKED)).toMatchObject({
      problem: 'not-in-zip',
      detail: 'no three.z5 in 2 file(s), 2 stories',
    });
    expect(zipStory(zipSync({ 'arthur.z6': V6 }), 'arthur.z6', 'zcode', CHECKED)).toMatchObject({
      problem: 'unsupported-version',
    });
    expect(zipStory(PAGE, 'game.z5', 'zcode', CHECKED)).toMatchObject({ problem: 'bad-zip' });
  });

  it('downloads a zip whole', async () => {
    const h = host({ [A + 'hollow.zip']: zipSync({ 'HOLLOW.Z5': LAMP_Z }) });
    const entry = await inspectStory(
      { url: A + 'hollow.zip', primary: 'hollow.z5', format: 'zcode' },
      h.fetchRange,
      NOW,
    );
    expect(entry).toMatchObject({ ok: true, primary: 'HOLLOW.Z5' });
    expect(h.log).toEqual([A + 'hollow.zip']);
  });
});

describe('the files to open, and the resolver (S2.8)', () => {
  const game = (tuid: string, links: unknown[], devsys = 'Inform 6'): RawGame => ({
    tuid: tuid,
    pageVersion: 1,
    queries: [],
    search: {
      tuid: tuid,
      title: 'Game ' + tuid,
      link: '',
      author: '',
      hasCoverArt: false,
      devsys: devsys,
    },
    record: { ifdb: { tuid: tuid, pageversion: 1, downloads: { links: links } } } as GameRecord,
  });
  const A = 'http://www.ifarchive.org/if-archive/games/zcode/';
  const S = 'https://www.ifarchive.org/if-archive/games/zcode/';
  const dataset: RawDataset = {
    source: 'test',
    queries: [],
    games: [
      // A zip IFDB names the wrong file in, and a bare file elsewhere.
      game('a', [
        {
          url: A + 'plaque.zip',
          format: 'zcode',
          compression: 'zip',
          compressedPrimary: 'plaque.z5',
        },
        { url: 'https://author.example/plaque.z5', format: 'zcode' },
      ]),
      // A version 6 game.
      game('b', [{ url: A + 'zork0.z6', format: 'zcode' }]),
      // A Twine game: not opened.
      game('c', [{ url: 'https://author.example/c.html', format: 'hypertextgame' }], 'Twine 2'),
    ],
  };

  it('lists every Z-machine and Glulx file a game may use, once, with its games', () => {
    const files = storiesToCheck(dataset, ['zcode', 'glulx', 'twine']);
    expect(files.map((f) => storyKey(f))).toEqual([
      S + 'plaque.zip#plaque.z5',
      'https://author.example/plaque.z5',
      S + 'zork0.z6',
    ]);
    expect(files[0].games).toEqual([{ tuid: 'a', title: 'Game a' }]);
  });

  it('leaves out the files that do not open, uses the story the check found, and keeps unchecked files', () => {
    const cache: StoriesCache = {
      [S + 'plaque.zip#plaque.z5']: {
        checked: CHECKED,
        ok: true,
        version: 5,
        primary: 'PLAQUE.Z5',
      },
      [S + 'zork0.z6']: { checked: CHECKED, problem: 'unsupported-version', detail: 'version 6' },
    };
    const verdict = storyVerdictFrom(cache);
    const options = {
      enabledFormats: ['zcode' as const, 'twine' as const],
      policy: 'general' as const,
      config: { denyTags: [], exclude: [] },
      storyVerdict: verdict,
    };
    const resolution = resolve(dataset, options);
    const a = resolution.games.find((g) => g.tuid === 'a')!;
    expect(a.file).toEqual({
      url: S + 'plaque.zip',
      ifdbFormat: 'zcode',
      archive: { type: 'zip', primary: 'PLAQUE.Z5' },
    });
    expect(resolution.dropped).toEqual([
      {
        tuid: 'b',
        title: 'Game b',
        reason: 'story-does-not-open',
        detail: 'unsupported-version: version 6 (' + S + 'zork0.z6)',
      },
    ]);
    expect(resolution.games.map((g) => g.tuid)).toEqual(['a', 'c']);

    // When the zip does not open, the other file is used.
    const broken = storyVerdictFrom({
      ...cache,
      [S + 'plaque.zip#plaque.z5']: {
        checked: CHECKED,
        problem: 'not-in-zip',
        detail: 'no plaque.z5',
      },
    });
    const choice = chooseFile(
      dataset.games[0].record,
      'Inform 6',
      ['zcode'],
      undefined,
      undefined,
      broken,
    );
    expect(choice).toMatchObject({ file: { file: { url: 'https://author.example/plaque.z5' } } });
    // A Glulx story IFDB lists as Z-code: played as Glulx.
    const glulx = storyVerdictFrom({
      [S + 'zork0.z6']: { checked: CHECKED, ok: true, format: 'glulx' },
    });
    const fixed = resolve(dataset, {
      ...options,
      enabledFormats: ['zcode', 'glulx'],
      storyVerdict: glulx,
    });
    expect(fixed.games.find((g) => g.tuid === 'b')!.format).toBe('glulx');
    // A network error or no check: the file is kept.
    const unknown = storyVerdictFrom({ [S + 'zork0.z6']: { checked: CHECKED, transient: true } });
    expect(resolve(dataset, { ...options, storyVerdict: unknown }).dropped).toEqual([]);
  });
});
