import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import { PagedText } from '../../reader/PagedText';
import { settingsKey, textStyle } from '../../reader/settings';
import type { ReaderBlock } from '../../reader/paginator';
import { ErrorPage } from '../../ui/ErrorPage';
import { GameReader } from './GameReader';
import { PlayScreen } from './PlayScreen';
import { ReaderFrame } from './ReaderFrame';
// The fixture games (tests/fixtures/), served with the app for `#/play/fixture-z`, `fixture-glulx` and `fixture-ink`.
import fixtureGlulxUrl from '../../../tests/fixtures/glulx/lamp.ulx?url';
import fixtureInkUrl from '../../../tests/fixtures/ink/lamp.json?url';
import fixtureZUrl from '../../../tests/fixtures/zmachine/lamp.z5?url';
import type { EngineKind } from '../../engines/engine';

/** `#/play/demo`: a long static text in the paginated reader. */
export const DEMO_TUID = 'demo';

/** `#/play/fixture-z`: the bundled Z-machine fixture game (tests, and a game that needs no network). */
export const FIXTURE_Z_TUID = 'fixture-z';

/** `#/play/fixture-glulx`: the same game built for Glulx. */
export const FIXTURE_GLULX_TUID = 'fixture-glulx';

/** `#/play/fixture-ink`: the same story told with choices, in ink. */
export const FIXTURE_INK_TUID = 'fixture-ink';

const FIXTURES: Record<string, { url: string; kind: EngineKind }> = {
  [FIXTURE_Z_TUID]: { url: fixtureZUrl, kind: 'zmachine' },
  [FIXTURE_GLULX_TUID]: { url: fixtureGlulxUrl, kind: 'glulx' },
  [FIXTURE_INK_TUID]: { url: fixtureInkUrl, kind: 'ink' },
};

/**
 * The reader takes the whole screen (no app top bar until its top zone is tapped); the pages before a catalogue game
 * starts bring the app's chrome themselves. `language` overrides the game language for the command chips (`?lang=fr`);
 * `perf` shows how long each turn took (`?perf=1`, for measuring on a device).
 */
export function ReaderScreen({
  tuid,
  language,
  perf,
}: {
  tuid: string;
  language?: string;
  perf?: boolean;
}) {
  if (tuid === DEMO_TUID) return <DemoReader />;
  if (Object.prototype.hasOwnProperty.call(FIXTURES, tuid))
    return <FixtureReader key={tuid} tuid={tuid} language={language} perf={perf} />;
  return <PlayScreen tuid={tuid} language={language} perf={perf} />;
}

function FixtureReader({
  tuid,
  language,
  perf,
}: {
  tuid: string;
  language?: string;
  perf?: boolean;
}) {
  const fixture = FIXTURES[tuid];
  const [story, setStory] = useState<Uint8Array | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(fixture.url)
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.arrayBuffer();
      })
      .then(
        (data) => setStory(new Uint8Array(data)),
        () => setFailed(true),
      );
  }, [fixture.url]);

  if (failed) return <ErrorPage message={t('reader.gameLoadFailed')} />;
  if (!story) return <p class="reader__loading ui-font">{t('reader.loading')}</p>;
  return (
    <GameReader
      tuid={tuid}
      title="The Lamp at Saltmere"
      author="Inkventure Fixtures"
      language={language || 'en'}
      kind={fixture.kind}
      perf={perf}
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
