import type { Page } from '@playwright/test';

/**
 * The app opened again on the same address, in a new page, as in a new session (what `page.reload()` would test).
 * WebKit's private sessions (every Playwright context) drop an origin's Cache API entries as soon as none of its pages
 * is open, which a real browser does not (S5.3): a static page of the app (the glyphs probe) stays open in the
 * background until the end of the test. Routes must be the context's (`page.context().route`) to apply to the new
 * page.
 */
export async function reopen(page: Page): Promise<Page> {
  const context = page.context();
  const url = page.url();
  const holder = await context.newPage();
  await holder.goto(new URL('probe/glyphs.html', url).href);
  await holder.evaluate(() => caches.keys());
  await page.close();
  const next = await context.newPage();
  await next.goto(url);
  return next;
}

/**
 * Whether the adventure `tuid` is kept offline and its keeping is over: in the list of kept adventures, with its story
 * in the Cache API and the list of engines (written last) there too.
 */
export function keptOnDevice(page: Page, tuid: string): Promise<boolean> {
  return page.evaluate(async (id) => {
    const list = JSON.parse(localStorage.getItem('ik:v1:kept') || '{}') as Record<string, unknown>;
    if (!list[id]) return false;
    const cache = await caches.open('inkventure-kept');
    const base = location.href.split('#')[0].replace(/[^/]*$/, '') + 'kept/';
    const story = await cache.match(base + encodeURIComponent(id) + '/story');
    const index = await cache.match(base + 'index.json');
    return !!story && !!index && (await index.text()).indexOf('"kinds"') >= 0;
  }, tuid);
}
