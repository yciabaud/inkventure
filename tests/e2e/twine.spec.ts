import { readFileSync } from 'node:fs';
import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';

// The Twine fixtures (the Lamp at Saltmere in Harlowe and SugarCube) in their sandboxed frame (S1.9).

const HARLOWE = '/#/play/fixture-twine-harlowe';
const SUGARCUBE = '/#/play/fixture-twine-sugarcube';

async function press(target: Locator) {
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}

function story(page: Page) {
  return page.frameLocator('iframe.twine__frame');
}

/** The story's frame, once its page has loaded. */
async function storyFrame(page: Page): Promise<Frame> {
  await expect(page.locator('iframe.twine__frame')).toBeAttached();
  const handle = await page.locator('iframe.twine__frame').elementHandle();
  const frame = handle && (await handle.contentFrame());
  if (!frame) throw new Error('No story frame');
  return frame;
}

function link(page: Page, name: string) {
  return story(page).getByText(name, { exact: true });
}

function indicator(page: Page) {
  return page.locator('.reader__indicator');
}

/** The page's own localStorage, as a plain object. */
function parentStorage(page: Page) {
  return page.evaluate(() => {
    const all: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) as string;
      all[key] = localStorage.getItem(key) as string;
    }
    return all;
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test('plays the Harlowe fixture: a link changes the text; the story cannot reach the page', async ({
  page,
}) => {
  await page.goto(HARLOWE);
  await expect(page.getByRole('button', { name: 'Navigation' })).toContainText('Experimental');
  await expect(story(page).locator('tw-passage')).toContainText(
    'The ferry leaves you on the landing stage',
  );
  await expect(indicator(page)).toHaveText('1 / 1');
  const before = await parentStorage(page);

  await press(link(page, 'Walk up to the lighthouse'));
  await expect(story(page).locator('tw-passage')).toContainText('The lighthouse door is ajar');
  await expect(story(page).locator('tw-passage')).not.toContainText('The ferry leaves you');

  // Sandboxed: no access to the page, its storage or the top window; its storage is the reader's stand-in.
  const frame = await storyFrame(page);
  const reach = await frame.evaluate(() => {
    const attempt = (read: () => unknown) => {
      try {
        read();
        return 'reached';
      } catch {
        return 'blocked';
      }
    };
    localStorage.setItem('story-key', 'story-value');
    return {
      document: attempt(() => window.parent.document.body),
      storage: attempt(() => window.parent.localStorage.length),
      top: attempt(() => window.top && window.top.location.href),
      cookie: attempt(() => document.cookie),
      own: localStorage.getItem('story-key'),
    };
  });
  expect(reach).toEqual({
    document: 'blocked',
    storage: 'blocked',
    top: 'blocked',
    cookie: 'blocked',
    own: 'story-value',
  });
  // The page's storage only gains the reader's own entries: the story's storage, kept for it, and My adventures.
  const key = 'ik:v1:save:fixture-twine-harlowe:twine';
  await expect.poll(async () => (await parentStorage(page))[key] || '').toContain('story-value');
  const after = await parentStorage(page);
  expect(after['story-key']).toBeUndefined();
  for (const name of Object.keys(after)) expect(name.indexOf('ik:')).toBe(0);
  for (const name of Object.keys(before)) if (name !== key) expect(name in after).toBe(true);
});

test('Harlowe: a long passage turns page by page, and the story plays to its ending', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 500 });
  await page.goto(HARLOWE);
  await press(link(page, 'Take the paraffin can'));
  await press(link(page, "Read the keeper's log"));
  await expect(story(page).locator('tw-passage')).toContainText('October the first');
  await expect(indicator(page)).toHaveText(/^1 \/ [2-9]$/);
  const pages = Number(((await indicator(page).textContent()) || '').split('/')[1]);
  // A tap on the right of the text shows the next page, on the left the previous one.
  const box = await page.locator('iframe.twine__frame').boundingBox();
  if (!box) throw new Error('No frame box');
  const tapAt = (x: number) =>
    test.info().project.use.hasTouch
      ? page.touchscreen.tap(box.x + x, box.y + box.height / 2)
      : page.mouse.click(box.x + x, box.y + box.height / 2);
  await tapAt(box.width * 0.8);
  await expect(indicator(page)).toHaveText('2 / ' + pages);
  await tapAt(box.width * 0.1);
  await expect(indicator(page)).toHaveText('1 / ' + pages);
  for (let i = 1; i < pages; i++) await tapAt(box.width * 0.8);
  await expect(indicator(page)).toHaveText(pages + ' / ' + pages);

  await press(link(page, 'Put the log back'));
  await press(link(page, 'Climb the stair'));
  await expect(story(page).locator('tw-passage')).toContainText('its reservoir dry');
  await press(link(page, 'Fill the lamp'));
  await expect(story(page).locator('tw-passage')).toContainText('full of paraffin');
  await press(link(page, 'Light the lamp'));
  await expect(story(page).locator('tw-passage')).toContainText('you have lit the lamp');
});

