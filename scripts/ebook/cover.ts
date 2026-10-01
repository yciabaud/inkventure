// The ebook's cover (story S6.1), as an HTML page that the build screenshots at 1600 × 2560 px (the usual e-reader
// store size): black on white for e-ink, set in the app's fonts.
import { readFileSync } from 'node:fs';

/** What the cover shows, from `ebook/<locale>/book.json`. */
export interface BookMeta {
  title: string;
  subtitle: string;
  creator: string;
}

function fontFace(family: string, weight: number, file: string): string {
  const data = readFileSync('node_modules/@fontsource/' + file).toString('base64');
  return (
    '@font-face{font-family:"' +
    family +
    '";font-weight:' +
    weight +
    ';src:url(data:font/woff2;base64,' +
    data +
    ') format("woff2")}'
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function coverPage(book: BookMeta): string {
  return (
    '<!doctype html><meta charset="utf-8"><style>' +
    fontFace('Literata', 700, 'literata/files/literata-latin-700-normal.woff2') +
    fontFace('Source Sans 3', 400, 'source-sans-3/files/source-sans-3-latin-400-normal.woff2') +
    'html,body{margin:0;width:1600px;height:2560px;background:#fff;color:#000}' +
    'body{box-sizing:border-box;padding:220px 160px;display:flex;flex-direction:column;border:48px solid #000}' +
    '.rule{height:16px;background:#000}' +
    'h1{font:700 200px/1.1 Literata,serif;margin:120px 0 80px}' +
    '.subtitle{font:400 96px/1.3 "Source Sans 3",sans-serif;margin:0}' +
    '.spacer{flex:1}' +
    '.creator{font:400 72px/1 "Source Sans 3",sans-serif;letter-spacing:12px;text-transform:uppercase;margin:0}' +
    '</style><div class="rule"></div><h1>' +
    escapeHtml(book.title) +
    '</h1><p class="subtitle">' +
    escapeHtml(book.subtitle) +
    '</p><div class="spacer"></div><div class="rule"></div><p class="creator" style="margin-top:60px">' +
    escapeHtml(book.creator) +
    '</p>'
  );
}
