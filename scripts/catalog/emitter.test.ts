import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  emit,
  indexRow,
  rowProblems,
  serialize,
  validate,
  type IndexRow,
  type Meta,
} from './emitter';
import type { ResolvedGame } from './resolver';
import { sampleCatalog } from './sample';

function game(tuid: string, title: string, extra: Partial<ResolvedGame> = {}): ResolvedGame {
  return {
    tuid: tuid,
    title: title,
    author: 'Someone',
    genres: [],
    format: 'zcode',
    file: { url: 'https://ifarchive.org/if-archive/games/zcode/' + tuid + '.z5' },
    ifids: [],
    tags: [],
    slow: false,
    devsys: 'Inform 6',
    ifdbLink: 'https://ifdb.org/viewgame?id=' + tuid,
    ...extra,
  };
}

const BUILT = '2026-09-30T00:00:00.000Z';
const BUDGET = 150 * 1024;

describe('index rows', () => {
  it('flags the games tagged newcomer-friendly (starter-tags.json), ignoring case', () => {
    expect(indexRow(game('a', 'A', { tags: ['Recommended for Beginners'] })).st).toBe(1);
    expect(indexRow(game('b', 'B', { tags: ['introcomp', 'easy'] })).st).toBeUndefined();
    expect(rowProblems({ t: 'a', n: 'A', a: '', f: 'zcode', st: 1 })).toEqual([]);
    expect(rowProblems({ t: 'a', n: 'A', a: '', f: 'zcode', st: true })).toEqual(['st: 1']);
  });

  it('uses short keys and leaves unknown values out', () => {
    const row = indexRow(
      game('abc', 'Title', {
        year: 1985,
        language: 'fr',
        genres: ['Fantasy'],
        rating: { average: 3.6667, stars: 3.5, count: 3 },
        starSort: 3.12345,
        playtimeMinutes: 30,
        cover: 'https://ifdb.org/coverart?id=abc&version=2',
        slow: true,
      }),
    );
    expect(row).toEqual({
      t: 'abc',
      n: 'Title',
      a: 'Someone',
      f: 'zcode',
      y: 1985,
      l: 'fr',
      g: ['Fantasy'],
      r: 3.67,
      rc: 3,
      s: 3.123,
      p: 30,
      c: 1,
      sl: 1,
    });
    expect(indexRow(game('abc', 'Title'))).toEqual({
      t: 'abc',
      n: 'Title',
      a: 'Someone',
      f: 'zcode',
    });
  });

  it('reports schema problems', () => {
    expect(rowProblems({ t: 'abc', n: 'T', a: '', f: 'zcode' })).toEqual([]);
    expect(rowProblems({ t: 'ABC!', n: '', a: 1, f: 'tads', l: 'english', c: true, x: 0 })).toEqual(
      [
        'unknown key x',
        't: TUID expected',
        'n: title expected',
        'a: author expected',
        'f: story format expected',
        'l: language',
        'c: 1',
      ],
    );
  });
});

