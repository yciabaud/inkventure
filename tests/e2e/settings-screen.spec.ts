import { expect, test, type Locator, type Page } from '@playwright/test';

// The Settings screen (S5.1). The reader's own "Aa" panel is covered by settings.spec.ts.

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

async function scrolls(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
}

/** Every link, button and label of the screen is at least 48 px in both directions. */
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const found: string[] = [];
    const targets = document.querySelectorAll('.app__main a, .app__main button');
    for (let i = 0; i < targets.length; i++) {
      const rect = targets[i].getBoundingClientRect();
      if (rect.width < 48 || rect.height < 48) found.push(targets[i].textContent || '');
    }
    return found;
  });
}

function appKeys(page: Page) {
  return page.evaluate(() => {
    const found: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.indexOf('ik:') === 0) found.push(key);
    }
    return found.sort();
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test.describe('English browser', () => {
  test.use({ locale: 'en-US' });

  test('switching to French applies at once and persists after reload', async ({ page }) => {
    await page.goto('/#/settings');
    const language = page.getByRole('group', { name: 'Language' });
    await expect(language.getByRole('button', { name: 'Automatic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await scrolls(page)).toBe(false);
    expect(await smallTargets(page)).toEqual([]);

    await press(language.getByRole('button', { name: 'Français' }));
    await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    const langue = page.getByRole('group', { name: 'Langue' });
    await expect(langue.getByRole('button', { name: 'Français' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible();
    await press(page.getByRole('link', { name: 'Accueil' }));
    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();

    // Automatic goes back to the browser's language.
    await page.goto('/#/settings');
    await press(
      page.getByRole('group', { name: 'Langue' }).getByRole('button', { name: 'Automatique' }),
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  });

  test('reading defaults are the ones the reader opens with', async ({ page }) => {
    await page.goto('/#/settings');
    await press(page.getByRole('link', { name: /Reading defaults/ }));
    await expect(page.getByRole('heading', { level: 1, name: 'Reading defaults' })).toBeVisible();
    await press(page.getByRole('button', { name: 'Larger text' }));
    await press(
      page.getByRole('group', { name: 'Typeface' }).getByRole('button', { name: 'Sans-serif' }),
    );
    await expect(page.locator('.settings-page__sample')).toHaveCSS('font-size', '21px');
    expect(await scrolls(page)).toBe(false);
    expect(await smallTargets(page)).toEqual([]);

    await page.goto('/#/play/demo');
    await expect(page.locator('.reader__block').first()).toBeVisible();
    await expect(page.locator('.reader__page')).toHaveCSS('font-size', '21px');
    await expect(page.locator('.reader__page')).toHaveCSS('font-family', /Source Sans 3/);
  });

  test('About shows the version, credits and privacy, without scrolling', async ({ page }) => {
    await page.goto('/#/settings?s=about');
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
    await expect(page.locator('.settings-page__version')).toHaveText(
      /^Version [0-9a-f]{7}, built on /,
    );
    await expect(page.getByText(/Catalogue data from IFDB/)).toBeVisible();
    expect(await scrolls(page)).toBe(false);
    // The last paragraph (privacy) is reached with the pager.
    const next = page.getByRole('button', { name: /Next/ });
    for (let i = 0; i < 10 && !(await page.getByText(/^Privacy:/).isVisible()); i++) {
      await press(next);
    }
    await expect(page.getByText(/^Privacy:/)).toBeVisible();
  });

  test('reset needs two confirmations, clears only ik: keys and returns to the first launch', async ({
    page,
  }) => {
    await page.goto('/#/home');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Welcome to Inkventure' }),
    ).toBeVisible();
    await page.evaluate(() => {
      localStorage.setItem('someone-else', 'keep me');
      localStorage.setItem('ik:v1:prefs', JSON.stringify({ locale: 'fr' }));
      localStorage.setItem(
        'ik:v1:home',
        JSON.stringify([
          { tuid: 'fxlamp0000000001', title: 'The Lamp at Saltmere', author: 'A', added: 1 },
        ]),
      );
      localStorage.setItem(
        'ik:v1:progress:fxlamp0000000001',
        JSON.stringify({ turns: 3, lastPlayed: 2 }),
      );
      localStorage.setItem(
        'ik:v1:save:fxlamp0000000001:1',
        JSON.stringify({ data: 'x', name: 'A' }),
      );
    });
    await page.goto('/#/settings?s=data');
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Données et stockage' }),
    ).toBeVisible();
    await expect(page.getByText('1 partie sauvegardée', { exact: false })).toBeVisible();
    expect(await scrolls(page)).toBe(false);
    expect(await smallTargets(page)).toEqual([]);

    // Cancelling at either step keeps everything.
    await press(page.getByRole('button', { name: 'Tout effacer' }));
    await press(page.getByRole('dialog').getByRole('button', { name: 'Annuler' }));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await press(page.getByRole('button', { name: 'Tout effacer' }));
    await press(page.getByRole('dialog').getByRole('button', { name: 'Continuer' }));
    await expect(page.getByRole('dialog', { name: 'Vraiment ?' })).toBeVisible();
    await press(page.getByRole('dialog').getByRole('button', { name: 'Annuler' }));
    expect(await appKeys(page)).toContain('ik:v1:save:fxlamp0000000001:1');

    await press(page.getByRole('button', { name: 'Tout effacer' }));
    await press(page.getByRole('dialog').getByRole('button', { name: 'Continuer' }));
    await press(page.getByRole('dialog').getByRole('button', { name: 'Tout supprimer' }));

    // First launch: Home, the welcome, the browser's language, no adventures.
    await expect(page).toHaveURL(/#\/home$/);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Welcome to Inkventure' }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('My adventures')).toHaveCount(0);
    expect(await appKeys(page)).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('someone-else'))).toBe('keep me');

    await page.reload();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Welcome to Inkventure' }),
    ).toBeVisible();
    expect(await appKeys(page)).toEqual(['ik:schema']);
  });
});

test.describe('French browser', () => {
  test.use({ locale: 'fr-FR' });

  test('the settings pages fit without scrolling in French', async ({ page }) => {
    for (const hash of [
      '#/settings',
      '#/settings?s=reading',
      '#/settings?s=data',
      '#/settings?s=about',
    ]) {
      await page.goto('/' + hash);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await scrolls(page), hash).toBe(false);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, hash).toBeLessThanOrEqual(0);
    }
  });
});
