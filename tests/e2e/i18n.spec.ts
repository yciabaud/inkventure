import { expect, test } from '@playwright/test';

function nav(page: import('@playwright/test').Page) {
  return page.getByRole('navigation');
}

test.describe('French browser', () => {
  test.use({ locale: 'fr-FR' });

  test('the shell is in French', async ({ page }) => {
    await page.goto('/#/home');
    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Accueil' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Bibliothèque' })).toBeVisible();
    await expect(nav(page).getByRole('button', { name: 'Menu' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  for (const hash of [
    '#/home',
    '#/library?page=2',
    '#/game/sample',
    '#/play/sample',
    '#/settings',
  ]) {
    test(`longer French labels still fit on ${hash}`, async ({ page }) => {
      await page.goto('/' + hash);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('a saved English override wins over the browser language', async ({ page }) => {
    await page.goto('/#/home');
    await page.evaluate(() => window.__inkventure!.setPrefs({ locale: 'en' }));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('English browser', () => {
  test.use({ locale: 'en-US' });

  test('the shell is in English, and switching language re-renders without reload', async ({
    page,
  }) => {
    await page.goto('/#/library');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();

    await page.evaluate(() => window.__inkventure!.changeLocale('fr'));
    await expect(page.getByRole('heading', { level: 1, name: 'Bibliothèque' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Suiv. ›' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Bibliothèque' })).toBeVisible();
  });
});
