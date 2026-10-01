// The ebook download page (SPEC §8, story S6.3): a standalone static page at ebook/, like probe/, not a route of the
// app. scripts/build/ebook-page.ts compiles this module to ES5 on its own (so it imports nothing) and writes the
// page, which passes it the ebookPage.* strings of every locale. The books and books.json are added by the Deploy
// workflow; without them (a failed ebook build, a preview, `vite preview`) the page says they are not available.

export type Strings = Record<string, string>;

/** One file of `ebook/books.json`. */
export interface BookFile {
  locale: string;
  format: string;
  /** File name, next to books.json. */
  file: string;
  /** Bytes. */
  size: number;
  /** Build date, ISO 8601. */
  built: string;
  commit: string;
}

/** `ebook/books.json`, written by the ebook build (scripts/ebook/books.ts). */
export interface BooksManifest {
  built: string;
  commit: string;
  books: BookFile[];
  /** Cover thumbnail file per locale. */
  covers?: Record<string, string>;
}

/** The formats offered, in button order. */
export const FORMATS = ['epub', 'azw3'];

export interface Button {
  format: string;
  label: string;
  hint: string;
  /** Missing when the file is not available. */
  href?: string;
  /** "1.2 MB · 1 October 2026" */
  info?: string;
}

export interface Block {
  locale: string;
  title: string;
  cover?: string;
  buttons: Button[];
}

export interface PageModel {
  locale: string;
  /** False when there is no books.json, or it lists no book. */
  available: boolean;
  blocks: Block[];
}

function fill(text: string, params: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, function (match: string, name: string) {
    return Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match;
  });
}

/** The page's language: the one asked for (`?lang=`), else the browser's first known language, else the first. */
export function pickLocale(
  requested: string | null,
  languages: string[],
  locales: string[],
): string {
  if (requested && locales.indexOf(requested) >= 0) return requested;
  for (let i = 0; i < languages.length; i++) {
    const base = String(languages[i]).toLowerCase().split('-')[0];
    if (locales.indexOf(base) >= 0) return base;
  }
  return locales[0];
}

/** 350 000 bytes → "342 KB"; a megabyte and more → "1.2 MB" (decimal separator of the locale). */
export function formatSize(bytes: number, strings: Strings): string {
  if (bytes < 1024 * 1024) {
    return fill(strings['ebookPage.kb'], { size: String(Math.max(1, Math.round(bytes / 1024))) });
  }
  const mb = (bytes / (1024 * 1024)).toFixed(1).replace('.', strings['ebookPage.decimal']);
  return fill(strings['ebookPage.mb'], { size: mb });
}

/** "1 October 2026" in the page's language, or the ISO date where the browser cannot format it. */
export function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso.slice(0, 10);
  try {
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Accepts only a books.json of the expected shape. */
export function parseManifest(text: string | null): BooksManifest | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as BooksManifest;
    return data && Object.prototype.toString.call(data.books) === '[object Array]' ? data : null;
  } catch {
    return null;
  }
}

/** One block per locale, the page's own first; one button per format, without a link when the file is missing. */
export function pageModel(
  manifest: BooksManifest | null,
  strings: Strings,
  locale: string,
  locales: string[],
): PageModel {
  const order = [locale].concat(
    locales.filter(function (other) {
      return other !== locale;
    }),
  );
  const books = manifest ? manifest.books : [];
  const blocks = order.map(function (bookLocale): Block {
    const block: Block = {
      locale: bookLocale,
      title: strings['ebookPage.edition.' + bookLocale],
      buttons: FORMATS.map(function (format): Button {
        const button: Button = {
          format: format,
          label: fill(strings['ebookPage.download'], {
            format: strings['ebookPage.format.' + format],
          }),
          hint: strings['ebookPage.hint.' + format],
        };
        for (let i = 0; i < books.length; i++) {
          const book = books[i];
          if (book.locale !== bookLocale || book.format !== format) continue;
          button.href = book.file;
          button.info = fill(strings['ebookPage.fileInfo'], {
            size: formatSize(book.size, strings),
            date: formatDate(book.built, locale),
          });
        }
        return button;
      }),
    };
    const cover = manifest && manifest.covers && manifest.covers[bookLocale];
    if (cover) block.cover = cover;
    return block;
  });
  return { locale: locale, available: books.length > 0, blocks: blocks };
}

function element(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.appendChild(doc.createTextNode(text));
  return node;
}

