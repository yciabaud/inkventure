import type { KeyValueBackend } from './backend';
import { SCHEMA_KEY } from './keys';

export interface Migration {
  /** Schema version reached once `migrate` has run. */
  version: number;
  migrate(backend: KeyValueBackend): void;
}

/** Version 1 is the initial `ik:v1:` layout (SPEC §6.1). Append migrations here, in order. */
export const MIGRATIONS: Migration[] = [];

export function latestVersion(migrations: Migration[]): number {
  let max = 1;
  for (let i = 0; i < migrations.length; i++) max = Math.max(max, migrations[i].version);
  return max;
}

/**
 * Brings the stored schema up to date. A fresh storage starts at the latest version; a newer stored version
 * (app rolled back) is left untouched. The version is saved after each step, so a failing migration stops
 * there and is retried on the next start. Returns the resulting version.
 */
export function runMigrations(
  backend: KeyValueBackend,
  migrations: Migration[] = MIGRATIONS,
): number {
  const target = latestVersion(migrations);
  const stored = parseInt(backend.getItem(SCHEMA_KEY) || '', 10);
  if (isNaN(stored)) {
    backend.setItem(SCHEMA_KEY, String(target));
    return target;
  }
  let version = stored;
  const pending = migrations
    .filter((m) => m.version > stored)
    .sort((a, b) => a.version - b.version);
  for (let i = 0; i < pending.length; i++) {
    const migration = pending[i];
    try {
      migration.migrate(backend);
    } catch (error) {
      console.error('Storage migration to v' + migration.version + ' failed', error);
      return version;
    }
    version = migration.version;
    backend.setItem(SCHEMA_KEY, String(version));
  }
  return version;
}
