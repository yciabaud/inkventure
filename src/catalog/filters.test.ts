import { describe, expect, it } from 'vitest';
import { formatQuery, parseHash } from '../app/router';
import {
  activeCount,
  applyFilters,
  formatFilters,
  genreOptions,
  languageName,
  NO_FILTERS,
  parseFilters,
  parseSort,
  playTime,
  sortIndices,
  type Filters,
} from './filters';
import type { IndexRow, Meta } from './loader';

function row(t: string, extra: Partial<IndexRow> = {}): IndexRow {
  return { t: t, n: t.toUpperCase(), a: 'Someone', f: 'zcode', ...extra };
}

// In index (title) order.
const rows: IndexRow[] = [
  row('a', { l: 'en', g: ['Fantasy'], y: 1985, r: 4.5, rc: 40, s: 4.3, p: 20, st: 1 }),
  row('b', { l: 'fr', g: ['Horror', 'Science Fiction'], y: 2020, r: 4, rc: 8, s: 3.6, p: 45 }),
  row('c', { l: 'fr', f: 'glulx', g: ['Science fiction'], y: 2001, r: 3, rc: 3, s: 2.5 }),
  row('d', { l: 'en', y: 2020, p: 180, fg: 'Cruel' }),
  row('e', {}),
];
const all = rows.map((_, i) => i);

function ids(filters: Partial<Filters>, indices = all): string[] {
  return applyFilters(rows, indices, { ...NO_FILTERS, ...filters }).map((i) => rows[i].t);
}

describe('filter predicates', () => {
  it('passes everything without filters', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('matches any of the chosen genres, ignoring case', () => {
    expect(ids({ genres: ['science fiction'] })).toEqual(['b', 'c']);
    expect(ids({ genres: ['Fantasy', 'Horror'] })).toEqual(['a', 'b']);
  });

  it('matches languages (und for unknown) and formats', () => {
    expect(ids({ languages: ['fr'] })).toEqual(['b', 'c']);
    expect(ids({ languages: ['und'] })).toEqual(['e']);
    expect(ids({ formats: ['glulx'] })).toEqual(['c']);
  });

  it('keeps games with at least the rating or number of ratings, leaving unrated ones out', () => {
    expect(ids({ minRating: 4 })).toEqual(['a', 'b']);
    expect(ids({ minVotes: 5 })).toEqual(['a', 'b']);
    expect(ids({ minRating: 3, minVotes: 10 })).toEqual(['a']);
  });

  it('matches play time buckets, forgiveness, the year range and starters', () => {
    expect([10, 29, 30, 59, 60, 119, 120].map(playTime)).toEqual([
      'short',
      'short',
      'medium',
      'medium',
      'long',
      'long',
      'epic',
    ]);
    expect(ids({ times: ['short', 'epic'] })).toEqual(['a', 'd']);
    expect(ids({ forgiveness: ['cruel'] })).toEqual(['d']);
    expect(ids({ from: 2001 })).toEqual(['b', 'c', 'd']);
    expect(ids({ to: 2001 })).toEqual(['a', 'c']);
    expect(ids({ from: 1990, to: 2010 })).toEqual(['c']);
    expect(ids({ starter: true })).toEqual(['a']);
  });

  it('combines filters with AND and keeps the incoming order', () => {
    expect(ids({ languages: ['fr'], formats: ['zcode'], minRating: 4 })).toEqual(['b']);
    expect(ids({ languages: ['en'], from: 2000 })).toEqual(['d']);
    expect(ids({ languages: ['fr'] }, [2, 1])).toEqual(['c', 'b']);
  });
});

describe('sort', () => {
  const sorted = (sort: string, indices = all) =>
    sortIndices(rows, indices, parseSort(sort)).map((i) => rows[i].t);

  it('best rated: star sort, unknown last, ties in the incoming order', () => {
    expect(sorted('rating')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(sorted('rating', [4, 3, 2])).toEqual(['c', 'e', 'd']);
  });

  it('most rated, newest and title', () => {
    expect(sorted('votes')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(sorted('new')).toEqual(['b', 'd', 'c', 'a', 'e']);
    expect(sorted('title', [3, 0, 2])).toEqual(['a', 'c', 'd']);
  });

  it('breaks ties explicitly (older browsers do not sort stably)', () => {
    const many = Array.from({ length: 30 }, (_, i) => row('r' + i));
    const order = many.map((_, i) => 29 - i);
    expect(sortIndices(many, order, 'rating')).toEqual(order);
  });

  it('falls back to best rated for an unknown sort', () => {
    expect(parseSort(undefined)).toBe('rating');
    expect(parseSort('nope')).toBe('rating');
    expect(parseSort('new')).toBe('new');
  });
});

describe('hash serialisation', () => {
  const filters: Filters = {
    genres: ['Science Fiction', 'Horror'],
    languages: ['fr'],
    formats: ['zcode'],
    minRating: 3.5,
    minVotes: 10,
    times: ['short', 'long'],
    forgiveness: ['merciful'],
    from: 1990,
    to: 1999,
    starter: true,
  };

  it('round-trips through the URL hash', () => {
    const hash = '#/library?' + formatQuery(formatFilters(filters));
    expect(parseFilters(parseHash(hash).query)).toEqual(filters);
    expect(formatQuery(formatFilters(NO_FILTERS))).toBe('');
  });

  it('ignores malformed and unknown values', () => {
    expect(
      parseFilters({
        genre: ',Fantasy,,Fantasy',
        rating: 'x',
        votes: '0',
        time: 'short,forever',
        fg: 'CRUEL,kind',
        from: '19',
        to: '2001.5',
        start: 'yes',
      }),
    ).toEqual({
      ...NO_FILTERS,
      genres: ['Fantasy'],
      times: ['short'],
      forgiveness: ['cruel'],
      to: 2001,
    });
  });

  it('counts the filters set, a year range once', () => {
    expect(activeCount(NO_FILTERS)).toBe(0);
    expect(activeCount(filters)).toBe(9);
  });
});

describe('facet options', () => {
  it('merges genres differing only by case, keeping the most frequent spelling', () => {
    const meta = {
      facets: {
        genres: [
          ['Fantasy', 5],
          ['Science Fiction', 4],
          ['Horror', 3],
          ['Science fiction', 2],
        ],
        languages: [],
        formats: [],
      },
    } as unknown as Meta;
    expect(genreOptions(meta)).toEqual([
      { value: 'Science Fiction', count: 6 },
      { value: 'Fantasy', count: 5 },
      { value: 'Horror', count: 3 },
    ]);
  });

  it('names languages in their own language', () => {
    expect(languageName('fr')).toBe('Français');
    expect(languageName('xx')).toBe('xx');
    expect(languageName('und')).toBeUndefined();
  });
});
