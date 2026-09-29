import { expect, test } from '@playwright/test';

test('app loads at / with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Inkventure' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  expect(errors).toEqual([]);
});
