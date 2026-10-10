import { expect, test, type Locator, type Page } from '@playwright/test';

// The committed sample catalogue (public/catalog): "Bells of Aldermere" is its one illustrated game (its Blorb holds
// three pictures besides the cover, tests/fixtures/pictures.json). Cover thumbnails are blocked: no network in tests.
const BELLS = 'fxbell0000000002';

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

function names(page: Page) {
  return page
    .getByRole('list', { name: 'Adventures' })
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('the Illustrated filter shows only the illustrated game, whose page has the badge', async ({
  page,
}) => {
  await page.goto('/#/library');
  await expect(page.getByText('8 adventures')).toBeVisible();

  await press(page.getByRole('link', { name: 'Filters' }));
  const illustrated = page.getByRole('button', { name: /^Illustrated/ });
  await expect(illustrated).toContainText('1');
  await press(illustrated);
  await expect(illustrated).toHaveAttribute('aria-pressed', 'true');
  await press(page.getByRole('button', { name: 'Show 1 adventure' }));

  await expect(page).toHaveURL(/#\/library\?ill=1$/);
  await expect(page.getByText('1 adventure', { exact: true })).toBeVisible();
  await expect.poll(() => names(page)).toEqual(['Bells of Aldermere, A. Example']);
  await expect(page.getByRole('link', { name: 'Filters (1)' })).toBeVisible();

  await page.reload();
  await expect.poll(() => names(page)).toEqual(['Bells of Aldermere, A. Example']);

  await press(page.getByRole('link', { name: 'Bells of Aldermere, A. Example' }));
  await expect(page).toHaveURL(new RegExp('#/game/' + BELLS + '$'));
  await expect(page.locator('.game__badges')).toContainText('Illustrated');
  await expect(page.getByText('Glulx', { exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/library\?ill=1$/);
  await expect.poll(() => names(page)).toEqual(['Bells of Aldermere, A. Example']);
});

test('a game without pictures has no Illustrated badge', async ({ page }) => {
  await page.goto('/#/game/fxlamp0000000001');
  await expect(page.getByText('Z-code', { exact: true })).toBeVisible();
  await expect(page.locator('.game__badges')).not.toContainText('Illustrated');
});
