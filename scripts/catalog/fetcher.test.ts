import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixtureName,
  offlineFetcher,
  RateLimiter,
  recordingFetcher,
  withRetries,
  type Fetcher,
  type Response,
} from './fetcher';

/** A fake clock whose sleep advances time. */
function clock() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
    advance: (ms: number) => (time += ms),
    sleeps: sleeps,
  };
}

describe('RateLimiter', () => {
  it('spaces requests by at least the interval', async () => {
    const c = clock();
    const limiter = new RateLimiter(1000, c.now, c.sleep);
    await limiter.wait();
    await limiter.wait();
    c.advance(300);
    await limiter.wait();
    expect(c.sleeps).toEqual([1000, 700]);
  });

  it('does not wait when the interval has already passed', async () => {
    const c = clock();
    const limiter = new RateLimiter(1000, c.now, c.sleep);
    await limiter.wait();
    c.advance(5000);
    await limiter.wait();
    expect(c.sleeps).toEqual([]);
  });
});

describe('withRetries', () => {
  function scripted(answers: Array<Response | Error>): Fetcher & { calls: number } {
    let calls = 0;
    const fetcher: Fetcher = async () => {
      const answer = answers[calls++];
      if (answer instanceof Error) throw answer;
      return answer;
    };
    Object.defineProperty(fetcher, 'calls', { get: () => calls });
    return fetcher as Fetcher & { calls: number };
  }

  it('retries network errors, 429 and 5xx with exponential backoff', async () => {
    const c = clock();
    const fetcher = scripted([
      new Error('ECONNRESET'),
      { status: 503, body: '' },
      { status: 429, body: '' },
      { status: 200, body: 'ok' },
    ]);
    const response = await withRetries(fetcher, { retries: 4, baseDelay: 100, sleep: c.sleep })(
      'u',
    );
    expect(response.body).toBe('ok');
    expect(c.sleeps).toEqual([100, 200, 400]);
  });

  it('honours a longer Retry-After', async () => {
    const c = clock();
    const fetcher = scripted([
      { status: 429, body: '', retryAfter: 5 },
      { status: 200, body: 'ok' },
    ]);
    await withRetries(fetcher, { retries: 2, baseDelay: 100, sleep: c.sleep })('u');
    expect(c.sleeps).toEqual([5000]);
  });

  it('does not retry other statuses, and gives up after the last retry', async () => {
    const c = clock();
    const notFound = scripted([{ status: 404, body: '' }]);
    expect(
      (await withRetries(notFound, { retries: 3, baseDelay: 1, sleep: c.sleep })('u')).status,
    ).toBe(404);
    expect(notFound.calls).toBe(1);

    const down = scripted([
      { status: 500, body: '' },
      { status: 502, body: '' },
    ]);
    expect(
      (await withRetries(down, { retries: 1, baseDelay: 1, sleep: c.sleep })('u')).status,
    ).toBe(502);
    const broken = scripted([new Error('a'), new Error('b')]);
    await expect(
      withRetries(broken, { retries: 1, baseDelay: 1, sleep: c.sleep })('u'),
    ).rejects.toThrow('b');
  });
});

describe('fixtures', () => {
  it('names fixtures by endpoint and TUID, or by a hash of the URL', () => {
    expect(fixtureName('https://ifdb.org/viewgame?json&id=abc123')).toBe('viewgame-abc123.json');
    const a = fixtureName('https://ifdb.org/search?json&searchfor=x&pg=1');
    expect(a).toMatch(/^search-[0-9a-f]{12}\.json$/);
    expect(fixtureName('https://ifdb.org/search?json&searchfor=x&pg=2')).not.toBe(a);
  });

  it('replays what was recorded, and never fetches a URL without a fixture', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifdb-fixtures-'));
    const live: Fetcher = async (url) => ({ status: 200, body: 'body of ' + url });
    const url = 'https://ifdb.org/viewgame?json&id=abc';
    await recordingFetcher(live, dir)(url);
    expect(readdirSync(dir)).toEqual(['viewgame-abc.json']);
    expect(await offlineFetcher(dir)(url)).toEqual({ status: 200, body: 'body of ' + url });
    await expect(offlineFetcher(dir)('https://ifdb.org/viewgame?json&id=zzz')).rejects.toThrow(
      /No fixture/,
    );
  });
});
