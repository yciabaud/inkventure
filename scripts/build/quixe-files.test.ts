import { describe, expect, it } from 'vitest';
import { ensureQuixe, QUIXE_BASE, QUIXE_FILES, sha256 } from './quixe-files';

// Stand-in contents: the test checks the flow with hashes computed here, not the real files.
function fakeFiles() {
  const contents: Record<string, Uint8Array> = {};
  for (const file of QUIXE_FILES) contents[file.name] = new TextEncoder().encode('// ' + file.name);
  const files = QUIXE_FILES.map((file) => ({ ...file, sha256: sha256(contents[file.name]) }));
  return { contents, files };
}

describe('ensureQuixe', () => {
  it('downloads each missing file from the tag and keeps the ones already checked', async () => {
    const { contents, files } = fakeFiles();
    const written: Record<string, Uint8Array> = { 'quixe.js': contents['quixe.js'] };
    const urls: string[] = [];
    const downloaded = await ensureQuixe(
      {
        read: (name) => written[name],
        download: async (url) => {
          urls.push(url);
          const file = files.find((f) => QUIXE_BASE + f.path === url)!;
          return contents[file.name];
        },
        write: (name, data) => void (written[name] = data),
      },
      files,
    );
    expect(downloaded).toEqual(['gi_dispa.js', 'glkapi.js', 'gi_blorb.js']);
    expect(urls[0]).toBe(QUIXE_BASE + 'src/quixe/gi_dispa.js');
    expect(Object.keys(written).sort()).toEqual(files.map((f) => f.name).sort());
  });

  it('refuses a file whose hash differs (a moved tag), writing nothing', async () => {
    const { files } = fakeFiles();
    const written: string[] = [];
    await expect(
      ensureQuixe(
        {
          read: () => undefined,
          download: async () => new TextEncoder().encode('something else'),
          write: (name) => void written.push(name),
        },
        files,
      ),
    ).rejects.toThrow(/SHA-256 .* expected .* quixe-2\.2\.6/);
    expect(written).toEqual([]);
  });
});
