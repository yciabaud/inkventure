import type { Page } from '@playwright/test';

/** A synthetic catalogue of `count` games (titles "Adventure 01"…), served through page.route instead of the sample. */
export function syntheticCatalog(count: number, shardSize = 25) {
  const rows = Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return {
      t: 'syn' + n,
      n: (i === 2 ? 'Écho ' : 'Adventure ') + n,
      a: i % 5 === 0 ? 'Zoë Author' : 'Some Writer',
      y: 1990 + (i % 30),
      l: 'en',
      f: 'zcode',
      r: 3.5,
      rc: 10 + i,
      p: i % 2 ? 45 : 120,
      c: i % 3 === 0 ? 1 : undefined,
    };
  });
  const shards: Record<string, unknown> = {};
  for (let i = 0; i * shardSize < count; i++) {
    shards['index-' + i + '.json'] = { rows: rows.slice(i * shardSize, (i + 1) * shardSize) };
  }
  const meta = {
    version: 1,
    built: '2026-01-01T00:00:00.000Z',
    policy: 'general',
    count: count,
    shards: Object.keys(shards),
    facets: { languages: [['en', count]], genres: [], formats: [['zcode', count]] },
  };
  return { meta, shards };
}

/** Serves `catalog` for catalog/*.json and blocks IFDB cover thumbnails (no network in tests). */
export async function routeCatalog(page: Page, catalog = syntheticCatalog(40)) {
  await page.route('https://ifdb.org/**', (route) => route.abort());
  await page.route(/\/catalog\/[^/]+\.json$/, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const body = name === 'meta.json' ? catalog.meta : catalog.shards[name];
    if (!body) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}
