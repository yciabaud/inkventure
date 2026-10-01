import { expect, test, type Locator, type Page } from '@playwright/test';

// The Glulx fixture (the Lamp at Saltmere built for Glulx) played through Quixe (S1.7).

const GAME = '/#/play/fixture-glulx';
const AUTOSAVE = 'ik:v1:save:fixture-glulx:auto';

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

function statusLine(page: Page) {
  return page.getByRole('button', { name: 'Navigation' });
}

async function send(page: Page, text: string, moves: number) {
  await command(page).fill(text);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(statusLine(page)).toContainText('Moves: ' + moves);
}

function autosavedTurn(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { turn: number }).turn : -1;
  }, AUTOSAVE);
}

async function menuAction(page: Page, name: string) {
  await press(statusLine(page));
  await press(button(page, name, page.getByRole('group', { name: 'Reader' })));
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('plays a Glulx game: key prompt, chips, commands, save, reload resumes, undo', async ({
  page,
}) => {
  await page.goto(GAME);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  await press(button(page, 'Continue ›'));
  await expect(command(page)).toBeVisible();
  await expect(statusLine(page)).toContainText('Landing Stage');

  // Chips: Take… then a noun, then a direction.
  await press(button(page, 'Take…'));
  await press(button(page, 'can', page.getByRole('group', { name: 'Objects mentioned' })));
  await expect(page.getByText('>take can')).toBeVisible();
  await expect(statusLine(page)).toContainText('Moves: 1');
  await press(button(page, 'N'));
  await expect(statusLine(page)).toContainText('Foot of the Tower');
  await expect(statusLine(page)).toContainText('Moves: 2');

  // A named save.
  await menuAction(page, 'Save…');
  const saveDialog = page.getByRole('dialog', { name: 'Save the game' });
  await press(saveDialog.getByRole('button', { name: /^Slot 1/ }));
  await expect(saveDialog.getByRole('status')).toHaveText('Game saved in slot 1.');
  await press(button(page, 'Close', saveDialog));

  await send(page, 'up', 3);
  await expect(page.locator('.reader__text')).toContainText('Lamp Room');
  await expect.poll(() => autosavedTurn(page)).toBe(3);

  // Reload: back on the last page, same turn, and the game goes on.
  await page.reload();
  await expect(command(page)).toBeVisible();
  await expect(statusLine(page)).toContainText('Lamp Room');
  await expect(statusLine(page)).toContainText('Moves: 3');
  await expect(page.locator('.reader__text')).toContainText('>up');
  await send(page, 'fill lamp', 4);
  await expect(page.locator('.reader__text')).toContainText(
    'You pour the paraffin into the reservoir.',
  );

  // Undo takes back the last turn.
  await expect.poll(() => autosavedTurn(page)).toBe(4);
  await menuAction(page, 'Undo');
  await expect(statusLine(page)).toContainText('Moves: 3');
  await expect(page.locator('.reader__text')).not.toContainText('paraffin into the reservoir');

  // Restoring slot 1 goes back to the foot of the tower.
  await menuAction(page, 'Restore…');
  const restoreDialog = page.getByRole('dialog', { name: 'Restore a saved game' });
  await press(restoreDialog.getByRole('button', { name: /^Slot 1/ }));
  await expect(statusLine(page)).toContainText('Foot of the Tower');
  await expect(statusLine(page)).toContainText('Moves: 2');
  await send(page, 'inventory', 3);
  await expect(page.locator('.reader__text')).toContainText('paraffin can');
});

test('the Glulx engine is a lazy chunk, loaded only in the reader', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/#/home');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(scripts.filter((url) => /quixeEngine/.test(url))).toEqual([]);
  await page.goto(GAME);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  expect(scripts.filter((url) => /quixeEngine/.test(url)).length).toBeGreaterThan(0);
});

test('?perf=1 shows how long the last turn took, for measuring on a device', async ({ page }) => {
  await page.goto(GAME + '?perf=1');
  await press(button(page, 'Continue ›'));
  await expect(command(page)).toBeVisible();
  await send(page, 'look', 1);
  await expect(statusLine(page)).toContainText(/\(\d+ ms\)/);
  // Also in the timings line (S7.1).
  await expect(page.getByTestId('perf-line')).toHaveText(/^Turn played in \d+ ms$/);

  await page.goto('/#/play/fixture-z');
  await press(button(page, 'Continue ›'));
  await expect(command(page)).toBeVisible();
  await expect(statusLine(page)).not.toContainText(/\(\d+ ms\)/);
});

