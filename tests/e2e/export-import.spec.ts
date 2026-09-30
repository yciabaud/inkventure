import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

// Export / import of the player's data as a text code (S5.2).

const GAME = 'fixture-z';

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

async function scrolls(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
}

/** The entries an export carries (prefs, home, progress, saves), raw. */
function exportable(page: Page) {
  return page.evaluate(() => {
    const found: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (/^ik:v1:(prefs|home|progress:.+|save:.+)$/.test(key)) {
        found[key] = localStorage.getItem(key)!;
      }
    }
    return found;
  });
}

/** A fresh profile (context) with the same device settings as the test's project. */
async function freshPage(browser: Browser) {
  const context = await browser.newContext({ ...test.info().project.use });
  const page = await context.newPage();
  await page.route('https://ifdb.org/**', (route) => route.abort());
  return page;
}

/** Plays two turns and saves in slot 1; returns the export code. */
async function playAndExport(page: Page) {
  await page.goto('/#/play/' + GAME);
  await press(page.getByRole('button', { name: 'Continue ›' }));
  await expect(command(page)).toBeVisible();
  await send(page, 'take can', 1);
  await press(statusLine(page));
  await press(page.getByRole('group', { name: 'Reader' }).getByRole('button', { name: 'Save…' }));
  const dialog = page.getByRole('dialog', { name: 'Save the game' });
  await press(dialog.getByRole('button', { name: /^Slot 1/ }));
  await expect(dialog.getByRole('status')).toHaveText('Game saved in slot 1.');
  await press(dialog.getByRole('button', { name: 'Close' }));
  await send(page, 'north', 2);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('ik:v1:save:fixture-z:auto') || '{}').turn,
      ),
    )
    .toBe(2);

  await page.goto('/#/settings?s=data');
  await press(page.getByRole('link', { name: 'Export my data' }));
  await expect(page.getByRole('heading', { level: 1, name: 'Export my data' })).toBeVisible();
  const code = page.getByRole('textbox', { name: 'Code' });
  await expect(code).toHaveValue(/^INKVENTURE 1 [0-9a-f]{8}\n/);
  expect(await scrolls(page)).toBe(false);
  return code.inputValue();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('a code exported in one profile restores everything in a fresh one, and Continue resumes the same turn', async ({
  page,
  browser,
}) => {
  const code = await playAndExport(page);
  await press(page.getByRole('button', { name: 'Copy' }));
  await expect(page.locator('.transfer__message')).toBeVisible();
  const before = await exportable(page);
  expect(Object.keys(before).sort()).toEqual([
    'ik:v1:home',
    'ik:v1:progress:fixture-z',
    'ik:v1:save:fixture-z:1',
    'ik:v1:save:fixture-z:auto',
  ]);

  const other = await freshPage(browser);
  await other.goto('/#/settings?s=import');
  await expect(other.getByRole('heading', { level: 1, name: 'Import data' })).toBeVisible();
  expect(await scrolls(other)).toBe(false);
  await other.getByRole('textbox', { name: 'Code' }).fill(code);
  await press(other.getByRole('button', { name: 'Check the code' }));
  await expect(other.getByText(/^Code made on /)).toBeVisible();
  const contents = other.locator('.transfer__contents');
  await expect(contents).toContainText('1 adventure');
  await expect(contents).toContainText('1 saved game');
  await expect(contents).toContainText('1 game in progress');
  expect(await scrolls(other)).toBe(false);
  await press(other.getByRole('button', { name: 'Merge' }));

  await expect(other).toHaveURL(/#\/home$/);
  expect(await exportable(other)).toEqual(before);
  const hero = other.getByRole('region', { name: 'Continue' });
  await expect(hero).toContainText('The Lamp at Saltmere');
  await press(hero.getByRole('link', { name: 'Continue' }));
  await expect(command(other)).toBeVisible();
  await expect(statusLine(other)).toContainText('Moves: 2');
  await expect(statusLine(other)).toContainText('Foot of the Tower');

  // The named save came along too.
  await press(statusLine(other));
  await press(
    other.getByRole('group', { name: 'Reader' }).getByRole('button', { name: 'Restore…' }),
  );
  const restore = other.getByRole('dialog', { name: 'Restore a saved game' });
  await press(restore.getByRole('button', { name: /^Slot 1/ }));
  await expect(statusLine(other)).toContainText('Moves: 1');
  await other.context().close();
});

test('a saved file can be opened on the import page; replacing drops what the code lacks', async ({
  page,
  browser,
}) => {
  await playAndExport(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    press(page.getByRole('button', { name: 'Save as a file' })),
  ]);
  expect(download.suggestedFilename()).toMatch(/^inkventure-\d{4}-\d\d-\d\d\.txt$/);
  const file = await download.path();
  const before = await exportable(page);

  const other = await freshPage(browser);
  await other.goto('/#/home');
  // Something of its own, which "Replace everything" removes.
  await other.evaluate(() => {
    localStorage.setItem(
      'ik:v1:save:fxzork0000000005:3',
      JSON.stringify({ v: 1, name: 'Mine', date: 1, turn: 1, data: 'x', text: 'y' }),
    );
  });
  await other.goto('/#/settings?s=import');
  await other.locator('.transfer__file input').setInputFiles(file);
  await expect(other.locator('.transfer__contents')).toContainText('1 saved game');
  await expect(other.getByText('1 saved game here will be lost.')).toBeVisible();
  await press(other.getByRole('button', { name: 'Replace everything' }));
  await expect(other).toHaveURL(/#\/home$/);
  expect(await exportable(other)).toEqual(before);
  await other.context().close();
});

test('a wrong or damaged code is refused and nothing changes', async ({ page }) => {
  const code = await playAndExport(page);
  const before = await exportable(page);
  await page.goto('/#/settings?s=import');
  const box = page.getByRole('textbox', { name: 'Code' });

  await press(page.getByRole('button', { name: 'Check the code' }));
  await expect(page.getByRole('alert')).toHaveText('Paste a code first.');

  await box.fill('hello');
  await press(page.getByRole('button', { name: 'Check the code' }));
  await expect(page.getByRole('alert')).toHaveText('This is not an Inkventure code.');

  // Half the code, as when a copy stops short.
  await box.fill(code.slice(0, Math.floor(code.length / 2)));
  await press(page.getByRole('button', { name: 'Check the code' }));
  await expect(page.getByRole('alert')).toHaveText(/damaged or incomplete/);
  expect(await exportable(page)).toEqual(before);

  // Back from the preview with Cancel.
  await box.fill(code);
  await press(page.getByRole('button', { name: 'Check the code' }));
  await press(page.getByRole('button', { name: 'Cancel' }));
  await expect(page.getByRole('button', { name: 'Check the code' })).toBeVisible();
  expect(await exportable(page)).toEqual(before);
});

test.describe('French browser', () => {
  test.use({ locale: 'fr-FR' });

  test('the export and import pages fit without scrolling in French', async ({ page }) => {
    for (const hash of ['#/settings?s=data', '#/settings?s=export', '#/settings?s=import']) {
      await page.goto('/' + hash);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await scrolls(page), hash).toBe(false);
    }
    await expect(page.getByRole('link', { name: 'Données et stockage' })).toBeVisible();
  });
});
