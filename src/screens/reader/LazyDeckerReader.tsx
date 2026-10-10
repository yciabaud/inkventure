// The Decker reader is a lazy chunk: most games are not Decker decks, and the Kindle's first load is tight (SPEC §10).
import type { ComponentProps } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import { ErrorPage } from '../../ui/ErrorPage';
import type { DeckerReader as Reader } from './DeckerReader';

type Props = ComponentProps<typeof Reader>;

export function LazyDeckerReader(props: Props) {
  const [reader, setReader] = useState<{ component: typeof Reader } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    import('./DeckerReader').then(
      (module) => setReader({ component: module.DeckerReader }),
      () => setFailed(true),
    );
  }, []);
  if (failed) return <ErrorPage message={t('reader.gameLoadFailed')} />;
  if (!reader) return <p class="reader__loading ui-font">{t('reader.loading')}</p>;
  const Component = reader.component;
  return <Component {...props} />;
}
