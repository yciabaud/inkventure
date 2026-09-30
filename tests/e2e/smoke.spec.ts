import { expect, test } from '@playwright/test';

test('app loads at / with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  // No network in tests: the Featured shelf's IFDB cover thumbnails get a blank image.
  await page.route('https://ifdb.org/**', (route) =>
    route.fulfill({
      contentType: 'image/gif',
      body: Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'),
    }),
  );
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Inkventure', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  expect(errors).toEqual([]);
});
