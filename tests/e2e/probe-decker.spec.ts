import { expect, test, type Page } from '@playwright/test';

// The Decker probe (S0.11): the tour deck in Decker's runtime as patched for e-ink (scripts/build/decker-probe.ts).
// Everything it loads is same-origin (dist/probe/decker/); no network.

interface Stats {
  ticks: number;
  draws: number;
  awake: number;
  cardName: string;
  cardChange: number | null;
}

function stats(page: Page): Promise<Stats> {
  return page.evaluate(() => {
    const ik = (window as unknown as { ikDecker: Stats }).ikDecker;
    return {
      ticks: ik.ticks,
      draws: ik.draws,
      awake: ik.awake,
      cardName: ik.cardName,
      cardChange: ik.cardChange,
    };
  });
}

async function idle(page: Page) {
  await expect.poll(async () => (await stats(page)).awake, { timeout: 15_000 }).toBe(0);
}

// A click at a point of the 512×342 card, whatever zoom Decker chose for the viewport.
async function clickCard(page: Page, x: number, y: number) {
  const box = (await page.locator('#display').boundingBox())!;
  const zoom = box.width / 512;
  await page.mouse.click(box.x + x * zoom, box.y + y * zoom);
}

test('the probe plays the tour deck: a tap changes the card, and an idle card draws nothing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/probe/decker/');
  await expect(page.locator('#live')).toContainText('card: home', { timeout: 30_000 });
  await idle(page);

  // "Guided Tour" (button2 of the home card, 86×26 at 415,305) runs `go["Next" "SlideLeft"]`: no transition frames.
  await clickCard(page, 415 + 43, 305 + 13);
  await expect.poll(async () => (await stats(page)).cardName).toBe("What's a Card?");
  await idle(page);
  expect((await stats(page)).cardChange).not.toBeNull();
  await expect(page.locator('#live')).toContainText("What's a Card?");

  // Static card: the loop has stopped, so no tick and no draw for a few seconds.
  const before = await stats(page);
  await page.waitForTimeout(3000);
  const after = await stats(page);
  expect(after.ticks).toBe(before.ticks);
  expect(after.draws).toBe(before.draws);

  // The report lists the tap and has a QR code.
  await page.locator('#show-report').click();
  await expect(page.locator('#report')).toContainText('inkventure-decker-probe v1');
  await expect(page.locator('#report')).toContainText("tap.1: home -> What's a Card?");
  await expect(page.locator('#report')).toContainText('feature.newImageData: yes');
  await expect(page.locator('#qr img').first()).toBeVisible();
  await expect(page.locator('#report')).not.toContainText('errors:');
  expect(errors).toEqual([]);
});
