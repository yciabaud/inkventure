import { expect, test, type Locator, type Page } from '@playwright/test';

// The committed sample catalogue's featured.json (tests/fixtures/featured.json): in English "The Lamp at Saltmere"
// (curated, starter, with a pitch) then "Hollow Mountain" (best rated); in French "Cave of Echoes" (curated).
const LAMP = 'fxlamp0000000001';

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

function shelf(page: Page) {
  return page.getByRole('list', { name: 'Featured' });
}

async function scrolls(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('fresh profile: welcome and the featured shelf; a card opens its game', async ({ page }) => {
  await page.goto('/#/home');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Welcome to Inkventure' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'How to play' })).toBeVisible();
  const lamp = shelf(page).getByRole('link', { name: 'The Lamp at Saltmere, Inkventure Fixtures' });
  await expect(lamp).toBeVisible();
  // The same grid as My adventures: cover, title, and "Start here" on a curated starter.
  await expect(lamp).toContainText('The Lamp at Saltmere');
  await expect(lamp).toContainText('Start here');
  // Cave of Echoes is in French with an English translation (S2.6): on the English shelf too; Ink and Tide is the
  // ink web export (S2.7), The Decker Tour the Decker one (S2.9).
  await expect(shelf(page).getByRole('link')).toHaveCount(6);
  expect(await scrolls(page)).toBe(false);

  await press(lamp);
  await expect(page).toHaveURL(new RegExp('#/game/' + LAMP + '$'));
  await expect(page.getByRole('heading', { level: 1, name: 'The Lamp at Saltmere' })).toBeVisible();
});

test('games in progress are left out, and the welcome is gone', async ({ page }) => {
  await page.goto('/#/home');
  await expect(shelf(page).getByRole('link')).toHaveCount(6);
  await page.evaluate(
    (tuid) => localStorage.setItem('ik:v1:progress:' + tuid, JSON.stringify({ turns: 3 })),
    LAMP,
  );
  await page.reload();
  await expect(shelf(page).getByRole('link')).toHaveCount(5);
  await expect(shelf(page).getByRole('link').first()).toHaveAttribute(
    'aria-label',
    /^Cave of Echoes/,
  );
  // A game played in another language than its default one is in progress too (S2.6).
  await page.evaluate(
    (tuid) => localStorage.setItem('ik:v1:progress:' + tuid + '-en', JSON.stringify({ turns: 1 })),
    'fxcave0000000003',
  );
  await page.reload();
  await expect(shelf(page).getByRole('link')).toHaveCount(4);
  await expect(page.getByText('Welcome to Inkventure')).toHaveCount(0);
});

test.describe('French UI', () => {
  test.use({ locale: 'fr-FR' });

  test('the shelf lists the French games', async ({ page }) => {
    await page.goto('/#/home');
    const cards = page.getByRole('list', { name: 'À la une' }).getByRole('link');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute('aria-label', 'Cave of Echoes, B. Sample');
  });
});

test('a long shelf is paged with ‹ ›, never scrolled', async ({ page }) => {
  // A small e-reader: the shelf holds at most 24 games, which all fit on a large one.
  await page.setViewportSize({ width: 600, height: 800 });
  const games = Array.from({ length: 24 }, (_, i) => ({
    t: 'shelf' + i,
    n: 'Shelf game ' + (i + 1),
    a: 'Writer',
    f: 'zcode',
    l: 'en',
  }));
  await page.route('**/catalog/featured.json', (route) =>
    route.fulfill({ json: { version: 1, built: 'x', locales: { en: games, fr: [] } } }),
  );
  await page.goto('/#/home');
  const first = shelf(page).getByRole('link').first();
  await expect(first).toHaveAttribute('aria-label', 'Shelf game 1, Writer');
  const perPage = await shelf(page).getByRole('link').count();
  expect(perPage).toBeGreaterThan(0);
  expect(perPage).toBeLessThan(24);
  expect(await scrolls(page)).toBe(false);

  await press(page.locator('.shelf').getByRole('button', { name: 'Next', exact: true }));
  await expect(first).toHaveAttribute('aria-label', 'Shelf game ' + (perPage + 1) + ', Writer');
  expect(await scrolls(page)).toBe(false);
});

test('How to play: a paged guide, reached from the welcome', async ({ page }) => {
  await page.goto('/#/home');
  await press(page.getByRole('link', { name: 'How to play' }));
  await expect(page).toHaveURL(/#\/help$/);
  await expect(page.getByRole('heading', { level: 1, name: 'How to play' })).toBeVisible();
  await expect(page.getByText(/^In interactive fiction, you read a story/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse the library' })).toBeVisible();
  expect(await scrolls(page)).toBe(false);
});
