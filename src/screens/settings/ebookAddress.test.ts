import { describe, expect, it } from 'vitest';
import { ebookAddress, siteAddress } from './SettingsScreen';

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

describe('siteAddress', () => {
  it('is a file next to the app', () => {
    expect(siteAddress('https://example.org/inkventure/#/settings?s=about', 'licences.txt')).toBe(
      'https://example.org/inkventure/licences.txt',
    );
  });
});
