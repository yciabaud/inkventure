import { expect, test, type Page } from '@playwright/test';

// Answer chips (S1.17) in the Z-machine fixture: BOAT asks a yes/no question (the library's YesOrNo, read as a line),
// SIGNAL offers three numbered options.
const GAME = '/#/play/fixture-z';

async function press(target: ReturnType<Page['locator']>) {
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

function command(page: Page) {
  return page.getByRole('textbox', { name: 'Command' });
}

async function send(page: Page, text: string) {
  await command(page).fill(text);
  await press(page.getByRole('button', { name: 'Enter', exact: true }));
}

function answers(page: Page) {
  return page.getByRole('group', { name: 'Answers' });
}

function directions(page: Page) {
  return page.getByRole('group', { name: 'Directions' });
}

async function start(page: Page) {
  await page.goto(GAME);
  await press(page.getByRole('button', { name: 'Continue ›' }));
  await expect(command(page)).toBeVisible();
  // An ordinary prompt: the directions, no answers.
  await expect(directions(page).getByRole('button', { name: 'N', exact: true })).toBeVisible();
  await expect(answers(page)).toHaveCount(0);
}

test('a yes/no question gets Yes and No chips; a tap answers it and the directions come back', async ({
  page,
}) => {
  await start(page);
  await send(page, 'boat');
  await expect(page.locator('.reader__text')).toContainText('Do you want to call the boat back?');
  await expect(answers(page).getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
  await expect(answers(page).getByRole('button', { name: 'No', exact: true })).toBeVisible();
  // The answers come first; the directions that still fit follow, the others are in the dialog.
  await expect(answers(page).getByRole('button').first()).toHaveText('Yes');

  await press(answers(page).getByRole('button', { name: 'Yes', exact: true }));
  await expect(page.locator('.reader__text')).toContainText(
    'You shout, but the boat is too far away',
  );
  await expect(answers(page)).toHaveCount(0);
  await expect(directions(page).getByRole('button', { name: 'N', exact: true })).toBeVisible();
});

test('the chips stay when the game asks again ("Please answer yes or no.")', async ({ page }) => {
  await start(page);
  await send(page, 'boat');
  await expect(answers(page)).toBeVisible();
  await send(page, 'maybe');
  await expect(page.locator('.reader__text')).toContainText('Please answer yes or no.');
  await press(answers(page).getByRole('button', { name: 'No', exact: true }));
  await expect(page.locator('.reader__text')).toContainText('You let the boat go.');
  await expect(answers(page)).toHaveCount(0);
});

test('a numbered list gets a chip per option, which sends its number', async ({ page }) => {
  await start(page);
  await send(page, 'signal');
  await expect(page.locator('.reader__text')).toContainText('3. Light a flare');
  const chips = answers(page).getByRole('button', { name: /^[123]\b/ });
  await expect(chips).toHaveCount(3);
  // The number, and the start of the option when there is room for all of them.
  await expect(chips.first()).toHaveAccessibleName('1 — Wave the lantern');
  await expect(chips.first()).toHaveText(/^1( — Wave the lantern)?$/);

  await press(answers(page).getByRole('button', { name: /^2\b/ }));
  await expect(page.locator('.reader__text')).toContainText('The bell rings out over the water.');
  await expect(answers(page)).toHaveCount(0);
  await expect(directions(page).getByRole('button', { name: 'N', exact: true })).toBeVisible();
});
