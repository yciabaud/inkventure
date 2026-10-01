// Screenshots of the app for the ebook (SPEC §8; story S6.2): a few screens of the production build, at an
// e-reader's size, in each UI locale, written as grayscale PNGs (16 gray levels, like an e-ink screen) to
// ebook/<locale>/images/. The games are the test fixtures and the sample catalogue; nothing is fetched from the
// network (IFDB covers are blocked, so covers are the app's typographic ones).
//
//   npm run build && node scripts/ebook/screenshots.ts [--locale en,fr] [--port 4175]
//
// The images are committed: run this again after a visible change to these screens.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { uiLocales } from '../catalog/locales.ts';
import { encodeGrayPng } from './png.ts';

const { values } = parseArgs({
  options: {
    locale: { type: 'string' },
    port: { type: 'string', default: '4175' },
  },
});

const VIEWPORT = { width: 600, height: 800 };
const base = 'http://localhost:' + values.port + '/';

/** The app's strings for `locale`, to find buttons by their accessible names. */
function strings(locale: string): Record<string, string> {
  return JSON.parse(readFileSync(join('src/i18n', locale + '.json'), 'utf8')) as Record<
    string,
    string
  >;
}

/** The page as a grayscale PNG: luminance quantised to 16 levels. */
async function grayShot(page: Page, height: number): Promise<Uint8Array> {
  const png = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: height },
  });
  const shot = await page.context().newPage();
  try {
    const pixels = await shot.evaluate(async (data) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + data;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const rgba = context.getImageData(0, 0, image.width, image.height).data;
      const gray: number[] = new Array(image.width * image.height);
      for (let i = 0; i < gray.length; i++) {
        const y = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
        gray[i] = Math.round(y / 17) * 17;
      }
      return { width: image.width, height: image.height, gray: gray };
    }, Buffer.from(png).toString('base64'));
    return encodeGrayPng(pixels.width, pixels.height, Uint8Array.from(pixels.gray));
  } finally {
    await shot.close();
  }
}

async function shoot(locale: string): Promise<void> {
  const t = strings(locale);
  const out = join('ebook', locale, 'images');
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: locale,
      reducedMotion: 'reduce',
    });
    // No network: only the app's own server.
    await context.route(/^https?:\/\//, (route) =>
      route.request().url().indexOf(base) === 0 ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    /** Saves the top `height` px of the page (the screens below leave the rest blank). */
    const save = async (name: string, height = VIEWPORT.height) => {
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      writeFileSync(join(out, name + '.png'), await grayShot(page, height));
      console.log(locale + ': ' + join(out, name + '.png'));
    };

    // Home on a first launch: the welcome and the Featured shelf.
    await page.goto(base + '#/home');
    await page.getByRole('heading', { name: t['home.emptyTitle'] }).waitFor();
    await page.locator('.cover__author, .cover__img').first().waitFor();
    await save('home', 590);

    // A parser game: a few commands, the status line, the buttons and the command bar.
    await page.goto(base + '#/play/fixture-z');
    await page.getByRole('button', { name: t['reader.continue'] }).click();
    const command = page.getByRole('textbox', { name: t['reader.command'] });
    for (const line of ['take can', 'north']) {
      await command.fill(line);
      await command.press('Enter');
      await page.getByText('>' + line).waitFor();
    }
    await page.getByRole('button', { name: 'Examine…' }).click();
    await page.getByRole('group', { name: t['reader.nouns'] }).waitFor();
    await save('parser');

    // The reader's menu, opened from the top of the page.
    await page.getByRole('button', { name: t['reader.cancelVerb'] }).click();
    await page.getByRole('button', { name: t['reader.navigation'] }).click();
    const menu = page.getByRole('group', { name: t['reader.menu'] });
    await menu.waitFor();
    const box = await menu.boundingBox();
    await save('menu', Math.ceil(box!.y + box!.height) + 12);

    // Its text settings ("Aa").
    await menu.getByRole('button', { name: t['reader.textSettings'] }).click();
    await page.getByRole('dialog', { name: t['reader.textSettings'] }).waitFor();
    await save('text-settings');

    // A choice game: the choices under the text.
    await page.goto(base + '#/play/fixture-ink');
    await page.getByRole('list', { name: t['reader.choices'] }).waitFor();
    await page.getByRole('button', { name: /Take the paraffin can/ }).click();
    await page.getByText('It sloshes').waitFor();
    await save('choices');

    await context.close();
  } finally {
    await browser.close();
  }
}

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', values.port, '--strictPort'],
  {
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);
try {
  await new Promise<void>((resolve, reject) => {
    server.on('exit', (code) => reject(new Error('vite preview exited with code ' + code)));
    server.stdout.on('data', (chunk: Buffer) => {
      if (chunk.toString().indexOf(values.port) >= 0) resolve();
    });
  });
  const locales = values.locale ? values.locale.split(',') : uiLocales();
  for (const locale of locales) await shoot(locale);
} finally {
  server.kill();
}
