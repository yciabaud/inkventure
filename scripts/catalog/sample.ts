// The sample catalogue committed in public/catalog/ for local development and tests (story S2.3): the synthetic IFDB
// fixtures run through the whole pipeline (crawl offline → resolve → emit). The weekly workflow replaces it with the
// real catalogue in deployed builds.
// It includes featured.json, made from the curated sample games of tests/fixtures/featured.json (S2.4), and one
// illustrated game, from the picture counts of tests/fixtures/pictures.json (the cache check-pictures.ts keeps, S2.5),
// and one ink game served as a zipped web export, whose story tests/fixtures/ink-exports.json locates (as the cache
// check-ink.ts keeps, S2.7; the zip itself is tests/fixtures/ink/tide.zip, built at install), and one Decker game, the
// tour deck as a zipped web export, whose page tests/fixtures/decker-exports.json names (as the cache check-decker.ts
// keeps, S2.9; the zip is tests/fixtures/decker/tour.zip, built at install).
import { readFileSync } from 'node:fs';
import { crawl, type CacheEntry } from './crawler.ts';
import { deckerPageFrom, type DeckerCache } from './decker.ts';
import { emit, type CatalogFiles } from './emitter.ts';
import { buildFeatured, catalogView, type CuratedFile } from './featured.ts';
import { offlineFetcher } from './fetcher.ts';
import { inkStoryFrom, type InkCache } from './ink.ts';
import { picturesFrom, type PicturesCache } from './pictures.ts';
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
    pictures: picturesFrom(readJson<PicturesCache>('tests/fixtures/pictures.json')),
    inkStory: inkStoryFrom(readJson<InkCache>('tests/fixtures/ink-exports.json')),
    deckerPage: deckerPageFrom(readJson<DeckerCache>('tests/fixtures/decker-exports.json')),
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
