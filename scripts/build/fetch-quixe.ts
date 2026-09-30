// `npm install` / `npm ci` postinstall: puts Quixe's files in vendor/quixe/ (see quixe-files.ts). Nothing is
// downloaded when the checked files are already there. Exits 1, with the reason, when they cannot be fetched.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureQuixe, QUIXE_TAG } from './quixe-files.ts';

const dir = 'vendor/quixe';
mkdirSync(dir, { recursive: true });

try {
  const downloaded = await ensureQuixe({
    read: (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name)) : undefined),
    download: async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
      return new Uint8Array(await response.arrayBuffer());
    },
    write: (name, data) => writeFileSync(join(dir, name), data),
  });
  if (downloaded.length) console.log(`Quixe ${QUIXE_TAG}: downloaded ${downloaded.join(', ')}.`);
} catch (error) {
  console.error(
    `Could not get Quixe ${QUIXE_TAG} into ${dir}/ (needed for Glulx games): ${(error as Error).message}`,
  );
  process.exit(1);
}
