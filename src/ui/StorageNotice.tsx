import { useEffect, useState } from 'preact/hooks';
import { formatHash } from '../app/router';
import { t } from '../i18n/i18n';
import type { Store } from '../storage';

type Notice = 'unavailable' | 'full' | null;

/** Non-blocking banner: storage unavailable (in-memory fallback) or full (nothing left to evict). */
export function StorageNotice({ store }: { store: Store }) {
  const [notice, setNotice] = useState<Notice>(store.persistent ? null : 'unavailable');

  useEffect(
    () =>
      store.subscribe((event) => {
        if (event.type === 'full') setNotice('full');
      }),
    [store],
  );

  if (!notice) return null;
  return (
    <div class="notice" role="status">
      <p class="notice__text">{t(notice === 'full' ? 'storage.full' : 'storage.unavailable')}</p>
      <div class="notice__actions">
        {notice === 'full' && (
          <a class="notice__btn" href={formatHash({ name: 'settings' }, { s: 'data' })}>
            {t('storage.manage')}
          </a>
        )}
        <button type="button" class="notice__btn" onClick={() => setNotice(null)}>
          {t('storage.dismiss')}
        </button>
      </div>
    </div>
  );
}
