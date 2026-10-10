import { expect, test, type Locator, type Page } from '@playwright/test';
import { routeCatalog, syntheticCatalog } from './helpers/catalog';

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

function results(page: Page) {
  return page.getByRole('list', { name: 'Adventures' }).getByRole('link');
}

/** Accessible names of the results on the page ("Title, Author"), in the grid or the list. */
function names(page: Page) {
  return results(page).evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));
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
  const firstPage = await names(page);
  expect(firstPage.length).toBeGreaterThan(2);

  await press(page.getByRole('link', { name: 'Next ›' }));
  await expect(page).toHaveURL(/#\/library\?page=2&q=adventure$/);
  // Wait for page 2 to be drawn before reading it.
  await expect(results(page).first()).not.toHaveAttribute('aria-label', firstPage[0]!);
  const secondPage = await names(page);

  await press(results(page).first());
  await expect(page).toHaveURL(/#\/game\/syn\d+$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/library\?page=2&q=adventure$/);
  await expect(page.getByRole('searchbox', { name: 'Search the library' })).toHaveValue(
    'adventure',
  );
  await expect(results(page).first()).toHaveAttribute('aria-label', secondPage[0]!);

  await page.goBack();
  await expect(page).toHaveURL(/#\/library\?q=adventure$/);
  await expect(results(page).first()).toHaveAttribute('aria-label', firstPage[0]!);
});

test('matches accents and case loosely, and says when nothing matches', async ({ page }) => {
  await routeCatalog(page);
  await page.goto('/#/library?q=ECHO');
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).first()).toHaveAttribute('aria-label', /^Écho 03,/);

  await page.goto('/#/library?q=zoe');
  await expect(page.getByText('8 adventures')).toBeVisible();

  await searchFor(page, 'no such game');
  await expect(page.getByText('No adventure matches “no such game”.')).toBeVisible();
  await press(page.getByRole('link', { name: 'Show all' }));
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByText('40 adventures')).toBeVisible();
});

for (const view of ['Grid', 'List']) {
  test(`${view.toLowerCase()} view: the results fill the page without scrolling`, async ({
    page,
  }) => {
    await routeCatalog(page, syntheticCatalog(60));
    await page.goto('/#/library');
    await expect(results(page).first()).toBeVisible();
    if (view === 'List') await press(page.getByRole('button', { name: 'List view' }));
    const layout = await page.evaluate(() => {
      const list = document.querySelector('.library__list') as HTMLElement;
      const items = list.querySelectorAll('li');
      const box = list.getBoundingClientRect();
      const doc = document.documentElement;
      let inside = true;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        inside = inside && r.bottom <= box.bottom + 0.5 && r.right <= box.right + 0.5;
      }
      return { items: items.length, inside, scrolls: doc.scrollHeight > doc.clientHeight };
    });
    expect(layout).toEqual({ items: layout.items, inside: true, scrolls: false });
    expect(layout.items).toBeGreaterThanOrEqual(4);
  });
}

test('the grid is the default; the chosen view is remembered', async ({ page }) => {
  await routeCatalog(page);
  await page.goto('/#/library');
  await expect(page.locator('.tile').first()).toBeVisible();
  // Every cover has its title under it (IFDB cover art does not always show it).
  await expect(page.locator('.tile__title')).toHaveCount(await page.locator('.tile').count());
  await expect(page.locator('.tile__title').first()).not.toBeEmpty();
  await press(page.getByRole('button', { name: 'List view' }));
  await expect(page.locator('.result').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.result').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grid view' })).toBeVisible();
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
  // The committed sample catalogue (four Z-code games, a Glulx, a Twine, an ink and a Decker one).
  await expect(page.getByText('8 adventures')).toBeVisible();
});
