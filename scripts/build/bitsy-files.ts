// Bitsy (Adam Le Doux's tiny tile-based game maker, MIT) for the Bitsy spike (story S0.12): the engine's scripts, the
// two upstream system files the probe keeps, the default font and the editor's default game are downloaded at install
// time (`postinstall`, scripts/build/fetch-bitsy.ts) from a pinned Codeberg commit, into vendor/bitsy/ (ignored by
// git), and checked against the SHA-256 recorded here, like Decker (decker-files.ts) and Quixe (quixe-files.ts).
import { sha256 } from './quixe-files.ts';

/** Version 8.14 (package.json of that commit); the repository has no tag for it. */
export const BITSY_VERSION = '8.14';
export const BITSY_COMMIT = '2f5eecf8b85b52a3e2e5546ee4f6b77e4ce2a3d7';

export const BITSY_BASE = 'https://codeberg.org/adamledoux/bitsy/raw/commit/' + BITSY_COMMIT + '/';

export interface BitsyFile {
  /** Name in vendor/bitsy/. */
  name: string;
  /** Path in the upstream repository. */
  path: string;
  sha256: string;
}

/** The engine, in the order the export template loads it (after the system layer). */
export const BITSY_ENGINE = [
  'world.js',
  'sound.js',
  'font.js',
  'transition.js',
  'script.js',
  'dialog.js',
  'renderer.js',
  'bitsy.js',
];

export const BITSY_FILES: BitsyFile[] = [
  // The system layer the probe keeps (memory blocks, drawing); input and sound are replaced (scripts/build/bitsy-eink/).
  {
    name: 'system.js',
    path: 'editor/script/system/system.js',
    sha256: '60537c72e1a6378c19c34fc2fb08fe3ae4307c0a7eb1a5e886bfc1eae1c1ba37',
  },
  {
    name: 'graphics.js',
    path: 'editor/script/system/graphics.js',
    sha256: 'e8af4a2add53aa71389a8a8b8bf9a7659202f0a9b1a23b9dded366756cce011f',
  },
  {
    name: 'world.js',
    path: 'editor/script/engine/world.js',
    sha256: '266b5e6d4f0bdad600c5986b7561d1427c2357c1803b8f0b0a6644c84ebfe556',
  },
  {
    name: 'sound.js',
    path: 'editor/script/engine/sound.js',
    sha256: 'b1413f18e9d200494f79ee26d66306f2c21ab822bbd8fc5a41fc6e3975c17bf7',
  },
  {
    name: 'font.js',
    path: 'editor/script/engine/font.js',
    sha256: '4c9c4ed2aa5b66714d5b7eb06597adf7d9679b7b4123fb5fe5f999c3419e457f',
  },
  {
    name: 'transition.js',
    path: 'editor/script/engine/transition.js',
    sha256: 'cdff563e0c288caf443949935570dd2a16d872f9d5fe62023d3543c33b72f2af',
  },
  {
    name: 'script.js',
    path: 'editor/script/engine/script.js',
    sha256: '875e2d31a40b01390de9a6c64a247b1d18c05787533e83e84f401ef19cb5acd0',
  },
  {
    name: 'dialog.js',
    path: 'editor/script/engine/dialog.js',
    sha256: 'a4f90cbef51fa0fbd91c8d2bdf9cc1d8b66a309aa234ff541df30eabdffe4ae7',
  },
  {
    name: 'renderer.js',
    path: 'editor/script/engine/renderer.js',
    sha256: '4a82fc5621e8e3f49ffe393977dc9780b30b2369eadace48c421dba710abc7ba',
  },
  {
    name: 'bitsy.js',
    path: 'editor/script/engine/bitsy.js',
    sha256: '6299045324a83aeff605f63f9de225f8a5f2e98eb7a6079f7c881e29be4c76a4',
  },
  {
    // The font exported games embed by default.
    name: 'ascii_small.bitsyfont',
    path: 'dev/resources/bitsyfont/ascii_small.bitsyfont',
    sha256: '87f0a1972c5026497b83e98fc71a0b0952cbe818fa7c796315943c178becff44',
  },
  {
    // The game a new project starts with: one room, a cat, two items, dialogue with a text effect.
    name: 'default.bitsy',
    path: 'dev/resources/defaultGameData.bitsy',
    sha256: 'c290216b21c7901df0e042465fef975247667f56e75594790a76e272f4de6683',
  },
];

/**
 * Downloads the files missing (or different) in the vendor directory, checking each one. `read` returns the local
 * copy (undefined when missing), `download` the upstream bytes, `write` stores a checked file. Throws on the first
 * download that fails or does not match its hash; returns the names downloaded.
 */
export async function ensureBitsy(
  io: {
    read: (name: string) => Uint8Array | undefined;
    download: (url: string) => Promise<Uint8Array>;
    write: (name: string, data: Uint8Array) => void;
  },
  files: BitsyFile[] = BITSY_FILES,
): Promise<string[]> {
  const downloaded: string[] = [];
  for (const file of files) {
    const local = io.read(file.name);
    if (local && sha256(local) === file.sha256) continue;
    const url = BITSY_BASE + file.path;
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
