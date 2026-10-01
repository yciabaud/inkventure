import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extraNotices, formatLicences, mitText } from './licences.ts';

const VITE =
  '# Licenses\n\nThe app bundles dependencies which contain the following licenses:\n\n## preact - 10.0.0 (MIT)\n\nMIT text\n';

describe('formatLicences', () => {
  it("keeps Vite's list without its title and appends the extra notices", () => {
    const dir = mkdtempSync(join(tmpdir(), 'licences-'));
    writeFileSync(join(dir, 'LICENSE'), '  Quixe licence text\n');
    const out = formatLicences(VITE, [
      { name: 'Quixe', version: '2.2.6', licence: 'MIT', use: 'Glulx', file: join(dir, 'LICENSE') },
      { name: 'QR', licence: 'MIT', use: 'probe', text: 'QR text' },
    ]);
    expect(out.startsWith('Inkventure: third-party licences\n')).toBe(true);
    expect(out).not.toContain('# Licenses');
    expect(out).toContain('## preact - 10.0.0 (MIT)\n\nMIT text');
    expect(out).toContain('## Quixe - 2.2.6 (MIT)\n\nUsed for: Glulx.\n\nQuixe licence text\n');
    expect(out).toContain('## QR (MIT)\n\nUsed for: probe.\n\nQR text\n');
    expect(out.indexOf('## preact')).toBeLessThan(out.indexOf('## Quixe'));
  });
});

describe('extraNotices', () => {
  it('reads the files and versions of this checkout', () => {
    const notices = extraNotices(process.cwd());
    expect(notices.map((n) => n.name)).toEqual([
      'Quixe',
      'core-js',
      'SystemJS',
      'QR Code Generator for JavaScript',
    ]);
    expect(notices[0].version).toBe('2.2.6');
    expect(notices[1].version).toMatch(/^3\./);
    // Every notice has a readable text.
    expect(() => formatLicences(VITE, notices)).not.toThrow();
  });
});

describe('mitText', () => {
  it('starts with the copyright line', () => {
    expect(mitText('2009 Someone').split('\n')[0]).toBe('Copyright (c) 2009 Someone');
    expect(mitText('x')).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });
});
