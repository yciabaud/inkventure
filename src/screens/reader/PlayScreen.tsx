// Playing a catalogue game (SPEC §5.5; story S3.4): its detail (`games/<tuid>.json`) gives the file and the format,
// the story comes from the cache or is downloaded with a progress page, then the engine of its format runs it.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { reportUrl } from '../../app/links';
import { formatHash } from '../../app/router';
import { formatName } from '../../catalog/filters';
import { loadGame, type GameDetail } from '../../catalog/game';
import {
  isStoryFileError,
  storyFileError,
  type StoryFileError,
} from '../../catalog/storyFileError';
import type { EngineKind } from '../../engines/engine';
import { engineFor, isAvailable, loadEngine } from '../../engines/formats';
import { t } from '../../i18n/i18n';
import { getStore } from '../../storage';
import { Button, LinkButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorPage } from '../../ui/ErrorPage';
import { StorageNotice } from '../../ui/StorageNotice';
import { TopBar } from '../../ui/TopBar';
import { GameReader } from './GameReader';

type State =
  | { phase: 'loading' }
  | { phase: 'missing' }
  | { phase: 'detailFailed' }
  | { phase: 'unsupported'; game: GameDetail }
  | { phase: 'downloading'; game: GameDetail; loaded: number; total: number }
  | { phase: 'failed'; game: GameDetail; error: StoryFileError }
  | { phase: 'ready'; game: GameDetail; kind: EngineKind; story: Uint8Array };

/** Progress is redrawn in steps (every repaint is slow and ghosts on e-ink): 5 % of the file, or 64 KB. */
const PERCENT_STEP = 5;
const BYTES_STEP = 64 * 1024;

function progressStep(loaded: number, total: number): number {
  return total > 0
    ? Math.floor((loaded / total) * (100 / PERCENT_STEP))
    : Math.floor(loaded / BYTES_STEP);
}

function kilobytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}

/** The app's usual chrome, for the pages before the game (the reader itself takes the whole screen). */
function Shell({ children }: { children: ComponentChildren }) {
  return (
    <>
      <TopBar current="play" />
      <main class="app__main">
        <StorageNotice store={getStore()} />
        {children}
      </main>
    </>
  );
}

