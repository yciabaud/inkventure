import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

// Offline mode (S5.3). The app's Service Worker is blocked in the other tests (playwright.config.ts).
test.use({ serviceWorkers: 'allow' });

// The committed sample catalogue: "The Lamp at Saltmere" points to lamp.z5 on the IF Archive, served from the fixture.
const LAMP = 'fxlamp0000000001';
const LAMP_URL = 'https://ifarchive.org/if-archive/games/zcode/lamp.z5';
const STORY = readFileSync('tests/fixtures/zmachine/lamp.z5');
const AUTOSAVE = 'ik:v1:save:' + LAMP + ':auto';

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

function command(page: Page) {
  return page.getByRole('textbox', { name: 'Command' });
}

/** Sends a command and waits for the turn to be counted on the status line. */
async function send(page: Page, text: string, moves: number) {
  await command(page).fill(text);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.getByRole('button', { name: 'Navigation' })).toContainText('Moves: ' + moves);
}

async function online(context: BrowserContext) {
  await context.route('https://ifdb.org/**', (route) => route.abort());
  await context.route(LAMP_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' },
      body: STORY,
    }),
  );
}

/**
 * Wi-Fi off, as in the S0.9 probe's test: `setOffline` does not reach the Service Worker's own fetches in Chromium, so
 * every request to the site fails too. Only the worker's caches can answer.
 */
async function offline(context: BrowserContext) {
  await context.setOffline(true);
  await context.route(/^http:\/\/localhost:\d+\//, (route) => route.abort('internetdisconnected'));
  await context.unroute(LAMP_URL);
  await context.route(LAMP_URL, (route) => route.abort('internetdisconnected'));
}

/** Goes to `hash` with a new page load (served by the Service Worker when offline). */
async function load(page: Page, hash: string) {
  await page.evaluate((target) => history.replaceState(null, '', target), hash);
  await page.reload();
}

/** Opens the game page, waits for the Service Worker to control the page, then keeps the game offline. */
async function keepLamp(page: Page) {
  await page.goto('/#/game/' + LAMP);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
    .toBe(true);
  await press(page.getByRole('button', { name: 'Keep offline' }));
  await expect(page.getByText(/^Kept on this device: \d+ KB\./)).toBeVisible();
  expect(await engineCached(page)).toBe(true);
}

/** Whether the Z-machine engine is in the app's cache (the kept game's engine). */
function engineCached(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.indexOf('inkventure-app-') === 0);
    if (!names.length) return false;
    const cache = await caches.open(names[0]);
    return (await cache.keys()).some((request) =>
      /\/assets\/zvmEngine-[^/]+\.js$/.test(request.url),
    );
  });
}

test.beforeEach(({ browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'offline emulation of a Service Worker is reliable in Chromium only',
  );
});

test('a kept adventure opens, plays, saves and resumes with Wi-Fi off; the Library says it is offline', async ({
  page,
  context,
}) => {
  await online(context);
  await keepLamp(page);

  await offline(context);
  await load(page, '/#/home');
  // Home, from local data: the kept game is in My adventures and can be played.
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  const shelf = page.getByRole('list', { name: 'My adventures' });
  await expect(shelf.getByRole('link', { name: /The Lamp at Saltmere/ })).toBeVisible();
  await expect(shelf.getByText('Needs Wi-Fi')).toHaveCount(0);
  await expect(page.getByText('Offline: connect to browse the catalogue.')).toBeVisible();

  await press(page.getByRole('link', { name: 'Library' }).first());
  await expect(page.getByRole('heading', { name: 'Offline' })).toBeVisible();
  await expect(page.getByText('Offline: connect to browse the catalogue.')).toBeVisible();

  // Its page opens from the kept copy, and the game starts from the kept file.
  await load(page, '/#/game/' + LAMP);
  await expect(page.getByRole('heading', { level: 1, name: 'The Lamp at Saltmere' })).toBeVisible();
  await press(page.getByRole('link', { name: 'Play' }));
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  await press(page.getByRole('button', { name: 'Continue ›' }));
  await send(page, 'take can', 1);
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as { turn: number }).turn : -1;
      }, AUTOSAVE),
    )
    .toBe(1);

  // A new launch, still offline, resumes from the autosave.
  await page.reload();
  await expect(command(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Navigation' })).toContainText('Moves: 1');
  await send(page, 'north', 2);
});

