import { expect, test, type Page } from '@playwright/test';

const GAME = '/#/play/fixture-z';
const AUTOSAVE = 'ik:v1:save:fixture-z:auto';

async function press(page: Page, name: string | RegExp, scope = page.locator('body')) {
  const target = scope.getByRole('button', { name: name, exact: typeof name === 'string' });
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

function command(page: Page) {
  return page.getByRole('textbox', { name: 'Command' });
}

function statusLine(page: Page) {
  return page.getByRole('button', { name: 'Navigation' });
}

/** Sends a command and waits for the turn to be counted on the status line. */
async function send(page: Page, text: string, moves: number) {
  await command(page).fill(text);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(statusLine(page)).toContainText('Moves: ' + moves);
}

/** The turn of the autosave on disk (-1 when there is none). */
function autosavedTurn(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { turn: number }).turn : -1;
  }, AUTOSAVE);
}

async function begin(page: Page) {
  await page.goto(GAME);
  await expect(page.getByRole('button', { name: 'Continue ›' })).toBeVisible();
  await press(page, 'Continue ›');
  await expect(command(page)).toBeVisible();
}

async function menuAction(page: Page, name: string) {
  await press(page, 'Navigation');
  await press(page, name, page.getByRole('group', { name: 'Reader' }));
}

function lastPageText(page: Page) {
  return page.locator('.reader__text');
}

test('reloading mid-game resumes at the same turn with the last page of text', async ({ page }) => {
  await begin(page);
  await send(page, 'take can', 1);
  await send(page, 'north', 2);
  await send(page, 'up', 3);
  await expect(lastPageText(page)).toContainText('Lamp Room');
  await expect.poll(() => autosavedTurn(page)).toBe(3);

  await page.reload();
  await expect(command(page)).toBeVisible();
  await expect(statusLine(page)).toContainText('Lamp Room');
  await expect(statusLine(page)).toContainText('Moves: 3');
  // The last page shows the last turn, and the game goes on from there.
  await expect(page.locator('.reader__indicator')).toHaveText(/^(\d+) \/ \1$/);
  await expect(lastPageText(page)).toContainText('>up');
  await expect(lastPageText(page)).toContainText('Lamp Room');
  await send(page, 'fill lamp', 4);
  await expect(lastPageText(page)).toContainText('You pour the paraffin into the reservoir.');
});

test('restoring a slot goes back to the saved turn', async ({ page }) => {
  await begin(page);
  await send(page, 'take can', 1);
  await send(page, 'north', 2);

  await menuAction(page, 'Save…');
  const saveDialog = page.getByRole('dialog', { name: 'Save the game' });
  await expect(saveDialog.getByRole('textbox', { name: 'Save name' })).toHaveValue(
    'Foot of the Tower',
  );
  await saveDialog.getByRole('textbox', { name: 'Save name' }).fill('Before the climb');
  await press(page, /^Slot 2/, saveDialog);
  await expect(saveDialog.getByRole('status')).toHaveText('Game saved in slot 2.');
  await expect(saveDialog.getByRole('button', { name: /^Slot 2/ })).toContainText(
    'Before the climb · turn 2 · today',
  );
  await press(page, 'Close', saveDialog);

  await send(page, 'up', 3);
  await send(page, 'fill lamp', 4);

  await menuAction(page, 'Restore…');
  const restoreDialog = page.getByRole('dialog', { name: 'Restore a saved game' });
  await expect(restoreDialog.getByRole('button', { name: /^Slot 1/ })).toBeDisabled();
  await press(page, /^Slot 2/, restoreDialog);
  await expect(restoreDialog).toBeHidden();
  await expect(statusLine(page)).toContainText('Foot of the Tower');
  await expect(statusLine(page)).toContainText('Moves: 2');
  await expect(lastPageText(page)).not.toContainText('paraffin into the reservoir');

  // The restored game is the one autosaved, and the lamp is still dry.
  await expect.poll(() => autosavedTurn(page)).toBe(2);
  await send(page, 'up', 3);
  await send(page, 'light lamp', 4);
  await expect(lastPageText(page)).toContainText('The reservoir is dry');
});

test('undo takes back one turn', async ({ page }) => {
  await begin(page);
  const undo = () => menuAction(page, 'Undo');
  await send(page, 'take can', 1);
  await expect.poll(() => autosavedTurn(page)).toBe(1);
  await send(page, 'north', 2);
  await expect.poll(() => autosavedTurn(page)).toBe(2);

  await undo();
  await expect(statusLine(page)).toContainText('Landing Stage');
  await expect(statusLine(page)).toContainText('Moves: 1');
  await expect(lastPageText(page)).not.toContainText('>north');
  await expect(command(page)).toBeVisible();
  await expect.poll(() => autosavedTurn(page)).toBe(1);

  // Still carrying the can taken on turn 1.
  await send(page, 'inventory', 2);
  await expect(lastPageText(page)).toContainText('paraffin');
});

test('restart asks first, then starts the story again', async ({ page }) => {
  await begin(page);
  await send(page, 'take can', 1);
  await menuAction(page, 'Restart');
  const dialog = page.getByRole('dialog', { name: 'Restart the story?' });
  await press(page, 'Cancel', dialog);
  await expect(statusLine(page)).toContainText('Moves: 1');

  await menuAction(page, 'Restart');
  await press(page, 'Restart', dialog);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  await expect.poll(() => autosavedTurn(page)).toBe(-1);
  await press(page, 'Continue ›');
  await send(page, 'inventory', 1);
  await expect(lastPageText(page)).toContainText("You're carrying nothing.");
});
