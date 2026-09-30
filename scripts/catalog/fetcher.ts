// HTTP access for the crawler: a polite live fetcher (rate limit, identifying User-Agent, retries with backoff),
// a recording wrapper that saves responses as fixtures, and an offline fetcher that replays them (no network).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Response {
  status: number;
  body: string;
  /** Seconds to wait before retrying, from a `Retry-After` header. */
  retryAfter?: number;
}

export type Fetcher = (url: string) => Promise<Response>;

export const USER_AGENT =
  'InkventureCatalog/1.0 (+https://github.com/yciabaud/inkventure; static catalogue for e-readers)';

/** At most one request per `interval` ms (SPEC §5.2: ≤ 1 request/s). */
export class RateLimiter {
  private last = -Infinity;
  private readonly interval: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    interval: number,
    now: () => number = Date.now,
    sleep: (ms: number) => Promise<void> = delay,
  ) {
    this.interval = interval;
    this.now = now;
    this.sleep = sleep;
  }

  async wait(): Promise<void> {
    const ready = this.last + this.interval;
    const now = this.now();
    if (ready > now) await this.sleep(ready - now);
    this.last = this.now();
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  /** Attempts after the first one. */
  retries: number;
  /** First backoff in ms, doubled on each retry. */
  baseDelay: number;
  sleep?: (ms: number) => Promise<void>;
}

function retryable(response: Response): boolean {
  return response.status === 429 || response.status >= 500;
}

/**
 * Retries network errors, 429 and 5xx responses with exponential backoff (or the server's `Retry-After` when longer).
 * Other statuses are returned as they are. The last error or response is returned when retries run out.
 */
export function withRetries(fetcher: Fetcher, options: RetryOptions): Fetcher {
  const sleep = options.sleep || delay;
  return async (url) => {
    for (let attempt = 0; ; attempt++) {
      const backoff = options.baseDelay * Math.pow(2, attempt);
      let response: Response;
      try {
        response = await fetcher(url);
      } catch (error) {
        if (attempt >= options.retries) throw error;
        await sleep(backoff);
        continue;
      }
      if (!retryable(response) || attempt >= options.retries) return response;
      await sleep(Math.max(backoff, (response.retryAfter || 0) * 1000));
    }
  };
}

/** Fetches over the network, one request per second at most, identifying the project. */
export function liveFetcher(limiter: RateLimiter = new RateLimiter(1000)): Fetcher {
  return async (url) => {
    await limiter.wait();
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    const retryAfter = Number(response.headers.get('retry-after'));
    return {
      status: response.status,
      body: await response.text(),
      retryAfter: retryAfter > 0 ? retryAfter : undefined,
    };
  };
}

/**
 * Fixture file name for a URL: the endpoint (`search`, `viewgame`…) and, for a game, its TUID, else a short hash of
 * the URL. Stable, so recording and replaying agree.
 */
export function fixtureName(url: string): string {
  const parsed = new URL(url);
  const endpoint = parsed.pathname.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-') || 'root';
  const id = parsed.searchParams.get('id');
  const key =
    endpoint === 'viewgame' && id && /^[a-z0-9]+$/i.test(id)
      ? id
      : createHash('sha1').update(url).digest('hex').slice(0, 12);
  return endpoint + '-' + key + '.json';
}

interface Fixture {
  url: string;
  status: number;
  body: string;
}

/** Saves every response of `fetcher` in `dir` (`--record`). */
export function recordingFetcher(fetcher: Fetcher, dir: string): Fetcher {
  return async (url) => {
    const response = await fetcher(url);
    mkdirSync(dir, { recursive: true });
    const fixture: Fixture = { url: url, status: response.status, body: response.body };
    writeFileSync(join(dir, fixtureName(url)), JSON.stringify(fixture, null, 2) + '\n');
    return response;
  };
}

/** Replays recorded responses from `dir` (`--offline`); a URL without a fixture is an error, never a request. */
export function offlineFetcher(dir: string): Fetcher {
  return async (url) => {
    const path = join(dir, fixtureName(url));
    if (!existsSync(path)) throw new Error('No fixture for ' + url + ' (' + path + ')');
    const fixture = JSON.parse(readFileSync(path, 'utf8')) as Fixture;
    if (fixture.url !== url) throw new Error('Fixture ' + path + ' is for ' + fixture.url);
    return { status: fixture.status, body: fixture.body };
  };
}
