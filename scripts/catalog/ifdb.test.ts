import { describe, expect, it } from 'vitest';
import {
  IfdbError,
  pageVersionOf,
  parseSearch,
  parseViewgame,
  searchUrl,
  viewgameUrl,
  type SearchRow,
} from './ifdb';

describe('query building', () => {
  it('builds a JSON game search sorted by title, with the page number', () => {
    expect(searchUrl('downloadable:yes system:inform', 2)).toBe(
      'https://ifdb.org/search?json&searchfor=downloadable%3Ayes%20system%3Ainform&sortby=ttl&pg=2',
    );
  });

  it('builds a viewgame JSON request by TUID', () => {
    expect(viewgameUrl('0dbnusxunq7fw5ro')).toBe(
      'https://ifdb.org/viewgame?json&id=0dbnusxunq7fw5ro',
    );
  });
});

describe('parsing', () => {
  it('returns the game rows of a search page, and none past the last page', () => {
    const body = JSON.stringify({ games: [{ tuid: 'a', title: 'A' }, { title: 'no tuid' }] });
    expect(parseSearch(body).map((row) => row.tuid)).toEqual(['a']);
    expect(parseSearch('{\n    "games": [\n\n    ]\n}')).toEqual([]);
  });

  it('turns IFDB error answers and non-JSON bodies into IfdbError', () => {
    expect(() => parseSearch('{"error":"Invalid search"}')).toThrow(IfdbError);
    expect(() => parseSearch('<html>')).toThrow(IfdbError);
    expect(() => parseViewgame('{"error":"No game"}', 'x')).toThrow(/No game/);
  });

  it('checks that a record is the requested game', () => {
    const record = { ifdb: { tuid: 'abc', pageversion: 3 } };
    expect(parseViewgame(JSON.stringify(record), 'abc').ifdb.pageversion).toBe(3);
    expect(() => parseViewgame(JSON.stringify(record), 'other')).toThrow(IfdbError);
  });

  it('reads the page version from the cover art link', () => {
    const row = { tuid: 'a', coverArtLink: 'https://ifdb.org/coverart?id=a&version=12' };
    expect(pageVersionOf(row as SearchRow)).toBe(12);
    expect(pageVersionOf({ tuid: 'a' } as SearchRow)).toBeUndefined();
  });
});
