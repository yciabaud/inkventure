import { expect, test, type Locator, type Page } from '@playwright/test';

// Timings for measuring on a device (S7.1): Home, the Library's first results and a page turn, shown with `?perf=1`
// or the Timings setting.

async function press(target: Locator) {
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

function line(page: Page) {
  return page.getByTestId('perf-line');
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('with ?perf=1: Home ready, first Library results and a page turn are timed', async ({
  page,
}) => {
  await page.goto('/#/home?perf=1');
  await expect(line(page)).toHaveText(/^Home ready in \d+ ms$/);

  await page.goto('/#/library?perf=1');
  await expect(line(page)).toHaveText(/^First results in \d+ ms$/);

  await page.goto('/#/play/demo?perf=1');
  const area = page.locator('.reader__page');
  await expect(page.locator('.reader__block').first()).toBeVisible();
  const box = await area.boundingBox();
  if (!box) throw new Error('no text area');
  const position = { x: box.width * 0.8, y: box.height / 2 };
  if (test.info().project.use.hasTouch) await area.tap({ position });
  else await area.click({ position });
  await expect(line(page)).toHaveText(/^Page turned in \d+ ms$/);
  // The line lets taps through.
  expect(await line(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
});

test('no timings without the flag; the Timings setting shows them', async ({ page }) => {
  await page.goto('/#/home');
  await expect(page.locator('.screen.home')).toBeVisible();
  await expect(line(page)).toHaveCount(0);

  await page.goto('/#/settings?s=about');
  await press(page.getByRole('group', { name: 'Timings' }).getByRole('button', { name: 'Shown' }));
  await page.goto('/#/home');
  await page.reload();
  await expect(line(page)).toHaveText(/^Home ready in \d+ ms$/);
});
