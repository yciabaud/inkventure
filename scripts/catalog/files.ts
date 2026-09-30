// Writing a catalogue to disk (shared by emit.ts and sample.ts).
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serialize, type CatalogFiles } from './emitter.ts';

/** Replaces the catalogue in `dir`: removes the previous JSON files and games/ (other files, e.g. README.md, stay). */
export function writeCatalog(dir: string, files: CatalogFiles): void {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (name === 'games' || /\.json$/.test(name))
      rmSync(join(dir, name), { recursive: true, force: true });
  }
  for (const path of Object.keys(files).sort()) {
    const target = join(dir, path);
    if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, serialize(files[path]) + '\n');
  }
}
