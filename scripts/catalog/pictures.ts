// Illustrated games (SPEC §5.2 step 2; story S2.5). A game is illustrated when its story file is a Blorb holding at
// least MIN_PICTURES pictures besides the cover, in a format whose engine draws pictures. The Blorb resource index
// (`RIdx`) is the first chunk of the file, so only its head is read: an HTTP Range request, or the first bytes of the
// whole file when the host ignores Range. Results are cached per file URL (with its size and Last-Modified) and kept
// on the `catalog` branch, so a weekly run only inspects new files and those whose check is old.
import type { ResolvedGame, StoryFormat } from './resolver.ts';

/** Formats whose engine draws pictures: Glulx (S1.10). Z-code Blorbs join once an engine renders their pictures. */
export const PICTURE_FORMATS: StoryFormat[] = ['glulx'];

/** Pictures besides the cover a game needs to be illustrated. */
export const MIN_PICTURES = 2;

/** Bytes asked for first: the index of a Blorb with up to ~330 resources. */
export const HEAD_BYTES = 4096;

/** A resource index needing more than this is not believed (a broken or hostile file). */
export const MAX_HEAD_BYTES = 256 * 1024;

/** A file's check is reused this long; after that it is revalidated (If-Modified-Since) or inspected again. */
export const PICTURES_MAX_AGE_DAYS = 90;

export type BlorbHead =
  | { kind: 'not-blorb' }
  /** The index goes on past the bytes read: `needed` bytes from the start hold it. */
  | { kind: 'truncated'; needed: number }
  | {
      kind: 'blorb';
      /** `Pict` resources in the index, the cover included. */
      pictures: number;
      /** Picture number of the cover (`Fspc` chunk), when the file has one and it is in the bytes read. */
      cover?: number;
      /** Pictures besides the cover. When the `Fspc` chunk is not in the head, one picture is assumed to be it. */
      besidesCover: number;
    };

function ascii(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

/**
 * Reads the resource index at the head of a Blorb (`FORM … IFRS`, then `RIdx`: a count and 12-byte entries of usage,
 * number and offset), then walks the chunks that follow while their headers are in `bytes`, looking for the cover
 * (`Fspc`, the frontispiece's picture number).
 */
export function parseBlorbHead(bytes: Uint8Array): BlorbHead {
  if (bytes.length < 12) return { kind: 'truncated', needed: 12 };
  if (ascii(bytes, 0) !== 'FORM' || ascii(bytes, 8) !== 'IFRS') return { kind: 'not-blorb' };
  if (bytes.length < 24) return { kind: 'truncated', needed: 24 };
  // The Blorb specification puts the index first.
  if (ascii(bytes, 12) !== 'RIdx') return { kind: 'not-blorb' };
  const indexLength = u32(bytes, 16);
  const count = u32(bytes, 20);
  if (indexLength < 4 + count * 12) return { kind: 'not-blorb' };
  const indexEnd = 24 + count * 12;
  if (bytes.length < indexEnd) return { kind: 'truncated', needed: indexEnd };

  const numbers: number[] = [];
  for (let i = 0; i < count; i++) {
    const at = 24 + i * 12;
    if (ascii(bytes, at) === 'Pict') numbers.push(u32(bytes, at + 4));
  }

  const formEnd = 8 + u32(bytes, 4);
  let cover: number | undefined;
  let walked = false;
  let at = 20 + indexLength + (indexLength & 1);
  while (at + 8 <= bytes.length && at < formEnd) {
    const length = u32(bytes, at + 4);
    if (ascii(bytes, at) === 'Fspc') {
      if (at + 12 <= bytes.length) cover = u32(bytes, at + 8);
      break;
    }
    at += 8 + length + (length & 1);
  }
  if (cover === undefined && at >= formEnd) walked = true;

  let besidesCover: number;
  if (cover !== undefined) besidesCover = numbers.length - (numbers.indexOf(cover) >= 0 ? 1 : 0);
  else if (walked) besidesCover = numbers.length;
  else besidesCover = Math.max(0, numbers.length - 1);
  const head: BlorbHead = { kind: 'blorb', pictures: numbers.length, besidesCover: besidesCover };
  if (cover !== undefined) head.cover = cover;
  return head;
}

/** The first bytes of a story file, as one request gave them. */
export interface HeadResponse {
  status: number;
  /** At most the bytes asked for (fewer when the file is shorter). */
  bytes: Uint8Array;
  /** Size of the whole file, when the response says it. */
  size?: number;
  lastModified?: string;
}

/** Asks for the first `length` bytes of `url`, with extra request headers (If-Modified-Since). */
export type FetchHead = (
  url: string,
  length: number,
  headers: Record<string, string>,
) => Promise<HeadResponse>;

/**
 * The first `length` bytes of a response to a Range request: a 206 holds them; a 200 (Range not honoured) is the
 * whole file, read only until `length` bytes have arrived and then closed.
 */
export async function readHead(response: Response, length: number): Promise<HeadResponse> {
  const head: HeadResponse = { status: response.status, bytes: new Uint8Array(0) };
  const lastModified = response.headers.get('last-modified');
  if (lastModified) head.lastModified = lastModified;
  const range = /\/(\d+)\s*$/.exec(response.headers.get('content-range') || '');
  const contentLength = response.headers.get('content-length');
  if (range) head.size = Number(range[1]);
  else if (response.status === 200 && contentLength) head.size = Number(contentLength);
  if ((response.status !== 200 && response.status !== 206) || !response.body) {
    if (response.body) await response.body.cancel();
    return head;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  while (received < length) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
  }
  if (received >= length) await reader.cancel();
  const bytes = new Uint8Array(Math.min(received, length));
  let at = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - at);
    bytes.set(part, at);
    at += part.length;
    if (at >= bytes.length) break;
  }
  head.bytes = bytes;
  return head;
}

