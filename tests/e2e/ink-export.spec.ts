import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

// An ink game of the sample catalogue published as Inky's web export, zipped (S2.7): its story is read out of the
// export's script, played with the choice buttons, resumed after a reload; the Library's format filter finds it.

const TUID = 'fxinky0000000007';
const ZIP_URL = 'https://ifarchive.org/if-archive/games/ink/tide.zip';

async function press(target: Locator) {
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

function choice(page: Page, name: string) {
  return page
    .getByRole('list', { name: 'Choices' })
    .getByRole('button', { name: name, exact: true });
}

function text(page: Page) {
  return page.locator('.reader__text');
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
  await page.route(ZIP_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/zip',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync('tests/fixtures/ink/tide.zip'),
    }),
  );
});

test('a zipped ink web export plays a choice, reloads and continues to its ending', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/play/' + TUID);
  await expect(text(page)).toContainText('The ferry leaves you on the landing stage');
  await press(choice(page, 'Take the paraffin can'));
  await expect(text(page)).toContainText('You pick up the paraffin can.');
  await press(choice(page, 'Climb the stair'));
  await expect(choice(page, 'Fill the lamp')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key) !== null, 'ik:v1:save:' + TUID + ':auto'),
    )
    .toBe(true);

  // Again, from the cache: the story alone was kept, without the export's page and scripts.
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, 'ik:v1:file:' + TUID))
    .toBe(true);
  await page.unroute(ZIP_URL);
  await page.route('https://ifarchive.org/**', (route) => route.abort());
  await page.reload();
  await expect(choice(page, 'Fill the lamp')).toBeVisible();
  await press(choice(page, 'Fill the lamp'));
  await press(choice(page, 'Light the lamp'));
  await expect(text(page)).toContainText('THE END: you have lit the lamp.');
  await expect(page.getByText('The story has ended.')).toBeVisible();
  // The export's own scripts never ran (its main.js throws).
  expect(errors).toEqual([]);
});

test("the Library's Ink format filter finds the ink game", async ({ page }) => {
  await page.goto('/#/library?format=ink');
  await expect(page.getByText('1 adventure', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ink and Tide/ })).toBeVisible();
});
