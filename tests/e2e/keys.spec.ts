import { expect, test, type Page } from '@playwright/test';

// Single-key prompts (S1.12) in the Z-machine fixture: HELP asks "Choose 1 or 2.", LOGBOOK "Press Q to quit the menu."
// and turns a page for any other key.
const GAME = '/#/play/fixture-z';

async function tapPage(page: Page) {
  const area = page.locator('.reader__page');
  const box = await area.boundingBox();
  if (!box) throw new Error('no text area');
  const position = { x: box.width * 0.8, y: box.height / 2 };
  if (test.info().project.use.hasTouch) await area.tap({ position });
  else await area.click({ position });
}

function command(page: Page) {
  return page.getByRole('textbox', { name: 'Command' });
}

async function send(page: Page, text: string) {
  await command(page).fill(text);
  await page.getByRole('button', { name: 'Enter' }).click();
}

function keys(page: Page) {
  return page.getByRole('group', { name: 'Keys' });
}

test('"press any key": Continue and Key… only, and a tap on the page answers it', async ({
  page,
}) => {
  await page.goto(GAME);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue ›' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Type a key' })).toBeVisible();
  await expect(keys(page)).toHaveCount(0);
  await tapPage(page);
  await expect(command(page)).toBeVisible();
});

test('the key chips of "Choose 1 or 2." send the key the game asks for', async ({ page }) => {
  await page.goto(GAME);
  await page.getByRole('button', { name: 'Continue ›' }).click();
  await send(page, 'help');
  await expect(page.getByText('Choose 1 or 2.')).toBeVisible();
  await expect(keys(page).getByRole('button')).toHaveText(['1', '2']);
  await expect(page.getByRole('button', { name: 'Continue ›' })).toBeVisible();

  // The game names its keys: a tap on the page no longer stands for "any key".
  await tapPage(page);
  await expect(keys(page)).toBeVisible();

  await keys(page).getByRole('button', { name: '2' }).click();
  await expect(page.getByText("Credits: written for Inkventure's tests.")).toBeVisible();
  await expect(page.getByText('Hint: the lamp needs paraffin')).toHaveCount(0);
  await expect(command(page)).toBeVisible();
});

test('Key… sends the letter typed, and the Q chip leaves the menu', async ({ page }) => {
  await page.goto(GAME);
  await page.getByRole('button', { name: 'Continue ›' }).click();
  await send(page, 'logbook');
  await expect(page.getByText('Press Q to quit the menu.')).toBeVisible();
  await expect(keys(page).getByRole('button')).toHaveText(['Q — quit the menu']);

  const field = page.getByRole('textbox', { name: 'Type a key' });
  await field.click();
  await page.keyboard.type('x');
  await expect(page.getByText('You turn a page (x).')).toBeVisible();

  // Still in the menu: the chips are read again from the text since the last command.
  await expect(keys(page).getByRole('button')).toHaveText(['Q — quit the menu']);
  await page.getByRole('textbox', { name: 'Type a key' }).fill('7');
  await expect(page.getByText('You turn a page (7).')).toBeVisible();

  await keys(page).getByRole('button', { name: 'Q — quit the menu' }).click();
  await expect(page.getByText('You close the logbook.')).toBeVisible();
  await expect(command(page)).toBeVisible();
});
