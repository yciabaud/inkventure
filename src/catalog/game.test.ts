import { afterEach, describe, expect, it, vi } from 'vitest';
import { blurbParagraphs, isIfArchive, loadGame, thumbnailUrl } from './game';

describe('blurbParagraphs', () => {
  it('turns line breaks and block elements into paragraphs', () => {
    expect(
      blurbParagraphs(
        'Pig lost!<br>Boss say it Grunk fault.<br/><br />-- IFComp 2007 blurb<p>Second</p><ul><li>One</li><li>Two</li></ul>',
      ),
    ).toEqual([
      'Pig lost!',
      'Boss say it Grunk fault.',
      '-- IFComp 2007 blurb',
      'Second',
      'One',
      'Two',
    ]);
  });

  it('keeps only the text of other tags and drops scripts, styles and comments', () => {
    expect(
      blurbParagraphs(
        'A <i>classic</i> by <a href="https://example.org" onclick="x()">Someone</a>.' +
          '<script>alert(1)</script><style>p{}</style><!-- note --><B>Bold</B> <img src=x onerror=alert(1)>end',
      ),
    ).toEqual(['A classic by Someone.Bold end']);
  });

  it('is not fooled by nested or broken markup', () => {
    // "<scr<script>" is one (unknown) tag; what follows is plain text, rendered as text anyway.
    expect(blurbParagraphs('<scr<script>ipt>alert(1)</script>ok')).toEqual(['ipt>alert(1)ok']);
    expect(blurbParagraphs('a<!--<script>x</script>-->b<SCRIPT >y</SCRIPT >c')).toEqual(['abc']);
    expect(blurbParagraphs('2 < 3, 5 <= 6')).toEqual(['2 < 3, 5 <= 6']);
    expect(blurbParagraphs('text <b unterminated')).toEqual(['text']);
    expect(blurbParagraphs('<script>never closed')).toEqual([]);
  });

  it('decodes entities once and collapses whitespace', () => {
    expect(
      blurbParagraphs(
        '&quot;Late Thursday&quot; &#039;night&#039; &amp;amp; &lt;b&gt; caf&eacute;&nbsp;&hellip; &#x1F600; &unknown;\n  spaced   out  ',
      ),
    ).toEqual(['"Late Thursday" \'night\' &amp; <b> café … 😀 &unknown;', 'spaced out']);
  });

  it('gives no paragraph for an empty or missing blurb', () => {
    expect(blurbParagraphs(undefined)).toEqual([]);
    expect(blurbParagraphs(' <br><br> ')).toEqual([]);
  });
});

describe('thumbnailUrl and isIfArchive', () => {
  it('asks IFDB for a thumbnail rounded up to 10 px', () => {
    expect(thumbnailUrl('abc', 120, 175)).toBe(
      'https://ifdb.org/coverart?id=abc&thumbnail=120x180',
    );
  });

  it('recognises IF Archive links', () => {
    expect(isIfArchive('https://ifarchive.org/if-archive/games/zcode/lamp.z5')).toBe(true);
    expect(isIfArchive('https://mirror.ifarchive.org/if-archive/x.z5')).toBe(true);
    expect(isIfArchive('https://example.org/ifarchive.org/x.z5')).toBe(false);
  });
});

describe('loadGame', () => {
  afterEach(() => vi.unstubAllGlobals());

  function serve(status: number, body: string) {
    const requested: string[] = [];
    class FakeXhr {
      readyState = 0;
      status = 0;
      responseText = '';
      onreadystatechange: (() => void) | null = null;
      private url = '';
      open(_method: string, url: string) {
        this.url = url;
      }
      send() {
        requested.push(this.url);
        setTimeout(() => {
          this.readyState = 4;
          this.status = status;
          this.responseText = body;
          if (this.onreadystatechange) this.onreadystatechange();
        }, 0);
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    return requested;
  }

  const game = {
    tuid: 'abc',
    title: 'T',
    author: 'A',
    file: { url: 'https://ifarchive.org/x.z5' },
  };

  it('loads games/<tuid>.json', async () => {
    const requested = serve(200, JSON.stringify(game));
    expect(await loadGame('abc')).toEqual({ status: 'ready', game: game });
    expect(requested).toEqual(['catalog/games/abc.json']);
  });

  it('reports a game missing from the catalogue', async () => {
    serve(404, '');
    expect(await loadGame('abc')).toEqual({ status: 'missing' });
  });

  it('rejects on other errors and on a detail of another game', async () => {
    serve(500, '');
    await expect(loadGame('abc')).rejects.toThrow('HTTP 500');
    serve(200, JSON.stringify({ ...game, tuid: 'other' }));
    await expect(loadGame('abc')).rejects.toThrow('Invalid game detail');
  });
});
