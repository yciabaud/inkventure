import { expect, test, type Locator, type Page } from '@playwright/test';
import { routeCatalog } from './helpers/catalog';

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

/**
 * 30 games: every third in French, every other a Z-code game (the rest Glulx), ratings 3 to 5 stars by steps of
 * 0.5, years 2000–2029, a quarter Fantasy (the rest Horror), the first a starter. French Z-code games rated 4+:
 * games 12 (★ 4), 18 (★ 4.5) and 24 (★ 5).
 */
function filterCatalog() {
  const rows = Array.from({ length: 30 }, (_, i) => {
    const n = String(i).padStart(2, '0');
    const r = 3 + (i % 5) * 0.5;
    return {
      t: 'flt' + n,
      n: 'Game ' + n,
      a: 'Writer ' + n,
      y: 2000 + i,
      l: i % 3 === 0 ? 'fr' : 'en',
      g: [i % 4 === 0 ? 'Fantasy' : 'Horror'],
      f: i % 2 === 0 ? 'zcode' : 'glulx',
      r: r,
      rc: 5 + i,
      s: r,
      st: i === 0 ? 1 : undefined,
    };
  });
  const count = (test: (row: (typeof rows)[number]) => boolean) => rows.filter(test).length;
  const meta = {
    version: 1,
    built: '2026-01-01T00:00:00.000Z',
    policy: 'general',
    count: rows.length,
    shards: ['index-0.json'],
    facets: {
      languages: [
        ['en', count((row) => row.l === 'en')],
        ['fr', count((row) => row.l === 'fr')],
      ],
      genres: [
        ['Horror', count((row) => row.g[0] === 'Horror')],
        ['Fantasy', count((row) => row.g[0] === 'Fantasy')],
      ],
      formats: [
        ['zcode', count((row) => row.f === 'zcode')],
        ['glulx', count((row) => row.f === 'glulx')],
      ],
    },
  };
  return { meta, shards: { 'index-0.json': { rows } } };
}

function names(page: Page) {
  return page
    .getByRole('list', { name: 'Adventures' })
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));
}

/** Opens a filter's page, turning the panel's pages when its row is on another one (short screens). */
async function openFilter(page: Page, name: string) {
  // The hash changes before the panel is drawn: wait for its first page.
  await expect(page.getByRole('heading', { name: 'Filters', exact: true })).toBeVisible();
  const row = page.getByRole('button', { name: new RegExp('^' + name) });
  const next = page.locator('.pager').getByRole('button', { name: 'Next ›' });
  while (!(await row.isVisible()) && (await next.isVisible())) await press(next);
  await press(row);
}

/** The panel and the results never scroll the page. */
async function scrolls(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
}

test.beforeEach(async ({ page }) => {
  await routeCatalog(page, filterCatalog());
  await page.goto('/#/library');
  await expect(page.getByText('30 adventures')).toBeVisible();
});

test('French + Z-code + ★ 4+: the right games, and the filters survive reload and back', async ({
  page,
}) => {
  await press(page.getByRole('link', { name: 'Filters' }));
  await expect(page).toHaveURL(/panel=filters/);
  expect(await scrolls(page)).toBe(false);

  await openFilter(page, 'Language');
  expect(await scrolls(page)).toBe(false);
  const french = page.getByRole('button', { name: /^Français/ });
  await expect(french).toContainText('10');
  await press(french);
  await expect(french).toHaveAttribute('aria-pressed', 'true');
  await press(page.getByRole('button', { name: '‹ Filters' }));

  await openFilter(page, 'Format');
  await press(page.getByRole('button', { name: /^Z-code/ }));
  await press(page.getByRole('button', { name: '‹ Filters' }));

  await openFilter(page, 'Rating');
  // A single choice goes back to the filters.
  await press(page.getByRole('button', { name: /^★ 4\+/ }));
  await expect(page.getByRole('button', { name: /^Rating/ })).toContainText('★ 4+');
  await expect(page.getByRole('button', { name: /^Language/ })).toContainText('Français');

  await press(page.getByRole('button', { name: 'Show 3 adventures' }));
  await expect(page).toHaveURL(/#\/library\?format=zcode&lang=fr&rating=4$/);
  await expect(page.getByText('3 adventures')).toBeVisible();
  // Best rated first.
  await expect
    .poll(() => names(page))
    .toEqual(['Game 24, Writer 24', 'Game 18, Writer 18', 'Game 12, Writer 12']);
  await expect(page.getByRole('link', { name: 'Filters (3)' })).toBeVisible();

  await page.reload();
  await expect(page.getByText('3 adventures')).toBeVisible();
  await expect.poll(() => names(page)).toHaveLength(3);

  // To a game and back: the filtered results again.
  await press(page.getByRole('link', { name: 'Game 18, Writer 18' }));
  await expect(page).toHaveURL(/#\/game\/flt18$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/library\?format=zcode&lang=fr&rating=4$/);
  await expect(page.getByText('3 adventures')).toBeVisible();

  // The panel replaced its own history entry: back goes to the unfiltered results.
  await page.goBack();
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByText('30 adventures')).toBeVisible();
});

test('sort, "Start here", a year range and clearing the filters', async ({ page }) => {
  await press(page.getByRole('link', { name: 'Filters' }));
  await openFilter(page, 'Sort by');
  await press(page.getByRole('button', { name: 'Newest' }));
  await expect(page.getByRole('button', { name: /^Sort by/ })).toContainText('Newest');
  await press(page.getByRole('button', { name: 'Show 30 adventures' }));
  await expect(page).toHaveURL(/sort=new/);
  await expect.poll(async () => (await names(page))[0]).toBe('Game 29, Writer 29');

  await press(page.getByRole('link', { name: 'Filters' }));
  await press(page.getByRole('button', { name: /^Start here/ }));
  await expect(page.getByRole('button', { name: /^Start here/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Show 1 adventure' })).toBeVisible();
  await press(page.getByRole('button', { name: /^Start here/ }));

  await openFilter(page, 'Release year');
  await page.getByRole('spinbutton', { name: 'From' }).fill('2010');
  await page.getByRole('spinbutton', { name: 'To' }).fill('2014');
  await press(page.getByRole('button', { name: 'Apply' }));
  await expect(page.getByRole('button', { name: /^Release year/ })).toContainText('2010–2014');
  await press(page.getByRole('button', { name: 'Show 5 adventures' }));
  await expect
    .poll(() => names(page))
    .toEqual([
      'Game 14, Writer 14',
      'Game 13, Writer 13',
      'Game 12, Writer 12',
      'Game 11, Writer 11',
      'Game 10, Writer 10',
    ]);

  // A search narrows the filtered results further; no match offers to clear the filters.
  await page.getByRole('searchbox', { name: 'Search the library' }).fill('writer 20');
  await press(page.getByRole('button', { name: 'Search' }));
  await expect(page.getByText('No adventure matches “writer 20”.')).toBeVisible();
  await press(page.getByRole('link', { name: 'Clear filters' }));
  await expect(page).toHaveURL(/#\/library\?q=writer%2020&sort=new$/);
  await expect(page.getByText('1 adventure')).toBeVisible();
});
