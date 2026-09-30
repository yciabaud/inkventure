import { describe, expect, it } from 'vitest';
import { formatHash, formatQuery, parseHash, parseQuery } from './router';

describe('parseHash', () => {
  it('parses the top-level routes', () => {
    expect(parseHash('#/home').route).toEqual({ name: 'home' });
    expect(parseHash('#/library').route).toEqual({ name: 'library' });
    expect(parseHash('#/settings').route).toEqual({ name: 'settings' });
    expect(parseHash('#/help').route).toEqual({ name: 'help' });
  });

  it('parses routes with a TUID', () => {
    expect(parseHash('#/game/0dbnusxunq7fw5ro').route).toEqual({
      name: 'game',
      tuid: '0dbnusxunq7fw5ro',
    });
    expect(parseHash('#/play/abc123').route).toEqual({ name: 'play', tuid: 'abc123' });
  });

  it('treats an empty hash as Home', () => {
    expect(parseHash('')).toEqual({ route: { name: 'home' }, query: {}, matched: true });
    expect(parseHash('#')).toEqual({ route: { name: 'home' }, query: {}, matched: true });
    expect(parseHash('#/')).toEqual({ route: { name: 'home' }, query: {}, matched: true });
  });

  it('ignores trailing slashes and accepts a hash without leading slash', () => {
    expect(parseHash('#/library/').route).toEqual({ name: 'library' });
    expect(parseHash('#settings').route).toEqual({ name: 'settings' });
  });

  it('parses query strings', () => {
    const location = parseHash('#/library?q=zork%20I&genre=Fantasy&page=2');
    expect(location.route).toEqual({ name: 'library' });
    expect(location.query).toEqual({ q: 'zork I', genre: 'Fantasy', page: '2' });
  });

  it('falls back to Home for unknown routes', () => {
    for (const hash of [
      '#/nope',
      '#/game',
      '#/game/a/b',
      '#/play/bad%2Ftuid',
      '#/library/extra',
      '#/game/%E0%A4%A',
    ]) {
      const location = parseHash(hash);
      expect(location.route).toEqual({ name: 'home' });
      expect(location.matched).toBe(false);
    }
  });
});

describe('parseQuery', () => {
  it('decodes keys and values, including + as space', () => {
    expect(parseQuery('a=1&b=hello+world&c=%C3%A9t%C3%A9')).toEqual({
      a: '1',
      b: 'hello world',
      c: 'été',
    });
  });

  it('keeps keys without values and skips empty or malformed pairs', () => {
    expect(parseQuery('flag&&x=%E0%A4%A&y=2')).toEqual({ flag: '', y: '2' });
  });
});

describe('formatQuery / formatHash', () => {
  it('sorts keys, encodes values and drops empty values', () => {
    expect(formatQuery({ page: '2', q: 'zork I', genre: '' })).toBe('page=2&q=zork%20I');
  });

  it('formats every route', () => {
    expect(formatHash({ name: 'home' })).toBe('#/home');
    expect(formatHash({ name: 'library' }, { page: '3' })).toBe('#/library?page=3');
    expect(formatHash({ name: 'game', tuid: 'abc' })).toBe('#/game/abc');
    expect(formatHash({ name: 'play', tuid: 'abc' })).toBe('#/play/abc');
    expect(formatHash({ name: 'settings' })).toBe('#/settings');
  });

  it('round-trips through parseHash', () => {
    const cases = [
      formatHash({ name: 'library' }, { q: 'l’été & co', lang: 'fr', page: '10' }),
      formatHash({ name: 'game', tuid: 'x_y-Z9' }),
    ];
    for (const hash of cases) {
      const location = parseHash(hash);
      expect(formatHash(location.route, location.query)).toBe(hash);
    }
  });
});
