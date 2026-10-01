import { describe, expect, it } from 'vitest';
import { inlineAssets, rewriteCss, storyAssets } from './assets';

const enc = (text: string) => Uint8Array.from(new TextEncoder().encode(text));
const PNG = new Uint8Array([137, 80, 78, 71]);
const FONT = new Uint8Array([119, 79, 70, 50]);

const assets = storyAssets({
  'img/lamp.png': PNG,
  'img/My Lamp.png': PNG,
  'fonts/lamp.woff2': FONT,
  'fonts/lamp.ttf': FONT,
  'css/story.css': enc('.a{background:url(../img/lamp.png)}@import "more.css";'),
  'css/more.css': enc('.b{font-family:L}@font-face{src:url("../fonts/lamp.woff2")}'),
  'css/loop.css': enc('@import url(loop.css);.c{}'),
  'js/extra.js': enc('window.extra = "</script>";'),
});
const PNG_URL = 'data:image/png;base64,iVBORw==';
const FONT_URL = 'data:font/woff2;base64,d09GMg==';

describe('story file references', () => {
  it('resolves relative references to kept files, normalised', () => {
    expect(assets.resolve('img/lamp.png')).toBe('img/lamp.png');
    expect(assets.resolve('./img/lamp.png')).toBe('img/lamp.png');
    expect(assets.resolve('css/../img/lamp.png')).toBe('img/lamp.png');
    expect(assets.resolve('../img/lamp.png', 'css/')).toBe('img/lamp.png');
    expect(assets.resolve('img/My%20Lamp.png')).toBe('img/My Lamp.png');
    expect(assets.resolve('IMG/LAMP.PNG')).toBe('img/lamp.png');
    expect(assets.resolve(' img/lamp.png?v=2#top ')).toBe('img/lamp.png');
  });

  it('leaves alone absolute, data:, root and missing references', () => {
    for (const ref of [
      'https://example.com/img/lamp.png',
      '//example.com/img/lamp.png',
      '/img/lamp.png',
      'data:image/png;base64,AAAA',
      'blob:abc',
      '#img/lamp.png',
      'img/none.png',
      '../img/lamp.png',
      '',
    ]) {
      expect(assets.resolve(ref)).toBeUndefined();
    }
  });

  it('makes data: URLs with the type of the file', () => {
    expect(assets.dataUrl('img/lamp.png')).toBe(PNG_URL);
    expect(assets.dataUrl('fonts/lamp.woff2')).toBe(FONT_URL);
  });
});

describe('stylesheets', () => {
  it('rewrites url() with any quotes, from the stylesheet’s folder', () => {
    expect(rewriteCss('a{b:url(img/lamp.png)} c{d:url( "img/lamp.png" )}', '', assets)).toBe(
      `a{b:url(${PNG_URL})} c{d:url(${PNG_URL})}`,
    );
    expect(rewriteCss("a{b:url('../img/lamp.png')}", 'css/', assets)).toBe(`a{b:url(${PNG_URL})}`);
    expect(rewriteCss('a{b:url(img/none.png) url(http://x/y.png)}', '', assets)).toBe(
      'a{b:url(img/none.png) url(http://x/y.png)}',
    );
  });

  it('inlines imported stylesheets (each once), with their own folder', () => {
    const css = rewriteCss('@import url("css/story.css");', '', assets);
    expect(css).toBe(
      `.a{background:url(${PNG_URL})}.b{font-family:L}@font-face{src:url(${FONT_URL})}`,
    );
    expect(rewriteCss('@import url(css/loop.css);', '', assets)).toBe('.c{}');
    expect(rewriteCss('@import "css/more.css" print;', '', assets)).toContain('@media print{.b');
  });

  it('keeps the first kept source of a font only', () => {
    const css =
      '@font-face{font-family:L;src:url(fonts/lamp.woff2) format("woff2"),url(fonts/lamp.ttf) format("truetype")}';
    expect(rewriteCss(css, '', assets)).toBe(
      `@font-face{font-family:L;src:url(${FONT_URL}) format("woff2")}`,
    );
  });
});

describe('the story page', () => {
  it('inlines linked stylesheets and scripts', () => {
    const page = inlineAssets(
      '<head><link rel="stylesheet" href="css/more.css"><link rel="icon" href="img/lamp.png">' +
        '<script src="js/extra.js" defer></script><script src="https://x/y.js"></script></head>',
      assets,
    );
    expect(page).toBe(
      `<head><style>.b{font-family:L}@font-face{src:url(${FONT_URL})}</style>` +
        `<link rel="icon" href="${PNG_URL}">` +
        '<script>window.extra = "<\\/script>";</script><script src="https://x/y.js"></script></head>',
    );
  });

  it('accepts end tags with spaces or attributes', () => {
    expect(
      inlineAssets(
        '<script src="js/extra.js"></script x><style>a{b:url(img/lamp.png)}</style >',
        assets,
      ),
    ).toBe(`<script>window.extra = "<\\/script>";</script><style>a{b:url(${PNG_URL})}</style >`);
  });

  it('rewrites attributes, style elements and inline styles', () => {
    expect(
      inlineAssets(
        `<style>a{b:url(img/lamp.png)}</style><img src='./img/lamp.png' alt=""><div style="background:url(img/My%20Lamp.png)"></div><a href="next.html">`,
        assets,
      ),
    ).toBe(
      `<style>a{b:url(${PNG_URL})}</style><img src='${PNG_URL}' alt=""><div style="background:url(${PNG_URL})"></div><a href="next.html">`,
    );
  });

  it('rewrites references in the passages’ escaped text, SugarCube image links included', () => {
    const passage =
      '<tw-passagedata name="Start">&lt;img src=&quot;img/lamp.png&quot;&gt; [img[A lamp|img/lamp.png]] ' +
      '[&lt;img[img/lamp.png][Next]] [img[img/none.png]] &lt;span style=&quot;background:url(&#39;img/lamp.png&#39;)&quot;&gt;' +
      '</tw-passagedata>';
    expect(inlineAssets(passage, assets)).toBe(
      `<tw-passagedata name="Start">&lt;img src=&quot;${PNG_URL}&quot;&gt; [img[A lamp|${PNG_URL}]] ` +
        `[&lt;img[${PNG_URL}][Next]] [img[img/none.png]] &lt;span style=&quot;background:url(${PNG_URL})&quot;&gt;` +
        '</tw-passagedata>',
    );
  });

  it('changes nothing in a page that names no kept file', () => {
    const page =
      '<html><head><link rel="stylesheet" href="other.css"><script src="a.js"></script></head>' +
      '<body><img src="https://x/a.png"><tw-storydata>[img[pic.png]]</tw-storydata></body></html>';
    expect(inlineAssets(page, assets)).toBe(page);
    expect(inlineAssets(page, storyAssets({}))).toBe(page);
  });
});
