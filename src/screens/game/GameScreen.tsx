// Game detail (SPEC §3.5; story S3.3): cover, metadata, badges, the blurb in pages, Play / Continue, Add to or
// Remove from Home, and credits. Loads `games/<tuid>.json` alone, so a deep link works on a cold start.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { formatHash } from '../../app/router';
import { formatName, languageName } from '../../catalog/filters';
import {
  blurbParagraphs,
  isIfArchive,
  loadGame,
  thumbnailUrl,
  type GameDetail,
} from '../../catalog/game';
import { formatNumber, t, useLocale } from '../../i18n/i18n';
import {
  addToHome,
  getStore,
  isInHome,
  isStorageFullError,
  keys,
  removeFromHome,
} from '../../storage';
import { Button, LinkButton } from '../../ui/Button';
import { Cover } from '../../ui/Cover';
import { EmptyState } from '../../ui/EmptyState';
import { Pager } from '../../ui/Pager';
import { useArea } from '../library/useArea';

/** Cover slot (the `cover--medium` size). */
const COVER_WIDTH = 120;
const COVER_HEIGHT = 180;

/** Space between two columns (pages) of the blurb. */
const COLUMN_GAP = 24;

/** The blurb area never gets smaller than this, even on a short screen (it then overflows a little). */
const MIN_BLURB_HEIGHT = 96;

type State =
  | { status: 'loading' }
  | { status: 'ready'; game: GameDetail }
  | { status: 'missing' }
  | { status: 'error' };

function useGame(tuid: string): [State, () => void] {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadGame(tuid).then(
      (result) => live && setState(result),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [tuid, attempt]);
  return [state, () => setAttempt((n) => n + 1)];
}

function playtime(minutes: number): string {
  if (minutes < 60) return t('library.minutes', { count: minutes });
  return t('library.hours', { count: Math.round(minutes / 60) });
}

/**
 * The blurb laid out in columns as wide as its area, one column per page (no scrolling), turned with the pager. The
 * page count is measured from the columns the browser makes.
 */
function Blurb({ paragraphs }: { paragraphs: string[] }) {
  const [area, areaRef] = useArea();
  const columns = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const height = Math.max(area.height, MIN_BLURB_HEIGHT);
  const step = area.width + COLUMN_GAP;

  // Measured after every render (like useArea): the columns change with the area and the text.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const element = columns.current;
    if (!element) return;
    const count = Math.max(1, Math.round((element.scrollWidth + COLUMN_GAP) / step));
    if (count !== pageCount) setPageCount(count);
    if (page > count) setPage(count);
  });

  // Web fonts change the layout without a render: count the pages again once they are loaded.
  const [, setTick] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts || !fonts.addEventListener) return;
    const remeasure = () => setTick((tick) => tick + 1);
    fonts.addEventListener('loadingdone', remeasure);
    return () => fonts.removeEventListener('loadingdone', remeasure);
  }, []);

  return (
    <>
      <div class="game__blurb" ref={areaRef}>
        <div
          class="game__columns"
          ref={columns}
          style={{
            height: height + 'px',
            columnWidth: area.width + 'px',
            columnGap: COLUMN_GAP + 'px',
            transform: 'translateX(' + -(page - 1) * step + 'px)',
          }}
        >
          {paragraphs.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>
      </div>
      <Pager page={page} pageCount={pageCount} onPage={setPage} />
    </>
  );
}

function Details({ game }: { game: GameDetail }) {
  const locale = useLocale();
  const store = getStore();
  const [inHome, setInHome] = useState(() => isInHome(store, game.tuid));
  const [full, setFull] = useState(false);
  const started = store.keys().indexOf(keys.autosave(game.tuid)) >= 0;

  const toggleHome = () => {
    try {
      if (inHome) removeFromHome(store, game.tuid);
      else addToHome(store, game, Date.now());
      setInHome(!inHome);
      setFull(false);
    } catch (error) {
      if (!isStorageFullError(error)) throw error;
      setFull(true);
    }
  };

  const facts: string[] = [];
  if (game.year) facts.push(String(game.year));
  if (game.language) facts.push(languageName(game.language) || t('filters.unknownLanguage'));
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
            {game.format === 'twine' && <span class="badge">{t('game.experimental')}</span>}
            {game.slow && <span class="badge">{t('game.slow')}</span>}
          </p>
        </div>
      </div>
      <div class="game__actions">
        <LinkButton href={formatHash({ name: 'play', tuid: game.tuid })}>
          {started ? t('game.continue') : t('game.play')}
        </LinkButton>
        <Button variant="secondary" onClick={toggleHome}>
          {inHome ? t('game.removeFromHome') : t('game.addToHome')}
        </Button>
      </div>
      {full && (
        <p class="game__notice" role="alert">
          {t('game.homeFull')}
        </p>
      )}
      {paragraphs.length > 0 ? (
        <Blurb key={game.tuid} paragraphs={paragraphs} />
      ) : (
        <p class="game__empty">{t('game.noBlurb')}</p>
      )}
      <p class="game__credits">
        <a href={game.ifdbLink} target="_blank" rel="noopener">
          {t('game.ifdb')}
        </a>
        {isIfArchive(game.file.url) && (
          <>
            {' · '}
            <a href={game.file.url} target="_blank" rel="noopener">
              {t('game.ifArchive')}
            </a>
          </>
        )}
      </p>
    </div>
  );
}

export function GameScreen({ tuid }: { tuid: string }) {
  const [state, retry] = useGame(tuid);
  useLocale();
  if (state.status === 'ready') return <Details key={tuid} game={state.game} />;
  return (
    <div class="screen">
      <h1 class="screen__title">{t('game.title')}</h1>
      {state.status === 'loading' && (
        <p class="library__status" role="status">
          {t('game.loading')}
        </p>
      )}
      {state.status === 'missing' && (
        <EmptyState title={t('game.missing')} text={t('game.missingText')}>
          <LinkButton href={formatHash({ name: 'library' })}>{t('game.toLibrary')}</LinkButton>
        </EmptyState>
      )}
      {state.status === 'error' && (
        <EmptyState title={t('game.loadFailed')} text={t('library.loadFailedText')}>
          <Button onClick={retry}>{t('library.retry')}</Button>
        </EmptyState>
      )}
    </div>
  );
}
