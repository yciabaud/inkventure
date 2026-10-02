import { expect, test, type Page } from '@playwright/test';

// Cleared screens (S1.16) in the Z-machine fixture: MENU clears the main window and draws itself again after each key,
// with its legend in a three-row status window (N / P move, Return opens a topic, Q quits).
const GAME = '/#/play/fixture-z';

async function press(page: Page, name: string | RegExp, scope = page.locator('body')) {
  const target = scope.getByRole('button', { name: name, exact: typeof name === 'string' });
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

function command(page: Page) {
  return page.getByRole('textbox', { name: 'Command' });
}

async function send(page: Page, text: string) {
  await command(page).fill(text);
  await press(page, 'Enter');
}

function keys(page: Page) {
  return page.getByRole('group', { name: 'Keys' });
}

function text(page: Page) {
  return page.locator('.reader__text');
}

/** Turns back a page with a tap on the left of the text (arrow keys go to the game while it waits for a key). */
async function previousPage(page: Page) {
  const area = page.locator('.reader__page');
  const box = await area.boundingBox();
  if (!box) throw new Error('no text area');
  const position = { x: box.width * 0.1, y: box.height / 2 };
  if (test.info().project.use.hasTouch) await area.tap({ position });
  else await area.click({ position });
}

/** The text of every page before the current one, going back to the first page. */
async function earlierText(page: Page): Promise<string> {
  let all = '';
  for (let i = 0; i < 20 && !/^1 \//.test(await indicator(page).innerText()); i++) {
    const before = await indicator(page).innerText();
    await previousPage(page);
    await expect(indicator(page)).not.toHaveText(before);
    all = (await text(page).innerText()) + '\n' + all;
  }
  return all;
}

function indicator(page: Page) {
  return page.locator('.reader__indicator');
}

/** The page count of the game view, on its last page. */
async function pageCount(page: Page): Promise<number> {
  const value = (await indicator(page).innerText()).split('/');
  expect(value[0].trim()).toBe(value[1].trim());
  return Number(value[1]);
}

/** Opens the menu after a few turns, on a page of its own; returns the page count then. */
async function openMenu(page: Page): Promise<number> {
  await page.goto(GAME);
  await press(page, 'Continue ›');
  await send(page, 'look');
  await expect(text(page)).toContainText('A stone jetty');
  await send(page, 'menu');
  await expect(text(page)).toContainText('> About the lamp');
  // A fresh page: the game's text is on the pages before it.
  await expect(text(page)).not.toContainText('A stone jetty');
  await expect(keys(page).getByRole('button', { name: /^N/ })).toBeVisible();
  return pageCount(page);
}

test('browsing a menu replaces its screen: no page is added, and it shows at once', async ({
  page,
}) => {
  const pages = await openMenu(page);

  await press(page, /^N/, keys(page));
  await expect(text(page)).toContainText('> About the keeper');
  // One screen, not a pile: the earlier menu screen is gone, no "Back to the present" step.
  await expect(text(page)).not.toContainText('> About the lamp');
  await expect(page.getByRole('button', { name: /Back to the present/ })).toHaveCount(0);
  expect(await pageCount(page)).toBe(pages);

  await press(page, /^P/, keys(page));
  await expect(text(page)).toContainText('> About the lamp');
  expect(await pageCount(page)).toBe(pages);

  // A topic, then back to the menu.
  await press(page, /Select/, keys(page));
  await expect(text(page)).toContainText('The lamp burns paraffin.');
  await expect(text(page)).not.toContainText('About the keeper');
  expect(await pageCount(page)).toBe(pages);
  await press(page, 'Continue ›');
  await expect(text(page)).toContainText('> About the lamp');
  expect(await pageCount(page)).toBe(pages);

  // Q: back to the game, on a fresh page; the game's earlier text is still on the earlier pages.
  await press(page, /^Q/, keys(page));
  await expect(text(page)).toContainText('You put the menu away.');
  await expect(text(page)).not.toContainText('About the lamp');
  await expect(command(page)).toBeVisible();
  expect(await pageCount(page)).toBe(pages);
  const earlier = await earlierText(page);
  expect(earlier).toContain('A stone jetty');
  expect(earlier).toContain('menu');
  expect(earlier).not.toContain('About the');
});

test('the Transcript view keeps the replaced screens; a reload resumes on the last screen', async ({
  page,
}) => {
  await openMenu(page);
  await press(page, /^N/, keys(page));
  await expect(text(page)).toContainText('> About the keeper');
  await press(page, /^Q/, keys(page));
  await expect(text(page)).toContainText('You put the menu away.');
  const pages = await pageCount(page);

  // Every screen of the menu, each on a page of its own.
  await press(page, 'Navigation');
  await press(page, 'Transcript', page.getByRole('group', { name: 'Reader' }));
  const nav = page.getByRole('group', { name: 'Transcript' });
  await press(page, /Start/, nav);
  const count = Number((await indicator(page).innerText()).split('/')[1]);
  const seen: string[] = [];
  for (let i = 1; i <= count; i++) {
    await expect(indicator(page)).toHaveText(i + ' / ' + count);
    seen.push(await text(page).innerText());
    if (i < count) await page.keyboard.press('ArrowRight');
  }
  expect(seen.filter((p) => p.indexOf('> About the lamp') >= 0)).toHaveLength(1);
  expect(seen.filter((p) => p.indexOf('> About the keeper') >= 0)).toHaveLength(1);
  expect(count).toBe(pages + 2);
  await press(page, 'Back to the game', nav);

  // The autosave keeps where the last screen starts: after a reload it is still on a page of its own.
  await expect(command(page)).toBeVisible();
  await page.reload();
  await expect(text(page)).toContainText('You put the menu away.');
  await expect(text(page)).not.toContainText('A stone jetty');
  await expect(command(page)).toBeVisible();
});

test('a game that clears its window once shows the new text on a fresh page', async ({ page }) => {
  await openMenu(page);
  // The command that opened the menu stays with the text before it, its echo too.
  const earlier = await earlierText(page);
  expect(earlier).toContain('A stone jetty');
  expect(earlier).toMatch(/>\s*menu/);
});