describe('emit', () => {
  const games = ['delta', 'Alpha', 'charlie', 'Bravo', 'echo'].map((title, i) =>
    game('t' + i, title),
  );

  it('shards rows sorted by title, with one detail file per game and meta.json listing the shards', () => {
    const files = emit(games, { built: BUILT, policy: 'general', shardSize: 2 });
    const meta = files['meta.json'] as Meta;
    expect(meta.shards).toEqual(['index-0.json', 'index-1.json', 'index-2.json']);
    const titles = meta.shards.flatMap((shard) =>
      (files[shard] as { rows: IndexRow[] }).rows.map((r) => r.n),
    );
    expect(titles).toEqual(['Alpha', 'Bravo', 'charlie', 'delta', 'echo']);
    expect(Object.keys(files).filter((path) => path.indexOf('games/') === 0)).toHaveLength(5);
    expect(meta).toMatchObject({ version: 1, built: BUILT, policy: 'general', count: 5 });
  });

  it('sorts titles by their words, ignoring leading punctuation', () => {
    const files = emit(
      [game('a', '**Cough**'), game('b', '"Alpha"'), game('c', 'beta'), game('d', '1981')],
      {
        built: BUILT,
        policy: 'general',
      },
    );
    expect((files['index-0.json'] as { rows: IndexRow[] }).rows.map((r) => r.n)).toEqual([
      '1981',
      '"Alpha"',
      'beta',
      '**Cough**',
    ]);
  });

  it('counts facet values, most frequent first', () => {
    const files = emit(
      [
        game('a', 'A', { language: 'en', genres: ['Horror', 'Comedy'] }),
        game('b', 'B', { language: 'fr', genres: ['Horror'] }),
        game('c', 'C', { language: 'en', format: 'glulx' }),
        game('d', 'D'),
      ],
      { built: BUILT, policy: 'general' },
    );
    expect((files['meta.json'] as Meta).facets).toEqual({
      languages: [
        ['en', 2],
        ['fr', 1],
        ['und', 1],
      ],
      genres: [
        ['Horror', 2],
        ['Comedy', 1],
      ],
      formats: [
        ['zcode', 3],
        ['glulx', 1],
      ],
    });
  });

  it('always lists a shard, even without games', () => {
    const files = emit([], { built: BUILT, policy: 'general' });
    expect(files['index-0.json']).toEqual({ rows: [] });
    expect(validate(files, { shardBudgetBytes: BUDGET }).errors).toEqual([]);
  });

  it('is deterministic', () => {
    const once = serialize(emit(games, { built: BUILT, policy: 'general' }));
    expect(serialize(emit(games.slice().reverse(), { built: BUILT, policy: 'general' }))).toBe(
      once,
    );
  });
});

describe('validation', () => {
  const files = () => emit([game('a', 'A'), game('b', 'B')], { built: BUILT, policy: 'general' });

  it('accepts a well-formed catalogue and measures every file', () => {
    const result = validate(files(), { shardBudgetBytes: BUDGET });
    expect(result.errors).toEqual([]);
    expect(result.sizes['index-0.json']).toBeGreaterThan(0);
  });

  it('fails a shard over the size budget', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      game('g' + i, 'A rather long title number ' + i),
    );
    const result = validate(emit(many, { built: BUILT, policy: 'general' }), {
      shardBudgetBytes: 10 * 1024,
    });
    expect(result.errors[0]).toMatch(/index-0\.json: \d+ bytes, over the 10240-byte budget/);
  });

  it('fails when more than 20 % of the games disappear', () => {
    expect(validate(files(), { shardBudgetBytes: BUDGET, previousCount: 2 }).errors).toEqual([]);
    expect(validate(files(), { shardBudgetBytes: BUDGET, previousCount: 3 }).errors).toEqual([
      '2 games, down from 3: more than a 20 % drop',
    ]);
  });

  it('fails a missing detail, an insecure file URL or a count mismatch', () => {
    const broken = files();
    delete broken['games/a.json'];
    (broken['games/b.json'] as ResolvedGame).file = { url: 'http://example.com/b.z5' };
    (broken['meta.json'] as Meta).count = 3;
    expect(validate(broken, { shardBudgetBytes: BUDGET }).errors).toEqual([
      'index-0.json row 0: games/a.json missing',
      'games/b.json: file.url: HTTPS URL',
      'meta.json: count 3, but 2 rows',
    ]);
  });
});

describe('committed sample catalogue', () => {
  it('is what the pipeline makes of the fixtures (run npm run catalog:sample after changing them)', async () => {
    const expected = await sampleCatalog();
    const dir = 'public/catalog';
    const committed = [
      ...readdirSync(dir).filter((name) => /\.json$/.test(name)),
      ...readdirSync(join(dir, 'games')).map((name) => 'games/' + name),
    ].sort();
    expect(committed).toEqual(Object.keys(expected).sort());
    for (const path of committed) {
      expect(readFileSync(join(dir, path), 'utf8')).toBe(serialize(expected[path]) + '\n');
    }
    expect(validate(expected, { shardBudgetBytes: BUDGET }).errors).toEqual([]);
  });
});
