# src/storage

Storage layer, schema migrations, export/import (SPEC §6).
This is the **only** place allowed to touch `localStorage` (enforced by ESLint).

- `getStore()` (`index.ts`): app-wide store over localStorage, or memory when unavailable (`store.persistent === false`).
- `store.get/set/remove(key)` with keys from `keys` (`keys.prefs`, `keys.file(tuid)`, …), stored as JSON under `ik:v1:`.
  `set` evicts cached files (LRU) then stale autosaves when full, and throws a `StorageFullError` if nothing can go.
- `getPrefs` / `setPrefs` for `ik:v1:prefs`.
- `compress.ts`: deflate + base64 for saves; import it directly (kept out of `index.ts` to stay out of the initial bundle).
- `saves.ts`: autosave, named slots (1–5) and the progress record of a game (SPEC §4.4); imported directly, lazily, for
  the same reason.
- `files.ts`: cached story files (< 512 KB, keyed by URL), written with `set(key, value, { cache: true })`, which only
  evicts other cached files and raises no `full` event; imported directly, lazily.
- `migrations.ts`: append to `MIGRATIONS` when the layout changes.
