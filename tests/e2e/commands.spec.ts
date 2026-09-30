import { expect, test, type Page } from '@playwright/test';

const GAME = '/#/play/fixture-z';

function command(page: Page) {
  return page.getByRole('textbox', { name: 'Command' });
}

function top(page: Page) {
  return page.getByRole('button', { name: 'Navigation' });
}

/** Taps on touch projects, clicks on desktop. */
async function press(page: Page, name: string | RegExp, scope = page.locator('body')) {
  const target = scope.getByRole('button', { name: name, exact: typeof name === 'string' });
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

/** Starts the fixture game (`lang` overrides the game language) and answers its key prompt with Continue. */
async function begin(page: Page, lang?: string) {
  await page.goto(GAME + (lang ? '?lang=' + lang : ''));
  await press(page, 'Continue ›');
  await expect(command(page)).toBeVisible();
}

/** Taps the centre of `word` in the story text (its first occurrence in the last paragraph containing it). */
async function tapWord(page: Page, word: string) {
  const point = await page.evaluate((w) => {
    const blocks = Array.from(document.querySelectorAll('.reader__block'));
    for (let b = blocks.length - 1; b >= 0; b--) {
      const walker = document.createTreeWalker(blocks[b], NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const index = (node.nodeValue || '').indexOf(w);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + w.length);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  }, word);
  if (!point) throw new Error('word not found: ' + word);
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

test('tapping N sends north', async ({ page }) => {
  await begin(page);
  await press(page, 'N');
  await expect(page.getByText('>north')).toBeVisible();
  await expect(top(page)).toContainText('Foot of the Tower');
});

test('walk and pick up an object with taps only: Take… then a noun chip', async ({ page }) => {
  await begin(page);
  await press(page, 'Take…');
  await expect(command(page)).toHaveValue('take ');
  const nouns = page.getByRole('group', { name: 'Objects mentioned' });
  await expect(nouns.getByRole('button', { name: 'can', exact: true })).toBeVisible();
  await press(page, 'can', nouns);
  await expect(page.getByText('>take can')).toBeVisible();
  await expect(top(page)).toContainText('Score: 1');
  await press(page, 'N');
  await expect(top(page)).toContainText('Foot of the Tower');
  // The verbs row is back once the command is sent.
  await expect(page.getByRole('group', { name: 'Actions' })).toBeVisible();
});

test('Cancel (✕) leaves the object row without sending', async ({ page }) => {
  await begin(page);
  await press(page, 'Examine…');
  await press(page, 'Cancel');
  await expect(command(page)).toHaveValue('');
  await expect(page.getByRole('group', { name: 'Actions' })).toBeVisible();
});

test('tapping a word of the story inserts it; after a verb it completes and sends it', async ({
  page,
}) => {
  await begin(page);
  await tapWord(page, 'shed');
  await expect(command(page)).toHaveValue('shed ');
  await command(page).fill('');

  await press(page, 'Examine…');
  await tapWord(page, 'paraffin');
  await expect(page.getByText('>examine paraffin')).toBeVisible();
  await expect(page.getByText('A dented can, about a quarter full of paraffin.')).toBeVisible();
});

test('the chips follow the game language', async ({ page }) => {
  await begin(page, 'fr');
  const directions = page.getByRole('group', { name: 'Directions' });
  await expect(directions.getByRole('button', { name: 'O', exact: true })).toBeVisible();
  await expect(directions.getByRole('button', { name: 'Haut', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prendre…' })).toBeVisible();
  await press(page, 'O');
  await expect(page.getByText('>ouest')).toBeVisible();
});

test('more directions and more actions open in dialogs', async ({ page }) => {
  await begin(page);
  await press(page, 'More directions');
  const directions = page.getByRole('dialog', { name: 'Directions' });
  await press(page, 'NE', directions);
  await expect(directions).toBeHidden();
  await expect(page.getByText('>northeast')).toBeVisible();

  await press(page, 'More…');
  const more = page.getByRole('dialog', { name: 'More actions' });
  await press(page, 'Wait', more);
  await expect(page.getByText('>wait')).toBeVisible();
});

test('command history: previous / next from the More dialog and the arrow keys', async ({
  page,
}) => {
  await begin(page);
  await command(page).fill('look');
  await page.getByRole('button', { name: 'Enter' }).click();
  await press(page, 'N');
  await expect(page.getByText('>north')).toBeVisible();

  await press(page, 'More…');
  await press(page, '‹ Previous command', page.getByRole('dialog', { name: 'More actions' }));
  await expect(command(page)).toHaveValue('north');

  await command(page).focus();
  await page.keyboard.press('ArrowUp');
  await expect(command(page)).toHaveValue('look');
  await page.keyboard.press('ArrowDown');
  await expect(command(page)).toHaveValue('north');
  await page.keyboard.press('ArrowDown');
  await expect(command(page)).toHaveValue('');
});

test('opening the keyboard (a shorter page) keeps the command field on screen', async ({
  page,
}) => {
  await begin(page);
  // Enough text for several pages.
  for (const word of ['look', 'look', 'look']) {
    await command(page).fill(word);
    await page.getByRole('button', { name: 'Enter' }).click();
  }
  await command(page).focus();
  const size = page.viewportSize()!;
  // Like a virtual keyboard taking the lower half of the screen.
  await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.6) });
  await expect(command(page)).toBeInViewport();
  const text = (await page.locator('.reader__indicator').textContent()) || '';
  const [current, count] = text.split('/').map((n) => Number(n.trim()));
  expect(current).toBe(count);
  await page.setViewportSize(size);
});
