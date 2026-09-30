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

test('grid or list and the sort are remembered', async ({ page }) => {
  await seed(page);
  const hero = page.getByRole('region', { name: 'Continue' });
  await expect(hero).toContainText('The Lamp at Saltmere');
  await expect(hero).toContainText('Turn 5');
  // Recent first by default.
  await expect(adventures(page).getByRole('link').first()).toHaveAttribute(
    'aria-label',
    /^The Lamp at Saltmere/,
  );

  await press(page.getByRole('button', { name: 'List view' }));
  await expect(adventures(page).locator('.adventure').first()).toContainText(
    'Inkventure Fixtures · Turn 5 · last played today',
  );
  await press(page.getByRole('button', { name: 'Sort by title' }));
  await expect(adventures(page).getByRole('link').first()).toHaveAttribute(
    'aria-label',
    /^Hollow Mountain/,
  );

  await page.reload();
  await expect(adventures(page).locator('.adventure')).toHaveCount(2);
  await expect(adventures(page).getByRole('link').first()).toHaveAttribute(
    'aria-label',
    /^Hollow Mountain/,
  );
  await press(page.getByRole('button', { name: 'Grid view' }));
  await page.reload();
  await expect(adventures(page).locator('.shelf-card')).toHaveCount(2);
});

test('Remove from Home keeps the saves, unless asked to delete them', async ({ page }) => {
  await seed(page);
  const saved = (key: string) =>
    page.evaluate((k) => localStorage.getItem('ik:v1:' + k) !== null, key);

  await press(page.getByRole('button', { name: 'More for The Lamp at Saltmere' }));
  await press(page.getByRole('dialog').getByRole('button', { name: 'Remove from Home' }));
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
  await press(page.getByRole('dialog').getByRole('button', { name: 'Remove from Home' }));
  await press(page.getByRole('checkbox', { name: 'Also delete its saves and progress' }));
  await press(page.getByRole('button', { name: 'Remove', exact: true }));
  await expect(page.getByRole('list', { name: 'My adventures' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Continue' })).toHaveCount(0);
  expect(await saved('save:fxzork0000000005:auto')).toBe(false);
  expect(await saved('save:fxzork0000000005:1')).toBe(false);
  expect(await saved('progress:fxzork0000000005')).toBe(false);
});
