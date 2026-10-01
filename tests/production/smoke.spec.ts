import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

// Smoke test of the deployed site (S7.2): see playwright.production.config.ts. Paths are relative to the site's
// address (no leading "/": the app is served from a sub-path).

interface Featured {
  locales: Record<string, { t: string; f: string }[]>;
}

interface Book {
  locale: string;
  format: string;
  file: string;
  size: number;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('the build and the catalogue are published', async ({ request }) => {
  const version = await request.get('version.json');
  expect(version.ok()).toBe(true);
  expect(((await version.json()) as { commit: string }).commit).toMatch(/^[0-9a-f]{40}$/);

  const meta = await request.get('catalog/meta.json');
  expect(meta.ok()).toBe(true);
  const { count, shards } = (await meta.json()) as { count: number; shards: string[] };
  expect(count).toBeGreaterThan(0);
  expect((await request.get('catalog/' + shards[0])).ok()).toBe(true);

  const licences = await request.get('licences.txt');
  expect(licences.ok()).toBe(true);
  expect(await licences.text()).toContain('## Quixe');
});

test('Home shows the featured shelf and the Library lists games', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/home');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Featured' }).getByRole('link').first(),
  ).toBeVisible();

  await page.goto('./#/library');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Adventures' }).getByRole('link').first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('a featured Z-machine game downloads from the IF Archive and starts', async ({
  page,
  request,
}) => {
  const featured = (await (await request.get('catalog/featured.json')).json()) as Featured;
  const game = featured.locales.en.find((g) => g.f === 'zcode');
  expect(game, 'a Z-machine game in the English featured list').toBeTruthy();
  const errors = collectErrors(page);

  await page.goto('./#/play/' + game!.t);
  // The game's text, or the error page ("The game could not be downloaded"…): fail fast on the latter.
  await expect(page.locator('.reader__block, [role=alert]').first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.reader__block').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the ebook page lists both books, and their files match books.json', async ({
  page,
  request,
  baseURL,
}) => {
  const response = await request.get('ebook/books.json');
  expect(response.ok(), 'ebook/books.json (did the ebook job of the last deployment fail?)').toBe(
    true,
  );
  const { books } = (await response.json()) as { books: Book[] };
  const found = books.map((b) => b.locale + '.' + b.format).sort();
  expect(found).toEqual(['en.azw3', 'en.epub', 'fr.azw3', 'fr.epub']);
  for (const book of books) {
    const file = await request.head('ebook/' + book.file);
    expect(file.ok(), book.file).toBe(true);
    const length = file.headers()['content-length'];
    if (length) expect(Number(length), book.file).toBe(book.size);
  }

  // The books' links open this site: the app on the first page, a game per card.
  const epub = await request.get('ebook/inkventure-en.epub');
  const chapters = Object.entries(unzipSync(new Uint8Array(await epub.body())))
    .filter(([name]) => name.endsWith('.xhtml'))
    .map(([, data]) => strFromU8(data))
    .join('\n');
  const site = baseURL!;
  expect(chapters).toContain('href="' + site + '"');
  expect(chapters).toContain('href="' + site + '#/play/');

  await page.goto('ebook/');
  await expect(page.getByRole('link', { name: /EPUB/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /AZW3/ }).first()).toBeVisible();
});
