// Can the app read a story file from the browser? (SPEC §5.5; follow-up of S3.4.) The app downloads story files
// directly from their host, which only works when the host answers with CORS headers allowing any origin (or the
// app's). The IF Archive does (verified on a Kindle in S0.3); other hosts are checked by the weekly catalogue build,
// once per file every CORS_MAX_AGE_DAYS, and the resolver leaves out the games whose file cannot be read.

/** The origin the app is served from (GitHub Pages); `*` works for it too. */
export const APP_ORIGIN = 'https://yciabaud.github.io';

/** A file's check is reused this long. */
export const CORS_MAX_AGE_DAYS = 30;

/** Redirects followed at most (each must allow the origin, like a browser's CORS request). */
export const MAX_REDIRECTS = 5;

export interface CorsEntry {
  ok: boolean;
  /** Date of the check (ISO). */
  checked: string;
  /** Why the file cannot be read. */
  detail?: string;
  /** A network or server error: checked again at the next run instead of after CORS_MAX_AGE_DAYS. */
  transient?: boolean;
}

/** Story file URL → last check. Kept on the `catalog` branch with the record cache. */
export type CorsCache = Record<string, CorsEntry>;

/** One HTTP request, redirects not followed. */
export interface ProbeResponse {
  status: number;
  header: (name: string) => string | null;
}

export type Probe = (url: string, headers: Record<string, string>) => Promise<ProbeResponse>;

function allows(response: ProbeResponse): boolean {
  const origin = response.header('access-control-allow-origin');
  return !!origin && (origin.trim() === '*' || origin.trim() === APP_ORIGIN);
}

/**
 * Whether a browser page on APP_ORIGIN could read `url`: every response on the way (redirects included) must allow
 * the origin, the last one must succeed, and no redirect may lead to plain HTTP. Only the first bytes are asked for.
 */
export async function checkReadable(
  url: string,
  probe: Probe,
): Promise<{ ok: boolean; detail?: string; transient?: boolean }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https:\/\//i.test(current)) return { ok: false, detail: 'not HTTPS: ' + current };
    const response = await probe(current, { Origin: APP_ORIGIN, Range: 'bytes=0-15' });
    const location = response.header('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (!allows(response)) return { ok: false, detail: 'redirect without CORS headers' };
      current = new URL(location, current).toString();
      continue;
    }
    if (response.status >= 500) {
      return { ok: false, detail: 'HTTP ' + response.status, transient: true };
    }
    if (response.status >= 400) return { ok: false, detail: 'HTTP ' + response.status };
    if (!allows(response)) return { ok: false, detail: 'no CORS headers' };
    return { ok: true };
  }
  return { ok: false, detail: 'too many redirects' };
}

/** Whether a cached check is recent enough to reuse. */
export function isFresh(entry: CorsEntry | undefined, now: Date): boolean {
  if (!entry || entry.transient) return false;
  const age = now.getTime() - new Date(entry.checked).getTime();
  return age >= 0 && age < CORS_MAX_AGE_DAYS * 24 * 3600 * 1000;
}

/** The resolver's `readable` for a cache: files never checked, or checked and refused, are not readable. */
export function readableFrom(cache: CorsCache): (url: string) => boolean {
  return (url) => {
    const entry = cache[url];
    return !!entry && entry.ok;
  };
}
