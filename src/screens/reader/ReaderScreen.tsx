import { useEffect, useState } from 'preact/hooks';
import { formatHash } from '../../app/router';
import { t } from '../../i18n/i18n';
import { PagedText } from '../../reader/PagedText';
import type { ReaderBlock } from '../../reader/paginator';
import { LinkButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorPage } from '../../ui/ErrorPage';
import { FIXTURE_Z_TUID, GameReader } from './GameReader';
import { ReaderFrame } from './ReaderFrame';

/** `#/play/demo`: a long static text in the paginated reader, until the engines arrive (S1.3). */
export const DEMO_TUID = 'demo';

/** Whether the reader takes the whole screen for this game (no app top bar until the top zone is tapped). */
export function isImmersive(tuid: string): boolean {
  return tuid === DEMO_TUID || tuid === FIXTURE_Z_TUID;
}

export function ReaderScreen({ tuid }: { tuid: string }) {
  if (tuid === DEMO_TUID) return <DemoReader />;
  if (tuid === FIXTURE_Z_TUID) return <GameReader />;
  // Placeholder for real games (S1.3 onwards).
  return (
    <div class="screen">
      <h1 class="screen__title">{t('play.title')}</h1>
      <EmptyState title={t('play.emptyTitle')} text={t('play.emptyText', { tuid })}>
        <LinkButton variant="secondary" href={formatHash({ name: 'game', tuid })}>
          {t('play.back')}
        </LinkButton>
        <LinkButton variant="secondary" href={formatHash({ name: 'play', tuid: DEMO_TUID })}>
          {t('reader.demo')}
        </LinkButton>
      </EmptyState>
    </div>
  );
}

interface Story {
  title: string;
  blocks: ReaderBlock[];
}

function DemoReader() {
  const [story, setStory] = useState<Story | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Lazy chunk: the demo text is not part of the initial bundle.
    import('../../reader/demo/demoStory').then(
      (module) => setStory({ title: module.DEMO_TITLE, blocks: module.DEMO_BLOCKS }),
      () => setFailed(true),
    );
  }, []);

  if (failed) return <ErrorPage message={t('reader.loadFailed')} />;

  return (
    <ReaderFrame
      heading={<span class="reader__title">{story ? story.title : t('play.title')}</span>}
    >
      {(closeBar) =>
        story ? (
          <PagedText
            blocks={story.blocks}
            lastPageSlot={<p class="reader__input-slot">{t('reader.inputSlot')}</p>}
            interceptTap={closeBar}
          />
        ) : (
          <p class="reader__loading ui-font">{t('reader.loading')}</p>
        )
      }
    </ReaderFrame>
  );
}
