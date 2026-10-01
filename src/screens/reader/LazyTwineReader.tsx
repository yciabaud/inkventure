// The Twine reader is a lazy chunk: most games are not Twine, and the Kindle's first load is tight (SPEC §10).
import type { ComponentProps } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import { ErrorPage } from '../../ui/ErrorPage';
import type { TwineReader as Reader } from './TwineReader';

type Props = ComponentProps<typeof Reader>;

export function LazyTwineReader(props: Props) {
  const [reader, setReader] = useState<{ component: typeof Reader } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    import('./TwineReader').then(
      (module) => setReader({ component: module.TwineReader }),
      () => setFailed(true),
    );
  }, []);
  if (failed) return <ErrorPage message={t('reader.gameLoadFailed')} />;
  if (!reader) return <p class="reader__loading ui-font">{t('reader.loading')}</p>;
  const Component = reader.component;
  return <Component {...props} />;
}
