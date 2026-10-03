import { expect, test, type Page } from '@playwright/test';

// Its own Service Worker is the subject of these tests (blocked by default, playwright.config.ts).
test.use({ serviceWorkers: 'allow' });

// The offline probe (S0.9) stores a story file from the IF Archive: answer with a small CORS-enabled file.
const STORY_BYTES = 2048;

async function mockNetwork(page: Page) {
  await page.route('https://ifarchive.org/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' },
      body: Buffer.alloc(STORY_BYTES),
    }),
  );
}

function line(report: string, key: string): string {
  const prefix = key + ': ';
  const found = report.split('\n').find((row) => row.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

async function report(page: Page): Promise<string> {
  await expect(page.locator('#status')).toHaveText('Done', { timeout: 60_000 });
  return (await page.locator('#report').textContent()) || '';
}

test('the offline probe stores the page, a story file and test files', async ({ page }) => {
  await mockNetwork(page);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/probe/offline/');
  const text = await report(page);

  expect(text.split('\n')[0]).toBe('inkventure-offline-probe v1');
  expect(line(text, 'run')).toMatch(/^#1, first run /);
  expect(line(text, 'net.site')).toBe('reachable');
  expect(line(text, 'sw.register')).toMatch(/^ok /);
  expect(line(text, 'sw.shellCached')).toBe('4 files');
  expect(line(text, 'cache.storyFile')).toMatch(
    new RegExp('^stored now: ' + STORY_BYTES + ' bytes'),
  );
  expect(line(text, 'cache.blob-1mb')).toMatch(/^stored now: 1048576 bytes/);
  expect(line(text, 'idb.blob-1mb')).toMatch(/^stored now: 1048576 bytes/);
  expect(text).not.toMatch(/^errors:/m);
  expect(errors).toEqual([]);
});

test('with the network off, the page reloads and finds what it stored', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'offline emulation of a Service Worker is reliable in Chromium only',
  );
  await mockNetwork(page);
  await page.goto('/probe/offline/');
  expect(line(await report(page), 'sw.controlledNow')).toBe('yes');

  // setOffline does not reach the Service Worker's own fetches in Chromium: also fail every request to the site.
  await context.setOffline(true);
  await context.route(/^http:\/\/localhost:\d+\//, (route) => route.abort('internetdisconnected'));
  await page.reload();
  const text = await report(page);
  await context.setOffline(false);

  expect(line(text, 'device.online')).toBe('no');
  expect(line(text, 'run')).toMatch(/^#2, /);
  expect(line(text, 'net.site')).toMatch(/^unreachable/);
  expect(line(text, 'offline.reload')).toMatch(/^ok /);
  expect(line(text, 'cache.storyFile')).toMatch(
    new RegExp('^kept from an earlier run: ' + STORY_BYTES + ' bytes'),
  );
  expect(line(text, 'cache.blob-20mb')).toMatch(/^kept: 20971520 bytes/);
  expect(line(text, 'idb.blob-20mb')).toMatch(/^kept: 20971520 bytes/);

  // "Clear test data" removes the worker, the caches, the database and the counters.
  await page.locator('#clear').click();
  await expect(page.locator('#status')).toHaveText(/^Test data cleared/);
  const left = await page.evaluate(async () => ({
    workers: (await navigator.serviceWorker.getRegistrations()).length,
    caches: (await caches.keys()).filter((name) => name.indexOf('ik-probe-offline') === 0),
    local: Object.keys(localStorage).filter((key) => key.indexOf('ik-probe-offline:') === 0),
  }));
  expect(left).toEqual({ workers: 0, caches: [], local: [] });
});
