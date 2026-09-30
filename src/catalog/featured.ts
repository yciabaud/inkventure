// Featured shelf data (SPEC §5.3; story S4.1): `featured.json`, one list per UI locale (curated games with their pitch,
// then the best-rated ones in that language), and what the Home shelf shows of it.
import type { FeaturedFile, FeaturedRow } from '../../scripts/catalog/featured';
import { CATALOG_BASE, getJson } from './loader';

export type { FeaturedFile, FeaturedRow };

/** The featured lists format this app reads (scripts/catalog/featured.ts FEATURED_VERSION). */
export const SUPPORTED_FEATURED_VERSION = 1;

/** Games shown on the shelf at most, all pages together. */
export const SHELF_MAX = 24;

let cached: Promise<FeaturedFile> | null = null;

/** `featured.json`, loaded once per session; a failed load is retried by the next call. */
export function loadFeatured(base: string = CATALOG_BASE): Promise<FeaturedFile> {
  if (!cached) {
    cached = getJson(base + 'featured.json').then((data) => {
      const file = data as FeaturedFile;
      if (!file || file.version !== SUPPORTED_FEATURED_VERSION || !file.locales) {
        throw new Error('Unsupported featured lists');
      }
      return file;
    });
    cached.catch(() => (cached = null));
  }
  return cached;
}

/** For tests: forget the loaded lists. */
export function resetFeatured(): void {
  cached = null;
}

/**
 * The shelf of a UI locale: its list in order, without the games already in progress (started or added to Home),
 * at most `max` games. A locale without a list shows nothing (the shelf only offers games in the reader's language).
 */
export function featuredFor(
  file: FeaturedFile,
  locale: string,
  inProgress: (tuid: string) => boolean,
  max: number = SHELF_MAX,
): FeaturedRow[] {
  const list = file.locales[locale] || [];
  const shown: FeaturedRow[] = [];
  for (let i = 0; i < list.length && shown.length < max; i++) {
    if (!inProgress(list[i].t)) shown.push(list[i]);
  }
  return shown;
}
