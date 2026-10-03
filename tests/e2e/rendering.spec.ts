import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';

// Small rendering fixes (S1.18).

// The sample catalogue's "The Lamp at Saltmere" (public/catalog), served with another fixture story: no network.
const LAMP = 'fxlamp0000000001';
const LAMP_URL = 'https://ifarchive.org/if-archive/games/zcode/lamp.z5';

function serve(route: Route, body: Buffer) {
  return route.fulfill({
    status: 200,
    contentType: 'application/octet-stream',
    headers: { 'access-control-allow-origin': '*' },
    body: body,
  });
}

function statusLine(page: Page) {
  return page.getByRole('button', { name: 'Navigation' });
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('a time game shows the time in its status line, like 9:05 (header bit kept)', async ({
  page,
}) => {
  const clock = readFileSync('tests/fixtures/zmachine/clock.z5');
  await page.route(LAMP_URL, (route) => serve(route, clock));
  await page.goto('/#/play/' + LAMP);
  await expect(page.locator('.reader__text')).toContainText('The phone rings.');
  await expect(statusLine(page)).toContainText('Kitchen');
  await expect(statusLine(page)).toContainText(/Time:\s*9:05 am/);
  await expect(statusLine(page)).not.toContainText('Moves');
});

test('spaces at the start of a line are kept: an indented line starts further right', async ({
  page,
}) => {
  const clock = readFileSync('tests/fixtures/zmachine/clock.z5');
  await page.route(LAMP_URL, (route) => serve(route, clock));
  await page.goto('/#/play/' + LAMP);
  const text = page.locator('.reader__text');
  await expect(text).toContainText('Plain line.');
  // The left edge of the first glyph of each line.
  const left = (needle: string) =>
    page.evaluate((search) => {
      const blocks = Array.from(document.querySelectorAll('.reader__text .reader__block'));
      const block = blocks.find((b) => (b.textContent || '').indexOf(search) >= 0)!;
      const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode()!;
      const value = node.nodeValue || '';
      const first = value.search(/\S/);
      const range = document.createRange();
      range.setStart(node, first);
      range.setEnd(node, first + 1);
      return range.getBoundingClientRect().left;
    }, needle);
  expect(await left('-----')).toBeGreaterThan((await left('Plain line.')) + 5);
});

test("SugarCube's stowed UI bar keeps its whole toggle in the frame, and nothing overflows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto('/#/play/fixture-twine-sugarcube');
  const story = page.frameLocator('iframe.twine__frame');
  await expect(story.locator('#passages')).toContainText('The ferry leaves you');
  const handle = await page.locator('iframe.twine__frame').elementHandle();
  const frame = (await handle!.contentFrame())!;
  // Stowed: as SugarCube does by itself on a narrow screen, or with its toggle.
  if (
    !(await frame.evaluate(() => document.getElementById('ui-bar')!.classList.contains('stowed')))
  ) {
    await story.locator('#ui-bar-toggle').click();
  }
  await expect
    .poll(() =>
      frame.evaluate(() => {
        const toggle = document.getElementById('ui-bar-toggle')!.getBoundingClientRect();
        const root = document.documentElement;
        return {
          stowed: document.getElementById('ui-bar')!.classList.contains('stowed'),
          inside: toggle.left >= 0 && toggle.right <= innerWidth,
          tappable: toggle.width >= 48 && toggle.height >= 48,
          overflow: root.scrollWidth > root.clientWidth,
        };
      }),
    )
    .toEqual({ stowed: true, inside: true, tappable: true, overflow: false });
});
