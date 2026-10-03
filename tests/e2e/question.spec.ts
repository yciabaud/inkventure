import { expect, test, type Locator, type Page } from '@playwright/test';

// Object chips when the parser asks what to act on (S1.21), in the Z-machine fixture: at the foot of the tower, two
// oilskins share a word, so EXAMINE asks "What do you want to examine?" and OILSKIN "Which do you mean, the yellow
// oilskin or the black oilskin?".
const GAME = '/#/play/fixture-z';

async function press(target: Locator) {
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

function verbs(page: Page) {
  return page.getByRole('group', { name: 'Actions' });
}

function objects(page: Page) {
  return page.getByRole('group', { name: 'Objects mentioned' });
}

function text(page: Page) {
  return page.locator('.reader__text');
}

async function toTower(page: Page) {
  await page.goto(GAME);
  await press(page.getByRole('button', { name: 'Continue ›' }));
  await expect(command(page)).toBeVisible();
  await send(page, 'north');
  await expect(text(page)).toContainText('A yellow oilskin and a black oilskin hang by the door.');
  // An ordinary turn: the verbs row, no objects.
  await expect(verbs(page).getByRole('button', { name: 'Look', exact: true })).toBeVisible();
  await expect(objects(page)).toHaveCount(0);
}

test('the parser asks what to examine: a tap on an object answers it, then the options of "Which do you mean"', async ({
  page,
}) => {
  await toTower(page);
  await send(page, 'examine');
  await expect(text(page)).toContainText('What do you want to examine?');
  // The objects recently mentioned, in place of the verbs.
  await expect(verbs(page)).toHaveCount(0);
  await press(objects(page).getByRole('button', { name: 'oilskin', exact: true }));
  // The noun alone is sent: the parser completes the command with it.
  await expect(text(page)).toContainText('>oilskin');
  await expect(text(page)).toContainText(
    'Which do you mean, the yellow oilskin or the black oilskin?',
  );

  // One chip per option, in order.
  await expect(objects(page).locator('.chip--noun:not(.fit-hidden)')).toHaveText([
    'yellow oilskin',
    'black oilskin',
  ]);
  await press(objects(page).getByRole('button', { name: 'black oilskin', exact: true }));
  await expect(text(page)).toContainText("The keeper's black oilskin. Its pockets are empty.");
  // The question is answered: the verbs come back.
  await expect(objects(page)).toHaveCount(0);
  await expect(verbs(page).getByRole('button', { name: 'Look', exact: true })).toBeVisible();
});

test('✕ puts the objects away and brings the verbs back', async ({ page }) => {
  await toTower(page);
  await send(page, 'examine oilskin');
  await expect(objects(page).getByRole('button', { name: 'yellow oilskin' })).toBeVisible();
  await press(objects(page).getByRole('button', { name: 'Back to the actions' }));
  await expect(objects(page)).toHaveCount(0);
  await expect(verbs(page).getByRole('button', { name: 'Look', exact: true })).toBeVisible();
  // The same question on the next turn gets its chips again.
  await send(page, 'examine oilskin');
  await expect(objects(page).getByRole('button', { name: 'yellow oilskin' })).toBeVisible();
});

test('a question in words no table knows, after a verb alone, repeats the verb, which a tap on an object completes', async ({
  page,
}) => {
  await toTower(page);
  // The game asks in its own words: the verb sent alone and the short question are enough.
  await send(page, 'open');
  await expect(text(page)).toContainText('Open what, exactly?');
  const row = objects(page).locator('.chip:not(.fit-hidden):not(.chip--more)');
  await expect(row.first()).toHaveText('open…');
  // The object completes the command.
  await press(objects(page).getByRole('button', { name: 'oilskin', exact: true }));
  await expect(text(page)).toContainText('>open oilskin');
  await expect(text(page)).toContainText(
    'Which do you mean, the yellow oilskin or the black oilskin?',
  );
  // That question names its options: the object alone answers it.
  await expect(objects(page).locator('.chip--repeat')).toHaveCount(0);
  await press(objects(page).getByRole('button', { name: 'black oilskin', exact: true }));
  await expect(text(page)).toContainText('>black oilskin');
  await expect(objects(page)).toHaveCount(0);
});

test('the repeated verb can be tapped to complete it by hand', async ({ page }) => {
  await toTower(page);
  await send(page, 'open');
  await press(objects(page).getByRole('button', { name: 'Complete “open”' }));
  await expect(command(page)).toHaveValue('open ');
});
