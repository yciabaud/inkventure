import { expect, test } from '@playwright/test';

test('a pref persists across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await page.evaluate(() => window.__inkventure!.setPrefs({ locale: 'fr' }));

  await page.reload();
  // The saved locale is applied on start (S0.5).
  await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
  expect(await page.evaluate(() => window.__inkventure!.getPrefs())).toEqual({ locale: 'fr' });
  expect(await page.evaluate(() => localStorage.getItem('ik:v1:prefs'))).toBe('{"locale":"fr"}');
  expect(await page.evaluate(() => localStorage.getItem('ik:schema'))).toBe('1');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('the app still runs with storage disabled, with a non-blocking warning', async ({ page }) => {
  await page.addInitScript(() => {
    const denied = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    // Access denied (disabled site data); writes denied too, in case an engine won't let us redefine it.
    try {
      Object.defineProperty(window, 'localStorage', { configurable: true, get: denied });
    } catch {
      // Covered by the setItem override below.
    }
    Storage.prototype.setItem = denied;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  const notice = page.getByRole('status');
  await expect(notice).toContainText('not saving data');
  expect(await page.evaluate(() => window.__inkventure!.persistent)).toBe(false);

  // Navigation still works and prefs live in memory for the session.
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Library' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  expect(await page.evaluate(() => window.__inkventure!.setPrefs({ locale: 'fr' }))).toEqual({
    locale: 'fr',
  });

  const dismiss = notice.getByRole('button', { name: 'Dismiss' });
  const box = (await dismiss.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await dismiss.click();
  await expect(page.getByRole('status')).toHaveCount(0);
});
