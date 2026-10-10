// jDAAD (Uto's DAAD interpreter in JavaScript, GPL-3) for the DAAD spike (story S0.13): the interpreter, the jQuery
// it ships with, its default font and its extern stub are downloaded at install time (`postinstall`,
// scripts/build/fetch-daad.ts) from a pinned commit, into vendor/daad/ (ignored by git), and checked against the
// SHA-256 recorded here, like Decker (decker-files.ts) and Bitsy (bitsy-files.ts).
import { sha256 } from './quixe-files.ts';

/** jDAAD 1.2 (`versionDate` 24/06/2025 in jdaad.js); the repository has no tags. Last commit on 2026-09-01. */
export const DAAD_VERSION = '1.2';
export const DAAD_COMMIT = '053903d3326d7cf1aaa321f05928efa158e9c472';

export const DAAD_BASE = 'https://raw.githubusercontent.com/Utodev/jDAAD/' + DAAD_COMMIT + '/';

export interface DaadFile {
  /** Name in vendor/daad/. */
  name: string;
  /** Path in the upstream repository. */
  path: string;
  sha256: string;
}

export const DAAD_FILES: DaadFile[] = [
  {
    name: 'jquery-3.6.0.min.js',
    path: 'jquery-3.6.0.min.js',
    sha256: 'ff1523fb7389539c84c65aba19260648793bb4f5e29329d2ee8804bc37a3fe6e',
  },
  {
    // The DAAD 8 × 6 font with international characters.
    name: 'font.js',
    path: 'font.js',
    sha256: '1ccc69c2a47d65a192ec21863f964177702776d428b2e3b7de9b15f183e487b1',
  },
  {
    // The EXTERN condact's handlers (an example only).
    name: 'extern.js',
    path: 'extern.js',
    sha256: 'c49f9eb634dddec24db1b03e98d7d7e141f55b2b83dd6acc28e5c7c1bcf70901',
  },
  {
    name: 'jdaad.js',
    path: 'jdaad.js',
    sha256: 'f64c08be0ad364fee28bff942a9eeedeccd05769fc61dafa7053c87bc01155ce',
  },
];

/**
 * Downloads the files missing (or different) in the vendor directory, checking each one. `read` returns the local
 * copy (undefined when missing), `download` the upstream bytes, `write` stores a checked file. Throws on the first
 * download that fails or does not match its hash; returns the names downloaded.
 */
export async function ensureDaad(
  io: {
    read: (name: string) => Uint8Array | undefined;
    download: (url: string) => Promise<Uint8Array>;
    write: (name: string, data: Uint8Array) => void;
  },
  files: DaadFile[] = DAAD_FILES,
): Promise<string[]> {
  const downloaded: string[] = [];
  for (const file of files) {
    const local = io.read(file.name);
    if (local && sha256(local) === file.sha256) continue;
    const url = DAAD_BASE + file.path;
    const data = await io.download(url);
    const actual = sha256(data);
    if (actual !== file.sha256) {
      throw new Error(`${url}: SHA-256 ${actual}, expected ${file.sha256}`);
    }
    io.write(file.name, data);
    downloaded.push(file.name);
  }
  return downloaded;
}
