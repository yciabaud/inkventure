import { expect, test, type Page } from '@playwright/test';

// The ebook download page (S6.3). No Pandoc or Calibre here: stub books and books.json served with page.route.
const BUILT = '2026-10-01T12:00:00.000Z';
const STUB = Buffer.from('stub ebook');
// 1×1 white GIF standing in for a cover thumbnail.
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

function book(locale: string, format: string, size: number) {
  return {
    locale,
    format,
    file: 'inkventure-' + locale + '.' + format,
    size,
    built: BUILT,
    commit: 'abc',
  };
}

const MANIFEST = {
  built: BUILT,
  commit: 'abc',
  books: [
    book('en', 'epub', 350_000),
    book('en', 'azw3', 1_300_000),
    book('fr', 'epub', 360_000),
    book('fr', 'azw3', 1_400_000),
  ],
  covers: { en: 'inkventure-en-cover.jpg', fr: 'inkventure-fr-cover.jpg' },
};

async function serveBooks(page: Page, manifest: unknown) {
  await page.route('**/ebook/books.json', (route) =>
    manifest
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(manifest),
        })
      : route.fulfill({ status: 404, body: 'Not found' }),
  );
  // Served with the types a static host gives them.
  await page.route('**/ebook/inkventure-*.epub', (route) =>
    route.fulfill({ status: 200, contentType: 'application/epub+zip', body: STUB }),
  );
  await page.route('**/ebook/inkventure-*.azw3', (route) =>
    route.fulfill({ status: 200, contentType: 'application/octet-stream', body: STUB }),
  );
  await page.route('**/ebook/inkventure-*-cover.jpg', (route) =>
    route.fulfill({ status: 200, contentType: 'image/gif', body: GIF }),
  );
}

async function smallTargets(page: Page): Promise<string[]> {
  return page.locator('a, button').evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width < 48 || box.height < 48;
      })
      .map((node) => node.textContent || ''),
  );
}

test.describe('ebook download page', () => {
  test.use({ locale: 'en-US' });

  test('lists both books in both formats, with working download links', async ({ page }) => {
    await serveBooks(page, MANIFEST);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/ebook/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'The Inkventure ebook' }),
    ).toBeVisible();
    await expect(page.locator('.book').first()).toHaveAttribute('data-locale', 'en');
    await expect(page.getByRole('heading', { level: 2, name: 'English edition' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'French edition' })).toBeVisible();

    const english = page.locator('.book[data-locale="en"]');
    const epub = english.getByRole('link', { name: 'Download EPUB' });
    await expect(epub).toHaveAttribute('href', 'inkventure-en.epub');
    await expect(epub).toHaveAttribute('download', 'inkventure-en.epub');
    await expect(english.locator('[data-format="azw3"] .info')).toHaveText(
      '1.2 MB, built on October 1, 2026 — for e-readers that use the AZW3 (KF8) format',
    );
    await expect(page.locator('a.button[download]')).toHaveCount(4);

    const download = page.waitForEvent('download');
    await epub.click();
    expect((await download).suggestedFilename()).toBe('inkventure-en.epub');

    expect(await smallTargets(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('switches to French, French book first', async ({ page }) => {
    await serveBooks(page, MANIFEST);
    await page.goto('/ebook/');
    await page.getByRole('link', { name: 'Français' }).click();
    await expect(page).toHaveURL(/\?lang=fr$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Le livre numérique Inkventure' }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('.book').first()).toHaveAttribute('data-locale', 'fr');
    await expect(page.locator('.book[data-locale="fr"] [data-format="epub"] .info')).toHaveText(
      '352 Ko, créé le 1 octobre 2026 — pour la plupart des liseuses',
    );
    await page.getByRole('link', { name: 'English' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'The Inkventure ebook' }),
    ).toBeVisible();
  });

  test.describe('in a French browser', () => {
    test.use({ locale: 'fr-FR' });
    test('follows the browser language', async ({ page }) => {
      await serveBooks(page, MANIFEST);
      await page.goto('/ebook/');
      await expect(
        page.getByRole('heading', { level: 2, name: 'Édition française' }),
      ).toBeVisible();
      await expect(page.locator('.book').first()).toHaveAttribute('data-locale', 'fr');
    });
  });

  test('fits a phone without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await serveBooks(page, MANIFEST);
    await page.goto('/ebook/');
    await expect(page.locator('.book')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    expect(await smallTargets(page)).toEqual([]);
  });

  test('without books.json, says the books are not available', async ({ page }) => {
    await serveBooks(page, null);
    await page.goto('/ebook/');
    await expect(page.locator('.unavailable')).toContainText(
      'The ebooks are not available here right now.',
    );
    await expect(page.locator('a.button[download]')).toHaveCount(0);
    await expect(page.getByText('Not available right now.')).toHaveCount(4);
  });
});