test('removed from the device, the game needs Wi-Fi offline', async ({ page, context }) => {
  await online(context);
  await keepLamp(page);

  await load(page, '/#/settings?s=offline');
  const list = page.getByRole('list', { name: 'Kept adventures' });
  await expect(list).toContainText('The Lamp at Saltmere');
  await expect(page.getByText(/^1 adventure kept: \d+ KB$/)).toBeVisible();
  await press(list.getByRole('button', { name: 'Remove from device' }));
  await expect(
    page.getByText('No adventure is kept on this device yet.', { exact: false }),
  ).toBeVisible();
  const left = await page.evaluate(async () => {
    const cache = await caches.open('inkventure-kept');
    return (await cache.keys()).map((request) => request.url).filter((url) => /story$/.test(url));
  });
  expect(left).toEqual([]);

  await offline(context);
  await load(page, '/#/home');
  const shelf = page.getByRole('list', { name: 'My adventures' });
  await expect(shelf.getByText('Needs Wi-Fi')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Continue' })).toHaveCount(0);

  await load(page, '/#/play/' + LAMP);
  await expect(page.getByRole('heading', { level: 1, name: 'Needs Wi-Fi' })).toBeVisible();
  await expect(
    page.getByText('This adventure is not kept on this device. Connect to the Wi-Fi to play it.'),
  ).toBeVisible();
});

test('a new build is installed online, drops the previous cache, and the kept adventure still plays', async ({
  page,
  context,
}) => {
  await online(context);
  await keepLamp(page);
  const appCaches = () =>
    page.evaluate(async () =>
      (await caches.keys()).filter((name) => name.indexOf('inkventure-app-') === 0),
    );
  // Playwright cannot serve another sw.js to the browser's update check, so the previous build is simulated: this
  // build's cache becomes an older one and the worker is gone, as before a first visit of this build.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration!.unregister();
    const name = (await caches.keys()).filter((n) => n.indexOf('inkventure-app-') === 0)[0];
    const from = await caches.open(name);
    const to = await caches.open('inkventure-app-previous');
    for (const request of await from.keys()) await to.put(request, (await from.match(request))!);
    await caches.delete(name);
  });
  const version = /"version":"([0-9a-f]+)"/.exec(readFileSync('dist/sw.js', 'utf8'))![1];

  await page.reload();
  // Installed: the shell and the kept game's engine (listed in the kept cache) are in the new cache, the old is gone.
  await expect.poll(appCaches, { timeout: 30_000 }).toEqual(['inkventure-app-' + version]);
  const engine = await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return (await cache.keys()).some((request) => /\/assets\/zvmEngine-/.test(request.url));
  }, 'inkventure-app-' + version);
  expect(engine).toBe(true);

  await offline(context);
  await load(page, '/#/play/' + LAMP);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
});

test('starting a game keeps it offline automatically', async ({ page, context }) => {
  await online(context);
  await page.goto('/#/play/' + LAMP);
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
  // A moment after the start: kept (not in the story file cache), marked as kept automatically.
  await expect
    .poll(() =>
      page.evaluate((tuid) => {
        const kept = JSON.parse(localStorage.getItem('ik:v1:kept') || '{}') as Record<
          string,
          { auto?: number }
        >;
        return {
          auto: kept[tuid] ? kept[tuid].auto : undefined,
          cached: !!localStorage.getItem('ik:v1:file:' + tuid),
        };
      }, LAMP),
    )
    .toEqual({ auto: 1, cached: false });
  await expect.poll(() => engineCached(page)).toBe(true);

  await offline(context);
  await page.reload();
  await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
});
