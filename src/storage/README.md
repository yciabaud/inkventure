# src/storage

Storage layer, schema migrations, export/import (SPEC §6).
This is the **only** place allowed to touch `localStorage` (enforced by ESLint).

- `getStore()` (`index.ts`): app-wide store over localStorage, or memory when unavailable (`store.persistent === false`).
- `store.get/set/remove(key)` with keys from `keys` (`keys.prefs`, `keys.file(tuid)`, …), stored as JSON under `ik:v1:`.
  `set` evicts cached files (LRU) then stale autosaves when full, and throws a `StorageFullError` if nothing can go.
- `getPrefs` / `setPrefs` for `ik:v1:prefs`.
- `compress.ts`: deflate + base64 for saves; import it directly (kept out of `index.ts` to stay out of the initial bundle).
- `migrations.ts`: append to `MIGRATIONS` when the layout changes.
