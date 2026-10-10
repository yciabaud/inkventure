// `npm install` / `npm ci` postinstall: puts Bitsy's engine, font and default game in vendor/bitsy/ (see bitsy-files.ts), for
// the Bitsy probe page (S0.12). Nothing is downloaded when the checked files are already there. Exits 1, with the
// reason, when they cannot be fetched.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BITSY_VERSION, ensureBitsy } from './bitsy-files.ts';

const dir = 'vendor/bitsy';
mkdirSync(dir, { recursive: true });

try {
  const downloaded = await ensureBitsy({
    read: (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name)) : undefined),
    download: async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
      return new Uint8Array(await response.arrayBuffer());
    },
    write: (name, data) => writeFileSync(join(dir, name), data),
  });
  if (downloaded.length)
    console.log(`Bitsy ${BITSY_VERSION}: downloaded ${downloaded.join(', ')}.`);
} catch (error) {
  console.error(
    `Could not get Bitsy ${BITSY_VERSION} into ${dir}/ (needed for the Bitsy probe): ${(error as Error).message}`,
  );
  process.exit(1);
}
