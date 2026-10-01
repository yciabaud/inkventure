// The files of a zipped Twine story (SPEC §4.3; story S1.11): pictures, fonts, styles and scripts kept from its zip,
// served to the story in its sandboxed frame. Before the frame loads, the story's page is rewritten: references that
// name a kept file become `data:` URLs (they load in the frame's opaque origin, fonts included), and linked
// stylesheets and scripts are inlined. References the story makes later are resolved at run time by the frame script
// (frameScript.ts), which asks the reader for them.
import { strFromU8 } from 'fflate';
import { toBase64 } from '../../storage/compress';
import type { StoryFiles } from '../../storage/files';

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  css: 'text/css',
  js: 'text/javascript',
};

/** Stylesheets importing stylesheets: inlined this deep at most (and never in a loop). */
const MAX_IMPORT_DEPTH = 4;

export interface StoryAssets {
  /**
   * The kept file a reference names, seen from `folder` (a folder of the story, `''` for the story's page): relative
   * references only, after normalising `./`, `../` and percent-escapes, matched exactly or else ignoring case.
   */
  resolve(ref: string, folder?: string): string | undefined;
  /** The file as a `data:` URL (made once). */
  dataUrl(path: string): string;
  text(path: string): string;
}

function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&amp;/g, '&');
}

export function storyAssets(files: StoryFiles): StoryAssets {
  const lower: Record<string, string> = {};
  for (const path of Object.keys(files)) lower[path.toLowerCase()] = path;
  const urls: Record<string, string> = {};

  function resolve(ref: string, folder = ''): string | undefined {
    let path = ref.replace(/^\s+|\s+$/g, '');
    // Absolute (a scheme, data: and blob: included), from the host's root, or within the page.
    if (
      !path ||
      /^[a-z][a-z0-9+.-]*:/i.test(path) ||
      path.charAt(0) === '/' ||
      path.charAt(0) === '#'
    ) {
      return undefined;
    }
    path = path.replace(/[?#][\s\S]*$/, '');
    try {
      path = decodeURIComponent(path);
    } catch {
      // A stray %: the path as written.
    }
    const parts: string[] = [];
    for (const part of (folder + path).split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (!parts.length) return undefined;
        parts.pop();
      } else parts.push(part);
    }
    const joined = parts.join('/');
    if (Object.prototype.hasOwnProperty.call(files, joined)) return joined;
    return lower[joined.toLowerCase()];
  }

  return {
    resolve: resolve,
    dataUrl(path) {
      if (!urls[path]) {
        const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
        urls[path] =
          'data:' +
          (TYPES[extension] || 'application/octet-stream') +
          ';base64,' +
          toBase64(files[path]);
      }
      return urls[path];
    },
    text: (path) => strFromU8(files[path]),
  };
}

// url(…) with double quotes, single quotes (also as HTML entities, in a passage's text) or none.
const CSS_URL =
  /url\(\s*(?:"([^"]*)"|'([^']*)'|&quot;([\s\S]*?)&quot;|&#0*39;([\s\S]*?)&#0*39;|([^)'"\s]*))\s*\)/gi;
const IMPORT =
  /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)|"([^"]*)"|'([^']*)')\s*([^;]*);/gi;

/** Rewrites the `url(…)`s of `text` that name a kept file (seen from `folder`) to `data:` URLs. */
function rewriteUrls(text: string, folder: string, assets: StoryAssets): string {
  return text.replace(CSS_URL, (match, dq, sq, eq, es, bare) => {
    const ref = [dq, sq, eq, es, bare].filter((part) => part !== undefined)[0] as string;
    const path = assets.resolve(decodeEntities(ref), folder);
    // Unquoted: a data: URL has no quote, space or parenthesis, and it may sit in a quoted attribute.
    return path ? 'url(' + assets.dataUrl(path) + ')' : match;
  });
}

/**
 * In each `src:` of `@font-face`, keeps only the first source that is a kept file (with the files that come before
 * it): the others would only weigh on the page.
 */
function firstFontSources(css: string, folder: string, assets: StoryAssets): string {
  return css.replace(/(@font-face\s*\{[^}]*?\bsrc\s*:)([^;}]*)/gi, (_match, head, list: string) => {
    let found = false;
    const kept = list.split(',').filter((source) => {
      CSS_URL.lastIndex = 0;
      const url = CSS_URL.exec(source);
      if (!url) return true;
      const ref = [url[1], url[2], url[3], url[4], url[5]].filter((part) => part !== undefined)[0];
      if (!assets.resolve(ref as string, folder)) return true;
      if (found) return false;
      found = true;
      return true;
    });
    return head + kept.join(',');
  });
}

