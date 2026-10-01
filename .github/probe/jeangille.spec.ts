// TEMPORARY (S1.11): plays "Les lettres du Docteur Jeangille" from the IF Archive through the app and reports what
// its files give. Removed before merge.
import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

const TUID = 'rpis77r72fg8228';

test('Jeangille: icons, fonts and pictures from the zip', async ({ page }) => {
  test.setTimeout(120_000);
  const game = JSON.parse(
    execSync('git show origin/catalog:catalog/games/' + TUID + '.json').toString(),
  );
  // Played as the sample's Twine game, with the real file.
  await page.route('**/catalog/games/fxtwin0000000006.json', async (route) => {
    const sample = await (await route.fetch()).json();
    sample.file = game.file;
    await route.fulfill({ json: sample });
  });
  const escaped: string[] = [];
  page.on('requestfailed', (r) => escaped.push('failed ' + r.url().slice(0, 120)));
  page.on('response', (r) => {
    if (r.status() >= 400) escaped.push(r.status() + ' ' + r.url().slice(0, 120));
  });
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
  await page.goto('/#/play/fxtwin0000000006');
  const frame = page.frameLocator('iframe.twine__frame');
  await expect(frame.locator('#passages')).toContainText('Jeangille', { timeout: 60_000 });
  const handle = await page.locator('iframe.twine__frame').elementHandle();
  const inner = (await handle!.contentFrame())!;
  const report = async (label: string) => {
    const result = await inner.evaluate(async () => {
      await document.fonts.ready;
      const families = ['900 16px "Font Awesome 6 Free"', '16px "Homemade Apple"', '16px Allura'];
      const fonts: Record<string, boolean> = {};
      for (const f of families) {
        try {
          await document.fonts.load(f);
        } catch {
          // reported below
        }
        fonts[f] = document.fonts.check(f);
      }
      const icons = Array.from(document.querySelectorAll('i[class*="fa-"]')).map(
        (i) =>
          i.className +
          ' ' +
          (i as HTMLElement).offsetWidth +
          'x' +
          (i as HTMLElement).offsetHeight,
      );
      const links = Array.from(
        document.querySelectorAll('#passages a, #passages .link-internal'),
      ).map((a) => (a.textContent || '').trim().slice(0, 40));
      const bg = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).backgroundImage.slice(0, 40) : 'none';
      };
      return {
        fonts,
        icons,
        links,
        backgrounds: { body: bg('body'), story: bg('#story'), menu: bg('#menu') },
        text: (document.querySelector('#passages')?.textContent || '').trim().slice(0, 300),
        menu: (document.querySelector('#menu')?.textContent || '').trim().slice(0, 200),
        htmlLength: document.documentElement.outerHTML.length,
      };
    });
    console.log('PROBE ' + label + ' ' + JSON.stringify(result, null, 1));
  };
  await report('start');
  const start = frame.getByText('Start Reading', { exact: true });
  if (await start.count()) {
    await start.first().click();
    await page.waitForTimeout(1500);
    await report('after Start Reading');
  }
  console.log('PROBE escaped requests ' + JSON.stringify(escaped, null, 1));
  console.log('PROBE console ' + JSON.stringify(logs.slice(0, 40), null, 1));
  await page.screenshot({ path: 'test-results/jeangille-' + test.info().project.name + '.png' });
});
