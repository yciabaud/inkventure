import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import { PagedText } from '../../reader/PagedText';
import { settingsKey, textStyle } from '../../reader/settings';
import type { ReaderBlock } from '../../reader/paginator';
import { ErrorPage } from '../../ui/ErrorPage';
import { GameReader } from './GameReader';
import { PlayScreen } from './PlayScreen';
import { ReaderFrame } from './ReaderFrame';
import { LazyDeckerReader as DeckerReader } from './LazyDeckerReader';
import { LazyTwineReader as TwineReader } from './LazyTwineReader';
// The fixture games (tests/fixtures/), served with the app for `#/play/fixture-z`, `fixture-glulx`,
// `fixture-glulx-picture`, `fixture-ink`, `fixture-twine-harlowe` and `fixture-twine-sugarcube`. Never inlined: each is
// a file of its own, fetched only by its route, not part of the bundle (S0.10). `#/play/fixture-decker` is Decker's
// tour deck, which the Decker reader fetches itself (it is built with its runtime, S1.29).
import fixtureGlulxUrl from '../../../tests/fixtures/glulx/lamp.ulx?url&no-inline';
import fixturePictureUrl from '../../../tests/fixtures/glulx/picture.gblorb?url&no-inline';
import fixtureInkUrl from '../../../tests/fixtures/ink/lamp.json?url&no-inline';
import fixtureHarloweUrl from '../../../tests/fixtures/twine/lamp-harlowe.html?url&no-inline';
import fixtureSugarCubeUrl from '../../../tests/fixtures/twine/lamp-sugarcube.html?url&no-inline';
import fixtureZUrl from '../../../tests/fixtures/zmachine/lamp.z5?url&no-inline';
import type { EngineKind } from '../../engines/engine';

/** `#/play/demo`: a long static text in the paginated reader. */
export const DEMO_TUID = 'demo';

/** `#/play/fixture-z`: the bundled Z-machine fixture game (tests, and a game that needs no network). */
export const FIXTURE_Z_TUID = 'fixture-z';

/** `#/play/fixture-glulx`: the same game built for Glulx. */
export const FIXTURE_GLULX_TUID = 'fixture-glulx';

/** `#/play/fixture-glulx-picture`: an illustrated Glulx game (a Blorb with one picture). */
export const FIXTURE_PICTURE_TUID = 'fixture-glulx-picture';

/** `#/play/fixture-ink`: the same story told with choices, in ink. */
export const FIXTURE_INK_TUID = 'fixture-ink';

/** `#/play/fixture-twine-harlowe` and `-sugarcube`: the same story in Twine's two main story formats. */
export const FIXTURE_HARLOWE_TUID = 'fixture-twine-harlowe';
export const FIXTURE_SUGARCUBE_TUID = 'fixture-twine-sugarcube';

/** `#/play/fixture-decker`: Decker's guided tour (John Earnest, MIT). */
export const FIXTURE_DECKER_TUID = 'fixture-decker';

const FIXTURE_TITLE = 'The Lamp at Saltmere';

const FIXTURES: Record<string, { url: string; kind: EngineKind; title?: string }> = {
  [FIXTURE_Z_TUID]: { url: fixtureZUrl, kind: 'zmachine' },
  [FIXTURE_GLULX_TUID]: { url: fixtureGlulxUrl, kind: 'glulx' },
  [FIXTURE_PICTURE_TUID]: { url: fixturePictureUrl, kind: 'glulx', title: "The Keeper's Picture" },
  [FIXTURE_INK_TUID]: { url: fixtureInkUrl, kind: 'ink' },
  [FIXTURE_HARLOWE_TUID]: { url: fixtureHarloweUrl, kind: 'twine' },
  [FIXTURE_SUGARCUBE_TUID]: { url: fixtureSugarCubeUrl, kind: 'twine' },
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
  if (tuid === FIXTURE_DECKER_TUID)
    return <DeckerReader tuid={tuid} title="Decker" author="John Earnest" />;
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
  if (fixture.kind === 'twine')
    return (
      <TwineReader
        tuid={tuid}
        title={fixture.title || FIXTURE_TITLE}
        author="Inkventure Fixtures"
        story={story}
      />
    );
  return (
    <GameReader
      tuid={tuid}
      title={fixture.title || FIXTURE_TITLE}
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
