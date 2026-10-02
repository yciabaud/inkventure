// Preparing a Twine story's page for the reader (SPEC §4.3; story S1.9): the e-ink stylesheet and the frame script are
// injected at the top of its <head>, so the script runs before the story format's own.
import { strFromU8 } from 'fflate';
import { FONT_SIZES, type ReaderSettings } from '../../reader/settings';
import { inlineAssets, type StoryAssets } from './assets';
import { frameScript } from './frameScript';

export { storyAssets, type StoryAssets } from './assets';
import { STYLE_ID, type FrameStorage } from './messages';

// The frame has an opaque origin: the app's bundled web fonts are not available there, the fallbacks are.
const FAMILIES: Record<ReaderSettings['typeface'], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "'Helvetica Neue', Arial, sans-serif",
  dyslexic: "Verdana, Tahoma, 'Trebuchet MS', sans-serif",
};
const PADDING: Record<ReaderSettings['margins'], number> = { narrow: 12, normal: 24, wide: 48 };
const LINE_HEIGHT: Record<ReaderSettings['spacing'], number> = {
  tight: 1.3,
  normal: 1.5,
  loose: 1.8,
};

// The story's page containers of the common story formats: Harlowe (tw-story, tw-passage), SugarCube (#story,
// #passages, .passage), Snowman / Chapbook (#passage, main).
const PAGE = 'tw-story, tw-passage, #story, #passages, .passage, #passage, main';

/**
 * The e-ink stylesheet for the reader's text settings: black on white, the reader's font, size, spacing and margins,
 * bold underlined links at least 48 px tall, no motion. `!important` wins over the story format's styles, which are
 * added later.
 *
 * Animations and transitions are not removed but made instant: they jump to their end state, which a story may need
 * to show its text at all (`opacity:0` + a fade-in that fills `forwards`, S1.13). A looping animation stops on its
 * last frame, so links are kept opaque whatever their animation ends on, and the frame script shows any element
 * whose animation ends invisible.
 */
export function eInkStylesheet(settings: ReaderSettings): string {
  const size = FONT_SIZES[settings.size];
  const padding = PADDING[settings.margins];
  const extra =
    settings.typeface === 'dyslexic' ? 'letter-spacing:0.05em;word-spacing:0.12em;' : '';
  return [
    '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;' +
      'animation-iteration-count:1!important;transition-duration:0s!important;' +
      'transition-delay:0s!important;text-shadow:none!important;box-shadow:none!important}',
    'html,body{background:#fff!important;color:#000!important;margin:0!important}',
    'html{font-size:' + size + 'px!important}',
    'html.ik-paged{overflow:hidden!important}',
    'body{font-family:' +
      FAMILIES[settings.typeface] +
      '!important;font-size:1rem!important;line-height:' +
      LINE_HEIGHT[settings.spacing] +
      '!important;text-align:' +
      settings.align +
      '!important;padding:16px ' +
      padding +
      'px!important;' +
      extra +
      '}',
    PAGE +
      '{background:#fff!important;color:#000!important;font-family:inherit!important;' +
      'font-size:inherit!important;line-height:inherit!important}',
    'html,body,tw-story{height:auto!important;min-height:0!important}',
    // In the flow of the page: a story centred with absolute positioning and a transform (Will Not Let Me Go's
    // "top:25%; transform:translate(-50%,-50%)") ends up above the top of a page whose height is its content's.
    PAGE +
      '{position:static!important;transform:none!important;top:auto!important;left:auto!important;' +
      'right:auto!important;bottom:auto!important}',
    'tw-story{padding:0!important;margin:0 auto!important;width:auto!important;max-width:40em!important}',
    // Harlowe may put the story next to <body> (Will Not Let Me Go): it then gets the body's side margins itself.
    'html>tw-story{padding:0 ' + padding + 'px!important}',
    // Harlowe's sidebar (undo / redo) as a row above the passage, instead of in the margin.
    'tw-sidebar{position:static!important;display:flex!important;flex-direction:row!important;' +
      'width:auto!important;left:auto!important;margin:0 0 8px!important}',
    'tw-icon{opacity:1!important;display:inline-block;font-size:28px!important;min-width:48px;' +
      'min-height:48px;line-height:48px!important;margin:0!important;' +
      'text-align:center}',
    // SugarCube's UI bar and dialogs, dark by default.
    '#ui-bar,#ui-bar-tray,#ui-dialog,#ui-dialog-titlebar,#ui-dialog-body{background:#fff!important;' +
      'color:#000!important;border-color:#000!important}',
    '#ui-bar{border-right:2px solid #000!important}',
    '#ui-dialog{border:2px solid #000!important}',
    '#ui-overlay{background:#fff!important}',
    'a,tw-link,.enchantment-link,button{color:#000!important;font-weight:700!important;' +
      'text-decoration:underline!important;cursor:pointer;opacity:1!important}',
    'a,tw-link,.enchantment-link{display:inline-block;min-height:48px;line-height:48px}',
    'button,input,select,textarea{font:inherit!important;min-height:48px;background:#fff!important;' +
      'color:#000!important;border:2px solid #000!important}',
    'img{filter:grayscale(1);max-width:100%}',
  ].join('\n');
}

/** The story file as text (UTF-8, byte order mark dropped). */
export function storyHtml(bytes: Uint8Array): string {
  const text = strFromU8(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const HEAD = /<head(\s[^>]*)?>/i;
const HTML = /<html(\s[^>]*)?>/i;

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * The story's page with the e-ink `<style>` and the frame script (starting with `storage`) injected first in its
 * <head> (or after <html>, or at the very start for a page with neither). With `assets` (the files of a zipped story),
 * the references to them are served from them first (assets.ts). With `baseUrl` (where the story was downloaded from)
 * and no <base> of its own, its other relative links resolve there.
 */
export function prepareTwineHtml(
  page: string,
  css: string,
  storage: FrameStorage,
  baseUrl?: string,
  assets?: StoryAssets,
): string {
  const html = assets ? inlineAssets(page, assets) : page;
  const base =
    baseUrl && !/<base[\s>]/i.test(html) ? '<base href="' + escapeAttribute(baseUrl) + '">' : '';
  const injected =
    base +
    '<style id="' +
    STYLE_ID +
    '">' +
    css.replace(/<\//g, '<\\/') +
    '</style><script>' +
    frameScript(storage, !!assets) +
    '</script>';
  const head = HEAD.exec(html);
  if (head) return insertAt(html, head.index + head[0].length, injected);
  const root = HTML.exec(html);
  if (root) return insertAt(html, root.index + root[0].length, '<head>' + injected + '</head>');
  return injected + html;
}

function insertAt(text: string, index: number, inserted: string): string {
  return text.slice(0, index) + inserted + text.slice(index);
}

/** Whether `html` is a published Twine story: Twine 2 story data, or a Twine 1 store area. */
export function isTwineStory(html: string): boolean {
  return /<tw-storydata[\s>]/i.test(html) || /id=["']?storeArea/i.test(html);
}
