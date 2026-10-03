// Settings › Kept on this device (S5.3): the adventures kept offline, largest first, with their sizes (counted by the
// app: the Kindle's `storage.estimate()` under-reports), and Remove from device. A lazy chunk.
import { useState } from 'preact/hooks';
import { removeKept } from '../../catalog/offline';
import { paginate } from '../../catalog/search';
import { t } from '../../i18n/i18n';
import { AUTO_KEEP_BUDGET, getKept, getStore, keptSize } from '../../storage';
import { Button } from '../../ui/Button';
import { Pager } from '../../ui/Pager';
import { formatSize, SectionPage } from './SettingsScreen';

/** Kept adventures shown per page (each row has its Remove from device button). */
const KEPT_PER_PAGE = 4;

/** The adventures kept offline (S5.3), largest first, with their sizes (counted by the app), and Remove from device. */
export function OfflinePage() {
  const store = getStore();
  const [, setVersion] = useState(0);
  const [page, setPage] = useState(1);
  const list = getKept(store);
  const ids = Object.keys(list).sort((a, b) => list[b].size - list[a].size);
  const shown = paginate(ids, page, KEPT_PER_PAGE);
  const remove = (id: string) => {
    removeKept(store, id).then(
      () => setVersion((n) => n + 1),
      () => setVersion((n) => n + 1),
    );
  };
  return (
    <SectionPage title={t('settings.offline')}>
      <p class="settings-page__hint">
        {t('settings.offlineHint', { budget: formatSize(AUTO_KEEP_BUDGET) })}
      </p>
      {ids.length ? (
        <>
          <p class="settings-page__usage">
            {t('settings.offlineTotal', { count: ids.length, size: formatSize(keptSize(list)) })}
          </p>
          <ul class="kept" aria-label={t('settings.offlineList')}>
            {shown.items.map((id) => (
              <li key={id} class="kept__row">
                <p class="kept__text">
                  <b>{list[id].title}</b>
                  <br />
                  {formatSize(list[id].size)}
                </p>
                <Button variant="secondary" onClick={() => remove(id)}>
                  {t('offline.remove')}
                </Button>
              </li>
            ))}
          </ul>
          <Pager page={shown.page} pageCount={shown.pageCount} onPage={setPage} />
        </>
      ) : (
        <p class="settings-page__usage">{t('settings.offlineEmpty')}</p>
      )}
    </SectionPage>
  );
}