/** A stylesheet of the story: its imports of kept stylesheets inlined, its references to kept files as `data:` URLs. */
export function rewriteCss(
  css: string,
  folder: string,
  assets: StoryAssets,
  seen: string[] = [],
): string {
  const imported = css.replace(IMPORT, (match, u1, u2, u3, q1, q2, media: string) => {
    const ref = [u1, u2, u3, q1, q2].filter((part) => part !== undefined)[0] as string;
    const path = assets.resolve(ref, folder);
    if (!path || !/\.css$/i.test(path)) return match;
    // Already being inlined (a loop), or too deep: dropped.
    if (seen.indexOf(path) >= 0 || seen.length >= MAX_IMPORT_DEPTH) return '';
    const text = rewriteCss(assets.text(path), folderOf(path), assets, seen.concat(path));
    return media.replace(/\s+/g, '') ? '@media ' + media + '{' + text + '}' : text;
  });
  return rewriteUrls(firstFontSources(imported, folder, assets), folder, assets);
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(
    '\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))',
    'i',
  ).exec(tag);
  return match ? decodeEntities(match[1] || match[2] || match[3] || '') : undefined;
}

/** Text to put in a <style> or <script> element: it must not end it early. */
function inElement(text: string, element: string): string {
  return text.replace(new RegExp('</(' + element + ')', 'gi'), '<\\/$1');
}

const INLINED = 'data-ik-inlined';

/**
 * The story's page with the files it names served from `assets`: linked stylesheets and scripts inlined, `<style>`
 * elements, `src` / `href` / `poster` attributes, `url(…)`s and SugarCube image links (`[img[…]]`, also inside the
 * passages' text) rewritten to `data:` URLs. References to anything else are left alone (the frame's <base> applies).
 */
export function inlineAssets(html: string, assets: StoryAssets): string {
  let page = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attribute(tag, 'href');
    const path = href !== undefined ? assets.resolve(href) : undefined;
    if (!path || !/\.css$/i.test(path) || !/stylesheet/i.test(attribute(tag, 'rel') || ''))
      return tag;
    const css = rewriteCss(assets.text(path), folderOf(path), assets, [path]);
    return '<style ' + INLINED + '>' + inElement(css, 'style') + '</style>';
  });
  page = page.replace(/<script\b([^>]*)>\s*<\/script\b[^>]*>/gi, (tag, attributes: string) => {
    const src = attribute(attributes, 'src');
    const path = src !== undefined ? assets.resolve(src) : undefined;
    if (!path || !/\.js$/i.test(path)) return tag;
    const rest = attributes.replace(
      /\s(?:src|async|defer)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/gi,
      '',
    );
    return '<script' + rest + '>' + inElement(assets.text(path), 'script') + '</script>';
  });
  page = page.replace(
    /(<style\b)([^>]*)>([\s\S]*?)(<\/style\b[^>]*>)/gi,
    (_match, open: string, attributes: string, css: string, close: string) =>
      attributes.indexOf(INLINED) >= 0
        ? open + attributes.replace(' ' + INLINED, '') + '>' + css + close
        : open + attributes + '>' + inElement(rewriteCss(css, '', assets), 'style') + close,
  );
  // Attributes, in the markup or in a passage's escaped text.
  page = page.replace(
    /(\s(?:src|href|poster)\s*=\s*)("|'|&quot;|&#0*39;)([^"'<>]*?)\2/gi,
    (match, head: string, quote: string, ref: string) => {
      const path = assets.resolve(decodeEntities(ref));
      return path ? head + quote + assets.dataUrl(path) + quote : match;
    },
  );
  page = rewriteUrls(page, '', assets);
  // SugarCube: [img[Title|source]], [<img[…]] (escaped in a passage), [img[source][link]].
  return page.replace(
    /(\[(?:<|>|&lt;|&gt;)?img\[)([^\]]*)\]/gi,
    (match, open: string, inside: string) => {
      const bar = inside.lastIndexOf('|');
      const path = assets.resolve(decodeEntities(inside.slice(bar + 1)));
      return path ? open + inside.slice(0, bar + 1) + assets.dataUrl(path) + ']' : match;
    },
  );
}
