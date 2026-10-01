import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { zipSync } from 'fflate';

// The committed sample catalogue (public/catalog): "The Lamp at Saltmere" points to lamp.z5 on the IF Archive,
// "Hollow Mountain" to hollow.zip holding hollow/HOLLOW.Z3. Both are served from the fixture story: no network.
const LAMP = 'fxlamp0000000001';
const HOLLOW = 'fxzork0000000005';
const CAVE = 'fxcave0000000003';
const LAMP_URL = 'https://ifarchive.org/if-archive/games/zcode/lamp.z5';
const HOLLOW_URL = 'https://ifarchive.org/if-archive/games/zcode/hollow.zip';
const STORY = readFileSync('tests/fixtures/zmachine/lamp.z5');

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

function serve(route: Route, body: Buffer | Uint8Array) {
  return route.fulfill({
    status: 200,
    contentType: 'application/octet-stream',
    headers: { 'access-control-allow-origin': '*' },
    body: Buffer.from(body),
  });
}

/** The game has started: its first screen asks for a key. */
async function started(page: Page) {
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('Play downloads the story with a progress page, starts it, and keeps it for next time', async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  let requests = 0;
  await page.route(LAMP_URL, async (route) => {
    requests++;
    await held;
    await serve(route, STORY);
  });

  await page.goto('/#/game/' + LAMP);
  await press(page.getByRole('link', { name: 'Play' }));
  await expect(page).toHaveURL(new RegExp('#/play/' + LAMP + '$'));
  await expect(page.getByRole('heading', { level: 1, name: 'The Lamp at Saltmere' })).toBeVisible();
  await expect(page.getByText('Downloading the game…')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
    'href',
    '#/game/' + LAMP,
  );

  release();
  await started(page);
  expect(requests).toBe(1);

  // Small files are cached (a moment after the start): the next session needs no network.
  await expect
    .poll(() => page.evaluate((tuid) => !!localStorage.getItem('ik:v1:file:' + tuid), LAMP))
    .toBe(true);
  await page.unroute(LAMP_URL);
  await page.route(LAMP_URL, (route) => route.abort());
  await page.reload();
  await started(page);
});

test('a zipped story is unzipped and started', async ({ page }) => {
  await page.route(HOLLOW_URL, (route) => serve(route, zipSync({ 'hollow/HOLLOW.Z3': STORY })));
  await page.goto('/#/play/' + HOLLOW);
  await started(page);
});

test('a failed download shows the error page; Try again starts the game', async ({ page }) => {
  let fail = true;
  await page.route(LAMP_URL, (route) =>
    fail ? route.fulfill({ status: 404, body: 'Not found' }) : serve(route, STORY),
  );
  await page.goto('/#/play/' + LAMP);
  await expect(
    page.getByRole('heading', { level: 1, name: 'The game could not be downloaded' }),
  ).toBeVisible();
  await expect(page.getByText('The file host answered with error 404.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open on IFDB' })).toHaveAttribute(
    'href',
    'https://ifdb.org/viewgame?id=' + LAMP,
  );
  const report = await page.getByRole('link', { name: 'Report a problem' }).getAttribute('href');
  expect(report).toMatch(/^https:\/\/github\.com\/yciabaud\/inkventure\/issues\/new\?title=/);
  expect(decodeURIComponent(report!)).toContain(LAMP_URL);

  fail = false;
  await press(page.getByRole('button', { name: 'Try again' }));
  await started(page);
});

test('a file that is not a story is refused', async ({ page }) => {
  await page.route(LAMP_URL, (route) =>
    serve(route, Buffer.from('<!DOCTYPE html>' + ' '.repeat(99))),
  );
  await page.goto('/#/play/' + LAMP);
  await expect(
    page.getByText('The downloaded file is not a story this app can open.'),
  ).toBeVisible();
});

test('a format without an engine says so, without downloading', async ({ page }) => {
  const detail = JSON.parse(readFileSync('public/catalog/games/' + CAVE + '.json', 'utf8'));
  await page.route('**/catalog/games/' + CAVE + '.json', (route) =>
    route.fulfill({ status: 200, json: { ...detail, format: 'tads' } }),
  );
  let downloads = 0;
  await page.route('https://www.ifarchive.org/**', (route) => {
    downloads++;
    return route.abort();
  });
  await page.goto('/#/play/' + CAVE);
  await expect(page.getByRole('heading', { level: 1, name: 'Not playable yet' })).toBeVisible();
  await expect(page.getByText('tads games cannot be played in Inkventure yet.')).toBeVisible();
  expect(downloads).toBe(0);
});

test('a game no longer in the catalogue leads to the library', async ({ page }) => {
  await page.route('**/catalog/games/nosuchgame.json', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.goto('/#/play/nosuchgame');
  await expect(page.getByRole('heading', { name: 'Adventure not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the library' })).toBeVisible();
});
