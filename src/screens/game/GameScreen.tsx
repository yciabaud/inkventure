// Game detail (SPEC §3.5; story S3.3): cover, metadata, badges, the blurb in pages, Play / Continue, Add to or
// Remove from Home, Keep offline (S5.3), and credits. Loads `games/<tuid>.json` alone, so a deep link works on a cold
// start; a kept game's page opens offline from the copy kept with it.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useOnline } from '../../app/offline';
import { formatHash } from '../../app/router';
import { formatName, languageName } from '../../catalog/filters';
import {
  blurbParagraphs,
  gameVersions,
  initialVersion,
  isIfArchive,
  loadGameOrKept,
  thumbnailUrl,
  versionOf,
  type GameDetail,
  type GameVersion,
} from '../../catalog/game';
import { formatNumber, t, useLocale } from '../../i18n/i18n';
import {
  addToHome,
  getStore,
  isInHome,
  isStorageFullError,
  keptEntry,
  keys,
  parseGameId,
  removeFromHome,
  type Store,
} from '../../storage';
import { Button, LinkButton } from '../../ui/Button';
import { Cover } from '../../ui/Cover';
import { EmptyState } from '../../ui/EmptyState';
import { PagedParagraphs } from '../../ui/PagedParagraphs';
import { formatSize } from '../settings/SettingsScreen';

/** Cover slot (the `cover--medium` size). */
const COVER_WIDTH = 120;
const COVER_HEIGHT = 180;

type State =
  | { status: 'loading' }
  | { status: 'ready'; game: GameDetail }
  | { status: 'missing' }
  | { status: 'error' };

function useGame(tuid: string, id: string): [State, () => void] {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadGameOrKept(tuid, id).then(
      (result) => live && setState(result),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [tuid, id, attempt]);
  return [state, () => setAttempt((n) => n + 1)];
}

/** When a version was last played (0 if never), from its progress record; started without one counts as 1. */
function lastPlayed(store: Store, id: string): number {
  const progress = store.get<{ lastPlayed?: unknown }>(keys.progress(id));
  if (progress && typeof progress.lastPlayed === 'number') return progress.lastPlayed;
  return store.keys().indexOf(keys.autosave(id)) >= 0 ? 1 : 0;
}

function playtime(minutes: number): string {
  if (minutes < 60) return t('library.minutes', { count: minutes });
  return t('library.hours', { count: Math.round(minutes / 60) });
}

type Keeping = { status: 'idle' } | { status: 'keeping'; loaded: number } | { status: 'failed' };

/**
 * Keep offline / Remove from device (S5.3), for the version shown: its download, then what is kept and its size.
 * Offline, a game that is not kept cannot be kept.
 */
function KeepOffline({
  game,
  version,
  online,
  onChange,
}: {
  game: GameDetail;
  version: GameVersion;
  online: boolean;
  onChange: () => void;
}) {
  const store = getStore();
  const entry = keptEntry(store, version.id);
  const [state, setState] = useState<Keeping>({ status: 'idle' });
  const abort = useRef<() => void>(() => undefined);
  useEffect(() => () => abort.current(), []);

  const keepIt = () => {
    setState({ status: 'keeping', loaded: 0 });
    let shown = 0;
    import('../../catalog/offline').then(
      (offline) => {
        const keeping = offline.keepGame(store, game, version, (loaded) => {
          // Redrawn every 64 KB at most: each repaint is slow on e-ink.
          if (loaded - shown < 65536) return;
          shown = loaded;
          setState({ status: 'keeping', loaded: loaded });
        });
        abort.current = keeping.abort;
        keeping.promise.then(
          () => {
            setState({ status: 'idle' });
            onChange();
          },
          () => setState({ status: 'failed' }),
        );
      },
      () => setState({ status: 'failed' }),
    );
  };
  const removeIt = () => {
    import('../../catalog/offline')
      .then((offline) => offline.removeKept(store, version.id))
      .then(onChange, onChange);
  };

  let text = '';
  if (state.status === 'keeping') {
    text = state.loaded
      ? t('offline.keepingProgress', { loaded: Math.round(state.loaded / 1024) })
      : t('offline.keeping');
  } else if (state.status === 'failed') text = t('offline.keepFailed');
  else if (entry) text = t('offline.kept', { size: formatSize(entry.size) });
  if (!entry && !online && !text) return null;

  return (
    <div class="game__offline">
      {entry ? (
        <Button variant="secondary" onClick={removeIt}>
          {t('offline.remove')}
        </Button>
      ) : state.status === 'keeping' ? (
        <span class="btn btn--secondary btn--off" aria-disabled="true">
          {t('offline.keep')}
        </span>
      ) : (
        online && (
          <Button variant="secondary" onClick={keepIt}>
            {t('offline.keep')}
          </Button>
        )
      )}
      {text && (
        <p class="game__offline-text" role={state.status === 'failed' ? 'alert' : 'status'}>
          {text}
        </p>
      )}
    </div>
  );
}