test('turn times can be switched on in Settings, without editing the address', async ({ page }) => {
  await page.goto('/#/settings?s=about');
  const group = page.getByRole('group', { name: 'Timings' });
  await expect(group.getByRole('button', { name: 'Hidden' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await press(group.getByRole('button', { name: 'Shown' }));
  await expect(group.getByRole('button', { name: 'Shown' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.goto(GAME);
  await press(button(page, 'Continue ›'));
  await expect(command(page)).toBeVisible();
  await send(page, 'look', 1);
  await expect(statusLine(page)).toContainText(/\(\d+ ms\)/);

  // Switched off again: no time.
  await page.goto('/#/settings?s=about');
  await press(page.getByRole('group', { name: 'Timings' }).getByRole('button', { name: 'Hidden' }));
  await page.goto(GAME);
  await expect(command(page)).toBeVisible();
  await send(page, 'look', 2);
  await expect(statusLine(page)).not.toContainText(/\(\d+ ms\)/);
});

// The illustrated fixture (S1.10): a Blorb with one PNG, drawn in the main window.
const PICTURE_GAME = '/#/play/fixture-glulx-picture';
const PICTURE_AUTOSAVE = 'ik:v1:save:fixture-glulx-picture:auto';
const PICTURE_ALT = 'A painting of a lighthouse at dusk, its lamp lit above a dark sea.';

/** The text never runs past the bottom of the text area (minus what the command bar covers on the last page). */
async function expectPageFits(page: Page) {
  const overflow = await page.evaluate(() => {
    const area = document.querySelector('.reader__page') as HTMLElement;
    const last = document.querySelector('.reader__text')!.lastElementChild as HTMLElement | null;
    if (!last) return 0;
    const bottom =
      area.getBoundingClientRect().bottom - parseFloat(getComputedStyle(area).paddingBottom);
    const slot = document.querySelector('.reader__slot--raised');
    const limit = slot ? Math.min(bottom, slot.getBoundingClientRect().top) : bottom;
    return last.getBoundingClientRect().bottom - limit;
  });
  expect(overflow).toBeLessThanOrEqual(0.5);
}

/** Turns pages with `key` until the picture shows, checking that every page fits. */
async function findPicture(page: Page, key: 'ArrowLeft' | 'ArrowRight') {
  const picture = page.getByRole('img', { name: PICTURE_ALT });
  for (let i = 0; i < 6 && !(await picture.count()); i++) {
    await expectPageFits(page);
    await page.locator('.reader__page').focus();
    await page.keyboard.press(key);
  }
  await expect(picture).toBeVisible();
  await expectPageFits(page);
  return picture;
}

async function expectPictureShown(picture: Locator) {
  // Loaded, in grayscale, and inside the text column.
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(600);
  expect(await picture.evaluate((img) => getComputedStyle(img).filter)).toMatch(/grayscale\(1\)/);
  const size = await picture.evaluate((img) => {
    const column = document.querySelector('.reader__text')!.getBoundingClientRect();
    const box = img.getBoundingClientRect();
    return { width: box.width, height: box.height, column: column.width };
  });
  expect(size.width).toBeLessThanOrEqual(size.column + 0.5);
  // Its proportions are kept (600 × 400).
  expect(Math.abs(size.width / size.height - 1.5)).toBeLessThan(0.02);
}

test('shows the picture of an illustrated Glulx game in grayscale, and again after a reload', async ({
  page,
}) => {
  await page.goto(PICTURE_GAME);
  await expect(statusLine(page)).toContainText("The Keeper's Picture");
  await expect(page.locator('.reader__text')).toContainText("The keeper's cottage");
  // Opens on the first page; the picture is on it or a later one.
  const picture = await findPicture(page, 'ArrowRight');
  await expectPictureShown(picture);
  const present = button(page, 'Back to the present ›');
  if (await present.count()) await press(present);
  await expect(command(page)).toBeVisible();

  await command(page).fill('look');
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.locator('.reader__text')).toContainText(
    'You look at the painting a little longer (1).',
  );
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as { turn: number }).turn : -1;
      }, PICTURE_AUTOSAVE),
    )
    .toBe(1);

  // After a reload the reader opens on the last command; the picture is on an earlier page or the same one.
  await page.reload();
  await expect(command(page)).toBeVisible();
  await expect(page.locator('.reader__text')).toContainText('>look');
  await expectPictureShown(await findPicture(page, 'ArrowLeft'));
});
