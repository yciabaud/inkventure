import { expect, test, type Page } from '@playwright/test';

const GAME = '/#/play/fixture-z';

async function indicator(page: Page): Promise<{ page: number; count: number }> {
  const text = (await page.locator('.reader__indicator').textContent()) || '';
  const match = /(\d+)\s*\/\s*(\d+)/.exec(text);
  if (!match) throw new Error('no page indicator: ' + text);
  return { page: Number(match[1]), count: Number(match[2]) };
}

async function tapPage(page: Page) {
  const area = page.locator('.reader__page');
  const box = await area.boundingBox();
  if (!box) throw new Error('no text area');
  const position = { x: box.width * 0.8, y: box.height / 2 };
  if (test.info().project.use.hasTouch) await area.tap({ position });
  else await area.click({ position });
}

function command(page: Page) {
  return page.getByRole('textbox', { name: 'Command' });
}

async function send(page: Page, text: string) {
  await command(page).fill(text);
  await page.getByRole('button', { name: 'Enter' }).click();
}

/** Starts the fixture game and answers its "press any key" prompt with a tap on the page. */
async function begin(page: Page) {
  await page.goto(GAME);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue ›' })).toBeVisible();
  await tapPage(page);
  await expect(command(page)).toBeVisible();
}

/** The text is not clipped by the text area and nothing scrolls. */
async function fits(page: Page) {
  return page.evaluate(() => {
    const area = document.querySelector('.reader__page') as HTMLElement;
    const bottom =
      area.getBoundingClientRect().bottom - parseFloat(getComputedStyle(area).paddingBottom);
    const blocks = area.querySelectorAll('.reader__block');
    const last = blocks[blocks.length - 1];
    const doc = document.documentElement;
    return (
      (!last || last.getBoundingClientRect().bottom <= bottom + 0.5) &&
      area.scrollHeight <= area.clientHeight &&
      doc.scrollHeight <= doc.clientHeight &&
      doc.scrollWidth <= doc.clientWidth
    );
  });
}

test('type look and see the room description on the last page', async ({ page }) => {
  await begin(page);
  await expect(page.getByText('Someone has to light the lamp.')).toBeVisible();

  await send(page, 'look');
  await expect(page.getByText('>look')).toBeVisible();
  await expect(
    page.getByText(/^A stone jetty at the foot of the lighthouse\./).last(),
  ).toBeVisible();
  const { page: current, count } = await indicator(page);
  expect(current).toBe(count);
  await expect(command(page)).toBeVisible();
  await expect(command(page)).toHaveValue('');
  expect(await fits(page)).toBe(true);
});

test('plays a full session to the ending, with the status line', async ({ page }) => {
  await begin(page);
  const top = page.getByRole('button', { name: 'Navigation' });
  await expect(top).toContainText('Landing Stage');
  await expect(top).toContainText('Score: 0');

  const walkthrough = [
    'take can',
    'north',
    'up',
    'fill lamp',
    'down',
    'south',
    'open shed',
    'east',
    'take matches',
    'west',
    'north',
    'up',
  ];
  for (const step of walkthrough) {
    await send(page, step);
    // Each reply opens on the page of its command, which is also the last page here: the command bar is there.
    await expect(page.getByText('>' + step).last()).toBeVisible();
    expect(await fits(page)).toBe(true);
  }
  await expect(top).toContainText('Lamp Room');
  await expect(top).toContainText('Score: 2');

  await send(page, 'light lamp');
  await expect(page.getByText(/the beam sweeps out over the sea/)).toBeVisible();
  await expect(page.getByText(/You have won/)).toBeVisible();
  await expect(top).toContainText('Score: 3');
  // The library then offers RESTART, RESTORE, QUIT or UNDO.
  await send(page, 'quit');
  await expect(page.getByText('The story has ended.')).toBeVisible();
  await expect(command(page)).toHaveCount(0);
});

test('a key press answers a key prompt; arrows still turn pages during line input', async ({
  page,
}) => {
  await page.goto(GAME);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(command(page)).toBeVisible();
  // The command field does not swallow page turns when it is not focused.
  for (let i = 0; i < 6; i++) await send(page, 'look');
  const { count } = await indicator(page);
  expect(count).toBeGreaterThan(1);
  await command(page).blur();
  await page.keyboard.press('ArrowLeft');
  expect((await indicator(page)).page).toBe(count - 1);
});

test('the engine chunk and the story file load only in the reader', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/#/home');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await page.goto('/#/library');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  expect(requests.filter((url) => /zvmEngine|\.z5$/.test(url))).toEqual([]);

  await page.goto(GAME);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  expect(requests.some((url) => /zvmEngine/.test(url))).toBe(true);
  expect(requests.some((url) => /\.z5$/.test(url))).toBe(true);
});

test('shows an error page when the story cannot be downloaded', async ({ page }) => {
  await page.route(/\.z5$/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(GAME);
  await expect(page.getByRole('alert')).toContainText('The game could not be loaded.');
});

test('tap targets are ≥ 48 px during play', async ({ page }) => {
  await begin(page);
  const small = await page.evaluate(() => {
    const found: string[] = [];
    const targets = document.querySelectorAll('a[href], button, input, [role=button]');
    for (let i = 0; i < targets.length; i++) {
      const rect = targets[i].getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.width < 48 || rect.height < 48) found.push(targets[i].outerHTML.slice(0, 80));
    }
    return found;
  });
  expect(small).toEqual([]);
});
