import { expect, test, type Locator, type Page } from '@playwright/test';

// Chips for the commands the text names in capitals (S1.19), in the Z-machine fixture: TIPS answers "Type WAKE UP if
// you feel sleepy, or LOGBOOK to read the keeper's log."
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

function text(page: Page) {
  return page.locator('.reader__text');
}

test('the commands the text names in capitals become chips, first in the verbs row', async ({
  page,
}) => {
  await page.goto(GAME);
  await press(page.getByRole('button', { name: 'Continue ›' }));
  await expect(command(page)).toBeVisible();
  // An ordinary turn: the usual verbs only.
  await expect(verbs(page).locator('.chip--named')).toHaveCount(0);

  await send(page, 'tips');
  await expect(text(page)).toContainText('Type WAKE UP if you feel sleepy');
  const named = verbs(page).locator('.chip--named:not(.fit-hidden)');
  await expect(named).toHaveText(['WAKE UP', 'LOGBOOK']);

  // A multi-word command is one chip, sent whole, in lower case.
  await press(verbs(page).getByRole('button', { name: 'WAKE UP', exact: true }));
  await expect(text(page)).toContainText('>wake up');
  await expect(text(page)).toContainText('The dreadful truth is, this is not a dream.');
  // The new text names none: the chips are gone.
  await expect(verbs(page).locator('.chip--named')).toHaveCount(0);
  await expect(verbs(page).getByRole('button', { name: 'Look', exact: true })).toBeVisible();

  await send(page, 'tips');
  await press(verbs(page).getByRole('button', { name: 'LOGBOOK', exact: true }));
  await expect(text(page)).toContainText("The keeper's logbook. Press Q to quit the menu.");
});
