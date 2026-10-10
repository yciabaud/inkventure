import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';

// Decker decks in the reader (S1.29): the tour deck (`#/play/fixture-decker`) in the sandboxed frame, with the app's
// runtime (scripts/build/decker-runtime.ts). Widgets are found from inside the frame (Decker's own globals), so the
// test does not depend on where the deck draws them.

const GAME = '/#/play/fixture-decker';
const SAVE_KEY = 'ik:v1:save:fixture-decker:decker';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The globals of Decker's runtime the test reads in the frame. */
interface DeckerGlobals {
  ikDecker: { cardName: string; awake: number };
  con_wids(): { v: unknown[] };
  ifield(widget: unknown, name: string): unknown;
  ls(value: unknown): string;
  lb(value: unknown): boolean;
  button_is(widget: unknown): boolean;
  field_is(widget: unknown): boolean;
  unpack_widget(widget: unknown): { size: Box };
  unpack_field(widget: unknown): { size: Box };
}

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

/** Decker's state, read in the frame. */
function deck(frame: Frame) {
  return frame.evaluate(() => {
    const w = window as unknown as DeckerGlobals;
    return { card: w.ikDecker.cardName, awake: w.ikDecker.awake };
  });
}

async function idle(frame: Frame) {
  await expect.poll(async () => (await deck(frame)).awake, { timeout: 15_000 }).toBe(0);
}

/** A widget of the current card, in card coordinates: a button by its text, or the first editable field. */
function widget(frame: Frame, find: { button?: string; field?: true }): Promise<Box | null> {
  return frame.evaluate((find) => {
    const w = window as unknown as DeckerGlobals;
    const widgets = w.con_wids().v;
    for (const x of widgets) {
      if (find.button && w.button_is(x) && w.ls(w.ifield(x, 'text')) === find.button) {
        const r = w.unpack_widget(x).size;
        return { x: r.x, y: r.y, w: r.w, h: r.h };
      }
      if (find.field && w.field_is(x) && !w.lb(w.ifield(x, 'locked'))) {
        const r = w.unpack_field(x).size;
        return { x: r.x, y: r.y, w: r.w, h: r.h };
      }
    }
    return null;
  }, find);
}

/** The text of the current card's first editable field. */
function fieldText(frame: Frame): Promise<string> {
  return frame.evaluate(() => {
    const w = window as unknown as DeckerGlobals;
    for (const x of w.con_wids().v) {
      if (w.field_is(x) && !w.lb(w.ifield(x, 'locked'))) return w.ls(w.ifield(x, 'text'));
    }
    return '';
  });
}

