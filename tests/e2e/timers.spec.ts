import { expect, test, type Locator, type Page } from '@playwright/test';

// Timer events (S1.25): TIDE in the fixture games waits for a key with a timer of 2 s (a timed @read_char in the
// Z-machine, glk_request_timer_events in Glulx); the tide rises at each tick and the second one ends the wait. The
// page's clock is faked, so the ticks come when the test says.

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

function text(page: Page) {
  return page.locator('.reader__text');
}

function indicator(page: Page) {
  return page.locator('.reader__indicator');
}

/** Stops the page's clock (a moment ahead, as it still runs meanwhile): no timer fires until the test runs it on. */
async function pauseClock(page: Page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 50);
}

async function send(page: Page, value: string) {
  await command(page).fill(value);
  await press(button(page, 'Enter'));
}

/** Opens `game`, starts it and sends TIDE; the clock is then paused, so no tick comes until the test moves it. */
async function watchTide(page: Page, game: string) {
  await page.clock.install();
  await page.goto(game);
  await press(button(page, 'Continue ›'));
  await expect(command(page)).toBeVisible();
  await send(page, 'tide');
  await expect(text(page)).toContainText('You watch the water and wait.');
  await pauseClock(page);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

for (const [format, game] of [
  ['Z-machine', '/#/play/fixture-z'],
  ['Glulx', '/#/play/fixture-glulx'],
]) {
  test(`${format}: text comes on the game's timer, without a key`, async ({ page }) => {
    await watchTide(page, game);
    await expect(text(page)).not.toContainText('The tide rises.');
    await page.clock.runFor(2000);
    await expect(text(page)).toContainText('The tide rises.');
    // Still waiting for the key.
    await expect(button(page, 'Continue ›')).toBeVisible();
    await page.clock.runFor(2000);
    await expect(text(page)).toContainText('The tide is full.');
    await expect(text(page)).toContainText('You stop watching the tide.');
    await expect(command(page)).toBeVisible();
  });
}

test('no tick while the Transcript view is open; the game goes on after it', async ({ page }) => {
  await watchTide(page, '/#/play/fixture-z');
  await press(page.getByRole('button', { name: 'Navigation' }));
  await press(button(page, 'Transcript', page.getByRole('group', { name: 'Reader' })));
  await expect(button(page, 'Back to the game')).toBeVisible();
  await page.clock.runFor(10000);
  await press(button(page, 'Back to the game'));
  await expect(button(page, 'Continue ›')).toBeVisible();
  // Effects run after a frame, which the paused clock holds back too: the timer starts again then.
  await page.clock.runFor(100);
  await expect(text(page)).not.toContainText('The tide rises.');
  await page.clock.runFor(2000);
  await expect(text(page)).toContainText('The tide rises.');
});

test('text that comes on a timer leaves the reader on the page being read', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#/play/fixture-z');
  await press(button(page, 'Continue ›'));
  // A few pages of text, then BELL: a line of input whose routine prints every 2 s.
  for (let i = 0; i < 6; i++) {
    await send(page, 'look');
    await expect(command(page)).toBeVisible();
  }
  await send(page, 'bell');
  await expect(text(page)).toContainText('What do you call out?');
  await pauseClock(page);
  const last = await indicator(page).innerText();
  await page.keyboard.press('ArrowLeft');
  await expect(indicator(page)).not.toHaveText(last);
  const reading = await indicator(page).innerText();
  const shown = await text(page).innerText();

  await page.clock.runFor(2000);
  // The bell's text goes on the last page; the page being read stays.
  await expect(indicator(page)).toHaveText(new RegExp('^' + reading.split('/')[0].trim() + ' /'));
  expect(await text(page).innerText()).toBe(shown);
  await press(button(page, 'Last page ›'));
  await expect(text(page)).toContainText('A bell rings out at sea.');
  // Still the same line: the command bar takes it.
  await send(page, 'hello');
  await expect(text(page)).toContainText('only the bell answers');
});
