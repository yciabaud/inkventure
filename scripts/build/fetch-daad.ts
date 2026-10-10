// `npm install` / `npm ci` postinstall: puts jDAAD, its jQuery, font and extern stub in vendor/daad/ (see daad-files.ts),
// for the DAAD probe page (S0.13). Nothing is downloaded when the checked files are already there. Exits 1, with the
// reason, when they cannot be fetched.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DAAD_VERSION, ensureDaad } from './daad-files.ts';

const dir = 'vendor/daad';
mkdirSync(dir, { recursive: true });

try {
  const downloaded = await ensureDaad({
    read: (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name)) : undefined),
    download: async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
      return new Uint8Array(await response.arrayBuffer());
    },
    write: (name, data) => writeFileSync(join(dir, name), data),
  });
  if (downloaded.length) console.log(`jDAAD ${DAAD_VERSION}: downloaded ${downloaded.join(', ')}.`);
} catch (error) {
  console.error(
    `Could not get jDAAD ${DAAD_VERSION} into ${dir}/ (needed for the DAAD probe): ${(error as Error).message}`,
  );
  process.exit(1);
}
