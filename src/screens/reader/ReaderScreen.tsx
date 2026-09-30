import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import { PagedText } from '../../reader/PagedText';
import { settingsKey, textStyle } from '../../reader/settings';
import type { ReaderBlock } from '../../reader/paginator';
import { ErrorPage } from '../../ui/ErrorPage';
import { GameReader } from './GameReader';
import { PlayScreen } from './PlayScreen';
import { ReaderFrame } from './ReaderFrame';
// The fixture game (tests/fixtures/zmachine), served with the app for `#/play/fixture-z`.
import fixtureZUrl from '../../../tests/fixtures/zmachine/lamp.z5?url';

/** `#/play/demo`: a long static text in the paginated reader. */
export const DEMO_TUID = 'demo';

/** `#/play/fixture-z`: the bundled Z-machine fixture game (tests, and a game that needs no network). */
export const FIXTURE_Z_TUID = 'fixture-z';

/**
 * The reader takes the whole screen (no app top bar until its top zone is tapped); the pages before a catalogue game
 * starts bring the app's chrome themselves. `language` overrides the game language for the command chips (`?lang=fr`).
 */
export function ReaderScreen({ tuid, language }: { tuid: string; language?: string }) {
  if (tuid === DEMO_TUID) return <DemoReader />;
  if (tuid === FIXTURE_Z_TUID) return <FixtureReader language={language} />;
  return <PlayScreen tuid={tuid} language={language} />;
}

function FixtureReader({ language }: { language?: string }) {
  const [story, setStory] = useState<Uint8Array | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(fixtureZUrl)
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.arrayBuffer();
      })
      .then(
        (data) => setStory(new Uint8Array(data)),
        () => setFailed(true),
      );
  }, []);

  if (failed) return <ErrorPage message={t('reader.gameLoadFailed')} />;
  if (!story) return <p class="reader__loading ui-font">{t('reader.loading')}</p>;
  return (
    <GameReader
      tuid={FIXTURE_Z_TUID}
      title="The Lamp at Saltmere"
      author="Inkventure Fixtures"
      language={language || 'en'}
      kind="zmachine"
      story={story}
    />
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
      tuid={DEMO_TUID}
      heading={<span class="reader__title">{story ? story.title : t('play.title')}</span>}
    >
      {(closeBar, settings) =>
        story ? (
          <PagedText
            blocks={story.blocks}
            textStyle={textStyle(settings)}
            layoutKey={settingsKey(settings)}
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
