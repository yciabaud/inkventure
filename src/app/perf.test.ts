import { afterEach, describe, expect, it, vi } from 'vitest';
import { measured, perfNow, setPerfEnabled } from './perf';

describe('timings', () => {
  afterEach(() => {
    setPerfEnabled(false);
    vi.restoreAllMocks();
  });

  it('logs a timing only when timings are on, rounded, from the given start', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    measured('home', 0);
    expect(info).not.toHaveBeenCalled();

    setPerfEnabled(true);
    const start = perfNow() - 1234.4;
    measured('page', start);
    const message = String(info.mock.calls[0][0]);
    expect(message).toMatch(/^\[perf\] page: \d+ ms$/);
    expect(Number(/(\d+) ms/.exec(message)![1])).toBeGreaterThanOrEqual(1234);
  });

  it('counts from the last address change', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    setPerfEnabled(true);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    measured('library');
    expect(Number(/(\d+) ms/.exec(String(info.mock.calls[0][0]))![1])).toBeLessThan(1000);
  });
});
