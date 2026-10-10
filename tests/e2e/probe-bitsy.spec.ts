import { expect, test, type Page } from '@playwright/test';

// The Bitsy probe (S0.12): our game in Bitsy's engine with the e-ink system layer (scripts/build/bitsy-eink/).
// Everything it loads is same-origin (dist/probe/bitsy/); no network.

interface Stats {
  ticks: number;
  draws: number;
  awake: number;
  dialog: boolean;
  roomName: string;
  player: { room: string; x: number; y: number };
}

function stats(page: Page): Promise<Stats> {
  return page.evaluate(() => {
    const ik = (
      window as unknown as {
        ikBitsy: Omit<Stats, 'player'> & { player: () => Stats['player'] };
      }
    ).ikBitsy;
    return {
      ticks: ik.ticks,
      draws: ik.draws,
      awake: ik.awake,
      dialog: ik.dialog,
      roomName: ik.roomName,
      player: ik.player(),
    };
  });
}

async function idle(page: Page) {
  await expect.poll(async () => (await stats(page)).awake, { timeout: 15_000 }).toBe(0);
}

async function pad(page: Page, key: 'up' | 'down' | 'left' | 'right' | 'ok', times = 1) {
  const code = { up: 38, down: 40, left: 37, right: 39, ok: 32 }[key];
  for (let i = 0; i < times; i++) {
    await page.locator(`#pad button[data-key="${code}"]`).click();
    await idle(page);
  }
}

test('the probe plays a game: the pad moves the avatar, a tap reads on, an idle room draws nothing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/probe/bitsy/');
  await expect(page.locator('#live')).toContainText('room: shore, dialogue', { timeout: 30_000 });
  await idle(page);

  // The title: a tap on the game reads on.
  await page.locator('#game').click();
  await idle(page);
  expect((await stats(page)).dialog).toBe(false);

  // The pad moves the avatar one tile per press, and the gull starts its dialogue.
  await pad(page, 'up', 3);
  expect((await stats(page)).player).toEqual({ room: '0', x: 3, y: 4 });
  await pad(page, 'right', 4);
  expect((await stats(page)).dialog).toBe(true);
  for (let i = 0; i < 6 && (await stats(page)).dialog; i++) await pad(page, 'ok');
  expect((await stats(page)).dialog).toBe(false);

  // Still room: the loop has stopped, so no tick and no draw for a few seconds.
  const before = await stats(page);
  await page.waitForTimeout(3000);
  const after = await stats(page);
  expect(after.ticks).toBe(before.ticks);
  expect(after.draws).toBe(before.draws);

  // A room change, through the exit with a transition effect.
  await pad(page, 'down', 3);
  await pad(page, 'right', 9);
  expect((await stats(page)).roomName).toBe('path');

  // The report lists the inputs and has a QR code.
  await page.locator('#show-report').click();
  await expect(page.locator('#report')).toContainText('inkventure-bitsy-probe v1');
  await expect(page.locator('#report')).toContainText('shore -> path: first frame');
  await expect(page.locator('#report')).toContainText('contrast: shore');
  await expect(page.locator('#qr img').first()).toBeVisible();
  await expect(page.locator('#report')).not.toContainText('errors:');
  expect(errors).toEqual([]);
});

test('the probe plays the default game, in luminance grays', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/probe/bitsy/?game=default&gray=lum');
  await expect(page.locator('#live')).toContainText('room: example room, dialogue', {
    timeout: 30_000,
  });
  await idle(page);
  await page.locator('#game').click();
  await idle(page);
  await pad(page, 'right');
  expect((await stats(page)).player).toEqual({ room: '0', x: 5, y: 4 });
  await page.locator('#show-report').click();
  await expect(page.locator('#report')).toContainText('gray: lum');
  expect(errors).toEqual([]);
});