/** Draws the page into `root`. `all` holds the strings of every locale (for the language switch). */
export function render(root: HTMLElement, model: PageModel, all: Record<string, Strings>): void {
  const doc = root.ownerDocument;
  const strings = all[model.locale];
  root.innerHTML = '';

  const header = element(doc, 'div', 'header');
  header.appendChild(element(doc, 'h1', '', strings['ebookPage.title']));
  const languages = element(doc, 'p', 'languages');
  languages.setAttribute('aria-label', strings['ebookPage.language']);
  for (const other in all) {
    if (!Object.prototype.hasOwnProperty.call(all, other)) continue;
    const link = element(
      doc,
      'a',
      'language',
      all[other]['ebookPage.languageName'],
    ) as HTMLAnchorElement;
    link.href = '?lang=' + other;
    link.setAttribute('hreflang', other);
    link.setAttribute('lang', other);
    if (other === model.locale) link.setAttribute('aria-current', 'true');
    languages.appendChild(link);
  }
  header.appendChild(languages);
  root.appendChild(header);
  root.appendChild(element(doc, 'p', 'intro', strings['ebookPage.intro']));

  if (!model.available) {
    root.appendChild(element(doc, 'p', 'unavailable', strings['ebookPage.unavailable']));
  }

  for (let b = 0; b < model.blocks.length; b++) {
    const block = model.blocks[b];
    const section = element(doc, 'div', 'book');
    section.setAttribute('data-locale', block.locale);
    if (block.cover) {
      const cover = doc.createElement('img');
      cover.className = 'cover';
      cover.src = block.cover;
      cover.alt = '';
      section.appendChild(cover);
    }
    const body = element(doc, 'div', 'book-body');
    body.appendChild(element(doc, 'h2', '', block.title));
    body.appendChild(element(doc, 'p', 'description', strings['ebookPage.description']));
    for (let i = 0; i < block.buttons.length; i++) {
      const button = block.buttons[i];
      const row = element(doc, 'div', 'format');
      row.setAttribute('data-format', button.format);
      if (button.href) {
        const link = element(doc, 'a', 'button', button.label) as HTMLAnchorElement;
        link.href = button.href;
        link.setAttribute('download', '');
        row.appendChild(link);
        row.appendChild(element(doc, 'p', 'info', button.info + ' — ' + button.hint));
      } else {
        row.appendChild(element(doc, 'span', 'button button--disabled', button.label));
        row.appendChild(element(doc, 'p', 'info', strings['ebookPage.notAvailable']));
      }
      body.appendChild(row);
    }
    section.appendChild(body);
    root.appendChild(section);
  }

  root.appendChild(element(doc, 'h2', '', strings['ebookPage.howTitle']));
  const steps = ['ebookPage.howUsb', 'ebookPage.howWireless', 'ebookPage.howOpen'];
  for (let s = 0; s < steps.length; s++) root.appendChild(element(doc, 'p', '', strings[steps[s]]));

  const app = element(doc, 'a', 'button', strings['ebookPage.openApp']) as HTMLAnchorElement;
  app.href = '../';
  root.appendChild(app);
}

/** Runs the page: picks its language, reads books.json and draws. */
export function start(win: Window, all: Record<string, Strings>): void {
  const doc = win.document;
  const locales: string[] = [];
  for (const locale in all) {
    if (Object.prototype.hasOwnProperty.call(all, locale)) locales.push(locale);
  }
  const query = /[?&]lang=([a-z]+)/.exec(win.location.search);
  const nav = win.navigator as Navigator & { userLanguage?: string };
  const languages =
    nav.languages && nav.languages.length
      ? nav.languages
      : [nav.language || nav.userLanguage || ''];
  const locale = pickLocale(
    query ? query[1] : null,
    Array.prototype.slice.call(languages),
    locales,
  );
  doc.documentElement.setAttribute('lang', locale);
  doc.title = all[locale]['ebookPage.title'];
  const root = doc.getElementById('page') as HTMLElement;

  const draw = function (text: string | null) {
    render(root, pageModel(parseManifest(text), all[locale], locale, locales), all);
  };
  const request = new XMLHttpRequest();
  request.onreadystatechange = function () {
    if (request.readyState !== 4) return;
    draw(request.status === 200 ? request.responseText : null);
  };
  try {
    request.open('GET', 'books.json', true);
    request.send();
  } catch {
    draw(null);
  }
}