export interface PicturesEntry {
  /** Date of the check (ISO). */
  checked: string;
  /** Pictures besides the cover; only for a Blorb whose index could be read. */
  pictures?: number;
  size?: number;
  lastModified?: string;
  /** Why the file has no count: not a Blorb, an HTTP error… */
  detail?: string;
  /** A network or server error, or rate limiting: checked again at the next run. */
  transient?: boolean;
}

/** Story file URL → last check. Kept on the `catalog` branch with the record cache. */
export type PicturesCache = Record<string, PicturesEntry>;

/**
 * Inspects the head of the Blorb at `url`. With `previous` (an old check carrying Last-Modified), the request is
 * conditional and an unchanged file (304) keeps its count. A head too short for its index is asked for again once,
 * as long as needed (up to MAX_HEAD_BYTES).
 */
export async function inspect(
  url: string,
  fetchHead: FetchHead,
  now: Date,
  previous?: PicturesEntry,
): Promise<PicturesEntry> {
  const checked = now.toISOString();
  const headers: Record<string, string> = {};
  if (previous && previous.lastModified && !previous.transient) {
    headers['If-Modified-Since'] = previous.lastModified;
  }
  let length = HEAD_BYTES;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetchHead(url, length, headers);
    if (response.status === 304 && previous) return { ...previous, checked: checked };
    if (response.status >= 500 || response.status === 429) {
      return { checked: checked, detail: 'HTTP ' + response.status, transient: true };
    }
    if (response.status !== 200 && response.status !== 206) {
      return { checked: checked, detail: 'HTTP ' + response.status };
    }
    const entry: PicturesEntry = { checked: checked };
    if (response.size !== undefined) entry.size = response.size;
    if (response.lastModified) entry.lastModified = response.lastModified;
    const head = parseBlorbHead(response.bytes);
    if (head.kind === 'blorb') {
      entry.pictures = head.besidesCover;
      return entry;
    }
    if (head.kind === 'not-blorb') {
      entry.detail = 'not a Blorb';
      return entry;
    }
    // Truncated: the file ends before its index does, or the index needs more bytes than were asked for.
    if (response.bytes.length < length) {
      entry.detail = 'not a Blorb (truncated)';
      return entry;
    }
    if (head.needed > MAX_HEAD_BYTES) {
      entry.detail = 'resource index too large';
      return entry;
    }
    length = head.needed;
    delete headers['If-Modified-Since'];
  }
  return { checked: checked, detail: 'resource index not read' };
}

/** Whether a cached check is recent enough to reuse without asking the host. */
export function isFresh(entry: PicturesEntry | undefined, now: Date): boolean {
  if (!entry || entry.transient) return false;
  const age = now.getTime() - new Date(entry.checked).getTime();
  return age >= 0 && age < PICTURES_MAX_AGE_DAYS * 24 * 3600 * 1000;
}

const BLORB_NAME = /\.(gblorb|glb|zblorb|zlb|blorb|blb)$/i;

/** Whether a game's file is worth inspecting: an uncompressed Blorb in a format whose engine draws pictures. */
export function isCandidate(game: Pick<ResolvedGame, 'format' | 'file'>): boolean {
  if (PICTURE_FORMATS.indexOf(game.format) < 0 || game.file.archive) return false;
  const name = game.file.url.split(/[?#]/)[0];
  return /^blorb\//.test(game.file.ifdbFormat || '') || BLORB_NAME.test(name);
}

/** The story files to inspect, each once, sorted. */
export function urlsToInspect(games: ResolvedGame[]): string[] {
  const urls: string[] = [];
  for (const game of games) {
    if (isCandidate(game) && urls.indexOf(game.file.url) < 0) urls.push(game.file.url);
  }
  return urls.sort();
}

/** The resolver's `pictures` for a cache: pictures besides the cover, or undefined when unknown. */
export function picturesFrom(cache: PicturesCache): (url: string) => number | undefined {
  return (url) => {
    const entry = cache[url];
    return entry ? entry.pictures : undefined;
  };
}