test('plays the SugarCube fixture to its ending and resumes after a reload', async ({ page }) => {
  await page.goto(SUGARCUBE);
  await expect(story(page).locator('#passages')).toContainText(
    'The ferry leaves you on the landing stage',
  );
  await press(link(page, 'Take the paraffin can'));
  await expect(story(page).locator('#passages')).toContainText('The paraffin can sloshes');
  await press(link(page, 'Climb the stair'));
  await expect(story(page).locator('#passages')).toContainText('its reservoir dry');
  await press(link(page, 'Fill the lamp'));
  await expect(story(page).locator('#passages')).toContainText('full of paraffin');

  // SugarCube keeps its session in sessionStorage, which the reader stores: a reload resumes here.
  await expect
    .poll(async () => (await parentStorage(page))['ik:v1:save:fixture-twine-sugarcube:twine'] || '')
    .not.toBe('');
  await page.reload();
  await expect(story(page).locator('#passages')).toContainText('full of paraffin');
  await press(link(page, 'Light the lamp'));
  await expect(story(page).locator('#passages')).toContainText('you have lit the lamp');

  // In My adventures.
  const home = await page.evaluate(() => localStorage.getItem('ik:v1:home'));
  expect(home).toContain('fixture-twine-sugarcube');
});

test('Restart starts the story again and keeps no session', async ({ page }) => {
  await page.goto(SUGARCUBE);
  await press(link(page, 'Walk up to the lighthouse'));
  await expect(story(page).locator('#passages')).toContainText('The lighthouse door is ajar');
  await press(page.getByRole('button', { name: 'Navigation' }));
  await press(page.getByRole('group', { name: 'Reader' }).getByRole('button', { name: 'Restart' }));
  await press(page.getByRole('dialog').getByRole('button', { name: 'Restart', exact: true }));
  await expect(story(page).locator('#passages')).toContainText(
    'The ferry leaves you on the landing stage',
  );
});

test("Restart keeps the story's own saves; Erase everything and restart drops them", async ({
  page,
}) => {
  await page.goto(SUGARCUBE);
  await expect(story(page).locator('#passages')).toContainText('The ferry leaves you');
  // Something the story keeps in its localStorage, like a format's save slots.
  await (await storyFrame(page)).evaluate(() => localStorage.setItem('kept', 'yes'));

  async function restart(button: string) {
    await press(page.getByRole('button', { name: 'Navigation' }));
    await press(
      page.getByRole('group', { name: 'Reader' }).getByRole('button', { name: 'Restart' }),
    );
    await press(page.getByRole('dialog').getByRole('button', { name: button, exact: true }));
    await expect(story(page).locator('#passages')).toContainText('The ferry leaves you');
    return (await storyFrame(page)).evaluate(() => localStorage.getItem('kept'));
  }

  expect(await restart('Restart')).toBe('yes');
  expect(await restart('Erase everything and restart')).toBeNull();
});

