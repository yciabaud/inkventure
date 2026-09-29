import { expect, test, type Page } from '@playwright/test';
import { DEMO_BLOCKS } from '../../src/reader/demo/demoStory';

const DEMO = '/#/play/demo';

interface Fragment {
  block: number;
  start: number;
  end: number;
  text: string;
}

async function open(page: Page) {
  await page.goto(DEMO);
  await expect(page.locator('.reader__block').first()).toBeVisible();
  // Web fonts change the layout: wait until they are in and the text has been laid out again.
  await page.evaluate(() => document.fonts.ready);
}

async function indicator(page: Page): Promise<{ page: number; count: number }> {
  const text = (await page.locator('.reader__indicator').textContent()) || '';
  const match = /(\d+)\s*\/\s*(\d+)/.exec(text);
  if (!match) throw new Error('no page indicator: ' + text);
  return { page: Number(match[1]), count: Number(match[2]) };
}

/** Taps (touch projects) or clicks (desktop) the text area at `xRatio` of its width. */
async function tapPage(page: Page, xRatio: number) {
  const area = page.locator('.reader__page');
  const box = await area.boundingBox();
  if (!box) throw new Error('no text area');
  const position = { x: box.width * xRatio, y: box.height / 2 };
  if (test.info().project.use.hasTouch) await area.tap({ position });
  else await area.click({ position });
}

async function fragments(page: Page): Promise<Fragment[]> {
  return page.locator('.reader__block').evaluateAll((nodes) =>
    nodes.map((node) => ({
      block: Number(node.getAttribute('data-block')),
      start: Number(node.getAttribute('data-start')),
      end: Number(node.getAttribute('data-end')),
      text: node.textContent || '',
    })),
  );
}

