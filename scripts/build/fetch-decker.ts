// `npm install` / `npm ci` postinstall: puts Decker's runtime and tour deck in vendor/decker/ (see decker-files.ts), for
// the Decker probe page (S0.11). Nothing is downloaded when the checked files are already there. Exits 1, with the
// reason, when they cannot be fetched.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECKER_TAG, ensureDecker } from './decker-files.ts';

const dir = 'vendor/decker';
mkdirSync(dir, { recursive: true });

try {
  const downloaded = await ensureDecker({
    read: (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name)) : undefined),
    download: async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
      return new Uint8Array(await response.arrayBuffer());
    },
    write: (name, data) => writeFileSync(join(dir, name), data),
  });
  if (downloaded.length) console.log(`Decker ${DECKER_TAG}: downloaded ${downloaded.join(', ')}.`);
} catch (error) {
  console.error(
    `Could not get Decker ${DECKER_TAG} into ${dir}/ (needed for the Decker probe): ${(error as Error).message}`,
  );
  process.exit(1);
}
