import { expect, test, type Page } from '@playwright/test';

// The game's own RESTORE (S1.24): the file prompt is cancelled (saves go through the reader's menu), the game says so
// and goes on. It froze Z-machine games before.
const GAME = '/#/play/fixture-z';

async function press(page: Page, name: string) {
  const target = page.getByRole('button', { name: name, exact: true });
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

test("the game's own RESTORE fails without freezing the game; the next command plays", async ({
  page,
}) => {
  await page.goto(GAME);
  await press(page, 'Continue ›');
  await send(page, 'restore');
  await expect(page.locator('.reader__text')).toContainText('Restore failed.');
  await expect(command(page)).toBeVisible();
  await send(page, 'look');
  await expect(page.locator('.reader__text')).toContainText(
    'A stone jetty at the foot of the lighthouse.',
  );
});
