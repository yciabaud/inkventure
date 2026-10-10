import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { relocateDdb, toJddb } from '../../scripts/build/daad-game/relocate';

// The DAAD probe (S0.13): our test game, The Lamp Room, in jDAAD as patched for e-ink (scripts/build/daad-probe.ts).
// Everything it loads is same-origin (dist/probe/daad/); no network.

interface Stats {
  draws: number;
  loc: number;
  waiting: string;
  pictures: number;
  zoom: number;
}

function stats(page: Page): Promise<Stats> {
  return page.evaluate(() => {
    const ik = (window as unknown as { ikDaad: Stats }).ikDaad;
    return {
      draws: ik.draws,
      loc: ik.loc,
      waiting: ik.waiting,
      pictures: ik.pictures,
      zoom: ik.zoom,
    };
  });
}

function canvas(page: Page): Promise<string> {
  return page.locator('#paper').evaluate((c: HTMLCanvasElement) => c.toDataURL());
}

/** The colour of one pixel of the game's screen (320 × 200). */
function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return page
    .locator('#paper')
    .evaluate(
      (c: HTMLCanvasElement, at) =>
        Array.from(c.getContext('2d')!.getImageData(at[0], at[1], 1, 1).data),
      [x, y],
    );
}

async function waitingFor(page: Page, waiting: string, loc?: number) {
  await expect
    .poll(async () => {
      const s = await stats(page);
      return loc == null || s.loc === loc ? s.waiting : s.waiting + ' at ' + s.loc;
    })
    .toBe(waiting);
}

/** Taps keys of jDAAD's on-screen keyboard (a mouse press, as touch is not emulated here). */
async function tapKeys(page: Page, keys: string[]) {
  for (const key of keys) await page.locator(`#virtualKeyboardDAAD [id="${key}"]`).click();
}

test('the probe plays The Lamp Room: keys and the device keyboard, a new picture, nothing drawn while waiting', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/probe/daad/');
  // The intro waits for a key; a tap on the picture continues to the shore and its picture.
  await waitingFor(page, 'key', 0);
  await expect(page.locator('#hint')).toHaveText('Tap the picture or a key to continue');
  await page.locator('#paper').click();
  await waitingFor(page, 'command', 1);
  expect((await stats(page)).pictures).toBe(1);
  // Black text on white paper, by default.
  expect(await pixel(page, 2, 199)).toEqual([255, 255, 255, 255]);

  // A command typed on jDAAD's keyboard gets its answer.
  let before = await canvas(page);
  await tapKeys(page, ['H', 'E', 'L', 'P', 'ENTER']);
  await expect.poll(() => canvas(page)).not.toBe(before);
  await waitingFor(page, 'command', 1);

  // The device keyboard through the text field: a real key per keydown…
  before = await canvas(page);
  await page.locator('#type').pressSequentially('x sea');
  await page.locator('#type').press('Enter');
  await expect.poll(() => canvas(page)).not.toBe(before);
  // …or, where keydown has no key, the field's text: NORTH goes to the lamp room and its picture.
  await page.locator('#type').evaluate((input: HTMLInputElement) => {
    input.value = 'north';
    input.dispatchEvent(new Event('input'));
  });
  await page.locator('#type-enter').click();
  await waitingFor(page, 'command', 2);
  expect((await stats(page)).pictures).toBe(2);

  // The game waits: nothing is drawn for a few seconds.
  const waiting = await stats(page);
  await page.waitForTimeout(3000);
  expect((await stats(page)).draws).toBe(waiting.draws);

  // A long text stops at More…; a tap on the picture reads on.
  await page.locator('#type').pressSequentially('read log');
  await page.locator('#type').press('Enter');
  await waitingFor(page, 'more', 2);
  await page.locator('#paper').click();
  await waitingFor(page, 'command', 2);

  // The report lists the inputs and has a QR code.
  await page.locator('#show-report').click();
  await expect(page.locator('#report')).toContainText('inkventure-daad-probe v1');
  await expect(page.locator('#report')).toContainText('location 1 -> 2');
  await expect(page.locator('#report')).toContainText('picture.2:');
  await expect(page.locator('#report')).toContainText('input.field: keydown');
  await expect(page.locator('#qr img').first()).toBeVisible();
  await expect(page.locator('#report')).not.toContainText('errors:');
  expect(errors).toEqual([]);
});

test('the probe keeps the game’s colours, zooms in whole steps and hides the keyboard on request', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/probe/daad/?paper=black&zoom=whole&keyboard=off');
  await waitingFor(page, 'key', 0);
  await expect(page.locator('#virtualKeyboardDAAD')).toBeHidden();
  await page.keyboard.press('Space');
  await waitingFor(page, 'command', 1);
  expect(await pixel(page, 2, 199)).toEqual([0, 0, 0, 255]);
  const zoom = (await stats(page)).zoom;
  expect(zoom).toBe(Math.round(zoom));
  await page.locator('#show-report').click();
  await expect(page.locator('#report')).toContainText(
    'settings: paper black, zoom whole, keyboard off',
  );
  expect(errors).toEqual([]);
});

// A database DRC built for another machine plays once relocated (scripts/build/daad-game/relocate.ts): the same game
// for the Spectrum (classic v2, loaded at 0x8400) and the Atari ST (big-endian), served in place of the HTML build.
for (const [name, file, base, bigEndian] of [
  ['a Spectrum (v2)', 'lamp-room-zx48k-v2.ddb', 0x8400, false],
  ['an Atari ST', 'lamp-room-st.ddb', 0, true],
] as const) {
  test(`${name} database, relocated, plays like the HTML build`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const { ddb } = relocateDdb(readFileSync('tests/fixtures/daad/' + file), base, bigEndian);
    await page.route('**/lamp-room.jddb', (route) =>
      route.fulfill({ body: toJddb(ddb), contentType: 'text/javascript' }),
    );
    await page.goto('/probe/daad/');
    await waitingFor(page, 'key', 0);
    await page.locator('#paper').click();
    await waitingFor(page, 'command', 1);
    await page.locator('#type').pressSequentially('north');
    await page.locator('#type').press('Enter');
    await waitingFor(page, 'command', 2);
    expect((await stats(page)).pictures).toBe(2);
    await page.locator('#type').pressSequentially('read log');
    await page.locator('#type').press('Enter');
    await waitingFor(page, 'more', 2);
    expect(errors).toEqual([]);
  });
}
