// Quixe (the Glulx interpreter, MIT) is not on npm: its four files are downloaded at install time (`postinstall`,
// scripts/build/fetch-quixe.ts) from the upstream tag, into vendor/quixe/ (ignored by git), and checked against the
// SHA-256 recorded here: a moved tag or a corrupted download fails the install instead of shipping other code.
import { createHash } from 'node:crypto';

export const QUIXE_TAG = 'quixe-2.2.6';

export const QUIXE_BASE = 'https://raw.githubusercontent.com/erkyrath/quixe/' + QUIXE_TAG + '/';

export interface QuixeFile {
  /** Name in vendor/quixe/. */
  name: string;
  /** Path in the upstream repository. */
  path: string;
  sha256: string;
}

export const QUIXE_FILES: QuixeFile[] = [
  {
    name: 'quixe.js',
    path: 'src/quixe/quixe.js',
    sha256: '2a691e5618d25065ea6afe2bfb7cf8bd49778da40ae00e52cdfce2be8b6edccd',
  },
  {
    name: 'gi_dispa.js',
    path: 'src/quixe/gi_dispa.js',
    sha256: '8745316ce305198ed3af192d477b5cb27d19880b055dc6e778ab08e50202db70',
  },
  {
    name: 'glkapi.js',
    path: 'src/glkote/glkapi.js',
    sha256: '25a5efd58eb229f91b25b560696d585e441e5c169f0340e81fce7c0f967f1506',
  },
  {
    name: 'gi_blorb.js',
    path: 'src/glkote/gi_blorb.js',
    sha256: '056c1d34a27c520f887b3b6bd0a014401974cb6e732ef61f54af3e75d5ca8302',
  },
];

export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Downloads the files missing (or different) in the vendor directory, checking each one. `read` returns the local
 * copy (undefined when missing), `download` the upstream bytes, `write` stores a checked file. Throws on the first
 * download that fails or does not match its hash; returns the names downloaded.
 */
export async function ensureQuixe(
  io: {
    read: (name: string) => Uint8Array | undefined;
    download: (url: string) => Promise<Uint8Array>;
    write: (name: string, data: Uint8Array) => void;
  },
  files: QuixeFile[] = QUIXE_FILES,
): Promise<string[]> {
  const downloaded: string[] = [];
  for (const file of files) {
    const local = io.read(file.name);
    if (local && sha256(local) === file.sha256) continue;
    const url = QUIXE_BASE + file.path;
    const data = await io.download(url);
    const actual = sha256(data);
    if (actual !== file.sha256) {
      throw new Error(
        `${url}: SHA-256 ${actual}, expected ${file.sha256} (has the ${QUIXE_TAG} tag moved?)`,
      );
    }
    io.write(file.name, data);
    downloaded.push(file.name);
  }
  return downloaded;
}
