import { readFileSync } from 'node:fs';
import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';

// A Decker game of the sample catalogue (S2.9): the tour deck as Decker's web export, zipped. The Library's format
// filter finds it, its page says Decker, and Play downloads the zip and opens the deck in the Decker reader.

const TUID = 'fxdeck0000000012';
const ZIP_URL = 'https://ifarchive.org/if-archive/games/html/tour.zip';

async function press(target: Locator) {
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

/** The deck's frame, once its first card is drawn. */
async function deckFrame(page: Page): Promise<Frame> {
  await expect(page.locator('iframe.decker__frame')).toBeVisible({ timeout: 30_000 });
  let frame: Frame | null = null;
  await expect
    .poll(
      async () => {
        frame = page.frames().find((f) => f.url() === 'about:srcdoc') || null;
        if (!frame) return 0;
        return frame.evaluate(() => {
          const ik = (window as unknown as { ikDecker?: { draws?: number } }).ikDecker;
          return (ik && ik.draws) || 0;
        });
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  return frame!;
}

test.beforeEach(async ({ page }) => {
  await page.context().route('https://ifdb.org/**', (route) => route.abort());
  await page.context().route(ZIP_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/zip',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync('tests/fixtures/decker/tour.zip'),
    }),
  );
});

test("the Library's Decker filter finds the Decker game, and its page says Decker", async ({
  page,
}) => {
  await page.goto('/#/library?format=decker');
  await expect(page.getByText('1 adventure', { exact: true })).toBeVisible();
  await press(page.getByRole('link', { name: /The Decker Tour/ }));
  await expect(page).toHaveURL(new RegExp('#/game/' + TUID + '$'));
  await expect(page.locator('.game__badges')).toContainText('Decker');
  await expect(page.locator('.game__badges')).toContainText('Experimental');
});

test('a catalogue Decker game downloads and opens on its first card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    // Playwright's `serviceWorkers: 'block'` reads navigator.serviceWorker in every frame, which a sandboxed frame
    // refuses: not the deck's (as in decker.spec.ts).
    if (!/service ?worker/i.test(error.message)) errors.push(error.message);
  });
  await page.goto('/#/game/' + TUID);
  await press(page.getByRole('link', { name: 'Play', exact: true }));
  const frame = await deckFrame(page);
  await expect(page.getByRole('button', { name: 'Navigation' })).toContainText('The Decker Tour');
  expect(
    await frame.evaluate(
      () => (window as unknown as { ikDecker: { cardName: string } }).ikDecker.cardName,
    ),
  ).toBe('home');
  // The export's own script never ran (it throws): the reader ran the deck with its runtime.
  expect(errors).toEqual([]);
});
