import { expect, test, type Page } from '@playwright/test';

// Menus drawn in the upper window (S1.22), in the Z-machine fixture: GUIDE draws a centred title, a legend in two
// columns and three subjects in the upper window, like Lost Pig's HELP, and waits for a key.
const GAME = '/#/play/fixture-z';

async function press(page: Page, name: string | RegExp, scope = page.locator('body')) {
  const target = scope.getByRole('button', { name: name, exact: typeof name === 'string' });
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

function command(page: Page) {
  return page.getByRole('textbox', { name: 'Command' });
}

function keys(page: Page) {
  return page.getByRole('group', { name: 'Keys' });
}

function text(page: Page) {
  return page.locator('.reader__text');
}

function indicator(page: Page) {
  return page.locator('.reader__indicator');
}

async function openGuide(page: Page) {
  await page.goto(GAME);
  await press(page, 'Continue ›');
  await command(page).fill('guide');
  await press(page, 'Enter');
  await expect(text(page)).toContainText('> The lamp');
}

test('the guide drawn in the upper window shows in the text area; N moves the selection on the same screen', async ({
  page,
}) => {
  await openGuide(page);
  // The subjects in the text area, the selected one in bold; the legend too.
  await expect(text(page)).toContainText('The keeper');
  await expect(text(page)).toContainText('The boat');
  await expect(text(page)).toContainText('N = next subject');
  await expect(text(page).locator('.reader__run--subheader')).toHaveText('> The lamp');
  // The top zone keeps the centred title only.
  const top = page.getByRole('button', { name: 'Navigation' });
  await expect(top).toContainText('Saltmere guide');
  await expect(top).not.toContainText('N = next subject');
  await expect(text(page)).not.toContainText('Saltmere guide');
  // The game's text before it is not on this screen.
  await expect(text(page)).not.toContainText('Landing Stage');
  await expect(indicator(page)).toHaveText('1 / 1');

  await press(page, /^N/, keys(page));
  await expect(text(page).locator('.reader__run--subheader')).toHaveText('> The keeper');
  await expect(indicator(page)).toHaveText('1 / 1');
  await press(page, /^P/, keys(page));
  await expect(text(page).locator('.reader__run--subheader')).toHaveText('> The lamp');
});

test('Return opens a subject, a key comes back to the guide, Q resumes the game on a fresh page', async ({
  page,
}) => {
  await openGuide(page);
  await press(page, /^N/, keys(page));
  await expect(text(page).locator('.reader__run--subheader')).toHaveText('> The keeper');
  await press(page, /^Return/, keys(page));
  await expect(text(page)).toContainText('The keeper rowed out at dawn');
  await expect(text(page)).not.toContainText('The boat');

  await press(page, 'Continue ›');
  await expect(text(page).locator('.reader__run--subheader')).toHaveText('> The keeper');

  await press(page, /^Q/, keys(page));
  await expect(text(page)).toContainText('You close the guide.');
  await expect(text(page)).not.toContainText('The boat');
  await expect(command(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Navigation' })).toContainText('Landing Stage');
});
