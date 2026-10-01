import { describe, expect, it } from 'vitest';
import { ebookAddress } from './SettingsScreen';

describe('the ebook address in Settings › About', () => {
  it('is the ebook/ folder next to the app', () => {
    expect(ebookAddress('https://example.org/inkventure/#/settings?s=about')).toBe(
      'https://example.org/inkventure/ebook/',
    );
    expect(ebookAddress('https://example.org/inkventure/index.html?x=1#/settings')).toBe(
      'https://example.org/inkventure/ebook/',
    );
    expect(ebookAddress('http://localhost:4173/')).toBe('http://localhost:4173/ebook/');
  });
});
