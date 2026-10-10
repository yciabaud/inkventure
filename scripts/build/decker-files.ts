// Decker (John Earnest's HyperCard-like tool, MIT) for the Decker spike (story S0.11): the web runtime's scripts and the
// tour deck are downloaded at install time (`postinstall`, scripts/build/fetch-decker.ts) from the upstream tag, into
// vendor/decker/ (ignored by git), and checked against the SHA-256 recorded here, like Quixe (quixe-files.ts).
import { sha256 } from './quixe-files.ts';

export const DECKER_TAG = 'v1.71';

/** The version web-decker shows (`sys.version`), as its Makefile passes it from the VERSION file. */
export const DECKER_VERSION = '1.71';

export const DECKER_BASE =
  'https://raw.githubusercontent.com/JohnEarnest/Decker/' + DECKER_TAG + '/';

export interface DeckerFile {
  /** Name in vendor/decker/. */
  name: string;
  /** Path in the upstream repository. */
  path: string;
  sha256: string;
}

export const DECKER_FILES: DeckerFile[] = [
  {
    name: 'lil.js',
    path: 'js/lil.js',
    sha256: 'd9b2fc6a933a6e88b6770f5bc05c499c338e1fbddb4af2dc9280c4f47b6ecefd',
  },
  {
    name: 'danger.js',
    path: 'js/danger.js',
    sha256: 'f4f4457b9575910d176e8335c4578d9fd54a661220edfa5907954b8967e155db',
  },
  {
    name: 'decker.js',
    path: 'js/decker.js',
    sha256: 'fe4372501d25a00cf2bf395d4106f58b3acdc5b3a3a6d78720d31ddc7f73a4ca',
  },
  {
    // The guided tour, the deck web-decker opens by default: real cards, buttons, fields and transitions.
    name: 'tour.deck',
    path: 'examples/decks/tour.deck',
    sha256: 'a7b68a2b1f822031f25023866225c0cd3dc937d086797258b066d6390c49c275',
  },
];

/**
 * Downloads the files missing (or different) in the vendor directory, checking each one. `read` returns the local
 * copy (undefined when missing), `download` the upstream bytes, `write` stores a checked file. Throws on the first
 * download that fails or does not match its hash; returns the names downloaded.
 */
export async function ensureDecker(
  io: {
    read: (name: string) => Uint8Array | undefined;
    download: (url: string) => Promise<Uint8Array>;
    write: (name: string, data: Uint8Array) => void;
  },
  files: DeckerFile[] = DECKER_FILES,
): Promise<string[]> {
  const downloaded: string[] = [];
  for (const file of files) {
    const local = io.read(file.name);
    if (local && sha256(local) === file.sha256) continue;
    const url = DECKER_BASE + file.path;
    const data = await io.download(url);
    const actual = sha256(data);
    if (actual !== file.sha256) {
      throw new Error(
        `${url}: SHA-256 ${actual}, expected ${file.sha256} (has the ${DECKER_TAG} tag moved?)`,
      );
    }
    io.write(file.name, data);
    downloaded.push(file.name);
  }
  return downloaded;
}
