import { expect, test, type Locator, type Page } from '@playwright/test';

// Tap on touch projects (e-readers), click on desktop.
async function press(locator: Locator) {
  const hasTouch = test.info().project.use.hasTouch;
  if (hasTouch) await locator.tap();
  else await locator.click();
}

function nav(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name });
}

/** Opens Settings from the ⋯ menu. */
async function openSettings(page: Page) {
  await press(page.getByRole('button', { name: 'Menu' }));
  await press(page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Settings' }));
}

async function expectScreen(page: Page, hash: string, title: string) {
  await expect(page).toHaveURL(new RegExp(hash.replace(/[?]/g, '\\?') + '$'));
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test('navigates between all screens by tapping, and back', async ({ page }) => {
  // No network in tests: the game file download fails, which shows its error page.
  await page.route('https://www.ifarchive.org/**', (route) => route.abort());
  await page.goto('/');
  await expectScreen(page, '#/home', 'Home');

  await expect(page.getByRole('link', { name: 'How to play' })).toHaveAttribute('href', '#/help');
  await expect(page.getByRole('link', { name: 'Get the free ebook' })).toHaveAttribute(
    'href',
    'ebook/',
  );
  await page.goto('/#/help');
  await expect(page.getByRole('link', { name: 'Play the test adventure' })).toHaveAttribute(
    'href',
    '#/play/fixture-z',
  );
  await press(nav(page, 'Library'));
  await expectScreen(page, '#/library', 'Library');

  // The committed sample catalogue: its first game by title.
  await press(page.getByRole('link', { name: /Cave of Echoes/ }));
  await expectScreen(page, '#/game/fxcave0000000003', 'Cave of Echoes');

  await press(page.getByRole('link', { name: 'Play' }));
  await expectScreen(page, '#/play/fxcave0000000003', 'The game could not be downloaded');

  await openSettings(page);
  await expectScreen(page, '#/settings', 'Settings');

  await press(nav(page, 'Home'));
  await expectScreen(page, '#/home', 'Home');

  // Back button walks the history in reverse.
  await page.goBack();
  await expectScreen(page, '#/settings', 'Settings');
  await page.goBack();
  await expectScreen(page, '#/play/fxcave0000000003', 'The game could not be downloaded');
  await page.goBack();
  await expectScreen(page, '#/game/fxcave0000000003', 'Cave of Echoes');
  await page.goBack();
  await expectScreen(page, '#/library', 'Library');
});

test('deep link cold start on #/settings', async ({ page }) => {
  await page.goto('/#/settings');
  await expectScreen(page, '#/settings', 'Settings');
});

test('unknown routes fall back to Home without a history entry', async ({ page }) => {
  await page.goto('/#/settings');
  await page.goto('/#/does-not-exist');
  await expectScreen(page, '#/home', 'Home');
  await page.goBack();
  await expectScreen(page, '#/settings', 'Settings');
});

test('menu offers Refresh screen, which flashes and restores the page', async ({ page }) => {
  await page.goto('/#/home');
  await press(page.getByRole('button', { name: 'Menu' }));
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  await press(dialog.getByRole('button', { name: 'Refresh screen' }));
  await expect(dialog).toBeHidden();
  await expect(page.locator('.screen-flash')).toHaveCount(0);
  await expectScreen(page, '#/home', 'Home');
});

test('menu leads to the ebook download page', async ({ page }) => {
  await page.route('**/ebook/books.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/#/library');
  await press(page.getByRole('button', { name: 'Menu' }));
  await press(
    page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Free ebook' }),
  );
  await expect(page).toHaveURL(/\/ebook\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'The Inkventure ebook' })).toBeVisible();
});

test('a tap leaves no focus outline; the keyboard still shows one', async ({ page }) => {
  await page.goto('/#/home');
  const library = nav(page, 'Library');
  await press(library);
  await expectScreen(page, '#/library', 'Library');
  const outline = () =>
    page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      return getComputedStyle(element).outlineStyle;
    });
  expect(await outline()).toBe('none');

  await page.keyboard.press('Tab');
  expect(await outline()).toBe('solid');
});

const screens = ['#/home', '#/library?page=2', '#/game/sample', '#/play/sample', '#/settings'];

for (const hash of screens) {
  test(`layout fits and tap targets are ≥ 48 px on ${hash}`, async ({ page }) => {
    await page.goto('/' + hash);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const small = await page.evaluate(() => {
      const found: string[] = [];
      const targets = document.querySelectorAll(
        'a[href], button, input, select, textarea, [role=button]',
      );
      for (let i = 0; i < targets.length; i++) {
        const rect = targets[i].getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue; // not rendered
        if (rect.width < 48 || rect.height < 48) {
          found.push(
            `${targets[i].textContent?.trim()} (${Math.round(rect.width)}×${Math.round(rect.height)})`,
          );
        }
      }
      return found;
    });
    expect(small).toEqual([]);
  });
}