function Progress({ game, loaded, total }: { game: GameDetail; loaded: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : undefined;
  return (
    <div class="screen play">
      <h1 class="screen__title">{game.title}</h1>
      <p class="play__status" role="status">
        {t('play.downloading')}
        <br />
        {total > 0
          ? t('play.progress', { loaded: kilobytes(loaded), total: kilobytes(total) })
          : loaded > 0
            ? t('play.progressUnknown', { loaded: kilobytes(loaded) })
            : ''}
      </p>
      <div
        class="play__meter"
        role="progressbar"
        aria-label={t('play.downloading')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        {percent !== undefined && <div class="play__bar" style={{ width: percent + '%' }} />}
      </div>
      <div class="play__actions">
        <LinkButton variant="secondary" href={formatHash({ name: 'game', tuid: game.tuid })}>
          {t('play.cancel')}
        </LinkButton>
      </div>
    </div>
  );
}

function failureText(error: StoryFileError): string {
  switch (error.reason) {
    case 'http':
      return t('play.failed.http', { status: error.status || 0 });
    case 'timeout':
      return t('play.failed.timeout');
    case 'format':
      return t('play.failed.format');
    default:
      return t('play.failed.network');
  }
}

function Failure({
  game,
  error,
  onRetry,
}: {
  game: GameDetail;
  error: StoryFileError;
  onRetry: () => void;
}) {
  const report = reportUrl(
    'Game file problem: ' + game.title,
    [
      'Game: ' + game.title + ' (' + game.tuid + ')',
      'IFDB: ' + game.ifdbLink,
      'File: ' + game.file.url,
      'Error: ' + error.message,
      '',
      'Device and browser: ',
    ].join('\n'),
  );
  return (
    <ErrorPage title={t('play.failedTitle')} message={failureText(error)}>
      <Button onClick={onRetry}>{t('play.retry')}</Button>
      <a class="btn btn--secondary" href={game.ifdbLink} target="_blank" rel="noopener">
        {t('play.openIfdb')}
      </a>
      <a class="btn btn--secondary" href={report} target="_blank" rel="noopener">
        {t('play.report')}
      </a>
    </ErrorPage>
  );
}

/** `language` overrides the game's language for the command chips (`?lang=fr`). */
export function PlayScreen({ tuid, language }: { tuid: string; language?: string }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    let abort: () => void = () => undefined;
    const fail = (game: GameDetail, error: Error) => {
      if (!live) return;
      const failure = isStoryFileError(error) ? error : storyFileError('network', error.message);
      setState({ phase: 'failed', game: game, error: failure });
    };
    setState({ phase: 'loading' });
    loadGame(tuid).then(
      (result) => {
        if (!live) return;
        if (result.status === 'missing') {
          setState({ phase: 'missing' });
          return;
        }
        const game = result.game;
        const kind = engineFor(game.format);
        if (!kind || !isAvailable(kind)) {
          setState({ phase: 'unsupported', game: game });
          return;
        }
        // The engine's chunk loads during the download.
        loadEngine(kind).catch(() => undefined);
        setState({ phase: 'downloading', game: game, loaded: 0, total: 0 });
        let step = 0;
        import('../../catalog/storyFile').then(
          (module) => {
            if (!live) return;
            const loading = module.fetchStory(game, kind, getStore(), {
              onProgress: (loaded, total) => {
                const next = progressStep(loaded, total);
                if (!live || next === step) return;
                step = next;
                setState({ phase: 'downloading', game: game, loaded: loaded, total: total });
              },
            });
            abort = loading.abort;
            loading.promise.then(
              (story) => live && setState({ phase: 'ready', game: game, kind: kind, story: story }),
              (error: Error) => {
                if (!live) return;
                fail(game, error);
              },
            );
          },
          (error: Error) => fail(game, error),
        );
      },
      () => live && setState({ phase: 'detailFailed' }),
    );
    return () => {
      live = false;
      abort();
    };
  }, [tuid, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  if (state.phase === 'ready') {
    return (
      <GameReader
        tuid={tuid}
        title={state.game.title}
        author={state.game.author}
        cover={!!state.game.cover}
        language={language || state.game.language}
        kind={state.kind}
        story={state.story}
      />
    );
  }

  let page: ComponentChildren;
  switch (state.phase) {
    case 'downloading':
      page = <Progress game={state.game} loaded={state.loaded} total={state.total} />;
      break;
    case 'failed':
      page = <Failure game={state.game} error={state.error} onRetry={retry} />;
      break;
    case 'unsupported':
      page = (
        <ErrorPage
          title={t('play.unsupportedTitle')}
          message={t('play.unsupported', { format: formatName(state.game.format) })}
        >
          <a class="btn btn--secondary" href={state.game.ifdbLink} target="_blank" rel="noopener">
            {t('play.openIfdb')}
          </a>
        </ErrorPage>
      );
      break;
    case 'missing':
      page = (
        <div class="screen">
          <h1 class="screen__title">{t('play.title')}</h1>
          <EmptyState title={t('game.missing')} text={t('game.missingText')}>
            <LinkButton href={formatHash({ name: 'library' })}>{t('game.toLibrary')}</LinkButton>
          </EmptyState>
        </div>
      );
      break;
    case 'detailFailed':
      page = (
        <ErrorPage title={t('game.loadFailed')} message={t('library.loadFailedText')}>
          <Button onClick={retry}>{t('play.retry')}</Button>
        </ErrorPage>
      );
      break;
    default:
      page = (
        <div class="screen">
          <h1 class="screen__title">{t('play.title')}</h1>
          <p class="library__status" role="status">
            {t('game.loading')}
          </p>
        </div>
      );
  }
  return <Shell>{page}</Shell>;
}