/** A tap (or click) at the middle of `box`, a rectangle of the card. */
async function tapCard(page: Page, frame: Frame, box: Box) {
  // A `let` of Decker's script: a global binding, not a property of `window`.
  const zoom = await frame.evaluate(() => (0, eval)('zoom') as number);
  const display = (await page
    .frameLocator('iframe.decker__frame')
    .locator('#display')
    .boundingBox())!;
  const x = display.x + (box.x + box.w / 2) * zoom;
  const y = display.y + (box.y + box.h / 2) * zoom;
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function tapButton(page: Page, frame: Frame, text: string) {
  const box = await widget(frame, { button: text });
  expect(box, 'button ' + text).not.toBeNull();
  await tapCard(page, frame, box!);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('plays the tour deck: a button changes the card, a field takes typed text, a reload resumes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    // Playwright's `serviceWorkers: 'block'` (playwright.config.ts) reads navigator.serviceWorker in every frame, which
    // a sandboxed frame refuses: not the deck's.
    if (!/service ?worker/i.test(error.message)) errors.push(error.message);
  });
  await page.goto(GAME);
  let frame = await deckFrame(page);
  await expect(page.getByRole('button', { name: 'Navigation' })).toContainText('The Decker Tour');
  expect((await deck(frame)).card).toBe('home');
  await idle(frame);

  await tapButton(page, frame, 'Guided Tour');
  await expect.poll(async () => (await deck(frame)).card).not.toBe('home');
  await idle(frame);

  // On to the first card with a field the player can type in.
  for (let i = 0; i < 8 && !(await widget(frame, { field: true })); i++) {
    const card = (await deck(frame)).card;
    await tapButton(page, frame, 'Next');
    await expect.poll(async () => (await deck(frame)).card).not.toBe(card);
    await idle(frame);
  }
  const field = await widget(frame, { field: true });
  expect(field).not.toBeNull();
  const card = (await deck(frame)).card;

  // A tap on the field focuses the hidden input (the device keyboard opens on it); keys and text reach the field.
  await tapCard(page, frame, field!);
  await expect
    .poll(() => frame.evaluate(() => document.activeElement && document.activeElement.id))
    .toBe('ik-input');
  const before = await fieldText(frame);
  await page.keyboard.type('Hi');
  // What a virtual keyboard may send instead of keys: an "input" event.
  await frame.evaluate(() => {
    const input = document.getElementById('ik-input') as HTMLInputElement;
    input.value = '!';
    input.dispatchEvent(new Event('input'));
  });
  await expect.poll(() => fieldText(frame)).not.toBe(before);
  const typed = await fieldText(frame);
  expect(typed).toContain('Hi!');
  await idle(frame);

  // Saved a moment after the deck went idle.
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) || '', SAVE_KEY), {
      timeout: 10_000,
    })
    .toContain('Hi!');

  await page.reload();
  frame = await deckFrame(page);
  expect((await deck(frame)).card).toBe(card);
  expect(await fieldText(frame)).toBe(typed);

  // Restart: the deck opens as published.
  await press(page.getByRole('button', { name: 'Navigation' }));
  await press(page.getByRole('group', { name: 'Reader' }).getByRole('button', { name: 'Restart' }));
  await press(page.getByRole('button', { name: 'Restart', exact: true }).last());
  frame = await deckFrame(page);
  expect((await deck(frame)).card).toBe('home');
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBeNull();
  expect(errors).toEqual([]);
});

test('an idle card draws nothing', async ({ page }) => {
  await page.goto(GAME);
  const frame = await deckFrame(page);
  await idle(frame);
  const count = () =>
    frame.evaluate(() => {
      const ik = (window as unknown as { ikDecker: { ticks: number; draws: number } }).ikDecker;
      return ik.ticks + ':' + ik.draws;
    });
  const before = await count();
  await page.waitForTimeout(3000);
  expect(await count()).toBe(before);
});

test('the deck cannot reach the app', async ({ page }) => {
  await page.goto(GAME);
  const frame = await deckFrame(page);
  const reached = await frame.evaluate(() => {
    const attempt = (f: () => unknown) => {
      try {
        f();
        return true;
      } catch {
        return false;
      }
    };
    return {
      document: attempt(() => window.parent.document.body),
      storage: attempt(() => window.parent.localStorage.length),
      top: attempt(() => window.top!.location.href),
      own: attempt(() => window.localStorage.length),
    };
  });
  expect(reached).toEqual({ document: false, storage: false, top: false, own: false });
});

test('a sound does nothing where the browser has no Web Audio (an e-reader), and the deck goes on', async ({
  page,
}) => {
  // Runs in every frame, the deck's included.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.AudioContext;
    delete w.webkitAudioContext;
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!/service ?worker/i.test(error.message)) errors.push(error.message);
  });
  await page.goto(GAME);
  const frame = await deckFrame(page);
  const played = await frame.evaluate(() => {
    const w = window as unknown as {
      n_play(args: unknown[]): unknown;
      lms(text: string): unknown;
      NIL: unknown;
    };
    // The tour deck's own sound.
    return w.n_play([w.lms('sosumi')]) === w.NIL;
  });
  expect(played).toBe(true);
  await tapButton(page, frame, 'Guided Tour');
  await expect.poll(async () => (await deck(frame)).card).not.toBe('home');
  expect(errors).toEqual([]);
});
