import { describe, expect, it } from 'vitest';
import { compilePage, pageHtml, pageStrings } from './ebook-page';

describe('ebook page build', () => {
  it('keeps only the ebookPage.* strings of each locale', () => {
    const all = pageStrings({
      fr: { 'ebookPage.title': 'Livre', 'home.title': 'Accueil' },
      en: { 'ebookPage.title': 'Book', 'ebookPage.plural': { one: 'x', other: 'y' } },
    });
    expect(all).toEqual({ en: { 'ebookPage.title': 'Book' }, fr: { 'ebookPage.title': 'Livre' } });
  });

  it('embeds the strings safely and escapes the title', () => {
    const html = pageHtml(
      { en: { 'ebookPage.title': 'A <b> & </script>', 'ebookPage.noScript': 'JS' } },
      'en',
    );
    expect(html).toContain('<title>A &lt;b&gt; &amp; &lt;/script&gt;</title>');
    expect(html).not.toContain('</script>"');
    expect(html).toContain('\\u003c/script>');
    expect(html).toContain('<script src="page.js"></script>');
  });

  it('compiles the page module into a script without ES2015 syntax that starts the page', () => {
    const script = compilePage(
      'export const A = [1];\nexport function start() { const b = () => A; return b; }\n',
    );
    expect(script).not.toMatch(/\bconst\b|=>|\bexport\b/);
    expect(script).toContain('exports.start(window, window.INKVENTURE_EBOOK_STRINGS)');
  });
});
