// Ebook build (SPEC §8; story S6.1): Markdown chapters in ebook/<locale>/ plus the game cards made from the
// catalogue's featured.json → EPUB 3 (Pandoc), checked with EPUBCheck, then AZW3 for Kindle (Calibre ebook-convert).
//
//   node scripts/ebook/build.ts [--catalog DIR] [--out DIR] [--locale en,fr] [--host URL] [--offline]
//                               [--no-check] [--no-azw3]
//
// Needs pandoc, EPUBCheck (`epubcheck`, or its jar in EPUBCHECK_JAR) and Calibre's `ebook-convert` on the PATH, and
// Playwright's Chromium for the cover. --offline skips the IFDB cover thumbnails (cards get their text placeholder).
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import type { FeaturedFile } from '../catalog/featured.ts';
import { uiLocales } from '../catalog/locales.ts';
import {
  buildCard,
  fillHost,
  insertCards,
  selectRows,
  type Card,
  type CardLabels,
} from './cards.ts';
import { coverPage, type BookMeta } from './cover.ts';
import { fetchCover, liveFetchBytes } from './covers.ts';
import { cardQr } from './qr.ts';

/** `ebook/config.json` */
interface EbookConfig {
  /** The app's address, the target of the "Play now" links. */
  host: string;
  /** Game cards per book. */
  cards: number;
}

/** `ebook/<locale>/book.json`: Pandoc metadata, plus the card strings. */
interface BookFile extends BookMeta {
  lang: string;
  identifier: string;
  rights: string;
  description: string;
  cards: Pick<CardLabels, 'by' | 'playNow' | 'qrAlt'>;
}

const { values } = parseArgs({
  options: {
    catalog: { type: 'string', default: 'public/catalog' },
    out: { type: 'string', default: 'ebook/build' },
    locale: { type: 'string' },
    host: { type: 'string' },
    offline: { type: 'boolean', default: false },
    'no-check': { type: 'boolean', default: false },
    'no-azw3': { type: 'boolean', default: false },
  },
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

function run(command: string, args: string[], env?: Record<string, string>): void {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.error) {
    throw new Error(
      command +
        ': ' +
        result.error.message +
        ' (install pandoc, epubcheck and calibre, e.g. `sudo apt-get install pandoc epubcheck calibre`)',
    );
  }
  if (result.status !== 0) throw new Error(command + ' failed with exit code ' + result.status);
}

/** EPUBCheck as a command, or its jar (Debian's `epubcheck` is a symlink to the jar, run with Java). */
function epubcheck(file: string): void {
  let jar = process.env.EPUBCHECK_JAR;
  if (!jar) {
    const which = spawnSync('which', ['epubcheck'], { encoding: 'utf8' });
    const path = which.status === 0 ? realpathSync(which.stdout.trim()) : '';
    if (path.endsWith('.jar')) jar = path;
  }
  if (jar) run('java', ['-jar', jar, '--failonwarnings', file]);
  else run('epubcheck', ['--failonwarnings', file]);
}

async function renderCover(book: BookMeta, file: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 2560 } });
    await page.setContent(coverPage(book));
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  } finally {
    await browser.close();
  }
}

async function buildBook(
  locale: string,
  config: EbookConfig,
  featured: FeaturedFile,
): Promise<void> {
  const source = join('ebook', locale);
  const out = join(values.out, locale);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'qr'), { recursive: true });
  const book = readJson<BookFile>(join(source, 'book.json'));
  const app = readJson<Record<string, string>>(join('src/i18n', locale + '.json'));
  const labels: CardLabels = {
    ...book.cards,
    startHere: app['filters.start'],
    minutes: app['library.minutes'],
    hours: app['library.hours'],
  };

  const cards: Card[] = [];
  for (const row of selectRows(featured.locales[locale] || [], config.cards)) {
    const detailPath = join(values.catalog, 'games', row.t + '.json');
    const detail = existsSync(detailPath) ? readJson<{ description?: string }>(detailPath) : {};
    const cover =
      row.c && !values.offline
        ? await fetchCover(row.t, join(values.out, 'covers'), liveFetchBytes)
        : undefined;
    const card = buildCard(row, {
      host: config.host,
      cover: cover && '../covers/' + cover,
      description: detail.description,
    });
    const qr = cardQr(card);
    writeFileSync(join(out, qr.path), qr.png);
    cards.push(card);
  }
  if (!cards.length) throw new Error('No featured games for ' + locale + ' in ' + values.catalog);

  const chapters = readdirSync(source)
    .filter((name) => /^\d\d-.*\.md$/.test(name))
    .sort();
  const inputs = chapters.map((name) => {
    let text = fillHost(readFileSync(join(source, name), 'utf8'), config.host);
    if (text.indexOf('<!-- cards -->') >= 0) text = insertCards(text, cards, labels);
    writeFileSync(join(out, name), text);
    return join(out, name);
  });

  const metadata = {
    title: book.title,
    subtitle: book.subtitle,
    creator: [{ role: 'author', text: book.creator }],
    lang: book.lang,
    identifier: [{ scheme: 'UUID', text: book.identifier }],
    rights: book.rights,
    description: book.description,
    date: featured.built.slice(0, 10),
  };
  writeFileSync(join(out, 'metadata.json'), JSON.stringify(metadata, null, 2));
  await renderCover(book, join(out, 'cover.jpg'));

  const epub = join(values.out, 'inkventure-' + locale + '.epub');
  run('pandoc', [
    '--from=markdown-implicit_figures',
    '--to=epub3',
    '--metadata-file=' + join(out, 'metadata.json'),
    '--epub-cover-image=' + join(out, 'cover.jpg'),
    '--css=ebook/ebook.css',
    '--toc',
    '--toc-depth=1',
    '--split-level=1',
    '--resource-path=' + resolve(out),
    '--output=' + epub,
    ...inputs,
  ]);
  if (!values['no-check']) epubcheck(epub);
  if (!values['no-azw3']) {
    // Calibre's Qt needs no display.
    run('ebook-convert', [epub, epub.replace(/\.epub$/, '.azw3')], {
      QT_QPA_PLATFORM: 'offscreen',
    });
  }
  console.log(locale + ': ' + cards.length + ' game cards → ' + epub);
}

const config = readJson<EbookConfig>('ebook/config.json');
if (values.host) config.host = values.host;
const featured = readJson<FeaturedFile>(join(values.catalog, 'featured.json'));
const locales = values.locale ? values.locale.split(',') : uiLocales();
for (const locale of locales) await buildBook(locale, config, featured);
