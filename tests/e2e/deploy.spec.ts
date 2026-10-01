import { expect, test } from '@playwright/test';

test('version.json matches the build meta tag', async ({ page, request }) => {
  const response = await request.get('/version.json');
  expect(response.ok()).toBe(true);
  const info = (await response.json()) as { commit: string; date: string };
  expect(info.commit).toMatch(/^([0-9a-f]{7,40}|unknown)$/);
  expect(new Date(info.date).toISOString()).toBe(info.date);

  await page.goto('/');
  await expect(page.locator('meta[name="inkventure-build"]')).toHaveAttribute(
    'content',
    info.commit + ' ' + info.date,
  );
});

test('licences.txt lists the third-party code and fonts the site serves', async ({ request }) => {
  const response = await request.get('/licences.txt');
  expect(response.ok()).toBe(true);
  const text = await response.text();
  for (const name of [
    'preact',
    'inkjs',
    'ifvms',
    'glkote-term',
    'fflate',
    'Quixe',
    'core-js',
    'SystemJS',
  ]) {
    expect(text).toContain('## ' + name + ' - ');
  }
  expect(text).toContain('@fontsource/literata');
  expect(text).toContain('SIL OPEN FONT LICENSE');
});

// GitHub Pages serves the project site under /inkventure/. Emulate that origin and path with request routing,
// proxying to the local preview server, and fail on any request that escapes the sub-path.
test('the production build works from the GitHub Pages sub-path', async ({ page, baseURL }) => {
  const site = 'https://pages.test';
  const escaped: string[] = [];
  await page.route(site + '/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.indexOf('/inkventure/') !== 0) {
      escaped.push(url.pathname);
      return route.abort();
    }
    const local = baseURL + url.pathname.slice('/inkventure'.length) + url.search;
    return route.fulfill({ response: await route.fetch({ url: local }) });
  });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(site + '/inkventure/#/library');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page
    .getByRole('dialog', { name: 'Menu' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await expect(page).toHaveURL(site + '/inkventure/#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  // Fonts are requested lazily; make sure they resolve under the sub-path too.
  await page.evaluate(() => document.fonts.ready);
  expect(escaped).toEqual([]);
  expect(errors).toEqual([]);
});
