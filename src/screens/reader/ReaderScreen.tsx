import { useEffect, useState } from 'preact/hooks';
import { formatHash } from '../../app/router';
import { t } from '../../i18n/i18n';
import { PagedText } from '../../reader/PagedText';
import type { ReaderBlock } from '../../reader/paginator';
import { getStore } from '../../storage';
import { LinkButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorPage } from '../../ui/ErrorPage';
import { StorageNotice } from '../../ui/StorageNotice';
import { TopBar } from '../../ui/TopBar';

/** `#/play/demo`: a long static text in the paginated reader, until the engines arrive (S1.3). */
export const DEMO_TUID = 'demo';

/** Whether the reader takes the whole screen for this game (no app top bar until the top zone is tapped). */
export function isImmersive(tuid: string): boolean {
  return tuid === DEMO_TUID;
}

export function ReaderScreen({ tuid }: { tuid: string }) {
  if (isImmersive(tuid)) return <DemoReader />;
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
  const [barOpen, setBarOpen] = useState(false);

  useEffect(() => {
    // Lazy chunk: the demo text is not part of the initial bundle.
    import('../../reader/demo/demoStory').then(
      (module) => setStory({ title: module.DEMO_TITLE, blocks: module.DEMO_BLOCKS }),
      () => setFailed(true),
    );
  }, []);

  if (failed) return <ErrorPage message={t('reader.loadFailed')} />;

  return (
    <div class="reader">
      {/* Top zone: shows the app's top bar (later the status line and reader menu, S1.6). */}
      <button
        type="button"
        class="reader__top ui-font"
        aria-expanded={barOpen}
        aria-label={t('reader.navigation')}
        onClick={() => setBarOpen(!barOpen)}
      >
        <span class="reader__title">{story ? story.title : t('play.title')}</span>
        <span aria-hidden="true">⋯</span>
      </button>
      {barOpen && (
        <div class="reader__bar">
          <TopBar current="play" />
        </div>
      )}
      <StorageNotice store={getStore()} />
      {story ? (
        <PagedText
          blocks={story.blocks}
          lastPageSlot={<p class="reader__input-slot">{t('reader.inputSlot')}</p>}
          interceptTap={() => {
            // A tap on the page while the top bar is open only closes the bar.
            if (!barOpen) return false;
            setBarOpen(false);
            return true;
          }}
        />
      ) : (
        <p class="reader__loading ui-font">{t('reader.loading')}</p>
      )}
    </div>
  );
}
