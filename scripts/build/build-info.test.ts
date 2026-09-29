import { describe, expect, it } from 'vitest';
import { buildMetaContent, resolveBuildInfo } from './build-info.ts';

const NOW = new Date(Date.UTC(2026, 8, 29, 20, 0, 0));

describe('resolveBuildInfo', () => {
  it('uses GITHUB_SHA in CI', () => {
    expect(resolveBuildInfo({ GITHUB_SHA: 'abc123' }, NOW, () => 'fromgit')).toEqual({
      commit: 'abc123',
      date: '2026-09-29T20:00:00.000Z',
    });
  });

  it('falls back to git, then to "unknown"', () => {
    expect(resolveBuildInfo({}, NOW, () => 'fromgit').commit).toBe('fromgit');
    expect(resolveBuildInfo({}, NOW, () => undefined).commit).toBe('unknown');
  });

  it('honours SOURCE_DATE_EPOCH for reproducible builds, ignoring invalid values', () => {
    expect(resolveBuildInfo({ SOURCE_DATE_EPOCH: '1790000000' }, NOW, () => 'x').date).toBe(
      '2026-09-21T14:13:20.000Z',
    );
    expect(resolveBuildInfo({ SOURCE_DATE_EPOCH: 'nope' }, NOW, () => 'x').date).toBe(
      '2026-09-29T20:00:00.000Z',
    );
  });
});

describe('buildMetaContent', () => {
  it('joins commit and date', () => {
    expect(buildMetaContent({ commit: 'abc', date: '2026-09-29T20:00:00.000Z' })).toBe(
      'abc 2026-09-29T20:00:00.000Z',
    );
  });
});
