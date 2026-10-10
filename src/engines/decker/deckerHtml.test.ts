import { describe, expect, it } from 'vitest';
import { deckerHtml, deckerMessage, deckText, scriptText } from './deckerHtml';

const DECK = '{deck}\nversion:1\ncard:"home"\n{card:home}\n';

describe('deckText', () => {
  it('takes a deck file as it is', () => {
    expect(deckText(DECK)).toBe(DECK);
    expect(deckText('﻿' + DECK)).toBe(DECK);
  });

  it("takes the deck out of a web export's page", () => {
    const page =
      '<meta charset="UTF-8"><body><script language="decker">\n' +
      DECK +
      '</script><script src="decker.js"></script></body>';
    expect(deckText(page)).toBe(DECK);
    expect(deckText('<script language=\'decker\' type="text/x-decker">' + DECK + '</script>')).toBe(
      DECK,
    );
  });

  it('finds none in another page or text', () => {
    expect(deckText('<html><body><script>var a=1</script></body></html>')).toBeNull();
    expect(deckText('<script language="decker">not a deck</script>')).toBeNull();
    expect(deckText('hello')).toBeNull();
  });
});

describe('deckerHtml', () => {
  it('holds the deck where Decker reads it, then the two scripts, closed safely', () => {
    const html = deckerHtml(DECK, { lil: 'var a="</script>"', ui: 'b()' });
    expect(html).toContain(
      '<script language="decker" type="text/x-decker">\n' + DECK + '</script>',
    );
    expect(html).toContain('<canvas id="display"></canvas>');
    expect(html).toContain('<script>var a="<\\/script>"</script><script>b()</script>');
    expect(html.indexOf('language="decker"')).toBeLessThan(html.indexOf('<script>var a'));
  });

  it('escapes every closing script tag in a text', () => {
    expect(scriptText('a</script>b</SCRIPT >')).toBe('a<\\/script>b<\\/SCRIPT >');
  });
});

describe('deckerMessage', () => {
  it("reads the frame's messages and nothing else", () => {
    expect(deckerMessage({ ikDecker: 1, type: 'ready' })).toEqual({ ikDecker: 1, type: 'ready' });
    expect(deckerMessage({ ikDecker: 1, type: 'title', title: 'Tour' })).toMatchObject({
      title: 'Tour',
    });
    expect(deckerMessage({ ikDecker: 1, type: 'save', deck: DECK })).toMatchObject({ deck: DECK });
    expect(deckerMessage({ ikDecker: 1, type: 'error', message: 'x' })).toMatchObject({
      message: 'x',
    });
    expect(deckerMessage({ ikDecker: 1, type: 'save', deck: 3 })).toBeNull();
    expect(deckerMessage({ type: 'save', deck: DECK })).toBeNull();
    expect(deckerMessage('save')).toBeNull();
    expect(deckerMessage(null)).toBeNull();
  });
});
