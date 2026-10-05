import { expect, test, type Page } from '@playwright/test';

// Boxes drawn in the upper window (S1.23): Inform's quote box shows in the text area, at the start of the turn, while
// the top zone keeps the status line. The Z-machine fixture's QUOTE draws one in the upper window, VERSE one at a key
// prompt; the Glulx fixture's QUOTE opens a window of its own. The Z-machine intro centres its title with spaces.
const Z = '/#/play/fixture-z';
const GLULX = '/#/play/fixture-glulx';

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

function text(page: Page) {
  return page.locator('.reader__text');
}

function top(page: Page) {
  return page.getByRole('button', { name: 'Navigation' });
}

/** The text of the blocks on the page, the centred ones marked. */
async function blocks(page: Page): Promise<string[]> {
  return text(page)
    .locator('.reader__block')
    .evaluateAll((els) =>
      els.map(
        (el) =>
          (el.classList.contains('reader__block--center') ? '[centre] ' : '') + el.textContent,
      ),
    );
}

const POEM = [
  '[centre] The sea is calm tonight.\nThe tide is full, the moon lies fair\nUpon the straits.',
  '[centre] -- Matthew Arnold, Dover Beach',
  'You remember the poem the keeper liked.',
];

for (const [name, game] of [
  ['Z-machine', Z],
  ['Glulx', GLULX],
]) {
  test(`${name}: QUOTE reads in full in the text area, after the command; the status line stays on top`, async ({
    page,
  }) => {
    await page.goto(game);
    await press(page, 'Continue ›');
    await send(page, 'quote');
    await expect(text(page)).toContainText('You remember the poem the keeper liked.');
    const shown = await blocks(page);
    const at = shown.indexOf(POEM[0]);
    expect(at).toBeGreaterThan(0);
    expect(shown[at - 1]).toMatch(/quote$/);
    expect(shown.slice(at, at + 3)).toEqual(POEM);
    await expect(top(page)).toContainText('Landing Stage');
    await expect(top(page)).not.toContainText('The sea is calm');

    // The next command: the poem stays in the turn it came with.
    await send(page, 'look');
    await expect(text(page)).toContainText('A stone jetty');
    await expect(top(page)).toContainText('Landing Stage');
    await expect(top(page)).not.toContainText('The sea is calm');
  });
}

test('Z-machine: VERSE shows its box at a key prompt; a key goes on', async ({ page }) => {
  await page.goto(Z);
  await press(page, 'Continue ›');
  await send(page, 'verse');
  await expect(text(page)).toContainText('[Press any key.]');
  const shown = await blocks(page);
  const at = shown.indexOf('[centre] Sunset and evening star,\nAnd one clear call for me!');
  expect(at).toBeGreaterThan(0);
  expect(shown.slice(at + 1, at + 3)).toEqual([
    '[centre] -- Alfred Tennyson, Crossing the Bar',
    '[Press any key.]',
  ]);
  await press(page, 'Continue ›');
  await expect(text(page)).toContainText('You close the book of verse.');
  await expect(text(page)).toContainText('Sunset and evening star,');
});

test('a title centred with spaces is centred, on one line', async ({ page }) => {
  await page.goto(Z);
  const title = text(page).locator('.reader__block', { hasText: 'The Lamp at Saltmere' });
  await expect(title).toHaveClass(/reader__block--center/);
  await expect(title).toHaveText('The Lamp at Saltmere');
  const prompt = text(page).locator('.reader__block', { hasText: '[Press any key to begin.]' });
  const heights = await Promise.all(
    [title, prompt].map((el) => el.evaluate((e) => e.getBoundingClientRect().height)),
  );
  expect(heights[0]).toBeCloseTo(heights[1], 0);
});