/** Plays the Harlowe fixture with the motion of "Will Not Let Me Go" and checks that the text shows, at once. */
async function playsWithoutMotion(page: Page) {
  // Like "Will Not Let Me Go" (S1.13): the story is hidden until a fade-in that fills forwards, links pulse for ever
  // from opacity 0, the passage slides in while its text fades in and out for ever (it would end invisible), and the
  // story is centred with absolute positioning and a transform.
  const motion =
    '<style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}' +
    'tw-story{opacity:0;animation:fadeIn .8s forwards;' +
    'position:absolute;left:50%;top:25%;transform:translate(-50%,-50%)}' +
    '@keyframes pulse{0%,100%{opacity:0}50%{opacity:1}}' +
    'tw-link{opacity:0;animation:pulse 4s infinite forwards}' +
    '@keyframes slide{from{transform:translateX(-100%)}to{transform:none}}' +
    '@keyframes fadeInOut{0%,100%{opacity:0}50%{opacity:1}}' +
    'tw-passage{opacity:0;animation:slide 5s,fadeInOut 3s infinite}</style>' +
    // Like Will Not Let Me Go, the story ends up next to <body>, directly under <html>.
    '<script>document.addEventListener("DOMContentLoaded",function(){setTimeout(function(){' +
    'var s=document.querySelector("tw-story");if(s)document.documentElement.appendChild(s);},0);});</script></head>';
  await page.route('https://ifarchive.org/if-archive/games/twine/lanterns.html', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync('tests/fixtures/twine/lamp-harlowe.html', 'utf8').replace(
        /<\/head>/i,
        motion,
      ),
    }),
  );
  await page.goto('/#/play/fxtwin0000000006');
  await expect(story(page).locator('tw-passage')).toContainText('The ferry leaves you');
  const frame = await storyFrame(page);
  const styles = () =>
    frame.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      return {
        story: style('tw-story').opacity,
        link: style('tw-link').opacity,
        passage: style('tw-passage').transform,
        text: style('tw-passage').opacity,
        // The story starts inside the frame, not above its top.
        top: document.querySelector('tw-story')!.getBoundingClientRect().top >= 0,
        // The text keeps the reader's side margins (24 px by default), even with the story next to <body>.
        margins: (() => {
          const box = document.querySelector('tw-passage')!.getBoundingClientRect();
          return box.left >= 24 && box.right <= innerWidth - 24;
        })(),
      };
    });
  // At once, well before the 0.8 s fade or the 5 s slide would have ended.
  await expect
    .poll(styles, { timeout: 1000 })
    .toEqual({ story: '1', link: '1', passage: 'none', text: '1', top: true, margins: true });
  await expect(link(page, 'Walk up to the lighthouse')).toBeVisible();

  await press(link(page, 'Walk up to the lighthouse'));
  await expect(story(page).locator('tw-passage')).toContainText('The lighthouse door is ajar');
  await expect
    .poll(styles, { timeout: 1000 })
    .toEqual({ story: '1', link: '1', passage: 'none', text: '1', top: true, margins: true });
}

test('animations jump to their end state: a faded-in story shows, links stay, nothing moves', async ({
  page,
}) => {
  await playsWithoutMotion(page);
});

test('elements whose animation ends invisible show even when the browser reports no animation end', async ({
  page,
}) => {
  // Some browsers may not fire animationend for animations that last 0 s: the frame script also looks after a change.
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest) {
      if (/animationend/i.test(type)) return;
      return add.call(this, type, ...(rest as [EventListener]));
    } as typeof add;
  });
  await playsWithoutMotion(page);
});

