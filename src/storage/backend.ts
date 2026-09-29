/** The subset of the Web Storage API the storage layer needs (localStorage or the in-memory fallback). */
export interface KeyValueBackend {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** True for the "storage full" errors thrown by every browser generation (incl. old WebKit code 22). */
export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, code } = error as { name?: string; code?: number };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

function quotaError(): Error {
  const error = new Error('Quota exceeded');
  error.name = 'QuotaExceededError';
  return error;
}

/**
 * In-memory backend: fallback when localStorage is unavailable, and test double.
 * `quota` (in characters, keys + values, like browsers count) simulates a full storage.
 */
export class MemoryBackend implements KeyValueBackend {
  private data: Record<string, string> = {};
  private order: string[] = [];

  constructor(private readonly quota = Infinity) {}

  get length(): number {
    return this.order.length;
  }

  key(index: number): string | null {
    return index >= 0 && index < this.order.length ? this.order[index] : null;
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
  }

  setItem(key: string, value: string): void {
    const exists = this.getItem(key) !== null;
    const before = exists ? key.length + this.data[key].length : 0;
    if (this.used() - before + key.length + value.length > this.quota) throw quotaError();
    if (!exists) this.order.push(key);
    this.data[key] = String(value);
  }

  removeItem(key: string): void {
    if (this.getItem(key) === null) return;
    delete this.data[key];
    this.order.splice(this.order.indexOf(key), 1);
  }

  /** Characters used (keys + values). */
  used(): number {
    let total = 0;
    for (let i = 0; i < this.order.length; i++) {
      total += this.order[i].length + this.data[this.order[i]].length;
    }
    return total;
  }
}

const PROBE_KEY = 'ik:probe';

/**
 * Opens localStorage, or falls back to memory when it is missing or throws (disabled cookies, old Safari
 * private mode). A storage that is merely full is still used: its data must stay reachable.
 */
export function openBackend(getLocal: () => KeyValueBackend | null | undefined = defaultLocal): {
  backend: KeyValueBackend;
  persistent: boolean;
} {
  let local: KeyValueBackend | null | undefined;
  try {
    local = getLocal();
    if (local) {
      local.setItem(PROBE_KEY, '1');
      local.removeItem(PROBE_KEY);
      return { backend: local, persistent: true };
    }
  } catch (error) {
    if (local && isQuotaError(error) && local.length > 0)
      return { backend: local, persistent: true };
  }
  return { backend: new MemoryBackend(), persistent: false };
}

function defaultLocal(): KeyValueBackend | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}
