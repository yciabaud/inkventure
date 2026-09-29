import { describe, expect, it } from 'vitest';
import { COVER_ORNAMENTS, COVER_VARIANTS, coverDesign, hashString } from './cover';

describe('hashString', () => {
  it('matches the FNV-1a reference values', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });
});

describe('coverDesign', () => {
  it('is deterministic for a title and author', () => {
    expect(coverDesign('Zork I', 'Infocom')).toEqual(coverDesign('Zork I', 'Infocom'));
    expect(coverDesign('Zork I', 'Infocom')).toMatchInlineSnapshot(`
      {
        "author": "Infocom",
        "ornament": "✧",
        "title": "Zork I",
        "variant": "band",
      }
    `);
  });

  it('ignores case and extra whitespace', () => {
    const a = coverDesign('  Photopia ', 'Adam  Cadre');
    const b = coverDesign('photopia', 'adam cadre');
    expect(a.variant).toBe(b.variant);
    expect(a.ornament).toBe(b.ornament);
    expect(a.title).toBe('Photopia');
    expect(a.author).toBe('Adam Cadre');
  });

  it('spreads games over the available designs', () => {
    const variants = new Set<string>();
    const ornaments = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const design = coverDesign('Game ' + i, 'Author ' + (i % 7));
      expect(COVER_VARIANTS).toContain(design.variant);
      expect(COVER_ORNAMENTS).toContain(design.ornament);
      variants.add(design.variant);
      ornaments.add(design.ornament);
    }
    expect(variants.size).toBe(COVER_VARIANTS.length);
    expect(ornaments.size).toBe(COVER_ORNAMENTS.length);
  });
});