test('readable colours: coloured dialogue and dark link buttons in black on white, pictures kept', async ({
  page,
}) => {
  // The SugarCube fixture, coloured for a dark screen like The Den and A Long Way to the Nearest Star (S1.14).
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const passage =
    '&lt;img id=&quot;cover&quot; width=&quot;120&quot; height=&quot;60&quot; src=&quot;' +
    png +
    '&quot;&gt;' +
    '&lt;div id=&quot;banner&quot; style=&quot;height:40px;background-image:url(' +
    png +
    ')&quot;&gt;&lt;/div&gt;\n' +
    '@@color:#f5deb3;&quot;Father!?&quot;@@\n' +
    '&lt;div class=&quot;ai&quot;&gt;SYSTEM ONLINE &lt;span class=&quot;badend&quot;&gt;Bad end&lt;/span&gt;&lt;/div&gt;\n' +
    'A paraffin can stands by the bollard.';
  const dark =
    '<style>body{background-color:#334455;color:#eee}' +
    'a{color:White;border:1px solid #9696b6;background-color:#33334a;' +
    'background-image:linear-gradient(#33334a,#111)}' +
    '#passages a.link-internal{color:#ffff66!important;background-color:#00004d!important}' +
    '.ai{background-color:#00004d;border:3px ridge #b6e1fc;color:#4dd2ff}' +
    '.badend{background:linear-gradient(White,Red);-webkit-background-clip:text;' +
    '-webkit-text-fill-color:transparent}</style></head>';
  await page.route('https://ifarchive.org/if-archive/games/twine/lanterns.html', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync('tests/fixtures/twine/lamp-sugarcube.html', 'utf8')
        .replace('A paraffin can stands by the bollard.', passage)
        .replace(/<\/head>/i, dark),
    }),
  );
  await page.goto('/#/play/fxtwin0000000006');
  await expect(story(page).locator('#passages')).toContainText('Father!?');
  const frame = await storyFrame(page);
  const BLACK = 'rgb(0, 0, 0)';
  const CLEAR = 'rgba(0, 0, 0, 0)';
  const colours = () =>
    frame.evaluate(() => {
      const style = (node: Element) => getComputedStyle(node);
      const dialogue = Array.from(document.querySelectorAll('#passages span')).find(
        (node) => node.textContent === '"Father!?"',
      )!;
      const link = style(document.querySelector('#passages a.link-internal')!);
      const box = style(document.querySelector('.ai')!);
      const bad = style(document.querySelector('.badend')!);
      const title = document.querySelector('img#cover') as HTMLImageElement;
      const banner = style(document.querySelector('#banner')!);
      return {
        dialogue: [style(dialogue).color, style(dialogue).webkitTextFillColor],
        link: [
          link.color,
          link.backgroundColor,
          link.backgroundImage,
          link.borderTopColor,
          link.textDecorationLine,
          link.fontWeight,
          parseFloat(link.minHeight) >= 48,
        ],
        box: [box.color, box.backgroundColor, box.borderTopColor, box.borderLeftColor],
        bad: [bad.webkitTextFillColor, bad.backgroundImage],
        title: [
          title.complete && title.naturalWidth > 0,
          style(title).display !== 'none' && title.getBoundingClientRect().width > 0,
        ],
        banner: /^url\(/.test(banner.backgroundImage),
        page: style(document.body).backgroundColor,
      };
    });
  await expect.poll(colours, { timeout: 2000 }).toEqual({
    dialogue: [BLACK, BLACK],
    link: [BLACK, CLEAR, 'none', BLACK, 'underline', '700', true],
    box: [BLACK, CLEAR, BLACK, BLACK],
    bad: [BLACK, 'none'],
    title: [true, true],
    banner: true,
    page: 'rgb(255, 255, 255)',
  });
  // Still a link.
  await press(link(page, 'Walk up to the lighthouse'));
  await expect(story(page).locator('#passages')).toContainText('The lighthouse door is ajar');
});

test('a catalogue Twine game downloads and plays in the frame, flagged experimental', async ({
  page,
}) => {
  // "Paper Lanterns" in the sample catalogue, served with the Harlowe fixture.
  await page.route('https://ifarchive.org/if-archive/games/twine/lanterns.html', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync('tests/fixtures/twine/lamp-harlowe.html'),
    }),
  );
  await page.goto('/#/play/fxtwin0000000006');
  const top = page.getByRole('button', { name: 'Navigation' });
  await expect(top).toContainText('Paper Lanterns');
  await expect(top).toContainText('Experimental');
  await expect(story(page).locator('tw-passage')).toContainText('The ferry leaves you');
  // Relative links resolve on the IF Archive.
  const frame = await storyFrame(page);
  expect(await frame.evaluate(() => document.baseURI)).toBe(
    'https://ifarchive.org/if-archive/games/twine/lanterns.html',
  );
  await press(link(page, 'Walk up to the lighthouse'));
  await expect(story(page).locator('tw-passage')).toContainText('The lighthouse door is ajar');
  // In My adventures, as played.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('ik:v1:home') || ''))
    .toContain('fxtwin0000000006');
});
