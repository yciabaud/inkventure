// The sample catalogue committed in public/catalog/ for local development and tests (story S2.3): the synthetic IFDB
// fixtures run through the whole pipeline (crawl offline → resolve → emit). The weekly workflow replaces it with the
// real catalogue in deployed builds.
// It includes featured.json, made from the curated sample games of tests/fixtures/featured.json (S2.4).
import { readFileSync } from 'node:fs';
import { crawl, type CacheEntry } from './crawler.ts';
import { emit, type CatalogFiles } from './emitter.ts';
import { buildFeatured, catalogView, type CuratedFile } from './featured.ts';
import { offlineFetcher } from './fetcher.ts';
import { uiLocales } from './locales.ts';
import { resolve, type ContentPolicyConfig, type StoryFormat } from './resolver.ts';

/** Fixed, so the committed sample only changes when the pipeline or the fixtures do. */
export const SAMPLE_BUILT = '2026-01-01T00:00:00.000Z';

export async function sampleCatalog(): Promise<CatalogFiles> {
  const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
  const queries = readJson<{ queries: string[] }>('scripts/catalog/queries.json').queries;
  const entries = new Map<string, CacheEntry>();
  const cache = {
    get: (tuid: string) => entries.get(tuid),
    set: (e: CacheEntry) => void entries.set(e.tuid, e),
  };
  const { dataset } = await crawl(
    offlineFetcher('tests/fixtures/ifdb'),
    queries,
    cache,
    new Date(SAMPLE_BUILT),
  );
  const resolution = resolve(dataset, {
    enabledFormats: readJson<{ enabledFormats: StoryFormat[] }>('scripts/catalog/playability.json')
      .enabledFormats,
    policy: 'general',
    config: readJson<ContentPolicyConfig>('scripts/catalog/content-policy.json'),
  });
  const files = emit(resolution.games, { built: SAMPLE_BUILT, policy: 'general' });
  // The featured lists, from a curated file of sample games (content/featured.json names real ones).
  files['featured.json'] = buildFeatured(
    readJson<CuratedFile>('tests/fixtures/featured.json'),
    catalogView(files),
    readJson<ContentPolicyConfig>('scripts/catalog/content-policy.json'),
    uiLocales(),
    SAMPLE_BUILT,
  ).file;
  return files;
}
