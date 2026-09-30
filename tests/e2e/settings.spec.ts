import { expect, test, type Page } from '@playwright/test';

const DEMO = '/#/play/demo';
const GAME = '/#/play/fixture-z';

async function literataLoaded(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const faces: FontFace[] = [];
    document.fonts.forEach((face) => {
      if (face.family.replace(/["']/g, '') === 'Literata') faces.push(face);
    });
    return faces.length > 0 && faces.every((face) => face.status === 'loaded');
  });
}

async function openDemo(page: Page) {
  await page.goto(DEMO);
  await expect(page.locator('.reader__block').first()).toBeVisible();
  await expect.poll(() => literataLoaded(page), { timeout: 10_000 }).toBe(true);
}

/** Opens the demo with whatever settings are saved, once no web font is still loading. */
async function openSettled(page: Page) {
  await page.goto(DEMO);
  await expect(page.locator('.reader__block').first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        let loading = 0;
        document.fonts.forEach((face) => {
          if (face.status === 'loading') loading++;
        });
        return loading;
      }),
    )
    .toBe(0);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function pageCount(page: Page): Promise<number> {
  const text = (await page.locator('.reader__indicator').textContent()) || '';
  const match = /(\d+)\s*\/\s*(\d+)/.exec(text);
  if (!match) throw new Error('no page indicator: ' + text);
  return Number(match[2]);
}

async function press(page: Page, name: string, scope = page.locator('body')) {
  const target = scope.getByRole('button', { name: name, exact: true });
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

/** Opens the "Aa" dialog from the top menu. */
async function openSettings(page: Page) {
  await press(page, 'Navigation');
  await press(page, 'Text settings');
  const dialog = page.getByRole('dialog', { name: 'Text settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The last line on the page is not clipped and nothing scrolls. */
async function fits(page: Page) {
  return page.evaluate(() => {
    const area = document.querySelector('.reader__page') as HTMLElement;
    const bottom =
      area.getBoundingClientRect().bottom - parseFloat(getComputedStyle(area).paddingBottom);
    const blocks = area.querySelectorAll('.reader__block');
    const last = blocks[blocks.length - 1];
    return (
      (!last || last.getBoundingClientRect().bottom <= bottom + 0.5) &&
      area.scrollHeight <= area.clientHeight
    );
  });
}

test('a larger font re-paginates at once and persists after reload', async ({ page }) => {
  await openDemo(page);
  const before = await pageCount(page);
  const dialog = await openSettings(page);
  await expect(dialog.getByText('3 / 6')).toBeVisible();
  await press(page, 'Larger text', dialog);
  await press(page, 'Larger text', dialog);
  await expect(dialog.getByText('5 / 6')).toBeVisible();
  await expect.poll(() => pageCount(page)).toBeGreaterThan(before);
  const larger = await pageCount(page);
  expect(await fits(page)).toBe(true);

  await page.reload();
  await expect(page.locator('.reader__block').first()).toBeVisible();
  await expect.poll(() => pageCount(page)).toBe(larger);
  await expect(page.locator('.reader__page')).toHaveCSS('font-size', '24px');
});

/** Page 1 as rendered: block index and character range of each fragment. */
async function fragments(page: Page): Promise<string[]> {
  return page
    .locator('.reader__block')
    .evaluateAll((nodes) =>
      nodes.map(
        (n) =>
          n.getAttribute('data-block') +
          ':' +
          n.getAttribute('data-start') +
          '-' +
          n.getAttribute('data-end'),
      ),
    );
}

test('every setting re-paginates exactly like a fresh load, and the page still fits', async ({
  page,
  context,
}) => {
  await openDemo(page);
  const dialog = await openSettings(page);
  const steps: Array<[string, string]> = [
    ['Typeface', 'Sans-serif'],
    ['Line spacing', 'Loose'],
    ['Margins', 'Wide'],
    ['Alignment', 'Justified'],
    ['Typeface', 'Easy reading'],
  ];
  for (const [group, option] of steps) {
    const button = dialog.getByRole('group', { name: group }).getByRole('button', { name: option });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(await fits(page)).toBe(true);
    // A reader opened now, with the settings just saved, lays page 1 out the same way: the change re-paginated.
    const reference = await context.newPage();
    await openSettled(reference);
    const expected = await fragments(reference);
    await reference.close();
    await page.bringToFront();
    await expect.poll(() => fragments(page)).toEqual(expected);
  }
  await expect(page.locator('.reader__page')).toHaveCSS('padding-left', '48px');
  await expect(page.locator('.reader__page')).toHaveCSS('text-align', 'justify');
});

test('"For this game only" keeps the other games on the defaults', async ({ page }) => {
  await openDemo(page);
  let dialog = await openSettings(page);
  await dialog.getByLabel('For this game only').check();
  await press(page, 'Smaller text', dialog);
  await expect(page.locator('.reader__page')).toHaveCSS('font-size', '16px');

  await page.goto(GAME);
  await expect(page.locator('.reader__page')).toHaveCSS('font-size', '18px');

  await page.goto(DEMO);
  await expect(page.locator('.reader__page')).toHaveCSS('font-size', '16px');
  dialog = await openSettings(page);
  await expect(dialog.getByLabel('For this game only')).toBeChecked();
  // Unticking goes back to the defaults.
  await dialog.getByLabel('For this game only').uncheck();
  await expect(page.locator('.reader__page')).toHaveCSS('font-size', '18px');
});

test('the top menu offers Refresh screen, and every control is at least 48 px', async ({
  page,
}) => {
  await openDemo(page);
  await press(page, 'Navigation');
  await expect(page.getByRole('group', { name: 'Reader' })).toBeVisible();
  await press(page, 'Refresh screen');
  await expect(page.locator('.screen-flash')).toHaveCount(0);

  await openSettings(page);
  const small = await page.evaluate(() => {
    const found: string[] = [];
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    const targets = dialog.querySelectorAll('button, label, input[type=checkbox]');
    for (let i = 0; i < targets.length; i++) {
      const el = targets[i] as HTMLElement;
      // The checkbox itself sits inside a ≥ 48 px label, which is the tap target.
      if (el.tagName === 'INPUT') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 48 || rect.height < 48) found.push(el.textContent || el.tagName);
    }
    return found;
  });
  expect(small).toEqual([]);
});