function Details({ game, id }: { game: GameDetail; id: string }) {
  const locale = useLocale();
  const store = getStore();
  const versions = gameVersions(game);
  const [version, setVersion] = useState(() =>
    initialVersion(versions, id, locale, (versionId) => lastPlayed(store, versionId)),
  );
  const [inHome, setInHome] = useState(() => isInHome(store, version.id));
  const [full, setFull] = useState(false);
  // Redrawn when the game is kept or removed from the device.
  const [, setKeptVersion] = useState(0);
  const online = useOnline();
  const started = store.keys().indexOf(keys.autosave(version.id)) >= 0;
  const playable = online || !!keptEntry(store, version.id);

  const choose = (next: GameVersion) => {
    setVersion(next);
    setInHome(isInHome(store, next.id));
    setFull(false);
  };

  const toggleHome = () => {
    try {
      if (inHome) removeFromHome(store, version.id);
      else addToHome(store, { ...game, tuid: version.id }, Date.now());
      setInHome(!inHome);
      setFull(false);
    } catch (error) {
      if (!isStorageFullError(error)) throw error;
      setFull(true);
    }
  };

  const facts: string[] = [];
  if (game.year) facts.push(String(game.year));
  if (version.language) {
    facts.push(languageName(version.language) || t('filters.unknownLanguage'));
  }
  if (game.genres.length) facts.push(game.genres.join(', '));
  const ratings: string[] = [];
  if (game.rating && game.rating.count) {
    ratings.push(
      t('game.rating', {
        stars: formatNumber(game.rating.average, locale, 1),
        count: game.rating.count,
      }),
    );
  }
  if (game.playtimeMinutes) ratings.push(playtime(game.playtimeMinutes));
  const paragraphs = blurbParagraphs(game.description);

  return (
    <div class="screen game">
      <div class="game__head">
        <Cover
          title={game.title}
          author={game.author}
          size="medium"
          imageUrl={game.cover ? thumbnailUrl(game.tuid, COVER_WIDTH, COVER_HEIGHT) : undefined}
        />
        <div class="game__info">
          <h1 class="game__title">{game.title}</h1>
          {game.author && <p class="game__author">{game.author}</p>}
          {facts.length > 0 && <p class="game__facts">{facts.join(' · ')}</p>}
          {ratings.length > 0 && <p class="game__facts">{ratings.join(' · ')}</p>}
          <p class="game__badges">
            <span class="badge">{formatName(game.format)}</span>
            {game.illustrated && <span class="badge">{t('game.illustrated')}</span>}
            {game.format === 'twine' && <span class="badge">{t('game.experimental')}</span>}
            {game.slow && <span class="badge">{t('game.slow')}</span>}
          </p>
        </div>
      </div>
      {versions.length > 1 && (
        <div class="game__languages" role="group" aria-label={t('game.language')}>
          <span class="game__languages-label">{t('game.language')}</span>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              class={'btn btn--' + (v.id === version.id ? 'primary' : 'secondary')}
              aria-pressed={v.id === version.id ? 'true' : 'false'}
              onClick={() => choose(v)}
            >
              {(v.language && languageName(v.language)) || t('filters.unknownLanguage')}
            </button>
          ))}
        </div>
      )}
      <div class="game__actions">
        {playable ? (
          <LinkButton href={formatHash({ name: 'play', tuid: version.id })}>
            {started ? t('game.continue') : t('game.play')}
          </LinkButton>
        ) : (
          <span class="btn btn--primary btn--off" aria-disabled="true">
            {t('offline.needsWifi')}
          </span>
        )}
        <Button variant="secondary" onClick={toggleHome}>
          {inHome ? t('game.removeFromHome') : t('game.addToHome')}
        </Button>
      </div>
      <KeepOffline
        key={version.id}
        game={game}
        version={version}
        online={online}
        onChange={() => {
          setInHome(isInHome(store, version.id));
          setKeptVersion((n) => n + 1);
        }}
      />
      {full && (
        <p class="game__notice" role="alert">
          {t('game.homeFull')}
        </p>
      )}
      {paragraphs.length > 0 ? (
        <PagedParagraphs key={game.tuid} paragraphs={paragraphs} />
      ) : (
        <p class="game__empty">{t('game.noBlurb')}</p>
      )}
      <p class="game__credits">
        <a href={game.ifdbLink} target="_blank" rel="noopener">
          {t('game.ifdb')}
        </a>
        {isIfArchive(version.file.url) && (
          <>
            {' · '}
            <a href={version.file.url} target="_blank" rel="noopener">
              {t('game.ifArchive')}
            </a>
          </>
        )}
      </p>
    </div>
  );
}

/** `tuid` is a game id: a TUID, or `<tuid>-<lang>` to open the page on the game's file in that language (S2.6). */
export function GameScreen({ tuid }: { tuid: string }) {
  const [state, retry] = useGame(parseGameId(tuid).tuid, tuid);
  useLocale();
  if (state.status === 'ready' && (!parseGameId(tuid).language || versionOf(state.game, tuid))) {
    return <Details key={tuid} game={state.game} id={tuid} />;
  }
  const status = state.status === 'ready' ? 'missing' : state.status;
  return (
    <div class="screen">
      <h1 class="screen__title">{t('game.title')}</h1>
      {status === 'loading' && (
        <p class="library__status" role="status">
          {t('game.loading')}
        </p>
      )}
      {status === 'missing' && (
        <EmptyState title={t('game.missing')} text={t('game.missingText')}>
          <LinkButton href={formatHash({ name: 'library' })}>{t('game.toLibrary')}</LinkButton>
        </EmptyState>
      )}
      {status === 'error' && (
        <EmptyState title={t('game.loadFailed')} text={t('library.loadFailedText')}>
          <Button onClick={retry}>{t('library.retry')}</Button>
        </EmptyState>
      )}
    </div>
  );
}
