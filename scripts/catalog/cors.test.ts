import { describe, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  checkReadable,
  CORS_MAX_AGE_DAYS,
  isFresh,
  readableFrom,
  type Probe,
  type ProbeResponse,
} from './cors';

function response(status: number, headers: Record<string, string> = {}): ProbeResponse {
  return { status: status, header: (name) => headers[name.toLowerCase()] || null };
}

/** Answers from a table of URL → response, recording the requests. */
function probeOf(table: Record<string, ProbeResponse>) {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const probe: Probe = async (url, headers) => {
    requests.push({ url: url, headers: headers });
    const answer = table[url];
    if (!answer) throw new Error('unexpected ' + url);
    return answer;
  };
  return { probe, requests };
}

const URL_A = 'https://example.com/a.z5';

describe('checkReadable', () => {
  it('accepts a file whose host allows any origin, or the app', async () => {
    const any = probeOf({ [URL_A]: response(200, { 'access-control-allow-origin': '*' }) });
    expect(await checkReadable(URL_A, any.probe)).toEqual({ ok: true });
    expect(any.requests[0].headers).toEqual({ Origin: APP_ORIGIN, Range: 'bytes=0-15' });

    const app = probeOf({ [URL_A]: response(206, { 'access-control-allow-origin': APP_ORIGIN }) });
    expect(await checkReadable(URL_A, app.probe)).toEqual({ ok: true });
  });

  it('refuses a host without CORS headers, another origin, or an error', async () => {
    expect(await checkReadable(URL_A, probeOf({ [URL_A]: response(200) }).probe)).toEqual({
      ok: false,
      detail: 'no CORS headers',
    });
    const other = { 'access-control-allow-origin': 'https://other.example' };
    expect((await checkReadable(URL_A, probeOf({ [URL_A]: response(200, other) }).probe)).ok).toBe(
      false,
    );
    const cors = { 'access-control-allow-origin': '*' };
    expect(await checkReadable(URL_A, probeOf({ [URL_A]: response(404, cors) }).probe)).toEqual({
      ok: false,
      detail: 'HTTP 404',
    });
    expect(await checkReadable(URL_A, probeOf({ [URL_A]: response(503, cors) }).probe)).toEqual({
      ok: false,
      detail: 'HTTP 503',
      transient: true,
    });
  });

  it('follows redirects only when each of them allows the origin, never to plain HTTP', async () => {
    const final = 'https://cdn.example.com/a.z5';
    const cors = { 'access-control-allow-origin': '*' };
    const good = probeOf({
      [URL_A]: response(302, { ...cors, location: '/b.z5' }),
      'https://example.com/b.z5': response(301, { ...cors, location: final }),
      [final]: response(200, cors),
    });
    expect(await checkReadable(URL_A, good.probe)).toEqual({ ok: true });
    expect(good.requests.map((r) => r.url)).toEqual([URL_A, 'https://example.com/b.z5', final]);

    const bare = probeOf({
      [URL_A]: response(302, { location: final }),
      [final]: response(200, cors),
    });
    expect(await checkReadable(URL_A, bare.probe)).toEqual({
      ok: false,
      detail: 'redirect without CORS headers',
    });

    const insecure = probeOf({
      [URL_A]: response(302, { ...cors, location: 'http://example.com/a.z5' }),
    });
    expect(await checkReadable(URL_A, insecure.probe)).toEqual({
      ok: false,
      detail: 'not HTTPS: http://example.com/a.z5',
    });

    const loop = probeOf({ [URL_A]: response(302, { ...cors, location: URL_A }) });
    expect(await checkReadable(URL_A, loop.probe)).toEqual({
      ok: false,
      detail: 'too many redirects',
    });
  });
});

describe('cache', () => {
  const now = new Date('2026-09-30T00:00:00.000Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();

  it('reuses a check for CORS_MAX_AGE_DAYS', () => {
    expect(isFresh(undefined, now)).toBe(false);
    expect(isFresh({ ok: true, checked: daysAgo(1) }, now)).toBe(true);
    expect(isFresh({ ok: false, checked: daysAgo(CORS_MAX_AGE_DAYS + 1) }, now)).toBe(false);
    // Network and server errors are checked again at the next run.
    expect(isFresh({ ok: false, checked: daysAgo(1), transient: true }, now)).toBe(false);
  });

  it('only files checked and readable are readable', () => {
    const readable = readableFrom({
      [URL_A]: { ok: true, checked: daysAgo(1) },
      'https://example.com/b.z5': { ok: false, checked: daysAgo(1), detail: 'no CORS headers' },
    });
    expect(readable(URL_A)).toBe(true);
    expect(readable('https://example.com/b.z5')).toBe(false);
    expect(readable('https://example.com/never-checked.z5')).toBe(false);
  });
});
