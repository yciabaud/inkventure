import { expect, test, type Page } from '@playwright/test';

const GAME = '/#/play/fixture-z';

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

function indicator(page: Page) {
  return page.locator('.reader__indicator');
}

async function send(page: Page, text: string, moves: number) {
  await command(page).fill(text);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(statusLine(page)).toContainText('Moves: ' + moves);
}

async function openTranscript(page: Page) {
  await press(page, 'Navigation');
  await press(page, 'Transcript', page.getByRole('group', { name: 'Reader' }));
  await expect(statusLine(page)).toContainText('Transcript');
}

/** The text of every page of the Transcript view, from its first page. */
async function transcriptPages(page: Page): Promise<string[]> {
  const nav = page.getByRole('group', { name: 'Transcript' });
  if (await nav.getByRole('button', { name: /Start/ }).isEnabled()) {
    await press(page, /Start/, nav);
  }
  await expect(indicator(page)).toHaveText(/^1 \/ \d+$/);
  const count = Number((await indicator(page).innerText()).split('/')[1]);
  const texts: string[] = [];
  for (let i = 1; i <= count; i++) {
    await expect(indicator(page)).toHaveText(i + ' / ' + count);
    texts.push(await page.locator('.reader__text').innerText());
    if (i < count) await page.keyboard.press('ArrowRight');
  }
  return texts;
}

test('the status line follows the player from room to room', async ({ page }) => {
  await page.goto(GAME);
  await press(page, 'Continue ›');
  await expect(statusLine(page)).toContainText('Landing Stage');
  await expect(statusLine(page)).toContainText('Moves: 0');
  await send(page, 'north', 1);
  await expect(statusLine(page)).toContainText('Foot of the Tower');
  await send(page, 'up', 2);
  await expect(statusLine(page)).toContainText('Lamp Room');
  await send(page, 'down', 3);
  await expect(statusLine(page)).toContainText('Foot of the Tower');
});

test('the transcript lists the whole session, read-only, and survives a reload', async ({
  page,
}) => {
  await page.goto(GAME);
  await press(page, 'Continue ›');
  await send(page, 'take can', 1);
  await send(page, 'north', 2);
  await send(page, 'up', 3);
  await expect(statusLine(page)).toContainText('Lamp Room');

  await openTranscript(page);
  // It opens on the latest turn, without the command bar.
  await expect(indicator(page)).toHaveText(/^(\d+) \/ \1$/);
  await expect(page.locator('.reader__text')).toContainText('>up');
  await expect(command(page)).toBeHidden();
  const nav = page.getByRole('group', { name: 'Transcript' });
  await expect(nav.getByRole('button', { name: /End/ })).toBeDisabled();

  let text = (await transcriptPages(page)).join('\n');
  expect(text).toContain('[Press any key to begin.]');
  for (const typed of ['>take can', '>north', '>up']) expect(text).toContain(typed);

  // Back to the game, which goes on.
  await press(page, 'Back to the game', nav);
  await expect(statusLine(page)).toContainText('Lamp Room');
  await send(page, 'fill lamp', 4);

  // After a reload, the transcript comes back from the autosave.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('ik:v1:save:fixture-z:auto');
        return raw ? (JSON.parse(raw) as { turn: number }).turn : -1;
      }),
    )
    .toBe(4);
  await page.reload();
  await expect(command(page)).toBeVisible();
  await openTranscript(page);
  text = (await transcriptPages(page)).join('\n');
  for (const typed of ['>take can', '>north', '>up', '>fill lamp']) expect(text).toContain(typed);
});