/** Whether every Literata face (regular and bold) has loaded. Not `fonts.check()`: WebKit answers true too early. */
async function literataLoaded(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const faces: FontFace[] = [];
    document.fonts.forEach((face) => {
      if (face.family.replace(/["']/g, '') === 'Literata') faces.push(face);
    });
    return faces.length > 0 && faces.every((face) => face.status === 'loaded');
  });
}

/** Overflow of the text beyond the text area (> 0 means a clipped line) and scrollable overflow anywhere. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const area = document.querySelector('.reader__page') as HTMLElement;
    const style = getComputedStyle(area);
    const bottom = area.getBoundingClientRect().bottom - parseFloat(style.paddingBottom);
    const blocks = area.querySelectorAll('.reader__block');
    const last = blocks[blocks.length - 1];
    const doc = document.documentElement;
    return {
      clipped: last ? last.getBoundingClientRect().bottom - bottom : 0,
      areaScroll: area.scrollHeight - area.clientHeight,
      pageScroll: Math.max(doc.scrollHeight - doc.clientHeight, doc.scrollWidth - doc.clientWidth),
    };
  });
}

test('opens the demo full screen, on page 1 of several, with the top bar hidden', async ({
  page,
}) => {
  await open(page);
  const { page: current, count } = await indicator(page);
  expect(current).toBe(1);
  expect(count).toBeGreaterThan(2);
  await expect(page.getByLabel(`Page 1 of ${count}`)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back to the present ›' })).toBeVisible();
  await expect(page.getByText('Commands will be typed here.')).toHaveCount(0);
});

test('tap right turns forward, tap left turns back, and the indicator follows', async ({
  page,
}) => {
  await open(page);
  const { count } = await indicator(page);
  const first = await fragments(page);

  await tapPage(page, 0.8);
  expect(await indicator(page)).toEqual({ page: 2, count });
  expect((await fragments(page))[0]).not.toEqual(first[0]);

  await tapPage(page, 0.4); // still in the right 70 %
  expect((await indicator(page)).page).toBe(3);

  await tapPage(page, 0.1);
  expect((await indicator(page)).page).toBe(2);
  await tapPage(page, 0.1);
  expect((await indicator(page)).page).toBe(1);
  expect(await fragments(page)).toEqual(first);

  // Nothing before the first page.
  await tapPage(page, 0.1);
  expect((await indicator(page)).page).toBe(1);
});

test('swipes and arrow keys turn pages too', async ({ page }) => {
  await open(page);
  const box = await page.locator('.reader__page').boundingBox();
  if (!box) throw new Error('no text area');
  const y = box.y + box.height / 2;

  // Swipe left (drag from right to left) → next page, once despite the click that follows.
  await page.mouse.move(box.x + box.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 5 });
  await page.mouse.up();
  expect((await indicator(page)).page).toBe(2);

  // Swipe right → previous page, even though it ends in the "next" zone.
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, y, { steps: 5 });
  await page.mouse.up();
  expect((await indicator(page)).page).toBe(1);

  await page.keyboard.press('ArrowRight');
  expect((await indicator(page)).page).toBe(2);
  await page.keyboard.press('ArrowLeft');
  expect((await indicator(page)).page).toBe(1);
});

test('every page fits without scrolling, and the pages never skip or duplicate text', async ({
  page,
}) => {
  await open(page);
  const { count } = await indicator(page);
  const seen: Fragment[] = [];
  for (let i = 1; i <= count; i++) {
    expect((await indicator(page)).page).toBe(i);
    const o = await overflow(page);
    expect(
      o.clipped,
      `page ${i} clips its last line (Literata loaded: ${await literataLoaded(page)})`,
    ).toBeLessThanOrEqual(0.5);
    expect(o.areaScroll).toBeLessThanOrEqual(0);
    expect(o.pageScroll).toBeLessThanOrEqual(0);
    seen.push(...(await fragments(page)));
    if (i < count) await page.keyboard.press('ArrowRight');
  }

  // The fragments of all pages, in order, rebuild the fixture exactly.
  const rebuilt = DEMO_BLOCKS.map(() => '');
  let previous: Fragment | null = null;
  for (const fragment of seen) {
    expect(fragment.text).toBe(
      DEMO_BLOCKS[fragment.block].text.slice(fragment.start, fragment.end),
    );
    if (previous) {
      if (previous.block === fragment.block) expect(fragment.start).toBe(previous.end);
      else {
        expect(fragment.block).toBe(previous.block + 1);
        expect(previous.end).toBe(DEMO_BLOCKS[previous.block].text.length);
        expect(fragment.start).toBe(0);
      }
    }
    rebuilt[fragment.block] += fragment.text;
    previous = fragment;
  }
  expect(rebuilt).toEqual(DEMO_BLOCKS.map((block) => block.text));
  // On small screens the longest paragraph does not fit a page, so it is split across pages.
  const viewport = page.viewportSize();
  if (viewport && viewport.height <= 800) expect(seen.some((f) => f.start > 0)).toBe(true);
});

test('the last page shows the input slot; earlier pages lead back to it', async ({ page }) => {
  await open(page);
  const { count } = await indicator(page);
  await page.getByRole('button', { name: 'Back to the present ›' }).click();
  expect(await indicator(page)).toEqual({ page: count, count });
  await expect(page.getByText('Commands will be typed here.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to the present ›' })).toHaveCount(0);

  // Nothing after the last page.
  await tapPage(page, 0.8);
  expect((await indicator(page)).page).toBe(count);

  await tapPage(page, 0.1);
  expect((await indicator(page)).page).toBe(count - 1);
  await expect(page.getByRole('button', { name: 'Back to the present ›' })).toBeVisible();
});

test('resizing re-paginates and keeps the reading position', async ({ page }) => {
  await open(page);
  const original = page.viewportSize();
  if (!original) throw new Error('no viewport');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  const before = await fragments(page);
  const anchor = before[0];
  const pageBefore = await indicator(page);

  // Rotate: the text reflows into a different number of pages.
  await page.setViewportSize({ width: original.height, height: original.width });
  await expect.poll(async () => (await indicator(page)).count).not.toBe(pageBefore.count);
  const after = await fragments(page);
  const first = after[0];
  const last = after[after.length - 1];
  const at = (f: Fragment, end: boolean) => f.block * 1e6 + (end ? f.end : f.start);
  const position = at(anchor, false);
  expect(at(first, false)).toBeLessThanOrEqual(position);
  expect(at(last, true)).toBeGreaterThan(position);
  expect((await overflow(page)).clipped).toBeLessThanOrEqual(0.5);

  // And back: the very same page.
  await page.setViewportSize(original);
  await expect.poll(() => indicator(page)).toEqual(pageBefore);
  expect(await fragments(page)).toEqual(before);
});

test('the top zone shows and hides the top bar; a tap on the page closes it first', async ({
  page,
}) => {
  await open(page);
  const zone = page.getByRole('button', { name: 'Navigation' });
  await expect(zone).toHaveAttribute('aria-expanded', 'false');
  await zone.click();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav).toBeVisible();
  await expect(zone).toHaveAttribute('aria-expanded', 'true');

  await tapPage(page, 0.8);
  await expect(nav).toHaveCount(0);
  expect((await indicator(page)).page).toBe(1);

  await zone.click();
  await nav.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/#\/library$/);
});

test('tap targets are ≥ 48 px and nothing overflows horizontally', async ({ page }) => {
  await open(page);
  for (const where of ['first', 'last']) {
    if (where === 'last') await page.getByRole('button', { name: 'Back to the present ›' }).click();
    const small = await page.evaluate(() => {
      const found: string[] = [];
      const targets = document.querySelectorAll('a[href], button, input, [role=button]');
      for (let i = 0; i < targets.length; i++) {
        const rect = targets[i].getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.width < 48 || rect.height < 48) found.push(targets[i].textContent || '');
      }
      return found;
    });
    expect(small).toEqual([]);
    expect((await overflow(page)).pageScroll).toBeLessThanOrEqual(0);
  }
});

test('a page turn takes under 300 ms with the CPU throttled 4×', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling needs the Chrome DevTools protocol');
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const { count } = await indicator(page);
  const durations: number[] = [];
  for (let i = 1; i < Math.min(count, 6); i++) {
    durations.push(
      await page.evaluate(async () => {
        const area = document.querySelector('.reader__page') as HTMLElement;
        const rect = area.getBoundingClientRect();
        const indicator = document.querySelector('.reader__indicator') as HTMLElement;
        const before = indicator.textContent;
        const start = performance.now();
        area.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            clientX: rect.left + rect.width * 0.8,
            clientY: rect.top + rect.height / 2,
          }),
        );
        // Until the new page is rendered and laid out, and a frame has been produced.
        while (indicator.textContent === before) await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        return performance.now() - start;
      }),
    );
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(durations.length).toBeGreaterThan(0);
  expect(Math.max(...durations)).toBeLessThan(300);
});

test('re-paginates when the web fonts arrive late, without relying on font events', async ({
  page,
}) => {
  // As seen on WebKit in CI: `fonts.ready` already resolved before the download started and no `loadingdone` in time.
  await page.addInitScript(() => {
    const fonts = document.fonts;
    Object.defineProperty(fonts, 'addEventListener', { value: () => undefined });
    Object.defineProperty(fonts, 'ready', { get: () => Promise.resolve(fonts) });
  });
  await page.route(/\.woff2?$/, async (route) => {
    // Longer than FONT_WAIT_MS: the first layout gives up waiting and uses the fallback font.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  // Do not wait for the load event: it waits for the fonts.
  await page.goto(DEMO, { waitUntil: 'commit' });
  await expect(page.locator('.reader__block').first()).toBeVisible();
  expect(await literataLoaded(page)).toBe(false);
  await expect.poll(() => literataLoaded(page), { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await overflow(page)).clipped).toBeLessThanOrEqual(0.5);
});

test('waits for the web fonts before the first layout, so the page is drawn once', async ({
  page,
}) => {
  await page.route(/\.woff2?$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  // Do not wait for the load event: it waits for the fonts.
  await page.goto(DEMO, { waitUntil: 'commit' });
  await expect(page.getByText('Loading…')).toBeVisible();
  await expect(page.locator('.reader__block').first()).toBeVisible();
  // The first text drawn is already set in the reading font.
  expect(await literataLoaded(page)).toBe(true);
});
