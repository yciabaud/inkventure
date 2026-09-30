import { expect, test, type Locator, type Page } from '@playwright/test';
import { routeCatalog, syntheticCatalog } from './helpers/catalog';

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

function results(page: Page) {
  return page.getByRole('list', { name: 'Adventures' }).getByRole('link');
}

async function searchFor(page: Page, query: string) {
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(query);
  await press(page.getByRole('button', { name: 'Search' }));
}

test('search, page through the results, and come back with the back button', async ({ page }) => {
  await routeCatalog(page);
  await page.goto('/#/library');
  await expect(page.getByText('40 adventures')).toBeVisible();

  await searchFor(page, 'adventure');
  await expect(page).toHaveURL(/#\/library\?q=adventure$/);
  await expect(page.getByText('39 adventures')).toBeVisible();
  const firstPage = await results(page).allTextContents();
  expect(firstPage.length).toBeGreaterThan(2);

  await press(page.getByRole('link', { name: 'Next ›' }));
  await expect(page).toHaveURL(/#\/library\?page=2&q=adventure$/);
  const secondPage = await results(page).allTextContents();
  expect(secondPage[0]).not.toBe(firstPage[0]);

  await press(results(page).first());
  await expect(page).toHaveURL(/#\/game\/syn\d+$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/library\?page=2&q=adventure$/);
  await expect(page.getByRole('searchbox', { name: 'Search the library' })).toHaveValue(
    'adventure',
  );
  await expect(results(page).first()).toHaveText(secondPage[0]);

  await page.goBack();
  await expect(page).toHaveURL(/#\/library\?q=adventure$/);
  await expect(results(page).first()).toHaveText(firstPage[0]);
});

test('matches accents and case loosely, and says when nothing matches', async ({ page }) => {
  await routeCatalog(page);
  await page.goto('/#/library?q=ECHO');
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).first()).toContainText('Écho 03');

  await page.goto('/#/library?q=zoe');
  await expect(page.getByText('8 adventures')).toBeVisible();

  await searchFor(page, 'no such game');
  await expect(page.getByText('No adventure matches “no such game”.')).toBeVisible();
  await press(page.getByRole('link', { name: 'Show all' }));
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByText('40 adventures')).toBeVisible();
});

test('the results fill the page without scrolling', async ({ page }) => {
  await routeCatalog(page, syntheticCatalog(60));
  await page.goto('/#/library');
  await expect(results(page).first()).toBeVisible();
  const layout = await page.evaluate(() => {
    const list = document.querySelector('.library__list') as HTMLElement;
    const rows = list.querySelectorAll('.result');
    const last = rows[rows.length - 1].getBoundingClientRect();
    const doc = document.documentElement;
    return {
      rows: rows.length,
      lastFits: last.bottom <= list.getBoundingClientRect().bottom + 0.5,
      scrolls: doc.scrollHeight > doc.clientHeight,
      roomForAnother: list.getBoundingClientRect().bottom - last.bottom >= 56,
    };
  });
  expect(layout).toEqual({
    rows: layout.rows,
    lastFits: true,
    scrolls: false,
    roomForAnother: false,
  });
  expect(layout.rows).toBeGreaterThanOrEqual(5);
});

test('shows an error with a retry when the catalogue cannot be loaded', async ({ page }) => {
  let fail = true;
  await page.route(/\/catalog\/meta\.json$/, (route) =>
    fail ? route.fulfill({ status: 503, body: '' }) : route.fallback(),
  );
  await page.goto('/#/library');
  await expect(page.getByText('The catalogue could not be loaded')).toBeVisible();
  fail = false;
  await press(page.getByRole('button', { name: 'Try again' }));
  // The committed sample catalogue.
  await expect(page.getByText('4 adventures')).toBeVisible();
});
