import { expect, test, type Locator, type Page } from '@playwright/test';

const FIXTURE = 'fixture-z';

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

function command(page: Page) {
  return page.getByRole('textbox', { name: 'Command' });
}

function statusLine(page: Page) {
  return page.getByRole('button', { name: 'Navigation' });
}

async function send(page: Page, text: string, moves: number) {
  await command(page).fill(text);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(statusLine(page)).toContainText('Moves: ' + moves);
}

function adventures(page: Page) {
  return page.getByRole('list', { name: 'My adventures' });
}

/** Two games in My adventures, both started (progress and autosave), Lamp played last. */
async function seed(page: Page) {
  await page.goto('/#/home');
  await page.evaluate(() => {
    const now = Date.now();
    const set = (key: string, value: unknown) =>
      localStorage.setItem('ik:v1:' + key, JSON.stringify(value));
    set('home', [
      {
        tuid: 'fxzork0000000005',
        title: 'Hollow Mountain',
        author: 'D. Placeholder',
        added: now - 86400000 * 5,
      },
      {
        tuid: 'fxlamp0000000001',
        title: 'The Lamp at Saltmere',
        author: 'Inkventure Fixtures',
        added: now - 1000,
      },
    ]);
    set('progress:fxlamp0000000001', { turns: 5, lastPlayed: now - 60000 });
    set('progress:fxzork0000000005', { turns: 2, lastPlayed: now - 86400000 * 3 });
    set('save:fxlamp0000000001:auto', { v: 1 });
    set('save:fxzork0000000005:auto', { v: 1 });
    set('save:fxzork0000000005:1', { v: 1 });
  });
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('after playing, Home offers Continue, which resumes at the same turn', async ({ page }) => {
  await page.goto('/#/play/' + FIXTURE);
  await press(page.getByRole('button', { name: 'Continue ›' }));
  await expect(command(page)).toBeVisible();
  await send(page, 'take can', 1);
  await send(page, 'north', 2);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('ik:v1:save:fixture-z:auto') !== null))
    .toBe(true);

  await page.goto('/#/home');
  const hero = page.getByRole('region', { name: 'Continue' });
  await expect(hero).toContainText('The Lamp at Saltmere');
  await expect(hero).toContainText('Turn 2 · last played today');
  await expect(adventures(page).getByRole('link')).toHaveAttribute(
    'aria-label',
    'The Lamp at Saltmere, Inkventure Fixtures',
  );
  await expect(page.getByText('Welcome to Inkventure')).toHaveCount(0);

  await press(hero.getByRole('link', { name: 'Continue' }));
  await expect(page).toHaveURL(new RegExp('#/play/' + FIXTURE + '$'));
  await expect(command(page)).toBeVisible();
  await expect(statusLine(page)).toContainText('Moves: 2');
});

test('My adventures lists the last played first; the ⋮ menu shows the game and continues it', async ({
  page,
}) => {
  await seed(page);
  const hero = page.getByRole('region', { name: 'Continue' });
  await expect(hero).toContainText('The Lamp at Saltmere');
  await expect(hero).toContainText('Turn 5');
  const cards = adventures(page).getByRole('link');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute('aria-label', /^The Lamp at Saltmere/);
  await expect(cards.nth(1)).toHaveAttribute('aria-label', /^Hollow Mountain/);

  await press(page.getByRole('button', { name: 'More for Hollow Mountain' }));
  const menu = page.getByRole('dialog', { name: 'Options' });
  await expect(menu).toContainText('Hollow Mountain');
  await expect(menu).toContainText('D. Placeholder');
  await expect(menu).toContainText('Turn 2 · last played 3 days ago');
  await press(menu.getByRole('button', { name: 'Continue' }));
  await expect(page).toHaveURL(/#\/play\/fxzork0000000005$/);
});

test('with adventures, Featured is a tab: one shelf at a time', async ({ page }) => {
  // The sample's English featured games are both in the seeded adventures: offer another one.
  await page.route('**/catalog/featured.json', (route) =>
    route.fulfill({
      json: {
        version: 1,
        built: 'x',
        locales: {
          en: [
            {
              t: 'other000000001',
              n: 'Another Game',
              a: 'Writer',
              f: 'zcode',
              l: 'en',
              pi: 'A pitch.',
            },
          ],
          fr: [],
        },
      },
    }),
  );
  await seed(page);
  const tabs = page.getByRole('navigation', { name: 'Home shelves' });
  await expect(tabs.getByRole('link', { name: 'My adventures' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(adventures(page)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Featured' })).toHaveCount(0);

  await press(tabs.getByRole('link', { name: 'Featured' }));
  await expect(page).toHaveURL(/#\/home\?shelf=featured$/);
  await expect(page.getByRole('list', { name: 'Featured' })).toContainText('Another Game');
  await expect(adventures(page)).toHaveCount(0);
  // The Continue hero stays.
  await expect(page.getByRole('region', { name: 'Continue' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    ),
  ).toBe(false);

  await press(tabs.getByRole('link', { name: 'My adventures' }));
  await expect(page).toHaveURL(/#\/home$/);
  await expect(adventures(page)).toBeVisible();
});

test('Remove from Home keeps the saves, unless asked to delete them', async ({ page }) => {
  await seed(page);
  const saved = (key: string) =>
    page.evaluate((k) => localStorage.getItem('ik:v1:' + k) !== null, key);

  await press(page.getByRole('button', { name: 'More for The Lamp at Saltmere' }));
  await press(
    page.getByRole('dialog', { name: 'Options' }).getByRole('button', { name: 'Remove from Home' }),
  );
  await expect(
    page.getByRole('dialog', { name: 'Remove “The Lamp at Saltmere” from Home?' }),
  ).toBeVisible();
  await press(page.getByRole('button', { name: 'Remove', exact: true }));
  await expect(adventures(page).getByRole('link')).toHaveCount(1);
  expect(await saved('save:fxlamp0000000001:auto')).toBe(true);
  expect(await saved('progress:fxlamp0000000001')).toBe(true);
  // Continue now offers the game still in My adventures.
  await expect(page.getByRole('region', { name: 'Continue' })).toContainText('Hollow Mountain');

  await press(page.getByRole('button', { name: 'More for Hollow Mountain' }));
  await press(
    page.getByRole('dialog', { name: 'Options' }).getByRole('button', { name: 'Remove from Home' }),
  );
  await press(page.getByRole('checkbox', { name: 'Also delete its saves and progress' }));
  await press(page.getByRole('button', { name: 'Remove', exact: true }));
  await expect(page.getByRole('list', { name: 'My adventures' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Continue' })).toHaveCount(0);
  expect(await saved('save:fxzork0000000005:auto')).toBe(false);
  expect(await saved('save:fxzork0000000005:1')).toBe(false);
  expect(await saved('progress:fxzork0000000005')).toBe(false);
});
