import { expect, test, type Page } from '@playwright/test';

// 1×1 transparent GIF standing in for an IFDB cover thumbnail.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// No real network in tests: IF Archive main site "blocks" CORS, its mirror allows it, the IFDB API is blocked.
async function mockNetwork(page: Page) {
  await page.route('https://ifarchive.org/**', (route) => route.abort('failed'));
  await page.route('https://mirror.ifarchive.org/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' },
      body: Buffer.alloc(1024),
    }),
  );
  await page.route('https://ifdb.org/search**', (route) => route.abort('failed'));
  await page.route('https://ifdb.org/coverart**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/gif', body: GIF }),
  );
}

function line(report: string, key: string): string {
  const match = new RegExp('^' + key.replace(/\./g, '\\.') + ': (.*)$', 'm').exec(report);
  return match ? match[1] : '';
}

test('the probe runs every check and prints a report', async ({ page }) => {
  await mockNetwork(page);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/probe/');
  await expect(page.locator('#status')).toHaveText('Done', { timeout: 60_000 });
  const report = await page.locator('#report').textContent();
  const text = report || '';

  expect(text.split('\n')[0]).toBe('inkventure-probe v1');
  expect(line(text, 'build.commit')).toMatch(/^([0-9a-f]{7,12}|unknown)$/);
  expect(line(text, 'device.userAgent')).not.toBe('');
  expect(line(text, 'js.syntax.yes')).toContain('arrow');
  expect(line(text, 'storage.localStorage')).toBe('yes');
  expect(line(text, 'storage.persistence')).toMatch(/^run #1, first run /);
  expect(line(text, 'storage.quotaChars')).toMatch(/M chars/);
  expect(line(text, 'css.flexbox')).toContain('flex:yes');
  expect(line(text, 'perf.json')).toMatch(/KB: parse \d+ ms/);
  expect(line(text, 'net.xhrArraybuffer')).toBe('yes');
  expect(line(text, 'net.ifArchive')).toMatch(/^blocked/);
  expect(line(text, 'net.ifArchiveMirror')).toBe('ok 200 (1024 bytes)');
  expect(line(text, 'net.ifdbApi')).toMatch(/^blocked/);
  expect(line(text, 'net.ifdbCoverImage')).toBe('ok 1x1');
  expect(line(text, 'app.render')).toMatch(/^\d+ ms to first render of Home$/);
  expect(line(text, 'app.bundle')).toBe('modern (ES modules)');
  expect(line(text, 'app.fontFormat')).toMatch(/woff2/);
  expect(text).not.toMatch(/^errors:/m);
  expect(errors).toEqual([]);

  // The copyable text matches the report, and the storage it used for the quota test was cleaned up.
  await expect(page.locator('#copy')).toHaveValue(text);
  const leftovers = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.indexOf('ik-probe:quota') === 0),
  );
  expect(leftovers).toEqual([]);

  await page.locator('#show-qr').click();
  const codes = page.locator('#qr img');
  await expect(codes.first()).toBeVisible();
  const count = await codes.count();
  expect(count).toBeGreaterThan(1);
  await expect(page.locator('#qr')).toContainText('Part ' + count + '/' + count);
});

test('a second run shows that storage persisted', async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/probe/');
  await expect(page.locator('#status')).toHaveText('Done', { timeout: 60_000 });
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Done', { timeout: 60_000 });
  const text = (await page.locator('#report').textContent()) || '';
  expect(line(text, 'storage.persistence')).toMatch(/^run #2, first run /);
});

test('the swipe box records touch input', async ({ page }) => {
  test.skip(!test.info().project.use.hasTouch, 'touch projects only');
  await mockNetwork(page);
  await page.goto('/probe/');
  await page.locator('#swipe').tap();
  const text = (await page.locator('#report').textContent()) || '';
  expect(line(text, 'input.eventsSeen')).toContain('touchstart');
  expect(line(text, 'input.lastSwipe')).toMatch(/^tap/);
});
