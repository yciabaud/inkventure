import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { strToU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../reader/settings';
import { frameScript } from './frameScript';
import { FRAME_MESSAGE, STYLE_ID } from './messages';
import {
  eInkStylesheet,
  isTwineStory,
  prepareTwineHtml,
  storyAssets,
  storyHtml,
  type StoryAssets,
} from './twineHtml';

const EMPTY = { local: {}, session: {} };
const HARLOWE = readFileSync('tests/fixtures/twine/lamp-harlowe.html', 'utf8');

describe('e-ink stylesheet', () => {
  it('is black on white, without motion, with the reader text settings', () => {
    const css = eInkStylesheet(DEFAULT_SETTINGS);
    // Animations and transitions jump to their end state instead of being removed (S1.13).
    expect(css).toContain('animation-duration:0s!important;animation-delay:0s!important');
    expect(css).toContain('animation-iteration-count:1!important');
    expect(css).toContain('transition-duration:0s!important;transition-delay:0s!important');
    expect(css).not.toMatch(/animation:none|transition:none/);
    expect(css).toMatch(/a,tw-link,\.enchantment-link,button\{[^}]*opacity:1!important/);
    expect(css).toMatch(/html,body\{background:#fff!important;color:#000!important/);
    expect(css).toContain('html{font-size:18px!important}');
    expect(css).toContain('line-height:1.5!important');
    expect(css).toContain('text-align:left!important');
    expect(css).toContain('padding:16px 24px!important');
    expect(css).toContain('font-family:Georgia');
    // Scrolling is hidden only once the frame script pages.
    expect(css).toContain('html.ik-paged{overflow:hidden!important}');
    expect(css).toContain('min-height:48px');
    // A story centred with absolute positioning and a transform stays in the page.
    expect(css).toMatch(
      /tw-story, tw-passage[^{]*\{position:static!important;transform:none!important/,
    );
    // A story next to <body> keeps the side margins.
    expect(css).toContain('html>tw-story{padding:0 24px!important}');
  });

  it('follows every setting', () => {
    const css = eInkStylesheet({
      size: 5,
      typeface: 'dyslexic',
      margins: 'wide',
      spacing: 'loose',
      align: 'justify',
    });
    expect(css).toContain('html{font-size:28px!important}');
    expect(css).toContain('font-family:Verdana');
    expect(css).toContain('letter-spacing:0.05em');
    expect(css).toContain('padding:16px 48px!important');
    expect(css).toContain('line-height:1.8!important');
    expect(css).toContain('text-align:justify!important');
  });
});

describe('story page preparation', () => {
  it('decodes the story file as UTF-8 without its byte order mark', () => {
    const bytes = strToU8('\ufeff<html>Château</html>');
    expect(storyHtml(bytes)).toBe('<html>Château</html>');
  });

  it('recognises published Twine stories', () => {
    expect(isTwineStory(HARLOWE)).toBe(true);
    expect(isTwineStory('<html><div id="storeArea"></div></html>')).toBe(true);
    expect(isTwineStory('<html><body>Not found</body></html>')).toBe(false);
  });

  it('injects the stylesheet and the frame script first in <head>', () => {
    const html = prepareTwineHtml(
      '<!DOCTYPE html><html lang="en"><head class="x"><script>story()</script></head><body></body></html>',
      'p{color:#000}',
      EMPTY,
    );
    const head = html.indexOf('<head class="x">') + '<head class="x">'.length;
    expect(html.indexOf('<style id="' + STYLE_ID + '">p{color:#000}</style><script>')).toBe(head);
    expect(html.indexOf('localStorage')).toBeLessThan(html.indexOf('story()'));
  });

  it('adds a <head> when the page has none, or puts everything first', () => {
    expect(prepareTwineHtml('<html><body>x</body></html>', '', EMPTY)).toMatch(
      /^<html><head><style id="inkventure-eink"><\/style><script>[\s\S]*<\/script><\/head><body>x/,
    );
    expect(prepareTwineHtml('<p>x</p>', '', EMPTY)).toMatch(/^<style[\s\S]*<\/script><p>x<\/p>$/);
    // <header> is not <head>.
    expect(prepareTwineHtml('<header>x</header>', '', EMPTY)).toMatch(/^<style/);
  });

  it('resolves relative links where the story came from, unless it has its own <base>', () => {
    const url = 'https://ifarchive.org/if-archive/games/twine/a "story".html';
    expect(prepareTwineHtml('<head></head>', '', EMPTY, url)).toContain(
      '<head><base href="https://ifarchive.org/if-archive/games/twine/a &quot;story&quot;.html"><style',
    );
    expect(prepareTwineHtml('<head><base href="x/"></head>', '', EMPTY, url)).not.toContain(
      'ifarchive',
    );
  });

  it('keeps saved data from closing the script element', () => {
    const script = frameScript({
      local: { key: '</script><script>alert(1)</script>' },
      session: {},
    });
    expect(script).not.toContain('</script>');
    expect(script).toContain('\\u003c/script>');
  });
});

/** A story page with the frame script, run in jsdom; `posted` collects what it posts to its parent (itself here). */
function runFrame(
  storage: { local: Record<string, string>; session: Record<string, string> },
  assets?: StoryAssets,
) {
  const html = prepareTwineHtml(
    '<!DOCTYPE html><html><head></head><body><p>Story</p><a href="#">A link</a></body></html>',
    eInkStylesheet(DEFAULT_SETTINGS),
    storage,
    undefined,
    assets,
  );
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const posted: Array<Record<string, unknown>> = [];
  dom.window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as Record<string, unknown>;
    if (data && data.source === FRAME_MESSAGE && data.type !== 'style') posted.push(data);
  });
  return { frame: dom.window, posted: posted };
}

describe('frame script', () => {
  it('stands in for localStorage and sessionStorage, seeded with the saved data', async () => {
    const { frame, posted } = runFrame({ local: { save: 'slot 1' }, session: { state: 's' } });
    expect(frame.localStorage.getItem('save')).toBe('slot 1');
    expect(frame.localStorage.length).toBe(1);
    expect(frame.localStorage.key(0)).toBe('save');
    expect(frame.sessionStorage.getItem('state')).toBe('s');
    expect(frame.localStorage.getItem('missing')).toBeNull();

    frame.localStorage.setItem('other', 42 as unknown as string);
    frame.localStorage.removeItem('save');
    frame.sessionStorage.clear();
    // One message per area and tick, with the whole area.
    await vi.waitFor(() =>
      expect(posted.filter((m) => m.type === 'storage')).toEqual([
        { source: FRAME_MESSAGE, type: 'storage', area: 'local', items: { other: '42' } },
        { source: FRAME_MESSAGE, type: 'storage', area: 'session', items: {} },
      ]),
    );
  });

  it('marks the page as paged and reports its page', async () => {
    const { frame, posted } = runFrame(EMPTY);
    await vi.waitFor(() =>
      expect(posted.some((m) => m.type === 'page' && m.page === 1)).toBe(true),
    );
    expect(frame.document.documentElement.className).toBe('ik-paged');
  });

  it('applies a new stylesheet sent by the reader', async () => {
    const { frame } = runFrame(EMPTY);
    // From its parent (itself, here).
    const data = { source: FRAME_MESSAGE, type: 'style', css: 'p{color:red}' };
    frame.dispatchEvent(
      new frame.MessageEvent('message', { data: data, source: frame as unknown as Window }),
    );
    // Not from its parent: ignored.
    frame.dispatchEvent(
      new frame.MessageEvent('message', { data: { ...data, css: 'x' }, source: null }),
    );
    expect(frame.document.getElementById(STYLE_ID)?.textContent).toBe('p{color:red}');
  });

  it('asks the reader for files the story names after it loaded, and uses the answer (S1.11)', async () => {
    const { frame, posted } = runFrame(EMPTY, storyAssets({ 'img/late.png': new Uint8Array(4) }));
    const doc = frame.document;
    const img = doc.createElement('img');
    img.setAttribute('src', 'img/late.png');
    const div = doc.createElement('div');
    div.setAttribute('style', 'background:url("img/late.png")');
    const outside = doc.createElement('img');
    outside.setAttribute('src', 'https://example.com/a.png');
    doc.body.appendChild(img);
    doc.body.appendChild(div);
    doc.body.appendChild(outside);
    await vi.waitFor(() =>
      expect(posted.filter((m) => m.type === 'asset')).toEqual([
        { source: FRAME_MESSAGE, type: 'asset', ref: 'img/late.png' },
      ]),
    );
    const url = 'data:image/png;base64,AAAA';
    frame.dispatchEvent(
      new frame.MessageEvent('message', {
        data: { source: FRAME_MESSAGE, type: 'asset', ref: 'img/late.png', url: url },
        source: frame as unknown as Window,
      }),
    );
    expect(img.getAttribute('src')).toBe(url);
    expect(div.getAttribute('style')).toBe('background:url("' + url + '")');
    expect(outside.getAttribute('src')).toBe('https://example.com/a.png');
  });
});
