import { describe, expect, it } from 'vitest';
import { report, type GameResult } from './report';

const game = (title: string, findings: GameResult['findings'], featured = false): GameResult => ({
  tuid: title.toLowerCase(),
  title: title,
  format: 'zcode',
  featured: featured,
  findings: findings,
  turns: 12,
});

describe('rendering survey report (S7.3)', () => {
  const results = [
    game('Lost Pig', [{ kind: 'upper-screen', step: 'help', detail: '8 rows' }], true),
    game('Bronze', [{ kind: 'glyphs', step: 'look', detail: '→ U+2192' }]),
    game('Maps', [
      { kind: 'glyphs', step: 'intro', detail: '┌ U+250C' },
      { kind: 'wide-fixed', step: 'map', detail: '60 characters' },
    ]),
    game('Gone', [{ kind: 'load', step: 'download', detail: 'HTTP 404' }]),
  ];
  const text = report(results, '2026-10-03', 'intro, `look`');

  it('ranks the findings by number of games, informative ones last', () => {
    const rows = text
      .split('## Games')[0]
      .split('\n')
      .filter((l) => /^\| [A-Z]/.test(l) && /\| \d+ \|/.test(l));
    expect(rows[0]).toMatch(/^\| Characters outside the bundled fonts \| 2 \|/);
    expect(rows[0]).toContain('Bronze (look), Maps (intro)');
    expect(rows[rows.length - 1]).toMatch(/^\| Menu drawn in the upper window \| 1 \|/);
  });

  it('lists every game with its findings, featured games starred', () => {
    expect(text).toContain(
      '| Lost Pig ★ | zcode | 12 | **Menu drawn in the upper window** (help): 8 rows |',
    );
    expect(text).toContain('**Not played** (download): HTTP 404');
    expect(text).toContain('4 parser games (3 played)');
  });
});
