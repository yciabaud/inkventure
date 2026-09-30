import { expect, test, type Locator, type Page } from '@playwright/test';

// The ink fixture (the Lamp at Saltmere told with choices) played through inkjs (S1.8): taps only.

const GAME = '/#/play/fixture-ink';
const AUTOSAVE = 'ik:v1:save:fixture-ink:auto';

async function press(target: Locator) {
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

function choices(page: Page) {
  return page.getByRole('list', { name: 'Choices' });
}

function choice(page: Page, name: string) {
  return choices(page).getByRole('button', { name: name, exact: true });
}

function statusLine(page: Page) {
  return page.getByRole('button', { name: 'Navigation' });
}

function text(page: Page) {
  return page.locator('.reader__text');
}

function autosavedTurn(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { turn: number }).turn : -1;
  }, AUTOSAVE);
}

async function menuAction(page: Page, name: string) {
  await press(statusLine(page));
  await press(page.getByRole('group', { name: 'Reader' }).getByRole('button', { name: name }));
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('plays an ink story with choice buttons, resumes after a reload, to its ending', async ({
  page,
}) => {
  await page.goto(GAME);
  await expect(text(page)).toContainText('The ferry leaves you on the landing stage');
  await expect(statusLine(page)).toContainText('The Lamp at Saltmere');
  await expect(statusLine(page)).toContainText('The Landing Stage');
  // Numbered, full-width buttons; no command bar.
  await expect(choices(page).getByRole('button')).toHaveCount(2);
  await expect(choices(page).getByRole('listitem').first()).toContainText('1Take the paraffin can');
  await expect(page.getByRole('textbox', { name: 'Command' })).toHaveCount(0);

  await press(choice(page, 'Take the paraffin can'));
  await expect(text(page)).toContainText('You pick up the paraffin can.');
  await expect(statusLine(page)).toContainText('Foot of the Tower');
  await press(choice(page, 'Climb the stair'));
  await expect(statusLine(page)).toContainText('The Lamp Room');
  await expect(choice(page, 'Fill the lamp')).toBeVisible();
  await expect.poll(() => autosavedTurn(page)).toBe(2);

  // Reload: same point, the choices are offered again.
  await page.reload();
  await expect(choice(page, 'Fill the lamp')).toBeVisible();
  await expect(statusLine(page)).toContainText('The Lamp Room');
  await expect(text(page)).toContainText('Climb the stair');

  await press(choice(page, 'Fill the lamp'));
  await expect(text(page)).toContainText('You pour the paraffin into the reservoir.');
  await press(choice(page, 'Light the lamp'));
  await expect(text(page)).toContainText('THE END: you have lit the lamp.');
  await expect(page.getByText('The story has ended.')).toBeVisible();
  await expect(choices(page)).toHaveCount(0);
});

test('undo goes back one choice; save and restore a slot', async ({ page }) => {
  await page.goto(GAME);
  await press(choice(page, 'Walk up to the lighthouse'));
  await expect(choice(page, 'Go back for the paraffin can')).toBeVisible();
  await expect.poll(() => autosavedTurn(page)).toBe(1);

  await menuAction(page, 'Save…');
  const saveDialog = page.getByRole('dialog', { name: 'Save the game' });
  await press(saveDialog.getByRole('button', { name: /^Slot 1/ }));
  await expect(saveDialog.getByRole('status')).toHaveText('Game saved in slot 1.');
  await press(saveDialog.getByRole('button', { name: 'Close', exact: true }));

  await press(choice(page, 'Go back for the paraffin can'));
  await expect(text(page)).toContainText('You fetch the paraffin can');
  await expect.poll(() => autosavedTurn(page)).toBe(2);
  await menuAction(page, 'Undo');
  await expect(text(page)).not.toContainText('You fetch the paraffin can');
  await expect(choice(page, 'Go back for the paraffin can')).toBeVisible();

  await press(choice(page, 'Wait for morning'));
  await expect(text(page)).toContainText('THE END: the lamp stays dark.');
  await menuAction(page, 'Restore…');
  const restoreDialog = page.getByRole('dialog', { name: 'Restore a saved game' });
  await press(restoreDialog.getByRole('button', { name: /^Slot 1/ }));
  await expect(choice(page, 'Climb the stair')).toBeVisible();
  await expect(statusLine(page)).toContainText('Foot of the Tower');
});

test('the ink engine is a lazy chunk, loaded only in the reader', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/#/home');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(scripts.filter((url) => /inkEngine/.test(url))).toEqual([]);
  await page.goto(GAME);
  await expect(choice(page, 'Take the paraffin can')).toBeVisible();
  expect(scripts.filter((url) => /inkEngine/.test(url)).length).toBeGreaterThan(0);
});
