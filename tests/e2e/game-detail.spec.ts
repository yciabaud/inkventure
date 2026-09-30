import { expect, test, type Locator, type Page } from '@playwright/test';

// The committed sample catalogue (public/catalog): "The Lamp at Saltmere" (English, rated, 15 min, IF Archive file)
// and "Cave of Echoes" (French, unrated). Cover thumbnails are blocked: no network in tests.
const LAMP = 'fxlamp0000000001';
const CAVE = 'fxcave0000000003';

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

/** Nothing on the page scrolls: the blurb is paged. */
async function scrolls(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('from the library: details, Add to Home kept across a reload, Play opens the reader', async ({
  page,
}) => {
  await page.goto('/#/library');
  await press(page.getByRole('link', { name: 'The Lamp at Saltmere, Inkventure Fixtures' }));
  await expect(page).toHaveURL(new RegExp('#/game/' + LAMP + '$'));

  await expect(page.getByRole('heading', { level: 1, name: 'The Lamp at Saltmere' })).toBeVisible();
  await expect(page.getByText('Inkventure Fixtures', { exact: true })).toBeVisible();
  await expect(page.getByText('2026 · English · Slice of life')).toBeVisible();
  await expect(page.getByText('★ 4.3 (8 ratings) · 15 min')).toBeVisible();
  await expect(page.getByText('Z-code', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic listing for the catalogue tests.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Data from IFDB' })).toHaveAttribute(
    'href',
    'https://ifdb.org/viewgame?id=' + LAMP,
  );
  await expect(page.getByRole('link', { name: 'Game file on the IF Archive' })).toHaveAttribute(
    'href',
    'https://ifarchive.org/if-archive/games/zcode/lamp.z5',
  );
  expect(await scrolls(page)).toBe(false);

  await press(page.getByRole('button', { name: 'Add to Home' }));
  await expect(page.getByRole('button', { name: 'Remove from Home' })).toBeVisible();
  const home = await page.evaluate(() => JSON.parse(localStorage.getItem('ik:v1:home') || '[]'));
  expect(home).toEqual([expect.objectContaining({ tuid: LAMP, title: 'The Lamp at Saltmere' })]);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove from Home' })).toBeVisible();
  await press(page.getByRole('button', { name: 'Remove from Home' }));
  await expect(page.getByRole('button', { name: 'Add to Home' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add to Home' })).toBeVisible();

  await press(page.getByRole('link', { name: 'Play' }));
  await expect(page).toHaveURL(new RegExp('#/play/' + LAMP + '$'));
});

test('a deep link works on a cold start; a game with a save offers Continue', async ({ page }) => {
  await page.goto('/#/game/' + CAVE);
  await expect(page.getByRole('heading', { level: 1, name: 'Cave of Echoes' })).toBeVisible();
  await expect(page.getByText('2022 · Français · Aventure')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play' })).toBeVisible();

  await page.evaluate(
    (tuid) => localStorage.setItem('ik:v1:save:' + tuid + ':auto', JSON.stringify({ v: 1 })),
    CAVE,
  );
  await page.reload();
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
});

test('an unknown game says so and leads to the library', async ({ page }) => {
  // A static host answers 404 (the preview server would serve the app instead).
  await page.route('**/catalog/games/nosuchgame.json', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.goto('/#/game/nosuchgame');
  await expect(page.getByText('Adventure not found')).toBeVisible();
  await press(page.getByRole('link', { name: 'Go to the library' }));
  await expect(page).toHaveURL(/#\/library$/);
});

test('a long blurb is paged, never scrolled', async ({ page }) => {
  const paragraphs = Array.from(
    { length: 30 },
    (_, i) =>
      `Paragraph ${i + 1}: the tide climbs the stairs of the lighthouse, one step each night.`,
  );
  await page.route('**/catalog/games/' + LAMP + '.json', async (route) => {
    const response = await route.fetch();
    const game = await response.json();
    await route.fulfill({
      response,
      json: { ...game, description: paragraphs.join('<br><br>') },
    });
  });
  await page.goto('/#/game/' + LAMP);
  await expect(page.getByText('Paragraph 1:')).toBeInViewport();
  await expect(page.getByText('Paragraph 30:')).not.toBeInViewport();
  expect(await scrolls(page)).toBe(false);

  const pager = page.locator('.pager');
  const status = pager.locator('.pager__status');
  await expect(status).toHaveText(/^1 \/ \d+$/);
  const next = pager.getByRole('button', { name: 'Next ›' });
  while (await next.isVisible()) await press(next);
  const [last, count] = (await status.textContent())!.split(' / ');
  expect(last).toBe(count);
  expect(Number(count)).toBeGreaterThan(1);
  await expect(page.getByText('Paragraph 30:')).toBeInViewport();
  await expect(page.getByText('Paragraph 1:')).not.toBeInViewport();
  expect(await scrolls(page)).toBe(false);
});
