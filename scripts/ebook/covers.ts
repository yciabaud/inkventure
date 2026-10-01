// Cover thumbnails of the ebook's game cards (SPEC §5.6: always IFDB's thumbnail, never the full-size image), fetched
// at build time and cached; a game without one gets the card's text placeholder.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { USER_AGENT } from '../catalog/fetcher.ts';

/** Cover size on a card, px (2:3 like the app's covers). */
export const COVER_WIDTH = 300;
export const COVER_HEIGHT = 450;

/**
 * IFDB's cover thumbnail URL, as the app builds it (`thumbnailUrl` in src/catalog/game.ts, which Node cannot import
 * for its extensionless imports; a unit test keeps both the same).
 */
export function coverUrl(tuid: string, width: number, height: number): string {
  const up = (n: number) => Math.ceil(n / 10) * 10;
  return (
    'https://ifdb.org/coverart?id=' +
    encodeURIComponent(tuid) +
    '&thumbnail=' +
    up(width) +
    'x' +
    up(height)
  );
}

export type FetchBytes = (url: string) => Promise<{ status: number; body: Uint8Array }>;

/** Image formats every EPUB reading system and the AZW3 conversion accept, by their first bytes. */
export function imageExtension(bytes: Uint8Array): 'jpg' | 'png' | 'gif' | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38)
    return 'gif';
  return undefined;
}

export const liveFetchBytes: FetchBytes = (url) =>
  fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) }).then(
    (response) =>
      response
        .arrayBuffer()
        .then((body) => ({ status: response.status, body: new Uint8Array(body) })),
  );

/**
 * The cover of a game as a file of `dir` (named `<tuid>.<ext>`), fetched unless already there; `undefined` (the
 * placeholder) when IFDB has none for it, or it cannot be fetched or is not an image the ebook can hold.
 */
export async function fetchCover(
  tuid: string,
  dir: string,
  fetchBytes: FetchBytes,
): Promise<string | undefined> {
  const cached = existsSync(dir)
    ? readdirSync(dir).find((name) => name.startsWith(tuid + '.'))
    : undefined;
  if (cached) return cached;
  let response;
  try {
    response = await fetchBytes(coverUrl(tuid, COVER_WIDTH, COVER_HEIGHT));
  } catch (error) {
    console.warn('Cover of ' + tuid + ': ' + (error as Error).message);
    return undefined;
  }
  const extension = response.status === 200 ? imageExtension(response.body) : undefined;
  if (!extension) {
    console.warn('Cover of ' + tuid + ': no image (HTTP ' + response.status + ')');
    return undefined;
  }
  mkdirSync(dir, { recursive: true });
  const name = tuid + '.' + extension;
  writeFileSync(join(dir, name), response.body);
  return name;
}
