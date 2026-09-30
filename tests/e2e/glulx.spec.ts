import { expect, test, type Locator, type Page } from '@playwright/test';

// The Glulx fixture (the Lamp at Saltmere built for Glulx) played through Quixe (S1.7).

const GAME = '/#/play/fixture-glulx';
const AUTOSAVE = 'ik:v1:save:fixture-glulx:auto';

async function press(target: Locator) {
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

function button(page: Page, name: string, scope: Locator = page.locator('body')) {
  return scope.getByRole('button', { name: name, exact: true });
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

function autosavedTurn(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { turn: number }).turn : -1;
  }, AUTOSAVE);
}

async function menuAction(page: Page, name: string) {
  await press(statusLine(page));
  await press(button(page, name, page.getByRole('group', { name: 'Reader' })));
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('plays a Glulx game: key prompt, chips, commands, save, reload resumes, undo', async ({
  page,
}) => {
  await page.goto(GAME);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  await press(button(page, 'Continue ›'));
  await expect(command(page)).toBeVisible();
  await expect(statusLine(page)).toContainText('Landing Stage');

  // Chips: Take… then a noun, then a direction.
  await press(button(page, 'Take…'));
  await press(button(page, 'can', page.getByRole('group', { name: 'Objects mentioned' })));
  await expect(page.getByText('>take can')).toBeVisible();
  await expect(statusLine(page)).toContainText('Moves: 1');
  await press(button(page, 'N'));
  await expect(statusLine(page)).toContainText('Foot of the Tower');
  await expect(statusLine(page)).toContainText('Moves: 2');

  // A named save.
  await menuAction(page, 'Save…');
  const saveDialog = page.getByRole('dialog', { name: 'Save the game' });
  await press(saveDialog.getByRole('button', { name: /^Slot 1/ }));
  await expect(saveDialog.getByRole('status')).toHaveText('Game saved in slot 1.');
  await press(button(page, 'Close', saveDialog));

  await send(page, 'up', 3);
  await expect(page.locator('.reader__text')).toContainText('Lamp Room');
  await expect.poll(() => autosavedTurn(page)).toBe(3);

  // Reload: back on the last page, same turn, and the game goes on.
  await page.reload();
  await expect(command(page)).toBeVisible();
  await expect(statusLine(page)).toContainText('Lamp Room');
  await expect(statusLine(page)).toContainText('Moves: 3');
  await expect(page.locator('.reader__text')).toContainText('>up');
  await send(page, 'fill lamp', 4);
  await expect(page.locator('.reader__text')).toContainText(
    'You pour the paraffin into the reservoir.',
  );

  // Undo takes back the last turn.
  await expect.poll(() => autosavedTurn(page)).toBe(4);
  await menuAction(page, 'Undo');
  await expect(statusLine(page)).toContainText('Moves: 3');
  await expect(page.locator('.reader__text')).not.toContainText('paraffin into the reservoir');

  // Restoring slot 1 goes back to the foot of the tower.
  await menuAction(page, 'Restore…');
  const restoreDialog = page.getByRole('dialog', { name: 'Restore a saved game' });
  await press(restoreDialog.getByRole('button', { name: /^Slot 1/ }));
  await expect(statusLine(page)).toContainText('Foot of the Tower');
  await expect(statusLine(page)).toContainText('Moves: 2');
  await send(page, 'inventory', 3);
  await expect(page.locator('.reader__text')).toContainText('paraffin can');
});

test('the Glulx engine is a lazy chunk, loaded only in the reader', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/#/home');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(scripts.filter((url) => /quixeEngine/.test(url))).toEqual([]);
  await page.goto(GAME);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  expect(scripts.filter((url) => /quixeEngine/.test(url)).length).toBeGreaterThan(0);
});

test('?perf=1 shows how long the last turn took, for measuring on a device', async ({ page }) => {
  await page.goto(GAME + '?perf=1');
  await press(button(page, 'Continue ›'));
  await expect(command(page)).toBeVisible();
  await send(page, 'look', 1);
  await expect(statusLine(page)).toContainText(/\(\d+ ms\)/);

  await page.goto('/#/play/fixture-z');
  await press(button(page, 'Continue ›'));
  await expect(command(page)).toBeVisible();
  await expect(statusLine(page)).not.toContainText(/\(\d+ ms\)/);
});
