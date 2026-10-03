import { readFileSync } from 'node:fs';
import { expect, test, type Frame, type Page } from '@playwright/test';

// A zipped Twine story with files of its own (S1.11): its picture, font, linked stylesheet and script are served
// from the zip, after a download and from the cache.

const TUID = 'fxtwin0000000006';
const ZIP_URL = 'https://ifarchive.org/if-archive/games/twine/lamp-files.zip';

/** The sample catalogue's Twine game, pointed to the zipped fixture. */
async function serveZip(page: Page) {
  await page.route('**/catalog/games/' + TUID + '.json', async (route) => {
    const game = await (await route.fetch()).json();
    game.file = { url: ZIP_URL, archive: { type: 'zip', primary: 'Lamp/index.html' } };
    await route.fulfill({ json: game });
  });
  await page.route(ZIP_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/zip',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync('tests/fixtures/twine/lamp-files.zip'),
    }),
  );
}

async function storyFrame(page: Page): Promise<Frame> {
  const frames = page.frameLocator('iframe.twine__frame');
  await expect(frames.locator('#lamp')).toBeVisible();
  const handle = await page.locator('iframe.twine__frame').elementHandle();
  const frame = handle && (await handle.contentFrame());
  if (!frame) throw new Error('No story frame');
  return frame;
}

/** Everything the story takes from its zip is there. */
async function expectFiles(page: Page) {
  const frame = await storyFrame(page);
  // The picture in the passage, and the one the story sets after it loaded.
  await expect
    .poll(() =>
      frame.evaluate(() =>
        ['lamp', 'late'].map(
          (id) => (document.getElementById(id) as HTMLImageElement).naturalWidth,
        ),
      ),
    )
    .toEqual([16, 16]);
  expect(
    await frame.evaluate(() => (document.getElementById('lamp') as HTMLImageElement).src),
  ).toMatch(/^data:image\/png;base64,/);
  // The font of the story's stylesheet.
  expect(
    await frame.evaluate(async () => {
      const faces = await document.fonts.load('16px LampFont');
      return faces.length > 0 && document.fonts.check('16px LampFont');
    }),
  ).toBe(true);
  // The linked stylesheet (and the picture it names) and the linked script.
  const styled = await frame.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.lamp-styled') as Element);
    return { spacing: style.letterSpacing, image: style.backgroundImage.slice(0, 26) };
  });
  expect(styled).toEqual({ spacing: '3px', image: 'url("data:image/png;base64' });
  expect(
    await frame.evaluate(() => document.documentElement.getAttribute('data-lamp-script')),
  ).toBe('ran');
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('a zipped Twine story shows its own pictures, font, style and script, then plays from the cache', async ({
  page,
}) => {
  await serveZip(page);
  await page.goto('/#/play/' + TUID);
  await expectFiles(page);
  await expect(
    page.frameLocator('iframe.twine__frame').getByText('Light the lamp', { exact: true }),
  ).toBeVisible();

  // Kept offline with its files (S5.3; written a little after the start).
  await expect
    .poll(() =>
      page.evaluate((tuid) => {
        return Object.keys(JSON.parse(localStorage.getItem('ik:v1:kept') || '{}')).indexOf(tuid);
      }, TUID),
    )
    .toBe(0);

  // Again without the network.
  await page.unroute(ZIP_URL);
  await page.route('https://ifarchive.org/**', (route) => route.abort());
  await page.reload();
  await expectFiles(page);
});
