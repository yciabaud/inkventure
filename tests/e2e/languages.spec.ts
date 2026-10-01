import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

// The committed sample catalogue (public/catalog): "Cave of Echoes" is in French (echoes.z5) and has an English
// translation (echoes_en.z5), S2.6. Both are served from the fixture story: no network.
const CAVE = 'fxcave0000000003';
const FRENCH_URL = 'https://www.ifarchive.org/if-archive/games/zcode/echoes.z5';
const ENGLISH_URL = 'https://ifarchive.org/if-archive/games/zcode/echoes_en.z5';
const STORY = readFileSync('tests/fixtures/zmachine/lamp.z5');

async function press(locator: Locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

function serve(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/octet-stream',
    headers: { 'access-control-allow-origin': '*' },
    body: STORY,
  });
}

function stored(page: Page, key: string) {
  return page.evaluate((k) => localStorage.getItem('ik:v1:' + k) !== null, key);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://ifdb.org/**', (route) => route.abort());
});

test.describe('in English', () => {
  test.use({ locale: 'en-US' });

  test('the game page offers each language, on the UI language first; each plays its own file', async ({
    page,
  }) => {
    const requests: string[] = [];
    for (const url of [FRENCH_URL, ENGLISH_URL]) {
      await page.route(url, (route) => {
        requests.push(url);
        return serve(route);
      });
    }
    await page.goto('/#/game/' + CAVE);
    const languages = page.getByRole('group', { name: 'Language' });
    const english = languages.getByRole('button', { name: 'English' });
    const french = languages.getByRole('button', { name: 'Français' });
    await expect(english).toHaveAttribute('aria-pressed', 'true');
    await expect(french).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('2022 · English · Aventure')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Play' })).toHaveAttribute(
      'href',
      '#/play/' + CAVE + '-en',
    );
    await expect(page.getByRole('link', { name: 'Game file on the IF Archive' })).toHaveAttribute(
      'href',
      ENGLISH_URL,
    );
    for (const button of [english, french]) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }

    await press(french);
    await expect(french).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('2022 · Français · Aventure')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Play' })).toHaveAttribute(
      'href',
      '#/play/' + CAVE,
    );

    // The English version: its own file, cached under its own id.
    await press(english);
    await press(page.getByRole('link', { name: 'Play' }));
    await expect(page).toHaveURL(new RegExp('#/play/' + CAVE + '-en$'));
    await expect(page.getByText('[Press any key to begin.]')).toBeVisible();
    expect(requests).toEqual([ENGLISH_URL]);
    await expect.poll(() => stored(page, 'file:' + CAVE + '-en')).toBe(true);
    expect(await stored(page, 'file:' + CAVE)).toBe(false);
  });

  test('the Library finds the game under each of its languages', async ({ page }) => {
    await page.goto('/#/library?lang=en');
    await expect(page.getByRole('link', { name: /Cave of Echoes/ })).toBeVisible();
    await page.goto('/#/library?lang=fr');
    await expect(page.getByRole('link', { name: /Cave of Echoes/ })).toBeVisible();
  });
});

test.describe('in French', () => {
  test.use({ locale: 'fr-FR' });

  test('the page opens on French, or on the language a link names', async ({ page }) => {
    await page.goto('/#/game/' + CAVE);
    const languages = page.getByRole('group', { name: 'Langue' });
    await expect(languages.getByRole('button', { name: 'Français' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.goto('/#/game/' + CAVE + '-en');
    await expect(languages.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('link', { name: 'Jouer' })).toHaveAttribute(
      'href',
      '#/play/' + CAVE + '-en',
    );
    // A language the game has no file in is not a game.
    await page.goto('/#/game/' + CAVE + '-de');
    await expect(page.getByRole('heading', { name: 'Aventure introuvable' })).toBeVisible();
  });
});
